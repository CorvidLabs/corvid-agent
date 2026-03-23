---
module: worktree
version: 2
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
| `removeWorktree` | `(projectWorkingDir: string, worktreeDir: string, options?: RemoveWorktreeOptions)` | `Promise<void>` | Removes a git worktree. With `cleanBranch: true`, auto-deletes branches with zero commits ahead of main. Idempotent |
| `generateChatBranchName` | `(agentName: string, sessionId: string)` | `string` | Generates a branch name for chat session worktrees: `chat/{agentSlug}/{sessionIdPrefix}` |
| `resolveAndCreateWorktree` | `(project: Project, agentName: string, sessionId: string)` | `Promise<ResolveAndCreateWorktreeResult>` | Resolves project dir (handling clone_on_demand/ephemeral) then creates a worktree. Ensures repo is cloned before worktree creation |

### Exported Types

| Type | Description |
|------|-------------|
| `CreateWorktreeOptions` | Options for worktree creation: `projectWorkingDir`, `branchName`, `worktreeId` |
| `CreateWorktreeResult` | Result of worktree creation: `success`, `worktreeDir`, optional `error` |
| `RemoveWorktreeOptions` | Options for worktree removal: `cleanBranch` (auto-delete empty branches) |
| `ResolveAndCreateWorktreeResult` | Result of resolve+create: `success`, optional `workDir`, optional `error` |

## Invariants

1. **Deterministic base dir**: `getWorktreeBaseDir` always returns a path that is a sibling of the project directory (or the override from `WORKTREE_BASE_DIR`)
2. **Worktree isolation**: Each worktree directory is at `{baseDir}/{worktreeId}`, ensuring unique paths per session/task
3. **Branch naming**: Chat branches follow `chat/{agentSlug}/{sessionPrefix}` pattern; work task branches follow `agent/{agentSlug}/{taskSlug}-{timestamp}-{suffix}` (handled by WorkTaskService)
4. **Smart branch cleanup**: `removeWorktree` with `cleanBranch: true` deletes branches with zero commits ahead of main; branches with actual commits are preserved for PRs/review. Without the option, branches are always kept
5. **Idempotent removal**: Calling `removeWorktree` on an already-removed worktree logs a warning but does not throw
6. **Graceful failure**: `createWorktree` returns `{ success: false, error }` on failure rather than throwing
7. **Mandatory isolation**: All session creation paths (Discord mention, /session command, AlgoChat) MUST fail the session if worktree creation fails, rather than silently falling through to the shared main working directory. No isolation = no session.
8. **Branch isolation prompt**: Sessions running in worktrees receive a `## Git Branch Isolation` system prompt section instructing the agent to only interact with its own branch and ignore other `chat/*` branches

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

### Scenario: Session creation aborts on worktree failure

- **Given** a project with `workingDir` configured
- **When** a Discord mention, /session command, or AlgoChat message triggers session creation
- **And** `createWorktree(...)` returns `{ success: false }`
- **Then** the session is NOT created
- **And** an error message is sent back to the user explaining the failure
- **And** the function returns early (no fallback to main working directory)

### Scenario: Agent receives branch isolation instructions

- **Given** a session running in an isolated worktree (`session.workDir` is set)
- **When** the session's system prompt is built
- **Then** a `## Git Branch Isolation` section is appended instructing the agent to only interact with its own branch and ignore `chat/*` branches from other sessions

### Scenario: Removing a worktree (default — keep branch)

- **Given** a worktree exists at `/tmp/.corvid-worktrees/chat-abc123`
- **When** `removeWorktree('/app/corvid-agent', '/tmp/.corvid-worktrees/chat-abc123')` is called
- **Then** the worktree directory is removed via `git worktree remove --force`
- **And** the branch is preserved

### Scenario: Removing a worktree with cleanBranch (no commits)

- **Given** a worktree exists with branch `chat/corvid/abc123` that has zero commits ahead of main
- **When** `removeWorktree(projectDir, worktreeDir, { cleanBranch: true })` is called
- **Then** the worktree directory is removed
- **And** the branch is deleted via `git branch -D`

### Scenario: Removing a worktree with cleanBranch (has commits)

- **Given** a worktree exists with branch `chat/corvid/abc123` that has 3 commits ahead of main
- **When** `removeWorktree(projectDir, worktreeDir, { cleanBranch: true })` is called
- **Then** the worktree directory is removed
- **And** the branch is preserved (needed for PRs/review)

### Scenario: Creating a worktree for a clone_on_demand project

- **Given** a project with `dirStrategy: 'clone_on_demand'` and `gitUrl` set but no local clone
- **When** `resolveAndCreateWorktree(project, 'corvid', sessionId)` is called
- **Then** the repo is first cloned via `resolveProjectDir`
- **And** a worktree is created from the cloned directory
- **And** `{ success: true, workDir: '{worktreeDir}' }` is returned

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
| `server/lib/project-dir.ts` | `resolveProjectDir` for clone_on_demand/ephemeral directory resolution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | `getWorktreeBaseDir`, `createWorktree`, `removeWorktree` for work task isolation |
| `server/discord/message-handler.ts` | `resolveAndCreateWorktree` for chat session isolation |
| `server/discord/command-handlers/session-commands.ts` | `resolveAndCreateWorktree` for slash-command chat session isolation |
| `server/algochat/message-router.ts` | `resolveAndCreateWorktree`, `generateChatBranchName` for AlgoChat session isolation |
| `server/process/manager.ts` | `removeWorktree` (with `cleanBranch: true`) for chat worktree cleanup on session exit |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORKTREE_BASE_DIR` | `{dirname(projectWorkingDir)}/.corvid-worktrees` | Override the base directory for all worktrees |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Added `resolveAndCreateWorktree` — resolves project dir before worktree creation, fixing ENOENT for clone_on_demand projects |
| 2026-03-18 | corvid-agent | Mandatory worktree isolation (invariants #7-#8); branch isolation prompt; session fails on worktree error |
| 2026-03-15 | corvid-agent | Added `RemoveWorktreeOptions` / `cleanBranch` for smart branch cleanup; AlgoChat consumer |
| 2026-03-12 | corvid-agent | Initial spec — extracted from WorkTaskService |
