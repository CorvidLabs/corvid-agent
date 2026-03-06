#!/usr/bin/env bash
# Socat bridge: forwards Algorand localnet ports from Mac host (192.168.64.1)
# to localhost so corvid-agent can reach algod/KMD/indexer.
#
# Used by the com.corvidlabs.localnet-bridge LaunchAgent.
# Also sets up DOCKER_HOST forwarding.
set -euo pipefail

MAC_HOST="192.168.64.1"
ALGO_PORTS=(4001 4002 8980)
SOCAT_PIDS=()

cleanup() {
    for pid in "${SOCAT_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    exit 0
}
trap cleanup SIGTERM SIGINT

echo "[localnet-bridge] Starting socat bridges to ${MAC_HOST}..."

for port in "${ALGO_PORTS[@]}"; do
    # Kill any stale listener
    lsof -ti ":${port}" 2>/dev/null | xargs kill 2>/dev/null || true
    sleep 0.1
    socat "TCP-LISTEN:${port},reuseaddr,fork" "TCP:${MAC_HOST}:${port}" &
    SOCAT_PIDS+=($!)
    echo "[localnet-bridge] localhost:${port} → ${MAC_HOST}:${port} (pid $!)"
done

echo "[localnet-bridge] ${#SOCAT_PIDS[@]} ports forwarded. Waiting..."

# Keep alive — launchd expects the process to stay running
wait
