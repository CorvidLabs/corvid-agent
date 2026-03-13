---
module: worktree
version: 1
status: active
files:
  - server/lib/worktree.ts
db_tables: []
depends_on: []
---

# Git Worktree Utilities

## Purpose

Shared git worktree management extracted from `WorkTaskService`. Provides creation, removal, and naming utilities so that both work tasks and chat sessions can create isolated worktrees without duplicating logic. Each worktree gets its own branch, preventing git state collisions across concurrent sessions.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getWorktreeBaseDir` | `(projectWorkingDir: string)` | `string` | Resolves the base directory for worktrees. Uses `WORKTREE_BASE_DIR` env var or defaults to `.corvid-worktrees` sibling directory |
| `createWorktree` | `(options: CreateWorktreeOptions)` | `Promise<CreateWorktreeResult>` | Creates an isolated git worktree with a new branch |
| `removeWorktree` | `(projectWorkingDir: string, worktreeDir: string)` | `Promise<void>` | Removes a git worktree (keeps the branch). Idempotent |
| `generateChatBranchName` | `(agentName: string, sessionId: string)` | `string` | Generates a branch name for chat session worktrees: `chat/{agentSlug}/{sessionIdPrefix}` |

### Exported Types

| Type | Description |
|------|-------------|
| `CreateWorktreeOptions` | Options for worktree creation: `projectWorkingDir`, `branchName`, `worktreeId` |
| `CreateWorktreeResult` | Result of worktree creation: `success`, `worktreeDir`, optional `error` |

## Invariants

1. **Deterministic base dir**: `getWorktreeBaseDir` always returns a path that is a sibling of the project directory (or the override from `WORKTREE_BASE_DIR`)
2. **Worktree isolation**: Each worktree directory is at `{baseDir}/{worktreeId}`, ensuring unique paths per session/task
3. **Branch naming**: Chat branches follow `chat/{agentSlug}/{sessionPrefix}` pattern; work task branches follow `agent/{agentSlug}/{taskSlug}-{timestamp}-{suffix}` (handled by WorkTaskService)
4. **Non-destructive removal**: `removeWorktree` only removes the worktree directory, never the branch (branches are needed for PRs/review)
5. **Idempotent removal**: Calling `removeWorktree` on an already-removed worktree logs a warning but does not throw
6. **Graceful failure**: `createWorktree` returns `{ success: false, error }` on failure rather than throwing

## Behavioral Examples

### Scenario: Creating a chat session worktree

- **Given** a project with `workingDir` at `/app/corvid-agent`
- **When** `createWorktree({ projectWorkingDir: '/app/corvid-agent', branchName: 'chat/corvid/abc123', worktreeId: 'chat-abc123' })` is called
- **Then** a git worktree is created at `{baseDir}/chat-abc123` with branch `chat/corvid/abc123`
- **And** `{ success: true, worktreeDir: '{baseDir}/chat-abc123' }` is returned

### Scenario: Worktree creation fails

- **Given** a project directory that is not a git repository
- **When** `createWorktree(...)` is called
- **Then** `{ success: false, error: '...' }` is returned
- **And** no exception is thrown

### Scenario: Removing a worktree

- **Given** a worktree exists at `/tmp/.corvid-worktrees/chat-abc123`
- **When** `removeWorktree('/app/corvid-agent', '/tmp/.corvid-worktrees/chat-abc123')` is called
- **Then** the worktree directory is removed via `git worktree remove --force`
- **And** the branch is preserved

### Scenario: Branch name generation

- **Given** agent name `"Corvid Agent"` and session ID `"abc123def456-rest"`
- **When** `generateChatBranchName("Corvid Agent", "abc123def456-rest")` is called
- **Then** returns `"chat/corvid-agent/abc123def456"`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Git worktree creation fails (non-zero exit) | Returns `{ success: false, error: stderr }` |
| Git worktree creation throws | Returns `{ success: false, error: message }` |
| Git worktree removal fails | Logs warning, does not throw |
| Git worktree removal throws | Logs warning, does not throw |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | `getWorktreeBaseDir`, `createWorktree`, `removeWorktree` for work task isolation |
| `server/discord/message-handler.ts` | `createWorktree`, `generateChatBranchName` for chat session isolation |
| `server/process/manager.ts` | `removeWorktree` for chat worktree cleanup on session exit |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORKTREE_BASE_DIR` | `{dirname(projectWorkingDir)}/.corvid-worktrees` | Override the base directory for all worktrees |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | corvid-agent | Initial spec — extracted from WorkTaskService |
