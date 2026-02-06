#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="corvid-agent"

# Detect platform
detect_platform() {
    if [[ "$(uname)" == "Darwin" ]]; then
        echo "launchd"
    elif command -v systemctl &>/dev/null; then
        echo "systemd"
    else
        echo "unknown"
    fi
}

# Find bun binary
find_bun() {
    local bun_path
    bun_path="$(command -v bun 2>/dev/null || true)"
    if [[ -z "$bun_path" ]]; then
        echo "Error: bun not found in PATH" >&2
        exit 1
    fi
    echo "$bun_path"
}

# macOS launchd install
install_launchd() {
    local bun_path log_dir plist_src plist_dst
    bun_path="$(find_bun)"
    log_dir="$HOME/Library/Logs/$SERVICE_NAME"
    plist_src="$SCRIPT_DIR/com.corvidlabs.corvid-agent.plist"
    plist_dst="$HOME/Library/LaunchAgents/com.corvidlabs.corvid-agent.plist"

    mkdir -p "$log_dir"
    mkdir -p "$HOME/Library/LaunchAgents"

    # Generate plist with correct paths
    sed \
        -e "s|__BUN_PATH__|$bun_path|g" \
        -e "s|__WORKING_DIR__|$PROJECT_DIR|g" \
        -e "s|__LOG_DIR__|$log_dir|g" \
        "$plist_src" > "$plist_dst"

    # Install log rotation config (newsyslog picks this up automatically)
    local newsyslog_src="$SCRIPT_DIR/corvid-agent.newsyslog.conf"
    local newsyslog_dst="/etc/newsyslog.d/corvid-agent.conf"
    if [[ -f "$newsyslog_src" ]]; then
        sed "s|__LOG_DIR__|$log_dir|g" "$newsyslog_src" | sudo tee "$newsyslog_dst" > /dev/null
        echo "Installed log rotation: $newsyslog_dst"
    fi

    # Load the service
    launchctl bootout "gui/$(id -u)/com.corvidlabs.corvid-agent" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist_dst"

    echo "Installed launchd service"
    echo "  Plist: $plist_dst"
    echo "  Logs:  $log_dir/"
    echo "  Use '$0 status' to check"
}

uninstall_launchd() {
    local plist_dst="$HOME/Library/LaunchAgents/com.corvidlabs.corvid-agent.plist"
    launchctl bootout "gui/$(id -u)/com.corvidlabs.corvid-agent" 2>/dev/null || true
    rm -f "$plist_dst"
    sudo rm -f /etc/newsyslog.d/corvid-agent.conf 2>/dev/null || true
    echo "Uninstalled launchd service"
}

status_launchd() {
    launchctl print "gui/$(id -u)/com.corvidlabs.corvid-agent" 2>/dev/null || echo "Service not loaded"
}

logs_launchd() {
    local log_dir="$HOME/Library/Logs/$SERVICE_NAME"
    if [[ -f "$log_dir/corvid-agent.stdout.log" ]]; then
        tail -f "$log_dir/corvid-agent.stdout.log" "$log_dir/corvid-agent.stderr.log"
    else
        echo "No log files found at $log_dir/"
    fi
}

# Linux systemd install
install_systemd() {
    local bun_path unit_src unit_dst
    bun_path="$(find_bun)"
    unit_src="$SCRIPT_DIR/corvid-agent.service"
    unit_dst="/etc/systemd/system/corvid-agent.service"

    # Generate unit file with correct paths
    sudo sed \
        -e "s|__BUN_PATH__|$bun_path|g" \
        -e "s|__WORKING_DIR__|$PROJECT_DIR|g" \
        "$unit_src" | sudo tee "$unit_dst" > /dev/null

    # Create user if needed
    if ! id corvid-agent &>/dev/null; then
        sudo useradd --system --no-create-home --shell /usr/sbin/nologin corvid-agent
    fi

    # Create env file directory with restrictive permissions
    sudo mkdir -p /etc/corvid-agent
    sudo chmod 700 /etc/corvid-agent
    sudo chown root:root /etc/corvid-agent
    if [[ ! -f /etc/corvid-agent/env ]]; then
        sudo touch /etc/corvid-agent/env
        sudo chmod 600 /etc/corvid-agent/env
        sudo chown root:root /etc/corvid-agent/env
        echo "Created /etc/corvid-agent/env (mode 600) — add environment variables there"
    fi

    sudo systemctl daemon-reload
    sudo systemctl enable corvid-agent
    sudo systemctl start corvid-agent

    echo "Installed systemd service"
    echo "  Unit: $unit_dst"
    echo "  Env:  /etc/corvid-agent/env"
    echo "  Use '$0 status' to check"
}

uninstall_systemd() {
    sudo systemctl stop corvid-agent 2>/dev/null || true
    sudo systemctl disable corvid-agent 2>/dev/null || true
    sudo rm -f /etc/systemd/system/corvid-agent.service
    sudo systemctl daemon-reload
    echo "Uninstalled systemd service"
}

status_systemd() {
    systemctl status corvid-agent 2>/dev/null || echo "Service not found"
}

logs_systemd() {
    journalctl -u corvid-agent -f
}

# Main
PLATFORM="$(detect_platform)"
COMMAND="${1:-help}"

case "$COMMAND" in
    install)
        case "$PLATFORM" in
            launchd) install_launchd ;;
            systemd) install_systemd ;;
            *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
        esac
        ;;
    uninstall)
        case "$PLATFORM" in
            launchd) uninstall_launchd ;;
            systemd) uninstall_systemd ;;
            *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
        esac
        ;;
    status)
        case "$PLATFORM" in
            launchd) status_launchd ;;
            systemd) status_systemd ;;
            *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
        esac
        ;;
    logs)
        case "$PLATFORM" in
            launchd) logs_launchd ;;
            systemd) logs_systemd ;;
            *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
        esac
        ;;
    help|*)
        echo "Usage: $0 {install|uninstall|status|logs}"
        echo ""
        echo "  install    Install and start the daemon ($PLATFORM detected)"
        echo "  uninstall  Stop and remove the daemon"
        echo "  status     Show daemon status"
        echo "  logs       Tail daemon logs"
        ;;
esac
