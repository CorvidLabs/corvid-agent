#!/usr/bin/env bash
# scripts/restore.sh — Restore a corvid-agent instance from backup
#
# Restores a full instance backup created by scripts/backup.sh:
# database, wallet keystore, and configuration.
#
# IMPORTANT: Stop the corvid-agent server before restoring. The database
# cannot be safely restored while the server is running.
#
# Usage:
#   bash scripts/restore.sh --from BACKUP_DIR [OPTIONS]
#   bash scripts/restore.sh --from corvid-agent-20260415_120000.tar.gz [OPTIONS]
#
# Options:
#   --from PATH       Backup directory or .tar.gz bundle to restore from (required)
#   --project DIR     corvid-agent project root (default: script parent directory)
#   --skip-db         Skip database restore
#   --skip-wallet     Skip wallet keystore restore
#   --skip-config     Skip .env restore
#   --dry-run         Show what would be restored without writing any files
#   --force           Overwrite existing files without prompting
#   --help            Show this message
#
# Environment variables:
#   GPG_PASSPHRASE    Passphrase for GPG-encrypted backups (avoids interactive prompt)
#
# Examples:
#   # Restore from a directory backup
#   bash scripts/restore.sh --from ~/corvid-agent-backups/20260415_120000
#
#   # Restore from the latest symlink
#   bash scripts/restore.sh --from ~/corvid-agent-backups/latest
#
#   # Restore only the database (leave wallet and config intact)
#   bash scripts/restore.sh --from ~/corvid-agent-backups/latest --skip-wallet --skip-config
#
#   # Dry run to see what would happen
#   bash scripts/restore.sh --from ~/corvid-agent-backups/latest --dry-run
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
FROM_PATH=""
SKIP_DB=false
SKIP_WALLET=false
SKIP_CONFIG=false
DRY_RUN=false
FORCE=false
TEMP_DIR=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)        FROM_PATH="$2"; shift 2 ;;
    --project)     PROJECT_DIR="$2"; shift 2 ;;
    --skip-db)     SKIP_DB=true; shift ;;
    --skip-wallet) SKIP_WALLET=true; shift ;;
    --skip-config) SKIP_CONFIG=true; shift ;;
    --dry-run)     DRY_RUN=true; shift ;;
    --force)       FORCE=true; shift ;;
    --help)
      sed -n '2,/^set -/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "[restore] Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[restore] $*"; }
warn() { echo "[restore] WARNING: $*" >&2; }
fail() { echo "[restore] ERROR: $*" >&2; exit 1; }

