---
name: coding
description: Use this skill when you need to read, write, edit, or search files, run shell commands, or list directory contents. These are the core file operation and command execution tools. Triggers include any coding task, file manipulation, running tests, building, or executing commands.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Coding — File Operations & Commands

Core tools for reading, writing, editing, and searching files, plus running shell commands.

## MCP Tools

- `read_file` — Read file contents with line numbers
  - Parameters: `path` (file path), `offset` (optional, start line), `limit` (optional, max lines)
- `write_file` — Create or overwrite a file
  - Parameters: `path` (file path), `content` (file contents)
- `edit_file` — Edit a file by replacing an exact string match
  - Parameters: `path` (file path), `old_string` (text to find), `new_string` (replacement text)
- `run_command` — Execute a shell command in the project directory
  - Parameters: `command` (shell command), `timeout` (optional, 30-120s)
- `list_files` — List files in a directory or matching a glob pattern
  - Parameters: `path` (directory or glob pattern)
- `search_files` — Search for a text pattern across files using grep
  - Parameters: `pattern` (regex pattern), `path` (optional, directory to search), `include` (optional, file glob filter)

## Rules

- Always read a file before editing it — use `read_file` to understand context first
- Use `edit_file` for targeted modifications; use `write_file` only for new files or complete rewrites
- Verify changes by reading the result after editing
- Run tests and validation after making code changes
- Command timeout defaults to 30s, max 120s
- Commands run in the project root directory
