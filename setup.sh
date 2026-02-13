#!/usr/bin/env bash
# Interactive developer setup for corvid-agent.
# Run: chmod +x setup.sh && ./setup.sh
set -euo pipefail

SETUP_VERSION="1.0.0"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults
DEFAULT_PORT=3000
DEFAULT_BIND="127.0.0.1"
DEFAULT_OLLAMA_HOST="http://localhost:11434"

# Skip flags
SKIP_DEPS=false
SKIP_ENV=false
SKIP_OLLAMA=false
SKIP_LOCALNET=false
SKIP_BUILD=false
AUTO_YES=false

# State set during env configuration
CHOSEN_NETWORK="localnet"

# ---------------------------------------------------------------------------
# Color / formatting utilities (TTY-aware)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    BOLD='\033[1m'
    DIM='\033[2m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    RED='\033[0;31m'
    CYAN='\033[0;36m'
    RESET='\033[0m'
else
    BOLD='' DIM='' GREEN='' YELLOW='' RED='' CYAN='' RESET=''
fi

info()   { printf "${GREEN}[OK]${RESET}  %s\n" "$*"; }
warn()   { printf "${YELLOW}[!!]${RESET}  %s\n" "$*"; }
error()  { printf "${RED}[ERR]${RESET} %s\n" "$*" >&2; }
step()   { printf "\n${BOLD}${CYAN}==> %s${RESET}\n" "$*"; }
detail() { printf "${DIM}    %s${RESET}\n" "$*"; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
usage() {
    cat <<EOF
corvid-agent setup v${SETUP_VERSION}

Usage: ./setup.sh [OPTIONS]

Options:
  --yes, -y         Auto-accept defaults (CI mode)
  --skip-deps       Skip bun install
  --skip-env        Skip .env configuration
  --skip-ollama     Skip Ollama section
  --skip-localnet   Skip AlgoKit localnet section
  --skip-build      Skip client build
  --help, -h        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)        AUTO_YES=true ;;
        --skip-deps)     SKIP_DEPS=true ;;
        --skip-env)      SKIP_ENV=true ;;
        --skip-ollama)   SKIP_OLLAMA=true ;;
        --skip-localnet) SKIP_LOCALNET=true ;;
        --skip-build)    SKIP_BUILD=true ;;
        --help|-h)       usage; exit 0 ;;
        *)               error "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
