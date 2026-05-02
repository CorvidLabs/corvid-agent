---
name: git
description: Git workflows — branching, committing, worktrees, branch isolation, merge strategies. Trigger keywords: git, commit, branch, merge, rebase, worktree, pull, push, cherry-pick.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Git — Version Control Workflows

Git workflows, branching conventions, and safety rules for the corvid-agent project.

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-name>` | `feat/chat-first-ui` |
| Bug fix | `fix/<issue-or-name>` | `fix/1274-wildcard-route` |
| Work task (auto) | `work/<task-id>` | `work/abc123` |
| Chat session | `chat/<session-id>` | `chat/a1b2c3` |
| Release | `release/v<version>` | `release/v0.40.0` |

## Branch Isolation Rules

When running in an isolated worktree or chat session:

1. **Only commit to YOUR current branch** — check with `git branch --show-current`
2. **Never checkout, merge from, or push to `chat/*` branches** — those belong to other active sessions
3. **Use `main` as your base branch** when referencing upstream changes
4. **Your worktree is fully isolated** — changes do not affect other sessions

## Commit Workflow

Before every commit, run the verification pipeline:

```bash
fledge lanes run verify
```

All checks must pass before committing.

### Commit Message Style

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep the first line under 72 characters
- Reference issue numbers where applicable: `(fixes #1234)`

## Worktrees

Work tasks use git worktrees for isolation:

1. `git worktree add ../worktree-<id> -b work/<id> main` — creates isolated copy
2. Agent works in the worktree, commits, validates
3. On success, a PR is created from the worktree branch
4. Worktree is cleaned up after completion (branch persists for PR)

## Safety Rules

- **Never force-push to `main`** — always use PRs
- **Never use `--no-verify`** — fix the underlying issue instead
- **Never `git reset --hard`** on shared branches without explicit approval
- **Investigate before deleting** — unfamiliar branches may be someone's in-progress work
- **Never run `git branch -a`** to browse other sessions' branches
