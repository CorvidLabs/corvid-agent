---
module: websocket-handler
version: 1
status: deprecated
files:
  - server/ws/handler.ts
db_tables: []
depends_on:
  - specs/ws/handler.spec.md
---

# WebSocket Handler (Legacy)

## Purpose

Legacy WebSocket handler specification for JWT authentication. Superseded by `specs/ws/handler.spec.md`.

## Public API

This module is deprecated. See `specs/ws/handler.spec.md` for the active WebSocket handler specification.

## Invariants

1. This specification is maintained for backward compatibility only.

## Behavioral Examples

### Scenario: Legacy authentication

- **Given** a legacy authentication request
- **When** JWT validation is required
- **Then** refer to the active WebSocket handler spec

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Legacy authentication | Use current WebSocket handler |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `specs/ws/handler.spec.md` | Active WebSocket handler |

### Consumed By

| Module | What is used |
|--------|-------------|
| None | This module is deprecated |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | Rook | Initial spec for quality audit fix |
