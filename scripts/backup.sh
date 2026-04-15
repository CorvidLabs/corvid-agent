#!/usr/bin/env bash
# scripts/backup.sh — Full corvid-agent instance backup
#
# Backs up all critical state: database, wallet keystore, and configuration.
# Optionally encrypts sensitive files and bundles everything into a tarball.
#
# Usage:
#   bash scripts/backup.sh [OPTIONS]
#
# Options:
#   --dir DIR         Backup destination directory (default: $HOME/corvid-agent-backups)
#   --encrypt         Encrypt wallet and config with GPG symmetric cipher
#   --encrypt-age KEY Encrypt with age using the given public key
#   --bundle          Also create a .tar.gz bundle of the backup directory
#   --api             Use the HTTP API for the database backup (requires API_KEY)
#   --api-url URL     API base URL (default: http://localhost:3000)
#   --help            Show this message
#
# Environment variables (override defaults):
#   BACKUP_DIR        Same as --dir
#   API_KEY           Bearer token for the /api/backup endpoint
#   API_URL           Same as --api-url
#   GPG_PASSPHRASE    Passphrase for --encrypt (avoids interactive prompt)
#
# Example — simple local backup:
#   bash scripts/backup.sh --dir /srv/backups
#
# Example — encrypted backup + off-site copy:
#   bash scripts/backup.sh --encrypt --bundle
#   rsync -az "$HOME/corvid-agent-backups/" backup-host:/srv/corvid-backups/
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-$HOME/corvid-agent-backups}"
USE_API=false
USE_ENCRYPT=false
USE_ENCRYPT_AGE=false
AGE_KEY=""
MAKE_BUNDLE=false
API_URL="${API_URL:-http://localhost:3000}"

DB_PATH="${DATABASE_PATH:-$PROJECT_DIR/corvid-agent.db}"
WALLET_PATH="$PROJECT_DIR/wallet-keystore.json"
ENV_PATH="$PROJECT_DIR/.env"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)       BACKUP_DIR="$2"; shift 2 ;;
    --encrypt)   USE_ENCRYPT=true; shift ;;
    --encrypt-age) USE_ENCRYPT_AGE=true; AGE_KEY="$2"; shift 2 ;;
    --bundle)    MAKE_BUNDLE=true; shift ;;
    --api)       USE_API=true; shift ;;
    --api-url)   API_URL="$2"; shift 2 ;;
    --help)
      sed -n '2,/^set -/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "[backup] Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Setup ─────────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="$BACKUP_DIR/$TIMESTAMP"
MANIFEST="$RUN_DIR/MANIFEST.txt"

mkdir -p "$RUN_DIR"

log() { echo "[backup] $*"; }
warn() { echo "[backup] WARNING: $*" >&2; }
fail() { echo "[backup] ERROR: $*" >&2; exit 1; }

log "Starting full instance backup — $TIMESTAMP"
log "Project: $PROJECT_DIR"
log "Destination: $RUN_DIR"

# ── Manifest header ───────────────────────────────────────────────────────────
{
  echo "corvid-agent backup — $TIMESTAMP"
  echo "Project: $PROJECT_DIR"
  echo ""
  echo "Files:"
} > "$MANIFEST"

# ── 1. Database backup ────────────────────────────────────────────────────────
log "Backing up database..."

DB_OUT="$RUN_DIR/corvid-agent.db"

if [[ "$USE_API" == true ]]; then
  # Prefer the API which performs a WAL checkpoint before copying
  if [[ -z "${API_KEY:-}" ]]; then
    fail "--api requires API_KEY to be set in environment"
  fi
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/backup" \
    -H "Authorization: Bearer $API_KEY")
  if [[ "$HTTP_STATUS" != "200" ]]; then
    fail "API backup returned HTTP $HTTP_STATUS — is the server running?"
  fi
  # The API writes to BACKUP_DIR; get the latest file from there
  LATEST_API=$(ls -1t "${BACKUP_DIR:-./backups}"/corvid-agent-*.db 2>/dev/null | head -1)
  if [[ -z "$LATEST_API" ]]; then
    fail "API backup succeeded but no backup file found"
  fi
  cp "$LATEST_API" "$DB_OUT"
  log "  Database (via API): $(du -h "$DB_OUT" | cut -f1)"
else
  # Direct copy with WAL checkpoint via sqlite3 (or plain cp fallback)
  if [[ ! -f "$DB_PATH" ]]; then
    fail "Database not found at $DB_PATH (set DATABASE_PATH if non-default)"
  fi
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '$DB_OUT'"
  else
    warn "sqlite3 not found — using plain copy (may capture dirty WAL state)"
    cp "$DB_PATH" "$DB_OUT"
  fi
  DB_SIZE="$(du -h "$DB_OUT" | cut -f1)"
  log "  Database: $DB_SIZE"
fi

echo "  database: corvid-agent.db" >> "$MANIFEST"

# ── 2. Wallet keystore backup ─────────────────────────────────────────────────
log "Backing up wallet keystore..."

