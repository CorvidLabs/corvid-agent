#!/usr/bin/env bash
# install.sh — One-line installer for corvid-agent
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
#
# Or clone first and run locally:
#   bash scripts/install.sh
#
# Safe to pipe from curl: detects piped input and avoids interactive prompts
# that would consume stdin. Uses /dev/tty for user interaction instead.
#
# shellcheck disable=SC2310
set -euo pipefail

# ─── Constants ───────────────────────────────────────────────────────────────

REPO_URL="https://github.com/CorvidLabs/corvid-agent.git"
INSTALL_DIR="${CORVID_INSTALL_DIR:-$HOME/corvid-agent}"
MIN_BUN_MAJOR=1
MIN_BUN_MINOR=3
SERVER_PORT=3000

# ─── Helpers ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { printf '%b[ok]%b %s\n' "$GREEN" "$NC" "$1"; }
warn()    { printf '%b[warn]%b %s\n' "$YELLOW" "$NC" "$1"; }
fail()    { printf '%b[error]%b %s\n' "$RED" "$NC" "$1" >&2; exit 1; }
step()    { printf '\n%b==> %s%b\n' "$BOLD" "$1" "$NC"; }
dimtext() { printf '%b%s%b\n' "$DIM" "$1" "$NC"; }

# Safe prompt that works even when piped from curl.
# Falls back to /dev/tty; if that's unavailable, returns the default.
ask() {
    local prompt="$1" default="${2:-}"
    local reply=""
    if [[ -t 0 ]]; then
        read -rp "$prompt" reply
    elif [[ -e /dev/tty ]]; then
        read -rp "$prompt" reply </dev/tty
    else
        reply="$default"
    fi
    printf '%s' "${reply:-$default}"
}

# Yes/no prompt. Returns 0 for yes, 1 for no.
confirm() {
    local prompt="$1" default="${2:-y}"
    local reply
    reply="$(ask "$prompt" "$default")"
    case "$reply" in
        [Yy]*) return 0 ;;
        *) return 1 ;;
    esac
}

# ─── Banner ──────────────────────────────────────────────────────────────────

cat <<'BANNER'

   ██████╗ ██████╗ ██████╗ ██╗   ██╗██╗██████╗
  ██╔════╝██╔═══██╗██╔══██╗██║   ██║██║██╔══██╗
  ██║     ██║   ██║██████╔╝██║   ██║██║██║  ██║
  ██║     ██║   ██║██╔══██╗╚██╗ ██╔╝██║██║  ██║
  ╚██████╗╚██████╔╝██║  ██║ ╚████╔╝ ██║██████╔╝
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝
          AI Agent Orchestration Platform

BANNER

# ─── Step 1: Check prerequisites ────────────────────────────────────────────

step "Checking prerequisites"

# Git — required
if command -v git &>/dev/null; then
    info "git $(git --version | cut -d' ' -f3)"
else
    fail "Git is not installed. Install it from https://git-scm.com and re-run."
fi

# Bun — required, offer to install if missing
check_bun_version() {
    local ver major minor
    ver="$(bun --version 2>/dev/null)" || return 1
    major="$(printf '%s' "$ver" | cut -d. -f1)"
    minor="$(printf '%s' "$ver" | cut -d. -f2)"
    if [[ "$major" -lt "$MIN_BUN_MAJOR" ]] || \
       { [[ "$major" -eq "$MIN_BUN_MAJOR" ]] && [[ "$minor" -lt "$MIN_BUN_MINOR" ]]; }; then
        return 1
    fi
    printf '%s' "$ver"
}

if bun_ver="$(check_bun_version)"; then
    info "bun $bun_ver"
else
    if command -v bun &>/dev/null; then
        warn "Bun is installed but below the minimum version ($MIN_BUN_MAJOR.$MIN_BUN_MINOR.0)."
        printf '  Current version: %s\n' "$(bun --version 2>/dev/null || echo 'unknown')"
    else
        warn "Bun is not installed."
    fi

    if confirm "Install/update Bun now? [Y/n] " "y"; then
        printf '\n'
        dimtext "Running: curl -fsSL https://bun.sh/install | bash"
        curl -fsSL https://bun.sh/install | bash
        # Source the updated path
        # shellcheck source=/dev/null
        [[ -f "$HOME/.bun/bin/bun" ]] && export PATH="$HOME/.bun/bin:$PATH"
        if bun_ver="$(check_bun_version)"; then
            info "bun $bun_ver installed"
        else
            fail "Bun installation succeeded but version check failed. Open a new terminal and re-run."
        fi
    else
        fail "Bun $MIN_BUN_MAJOR.$MIN_BUN_MINOR+ is required. Install from https://bun.sh and re-run."
    fi
fi

