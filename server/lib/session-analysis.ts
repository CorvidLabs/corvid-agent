import type { ClaudeStreamEvent, ContentBlock, AssistantEvent, ContentBlockStartEvent } from '../process/types';
import { extractContentText } from '../process/types';

// ── Heuristic patterns ───────────────────────────────────────────────────

/**
 * Patterns that indicate forward-commitment language: the agent is promising
 * to do something rather than actually doing it.
 */
const FORWARD_COMMIT_PATTERNS: RegExp[] = [
    /\bi'?ll\s+(look\s+into|investigate|check|explore|work\s+on|get\s+started|handle|take\s+care|do\s+that|do\s+this|start|begin|proceed)\b/i,
    /\blet\s+me\s+(look\s+into|investigate|check|explore|get\s+started|work\s+on|start|begin)\b/i,
    /\bi'?m\s+going\s+to\s+(look\s+into|investigate|check|explore|start|begin|work\s+on)\b/i,
    /\bright\s+(away|on\s+it)\b/i,
    /\bon\s+it\b/i,
];

/**
 * Patterns that indicate enthusiasm / positive-acknowledgment language without
 * any substantive content following.
 */
const ENTHUSIASM_PATTERNS: RegExp[] = [
    /\b(great|excellent|perfect|wonderful|fantastic|amazing|brilliant)\s*(idea|plan|point|suggestion|thinking|question|call)?\b/i,
    /\bsounds\s+(good|great|perfect|excellent|wonderful)\b/i,
    /\b(absolutely|certainly|of\s+course|gladly)\b/i,
    /\bhappy\s+to\s+(help|assist|work\s+on|handle|do\s+that)\b/i,
    /\bno\s+problem\b/i,
];

/**
 * Patterns whose presence indicates substantive content — the response is
 * doing real work (explaining, listing, showing code) and should NOT be
 * flagged as cheerleading even without tool calls.
 */
const SUBSTANTIVE_PATTERNS: RegExp[] = [
    /```/,             // code block fence
    /^\s*\d+\.\s+\S/m, // numbered list item
    /^\s*[-*]\s+\S/m,  // bullet list item
    /^\s*#{1,6}\s+\S/m, // markdown heading
];

/** Responses longer than this character count are considered substantive. */
const MAX_CHEERLEADING_LENGTH = 200;

// ── Core detection ───────────────────────────────────────────────────────

/**
 * Returns true if any event in the turn indicates a tool_use block was
 * started (either via content_block_start or embedded in assistant content).
 */
function hasToolUseInTurn(events: ClaudeStreamEvent[]): boolean {
    for (const event of events) {
        // SDK path: explicit content_block_start with type tool_use
        if (event.type === 'content_block_start') {
            const cbs = event as ContentBlockStartEvent;
            if (cbs.content_block?.type === 'tool_use') return true;
        }
        // Direct-process path: tool_use blocks embedded in assistant content
        if (event.type === 'assistant') {
            const ae = event as AssistantEvent;
            const content = ae.message.content;
            if (Array.isArray(content)) {
                const blocks = content as ContentBlock[];
                if (blocks.some((b) => b.type === 'tool_use')) return true;
            }
        }
    }
    return false;
}

/**
 * Extract the text content of the assistant's response from a set of turn events.
 * Prefers the AssistantEvent (full response), falls back to content_block_delta
 * accumulation for SDK streaming paths.
 */
function extractTurnText(events: ClaudeStreamEvent[]): string {
    // Prefer the assistant event (complete response, available in both paths)
    const assistantEvent = events.find((e) => e.type === 'assistant') as AssistantEvent | undefined;
    if (assistantEvent) {
        return extractContentText(assistantEvent.message.content);
    }
    return '';
}

/**
 * Detects whether a set of Claude stream events from a single response turn
 * represents a "cheerleading" response — one that acknowledges or encourages
 * without making any substantive progress.
 *
 * A cheerleading response has ALL of the following:
 * - Zero tool_use events in the turn
 * - Response text shorter than {@link MAX_CHEERLEADING_LENGTH} characters
 * - No markers of substantive content (code blocks, lists, headings)
 * - At least one forward-commitment phrase ("I'll look into that", "On it!", etc.)
 *   OR a combination of enthusiasm + task acknowledgment
 *
 * @param events - All stream events emitted during a single response turn.
 * @returns `true` if the turn looks like cheerleading, `false` otherwise.
 */
export function isCheerleadingResponse(events: ClaudeStreamEvent[]): boolean {
    // Tool calls always indicate real work
    if (hasToolUseInTurn(events)) return false;

    const text = extractTurnText(events);
    if (!text) return false;

    // Responses longer than the threshold are considered substantive
    if (text.length > MAX_CHEERLEADING_LENGTH) return false;

    // Structured content (code, lists, headers) indicates real work
    if (SUBSTANTIVE_PATTERNS.some((p) => p.test(text))) return false;

    // Primary signal: forward-commitment without action
    const hasForwardCommit = FORWARD_COMMIT_PATTERNS.some((p) => p.test(text));
    if (hasForwardCommit) return true;

    // Secondary signal: enthusiasm + very short response (pure filler)
    const hasEnthusiasm = ENTHUSIASM_PATTERNS.some((p) => p.test(text));
    if (hasEnthusiasm && text.length < 80) return true;

    return false;
}

/**
 * Returns the consecutive cheerleading count that should trigger an owner warning.
 * Exposed as a constant so callers and tests share the same threshold.
 */
export const CHEERLEADING_WARNING_THRESHOLD = 2;

// ── Stall detection ───────────────────────────────────────────────────────

/**
 * Minimum response length (in characters) below which a no-tool-call turn
 * is considered a stall, even without cheerleading language patterns.
 */
export const MIN_SUBSTANTIVE_LENGTH = 100;

/**
 * Returns true if a completed response turn is "stalled" — i.e. it made no
 * tool calls and produced no substantive output.
 *
 * A turn is stalled when:
 *   - It matches `isCheerleadingResponse()` (forward-commit without action), OR
 *   - It has no tool calls AND the response text is below {@link MIN_SUBSTANTIVE_LENGTH}
 *
 * Used by OllamaStallEscalator to detect consecutive stalled turns in Ollama
 * sessions and trigger escalation to the task queue.
 *
 * @param events - All stream events emitted during a single response turn.
 * @returns `true` if the turn looks like a stall.
 */
export function isStallTurn(events: ClaudeStreamEvent[]): boolean {
    if (isCheerleadingResponse(events)) return true;
    if (hasToolUseInTurn(events)) return false;
    const text = extractTurnText(events);
    return text.length < MIN_SUBSTANTIVE_LENGTH;
}
