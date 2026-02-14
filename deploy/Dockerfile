# ── Stage 1: Build Angular client ────────────────────────────────
FROM oven/bun:1 AS client-build
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
FROM oven/bun:1 AS production
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

# Run as non-root user (oven/bun:1 is Debian-slim — use native commands)
RUN groupadd --system corvid && useradd --system --gid corvid corvid
RUN chown -R corvid:corvid /app
USER corvid

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "const r = await fetch('http://localhost:3000/api/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "server/index.ts"]
