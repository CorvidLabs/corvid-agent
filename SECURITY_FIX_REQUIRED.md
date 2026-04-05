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

## Required Fix
Add the following override to `package.json` in the `"overrides"` section:

```json
"@anthropic-ai/sdk": ">=0.81.0"
```

This tightens the constraint to exclude the vulnerable range while allowing safe versions.

## Verification
After applying the fix, run:
```bash
bun install
bun audit
```

The audit should report: **0 vulnerabilities**

## Governance Note
`package.json` is a Layer 1 (Structural) file. This change requires supermajority council vote + human approval before merging.
