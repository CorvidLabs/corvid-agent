---
module: bash-security
version: 1
status: draft
files:
  - server/lib/bash-security.ts
db_tables: []
depends_on: []
---

# Bash Security

## Purpose

Provides quote-aware tokenization, path extraction, and dangerous-pattern detection for bash commands. Hardens the protected-path enforcement in `run_command` by analyzing commands before execution — identifying file targets and flagging bypass techniques like command substitution, eval wrapping, and heredoc redirection.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `tokenizeBashCommand` | `(command: string)` | `string[]` | Quote-aware bash command tokenizer. Handles single quotes, double quotes, backslash escaping, and shell operators (`\|`, `&&`, `;`, `>`, `<`). Strips quotes from tokens. |
| `extractPathsFromCommand` | `(command: string)` | `string[]` | Extracts candidate file paths from a bash command. Filters out flags, shell operators, and common command names. |
| `detectDangerousPatterns` | `(command: string)` | `DangerousPatternResult` | Detects bash patterns that could bypass path protection: command substitution (`$()`, backticks), variable expansion (`${}`), heredoc redirection, eval/exec, shell -c, command -p, env wrapper bypass, and find with -delete/-exec. |
| `analyzeBashCommand` | `(command: string)` | `BashCommandAnalysis` | Full analysis combining tokenization, path extraction, and dangerous-pattern detection into a single result. |

### Exported Types

| Type | Description |
|------|-------------|
| `DangerousPatternResult` | `{ isDangerous: boolean; reason?: string }` — result of dangerous-pattern detection. |
| `BashCommandAnalysis` | `{ tokens: string[]; paths: string[]; hasDangerousPatterns: boolean; reason?: string }` — full command analysis result. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `EXPANDED_WRITE_OPERATORS` | `RegExp` | Enhanced regex covering write/destructive bash operators: redirects, rm, mv, cp, chmod, sed -i, tee, dd, curl -o, wget, and more. Superset of `BASH_WRITE_OPERATORS` from protected-paths. |

### Exported Classes

(none)

## Invariants

1. Tokenizer handles all three quoting mechanisms: single quotes (no escape inside), double quotes (backslash escaping inside), and bare backslash escaping.
2. Shell operators (`|`, `||`, `&&`, `&`, `;`, `>`, `>>`, `<`, `<<`) are always split into separate tokens.
3. `extractPathsFromCommand` filters out flags (tokens starting with `-`), shell operators, and common command names — remaining tokens are candidate paths.
4. `detectDangerousPatterns` returns on the first match — only one reason is reported per call.
5. `analyzeBashCommand` composes the other three functions but does not add additional logic.

## Behavioral Examples

### Scenario: Quoted path with spaces

- **Given** a command `cat "my file.txt"`
- **When** `tokenizeBashCommand` is called
- **Then** it returns `['cat', 'my file.txt']` (quotes stripped, space preserved)

### Scenario: Command substitution detection

- **Given** a command `echo $(cat /etc/passwd)`
- **When** `detectDangerousPatterns` is called
- **Then** it returns `{ isDangerous: true, reason: 'Contains command substitution: $()' }`

### Scenario: Safe read-only command

- **Given** a command `grep -r "pattern" src/`
- **When** `analyzeBashCommand` is called
- **Then** `hasDangerousPatterns` is `false` and `paths` includes `src/`

### Scenario: Pipe chain with operators

- **Given** a command `cat file.txt | grep error && echo done`
- **When** `tokenizeBashCommand` is called
- **Then** operators `|` and `&&` are separate tokens: `['cat', 'file.txt', '|', 'grep', 'error', '&&', 'echo', 'done']`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty command string | Tokenizer returns empty array; no dangerous patterns detected |
| Unclosed quote | Tokenizer consumes to end of string (no error thrown) |
| Command with only operators | `extractPathsFromCommand` returns empty array |

## Dependencies

### Consumes

(none — leaf module with no imports)

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/protected-paths.ts` | `analyzeBashCommand` for quote-aware tokenization and dangerous-pattern detection |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec (#591) |
