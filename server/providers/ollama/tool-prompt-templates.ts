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

import type { JsonSchemaObject } from '../types';

export type ModelFamily = 'llama' | 'qwen2' | 'qwen3' | 'mistral' | 'command-r' | 'hermes' | 'nemotron' | 'phi' | 'gemma' | 'deepseek' | 'minimax' | 'glm' | 'kimi' | 'devstral' | 'gemini' | 'unknown';

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
export function getToolInstructionPrompt(
    family: ModelFamily,
    toolNames: string[],
    toolDefs?: ToolSchema[],
): string {
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
const TEXT_BASED_FAMILIES = new Set<ModelFamily>(['qwen3']);

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

## Channel Affinity

Always respond via the same channel the message originated from. If a message came from Discord, reply directly so your response goes back to Discord. If a message came from AlgoChat, reply directly so it goes back to AlgoChat. Never use corvid_send_message to "bridge" a reply to a different channel than the one the conversation started on.`;
}

/**
 * Get coding tool usage guidelines. Appended to system prompt when
 * coding tools (read_file, write_file, etc.) are available.
 */
export function getCodingToolPrompt(): string {
    return `## Coding Tool Guidelines
1. Before editing a file, always read it first.
2. Use list_files and search_files to explore before making changes.
3. Use edit_file for targeted changes (string replacement). Use write_file for new files or complete rewrites.
4. After making changes, run relevant commands to verify (type checking, tests).
5. File paths are relative to the project directory.
6. Some files are protected and cannot be modified.`;
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

// ── Internal helpers ──────────────────────────────────────────────────────

function getCommonToolInstructions(toolNames: string[]): string {
    const toolList = toolNames.length > 0
        ? `Available tools: ${toolNames.join(', ')}`
        : '';

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
8. NEVER write scripts, code, or shell commands to send messages, post to APIs, or communicate through any channel (Discord, Slack, email, HTTP, webhooks, etc.). You may ONLY send messages using your provided MCP tools (e.g. corvid_send_message). If no tool exists for the target channel or protocol, inform the user that you cannot send messages through that channel — do NOT generate a workaround script.`;
}

function getFamilySpecificPrompt(family: ModelFamily, toolNames: string[] = []): string | null {
    // Build a dynamic few-shot example using the first available tool
    const exampleTool = toolNames[0] ?? 'tool_name';

    switch (family) {
        case 'llama':
            return `### Llama-specific guidance
- You have native tool calling support. Use the tool call format provided by the system.
- CRITICAL: After receiving a tool result, you MUST continue working. Evaluate the result and immediately make the next tool call. Do NOT stop after one tool call.
- Do NOT narrate what you are about to do. Do NOT describe your plan. Just make the tool call directly.
- Do NOT ask for permission or confirmation. Take action immediately.
- Do NOT explore the entire project. Only read files directly needed for your specific task.
- When you have finished ALL necessary tool calls and have completed the task, provide your final response as plain text.
- If the task involves creating a PR or making changes, you must actually use the tools to do it — do not just describe what you would do.`;

        case 'qwen2':
            return `### Qwen-specific guidance
- Use the structured tool call format. Do not embed tool calls within markdown code blocks.
- When chaining multiple operations, process each tool result and immediately proceed to the next step.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'qwen3':
            return `### Qwen3 Tool Calling Format
- To call a tool, output ONLY a JSON array on its own with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Do NOT wrap tool calls in markdown code blocks (\`\`\`). Output raw JSON only.
- Do NOT write any text before or after the JSON array. Either output a tool call OR text, never both.
- CRITICAL: Use tool names EXACTLY as listed above. Do NOT invent tool names or add prefixes — e.g., use "list_files" not "corvid_list_files". Only corvid_* tools already have that prefix.
- Tool results will be provided inside «tool_output»...«/tool_output» tags. Wait for these before proceeding.
- NEVER generate fake tool results yourself. NEVER write «tool_output» tags. Only the system writes those.
- NEVER pretend a tool was called or fabricate output. If you need information, call the tool.
- When chaining multiple operations, call ONE tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'mistral':
            return `### Mistral-specific guidance
- You support function calling natively. Use the tool call mechanism directly.
- For multi-step tasks, continue making tool calls until all steps are complete.
- Keep your final text response concise and focused on the result.`;

        case 'command-r':
            return `### Command-R specific guidance
- Use the provided tool definitions for function calling.
- When multiple tool calls are needed, execute them sequentially, processing each result before proceeding.
- Respond with a clear, direct answer after all tool operations complete.`;

        case 'hermes':
            return `### Hermes-specific guidance
- Use the tool calling format as provided. Do not wrap tool calls in XML or custom tags.
- Complete all steps of a multi-step task before providing your final response.`;

        case 'nemotron':
            return `### Nemotron-specific guidance
- Use the native tool calling format. Process results and continue with follow-up calls as needed.
- Provide concise final responses after tool operations complete.`;

        case 'phi':
            return `### Phi-specific guidance
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Do not narrate your actions. Either call a tool OR provide your final text answer.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'gemma':
            return `### Gemma-specific guidance
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Do not wrap tool calls in code blocks or add surrounding text. Output raw JSON only.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'deepseek':
            return `### DeepSeek-specific guidance
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Call one tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'minimax':
            return `### MiniMax-specific guidance
- You are MiniMax M2.5, a large cloud-hosted model. Use the native tool calling format.
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Call one tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'glm':
            return `### GLM-specific guidance
- You are GLM-5, a large cloud-hosted model from Zhipu AI. Use the native tool calling format.
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Do not wrap tool calls in code blocks or add surrounding text. Output raw JSON only.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'kimi':
            return `### Kimi-specific guidance
- You are Kimi K2.5, a large cloud-hosted model from Moonshot AI. Use the native tool calling format.
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- CRITICAL: After receiving a tool result, you MUST continue working. Evaluate the result and immediately make the next tool call.
- Call one tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'devstral':
            return `### Devstral-specific guidance
- You are Devstral, a coding-focused cloud model from Mistral AI. Use the native tool calling format.
- You have strong coding capabilities. Use them for file operations and code analysis.
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'gemini':
            return `### Gemini-specific guidance
- You are a Gemini model from Google. Use the native tool calling format.
- To call a tool, output a JSON array with this exact format:
[{"name": "${exampleTool}", "arguments": {"param1": "value1"}}]
- Use the exact tool names from the available tools list. Do not invent tool names.
- After receiving a tool result, evaluate the result and continue with the next tool call if needed.
- Call one tool at a time and wait for its result before calling the next.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'unknown':
        default:
            return null;
    }
}
