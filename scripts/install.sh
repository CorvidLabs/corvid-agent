#!/usr/bin/env bash
# install.sh — One-line corvid-agent installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
#
# Options:
#   --yes, -y          Accept all defaults (non-interactive / CI mode)
#   --dir <path>       Install to a custom directory (default: ~/corvid-agent)
#   --no-start         Install only, do not start the server
#
# What it does:
#   1. Checks/installs prerequisites (Bun, Git)
#   2. Clones or updates corvid-agent
#   3. Configures environment (.env)
#   4. Installs dependencies and builds the dashboard
#   5. Starts the server and opens the dashboard
#
set -euo pipefail

# ─── Argument parsing ────────────────────────────────────────────────────────

AUTO_YES=false
NO_START=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)       AUTO_YES=true ;;
        --no-start)     NO_START=true ;;
        --dir)          shift; INSTALL_DIR="$1" ;;
        --dir=*)        INSTALL_DIR="${1#--dir=}" ;;
        --help|-h)
            echo "Usage: install.sh [--yes] [--dir <path>] [--no-start]"
            exit 0
            ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done

# When piped via `curl | bash`, stdin is the pipe — not the terminal.
# Redirect all user prompts through /dev/tty so input works correctly.
if [[ -t 0 ]]; then
    USER_INPUT=/dev/stdin
else
    USER_INPUT=/dev/tty
fi

# ─── Colors ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║         corvid-agent installer        ║"
echo "  ║      Your own AI developer.           ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

INSTALL_DIR="${INSTALL_DIR:-${CORVID_INSTALL_DIR:-$HOME/corvid-agent}}"

# ─── Signal handling ─────────────────────────────────────────────────────────
# Kill any background server we started if the user interrupts the install.
SERVER_PID=""
cleanup() {
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        warn "Interrupted — stopping background server (PID $SERVER_PID)"
        kill "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# ─── Step 0: System check ─────────────────────────────────────────────────

step "Checking system resources"

get_total_ram_mb() {
    case "$(uname -s)" in
        Darwin)
            sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1048576)}'
            ;;
        Linux)
            grep MemTotal /proc/meminfo 2>/dev/null | awk '{print int($2/1024)}'
            ;;
        *)
            echo 0
            ;;
    esac
}

TOTAL_RAM_MB=$(get_total_ram_mb)
TOTAL_RAM_GB=$((TOTAL_RAM_MB / 1024))

if [[ "$TOTAL_RAM_MB" -gt 0 ]]; then
    info "Detected ${TOTAL_RAM_GB} GB RAM"

    if [[ "$TOTAL_RAM_GB" -lt 8 ]]; then
        warn "Less than 8 GB RAM — corvid-agent may struggle"
        warn "Recommendation: CLI-only mode with Claude API, lightweight editor, no Docker"
    elif [[ "$TOTAL_RAM_GB" -lt 16 ]]; then
        warn "8 GB RAM — tight for full-stack development"
        warn "Recommendation: Skip Docker/localnet, skip Ollama, use a lightweight editor"
    elif [[ "$TOTAL_RAM_GB" -lt 32 ]]; then
        info "16 GB RAM — good for single agent + IDE"
        info "Tip: Use TestNet instead of localnet to save ~1 GB. Skip Ollama."
    elif [[ "$TOTAL_RAM_GB" -lt 64 ]]; then
        info "32 GB RAM — comfortable for full stack"
    else
        info "64 GB+ RAM — all features available including Ollama"
    fi

    # WSL2 detection
    if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
        warn "WSL2 detected — Windows has higher memory overhead"
        warn "See docs/system-requirements.md for .wslconfig tuning tips"
    fi

    echo "  See docs/system-requirements.md for detailed tier guidance"
else
    warn "Could not detect system RAM"
fi

# ─── Step 1: Prerequisites ──────────────────────────────────────────────────

step "Checking prerequisites"

# Git
if command -v git &>/dev/null; then
    info "git $(git --version | cut -d' ' -f3)"
else
    fail "git is required. Install from https://git-scm.com"
fi

# Bun
if command -v bun &>/dev/null; then
    BUN_VERSION=$(bun --version)
    BUN_MAJOR=$(echo "$BUN_VERSION" | cut -d. -f1)
    BUN_MINOR=$(echo "$BUN_VERSION" | cut -d. -f2)
    if [[ "$BUN_MAJOR" -lt 1 ]] || { [[ "$BUN_MAJOR" -eq 1 ]] && [[ "$BUN_MINOR" -lt 3 ]]; }; then
        warn "Bun $BUN_VERSION found but >= 1.3.0 required"
        if $AUTO_YES; then
            INSTALL_BUN="Y"
        else
            echo -n "Install/update Bun now? [Y/n] "
            read -r INSTALL_BUN < "$USER_INPUT"
        fi
        if [[ "${INSTALL_BUN:-Y}" =~ ^[Yy]$ ]]; then
            curl -fsSL https://bun.sh/install | bash
            export PATH="$HOME/.bun/bin:$PATH"
            info "Bun updated to $(bun --version)"
        else
            fail "Bun >= 1.3.0 is required"
        fi
    else
        info "bun $BUN_VERSION"
    fi