if [[ ! -f "$WALLET_PATH" ]]; then
  warn "wallet-keystore.json not found — skipping (OK for fresh installs)"
  echo "  wallet: (not present)" >> "$MANIFEST"
else
  if [[ "$USE_ENCRYPT_AGE" == true ]]; then
    if ! command -v age &>/dev/null; then
      fail "--encrypt-age requires the 'age' tool (https://age-encryption.org/)"
    fi
    age -r "$AGE_KEY" -o "$RUN_DIR/wallet-keystore.json.age" "$WALLET_PATH"
    log "  Wallet: wallet-keystore.json.age (age-encrypted)"
    echo "  wallet: wallet-keystore.json.age (age-encrypted)" >> "$MANIFEST"
  elif [[ "$USE_ENCRYPT" == true ]]; then
    if ! command -v gpg &>/dev/null; then
      fail "--encrypt requires gpg"
    fi
    if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
      echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
        --symmetric --cipher-algo AES256 \
        --output "$RUN_DIR/wallet-keystore.json.gpg" "$WALLET_PATH"
    else
      gpg --symmetric --cipher-algo AES256 \
        --output "$RUN_DIR/wallet-keystore.json.gpg" "$WALLET_PATH"
    fi
    log "  Wallet: wallet-keystore.json.gpg (GPG-encrypted)"
    echo "  wallet: wallet-keystore.json.gpg (GPG-encrypted)" >> "$MANIFEST"
  else
    warn "Copying wallet-keystore.json WITHOUT encryption."
    warn "Use --encrypt or --encrypt-age to protect this sensitive file."
    cp "$WALLET_PATH" "$RUN_DIR/wallet-keystore.json"
    chmod 600 "$RUN_DIR/wallet-keystore.json"
    log "  Wallet: wallet-keystore.json (unencrypted — keep this safe!)"
    echo "  wallet: wallet-keystore.json (UNENCRYPTED)" >> "$MANIFEST"
  fi
fi

# ── 3. Configuration backup ───────────────────────────────────────────────────
log "Backing up configuration..."

if [[ ! -f "$ENV_PATH" ]]; then
  warn ".env not found — skipping"
  echo "  config: (not present)" >> "$MANIFEST"
else
  if [[ "$USE_ENCRYPT_AGE" == true ]]; then
    age -r "$AGE_KEY" -o "$RUN_DIR/.env.age" "$ENV_PATH"
    log "  Config: .env.age (age-encrypted)"
    echo "  config: .env.age (age-encrypted)" >> "$MANIFEST"
  elif [[ "$USE_ENCRYPT" == true ]]; then
    if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
      echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
        --symmetric --cipher-algo AES256 \
        --output "$RUN_DIR/.env.gpg" "$ENV_PATH"
    else
      gpg --symmetric --cipher-algo AES256 \
        --output "$RUN_DIR/.env.gpg" "$ENV_PATH"
    fi
    log "  Config: .env.gpg (GPG-encrypted)"
    echo "  config: .env.gpg (GPG-encrypted)" >> "$MANIFEST"
  else
    warn "Copying .env WITHOUT encryption."
    warn "Use --encrypt or --encrypt-age to protect API keys and secrets."
    cp "$ENV_PATH" "$RUN_DIR/.env"
    chmod 600 "$RUN_DIR/.env"
    log "  Config: .env (unencrypted — keep this safe!)"
    echo "  config: .env (UNENCRYPTED)" >> "$MANIFEST"
  fi
fi

# ── 4. Update latest symlink ──────────────────────────────────────────────────
ln -sfn "$TIMESTAMP" "$BACKUP_DIR/latest"
log "Updated symlink: $BACKUP_DIR/latest → $TIMESTAMP"

# ── 5. Optional bundle ────────────────────────────────────────────────────────
BUNDLE_PATH=""
if [[ "$MAKE_BUNDLE" == true ]]; then
  BUNDLE_PATH="$BACKUP_DIR/corvid-agent-${TIMESTAMP}.tar.gz"
  tar -czf "$BUNDLE_PATH" -C "$BACKUP_DIR" "$TIMESTAMP"
  BUNDLE_SIZE="$(du -h "$BUNDLE_PATH" | cut -f1)"
  log "Bundle created: $BUNDLE_PATH ($BUNDLE_SIZE)"
  echo "" >> "$MANIFEST"
  echo "Bundle: corvid-agent-${TIMESTAMP}.tar.gz" >> "$MANIFEST"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "" >> "$MANIFEST"
echo "Completed: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$MANIFEST"

log ""
log "Backup complete!"
log "  Location: $RUN_DIR"
[[ -n "$BUNDLE_PATH" ]] && log "  Bundle:   $BUNDLE_PATH"
log ""
log "To restore from this backup, run:"
log "  bash scripts/restore.sh --from $RUN_DIR"
[[ -n "$BUNDLE_PATH" ]] && log "  # or from the bundle:"
[[ -n "$BUNDLE_PATH" ]] && log "  bash scripts/restore.sh --from $BUNDLE_PATH"
