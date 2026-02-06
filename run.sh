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

# Forward Algorand localnet ports from localhost → Mac host
# (algod uses localhost:4001 by default; the actual nodes run in Docker on the Mac)
SOCAT_PIDS=()
cleanup_socat() {
    for pid in "${SOCAT_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup_socat EXIT

for port in 4001 4002 8980; do
    # Check if Mac port is reachable (TCP probe, not HTTP — KMD doesn't respond to GET)
    if socat -T1 /dev/null "TCP:${MAC_HOST}:${port},connect-timeout=1" 2>/dev/null; then
        # Kill any stale listener on this port
        lsof -ti ":${port}" 2>/dev/null | xargs -r kill 2>/dev/null || true
        sleep 0.1
        socat "TCP-LISTEN:${port},reuseaddr,fork" "TCP:${MAC_HOST}:${port}" &
        SOCAT_PIDS+=($!)
        echo "[run.sh] Forwarding localhost:${port} → ${MAC_HOST}:${port}"
    else
        echo "[run.sh] Warning: Mac localnet port ${port} not reachable — skipping forward"
    fi
done

if [ ${#SOCAT_PIDS[@]} -gt 0 ]; then
    echo "[run.sh] Algorand localnet bridge active (${#SOCAT_PIDS[@]} ports forwarded)"
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
