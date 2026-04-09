/**
 * Model-family-specific prompt templates for tool usage and response routing.
 *
 * Different model families (llama, qwen, mistral, etc.) have varying levels
 * of tool-calling competence. This module provides tailored instructions that
 * are appended to the system prompt when tools are available, helping the
 * model understand:
 *
 * 1. How to use tools correctly (call format, argument passing)
 * 2. When to respond with text vs. when to use tools
 * 3. How to chain multiple tool calls for multi-step tasks
 * 4. Response routing — when NOT to use corvid_send_message
 */

import type { Project } from '../../../shared/types';
import type { JsonSchemaObject } from '../types';

export type ModelFamily =
  | 'llama'
  | 'qwen2'
  | 'qwen3'
  | 'mistral'
  | 'command-r'
  | 'hermes'
  | 'nemotron'
  | 'phi'
  | 'gemma'
  | 'deepseek'
  | 'minimax'
  | 'glm'
  | 'kimi'
  | 'devstral'
  | 'gemini'
  | 'unknown';

/**
 * Detect model family from a model name string.
 * Matches against known patterns in priority order.
 */
export function detectModelFamily(modelName: string): ModelFamily {
  const lower = modelName.toLowerCase();

  if (lower.includes('qwen3') || lower.includes('qwen-3')) return 'qwen3';
  if (lower.includes('qwen2') || lower.includes('qwen-2') || lower.includes('qwen')) return 'qwen2';
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'mistral';
  if (lower.includes('command-r') || lower.includes('command_r')) return 'command-r';
  if (lower.includes('hermes')) return 'hermes';
  if (lower.includes('nemotron')) return 'nemotron';
  if (lower.includes('phi')) return 'phi';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('minimax')) return 'minimax';
  if (lower.includes('glm')) return 'glm';
  if (lower.includes('kimi')) return 'kimi';
  if (lower.includes('devstral')) return 'devstral';
  if (lower.includes('gemini')) return 'gemini';

  return 'unknown';
}

interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

/**
 * Get the complete tool instruction prompt for a given model family.
 * This should be appended to the system prompt when tools are available.
 *
 * For text-based tool families (e.g., qwen3), includes full parameter schemas
 * so the model outputs correct argument names.
 */
export function getToolInstructionPrompt(family: ModelFamily, toolNames: string[], toolDefs?: ToolSchema[]): string {
  const parts: string[] = [];

  // Common instructions for all model families
  parts.push(getCommonToolInstructions(toolNames));

  // For text-based tool families, include full tool schemas
  // so the model knows exact parameter names
  if (TEXT_BASED_FAMILIES.has(family) && toolDefs && toolDefs.length > 0) {
    parts.push(formatToolSchemas(toolDefs));
  }

  // Family-specific guidance
  const familyPrompt = getFamilySpecificPrompt(family, toolNames);
  if (familyPrompt) {
    parts.push(familyPrompt);
  }

  return parts.join('\n\n');
}

/** Families that use text-based tool calling and need full schemas in prompt. */
const TEXT_BASED_FAMILIES = new Set<ModelFamily>(['qwen3', 'kimi', 'minimax', 'gemini', 'glm', 'devstral', 'nemotron']);

/** Format tool definitions as a compact reference for the system prompt. */
function formatToolSchemas(toolDefs: ToolSchema[]): string {
  const lines = ['### Tool Schemas', 'Use EXACTLY these parameter names when calling tools:'];
  for (const tool of toolDefs) {
    const props = tool.parameters.properties ?? {};
    const required = tool.parameters.required ?? [];
    const params = Object.entries(props).map(([name, schema]) => {
      const req = required.includes(name) ? ' (required)' : '';
      return `  - ${name}: ${schema.type ?? 'string'}${req} — ${schema.description ?? ''}`;
    });
    lines.push(`\n**${tool.name}**: ${tool.description}`);
    if (params.length > 0) {
      lines.push(params.join('\n'));
    }
  }
  return lines.join('\n');
}