PLATFORM="unknown"
case "$(uname -s)" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      warn "Unsupported platform: $(uname -s). Proceeding anyway." ;;
esac

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
confirm() {
    # confirm "question" — returns 0 (yes) or 1 (no). Auto-yes in CI mode.
    if $AUTO_YES; then return 0; fi
    local answer
    printf "%s [Y/n] " "$1"
    read -r answer
    [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

prompt_value() {
    # prompt_value "prompt" "default" — prints value to stdout
    local prompt="$1" default="${2:-}"
    if $AUTO_YES && [[ -n "$default" ]]; then
        echo "$default"
        return
    fi
    local value
    if [[ -n "$default" ]]; then
        printf "%s [%s]: " "$prompt" "$default"
    else
        printf "%s: " "$prompt"
    fi
    read -r value
    echo "${value:-$default}"
}

has_cmd() { command -v "$1" &>/dev/null; }

sed_inplace() {
    # sed_inplace 's/old/new/' file
    if [[ "$PLATFORM" == "macos" ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# ---------------------------------------------------------------------------
# Section 1: Prerequisites
# ---------------------------------------------------------------------------
setup_prerequisites() {
    step "Checking prerequisites"

    # Git — hard requirement
    if ! has_cmd git; then
        error "git is not installed. Please install git and re-run this script."
        exit 1
    fi
    info "git found: $(git --version)"

    # Bun
    if has_cmd bun; then
        info "bun found: $(bun --version)"
    else
        warn "bun is not installed."
        if confirm "Install bun now?"; then
            curl -fsSL https://bun.sh/install | bash
            # Update PATH for this session
            export BUN_INSTALL="${HOME}/.bun"
            export PATH="${BUN_INSTALL}/bin:${PATH}"
            if has_cmd bun; then
                info "bun installed: $(bun --version)"
            else
                error "bun installation failed. Install manually: https://bun.sh"
                exit 1
            fi
        else
            error "bun is required to continue."
            exit 1
        fi
    fi
}

# ---------------------------------------------------------------------------
# Section 2: Dependencies
# ---------------------------------------------------------------------------
setup_dependencies() {
    if $SKIP_DEPS; then
        detail "Skipping dependencies (--skip-deps)"
        return
    fi

    step "Installing dependencies"

    # Root dependencies
    if [[ -d "$PROJECT_DIR/node_modules" ]]; then
        if confirm "node_modules/ already exists. Reinstall root dependencies?"; then
            (cd "$PROJECT_DIR" && bun install)
            info "Root dependencies installed"
        else
            info "Skipping root dependencies"
        fi
    else
        (cd "$PROJECT_DIR" && bun install)
        info "Root dependencies installed"
    fi

    # Client dependencies
    if [[ -d "$PROJECT_DIR/client/node_modules" ]]; then
        if confirm "client/node_modules/ already exists. Reinstall client dependencies?"; then
            (cd "$PROJECT_DIR/client" && bun install)
            info "Client dependencies installed"
        else
            info "Skipping client dependencies"
        fi
    else
        (cd "$PROJECT_DIR/client" && bun install)
        info "Client dependencies installed"
    fi
}

# ---------------------------------------------------------------------------
# Section 3: Environment configuration
# ---------------------------------------------------------------------------
setup_env() {
    if $SKIP_ENV; then
        detail "Skipping environment configuration (--skip-env)"
        # Still try to read the chosen network from existing .env
        if [[ -f "$PROJECT_DIR/.env" ]]; then
            CHOSEN_NETWORK=$(grep -E '^ALGORAND_NETWORK=' "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "localnet")
            CHOSEN_NETWORK="${CHOSEN_NETWORK:-localnet}"
        fi
        return
    fi

    step "Configuring environment"

    local env_file="$PROJECT_DIR/.env"
    local env_example="$PROJECT_DIR/.env.example"

    if [[ -f "$env_file" ]]; then
        if ! confirm ".env already exists. Reconfigure?"; then
            info "Keeping existing .env"
            CHOSEN_NETWORK=$(grep -E '^ALGORAND_NETWORK=' "$env_file" 2>/dev/null | cut -d= -f2 || echo "localnet")
            CHOSEN_NETWORK="${CHOSEN_NETWORK:-localnet}"
            return
        fi
    fi

    # Copy example
    if [[ -f "$env_example" ]]; then
        cp "$env_example" "$env_file"
        chmod 600 "$env_file"
        info "Created .env from .env.example (permissions: 600)"
    else
        warn ".env.example not found — creating minimal .env"
        touch "$env_file"
        chmod 600 "$env_file"
    fi

    # Network choice
    printf "\n  Choose Algorand network:\n"
    printf "    ${BOLD}1) localnet${RESET}  — local blockchain via Docker ${GREEN}(recommended)${RESET}\n"
    printf "       Agents get auto-funded wallets, AlgoChat messaging, and on-chain\n"
    printf "       memory — no tokens needed, fully self-contained.\n"
    printf "    2) testnet   — Algorand public test network\n"
    printf "    3) mainnet   — Algorand production network\n"
    local net_choice
    net_choice=$(prompt_value "  Selection" "1")

    case "$net_choice" in
        2) CHOSEN_NETWORK="testnet" ;;
        3) CHOSEN_NETWORK="mainnet" ;;
        *) CHOSEN_NETWORK="localnet" ;;
    esac

    if [[ "$CHOSEN_NETWORK" != "localnet" ]]; then
        warn "On ${CHOSEN_NETWORK}, you must fund wallets manually and provide a mnemonic."
        detail "Localnet is strongly recommended for development — agents auto-fund"
        detail "and AlgoChat works out of the box with zero configuration."
    fi

    sed_inplace "s|^ALGORAND_NETWORK=.*|ALGORAND_NETWORK=${CHOSEN_NETWORK}|" "$env_file"
    # Set AGENT_NETWORK if commented out
    if grep -q '^# AGENT_NETWORK=' "$env_file" 2>/dev/null; then
        sed_inplace "s|^# AGENT_NETWORK=.*|AGENT_NETWORK=${CHOSEN_NETWORK}|" "$env_file"
    fi
    info "Network set to ${CHOSEN_NETWORK}"

    # Mnemonic
    if [[ "$CHOSEN_NETWORK" == "localnet" ]]; then
        detail "On localnet, agent wallet auto-generates if mnemonic is left as placeholder"
    else
        printf "\n"
        local mnemonic
        mnemonic=$(prompt_value "  Enter 25-word ALGOCHAT_MNEMONIC (or leave blank to set later)" "")
        if [[ -n "$mnemonic" ]]; then
            sed_inplace "s|^ALGOCHAT_MNEMONIC=.*|ALGOCHAT_MNEMONIC=${mnemonic}|" "$env_file"
            info "ALGOCHAT_MNEMONIC set"
        else
            detail "Set ALGOCHAT_MNEMONIC in .env before running on ${CHOSEN_NETWORK}"
        fi
    fi

    # Anthropic API key (hidden input)
    printf "\n"
    if $AUTO_YES; then
        detail "Skipping ANTHROPIC_API_KEY prompt in auto mode"
    else
        printf "  Enter ANTHROPIC_API_KEY (optional, press Enter to skip): "
        local api_key
        read -rsp "" api_key
        printf "\n"
        if [[ -n "$api_key" ]]; then
            sed_inplace "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${api_key}|" "$env_file"
            info "ANTHROPIC_API_KEY set"
        else
            detail "No API key set — Ollama-only mode is fine for local development"
        fi
    fi

    # Wallet encryption key for non-localnet
    if [[ "$CHOSEN_NETWORK" != "localnet" ]]; then
        local enc_key
        enc_key=$(openssl rand -hex 32)
        sed_inplace "s|^# WALLET_ENCRYPTION_KEY=.*|WALLET_ENCRYPTION_KEY=${enc_key}|" "$env_file"
        info "WALLET_ENCRYPTION_KEY auto-generated (64-char hex)"
        detail "Back up this key! Losing it means losing access to encrypted wallets."
    fi

    # GH_TOKEN
    if ! $AUTO_YES; then
        printf "\n"
        local gh_token
        gh_token=$(prompt_value "  Enter GH_TOKEN for GitHub integration (optional, Enter to skip)" "")
        if [[ -n "$gh_token" ]]; then
            sed_inplace "s|^# GH_TOKEN=.*|GH_TOKEN=${gh_token}|" "$env_file"
            info "GH_TOKEN set"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Section 4: Ollama setup
# ---------------------------------------------------------------------------
setup_ollama() {
    if $SKIP_OLLAMA; then
        detail "Skipping Ollama setup (--skip-ollama)"
        return
    fi

    step "Setting up Ollama"

    # Check / install
    if ! has_cmd ollama; then
        warn "ollama is not installed."
        if confirm "Install Ollama now?"; then
            if [[ "$PLATFORM" == "macos" ]]; then
                if has_cmd brew; then
                    brew install ollama || {
                        warn "brew install failed — trying official installer"
                        curl -fsSL https://ollama.com/install.sh | sh
                    }
                else
                    curl -fsSL https://ollama.com/install.sh | sh
                fi
            else
                curl -fsSL https://ollama.com/install.sh | sh
            fi

            if ! has_cmd ollama; then
                warn "Ollama installation may require a new shell. Skipping Ollama setup."
                detail "After installing, run: ollama serve & ollama pull qwen3:8b"
                return
            fi
            info "Ollama installed"
        else
            detail "Skipping Ollama — you can install later from https://ollama.com"
            return
        fi
    else
        info "ollama found: $(ollama --version 2>/dev/null || echo 'installed')"
    fi

    # Check if running
    if ! curl -sf "${DEFAULT_OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        warn "Ollama is not running."
        if confirm "Start Ollama now?"; then
            if [[ "$PLATFORM" == "macos" ]]; then
                if has_cmd brew && brew services list 2>/dev/null | grep -q ollama; then
                    brew services start ollama 2>/dev/null || true
                else
                    ollama serve &>/dev/null &
                fi
            else
                if systemctl is-active ollama &>/dev/null 2>&1; then
                    : # already running
                elif has_cmd systemctl; then
                    sudo systemctl start ollama 2>/dev/null || ollama serve &>/dev/null &
                else
                    ollama serve &>/dev/null &
                fi
            fi

            # Poll for startup (up to 10s)
            local waited=0
            while [[ $waited -lt 10 ]]; do
                if curl -sf "${DEFAULT_OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
                    break
                fi
                sleep 1
                waited=$((waited + 1))
            done

            if curl -sf "${DEFAULT_OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
                info "Ollama is running"
            else
                warn "Ollama did not start within 10s. You may need to start it manually."
                detail "Run: ollama serve"
                return
            fi
        else
            detail "Start Ollama later with: ollama serve"
            return
        fi
    else
        info "Ollama is running"
    fi

    # Model pull menu
    printf "\n  Choose a model to pull:\n"
    printf "    1) qwen3:8b   — Recommended default (4.9 GB)\n"
    printf "    2) qwen3:4b   — Lightweight (2.6 GB)\n"
    printf "    3) qwen3:14b  — Higher quality (8.7 GB)\n"
    printf "    4) Skip\n"
    local model_choice
    model_choice=$(prompt_value "  Selection" "1")

    local model=""
    case "$model_choice" in
        1) model="qwen3:8b" ;;
        2) model="qwen3:4b" ;;
        3) model="qwen3:14b" ;;
        *) detail "Skipping model pull"; return ;;
    esac

    # Check if already pulled
    if ollama list 2>/dev/null | grep -q "^${model}"; then
        info "${model} is already available"
    else
        info "Pulling ${model} — this may take a while..."
        if ollama pull "$model"; then
            info "${model} pulled successfully"
        else
            warn "Failed to pull ${model}. Try manually: ollama pull ${model}"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Section 5: AlgoKit localnet
# ---------------------------------------------------------------------------
setup_localnet() {
    if $SKIP_LOCALNET; then
        detail "Skipping AlgoKit localnet (--skip-localnet)"
        return
    fi

    if [[ "$CHOSEN_NETWORK" != "localnet" ]]; then
        detail "Skipping localnet setup (network is ${CHOSEN_NETWORK})"
        return
    fi

    step "Setting up AlgoKit localnet (required for on-chain agent features)"
    detail "Localnet provides the Algorand blockchain that powers AlgoChat messaging,"
    detail "agent wallet auto-funding, and on-chain memory storage."

    # Check Docker
    if ! has_cmd docker; then
        error "Docker is not installed — required for Algorand localnet."
        detail "Install from: https://docs.docker.com/get-docker/"
        warn "Without localnet, agents cannot use AlgoChat or on-chain wallets."
        if ! confirm "Continue without Docker? (not recommended)"; then
            return
        fi
    elif ! docker info &>/dev/null 2>&1; then
        error "Docker daemon is not running — required for Algorand localnet."
        detail "Start Docker Desktop or the Docker daemon and re-run setup."
        warn "Without localnet, agents cannot use AlgoChat or on-chain wallets."
        if ! confirm "Continue without Docker? (not recommended)"; then
            return
        fi
    else
        info "Docker is running"
    fi

    # Check / install AlgoKit
    if ! has_cmd algokit; then
        warn "algokit is not installed — required to run Algorand localnet."
        if confirm "Install AlgoKit now? (recommended)"; then
            if [[ "$PLATFORM" == "macos" ]]; then
                if has_cmd brew; then
                    brew install algorandfoundation/tap/algokit || {
                        warn "brew install failed — trying pipx"
                        if has_cmd pipx; then
                            pipx install algokit
                        else
                            pip3 install --user algokit
                        fi
                    }
                elif has_cmd pipx; then
                    pipx install algokit
                else
                    pip3 install --user algokit
                fi
            else
                if has_cmd pipx; then
                    pipx install algokit
                else
                    pip3 install --user algokit
                fi
            fi

            if ! has_cmd algokit; then
                warn "AlgoKit installation may require a new shell or PATH update."
                detail "Install manually: https://developer.algorand.org/docs/get-details/algokit/"
                return
            fi
            info "AlgoKit installed"
        else
            detail "Install AlgoKit later: https://developer.algorand.org/docs/get-details/algokit/"
            return
        fi
    else
        info "algokit found"
    fi

    # Check localnet health (matches server/algochat/service.ts health check)
    local algod_token
    algod_token=$(printf 'a%.0s' {1..64})
    if curl -sf "http://localhost:4001/v2/status" -H "X-Algo-API-Token: ${algod_token}" >/dev/null 2>&1; then
        info "Localnet is already running"
        detail "algod:   http://localhost:4001"
        detail "KMD:     http://localhost:4002"
        detail "Indexer: http://localhost:8980"
        return
    fi

    # Start localnet
    if confirm "Start AlgoKit localnet now? (recommended)"; then
        info "Starting localnet (this may pull Docker images on first run)..."
        algokit localnet start

        # Poll up to 30s
        local waited=0
        while [[ $waited -lt 30 ]]; do
            if curl -sf "http://localhost:4001/v2/status" -H "X-Algo-API-Token: ${algod_token}" >/dev/null 2>&1; then
                break
            fi
            sleep 1
            waited=$((waited + 1))
        done

        if curl -sf "http://localhost:4001/v2/status" -H "X-Algo-API-Token: ${algod_token}" >/dev/null 2>&1; then
            info "Localnet is running"
            detail "algod:   http://localhost:4001"
            detail "KMD:     http://localhost:4002"
            detail "Indexer: http://localhost:8980"
        else
            warn "Localnet did not become healthy within 30s."
            detail "Check Docker logs or run: algokit localnet start"
        fi
    else
        detail "Start localnet later with: algokit localnet start"
    fi
}

# ---------------------------------------------------------------------------
# Section 6: Build client
# ---------------------------------------------------------------------------
setup_build() {
    if $SKIP_BUILD; then
        detail "Skipping client build (--skip-build)"
        return
    fi

    step "Building Angular client"

    if [[ -d "$PROJECT_DIR/client/dist" ]]; then
        if ! confirm "client/dist/ already exists. Rebuild?"; then
            info "Skipping client build"
            return
        fi
    fi

    if (cd "$PROJECT_DIR/client" && bunx ng build); then
        if [[ -d "$PROJECT_DIR/client/dist" ]]; then
            info "Client built successfully"
        else
            warn "Build command completed but dist/ was not created."
            detail "Try manually: cd client && bunx ng build"
        fi
    else
        warn "Client build failed."
        detail "You can use 'bun run dev:client' for development with hot reload instead."
    fi
}

# ---------------------------------------------------------------------------
# Section 7: Summary
# ---------------------------------------------------------------------------
print_summary() {
    step "Setup complete"
    printf "\n"

    # Localnet + AlgoChat (shown first — it's the core feature)
    if [[ "$CHOSEN_NETWORK" == "localnet" ]]; then
        local algod_token
        algod_token=$(printf 'a%.0s' {1..64})
        printf "  %-12s" "Localnet:"
        if curl -sf "http://localhost:4001/v2/status" -H "X-Algo-API-Token: ${algod_token}" >/dev/null 2>&1; then
            printf "${GREEN}running${RESET}\n"
            printf "  %-12s" "AlgoChat:"
            printf "${GREEN}ready (on-chain messaging enabled)${RESET}\n"
        else
            printf "${RED}not running${RESET}\n"
            printf "  %-12s" "AlgoChat:"
            printf "${RED}unavailable — start localnet first${RESET}\n"
            detail "Run: algokit localnet start"
        fi
    else
        printf "  %-12s" "Network:"
        printf "${GREEN}%s${RESET}\n" "$CHOSEN_NETWORK"
    fi

    # Ollama
    printf "  %-12s" "Ollama:"
    if curl -sf "${DEFAULT_OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        local model_count
        model_count=$(ollama list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
        printf "${GREEN}running (%s model%s)${RESET}\n" "$model_count" "$( [[ "$model_count" == "1" ]] && echo "" || echo "s")"
    else
        printf "${YELLOW}not running${RESET}\n"
    fi

    # Claude API
    printf "  %-12s" "Claude:"
    if [[ -f "$PROJECT_DIR/.env" ]] && grep -qE '^ANTHROPIC_API_KEY=.+' "$PROJECT_DIR/.env" 2>/dev/null; then
        printf "${GREEN}configured${RESET}\n"
    else
        printf "${YELLOW}not set (Ollama-only mode)${RESET}\n"
    fi

    # Client
    printf "  %-12s" "Client:"
    if [[ -d "$PROJECT_DIR/client/dist" ]]; then
        printf "${GREEN}built${RESET}\n"
    else
        printf "${YELLOW}not built${RESET}\n"
    fi

    printf "\n  ${BOLD}Next steps:${RESET}\n"
    printf "    bun run dev          Start server in watch mode\n"
    printf "    bun run dev:client   Angular dev server with hot reload\n"
    printf "    Dashboard:           http://localhost:%s\n" "$DEFAULT_PORT"
    printf "\n"
    detail "Database auto-initializes on first run."
    if [[ "$CHOSEN_NETWORK" == "localnet" ]]; then
        detail "Agent wallets auto-create and auto-fund on localnet."
        detail "AlgoChat messaging starts automatically — agents communicate on-chain."
    fi
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
    printf "\n${BOLD}corvid-agent setup v${SETUP_VERSION}${RESET}\n"
    detail "Project: ${PROJECT_DIR}"
    detail "Platform: ${PLATFORM}"
    printf "\n"
    detail "corvid-agent uses Algorand localnet + AlgoChat for on-chain agent"
    detail "communication — agents save memories, send messages, and manage"
    detail "wallets on a local blockchain. This is what makes it different."

    setup_prerequisites
    setup_dependencies
    setup_env
    setup_ollama
    setup_localnet
    setup_build
    print_summary
}

main
