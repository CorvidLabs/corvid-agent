# Plugin System

CorvidAgent has a plugin system that lets you extend the agent with custom tools — without modifying core code. Plugins are npm packages that export tools, which become available to agents during sessions.

## Quick Start

```bash
# Install a plugin
corvid-agent plugin load corvid-plugin-jira

# List loaded plugins
corvid-agent plugin list

# Grant capabilities
corvid-agent plugin grant jira network:outbound

# Unload
corvid-agent plugin unload jira
```

## Writing a Plugin

A plugin is an npm package that exports a `CorvidPlugin` object. Here's a minimal example:

```typescript
// index.ts
import { z } from 'zod';
import type { CorvidPlugin } from 'corvid-agent/plugins';

const plugin: CorvidPlugin = {
    manifest: {
        name: 'hello-world',
        version: '1.0.0',
        description: 'A minimal example plugin',
        author: 'Your Name',
        capabilities: [],
    },
    tools: [
        {
            name: 'greet',
            description: 'Returns a greeting message',
            inputSchema: z.object({
                name: z.string().describe('Name to greet'),
            }),
            handler: async (input) => {
                const { name } = input as { name: string };
                return `Hello, ${name}! This response is from the hello-world plugin.`;
            },
        },
    ],
};

export default plugin;
```

### Plugin Manifest

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (lowercase, hyphens, max 50 chars) |
| `version` | string | Semver version |
| `description` | string | What the plugin does |
| `author` | string | Plugin author |
| `capabilities` | string[] | Required capabilities (see below) |

### Tool Definition

Each tool becomes available to agents as `corvid_plugin_<pluginname>_<toolname>`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tool name (no prefix needed) |
| `description` | string | Shown to agents |
| `inputSchema` | Zod schema | Validates tool input |
| `handler` | function | `(input, context) => Promise<string>` |

The `context` parameter provides:
- `agentId` — which agent called the tool
- `sessionId` — the active session
- `grantedCapabilities` — what this plugin is allowed to do

### Lifecycle Hooks

```typescript
const plugin: CorvidPlugin = {
    manifest: { /* ... */ },
    tools: [ /* ... */ ],

    // Called when plugin is loaded (init connections, caches, etc.)
    async onLoad() {
        console.log('Plugin loaded!');
    },

    // Called when plugin is unloaded (cleanup)
    async onUnload() {
        console.log('Plugin unloaded!');
    },
};
```

## Capabilities

Plugins must declare what they need. Capabilities are granted by an admin via CLI or API.

| Capability | Description |
|------------|-------------|
| `db:read` | Read-only access to the CorvidAgent database |
| `network:outbound` | Make outbound HTTP requests |
| `fs:project-dir` | Read files in the project working directory |
| `agent:read` | Read agent configuration |
| `session:read` | Read session data |

If a plugin tries to use a tool that requires an ungranted capability, the call will fail with a clear error message.

### Granting Capabilities

```bash
# Via CLI
corvid-agent plugin grant my-plugin network:outbound
corvid-agent plugin revoke my-plugin network:outbound

# Via API
curl -X POST http://localhost:3457/api/plugins/my-plugin/grant \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capability": "network:outbound"}'
```

## Plugin Package Structure

```
corvid-plugin-myname/
├── package.json
├── index.ts          # exports default CorvidPlugin
├── tsconfig.json
└── README.md
```

**package.json** must export the plugin:

```json
{
  "name": "corvid-plugin-myname",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins` | List loaded and all plugins |
| POST | `/api/plugins/load` | Load plugin (`{ packageName, autoGrant? }`) |
| POST | `/api/plugins/:name/unload` | Unload a plugin |
| POST | `/api/plugins/:name/grant` | Grant capability (`{ capability }`) |
| POST | `/api/plugins/:name/revoke` | Revoke capability (`{ capability }`) |

### CLI Commands

| Command | Description |
|---------|-------------|
| `corvid-agent plugin list` | List all plugins |
| `corvid-agent plugin load <pkg>` | Load from npm package |
| `corvid-agent plugin unload <name>` | Unload by name |
| `corvid-agent plugin grant <name> <cap>` | Grant capability |
| `corvid-agent plugin revoke <name> <cap>` | Revoke capability |

## Execution Model

- Tool handlers have a **30-second timeout**
- Capabilities are checked before each tool execution
- Tool names are namespaced: `corvid_plugin_<pluginname>_<toolname>`
- Plugin state persists in SQLite across server restarts
- Plugins are loaded from npm — publish to npm or use local paths

## Example: Jira Integration Plugin

```typescript
import { z } from 'zod';
import type { CorvidPlugin } from 'corvid-agent/plugins';

const plugin: CorvidPlugin = {
    manifest: {
        name: 'jira',
        version: '1.0.0',
        description: 'Create and query Jira issues',
        author: 'CorvidLabs',
        capabilities: ['network:outbound'],
    },
    tools: [
        {
            name: 'search_issues',
            description: 'Search Jira issues with JQL',
            inputSchema: z.object({
                jql: z.string().describe('JQL query string'),
                maxResults: z.number().optional().default(10),
            }),
            handler: async (input) => {
                const { jql, maxResults } = input as { jql: string; maxResults: number };
                const resp = await fetch(`${process.env.JIRA_URL}/rest/api/3/search`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${btoa(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`)}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ jql, maxResults }),
                });
                const data = await resp.json();
                return JSON.stringify(data.issues?.map((i: any) => ({
                    key: i.key,
                    summary: i.fields.summary,
                    status: i.fields.status.name,
                })) ?? []);
            },
        },
        {
            name: 'create_issue',
            description: 'Create a new Jira issue',
            inputSchema: z.object({
                project: z.string().describe('Project key (e.g. CORVID)'),
                summary: z.string().describe('Issue title'),
                description: z.string().optional().describe('Issue body'),
                issueType: z.string().optional().default('Task'),
            }),
            handler: async (input) => {
                const { project, summary, description, issueType } = input as any;
                const resp = await fetch(`${process.env.JIRA_URL}/rest/api/3/issue`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${btoa(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`)}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        fields: {
                            project: { key: project },
                            summary,
                            description: description ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] } : undefined,
                            issuetype: { name: issueType },
                        },
                    }),
                });
                const data = await resp.json();
                return `Created ${data.key}: ${summary}`;
            },
        },
    ],
};

export default plugin;
```