else
    if $AUTO_YES; then
        INSTALL_BUN="Y"
    else
        echo -n "Bun is not installed. Install it now? [Y/n] "
        read -r INSTALL_BUN < "$USER_INPUT"
    fi
    if [[ "${INSTALL_BUN:-Y}" =~ ^[Yy]$ ]]; then
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
        info "Bun $(bun --version) installed"
    else
        fail "Bun is required. Install: curl -fsSL https://bun.sh/install | bash"
    fi
fi

# ─── Step 2: Install or update ──────────────────────────────────────────────

step "Getting corvid-agent"

REPO="CorvidLabs/corvid-agent"

# Fetch latest release tarball URL from GitHub API
get_latest_tarball_url() {
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local release_json
    release_json=$(curl -fsSL "$api_url" 2>/dev/null) || return 1
    echo "$release_json" | grep -o '"browser_download_url": *"[^"]*corvid-agent-[^"]*\.tar\.gz"' \
        | head -1 | cut -d'"' -f4
}

if [[ -d "$INSTALL_DIR/.git" ]]; then
    # ── Existing git install (developer/contributor) ──
    info "Found existing git install at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull --ff-only origin main 2>/dev/null || warn "Could not fast-forward — using existing version"
elif [[ -d "$INSTALL_DIR" ]]; then
    # ── Existing tarball install — upgrade in place ──
    info "Found existing install at $INSTALL_DIR"
    TARBALL_URL=$(get_latest_tarball_url)
    if [[ -n "$TARBALL_URL" ]]; then
        TMPDIR_DL="$(mktemp -d)"
        info "Downloading latest release..."
        curl -fsSL "$TARBALL_URL" -o "$TMPDIR_DL/corvid-agent.tar.gz" \
            || fail "Failed to download release tarball"
        # Extract over existing dir, preserving .env and user data
        tar -xzf "$TMPDIR_DL/corvid-agent.tar.gz" --strip-components=1 -C "$INSTALL_DIR"
        rm -rf "$TMPDIR_DL"
        cd "$INSTALL_DIR"
        info "Updated to latest release"
    else
        warn "No release found — keeping existing version"
        cd "$INSTALL_DIR"
    fi
else
    # ── Fresh install ──
    TARBALL_URL=$(get_latest_tarball_url)
    if [[ -n "$TARBALL_URL" ]]; then
        mkdir -p "$INSTALL_DIR"
        TMPDIR_DL="$(mktemp -d)"
        info "Downloading latest release..."
        curl -fsSL "$TARBALL_URL" -o "$TMPDIR_DL/corvid-agent.tar.gz" \
            || fail "Failed to download release tarball"
        tar -xzf "$TMPDIR_DL/corvid-agent.tar.gz" --strip-components=1 -C "$INSTALL_DIR"
        rm -rf "$TMPDIR_DL"
        cd "$INSTALL_DIR"
        info "Installed to $INSTALL_DIR"
    else
        # No releases yet — fall back to git clone
        warn "No release tarball found — falling back to git clone"
        warn "This includes dev files; future updates will use release tarballs"
        git clone https://github.com/${REPO}.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        info "Cloned to $INSTALL_DIR"
    fi
fi

# ─── Step 3: Environment setup ──────────────────────────────────────────────

step "Configuring environment"

