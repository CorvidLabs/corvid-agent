#!/usr/bin/env bash
# dev-setup.sh — Developer environment setup for corvid-agent
#
# Checks prerequisites, copies .env.example, installs dependencies,
# builds the client, and verifies the server starts.
#
# Usage:
#   bash scripts/dev-setup.sh
#   bash scripts/dev-setup.sh --skip-prompts   # non-interactive mode
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIP_PROMPTS=false

for arg in "$@"; do
    case "$arg" in
        --skip-prompts) SKIP_PROMPTS=true ;;
        -h|--help)
            echo "Usage: bash scripts/dev-setup.sh [--skip-prompts]"
            echo ""
            echo "Options:"
            echo "  --skip-prompts   Run non-interactively (use defaults, don't prompt for env vars)"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[ok]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
fail()  { echo -e "${RED}[error]${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}==> $1${NC}"; }

# ─── Step 1: Check prerequisites ────────────────────────────────────────────

step "Checking prerequisites"

# Git
if command -v git &>/dev/null; then
    info "git $(git --version | cut -d' ' -f3)"
else
    fail "git is not installed. Install it from https://git-scm.com"
fi

# Bun (required)
if command -v bun &>/dev/null; then
    BUN_VERSION=$(bun --version)
    # Check minimum version (1.3.0)
    BUN_MAJOR=$(echo "$BUN_VERSION" | cut -d. -f1)
    BUN_MINOR=$(echo "$BUN_VERSION" | cut -d. -f2)
    if [[ "$BUN_MAJOR" -lt 1 ]] || { [[ "$BUN_MAJOR" -eq 1 ]] && [[ "$BUN_MINOR" -lt 3 ]]; }; then
        fail "Bun >= 1.3.0 is required (found $BUN_VERSION). Update: curl -fsSL https://bun.sh/install | bash"
    fi
    info "bun $BUN_VERSION"
else
    fail "Bun is not installed. Install it: curl -fsSL https://bun.sh/install | bash"
fi

# Node.js (optional, needed for Angular CLI / Playwright)
if command -v node &>/dev/null; then
    info "node $(node --version)"
else
    warn "Node.js not found. It's needed for Angular CLI (client build) and Playwright (E2E tests)."
    warn "Install from https://nodejs.org or use: bun install -g node"
fi

# ─── Step 2: Environment setup ──────────────────────────────────────────────

step "Setting up environment"

cd "$PROJECT_DIR"

if [[ -f .env ]]; then
    info ".env already exists — skipping copy"
else
    cp .env.example .env
    info "Copied .env.example to .env"

    if [[ "$SKIP_PROMPTS" == false ]]; then
        echo ""
        echo "Let's configure the essential environment variables."
        echo "Press Enter to skip any prompt and use the default."
        echo ""

        # Anthropic API Key
        read -rp "ANTHROPIC_API_KEY (for Claude agent sessions, or leave blank for Ollama-only mode): " ANTHROPIC_KEY
        if [[ -n "$ANTHROPIC_KEY" ]]; then
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env
            else
                sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env
            fi
            info "Set ANTHROPIC_API_KEY"
        else
            warn "No ANTHROPIC_API_KEY set — system will default to Ollama-only mode"
        fi

        # GitHub Token
        read -rp "GH_TOKEN (for GitHub integration — PRs, issues, webhooks): " GH_TOKEN_VAL
        if [[ -n "$GH_TOKEN_VAL" ]]; then
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN_VAL|" .env
            else
                sed -i "s|^# GH_TOKEN=.*|GH_TOKEN=$GH_TOKEN_VAL|" .env
            fi
            info "Set GH_TOKEN"
        fi

        # Ollama
        read -rp "OLLAMA_HOST (default: http://localhost:11434): " OLLAMA_VAL
        if [[ -n "$OLLAMA_VAL" ]]; then
            if [[ "$(uname)" == "Darwin" ]]; then
                sed -i '' "s|^# OLLAMA_HOST=.*|OLLAMA_HOST=$OLLAMA_VAL|" .env
            else
                sed -i "s|^# OLLAMA_HOST=.*|OLLAMA_HOST=$OLLAMA_VAL|" .env
            fi
            info "Set OLLAMA_HOST=$OLLAMA_VAL"
        fi
    else
        info "Skipping env prompts (--skip-prompts)"
    fi
fi

# ─── Step 3: Install dependencies ───────────────────────────────────────────

step "Installing dependencies"

bun install
info "Dependencies installed"

# ─── Step 4: Build the Angular client ────────────────────────────────────────

step "Building Angular client"

if bun run build:client; then
    info "Client built successfully"
else
    warn "Client build failed — you can retry with: bun run build:client"
    warn "The server will still run but the dashboard UI won't be available."
fi

# ─── Step 5: Verify the server starts ────────────────────────────────────────

step "Verifying server startup"

# Start the server in the background, wait for the health endpoint, then kill it
SERVER_PID=""
cleanup() {
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

bun server/index.ts &>/dev/null &
SERVER_PID=$!

HEALTHY=false
for i in $(seq 1 15); do
    if curl -sf http://localhost:3000/api/health &>/dev/null; then
        HEALTHY=true
        break
    fi
    sleep 1
done

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""

if [[ "$HEALTHY" == true ]]; then
    info "Server started and responded to health check"
else
    warn "Server did not respond within 15 seconds."
    warn "This may be normal if you haven't configured all required env vars yet."
    warn "Try starting manually: bun run dev"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

step "Setup complete!"

echo ""
echo "Next steps:"
echo "  1. Review and edit .env with your API keys"
echo "  2. Start the dev server:  bun run dev"
echo "  3. Open the dashboard:    http://localhost:3000"
echo "  4. Run tests:             bun test"
echo ""
echo "See CONTRIBUTING.md for development workflow and guidelines."
echo ""
