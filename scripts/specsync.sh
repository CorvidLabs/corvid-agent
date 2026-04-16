#!/usr/bin/env bash
# Wrapper script for the specsync binary.
# Downloads the correct binary from CorvidLabs/spec-sync releases on first use.
set -euo pipefail

SPECSYNC_VERSION="${SPECSYNC_VERSION:-v4.2.0}"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/specsync"
BINARY="$CACHE_DIR/$SPECSYNC_VERSION/specsync"

if [ ! -x "$BINARY" ]; then
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"

  case "$OS" in
    linux)  OS_TAG="linux" ;;
    darwin) OS_TAG="macos" ;;
    *)      echo "error: unsupported OS: $OS" >&2; exit 1 ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  ARCH_TAG="x86_64" ;;
    arm64|aarch64) ARCH_TAG="aarch64" ;;
    *)             echo "error: unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac

  ASSET="specsync-${OS_TAG}-${ARCH_TAG}.tar.gz"
  URL="https://github.com/CorvidLabs/spec-sync/releases/download/${SPECSYNC_VERSION}/${ASSET}"

  echo "Downloading specsync ${SPECSYNC_VERSION} (${OS_TAG}-${ARCH_TAG})..." >&2
  mkdir -p "$CACHE_DIR/$SPECSYNC_VERSION"
  curl -fsSL "$URL" | tar -xz -C "$CACHE_DIR/$SPECSYNC_VERSION"

  # The tarball may name the binary with a platform suffix — normalize to "specsync"
  if [ ! -f "$BINARY" ]; then
    EXTRACTED=$(find "$CACHE_DIR/$SPECSYNC_VERSION" -type f -name 'specsync*' | head -1)
    if [ -z "$EXTRACTED" ]; then
      echo "error: no specsync binary found after extraction" >&2; exit 1
    fi
    mv "$EXTRACTED" "$BINARY"
  fi

  chmod +x "$BINARY"
  echo "specsync installed to $BINARY" >&2
fi

exec "$BINARY" "$@"