/**
 * Get a compact tool instruction prompt for cloud-proxied models.
 * Cloud proxies impose tight server-side timeouts (~90s), so we strip
 * the worked examples and verbose guidance to reduce prompt tokens.
 */
export function getCompactToolInstructionPrompt(
  family: ModelFamily,
  toolNames: string[],
  toolDefs?: ToolSchema[],
): string {
  const parts: string[] = [];
  const toolList = toolNames.length > 0 ? `Available tools: ${toolNames.join(', ')}` : '';

  parts.push(`## Tool Usage
${toolList}

Rules:
1. For questions you can answer directly, respond with plain text. Only use tools when you need to look up data, read files, save memories, or perform actions.
2. Either respond with text OR make a tool call, not both.
3. Complete ALL steps. After each tool result, immediately continue.
4. Pass arguments as proper JSON with correct parameter names.
5. Only use tools from the available list — do NOT invent tool names.
6. NEVER write scripts to send messages — only use MCP tools.`);

  // Text-based families need schemas and JSON format example
  if (TEXT_BASED_FAMILIES.has(family) && toolDefs && toolDefs.length > 0) {
    parts.push(formatToolSchemas(toolDefs));
  }

  // Minimal format guidance for text-based families
  if (TEXT_BASED_FAMILIES.has(family)) {
    const exampleTool = toolNames[0] ?? 'tool_name';
    parts.push(`To call a tool, output ONLY a JSON array:
[{"name": "${exampleTool}", "arguments": {"path": "server/"}}]
No code blocks, no surrounding text.`);
  }

  return parts.join('\n\n');
}

/**
 * Compact versions of supplemental prompts for cloud-proxied models.
 * These preserve the essential rules while cutting prompt length.
 */
export function getCompactResponseRoutingPrompt(): string {
  return `## Response Routing
Reply with text directly — do NOT use corvid_send_message to reply to the sender.
Do NOT use corvid_save_memory to store your reply — write it as plain text output.
Use corvid_send_message ONLY to reach a DIFFERENT agent proactively.
Always respond via the same channel the message came from.
Respond in first person as yourself. Do NOT narrate in third person or describe what "the agent" did.`;
}

export function getCompactCodingToolPrompt(): string {
  return `## Coding Tools
Read files before editing. Use edit_file for targeted changes, write_file for new files. Verify changes after.`;
}

/**
 * Get response routing instructions. These tell the model when to use
 * corvid_send_message vs. simply replying with text.
 */
export function getResponseRoutingPrompt(): string {
  return `## Response Routing

IMPORTANT: When someone sends you a message and you need to reply, just respond with text directly. Do NOT wrap your response in a corvid_send_message tool call back to the sender.

Use corvid_send_message ONLY when:
- You need to proactively reach out to a DIFFERENT agent who did NOT message you
- You need to forward information to a third party
- You are explicitly asked to contact another agent

Do NOT use corvid_send_message when:
- You are replying to someone who just messaged you — just write your response as text
- You are answering a question — just answer directly
- You are providing information that was requested — just provide it as text

Do NOT use corvid_save_memory to store your reply. Your answer must be written as plain text output so the sender can read it. Saving to memory instead of responding with text means the sender gets an empty response.

## Channel Affinity

Always respond via the same channel the message originated from. If a message came from Discord, reply directly so your response goes back to Discord. If a message came from AlgoChat, reply directly so it goes back to AlgoChat. Never use corvid_send_message to "bridge" a reply to a different channel than the one the conversation started on.

Respond in first person as yourself. Do NOT narrate in third person or describe what "the agent" did — you ARE the agent.`;
}

/**
 * Get coding tool usage guidelines. Appended to system prompt when
 * coding tools (read_file, write_file, etc.) are available.
 */
export function getCodingToolPrompt(): string {
  return `## Coding Tool Guidelines
1. Before editing a file, always read it first with read_file.
2. Use list_files to see directory contents and search_files to find code by keyword.
3. Use edit_file for targeted changes (string replacement). Use write_file for new files or complete rewrites.
4. After making changes, run relevant commands to verify (type checking, tests).
5. File paths are relative to the project directory.
6. Some files are protected and cannot be modified.
7. When investigating code, start with list_files to orient, then read_file on specific files. Do NOT try to read the entire project.`;
}

