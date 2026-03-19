#!/usr/bin/env bash
# install.sh — One-line corvid-agent installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
#
# What it does:
#   1. Checks/installs prerequisites (Bun, Git)
#   2. Clones or updates corvid-agent
#   3. Runs the setup script
#   4. Starts the server
#   5. Opens the dashboard
#
set -euo pipefail

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
echo "  ║   Decentralized AI Agent Platform     ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

INSTALL_DIR="${CORVID_INSTALL_DIR:-$HOME/corvid-agent}"

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
        echo -n "Install/update Bun now? [Y/n] "
        read -r INSTALL_BUN < "$USER_INPUT"
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
    echo -n "Bun is not installed. Install it now? [Y/n] "
    read -r INSTALL_BUN < "$USER_INPUT"
    if [[ "${INSTALL_BUN:-Y}" =~ ^[Yy]$ ]]; then
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
        info "Bun $(bun --version) installed"
    else
        fail "Bun is required. Install: curl -fsSL https://bun.sh/install | bash"
    fi
fi

# ─── Step 2: Clone or update ────────────────────────────────────────────────

step "Getting corvid-agent"

if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Found existing install at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull --ff-only origin main 2>/dev/null || warn "Could not fast-forward — using existing version"
else
    git clone https://github.com/CorvidLabs/corvid-agent.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    info "Cloned to $INSTALL_DIR"
fi

# ─── Step 2b: Remove dev-only files ─────────────────────────────────────────

step "Cleaning up development files"

# Remove dev/contributor-only directories and files that aren't needed at runtime
rm -rf specs/ tests/ .claude/ CLAUDE.md docs/
# Remove dev scripts but keep install.sh and setup.sh
find scripts/ -type f ! -name 'install.sh' ! -name 'setup.sh' -delete 2>/dev/null || true
info "Removed development files (specs, tests, docs, dev scripts)"

# ─── Step 3: Environment setup ──────────────────────────────────────────────

step "Configuring environment"

if [[ ! -f .env ]]; then
    cp .env.example .env
    info "Created .env from template"

    echo ""
    echo "corvid-agent needs an AI provider. Choose one:"
    echo ""
    echo "  1) Anthropic API key (recommended — full capabilities)"
    echo "  2) Claude Code CLI (uses your existing subscription)"
    echo "  3) Ollama only (free, local, no API key needed)"
    echo ""
    echo -n "Choice [1/2/3]: "
    read -r PROVIDER_CHOICE < "$USER_INPUT"

    case "${PROVIDER_CHOICE:-1}" in
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

step "Starting corvid-agent"

echo ""
echo -e "${BOLD}Starting server...${NC}"
echo ""

# Start in background, wait for health
bun server/index.ts &
SERVER_PID=$!

HEALTHY=false
for i in $(seq 1 20); do
    if curl -sf http://localhost:3000/api/health &>/dev/null; then
        HEALTHY=true
        break
    fi
    sleep 1
done

if [[ "$HEALTHY" == true ]]; then
    info "Server running at http://localhost:3000"

    # Try to open browser
    if command -v open &>/dev/null; then
        open http://localhost:3000
    elif command -v xdg-open &>/dev/null; then
        xdg-open http://localhost:3000
    fi
else
    warn "Server didn't respond within 20s — check the terminal output above"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║     corvid-agent is ready! 🐦‍⬛        ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "  Dashboard:  http://localhost:3000"
echo "  Docs:       https://github.com/CorvidLabs/corvid-agent"
echo ""
echo "  Quick start:"
echo "    1. Click 'Agents' → create your first agent"
echo "    2. Start a session and chat with it"
echo "    3. Have it open a PR on your repo"
echo ""
echo "  To stop:    kill $SERVER_PID"
echo "  To restart: cd $INSTALL_DIR && bun run dev"
echo ""
echo "  Next steps:"
echo "    • Add GH_TOKEN to .env for GitHub integration"
echo "    • Connect Telegram/Discord for mobile access"
echo "    • Set up schedules for autonomous work"
echo "    • Enable AlgoChat for on-chain identity"
echo ""