# ─── Step 2: Clone or update repo ───────────────────────────────────────────

step "Setting up corvid-agent"

if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Existing installation found at $INSTALL_DIR"
    dimtext "Pulling latest changes..."
    git -C "$INSTALL_DIR" pull --ff-only || {
        warn "Pull failed (you may have local changes). Continuing with existing code."
    }
else
    if [[ -d "$INSTALL_DIR" ]]; then
        fail "$INSTALL_DIR exists but is not a git repo. Remove it or set CORVID_INSTALL_DIR."
    fi
    dimtext "Cloning into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    info "Cloned corvid-agent"
fi

cd "$INSTALL_DIR"

# ─── Step 3: Run dev-setup ──────────────────────────────────────────────────

step "Running setup"

bash scripts/dev-setup.sh --skip-prompts

# ─── Step 4: Configure API key ──────────────────────────────────────────────

step "Configuring AI provider"

NEEDS_KEY=true

# Check if ANTHROPIC_API_KEY is already set in environment or .env
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    info "ANTHROPIC_API_KEY found in environment"
    NEEDS_KEY=false
elif grep -qE '^ANTHROPIC_API_KEY=.+' .env 2>/dev/null; then
    info "ANTHROPIC_API_KEY found in .env"
    NEEDS_KEY=false
fi

# Check for Claude Code CLI
HAS_CLAUDE_CLI=false
if command -v claude &>/dev/null; then
    info "Claude Code CLI detected — you can use your existing subscription"
    HAS_CLAUDE_CLI=true
    NEEDS_KEY=false
fi

if [[ "$NEEDS_KEY" == true ]]; then
    echo ""
    echo "corvid-agent needs an AI provider. Options:"
    echo "  1. Set ANTHROPIC_API_KEY (recommended) — get one at https://console.anthropic.com"
    echo "  2. Install Claude Code CLI — uses your existing subscription"
    echo "  3. Use Ollama — free and local, but slower"
    echo ""

    api_key="$(ask "Enter your ANTHROPIC_API_KEY (or press Enter to skip): " "")"
    if [[ -n "$api_key" ]]; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env
            sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env
        else
            sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env
            sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" .env
        fi
        info "Saved ANTHROPIC_API_KEY to .env"
    else
        warn "No API key set. You'll need to configure an AI provider in .env before using agents."
        echo "  Edit $INSTALL_DIR/.env to add ANTHROPIC_API_KEY, or install Claude Code / Ollama."
    fi
fi

# ─── Step 5: Start server and open browser ───────────────────────────────────

step "Starting corvid-agent"

# Check if port is already in use
if command -v lsof &>/dev/null && lsof -i :"$SERVER_PORT" &>/dev/null; then
    warn "Port $SERVER_PORT is already in use. Skipping server start."
    echo "  Kill the existing process or change the port in .env, then run: bun run dev"
else
    dimtext "Starting server on port $SERVER_PORT..."
    nohup bun run dev >"$INSTALL_DIR/.corvid-install.log" 2>&1 &
    SERVER_PID=$!

    # Wait for server to become healthy
    HEALTHY=false
    for _ in $(seq 1 20); do
        if curl -sf "http://localhost:$SERVER_PORT/api/health" &>/dev/null; then
            HEALTHY=true
            break
        fi
        sleep 1
    done

    if [[ "$HEALTHY" == true ]]; then
        info "Server is running (PID $SERVER_PID)"

        # Open browser
        if command -v open &>/dev/null; then
            open "http://localhost:$SERVER_PORT"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "http://localhost:$SERVER_PORT"
        fi
    else
        warn "Server started but health check timed out. Check logs:"
        echo "  tail -f $INSTALL_DIR/.corvid-install.log"
    fi
fi

# ─── Done ────────────────────────────────────────────────────────────────────

step "Installation complete!"

cat <<EOF

${BOLD}Dashboard:${NC}  http://localhost:$SERVER_PORT
${BOLD}Install:${NC}    $INSTALL_DIR
${BOLD}Logs:${NC}       $INSTALL_DIR/.corvid-install.log

${BOLD}Next steps:${NC}
  1. Open ${BOLD}http://localhost:$SERVER_PORT${NC} and create your first agent
  2. Read the quickstart guide: $INSTALL_DIR/docs/quickstart.md
  3. Join us on GitHub: https://github.com/CorvidLabs/corvid-agent

${BOLD}Useful commands:${NC}
  cd $INSTALL_DIR
  bun run dev          # Start the server
  bun test             # Run tests
  bun run build:client # Rebuild the dashboard

EOF

if [[ "$HAS_CLAUDE_CLI" == true ]]; then
    dimtext "Tip: Claude Code CLI detected. Sessions can use your subscription automatically."
    echo ""
fi