do_copy() {
  local src="$1" dst="$2" mode="${3:-}"
  if [[ "$DRY_RUN" == true ]]; then
    log "  [dry-run] would copy: $(basename "$src") → $dst"
    return
  fi
  if [[ -f "$dst" && "$FORCE" != true ]]; then
    read -r -p "[restore] $dst already exists. Overwrite? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || { log "  Skipped: $dst"; return; }
  fi
  cp "$src" "$dst"
  [[ -n "$mode" ]] && chmod "$mode" "$dst"
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# ── Validate input ────────────────────────────────────────────────────────────
[[ -z "$FROM_PATH" ]] && fail "No backup source specified. Use --from PATH."
[[ ! -e "$FROM_PATH" ]] && fail "Backup source not found: $FROM_PATH"

# Resolve symlinks (e.g. 'latest')
FROM_PATH="$(realpath "$FROM_PATH")"

# If it's a tarball, extract it first
BACKUP_DIR="$FROM_PATH"
if [[ "$FROM_PATH" == *.tar.gz || "$FROM_PATH" == *.tgz ]]; then
  TEMP_DIR="$(mktemp -d)"
  log "Extracting bundle: $FROM_PATH"
  tar -xzf "$FROM_PATH" -C "$TEMP_DIR"
  # The tarball contains a single timestamped directory
  BACKUP_DIR="$(ls -1 "$TEMP_DIR" | head -1)"
  BACKUP_DIR="$TEMP_DIR/$BACKUP_DIR"
fi

[[ ! -d "$BACKUP_DIR" ]] && fail "Backup directory not found: $BACKUP_DIR"

log "Restoring from: $BACKUP_DIR"
log "Project root:   $PROJECT_DIR"
[[ "$DRY_RUN" == true ]] && log "(DRY RUN — no files will be written)"
log ""

# Print manifest if present
if [[ -f "$BACKUP_DIR/MANIFEST.txt" ]]; then
  log "Backup manifest:"
  while IFS= read -r line; do log "  $line"; done < "$BACKUP_DIR/MANIFEST.txt"
  log ""
fi

# ── Safety check: warn if server appears to be running ───────────────────────
if curl -s --max-time 1 "http://localhost:3000/api/health" &>/dev/null; then
  if [[ "$FORCE" == true ]]; then
    warn "Server appears to be running. Proceeding anyway (--force)."
    warn "This may cause database corruption. Stop the server first."
  else
    fail "Server appears to be running on localhost:3000.
  Stop the server before restoring the database.
  Use --force to override this check (not recommended)."
  fi
fi

# ── 1. Database restore ───────────────────────────────────────────────────────
if [[ "$SKIP_DB" == false ]]; then
  DB_SRC="$BACKUP_DIR/corvid-agent.db"
  DB_DST="${DATABASE_PATH:-$PROJECT_DIR/corvid-agent.db}"

  if [[ ! -f "$DB_SRC" ]]; then
    warn "No database backup found in $BACKUP_DIR — skipping database restore"
  else
    log "Restoring database..."
    log "  Source: $DB_SRC ($(du -h "$DB_SRC" | cut -f1))"
    log "  Target: $DB_DST"

    # Back up the existing DB before overwriting
    if [[ -f "$DB_DST" && "$DRY_RUN" == false ]]; then
      PRE_BACKUP="${DB_DST}.pre-restore.$(date +%Y%m%d_%H%M%S)"
      cp "$DB_DST" "$PRE_BACKUP"
      log "  Pre-restore snapshot: $(basename "$PRE_BACKUP")"
    fi

    do_copy "$DB_SRC" "$DB_DST"
    log "  Database restored."

    # Remove stale WAL/SHM files that belong to the old database
    if [[ "$DRY_RUN" == false ]]; then
      rm -f "${DB_DST}-wal" "${DB_DST}-shm"
    fi
  fi
else
  log "Skipping database restore (--skip-db)"
fi

# ── 2. Wallet keystore restore ────────────────────────────────────────────────
if [[ "$SKIP_WALLET" == false ]]; then
  WALLET_DST="$PROJECT_DIR/wallet-keystore.json"

  WALLET_SRC_PLAIN="$BACKUP_DIR/wallet-keystore.json"
  WALLET_SRC_GPG="$BACKUP_DIR/wallet-keystore.json.gpg"
  WALLET_SRC_AGE="$BACKUP_DIR/wallet-keystore.json.age"

  if [[ -f "$WALLET_SRC_AGE" ]]; then
    log "Restoring wallet (age-encrypted)..."
    if ! command -v age &>/dev/null; then
      fail "age is required to decrypt this backup (https://age-encryption.org/)"
    fi
    if [[ "$DRY_RUN" == false ]]; then
      age --decrypt -i "${AGE_IDENTITY:-$HOME/.config/age/identity.txt}" \
        "$WALLET_SRC_AGE" > "$WALLET_DST"
      chmod 600 "$WALLET_DST"
    else
      log "  [dry-run] would decrypt: wallet-keystore.json.age → $WALLET_DST"
    fi
    log "  Wallet restored."
  elif [[ -f "$WALLET_SRC_GPG" ]]; then
    log "Restoring wallet (GPG-encrypted)..."
    if ! command -v gpg &>/dev/null; then
      fail "gpg is required to decrypt this backup"
    fi
    if [[ "$DRY_RUN" == false ]]; then
      if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
        echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
          --decrypt --output "$WALLET_DST" "$WALLET_SRC_GPG"
      else
        gpg --decrypt --output "$WALLET_DST" "$WALLET_SRC_GPG"
      fi
      chmod 600 "$WALLET_DST"
    else
      log "  [dry-run] would decrypt: wallet-keystore.json.gpg → $WALLET_DST"
    fi
    log "  Wallet restored."
  elif [[ -f "$WALLET_SRC_PLAIN" ]]; then
    log "Restoring wallet (unencrypted)..."
    do_copy "$WALLET_SRC_PLAIN" "$WALLET_DST" "600"
    log "  Wallet restored."
  else
    warn "No wallet backup found in $BACKUP_DIR — skipping"
    warn "If this instance uses Algorand wallets, they will need to be restored manually."
  fi
else
  log "Skipping wallet restore (--skip-wallet)"
fi

# ── 3. Configuration restore ──────────────────────────────────────────────────
if [[ "$SKIP_CONFIG" == false ]]; then
  ENV_DST="$PROJECT_DIR/.env"

  ENV_SRC_PLAIN="$BACKUP_DIR/.env"
  ENV_SRC_GPG="$BACKUP_DIR/.env.gpg"
  ENV_SRC_AGE="$BACKUP_DIR/.env.age"

  if [[ -f "$ENV_SRC_AGE" ]]; then
    log "Restoring configuration (age-encrypted)..."
    if [[ "$DRY_RUN" == false ]]; then
      age --decrypt -i "${AGE_IDENTITY:-$HOME/.config/age/identity.txt}" \
        "$ENV_SRC_AGE" > "$ENV_DST"
      chmod 600 "$ENV_DST"
    else
      log "  [dry-run] would decrypt: .env.age → $ENV_DST"
    fi
    log "  Configuration restored."
    warn "Verify API keys are still valid — tokens may have been rotated since backup."
  elif [[ -f "$ENV_SRC_GPG" ]]; then
    log "Restoring configuration (GPG-encrypted)..."
    if [[ "$DRY_RUN" == false ]]; then
      if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
        echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
          --decrypt --output "$ENV_DST" "$ENV_SRC_GPG"
      else
        gpg --decrypt --output "$ENV_DST" "$ENV_SRC_GPG"
      fi
      chmod 600 "$ENV_DST"
    else
      log "  [dry-run] would decrypt: .env.gpg → $ENV_DST"
    fi
    log "  Configuration restored."
    warn "Verify API keys are still valid — tokens may have been rotated since backup."
  elif [[ -f "$ENV_SRC_PLAIN" ]]; then
    log "Restoring configuration (unencrypted)..."
    do_copy "$ENV_SRC_PLAIN" "$ENV_DST" "600"
    log "  Configuration restored."
    warn "Verify API keys are still valid — tokens may have been rotated since backup."
  else
    warn "No .env backup found in $BACKUP_DIR — skipping"
    warn "If you have a config backup elsewhere, restore it before starting the server."
  fi
else
  log "Skipping configuration restore (--skip-config)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
log ""
if [[ "$DRY_RUN" == true ]]; then
  log "Dry run complete. No files were modified."
else
  log "Restore complete!"
  log ""
  log "Next steps:"
  log "  1. If using localnet, start Algorand: algokit localnet start"
  log "  2. Start the server: bun run start"
  log "  3. Check startup logs for migration output and wallet reconnection"
  log "  4. Open the dashboard and verify agents and credit balances"
  log "  5. For testnet/mainnet: run corvid_sync_on_chain_memories in an agent"
  log "     session to re-import on-chain memories into the local cache"
fi
