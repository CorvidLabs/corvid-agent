# Branch Protection Restoration Attempt — 2026-05-03

## Status
**Blocked**: The corvid-agent repository requires admin access to set branch protection rules, which the current GitHub token does not have.

## Current State
- **corvid-agent main branch**: No protection rules (confirmed 404 on API)
- **Last applied**: 2026-04-22 (rules have lapsed)
- **Impact**: main branch is unprotected against force pushes, deletions, and merges without review

## Script Execution Results
- **Primary repos** (CorvidLabs org): SKIPPED due to missing admin access
  - CorvidLabs/corvid-agent
  - CorvidLabs/rs-algochat
  - CorvidLabs/kt-algochat
- **Secondary repos**: Successfully protected
  - CorvidLabs/go-algochat ✓
  - CorvidLabs/go-algod-monitor ✓
  - CorvidLabs/go-collections ✓
  - corvid-agent/corvid-agent-chat ✓

## Root Cause
The GitHub token (GH_TOKEN) lacks `admin:repo_hook` scope required for branch protection operations on org repositories.

Current scopes:
- gist, notifications, project, read:audit_log, read:org, repo, user, workflow, write:discussion, write:packages

Required additional scope:
- `admin:repo_hook` (for branch protection rules)

## Remediation Required
To restore branch protection on CorvidLabs/corvid-agent:

1. **Option A: Token Upgrade** (Recommended for automation)
   - GitHub token needs to be granted `admin:repo_hook` scope
   - Contact: CorvidLabs org admin (Leif)
   - Command to re-apply once token is upgraded:
     ```bash
     ./scripts/enable-branch-protection.sh
     ./scripts/enable-branch-protection.sh --verify-only
     ```

2. **Option B: Manual Application** (Immediate)
   - Leif (org admin) runs the script directly with admin credentials
   - Or applies protection via GitHub web UI: Settings → Branches → Add rule

## Expected Protection Rules
Once restored on corvid-agent/main:
- ✓ Require 1 PR review before merge
- ✓ Dismiss stale reviews on new pushes
- ✓ Block force pushes
- ✓ Block branch deletion
- ✓ Require CI status checks (Build & Test ubuntu)
- ✓ Enforce rules for admins (no bypass)

## Reference
- Script: `./scripts/enable-branch-protection.sh`
- Issues: #428 (branch protection), #463 (security audit)
- Last log: Scripts/enable-branch-protection.sh line 13
