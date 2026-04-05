# Security Fix: @anthropic-ai/sdk Audit Warning

## Issue
`bun audit` reports a moderate vulnerability (GHSA-5474-4w2j-mq4c) in @anthropic-ai/sdk for versions >=0.79.0 <0.81.0.

This occurs because:
- @anthropic-ai/claude-agent-sdk@0.2.92 (latest) declares `@anthropic-ai/sdk: ^0.80.0`
- The ^ range allows 0.80.0, which is vulnerable
- We have 0.82.0 installed (safe), but audit still flags the range as problematic

## Investigation Result
- ✅ Latest @anthropic-ai/claude-agent-sdk is 0.2.92
- ✅ No newer version available that tightens the bound to >=0.81.0
- ❌ Cannot update to a newer version

## Required Changes (Both Layer 1 — require human approval)

### Fix 1: package.json — Dependency Override
Add the following override to `package.json` in the `"overrides"` section:

```json
"@anthropic-ai/sdk": ">=0.81.0"
```

This tightens the constraint to exclude the vulnerable range while allowing safe versions.

After applying:
```bash
bun install
bun audit
```
Expected result: **0 vulnerabilities**

### Fix 2: server/lib/validation.ts — Input Length Constraints
Add `.max()` constraints to prevent oversized input attacks on agent and session APIs.

For `CreateAgentSchema` and `UpdateAgentSchema`:
- `name`: `.max(255)`
- `description`: `.max(4096)`
- `model`: `.max(128)`
- `provider`: `.max(128)`
- `systemPrompt`: `.max(65536)`
- `appendPrompt`: `.max(65536)`
- `allowedTools`: `.max(4096)`
- `disallowedTools`: `.max(4096)`

For `CreateSessionSchema`:
- `projectId`: `.max(128)`
- `agentId`: `.max(128)`
- `name`: `.max(255)`
- `initialPrompt`: `.max(65536)`
- `councilLaunchId`: `.max(128)`

For `UpdateSessionSchema`:
- `name`: `.max(255)`

For `ResumeSessionSchema`:
- `prompt`: `.max(65536)`

## Governance Note
Both `package.json` and `server/lib/validation.ts` are Layer 1 (Structural) files.
These changes require supermajority council vote + human approval before merging.
Automated work tasks cannot modify Layer 1 paths — this document is the deliverable.
