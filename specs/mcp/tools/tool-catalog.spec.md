---
module: tool-catalog
version: 1
status: active
files:
  - server/mcp/tool-catalog.ts
  - server/routes/tool-catalog.ts
  - server/openapi/routes/tool-catalog.ts
depends_on:
  - server/mcp/default-tools.ts
---

# Tool Catalog

## Purpose

Provides a structured, categorized view of all available MCP tools for API endpoints, Discord commands, and agent-to-agent discovery. Acts as the single source of truth for tool metadata (name, description, category).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getToolCatalog` | `(category?: string)` | `{ categories, tools }` | Get tool catalog, optionally filtered by category |
| `getToolCatalogGrouped` | `()` | `{ category, tools }[]` | Get catalog grouped by category |
| `handleToolCatalogRoutes` | `(req, url)` | `Response \| null` | Route handler for `GET /api/tools` |

### Exported Types

| Type | Description |
|------|-------------|
| `ToolCatalogEntry` | Tool metadata: name, description, category, conditional?, restricted? |
| `ToolCategory` | Category metadata: name, label, description |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `TOOL_CATALOG` | `ToolCatalogEntry[]` | Full catalog of all MCP tools |
| `TOOL_CATEGORIES` | `ToolCategory[]` | Tool category definitions |
| `toolCatalogRoutes` | `RouteEntry[]` | OpenAPI route definitions for `GET /api/tools` |

## Categories

| Name | Label | Description |
|------|-------|-------------|
| `communication` | Communication & Memory | Send messages, save/recall memories, manage on-chain storage |
| `agents` | Agent Management | List agents, discover remote agents, launch councils, manage contacts |
| `work` | Session & Work | Manage sessions, credits, projects, work tasks, schedules, and workflows |
| `research` | Research | Web search, deep research, browser automation |
| `github` | GitHub | Star, fork, PRs, issues, reviews, and repo management |
| `notifications` | Notifications & Reputation | Owner notifications, reputation scoring, attestations |
| `code` | Code Tools | AST navigation, file operations, repo blocklist |

## Invariants

1. **Complete coverage**: Every tool in `DEFAULT_CORE_TOOLS` has a corresponding catalog entry
2. **Valid categories**: Every catalog entry references a category that exists in `TOOL_CATEGORIES`
3. **No auth required**: The `GET /api/tools` endpoint is public (no authentication)
4. **Category filter**: Passing `?category=X` returns only tools in that category
5. **Grouped mode**: Passing `?grouped=true` returns tools grouped by category

## Behavioral Examples

### Scenario: List all tools

- **Given** a GET request to `/api/tools`
- **Then** returns all tools with all categories

### Scenario: Filter by category

- **Given** a GET request to `/api/tools?category=github`
- **Then** returns only GitHub tools

### Scenario: Grouped view

- **Given** a GET request to `/api/tools?grouped=true`
- **Then** returns an array of `{ category, tools }` objects

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown category filter | Returns empty tools array with all categories |
| Non-matching URL path | `handleToolCatalogRoutes` returns `null` |

## Dependencies

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | `handleToolCatalogRoutes` for REST API |
| `server/openapi/route-registry.ts` | `toolCatalogRoutes` for OpenAPI spec |

## Tool Count

The catalog contains 56 tools across 7 categories. Complete enumeration:

### Communication & Memory (7 tools)
- `corvid_send_message` — Send inter-agent messages
- `corvid_save_memory` — Save to short-term SQLite storage
- `corvid_recall_memory` — Recall memories by key or query
- `corvid_read_on_chain_memories` — Read from Algorand blockchain
- `corvid_sync_on_chain_memories` — Sync on-chain to local cache
- `corvid_delete_memory` — Delete an ARC-69 memory
- `corvid_promote_memory` — Promote short-term to on-chain

### Shared Library (4 tools)
- `corvid_library_write` — Publish/update shared library entries
- `corvid_library_read` — Read from shared library (local cache)
- `corvid_library_list` — List library entries from blockchain
- `corvid_library_delete` — Delete shared library entries

### Agent Management (6 tools)
- `corvid_list_agents` — List available agents
- `corvid_discover_agent` — Fetch remote agent card
- `corvid_invoke_remote_agent` — Send task to remote A2A agent
- `corvid_lookup_contact` — Resolve cross-platform contact identities
- `corvid_launch_council` — Launch multi-agent deliberation
- `corvid_flock_directory` — Manage on-chain agent registry

### Session & Work (9 tools)
- `corvid_create_work_task` — Create work task on dedicated branch
- `corvid_check_work_status` — Check work task status
- `corvid_list_work_tasks` — List work tasks with filters
- `corvid_list_projects` — List available projects
- `corvid_current_project` — Show current project
- `corvid_extend_timeout` — Request more session time
- `corvid_restart_server` — Restart corvid-agent server
- `corvid_manage_schedule` — Create/manage automated schedules
- `corvid_manage_workflow` — Manage graph-based workflows

### Credits & Billing (3 tools)
- `corvid_check_credits` — Check credit balance
- `corvid_grant_credits` — Grant free credits (restricted)
- `corvid_credit_config` — View/update credit system config (restricted)

### Research & Web (2 tools)
- `corvid_web_search` — Web search via Brave Search
- `corvid_deep_research` — Multi-angle topic research

### GitHub (12 tools)
- `corvid_github_star_repo` — Star a repository
- `corvid_github_unstar_repo` — Remove a star
- `corvid_github_fork_repo` — Fork a repository
- `corvid_github_list_prs` — List open pull requests
- `corvid_github_list_issues` — List issues
- `corvid_github_create_pr` — Create pull request
- `corvid_github_create_issue` — Create issue
- `corvid_github_review_pr` — Submit review on PR
- `corvid_github_comment_on_pr` — Add comment to PR
- `corvid_github_get_pr_diff` — Get PR diff/patch
- `corvid_github_repo_info` — Get repository information
- `corvid_github_follow_user` — Follow a GitHub user

### Notifications & Reputation (7 tools)
- `corvid_notify_owner` — Send notification to owner
- `corvid_ask_owner` — Ask owner (blocking) for input
- `corvid_configure_notifications` — Manage notification channels
- `corvid_check_reputation` — Check agent reputation score
- `corvid_check_health_trends` — View codebase health metrics
- `corvid_publish_attestation` — Publish reputation attestation on-chain
- `corvid_verify_agent_reputation` — Verify remote agent reputation

### Code Tools (3 tools)
- `corvid_code_symbols` — Search code symbols via AST
- `corvid_find_references` — Find all symbol references
- `corvid_repo_blocklist` — Manage repo blocklist

### Platform Integration (2 tools)
- `corvid_discord_send_message` — Send Discord message
- `corvid_discord_send_image` — Send Discord image
- `corvid_browser` — Browser automation with Chrome

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
| 2026-04-09 | corvid-agent | Added 7 categories table, updated tool count to 55+, documented CRVLIB library tools, Discord messaging tools, promote_memory, workflow management, credit admin tools, and built-in file/code tools |
| 2026-04-14 | corvid-agent | Update tool count from 55+ to 62 (#2021) |
| 2026-04-16 | corvid-agent | Fix tool count: 62 → 56. Complete enumeration by category (#2020, #2021) |