if [[ ! -f .env ]]; then
    cp .env.example .env
    info "Created .env from template"

    if $AUTO_YES; then
        # Non-interactive: auto-detect provider from environment
        if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" .env
            else
                sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" .env
            fi
            info "ANTHROPIC_API_KEY configured from environment"
        elif command -v claude &>/dev/null; then
            info "Claude Code CLI detected — no API key needed"
        else
            info "No AI provider configured — edit .env to add ANTHROPIC_API_KEY or OLLAMA_HOST"
        fi
        PROVIDER_CHOICE="skip"
    else
        echo ""
        echo "corvid-agent needs an AI provider. Choose one:"
        echo ""
        echo "  1) Anthropic API key (recommended — full capabilities)"
        echo "  2) Claude Code CLI (uses your existing subscription)"
        echo "  3) Ollama only (free, local, no API key needed)"
        echo ""
        echo -n "Choice [1/2/3]: "
        read -r PROVIDER_CHOICE < "$USER_INPUT"
    fi

    case "${PROVIDER_CHOICE:-1}" in
        skip) ;; # handled above in --yes mode
        1)
            echo -n "Enter your ANTHROPIC_API_KEY: "
            read -rs API_KEY_VAL < "$USER_INPUT"
            echo ""
            if [[ -n "$API_KEY_VAL" ]]; then
                if [[ "$(uname)" == "Darwin" ]]; then
                    sed -i '' "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY_VAL|" .env
                else
                    sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY_VAL|" .env
                fi
                info "ANTHROPIC_API_KEY configured"
            fi
            ;;
        2)
            if command -v claude &>/dev/null; then
                info "Claude Code CLI detected — no API key needed"
            else
                warn "Claude Code CLI not found. Install from https://claude.com/claude-code"
                warn "Falling back to Ollama-only mode for now"
            fi
            ;;
        3)
            if command -v ollama &>/dev/null; then
                info "Ollama detected"
                echo -n "Ollama host [http://localhost:11434]: "
                read -r OLLAMA_VAL < "$USER_INPUT"
                if [[ -n "$OLLAMA_VAL" ]]; then
                    if [[ "$(uname)" == "Darwin" ]]; then
                        sed -i '' "s|^# OLLAMA_HOST=.*|OLLAMA_HOST=$OLLAMA_VAL|" .env
                    else
                        sed -i "s|^# OLLAMA_HOST=.*|OLLAMA_HOST=$OLLAMA_VAL|" .env
                    fi
                fi
            else
                warn "Ollama not found. Install from https://ollama.com"
            fi
            ;;
    esac

    if ! $AUTO_YES; then
        # GitHub token (optional)
        echo ""
        echo -n "GitHub token for PR/issue integration (optional, press Enter to skip): "
        read -r GH_TOKEN_VAL < "$USER_INPUT"
        if [[ -n "$GH_TOKEN_VAL" ]]; then
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN_VAL|" .env
            else
                sed -i "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN_VAL|" .env
            fi
            info "GH_TOKEN configured"
        fi
    elif [[ -n "${GH_TOKEN:-}" ]]; then
        # In --yes mode, pick up GH_TOKEN from the environment
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN|" .env
        else
            sed -i "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN|" .env
        fi
        info "GH_TOKEN configured from environment"
    fi
else
    info ".env already exists — keeping current config"
fi

# ─── Step 4: Install and build ──────────────────────────────────────────────

step "Installing dependencies"
bun install
info "Dependencies installed"

step "Building dashboard"
if bun run build:client 2>/dev/null; then
    info "Dashboard built"
else
    warn "Dashboard build failed — server will still work, but no web UI"
    warn "Retry later with: cd $INSTALL_DIR && bun run build:client"
fi

# ─── Step 5: Start ──────────────────────────────────────────────────────────

if $NO_START; then
    info "Skipping server start (--no-start)"
else
    step "Starting corvid-agent"

    PORT="${PORT:-3000}"
    SERVER_LOG="$INSTALL_DIR/corvid-agent.log"

    echo ""
    echo -e "${BOLD}Starting server in background...${NC}"
    echo "  Log: $SERVER_LOG"
    echo ""

    # Use nohup so the server survives the installer's shell exiting.
    # stdout/stderr go to a log file so the user can inspect them.
    nohup bun run start > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!

    # Poll /health/live (lightweight liveness check — no heavy dependency checks)
    HEALTHY=false
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${PORT}/health/live" &>/dev/null; then
            HEALTHY=true
            break
        fi
        sleep 1
    done

    if [[ "$HEALTHY" == true ]]; then
        info "Server running at http://localhost:${PORT} (PID $SERVER_PID)"
        # Detach trap — server should keep running after install exits
        trap - EXIT INT TERM
        SERVER_PID=""

        # Try to open browser
        if command -v open &>/dev/null; then
            open "http://localhost:${PORT}"
        elif command -v xdg-open &>/dev/null; then
            xdg-open "http://localhost:${PORT}"
        fi
    else
        warn "Server didn't respond within 30s — check logs:"
        warn "  tail -f $SERVER_LOG"
    fi
fi

# ─── Done ────────────────────────────────────────────────────────────────────

PORT="${PORT:-3000}"

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║     corvid-agent is ready! 🐦‍⬛        ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "  Dashboard:  http://localhost:${PORT}"
echo "  Logs:       $INSTALL_DIR/corvid-agent.log"
echo "  Docs:       https://github.com/CorvidLabs/corvid-agent"
echo ""
echo "  Your agent is ready. Here's what to do:"
echo ""
echo "    1. Click your agent in the dashboard"
echo "    2. Start a new session"
echo "    3. Tell it what to build:"
echo "       \"Build me a personal portfolio website\""
echo ""
echo "  Manage the server:"
echo "    Stop:        pkill -f 'bun.*server/index' || kill \$(cat $INSTALL_DIR/.server.pid 2>/dev/null)"
echo "    Restart:     cd $INSTALL_DIR && bun run start"
echo "    Daemon:      cd $INSTALL_DIR && ./deploy/daemon.sh install"
echo ""
echo "  Want more? Add to your .env file and restart:"
echo "    • GH_TOKEN=...       → agent can open PRs on your repos"
echo "    • TELEGRAM_BOT_TOKEN → talk to your agent from your phone"
echo "    • DISCORD_BOT_TOKEN  → talk to your agent from Discord"
echo ""
echo "  Docs: docs/quickstart.md"
echo "  Ideas: docs/project-ideas.md"
echo ""
