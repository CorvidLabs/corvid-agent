# ── Stage 1: Build Angular client ────────────────────────────────
FROM oven/bun:1.3.8 AS client-build
WORKDIR /app/client

# Install client dependencies
COPY client/package.json client/bun.lock* ./
RUN bun install --frozen-lockfile

# Copy shared types (client imports from ../shared/)
COPY shared/ /app/shared/

# Copy client source & build
COPY client/ .
RUN bun run build

# ── Stage 2: Production image ───────────────────────────────────
FROM oven/bun:1.3.8 AS production
WORKDIR /app

# Install server dependencies only
COPY package.json bun.lock* ./
COPY patches/ patches/
RUN bun install --frozen-lockfile --production

# Copy server source
COPY server/ server/
COPY shared/ shared/

# Copy built client from stage 1
COPY --from=client-build /app/client/dist/ client/dist/

ENV PORT=3000
# WARNING: 0.0.0.0 binds to all interfaces. In production, use a reverse
# proxy with TLS and set BIND_HOST=127.0.0.1 at runtime.
ENV BIND_HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV NODE_ENV=production

# Install Claude Code CLI — lets agents authenticate via `claude login` instead
# of requiring ANTHROPIC_API_KEY. Credentials survive restarts but not `docker compose down`.
RUN BUN_INSTALL=/usr/local bun add --global @anthropic-ai/claude-code

# Run as non-root user (oven/bun:1 is Debian-slim — use native commands)
# -m creates /home/corvid so `claude login` can store credentials there
RUN groupadd --system corvid && useradd --system -m --gid corvid corvid
RUN mkdir -p /app/data && chown -R corvid:corvid /app
USER corvid

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "const r = await fetch('http://localhost:3000/health/live'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "server/index.ts"]
