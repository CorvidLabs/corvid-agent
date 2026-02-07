FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY server/ server/
COPY shared/ shared/

# Copy pre-built client (if available)
COPY client/dist/ client/dist/

ENV PORT=3000
# WARNING: 0.0.0.0 binds to all interfaces. In production, use a reverse
# proxy with TLS and set BIND_HOST=127.0.0.1 at runtime.
ENV BIND_HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV NODE_ENV=production

# Run as non-root user
RUN addgroup --system corvid && adduser --system --ingroup corvid corvid
RUN chown -R corvid:corvid /app
USER corvid

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "server/index.ts"]