/**
 * Get codebase context prompt. Gives agents basic orientation about the
 * project so they're not dropped in blind. Uses GITHUB_OWNER env var
 * if set, otherwise omits org-specific details.
 */
export function getCodebaseContextPrompt(): string {
  const owner = process.env.GITHUB_OWNER;
  const ownerLine = owner ? `\n- **GitHub owner**: ${owner}` : '';

  return `## Codebase Context

This is a multi-agent AI platform built with TypeScript and Bun.

### Project Structure
- \`server/\` — Backend server code (API routes, providers, database, agent processes)
- \`server/db/\` — SQLite database layer
- \`server/providers/ollama/\` — Ollama provider for local/cloud model integration
- \`server/process/\` — Agent session management (direct-process for Ollama, sdk-process for Claude)
- \`server/mcp/\` — MCP tool server and skill loader
- \`server/routes/\` — API endpoints
- \`client/\` — Frontend dashboard (Angular)
- \`specs/\` — Project specifications

### Key Technologies
- **Runtime**: Bun (not Node.js) — use \`bun\` for all commands, e.g. \`bun x tsc\`, \`bun test\`
- **Language**: TypeScript throughout
- **Database**: SQLite via better-sqlite3${ownerLine}

### Common Tasks
- Type checking: \`bun x tsc --noEmit\`
- Run tests: \`bun test\`
- Spec check: \`bun run spec:check\`
- Start server: \`bun run dev\``;
}

/**
 * Get messaging safety instructions that prevent agents from generating
 * scripts or code to send messages outside of provided MCP tools.
 *
 * NOTE: This prompt is always appended whenever tools are available, regardless
 * of which tools are present or which model family is in use. This is an
 * intentional side effect — callers (sdk-process, direct-process) unconditionally
 * append this to every tool-bearing prompt to enforce the messaging safety invariant.
 */
export function getMessagingSafetyPrompt(): string {
  return `## Messaging Safety

You must ONLY use your provided MCP tools to send messages or communicate through external channels. Specifically:

- NEVER write scripts, shell commands, or code that sends messages, posts to APIs, calls webhooks, or communicates through any protocol (HTTP, SMTP, WebSocket, etc.).
- NEVER use coding tools (write_file, run_command, etc.) to create scripts that send messages on your behalf.
- If you are asked to send a message through a channel for which you have no MCP tool, respond with a clear explanation that you cannot send messages through that channel because no tool is available. Do NOT attempt to work around this limitation.
- This rule applies to ALL channels: Discord, Slack, email, SMS, social media, HTTP endpoints, and any other communication protocol.`;
}

/**
 * Get worktree isolation instructions for chat sessions running in isolated
 * git worktrees. Prevents cross-session contamination by telling the agent
 * to only interact with its own branch.
 */
export function getWorktreeIsolationPrompt(): string {
  return `## Git Branch Isolation

You are running in an isolated git worktree with your own dedicated branch. To prevent cross-session contamination:

- Only commit to and interact with YOUR current branch (check with \`git branch --show-current\`).
- Do NOT checkout, merge from, or push to branches matching \`chat/*\` — those belong to other active sessions.
- Do NOT run \`git branch -a\` or interact with other sessions' branches.
- If you need to reference upstream changes, use \`main\` as your base branch.
- Your worktree is fully isolated — changes you make here do not affect other sessions.`;
}

/**
 * Injects a pinned project context note into the system prompt.
 *
 * When the conversation context window fills and gets compressed, models can
 * lose track of which repository/project they're working on and fall back to
 * their "home" repo (e.g. corvid-agent). This prompt anchors the active project
 * in the system prompt — which is re-injected on every SDK turn — so it
 * survives context compression.
 *
 * See: https://github.com/CorvidLabs/corvid-agent/issues/1628
 */
