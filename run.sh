#!/usr/bin/env bash
# Wrapper that restarts the server when it exits with code 42 (restart requested).
set -euo pipefail

RESTART_CODE=42
MAC_HOST="192.168.64.1"
DOCKER_PORT="2375"

# Connect to Mac host's Docker daemon via socat bridge
if curl -sf "http://${MAC_HOST}:${DOCKER_PORT}/version" > /dev/null 2>&1; then
    export DOCKER_HOST="tcp://${MAC_HOST}:${DOCKER_PORT}"
    echo "[run.sh] Connected to Mac Docker daemon at ${DOCKER_HOST}"
else
    echo "[run.sh] Warning: Mac Docker bridge not reachable at ${MAC_HOST}:${DOCKER_PORT}"
    echo "[run.sh] Ensure socat is running on the Mac:"
    echo "[run.sh]   socat TCP-LISTEN:${DOCKER_PORT},reuseaddr,fork UNIX-CONNECT:\$HOME/.docker/run/docker.sock"
fi

while true; do
    echo "[run.sh] Starting server..."
    EXIT_CODE=0
    bun run server/index.ts || EXIT_CODE=$?

    if [ "$EXIT_CODE" -eq "$RESTART_CODE" ]; then
        echo "[run.sh] Restart requested (exit $RESTART_CODE). Restarting..."
        sleep 1
        continue
    fi

    echo "[run.sh] Server exited with code $EXIT_CODE. Stopping."
    exit "$EXIT_CODE"
done
