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

export type ModelFamily = 'llama' | 'qwen2' | 'qwen3' | 'mistral' | 'command-r' | 'hermes' | 'nemotron' | 'phi' | 'gemma' | 'unknown';

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

    return 'unknown';
}

interface ToolSchema {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
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
    const familyPrompt = getFamilySpecificPrompt(family);
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
        const props = (tool.parameters as any)?.properties ?? {};
        const required = (tool.parameters as any)?.required ?? [];
        const params = Object.entries(props).map(([name, schema]: [string, any]) => {
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
- You are providing information that was requested — just provide it as text`;
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

// ── Internal helpers ──────────────────────────────────────────────────────

function getCommonToolInstructions(toolNames: string[]): string {
    const toolList = toolNames.length > 0
        ? `Available tools: ${toolNames.join(', ')}`
        : '';

    return `## Tool Usage Instructions

${toolList}

### Rules for tool calls:
1. When calling a tool, ONLY make the tool call. Do not include narration, explanation, or commentary text alongside the tool call. Either respond with text OR make a tool call, not both.
2. When a task requires multiple steps, complete ALL steps. After receiving each tool result, continue with the next action. Do not stop after a single tool call if more steps are needed.
3. Pass tool arguments as proper JSON objects with the correct parameter names and types.
4. If a tool call fails, read the error message carefully and retry with corrected arguments.
5. Do not invent or hallucinate tool names — only use tools from the available list.`;
}

function getFamilySpecificPrompt(family: ModelFamily): string | null {
    switch (family) {
        case 'llama':
            return `### Llama-specific guidance
- You have native tool calling support. Use the tool call format provided by the system.
- After receiving a tool result, evaluate whether the task is complete. If not, make the next tool call immediately.
- Do NOT narrate what you are about to do before making a tool call. Just make the call directly.
- When you have finished all necessary tool calls and have the information needed, provide your final response as plain text.`;

        case 'qwen2':
            return `### Qwen-specific guidance
- Use the structured tool call format. Do not embed tool calls within markdown code blocks.
- When chaining multiple operations, process each tool result and immediately proceed to the next step.
- Provide your final answer as plain text only after all tool operations are complete.`;

        case 'qwen3':
            return `### Qwen3 Tool Calling Format
- To call a tool, output ONLY a JSON array on its own with this exact format:
[{"name": "tool_name", "arguments": {"param1": "value1"}}]
- Do not wrap tool calls in markdown code blocks or add any surrounding text.
- Output EITHER a tool call OR a text response, never both in the same message.
- When chaining multiple operations, process each tool result and immediately proceed to the next step.
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
        case 'gemma':
        case 'unknown':
        default:
            return null;
    }
}
