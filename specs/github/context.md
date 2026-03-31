# GitHub — Context

## Why This Module Exists

Agents interact with GitHub extensively — creating PRs, reviewing code, starring repos, filing issues. The GitHub module wraps the `gh` CLI to provide these operations with a safety layer: a repo blocklist that prevents agents from accidentally modifying off-limits repositories.

## Architectural Role

GitHub is an **external integration module** — it mediates all agent interactions with GitHub, enforcing access controls.

## Key Design Decisions

- **`gh` CLI over REST API**: Uses the GitHub CLI rather than direct API calls. This leverages the CLI's built-in auth management and avoids token handling complexity.
- **Repo blocklist**: A configurable deny-list prevents write operations (PRs, pushes, issues) against protected repositories. This is a critical safety mechanism.
- **Organization: CorvidLabs**: All repos live under the `CorvidLabs` GitHub organization, NOT `corvid-agent`.

## Relationship to Other Modules

- **Work Tasks**: Work task completion often involves creating PRs via this module.
- **Polling**: The auto-merge poller uses GitHub operations to merge approved PRs.
- **Feedback**: The outcome tracker polls GitHub for PR status.
- **Webhooks**: GitHub webhook events trigger agent actions via the webhook service.
