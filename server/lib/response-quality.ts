/**
 * Response quality scoring — detects "cheerleading" responses that sound
 * productive but contain zero actionable content.
 *
 * Provides heuristic scoring for both text responses and tool calls,
 * tracking consecutive low-quality outputs to trigger corrective nudges.
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/1021
 */

// ── Signals ──────────────────────────────────────────────────────────────

/** Patterns that indicate cheerleading / filler text. */
const CHEERLEADING_PHRASES = [
    /\bgreat (idea|question|point)\b/i,
    /\b(i'?m|that'?s|this is) (really |so )?(excited|thrilled|happy|glad)\b/i,
    /\bthis is going to be (amazing|great|awesome|fantastic)\b/i,
    /\babsolutely[!.]/i,
    /\blet'?s (do this|get started|dive in|make it happen)\b/i,
    /\bsounds? (great|perfect|wonderful|excellent|awesome)\b/i,
    /\b(fantastic|wonderful|brilliant|excellent) (idea|plan|approach)\b/i,
    /\bI'?d (love|be happy|be glad) to help\b/i,
];

/** Patterns indicating restating the user's prompt. */
const RESTATEMENT_PHRASES = [
    /\byou('d| would) like (me to|us to)\b/i,
    /\byou('ve| have) asked (me |us )?(to|about|for)\b/i,
    /\byour (request|task|question) (is|was|involves)\b/i,
    /\bas you (mentioned|described|requested|asked)\b/i,
];

// ── Types ────────────────────────────────────────────────────────────────

export interface ResponseQualityScore {
    /** 0.0 (pure cheerleading) to 1.0 (highly substantive). */
    score: number;
    /** Signals that contributed to the score. */
    signals: QualitySignal[];
}

export type QualitySignal =
    | 'cheerleading_phrases'
    | 'high_exclamation_ratio'
    | 'no_code_blocks'
    | 'no_file_references'
    | 'no_concrete_references'
    | 'restatement'
    | 'has_code_blocks'
    | 'has_file_references'
    | 'has_concrete_references'
    | 'has_action_items'
    | 'has_tool_calls'
    | 'empty_tool_content'
    | 'vacuous_workflow_update';

export interface ToolCallQualityInput {
    name: string;
    arguments: Record<string, unknown>;
}

// ── Scoring ──────────────────────────────────────────────────────────────

/**
 * Score the quality of a text response from the model.
 * @param text The model's text response content.
 * @param hasToolCalls Whether the response also included tool calls.
 * @returns Quality score with contributing signals.
 */
export function scoreResponseQuality(
    text: string,
    hasToolCalls: boolean,
): ResponseQualityScore {
    const signals: QualitySignal[] = [];
    let positiveWeight = 0;
    let negativeWeight = 0;

    if (!text || text.trim().length === 0) {
        // Empty text with tool calls is fine — model is just acting
        if (hasToolCalls) {
            return { score: 1.0, signals: ['has_tool_calls'] };
        }
        return { score: 0.0, signals: [] };
    }

    const trimmed = text.trim();

    // ── Negative signals ──

    // Cheerleading phrases
    const cheerCount = CHEERLEADING_PHRASES.filter(p => p.test(trimmed)).length;
    if (cheerCount >= 2) {
        signals.push('cheerleading_phrases');
        negativeWeight += 0.3;
    } else if (cheerCount === 1) {
        signals.push('cheerleading_phrases');
        negativeWeight += 0.15;
    }

    // High exclamation ratio
    const exclamationCount = (trimmed.match(/!/g) || []).length;
    const sentenceCount = Math.max(1, (trimmed.match(/[.!?]+/g) || []).length);
    if (exclamationCount / sentenceCount > 0.5 && exclamationCount >= 3) {
        signals.push('high_exclamation_ratio');
        negativeWeight += 0.15;
    }

    // No code blocks
    const hasCodeBlocks = /```[\s\S]*?```/.test(trimmed) || /`[^`]+`/.test(trimmed);
    if (!hasCodeBlocks) {
        signals.push('no_code_blocks');
        negativeWeight += 0.1;
    }

    // No file references (paths like foo/bar.ts or ./something)
    const hasFileRefs = /(?:\/[\w.-]+){2,}|\.\/[\w.-]+|[\w-]+\.(?:ts|js|py|rs|go|json|yaml|yml|toml|md|sql)\b/.test(trimmed);
    if (!hasFileRefs) {
        signals.push('no_file_references');
        negativeWeight += 0.1;
    }

    // No concrete references (function names, line numbers, specific identifiers)
    const hasConcreteRefs = /\b(?:function|class|const|let|var|def|fn|func|type|interface)\s+\w+/.test(trimmed)
        || /\bline\s+\d+/i.test(trimmed)
        || /\b[A-Z][a-zA-Z]+(?:Service|Manager|Handler|Controller|Router|Module)\b/.test(trimmed);
    if (!hasConcreteRefs) {
        signals.push('no_concrete_references');
        negativeWeight += 0.1;
    }

    // Restatement of user's prompt
    const restatementCount = RESTATEMENT_PHRASES.filter(p => p.test(trimmed)).length;
    if (restatementCount >= 2) {
        signals.push('restatement');
        negativeWeight += 0.2;
    }

    // ── Positive signals ──

    if (hasToolCalls) {
        signals.push('has_tool_calls');
        positiveWeight += 0.5;
    }

    if (hasCodeBlocks) {
        signals.push('has_code_blocks');
        positiveWeight += 0.25;
    }

    if (hasFileRefs) {
        signals.push('has_file_references');
        positiveWeight += 0.2;
    }

    if (hasConcreteRefs) {
        signals.push('has_concrete_references');
        positiveWeight += 0.15;
    }

    // Action items (numbered lists, bullet points with verbs)
    const hasActionItems = /^\s*(?:\d+[.)]\s|-\s\[[ x]\])/m.test(trimmed);
    if (hasActionItems) {
        signals.push('has_action_items');
        positiveWeight += 0.1;
    }

    // Calculate final score
    const raw = 0.5 + positiveWeight - negativeWeight;
    const score = Math.max(0, Math.min(1, raw));

    return { score: parseFloat(score.toFixed(2)), signals };
}

// ── Tool call quality ────────────────────────────────────────────────────

/** Tool calls considered semantically empty when their content is trivial. */
const VACUOUS_WORKFLOW_PATTERNS = [
    /^(in progress|working on it|started|continuing|processing)$/i,
    /^(checking|looking|analyzing|reviewing)\.{0,3}$/i,
    /^(done|complete|finished|ready)\.?$/i,
];

/**
 * Detect semantically empty or vacuous tool calls.
 * @param toolCalls Array of tool calls from the model response.
 * @returns Number of vacuous tool calls detected.
 */
export function countVacuousToolCalls(toolCalls: ToolCallQualityInput[]): number {
    let vacuousCount = 0;
    for (const tc of toolCalls) {
        if (isVacuousToolCall(tc)) {
            vacuousCount++;
        }
    }
    return vacuousCount;
}

function isVacuousToolCall(tc: ToolCallQualityInput): boolean {
    const args = tc.arguments;

    // save_memory with no meaningful content
    if (tc.name === 'save_memory' || tc.name === 'corvid_save_memory') {
        const content = String(args.content || args.value || args.text || '').trim();
        if (content.length < 10) return true;
    }

    // corvid_manage_workflow with status-only updates
    if (tc.name === 'corvid_manage_workflow') {
        const status = String(args.status || '').trim();
        const notes = String(args.notes || args.description || '').trim();
        // Status update with trivial notes
        if (status && VACUOUS_WORKFLOW_PATTERNS.some(p => p.test(notes))) return true;
        if (status && notes.length < 15 && !args.result) return true;
    }

    return false;
}

// ── Repetitive tool call detection ────────────────────────────────────────

/** Default number of identical tool calls before flagging a loop. */
const REPETITIVE_TOOL_CALL_THRESHOLD = 3;

/**
 * Detects when a model repeatedly calls the same tool with identical arguments,
 * indicating it's stuck in a loop rather than making progress.
 */
export class RepetitiveToolCallDetector {
    private readonly threshold: number;
    /** Sliding window of recent tool call fingerprints. */
    private readonly recentCalls: string[] = [];
    /** Maximum window size — only the most recent N calls are tracked. */
    private readonly windowSize: number;
    private _loopDetected = false;
    private _totalLoopsDetected = 0;

    constructor(threshold = REPETITIVE_TOOL_CALL_THRESHOLD, windowSize = 10) {
        this.threshold = threshold;
        this.windowSize = windowSize;
    }

    /**
     * Record a batch of tool calls from a single model turn.
     * @returns true if a repetitive loop is detected.
     */
    recordToolCalls(toolCalls: ToolCallQualityInput[]): boolean {
        for (const tc of toolCalls) {
            const fingerprint = this.fingerprint(tc);
            this.recentCalls.push(fingerprint);
        }

        // Trim to window size
        while (this.recentCalls.length > this.windowSize) {
            this.recentCalls.shift();
        }

        // Check if the last N calls are identical
        if (this.recentCalls.length >= this.threshold) {
            const tail = this.recentCalls.slice(-this.threshold);
            const allSame = tail.every((fp) => fp === tail[0]);
            if (allSame) {
                this._loopDetected = true;
                this._totalLoopsDetected++;
                return true;
            }
        }

        this._loopDetected = false;
        return false;
    }

    /** Whether the most recent check detected a loop. */
    get loopDetected(): boolean {
        return this._loopDetected;
    }

    /** Total number of loop detections during this session. */
    get totalLoopsDetected(): number {
        return this._totalLoopsDetected;
    }

    /** Reset state (e.g. after a corrective nudge breaks the loop). */
    reset(): void {
        this.recentCalls.length = 0;
        this._loopDetected = false;
    }

    /**
     * Create a stable fingerprint for a tool call.
     * Uses tool name + sorted JSON of arguments for deterministic comparison.
     */
    private fingerprint(tc: ToolCallQualityInput): string {
        const sortedArgs = JSON.stringify(tc.arguments, Object.keys(tc.arguments).sort());
        return `${tc.name}::${sortedArgs}`;
    }
}

/**
 * Build a corrective nudge for repetitive tool call loops.
 */
export function buildLoopNudge(toolName: string): string {
    return `STOP. You are calling \`${toolName}\` repeatedly with the same arguments. `
        + 'This is not making progress. Try a DIFFERENT approach: '
        + 'use a different tool, change the arguments, or report what you found so far.';
}

// ── Consecutive tracking ─────────────────────────────────────────────────

/** Quality threshold below which a response is considered low-quality. */
const LOW_QUALITY_THRESHOLD = 0.35;

/** Number of consecutive low-quality responses before injecting a nudge. */
const CONSECUTIVE_LOW_QUALITY_TRIGGER = 2;

/**
 * Tracker for consecutive low-quality responses within a session.
 * Maintains state across iterations of the tool-use loop.
 */
export class ResponseQualityTracker {
    private consecutiveLowQuality = 0;
    private totalLowQuality = 0;
    private totalVacuousToolCalls = 0;
    private qualityNudgeCount = 0;
    private _nudgesExhausted = false;
    private readonly threshold: number;
    private readonly trigger: number;

    constructor(
        threshold = LOW_QUALITY_THRESHOLD,
        trigger = CONSECUTIVE_LOW_QUALITY_TRIGGER,
    ) {
        this.threshold = threshold;
        this.trigger = trigger;
    }

    /**
     * Record a response quality assessment.
     * @returns true if a corrective nudge should be injected.
     */
    recordResponse(score: ResponseQualityScore): boolean {
        if (score.score < this.threshold) {
            this.consecutiveLowQuality++;
            this.totalLowQuality++;
            return this.consecutiveLowQuality >= this.trigger;
        }
        this.consecutiveLowQuality = 0;
        return false;
    }

    /** Record vacuous tool calls from an iteration. */
    recordVacuousToolCalls(count: number): void {
        this.totalVacuousToolCalls += count;
    }

    /** Increment the quality nudge counter and return the new count. */
    incrementNudgeCount(): number {
        return ++this.qualityNudgeCount;
    }

    /**
     * Signal that all nudges have been used without quality improvement.
     * Call this when nudge limit is reached and response quality is still low.
     */
    markNudgesExhausted(): void {
        this._nudgesExhausted = true;
    }

    /**
     * Whether nudges have been exhausted without improvement.
     * Callers can use this to trigger escalation (e.g. to the stall escalator).
     */
    get nudgesExhausted(): boolean {
        return this._nudgesExhausted;
    }

    /** Get metrics for inclusion in session metrics. */
    getMetrics(): ResponseQualityMetrics {
        return {
            totalLowQualityResponses: this.totalLowQuality,
            totalVacuousToolCalls: this.totalVacuousToolCalls,
            qualityNudgeCount: this.qualityNudgeCount,
            nudgesExhausted: this._nudgesExhausted,
        };
    }
}

export interface ResponseQualityMetrics {
    totalLowQualityResponses: number;
    totalVacuousToolCalls: number;
    qualityNudgeCount: number;
    nudgesExhausted: boolean;
}

// ── Repetition tracking ───────────────────────────────────────────────────

import { isRepetitiveResponse, REPETITION_WINDOW } from './session-analysis';

/** Number of consecutive repetitive responses before breaking the loop. */
export const REPETITION_BREAK_THRESHOLD = 3;

/**
 * Tracks recent response texts and detects repetitive output loops.
 * Designed for Ollama sessions where the model rephrases the same content
 * each turn without making forward progress.
 */
export class RepetitionTracker {
    private readonly recentTexts: string[] = [];
    private consecutiveRepetitions = 0;
    private totalRepetitions = 0;
    private readonly window: number;
    private readonly breakThreshold: number;

    constructor(window = REPETITION_WINDOW, breakThreshold = REPETITION_BREAK_THRESHOLD) {
        this.window = window;
        this.breakThreshold = breakThreshold;
    }

    /**
     * Record a response and check for repetition.
     * @param text The model's response text.
     * @returns `'nudge'` if a repetition nudge should be injected,
     *          `'break'` if the loop should be terminated,
     *          `null` if the response is not repetitive.
     */
    recordResponse(text: string): 'nudge' | 'break' | null {
        const trimmed = (text || '').trim();

        if (trimmed.length > 0 && isRepetitiveResponse(trimmed, this.recentTexts)) {
            this.consecutiveRepetitions++;
            this.totalRepetitions++;

            // Add to history after comparison
            this.recentTexts.unshift(trimmed);
            if (this.recentTexts.length > this.window) this.recentTexts.pop();

            if (this.consecutiveRepetitions >= this.breakThreshold) {
                return 'break';
            }
            return 'nudge';
        }

        // Not repetitive — reset consecutive counter, add to history
        this.consecutiveRepetitions = 0;
        this.recentTexts.unshift(trimmed);
        if (this.recentTexts.length > this.window) this.recentTexts.pop();
        return null;
    }

    /** Get metrics for session telemetry. */
    getMetrics(): { consecutiveRepetitions: number; totalRepetitions: number } {
        return {
            consecutiveRepetitions: this.consecutiveRepetitions,
            totalRepetitions: this.totalRepetitions,
        };
    }
}

// ── Nudge message ────────────────────────────────────────────────────────

/**
 * Build a corrective nudge message for low-quality responses.
 */
export function buildQualityNudge(): string {
    return 'STOP. You are producing filler text, not results. '
        + 'Read the original task and execute the next concrete step. '
        + 'Do NOT restate the task. Do NOT write encouragement. '
        + 'Call a tool or write specific code/analysis now.';
}

/**
 * Build a stronger corrective nudge for repetitive responses.
 * Used when the model keeps rephrasing the same content across turns.
 */
export function buildRepetitionNudge(): string {
    return 'CRITICAL: You are repeating yourself. Your last several responses say the same thing in different words. '
        + 'This is NOT progress. STOP rephrasing and take a DIFFERENT action: '
        + '1. If you are stuck, call a tool to gather new information. '
        + '2. If you lack a tool, say exactly what you cannot do and why. '
        + '3. Do NOT restate your previous response in any form.';
}
