/**
 * Tool call extraction and normalization for Ollama text-based tool calling.
 *
 * Extracted from OllamaProvider to enable direct unit testing. All functions
 * are pure (no class state) — they take tools/toolDefs as explicit parameters.
 */

import type { LlmToolDefinition, LlmToolCall } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('ToolParser');

/**
 * Extract tool calls from content text when models use non-standard formats.
 * Handles:
 * - Pattern 1: Llama3.1's `<|python_tag|>function_name(key="value", ...)` format
 * - Pattern 2: Plain `function_name({...})` JSON-style patterns matching known tool names
 * - Pattern 3: JSON array of tool calls (Mistral format): `[{"name":"tool","arguments":{}}]`
 * - Pattern 4: Python-style `function_name(key="value")` without <|python_tag|> prefix
 */
export function extractToolCallsFromContent(
    content: string,
    tools?: LlmToolDefinition[],
): LlmToolCall[] {
    if (!tools || tools.length === 0) return [];

    const toolNames = new Set(tools.map((t) => t.name));
    const calls: LlmToolCall[] = [];

    // Pattern 1: <|python_tag|>function_name(key="value", key2="value2")
    const pythonTagMatch = content.match(/<\|python_tag\|>\s*([\s\S]*)/);
    if (pythonTagMatch) {
        const body = pythonTagMatch[1].trim();
        // Match function calls: tool_name(args)
        const fnPattern = /(\w+)\s*\(([\s\S]*?)\)/g;
        let match;
        while ((match = fnPattern.exec(body)) !== null) {
            const fnName = match[1];
            const argsStr = match[2].trim();
            if (!toolNames.has(fnName)) continue;

            try {
                const args = parsePythonArgs(argsStr);
                calls.push({
                    id: crypto.randomUUID().slice(0, 8),
                    name: fnName,
                    arguments: args,
                });
            } catch (e) {
                log.warn(`Failed to parse python-style args for ${fnName}: ${argsStr}`);
            }
        }
    }

    // Pattern 2: JSON-style tool calls embedded in text
    // e.g., corvid_list_agents({}) or corvid_save_memory({"key":"val"})
    if (calls.length === 0) {
        for (const toolName of toolNames) {
            const jsonPattern = new RegExp(
                `${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`,
                'g',
            );
            let jMatch;
            while ((jMatch = jsonPattern.exec(content)) !== null) {
                try {
                    const args = JSON.parse(jMatch[1]);
                    calls.push({
                        id: crypto.randomUUID().slice(0, 8),
                        name: toolName,
                        arguments: args,
                    });
                } catch {
                    // Not valid JSON, skip
                }
            }
        }
    }

    // Pattern 3: JSON array of tool calls in content
    // e.g., ```\n[{"name":"tool","arguments":{...}}]\n``` or just [{"name":"tool",...}]
    // Also handles JSON embedded within surrounding text (model may add preamble text)
    if (calls.length === 0) {
        // Strip markdown code fences if present
        const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();

        // Try whole content first, then extract embedded JSON arrays
        const candidates: string[] = [stripped];
        // Extract JSON arrays embedded in text: find [ ... ] containing "name"
        const arrayMatch = stripped.match(/\[\s*\{[\s\S]*?"name"\s*:[\s\S]*?\}\s*\]/g);
        if (arrayMatch) {
            candidates.push(...arrayMatch);
        }
        // Also try single objects: {"name": "tool", "arguments": {...}}
        const objMatch = stripped.match(/\{\s*"name"\s*:\s*"[\w]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g);
        if (objMatch) {
            candidates.push(...objMatch);
        }

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                for (const item of arr) {
                    if (item && typeof item === 'object' && typeof item.name === 'string') {
                        const itemArgs = item.arguments ?? item.parameters ?? {};
                        // Exact match first
                        let resolvedName: string | undefined = toolNames.has(item.name) ? item.name : undefined;
                        let resolvedArgs = itemArgs;

                        // Fuzzy: model may add/remove "corvid_" prefix
                        if (!resolvedName && item.name.startsWith('corvid_')) {
                            const bare = item.name.slice(7);
                            if (toolNames.has(bare)) resolvedName = bare;
                        }
                        if (!resolvedName && toolNames.has(`corvid_${item.name}`)) {
                            resolvedName = `corvid_${item.name}`;
                        }

                        // Rescue: model put an entire command in the "name" field
                        if (!resolvedName && item.name.includes(' ') && toolNames.has('run_command')) {
                            let fullCmd = item.name;
                            const bodyArg = itemArgs.body ?? itemArgs.text ?? itemArgs.content;
                            if (typeof bodyArg === 'string') {
                                fullCmd += ` "${bodyArg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                            }
                            resolvedName = 'run_command';
                            resolvedArgs = { command: fullCmd };
                            log.info(`Rescued command-as-name: "${item.name.slice(0, 60)}..." → run_command`);
                        }

                        // Fuzzy match: model may hallucinate short names like "gh"
                        if (!resolvedName) {
                            resolvedName = fuzzyMatchToolName(item.name, itemArgs, tools);
                        }
                        if (resolvedName) {
                            calls.push({
                                id: crypto.randomUUID().slice(0, 8),
                                name: resolvedName,
                                arguments: resolvedArgs,
                            });
                        }
                    }
                }
                if (calls.length > 0) break; // Found valid tool calls
            } catch {
                // Not valid JSON, try next candidate
            }
        }
    }

    // Pattern 4: Python-style keyword args without <|python_tag|> prefix
    // e.g., corvid_save_memory(key="value", content="data")
    // Llama3.1 sometimes outputs this format directly in content text
    if (calls.length === 0) {
        for (const toolName of toolNames) {
            const pyPattern = new RegExp(
                `${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([\\s\\S]*?)\\)`,
                'g',
            );
            let pyMatch;
            while ((pyMatch = pyPattern.exec(content)) !== null) {
                const argsStr = pyMatch[1].trim();
                // Skip if it looks like JSON (already handled by Pattern 2)
                if (argsStr.startsWith('{')) continue;
                try {
                    const args = parsePythonArgs(argsStr);
                    if (Object.keys(args).length > 0) {
                        calls.push({
                            id: crypto.randomUUID().slice(0, 8),
                            name: toolName,
                            arguments: args,
                        });
                    }
                } catch {
                    // Not parseable, skip
                }
            }
        }
    }

    // Log diagnostic info when no tool calls were extracted from non-trivial content
    if (calls.length === 0 && content.length > 50) {
        log.debug('No tool calls extracted from content', {
            contentPreview: content.slice(0, 300),
            hasCodeFences: content.includes('```'),
            hasBrackets: content.includes('[{'),
            hasPythonTag: content.includes('<|python_tag|>'),
        });
    }

    return calls;
}

/**
 * Parse Python-style keyword arguments: key="value", key2="value2"
 * into a JSON object.
 */
export function parsePythonArgs(argsStr: string): Record<string, unknown> {
    if (!argsStr.trim()) return {};

    // Try parsing as JSON first (some models output JSON in parens)
    try {
        const parsed = JSON.parse(argsStr);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { /* not JSON, continue */ }

    // Parse Python keyword args: key="value", key2=123, key3=true
    const result: Record<string, unknown> = {};
    // Match key=value pairs, handling quoted strings with escaped quotes
    const kwargPattern = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\[[^\]]*\]|\{[^}]*\}|[^,)]+))/g;
    let kwMatch;
    while ((kwMatch = kwargPattern.exec(argsStr)) !== null) {
        const key = kwMatch[1];
        const value = kwMatch[2] ?? kwMatch[3] ?? kwMatch[4]?.trim();
        if (value === undefined) continue;

        // Try to parse as JSON value (numbers, booleans, null)
        if (typeof value === 'string') {
            if (value === 'true') result[key] = true;
            else if (value === 'false') result[key] = false;
            else if (value === 'null' || value === 'None') result[key] = null;
            else if (/^-?\d+(\.\d+)?$/.test(value)) result[key] = Number(value);
            else result[key] = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Strip JSON arrays that look like tool call objects from content text.
 * Uses balanced-bracket counting instead of regex to handle nested braces
 * (e.g., `"arguments": {"command": "ls"}` inside the outer `[...]`).
 */
export function stripJsonToolCallArrays(content: string): string {
    let result = content;
    let searchFrom = 0;
    while (searchFrom < result.length) {
        const start = result.indexOf('[', searchFrom);
        if (start === -1) break;

        const preview = result.slice(start, start + 50);
        if (!/^\[\s*\{\s*"name"\s*:/.test(preview)) {
            searchFrom = start + 1;
            continue;
        }

        // Balanced bracket counting to find matching ]
        let depth = 0;
        let end = -1;
        for (let j = start; j < result.length; j++) {
            if (result[j] === '[') depth++;
            else if (result[j] === ']') {
                depth--;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }

        if (end === -1) break;

        // Verify it's valid JSON before stripping
        try {
            JSON.parse(result.slice(start, end + 1));
            const before = result.slice(0, start).replace(/\s+$/, '');
            const after = result.slice(end + 1).replace(/^\s+/, '');
            result = before + after;
            searchFrom = before.length;
        } catch {
            searchFrom = start + 1;
        }
    }
    return result.trim();
}

/**
 * Fuzzy-match a hallucinated tool name to a real tool.
 * Small models sometimes emit short names like "gh" or "bash" instead of
 * "run_command", or "read" instead of "read_file". We match by checking
 * if the hallucinated name appears in the real tool's name/description,
 * or if the arguments fit a single tool's schema.
 */
export function fuzzyMatchToolName(
    name: string,
    args: Record<string, unknown>,
    tools: LlmToolDefinition[],
): string | undefined {
    const lower = name.toLowerCase();
    const argKeys = Object.keys(args);

    // Skip fuzzy matching for very short names — too likely to false-positive
    if (lower.length < 3) {
        log.warn(`Rejecting fuzzy match for very short tool name "${name}"`);
        return undefined;
    }

    // If args contain "command", it's almost certainly run_command
    if (argKeys.includes('command')) {
        const cmdTool = tools.find(t => t.name === 'run_command');
        if (cmdTool) {
            log.info(`Fuzzy-matched hallucinated tool "${name}" → run_command (has "command" arg)`);
            return cmdTool.name;
        }
    }

    // Check if hallucinated name is a substring of any real tool name
    // Require minimum length of 4 to avoid false positives (e.g. "gh" matching everything)
    for (const tool of tools) {
        const toolLower = tool.name.toLowerCase();
        const minLen = Math.min(toolLower.length, lower.length);
        if (minLen >= 4 && (toolLower.includes(lower) || lower.includes(toolLower))) {
            log.info(`Fuzzy-matched hallucinated tool "${name}" → ${tool.name} (substring match)`);
            return tool.name;
        }
    }

    // Check if the hallucinated name appears in any tool's description
    for (const tool of tools) {
        if (tool.description?.toLowerCase().includes(lower)) {
            log.info(`Fuzzy-matched hallucinated tool "${name}" → ${tool.name} (description match)`);
            return tool.name;
        }
    }

    log.warn(`Could not match hallucinated tool name "${name}" to any known tool`);
    return undefined;
}

/**
 * Normalize tool call arguments to match the expected parameter schema.
 * Text-based tool calling models often guess parameter names (e.g., "file_path"
 * instead of "path"). This maps unrecognized argument keys to the closest
 * matching schema parameter using substring matching.
 */
export function normalizeToolArgs(
    args: Record<string, unknown>,
    toolDef: LlmToolDefinition,
): Record<string, unknown> {
    const schemaProps = toolDef.parameters.properties;
    if (!schemaProps) return args;

    const schemaKeys = new Set(Object.keys(schemaProps));
    const normalized: Record<string, unknown> = {};
    let didNormalize = false;

    for (const [key, value] of Object.entries(args)) {
        if (schemaKeys.has(key)) {
            // Key matches schema exactly
            normalized[key] = value;
        } else {
            // Try to find a matching schema key by substring match
            const lowerKey = key.toLowerCase().replace(/[_-]/g, '');
            let matched = false;
            for (const schemaKey of schemaKeys) {
                const lowerSchema = schemaKey.toLowerCase().replace(/[_-]/g, '');
                if (lowerKey.includes(lowerSchema) || lowerSchema.includes(lowerKey)) {
                    // Don't overwrite if we already have a value for this schema key
                    if (!(schemaKey in normalized)) {
                        normalized[schemaKey] = value;
                        didNormalize = true;
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched) {
                // Keep the original key as fallback
                normalized[key] = value;
            }
        }
    }

    if (didNormalize) {
        log.info(`Normalized tool args for ${toolDef.name}`, {
            original: args,
            normalized,
        });
    }

    return normalized;
}
