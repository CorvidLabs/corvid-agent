#!/usr/bin/env bash
# setup-vm.sh — Bootstrap corvid-agent on a macOS VM
#
# Installs LaunchAgents for:
#   1. corvid-agent server (auto-restart on crash)
#   2. port-forward (Bun TCP forwarder for Algorand + Ollama)
#   3. database backup (every 6 hours)
#
# Usage:
#   bash deploy/setup-vm.sh install    # Install all LaunchAgents
#   bash deploy/setup-vm.sh uninstall  # Remove all LaunchAgents
#   bash deploy/setup-vm.sh status     # Show status of all services
#   bash deploy/setup-vm.sh logs       # Tail all logs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME_DIR="$HOME"
LOG_DIR="$HOME/Library/Logs/corvid-agent"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
BACKUP_DIR="$HOME/corvid-agent-backups"
PORT_FORWARD_PATH="$HOME/port-forward.ts"
BUN_PATH="$HOME/.bun/bin/bun"
USER_PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
GUI_DOMAIN="gui/$(id -u)"

# Service labels
SVC_SERVER="com.corvidlabs.corvid-agent"
SVC_FORWARD="com.corvidlabs.port-forward"
SVC_BACKUP="com.corvidlabs.corvid-agent-backup"

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# --- Pre-flight checks -------------------------------------------------------

preflight() {
    if [[ ! -f "$BUN_PATH" ]]; then
        err "Bun not found at $BUN_PATH"
        exit 1
    fi

    if [[ ! -f "$PROJECT_DIR/server/index.ts" ]]; then
        err "corvid-agent project not found at $PROJECT_DIR"
        exit 1
    fi

    if [[ ! -f "$PORT_FORWARD_PATH" ]]; then
        err "port-forward.ts not found at $PORT_FORWARD_PATH"
        exit 1
    fi

    mkdir -p "$LOG_DIR" "$LAUNCH_AGENTS_DIR" "$BACKUP_DIR"
}

# --- Install helpers ----------------------------------------------------------

bootout() {
    local label="$1"
    launchctl bootout "$GUI_DOMAIN/$label" 2>/dev/null || true
}

bootstrap() {
    local plist="$1"
    local label
    label="$(basename "$plist" .plist)"
    bootout "$label"
    launchctl bootstrap "$GUI_DOMAIN" "$plist"
}

# --- Install ------------------------------------------------------------------

install_server() {
    log "Installing corvid-agent server LaunchAgent..."

    local plist_src="$SCRIPT_DIR/com.corvidlabs.corvid-agent.plist"
    local plist_dst="$LAUNCH_AGENTS_DIR/$SVC_SERVER.plist"

    sed \
        -e "s|__BUN_PATH__|$BUN_PATH|g" \
        -e "s|__WORKING_DIR__|$PROJECT_DIR|g" \
        -e "s|__LOG_DIR__|$LOG_DIR|g" \
        -e "s|__PATH__|$USER_PATH|g" \
        "$plist_src" > "$plist_dst"

    bootstrap "$plist_dst"
    ok "Server LaunchAgent installed → $plist_dst"
}

install_port_forward() {
    log "Installing port-forward LaunchAgent..."

    local plist_src="$SCRIPT_DIR/com.corvidlabs.port-forward.plist"
    local plist_dst="$LAUNCH_AGENTS_DIR/$SVC_FORWARD.plist"

    sed \
        -e "s|__BUN_PATH__|$BUN_PATH|g" \
        -e "s|__PORT_FORWARD_PATH__|$PORT_FORWARD_PATH|g" \
        -e "s|__HOME_DIR__|$HOME_DIR|g" \
        -e "s|__LOG_DIR__|$LOG_DIR|g" \
        "$plist_src" > "$plist_dst"

    bootstrap "$plist_dst"
    ok "Port-forward LaunchAgent installed → $plist_dst"
}

