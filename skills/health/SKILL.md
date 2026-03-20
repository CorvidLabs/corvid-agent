---
name: health
description: Use this skill when the user wants to check codebase health metrics, view health trends over time, or monitor improvement cycles. Triggers include "health check", "health trends", "code quality", "metrics", "improvement cycle", "codebase health", or any reference to tracking code quality over time.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Health — Codebase Health Trends

View codebase health metric trends across improvement cycles.

## MCP Tools

- `corvid_check_health_trends` — View codebase health metric trends
  - Parameters: `project` (optional, project name), `period` (optional: "day", "week", "month"), `metrics` (optional, specific metrics to check)

## Examples

### View recent trends

```
Use corvid_check_health_trends:
  period: "week"
```

### Check specific project

```
Use corvid_check_health_trends:
  project: "corvid-agent"
  period: "month"
```

## Notes

- Tracks metrics like test coverage, lint errors, build times, and bundle size
- Trends show improvement or regression across improvement cycles
- Useful for monitoring the impact of refactoring and cleanup work
