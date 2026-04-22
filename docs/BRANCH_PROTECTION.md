# Branch Protection Configuration

## Overview

This document describes the branch protection rules configured on CorvidLabs repositories and how to manage them.

## Primary Repository: CorvidLabs/corvid-agent

The `main` branch requires:

- **Pull Request Reviews**: At least 1 approval before merging
  - Stale reviews are automatically dismissed on new pushes
  - Code owner reviews are not required
- **Status Checks**: All required CI checks must pass
  - Build & Test (ubuntu) — TypeScript compilation, unit tests, spec validation, migrations
  - Strict mode enabled: branch must be up to date before merging
- **Force Pushes**: Blocked for all users (including admins)
- **Branch Deletion**: Blocked for all users
- **Admin Enforcement**: Enabled — admins cannot bypass these rules

## Secondary Repositories

Secondary CorvidLabs repositories (rs-algochat, kt-algochat, go-algochat, go-algod-monitor, go-collections, corvid-agent-chat) have standard protection:

- **Pull Request Reviews**: At least 1 approval before merging
- **Force Pushes**: Blocked
- **Branch Deletion**: Blocked
- **Admin Enforcement**: Not enforced (admins may bypass)

## Applying Branch Protection

### Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- **Admin access** on the CorvidLabs organization

### Running the Script

To apply or update branch protection rules:

```bash
./scripts/enable-branch-protection.sh
```

### Options

- `--dry-run` — Show what would be applied without making changes
- `--verify-only` — Check current protection status without making changes

### Examples

```bash
# See what would be applied without making changes
./scripts/enable-branch-protection.sh --dry-run

# Verify current protection is in place
./scripts/enable-branch-protection.sh --verify-only

# Apply protection (requires admin access)
./scripts/enable-branch-protection.sh
```

## Verification

GitHub Actions runs a weekly check (Monday at 06:00 UTC) to verify branch protection is correctly configured. See `.github/workflows/branch-protection.yml`.

To manually verify:

```bash
gh api repos/CorvidLabs/corvid-agent/branches/main/protection
```

## Implementation Details

### Status Check Contexts

The CI workflow in `.github/workflows/ci.yml` generates:

- **Build & Test (ubuntu)** — Main continuous integration job that includes:
  - TypeScript type checking (`bun x tsc`)
  - Database migrations
  - Unit tests with coverage
  - Spec validation (strict mode, 100% coverage)
  - Client build

Cross-platform builds (macOS, Windows) only run on release tags and are not required for every PR.

### API Reference

Branch protection is managed via GitHub REST API endpoints:

- `GET /repos/{owner}/{repo}/branches/{branch}/protection` — Get current protection
- `PUT /repos/{owner}/{repo}/branches/{branch}/protection` — Set protection
- `DELETE /repos/{owner}/{repo}/branches/{branch}/protection` — Remove protection

See [GitHub API Documentation](https://docs.github.com/en/rest/branches/branch-protection) for details.

## Troubleshooting

### 404: No branch protection

If `gh api` returns 404, branch protection is not configured. Run the setup script with admin access.

### Permission denied

The authenticated GitHub token must have `admin` scope on the repository. Check your GitHub token permissions:

```bash
gh auth status
```

### Status check not appearing

If a required status check is missing:

1. Verify the check name matches the GitHub Actions job name
2. Ensure the workflow runs on the branch (check `on:` triggers)
3. Check branch protection rules; the context must be listed
4. Re-run the `enable-branch-protection.sh` script

## Related Issues

- #428 — Add branch protection to prevent direct main commits
- #463 — Security audit: apply branch protection to all CorvidLabs repos