install_backup() {
    log "Installing database backup LaunchAgent..."

    local plist_src="$SCRIPT_DIR/com.corvidlabs.corvid-agent-backup.plist"
    local plist_dst="$LAUNCH_AGENTS_DIR/$SVC_BACKUP.plist"
    local backup_script="$SCRIPT_DIR/backup-db.sh"

    sed \
        -e "s|__BACKUP_SCRIPT__|$backup_script|g" \
        -e "s|__WORKING_DIR__|$PROJECT_DIR|g" \
        -e "s|__BACKUP_DIR__|$BACKUP_DIR|g" \
        -e "s|__LOG_DIR__|$LOG_DIR|g" \
        "$plist_src" > "$plist_dst"

    bootstrap "$plist_dst"
    ok "Backup LaunchAgent installed (every 6 hours) → $plist_dst"

    # Run an initial backup now
    log "Running initial backup..."
    BACKUP_DIR="$BACKUP_DIR" bash "$backup_script"
}

install_all() {
    preflight

    echo ""
    log "Installing corvid-agent VM automation..."
    echo ""

    install_port_forward
    install_server
    install_backup

    echo ""
    ok "All LaunchAgents installed."
    echo ""
    echo "Services will auto-start on boot and restart on crash."
    echo "Logs:    $LOG_DIR/"
    echo "Backups: $BACKUP_DIR/"
    echo ""
    echo "Next steps:"
    echo "  bash deploy/setup-vm.sh status   # verify all services"
    echo "  bash deploy/setup-vm.sh logs     # tail logs"
    echo ""
}

# --- Uninstall ----------------------------------------------------------------

uninstall_all() {
    log "Uninstalling all LaunchAgents..."

    for label in "$SVC_SERVER" "$SVC_FORWARD" "$SVC_BACKUP"; do
        bootout "$label"
        rm -f "$LAUNCH_AGENTS_DIR/$label.plist"
        ok "Removed $label"
    done

    echo ""
    ok "All LaunchAgents removed."
}

# --- Status -------------------------------------------------------------------

check_service() {
    local label="$1" name="$2"
    if launchctl print "$GUI_DOMAIN/$label" &>/dev/null; then
        local pid
        pid="$(launchctl print "$GUI_DOMAIN/$label" 2>/dev/null | grep 'pid =' | awk '{print $NF}')"
        if [[ -n "$pid" && "$pid" != "0" ]]; then
            ok "$name (pid $pid)"
        else
            warn "$name (loaded but not running)"
        fi
    else
        err "$name (not loaded)"
    fi
}

status_all() {
    echo ""
    log "Service status:"
    echo ""
    check_service "$SVC_FORWARD" "Port Forward"
    check_service "$SVC_SERVER"  "Server"
    # Backup is interval-based (not persistent), so check differently
    if launchctl print "$GUI_DOMAIN/$SVC_BACKUP" &>/dev/null; then
        ok "DB Backup (scheduled, every 6 hours)"
    else
        err "DB Backup (not loaded)"
    fi
    echo ""

    # Show recent backup
    if [[ -d "$BACKUP_DIR" ]]; then
        local latest
        latest="$(ls -1t "$BACKUP_DIR"/corvid-agent_[0-9]*.db 2>/dev/null | head -1)"
        if [[ -n "$latest" ]]; then
            local size age_file
            size="$(du -h "$latest" | cut -f1)"
            age_file="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$latest" 2>/dev/null || stat -c '%y' "$latest" 2>/dev/null | cut -d. -f1)"
            log "Latest backup: $(basename "$latest") ($size, $age_file)"
        fi
    fi
    echo ""
}

# --- Logs ---------------------------------------------------------------------

logs_all() {
    tail -f "$LOG_DIR"/*.log
}

# --- Main ---------------------------------------------------------------------

COMMAND="${1:-help}"

case "$COMMAND" in
    install)   install_all ;;
    uninstall) uninstall_all ;;
    status)    status_all ;;
    logs)      logs_all ;;
    help|*)
        echo "Usage: $(basename "$0") {install|uninstall|status|logs}"
        echo ""
        echo "  install    Install all LaunchAgents (server, port-forward, backup)"
        echo "  uninstall  Remove all LaunchAgents"
        echo "  status     Show status of all services"
        echo "  logs       Tail all service logs"
        ;;
esac
