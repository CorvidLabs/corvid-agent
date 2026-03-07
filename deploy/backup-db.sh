#!/usr/bin/env bash
# backup-db.sh — Backup corvid-agent SQLite database
#
# Creates timestamped copies of the database in the backup directory.
# Uses SQLite .backup command for a consistent snapshot (safe even while server is running).
# Keeps the most recent N backups and removes older ones.
#
# Usage:
#   bash deploy/backup-db.sh                          # uses defaults
#   BACKUP_DIR=/path/to/backups MAX_KEEP=20 bash deploy/backup-db.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DB_PATH:-$PROJECT_DIR/corvid-agent.db}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/corvid-agent-backups}"
MAX_KEEP="${MAX_KEEP:-10}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="corvid-agent_${TIMESTAMP}.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check database exists
if [[ ! -f "$DB_PATH" ]]; then
    echo "[backup] Error: Database not found at $DB_PATH" >&2
    exit 1
fi

# Use sqlite3 .backup for a consistent snapshot
if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/$BACKUP_FILE'"
else
    # Fallback: copy with WAL checkpoint
    cp "$DB_PATH" "$BACKUP_DIR/$BACKUP_FILE"
    [[ -f "${DB_PATH}-wal" ]] && cp "${DB_PATH}-wal" "$BACKUP_DIR/${BACKUP_FILE}-wal"
    [[ -f "${DB_PATH}-shm" ]] && cp "${DB_PATH}-shm" "$BACKUP_DIR/${BACKUP_FILE}-shm"
fi

# Update latest symlink
ln -sf "$BACKUP_FILE" "$BACKUP_DIR/corvid-agent_latest.db"

# Get backup size
BACKUP_SIZE="$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)"
echo "[backup] Created: $BACKUP_DIR/$BACKUP_FILE ($BACKUP_SIZE)"

# Prune old backups (keep most recent MAX_KEEP)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/corvid-agent_[0-9]*.db 2>/dev/null | wc -l | tr -d ' ')
if [[ "$BACKUP_COUNT" -gt "$MAX_KEEP" ]]; then
    PRUNE_COUNT=$((BACKUP_COUNT - MAX_KEEP))
    ls -1t "$BACKUP_DIR"/corvid-agent_[0-9]*.db | tail -n "$PRUNE_COUNT" | while read -r old; do
        rm -f "$old" "${old}-wal" "${old}-shm"
        echo "[backup] Pruned: $(basename "$old")"
    done
fi

echo "[backup] Done. $BACKUP_COUNT backups in $BACKUP_DIR (keeping $MAX_KEEP)"
