# Middleware — Context

## Why This Module Exists

Every HTTP request and WebSocket connection needs authentication, CORS handling, and security validation. The middleware module provides these cross-cutting concerns in one place, ensuring consistent security enforcement across all endpoints.

## Architectural Role

Middleware is a **security boundary** — it sits between the network and all route handlers, enforcing authentication and CORS before any business logic runs.

## Key Design Decisions

- **API key required for non-localhost**: Any deployment accessible from the network must have an API key configured. This prevents accidental exposure.
- **Timing-safe comparison**: API key validation uses timing-safe comparison to prevent timing attacks.
- **CORS origin reflection**: Reflects the request origin in CORS headers rather than using a wildcard. This is more secure while still supporting cross-origin access from the dashboard.
- **Startup validation**: Checks security configuration at boot time and fails fast if the deployment is insecure.

## Relationship to Other Modules

- **Routes**: All route handlers run after middleware authentication.
- **WebSocket**: WebSocket connections are authenticated through the same middleware.
- **Config**: Reads API key and security settings from configuration.
- **Health**: The health monitor checks middleware pipeline status.
