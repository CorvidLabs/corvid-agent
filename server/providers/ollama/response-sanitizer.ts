/**
 * Output sanitizer for Ollama/local model responses.
 *
 * Less-capable models (especially Nemotron, Qwen) sometimes leak internal
 * context in their responses: thinking tags, context summaries, system prompt
 * fragments, and tool schema echoes. This module strips those artifacts so
 * they don't reach the user or calling agent.
 *
 * @module
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('ResponseSanitizer');

// ─── Patterns to strip from model output ────────────────────────────────

interface OutputRule {
    /** Pattern to detect and strip. */
    pattern: RegExp;
    /** Replacement text (empty string = strip entirely). */
    replacement: string;
    /** Human-readable label for logging. */
    label: string;
}

const OUTPUT_RULES: OutputRule[] = [
    // <think>...</think> blocks (full or partial)
    {
        pattern: /<think>[\s\S]*?<\/think>\s*/g,
        replacement: '',
        label: 'think_block',
    },
    // Orphaned </think> tags (model starts with or emits closing tag without opener)
    {
        pattern: /<\/think>\s*/g,
        replacement: '',
        label: 'orphan_think_close',
    },
    // Unclosed <think> at end of response
    {
        pattern: /\s*<think>[\s\S]*$/,
        replacement: '',
        label: 'unclosed_think',
    },

    // [Context Summary] blocks — context compression artifacts
    {
        pattern: /\[Context Summary\][^\n]*(?:\n|$)/g,
        replacement: '',
        label: 'context_summary',
    },

    // Repeated [Context Summary] Original request: chains
    {
        pattern: /(?:\[Context Summary\]\s*Original request:\s*)+/g,
        replacement: '',
        label: 'context_summary_chain',
    },

    // System reminder tags leaked into output
    {
        pattern: /<system-reminder>[\s\S]*?<\/system-reminder>\s?/g,
        replacement: '',
        label: 'system_reminder',
    },

    // Partial/orphaned system-reminder tags
    {
        pattern: /<\/?system-reminder>\s*/g,
        replacement: '',
        label: 'system_reminder_fragment',
    },

    // "Tools used: N tool calls executed" — internal metadata
    {
        pattern: /Tools used:\s*\d+\s*tool calls?\s*executed\.?\s*/gi,
        replacement: '',
        label: 'tools_metadata',
    },

    // "Last assistant response:" header leaked
    {
        pattern: /Last assistant response:\s*/gi,
        replacement: '',
        label: 'last_response_header',
    },

    // "Follow-up messages: Do not ask what to do" — internal instruction leak
    {
        pattern: /Follow-up messages:\s*Do not ask what to do[^\n]*\n?/gi,
        replacement: '',
        label: 'followup_instruction',
    },

    // Agent metadata lines (e.g., "Condor · nemotron-3-super:cloud · sandbox · sid:...")
    {
        pattern: /^[A-Z][a-z]+\s+·\s+[\w:./-]+\s+·\s+\w+\s+·\s+sid:[a-f0-9-]+\s*$/gm,
        replacement: '',
        label: 'agent_metadata_line',
    },

    // "\[This message came from Discord..." instruction block
    {
        pattern: /\[This message came from (?:Discord|AlgoChat|Telegram)[^\]]*\]\s*/g,
        replacement: '',
        label: 'channel_instruction',
    },

    // "IMPORTANT: After completing your current task..." instruction
    {
        pattern: /IMPORTANT:\s*After completing your current task[^\n]*\n?/gi,
        replacement: '',
        label: 'task_instruction',
    },
];

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Sanitize model output to remove leaked internal context.
 *
 * @param content - Raw model response text
 * @param model - Model name (for logging)
 * @returns Cleaned content string
 */
export function sanitizeModelOutput(content: string, model?: string): string {
    if (!content) return content;

    let cleaned = content;
    const matchedLabels: string[] = [];

    for (const rule of OUTPUT_RULES) {
        // Reset lastIndex for stateful regexes
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(cleaned)) {
            matchedLabels.push(rule.label);
            rule.pattern.lastIndex = 0;
            cleaned = cleaned.replace(rule.pattern, rule.replacement);
        }
    }

    // Collapse excessive blank lines left by stripping
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    if (matchedLabels.length > 0) {
        log.info(`Stripped ${matchedLabels.length} leaked artifact(s) from model output`, {
            model: model ?? 'unknown',
            patterns: matchedLabels,
            originalLength: content.length,
            cleanedLength: cleaned.length,
        });
    }

    return cleaned;
}