export function getProjectContextPrompt(project: Project): string {
  const lines: string[] = [
    '## Active Project Context',
    '',
    `You are working on project **${project.name}** in directory \`${project.workingDir}\`.`,
  ];

  if (project.gitUrl) {
    lines.push(`Git remote: \`${project.gitUrl}\``);

    // Extract GitHub owner/repo slug so the agent can use it directly
    const githubMatch = project.gitUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (githubMatch) {
      lines.push(`GitHub repo: \`${githubMatch[1]}\``);
    }
  }

  lines.push(
    '',
    'When performing GitHub or git operations (listing issues, PRs, merging, reviewing, etc.), always use **this project** — not corvid-agent or any other repository.',
    'Do NOT default to a different repo because it happens to be your home project.',
  );

  return lines.join('\n');
}

// ── Internal helpers ──────────────────────────────────────────────────────

function getCommonToolInstructions(toolNames: string[]): string {
  const toolList = toolNames.length > 0 ? `Available tools: ${toolNames.join(', ')}` : '';

  // Build a worked example using actual available tools
  const hasListFiles = toolNames.includes('list_files');
  const hasReadFile = toolNames.includes('read_file');
  const hasRunCommand = toolNames.includes('run_command');
  const workedExample = buildWorkedExample(hasListFiles, hasReadFile, hasRunCommand);

  return `## Tool Usage Instructions

${toolList}

### Rules for tool calls:
1. When calling a tool, ONLY make the tool call. Do not include narration, explanation, or commentary text alongside the tool call. Either respond with text OR make a tool call, not both.
2. When a task requires multiple steps, complete ALL steps. After receiving each tool result, IMMEDIATELY continue with the next action. Do not stop after a single tool call if more steps are needed. You MUST keep going until the task is fully complete.
3. Pass tool arguments as proper JSON objects with the correct parameter names and types.
4. If a tool call fails, read the error message carefully and retry with corrected arguments.
5. Do not invent or hallucinate tool names — only use tools from the available list.
6. Stay focused on the task. Do NOT explore directories or read files unrelated to what you were asked to do.
7. When you receive a tool result, evaluate it and take the next logical action. Do NOT stop to narrate or explain — just call the next tool.
8. NEVER write scripts, code, or shell commands to send messages, post to APIs, or communicate through any channel (Discord, Slack, email, HTTP, webhooks, etc.). You may ONLY send messages using your provided MCP tools (e.g. corvid_send_message). If no tool exists for the target channel or protocol, inform the user that you cannot send messages through that channel — do NOT generate a workaround script.

### Worked Example — Multi-Step Tool Usage

Here is an example of how to correctly chain tool calls to complete a task. Follow this pattern:

${workedExample}

The key pattern: TOOL CALL → receive result → evaluate → NEXT TOOL CALL → ... → FINAL TEXT ANSWER. Never stop in the middle.`;
}

/**
 * Build a worked example using the actual tools available to the agent.
 * This gives models concrete demonstrations rather than abstract rules.
 */
function buildWorkedExample(hasListFiles: boolean, hasReadFile: boolean, hasRunCommand: boolean): string {
  if (hasListFiles && hasReadFile) {
    return `**Task**: "What does the server entry point do?"

**Step 1** — You call: list_files with path "server/"
**Result** — You receive a file listing showing index.ts, routes/, db/, etc.
**Step 2** — You call: read_file with path "server/index.ts"
**Result** — You receive the file contents showing the server setup code.
**Step 3** — You respond with plain text: "The server entry point in server/index.ts sets up the HTTP server, registers routes, and initializes the database connection."

Notice: NO narration between steps. NO "Let me read the file" or "I'll check this". Just tool call → result → next action → final answer.`;
  }
  if (hasRunCommand) {
    return `**Task**: "Check if there are any TypeScript errors"

**Step 1** — You call: run_command with command "bun x tsc --noEmit"
**Result** — You receive compiler output showing 2 errors in server/routes/api.ts
**Step 2** — You respond with plain text: "There are 2 TypeScript errors in server/routes/api.ts: [describe errors]"

Notice: NO narration between steps. Just tool call → result → final answer.`;
  }
  return `**Task**: "What tools do I have?"

**Step 1** — You respond with plain text listing the available tools and what they do.

For multi-step tasks: call a tool → receive result → evaluate → call next tool → ... → final text answer. Never stop in the middle.`;
}

