# Production Hardening Guide — corvid-agent v1.0

## Pre-Deployment Checklist

### Authentication & Secrets

- [ ] Set a strong, unique `API_KEY` (min 32 characters, cryptographically random)
- [ ] Set `ANTHROPIC_API_KEY` with minimal required permissions
- [ ] Set `WALLET_ENCRYPTION_KEY` (32+ characters) — do NOT use the default
- [ ] If using Stripe: set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- [ ] Store all secrets in a secrets manager (not `.env` files in production)
- [ ] Rotate API keys periodically (quarterly recommended)

### Network Security

- [ ] Deploy behind a reverse proxy (Caddy or nginx, see `deploy/`)
- [ ] Enable TLS (Let's Encrypt via Caddy, or cert-manager in K8s)
- [ ] Restrict API access to known IP ranges if possible
- [ ] Use `ALLOWED_ORIGINS` to allowlist specific frontend domains
- [ ] Do NOT expose port 3578 directly to the internet
- [ ] Ensure WebSocket connections use WSS (not WS)

### Database

- [ ] Set `DB_PATH` to a directory with restrictive permissions (700)
- [ ] Enable SQLite WAL mode (default in Bun)
- [ ] Back up the database regularly (minimum daily)
- [ ] In multi-tenant mode, consider separate database files per tenant
- [ ] Set filesystem ownership to the service user (not root)

### Container Sandboxing

- [ ] Set `SANDBOX_ENABLED=true` for production workloads
- [ ] Use the provided `Dockerfile.agent` as the base sandbox image
- [ ] Set network policy to `restricted` or `none` for untrusted agents
- [ ] Configure resource limits per agent (CPU, memory, PIDs, storage)
- [ ] Do NOT run Docker in privileged mode
- [ ] Regularly update the sandbox base image

### Agent Configuration

- [ ] Set `permission_mode` to `default` (not `full-auto`) for untrusted agents
- [ ] Configure `allowed_tools` and `disallowed_tools` per agent
- [ ] Set `max_budget_usd` to prevent runaway API costs
- [ ] Review protected paths list (cannot be modified by agents)
- [ ] Enable approval flow for destructive operations

### Notification Channels

- [ ] Use channel-specific secrets (not global env vars) when possible
- [ ] Validate webhook URLs before storing
- [ ] Set up alerting for failed notification deliveries
- [ ] Monitor for unusual notification volume

### Monitoring & Logging

- [ ] Set `LOG_LEVEL=info` (not `debug` in production)
- [ ] Forward logs to a centralized logging system
- [ ] Set up health check monitoring on `/api/health`
- [ ] Monitor rate limiter 429 responses for potential attacks
- [ ] Set up alerts for:
  - Agent session failures (API errors)
  - Credit depletion warnings
  - Container pool exhaustion
  - Failed Stripe webhook deliveries

### Kubernetes Deployment

- [ ] Use the provided Helm chart (`deploy/helm/`)
- [ ] Use StatefulSet (not Deployment) — SQLite requires persistent local storage
- [ ] Set resource requests and limits
- [ ] Enable PodSecurityPolicy or Pod Security Standards
- [ ] Use NetworkPolicy to restrict egress
- [ ] Store secrets in Kubernetes Secrets (or external-secrets-operator)
- [ ] Enable horizontal pod autoscaling only if using shared storage

### Rate Limiting

- [ ] Review default rate limits: 600 GET/min, 60 mutation/min per IP
- [ ] Adjust via `RATE_LIMIT_GET` and `RATE_LIMIT_MUTATION` env vars
- [ ] Consider lower limits for public-facing instances
- [ ] Exempt trusted IPs via reverse proxy configuration

## Security Testing

Run the automated security audit tests:

```bash
bun test --filter security-audit
```

This checks:
- Protected file enforcement
- Environment variable allowlist
- Rate limiter configuration
- Default credential detection
- Plugin capability validation

## Incident Response

1. **Compromised API key**: Rotate immediately, check audit logs
2. **Wallet compromise**: Transfer funds, rotate encryption key, regenerate mnemonics
3. **Agent escape**: Disable agent, review session logs, patch protected paths
4. **Data breach**: Notify affected tenants, rotate all secrets, review access logs

## Version Updates

- Subscribe to security advisories at the project repository
- Update Bun runtime regularly (`bun upgrade`)
- Review CHANGELOG for security-relevant changes
- Run `bun test` after every update to verify nothing broke
