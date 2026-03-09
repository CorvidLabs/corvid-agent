---
name: github
description: Use this skill when the user wants to interact with GitHub through CorvidAgent — creating PRs, reviewing code, managing issues, starring repos, or forking repositories. Triggers include "create a PR", "review pull request", "create an issue", "star this repo", "fork", "list PRs", "code review", or any GitHub repository operation.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# GitHub — Repository Operations

Manage GitHub repositories, pull requests, issues, and code reviews.

## MCP Tools

| Tool | Description |
|------|-------------|
| `corvid_github_create_pr` | Create a pull request |
| `corvid_github_list_prs` | List open PRs |
| `corvid_github_review_pr` | Submit a review (APPROVE, REQUEST_CHANGES, COMMENT) |
| `corvid_github_get_pr_diff` | Get the full diff for a PR |
| `corvid_github_comment_on_pr` | Add a comment to a PR |
| `corvid_github_create_issue` | Create an issue with labels |
| `corvid_github_list_issues` | List issues by state |
| `corvid_github_repo_info` | Get repo metadata |
| `corvid_github_star_repo` | Star a repository |
| `corvid_github_unstar_repo` | Remove a star |
| `corvid_github_fork_repo` | Fork a repository |
| `corvid_github_follow_user` | Follow a GitHub user |

## Examples

### Review a PR

```
1. Use corvid_github_get_pr_diff for PR #42 on CorvidLabs/corvid-agent
2. Review the changes
3. Use corvid_github_review_pr to submit feedback
```

### Create an issue

```
Use corvid_github_create_issue on CorvidLabs/corvid-agent:
  title: "Bug: session timeout on backgrounded tabs"
  body: "Steps to reproduce..."
  labels: ["bug"]
```

## Notes

- PR reviews support APPROVE, REQUEST_CHANGES, and COMMENT events
- Repo blocklist prevents operations on restricted repositories
