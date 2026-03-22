---
module: skill-loader
version: 1
status: draft
files:
  - server/mcp/skill-loader.ts
db_tables: []
depends_on: []
---

# Skills-as-Markdown Loader

## Purpose

Discovers and loads skill files from `.skills/` or `skills/` directories so that AI assistants can auto-discover agent capabilities described in natural language. Each skill is a markdown file with YAML frontmatter for progressive disclosure -- only names and descriptions are loaded at startup, with full bodies loaded on demand.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseSkillFrontmatter` | `(content: string)` | `{ frontmatter: SkillFrontmatter; body: string } \| null` | Parse YAML frontmatter and body from a markdown skill file. Returns null for invalid/missing frontmatter. |
| `discoverSkills` | `(skillsDir: string)` | `SkillEntry[]` | Scan a directory for skill files. Looks for subdirectories with SKILL.md and top-level .md files (excluding README.md). |
| `loadSkillBody` | `(entry: SkillEntry)` | `LoadedSkill \| null` | Load the full markdown body of a skill from disk. |
| `buildSkillDiscoveryPrompt` | `(entries: SkillEntry[])` | `string` | Build a system prompt section listing available skills for AI discovery. Returns empty string for empty input. |
| `discoverProjectSkills` | `(projectRoot: string)` | `SkillEntry[]` | Discover skills from standard locations (.skills/ then skills/) relative to a project root. |

### Exported Types

| Type | Description |
|------|-------------|
| `SkillFrontmatter` | Parsed frontmatter: `{ name: string; description: string; metadata?: Record<string, string> }` |
| `SkillEntry` | Discovered skill: name, description, metadata, and filePath (frontmatter only, no body). |
| `LoadedSkill` | Extends SkillEntry with `body: string` containing the full markdown after frontmatter. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `SKILL_DIRECTORY_NAMES` | `readonly ['.skills', 'skills']` | Directory names searched in order for skills. |

## Invariants

1. `parseSkillFrontmatter` returns null when frontmatter is missing, has no closing `---` delimiter, or lacks `name` or `description` fields.
2. CRLF line endings are normalized to LF before parsing.
3. `discoverSkills` never throws -- filesystem errors are caught and logged as warnings.
4. `discoverSkills` skips README.md files at the top level.
5. `discoverSkills` returns an empty array for non-existent directories.
6. `buildSkillDiscoveryPrompt` returns an empty string when given an empty array.
7. `discoverProjectSkills` checks `.skills/` before `skills/` and returns the first directory with results.
8. Quoted values in frontmatter (single or double quotes) are stripped automatically.

## Behavioral Examples

### Scenario: Parsing a valid skill file
- **Given** a markdown file starting with `---\nname: coding\ndescription: File operations\n---\n# Body`
- **When** `parseSkillFrontmatter` is called with this content
- **Then** it returns `{ frontmatter: { name: 'coding', description: 'File operations' }, body: '# Body' }`.

### Scenario: Discovering skills in subdirectories
- **Given** a `skills/` directory with subdirectories `coding/SKILL.md` and `github/SKILL.md`
- **When** `discoverSkills` is called on the directory
- **Then** it returns two SkillEntry objects with names 'coding' and 'github'.

### Scenario: Building a discovery prompt
- **Given** two skill entries: coding (File ops) and search (Web search)
- **When** `buildSkillDiscoveryPrompt` is called
- **Then** the result contains `## Available Skills`, `**coding**: File ops`, and `**search**: Web search`.

### Scenario: Non-existent skills directory
- **Given** a path that does not exist
- **When** `discoverSkills` is called
- **Then** it returns an empty array without throwing.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Missing frontmatter delimiters | `parseSkillFrontmatter` returns null |
| Missing required `name` field | `parseSkillFrontmatter` returns null |
| Missing required `description` field | `parseSkillFrontmatter` returns null |
| Non-existent skills directory | `discoverSkills` returns `[]` |
| Unreadable file in skills directory | Logged as warning, file skipped |
| `loadSkillBody` on missing file | Returns null, logs warning |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger` for structured logging |
| Node built-ins | `fs` (readFileSync, readdirSync, existsSync, statSync), `path` (join) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/session-config-resolver` | Can use `discoverProjectSkills` + `buildSkillDiscoveryPrompt` to augment system prompts |
| `cli/commands/init` | Uses skill discovery to verify installation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | corvid-agent | Initial spec |