function getFamilySpecificPrompt(family: ModelFamily, toolNames: string[] = []): string | null {
  // Build dynamic few-shot examples using actual available tools
  const hasListFiles = toolNames.includes('list_files');
  const hasReadFile = toolNames.includes('read_file');
  const hasSearchFiles = toolNames.includes('search_files');
  const exampleTool = toolNames[0] ?? 'tool_name';

  // Text-based families need explicit JSON format examples
  const textBasedExample = (toolName: string) => `
**Correct tool call format** (output ONLY this, no other text):
[{"name": "${toolName}", "arguments": {"path": "server/"}}]

**WRONG** (do NOT do these):
- \`\`\`json\\n[{"name": "${toolName}", ...}]\\n\`\`\` ← NO code blocks
- Let me check the files: [{"name": "${toolName}", ...}] ← NO surrounding text
- I'll use the ${toolName} tool to... ← NO narration, just the JSON`;

  // Multi-step example for text-based families
  const textBasedMultiStep =
    hasListFiles && hasReadFile
      ? `
**Example multi-step interaction:**

Turn 1 — You output:
[{"name": "list_files", "arguments": {"path": "server/"}}]

Turn 2 — System provides result. You see index.ts in the listing. You output:
[{"name": "read_file", "arguments": {"path": "server/index.ts"}}]

Turn 3 — System provides file contents. You now have enough info. You output:
"The server entry point initializes the HTTP server and database connection."

Key: Each turn is EITHER a tool call OR text. Never both.`
      : '';

  switch (family) {
    case 'llama':
      return `### Llama-specific guidance
- You have native tool calling support. Use the tool call format provided by the system.
- CRITICAL: After receiving a tool result, you MUST continue working. Evaluate the result and immediately make the next tool call. Do NOT stop after one tool call.
- Do NOT narrate what you are about to do. Do NOT describe your plan. Just make the tool call directly.
- Do NOT ask for permission or confirmation. Take action immediately.
- Do NOT explore the entire project. Only read files directly needed for your specific task.
- When you have finished ALL necessary tool calls and have completed the task, provide your final response as plain text.
- If the task involves creating a PR or making changes, you must actually use the tools to do it — do not just describe what you would do.
- Common mistake: stopping after the first tool call and summarizing. Do NOT do this — keep calling tools until the task is done.`;

    case 'qwen2':
      return `### Qwen-specific guidance
- Use the structured tool call format. Do not embed tool calls within markdown code blocks.
- When chaining multiple operations, process each tool result and immediately proceed to the next step.
- Do NOT narrate or explain between tool calls. Just call the next tool.
- Provide your final answer as plain text only after all tool operations are complete.
- Common mistake: wrapping tool calls in \`\`\`json blocks or adding explanatory text. Do NOT do this.`;

    case 'qwen3':
      return `### Qwen3 Tool Calling Format
${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- To call a tool, output ONLY a JSON array on its own line. Nothing else.
- Do NOT wrap tool calls in markdown code blocks (\`\`\`). Output raw JSON only.
- Do NOT write any text before or after the JSON array. Either output a tool call OR text, never both.
- Use tool names EXACTLY as listed above. Do NOT invent tool names or add prefixes — e.g., use "list_files" not "corvid_list_files". Only corvid_* tools already have that prefix.
- Tool results will be provided inside «tool_output»...«/tool_output» tags. Wait for these before proceeding.
- NEVER generate fake tool results yourself. NEVER write «tool_output» tags. Only the system writes those.
- NEVER pretend a tool was called or fabricate output. If you need information, call the tool.
- When chaining multiple operations, call ONE tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'mistral':
      return `### Mistral-specific guidance
- You support function calling natively. Use the tool call mechanism directly.
- CRITICAL: After each tool result, immediately continue to the next tool call. Do NOT stop to explain.
- For multi-step tasks, continue making tool calls until all steps are complete.
- Do NOT narrate your plan. Do NOT describe what you're about to do. Just call the tool.
- Keep your final text response concise and focused on the result.`;

    case 'command-r':
      return `### Command-R specific guidance
- Use the provided tool definitions for function calling.
- When multiple tool calls are needed, execute them sequentially, processing each result before proceeding.
- Do NOT stop after one tool call if the task requires more investigation.
- Respond with a clear, direct answer after all tool operations complete.`;

    case 'hermes':
      return `### Hermes-specific guidance
- Use the tool calling format as provided. Do NOT wrap tool calls in XML or custom tags.
- Do NOT output <tool_call> or similar XML tags — use the native function calling format.
- Complete all steps of a multi-step task before providing your final response.
- Common mistake: embedding tool calls in XML tags. The system handles tool routing — just output the call.`;

    case 'nemotron':
      return `### Nemotron-specific guidance
${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- For simple questions, respond with plain text only. Do NOT make tool calls for questions you can answer directly.
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks.
- Use the exact tool names from the available tools list. Do NOT invent or shorten tool names.
- CRITICAL: Do NOT stop after one tool call. If the task needs more steps, keep going.
- Do NOT narrate between tool calls. Just call the next tool.
- Provide concise final responses after tool operations complete.
${textBasedMultiStep}`;

    case 'phi':
      return `### Phi-specific guidance
${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Do not narrate your actions. Either call a tool OR provide your final text answer.
- Provide your final answer as plain text only after all tool operations are complete.`;

    case 'gemma':
      return `### Gemma-specific guidance
${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Do not wrap tool calls in code blocks or add surrounding text. Output raw JSON only.
- Provide your final answer as plain text only after all tool operations are complete.`;

    case 'deepseek':
      return `### DeepSeek-specific guidance
${textBasedExample(hasSearchFiles ? 'search_files' : exampleTool)}

- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Call one tool at a time and wait for its result before calling the next.
- Do NOT narrate or explain between tool calls. Just call the next tool directly.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'minimax':
      return `### MiniMax-specific guidance
You are MiniMax M2.5, a large cloud-hosted model with strong reasoning capabilities.

${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks, no narration.
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate it and immediately call the next tool if more steps are needed.
- Call one tool at a time and wait for its result before calling the next.
- Do NOT use shell commands like \`find\` or \`grep\` via run_command when list_files or search_files are available. Use the dedicated tools instead.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'glm':
      return `### GLM-specific guidance
You are GLM-5, a large cloud-hosted model from Zhipu AI.

${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks, no narration.
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate it and immediately call the next tool if needed.
- Do not wrap tool calls in code blocks or add surrounding text. Output raw JSON only.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'kimi':
      return `### Kimi-specific guidance
You are Kimi K2.5, a large cloud-hosted model from Moonshot AI with strong reasoning.

${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks, no narration.
- Use the exact tool names from the available tools list. Do NOT invent tool names or use wrong names.
- CRITICAL: After receiving a tool result, you MUST continue working. Evaluate the result and immediately output the next tool call. Do NOT stop to explain what you found.
- Call one tool at a time and wait for its result before calling the next.
- Do NOT output XML tags like <tool_call> or <function_call>. Just output raw JSON.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'devstral':
      return `### Devstral-specific guidance
You are Devstral, a coding-focused cloud model from Mistral AI optimized for software engineering.

${textBasedExample(hasReadFile ? 'read_file' : exampleTool)}

**Critical rules:**
- You have strong coding capabilities. Use them for file operations and code analysis.
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks.
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate it and continue with the next tool call if needed.
- Leverage your code understanding — when reading files, identify patterns and issues.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;

    case 'gemini':
      return `### Gemini-specific guidance
You are a Gemini model from Google with strong multimodal and reasoning capabilities.

${textBasedExample(hasListFiles ? 'list_files' : exampleTool)}

**Critical rules:**
- Output ONLY the JSON array when calling a tool. No surrounding text, no code blocks.
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate it and continue with the next tool call if needed.
- Call one tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.
${textBasedMultiStep}`;
    default:
      return null;
  }
}
