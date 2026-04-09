---
spec: auth.spec.md
---

## Active Tasks

- [ ] Secure remote access: implement mutual TLS or token-scoped API keys for non-localhost deployments (#1549)
- [ ] v1.0.0-rc payment gating: add credit balance middleware guard for session creation on paid deployments (#1689)
- [ ] Add 2FA (TOTP) support for admin endpoints — currently auth is single-factor API key only (#430 adjacent)
- [ ] Expose API key rotation status and expiry in the Security settings panel

## Completed Tasks

- [x] `validateStartupSecurity()` with `process.exit(1)` for non-localhost deployments missing API key
- [x] `timingSafeEqual()` for all API key comparisons
- [x] `buildCorsHeaders()` with origin allowlist reflection and `Vary: Origin`
- [x] `checkWsAuth()` supporting both `Authorization: Bearer` header and `?key=` query param
- [x] Composable middleware pipeline with numeric `order`-based sorting
- [x] `EndpointRateLimiter` with sliding-window timestamp arrays and `X-RateLimit-*` headers
- [x] `applyGuards()` sequential guard chain with short-circuit on first non-null response
- [x] `/api/health` and `/.well-known/agent-card.json` exempt from authentication
