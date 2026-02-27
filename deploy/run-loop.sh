#!/usr/bin/env bash
# run-loop.sh — Run the corvid-agent server in a restart loop.
#
# The server exits with code 75 when it has pulled new code and wants
# to restart. Any other non-zero exit is treated as a crash and also
# restarts (with a brief cooldown). Exit code 0 = clean shutdown.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RESTART_EXIT_CODE=75
CRASH_COOLDOWN_SECS=10

cd "$PROJECT_DIR"

while true; do
    echo "[run-loop] Starting server..."
    bun server/index.ts
    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        echo "[run-loop] Server exited cleanly (code 0). Stopping."
        break
    elif [[ $exit_code -eq $RESTART_EXIT_CODE ]]; then
        echo "[run-loop] Server requested restart after auto-update (code $RESTART_EXIT_CODE)."
        # The server runs bun install before exiting, but as a safety net
        # ensure deps are fresh in case that step was skipped or failed.
        echo "[run-loop] Running bun install..."
        bun install --frozen-lockfile 2>/dev/null || bun install
        echo "[run-loop] Restarting..."
    else
        echo "[run-loop] Server crashed (code $exit_code). Restarting in ${CRASH_COOLDOWN_SECS}s..."
        sleep "$CRASH_COOLDOWN_SECS"
    fi
done
