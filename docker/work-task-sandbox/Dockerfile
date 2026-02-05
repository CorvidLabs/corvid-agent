# Secure sandbox container for CorvidAgent work task execution
FROM oven/bun:1-slim

# Create non-root user for security
RUN groupadd -r corvidworker && useradd -r -g corvidworker corvidworker

# Install minimal required dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    gpg \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI for PR creation (needed for work tasks)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install gh \
    && rm -rf /var/lib/apt/lists/*

# Create work directory
WORKDIR /workspace

# Copy package files first for better layer caching
COPY package*.json bun.lockb* ./
COPY client/package*.json ./client/

# Install dependencies as root, then change ownership
RUN bun install --frozen-lockfile
RUN cd client && bun install --frozen-lockfile

# Copy source code
COPY . .

# Set proper ownership for the workspace
RUN chown -R corvidworker:corvidworker /workspace

# Remove sensitive files that should never be accessible in sandbox
RUN rm -f .env* server/db/*.db* wallet-keystore.json

# Switch to non-root user
USER corvidworker

# Set resource limits via Docker (CPU/memory) - configured at runtime
# Network access restricted via Docker network policies

# Default command will be overridden by work task execution
CMD ["echo", "CorvidAgent Work Task Sandbox Ready"]