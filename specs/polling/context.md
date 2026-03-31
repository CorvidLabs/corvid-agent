# Polling (Auto-Merge) — Context

## Why This Module Exists

Agents create PRs that need to be merged once CI passes. The auto-merge poller watches for agent-authored PRs with passing CI and squash-merges them automatically. This removes the bottleneck of human merge approval for routine agent work.

## Architectural Role

Polling is an **automation service** — it runs on a timer, scanning GitHub for PRs that are ready to merge.

## Key Design Decisions

- **Security scan before merge**: Every PR diff is scanned for security issues (protected file modifications, unapproved external fetches, malicious patterns) before merging. Flagged PRs get a comment and are left for human review.
- **2-minute interval**: Checks every 2 minutes, balancing responsiveness with GitHub API rate limits.
- **Squash-merge only**: All auto-merges use squash to keep the commit history clean.
- **Config-driven repos**: Only scans repos that have active polling configs, not all repos.

## Relationship to Other Modules

- **GitHub**: Uses GitHub operations for PR status checks and merging.
- **DB**: Polling configs stored in `mention_polling_configs`.
- **Work Tasks**: Auto-merged PRs may correspond to completed work tasks.
