# Provider Regression Report Template

> Copy this template, fill it in, and post it as a comment on the relevant GitHub issue (or as a new issue if it's a new regression).
> Reference issue: [#1500](https://github.com/CorvidLabs/corvid-agent/issues/1500)
> Runbook: [provider-parity-runbook.md](provider-parity-runbook.md)

---

## How to File

1. Copy the template below
2. Replace all `<placeholders>` with actual values
3. Post as a GitHub issue comment under the affected issue, or open a new issue with label `regression` + affected provider label (`agent:condor` for Ollama, `provider:cursor` for Cursor)
4. Link from the release scorecard row that triggered this report

---

## Template

```markdown
## Provider Regression Report

**Date:** <YYYY-MM-DD>
**Reporter:** <agent or human name>
**Scorecard section:** <Section 1 / Section 2 Ollama / Section 2 Cursor / Section 3 / Section 4>
**Release version:** <vX.Y.Z or "pre-release">
**Provider affected:** <Ollama | Cursor | Both>

---

### What Regressed

<One-sentence description of what broke.>

**Before:** <previous behavior or metric value>
**After:** <current behavior or metric value>

**Failed threshold:** <e.g. "Single-turn completion rate dropped from 97% to 83% (threshold: ≥ 95%)">

---

### How to Reproduce

<Minimal steps to reproduce the regression. Include test command or scenario from the runbook.>

```bash
# Example:
bun test server/__tests__/buddy-mixed-provider.test.ts
# Expected: 100% pass
# Actual: 2 failures (see output below)
```

<Paste relevant test output or error message here>

---

### Impact

**Severity:** <Block (release blocked) | Warn (release can proceed, investigation required)>
**Sessions affected:** <All Ollama sessions | Cursor-only sessions | Mixed-provider councils | etc.>
**User-visible:** <Yes — describe what the user sees | No — internal only>

---

### Root Cause (if known)

<Leave blank if unknown. Fill in once diagnosed.>

---

### Proposed Fix

<Leave blank if unknown. Fill in once a fix is identified.>

**Owner:** <agent or human>
**ETA:** <date or "unknown">

---

### Related

- PR that introduced the regression: #<number> (if known)
- Last known-good commit: `<sha>` (if known)
- Related scorecard row: [provider-quality-scorecard.md](../docs/provider-quality-scorecard.md) Section <N>
```

---

## Filed Reports (Index)

Track all active regression reports here. Remove entries when resolved.

| Date | Provider | Section | Severity | Owner | Status | Issue/PR |
|------|----------|---------|----------|-------|--------|----------|
| — | — | — | — | — | — | — |
