#!/usr/bin/env bash
# Wrapper that restarts the server when it exits with code 42 (restart requested).
set -euo pipefail

RESTART_CODE=42

while true; do
    echo "[run.sh] Starting server..."
    bun run server/index.ts || EXIT_CODE=$?
    EXIT_CODE=${EXIT_CODE:-0}

    if [ "$EXIT_CODE" -eq "$RESTART_CODE" ]; then
        echo "[run.sh] Restart requested (exit $RESTART_CODE). Restarting..."
        sleep 1
        continue
    fi

    echo "[run.sh] Server exited with code $EXIT_CODE. Stopping."
    exit "$EXIT_CODE"
done
