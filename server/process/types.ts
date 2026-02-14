export interface ContentBlock {
    type: string;
    text?: string;
}

// ── Base interface ──────────────────────────────────────────────────────
// Common optional fields present on the base so consumers can access
// `event.total_cost_usd` etc. without narrowing first. The discriminant
// `type` field is refined in each variant for switch/case narrowing.

interface BaseStreamEvent {
    session_id?: string;
    subtype?: string;
    /** Cost fields — present on result/session_exited events. */
    total_cost_usd?: number;
    num_turns?: number;
    duration_ms?: number;
}

// ── Discriminated union event types ─────────────────────────────────────
// Each variant carries only the fields relevant to that event type,
// enabling exhaustive switch/case handling at compile time.

/** SDK message lifecycle events */
export interface MessageStartEvent extends BaseStreamEvent {
    type: 'message_start';
    message?: { role?: string; content?: string | ContentBlock[] };
}

export interface MessageDeltaEvent extends BaseStreamEvent {
    type: 'message_delta';
    delta?: { type?: string; text?: string };
}

export interface MessageStopEvent extends BaseStreamEvent {
    type: 'message_stop';
}

/** Content block streaming events */
export interface ContentBlockStartEvent extends BaseStreamEvent {
    type: 'content_block_start';
    content_block?: { type: string; text?: string; name?: string; input?: unknown };
}

export interface ContentBlockDeltaEvent extends BaseStreamEvent {
    type: 'content_block_delta';
    delta?: { type?: string; text?: string };
}

export interface ContentBlockStopEvent extends BaseStreamEvent {
    type: 'content_block_stop';
}

/** Assistant message with content blocks */
export interface AssistantEvent extends BaseStreamEvent {
    type: 'assistant';
    message: { role: 'assistant'; content: string | ContentBlock[] };
}

/** Thinking / heartbeat indicator */
export interface ThinkingEvent extends BaseStreamEvent {
    type: 'thinking';
    thinking: boolean;
}

/** Session completed successfully */
export interface ResultEvent extends BaseStreamEvent {
    type: 'result';
    result?: string;
    total_cost_usd: number;
}

/** Error occurred */
export interface ErrorEvent extends BaseStreamEvent {
    type: 'error';
    error: { message: string; type: string };
}

/** Tool execution status update (synthetic) */
export interface ToolStatusEvent extends BaseStreamEvent {
    type: 'tool_status';
    statusMessage: string;
}

/** System notification (synthetic) */
export interface SystemEvent extends BaseStreamEvent {
    type: 'system';
    statusMessage?: string;
    message?: { content: string };
}

/** Approval request for tool execution (synthetic) */
export interface ApprovalRequestEvent extends BaseStreamEvent {
    type: 'approval_request';
    id: string;
    sessionId: string;
    toolName: string;
    description: string;
    createdAt: number;
    timeoutMs: number;
}

/** Session started (synthetic, emitted by ProcessManager) */
export interface SessionStartedEvent extends BaseStreamEvent {
    type: 'session_started';
}

/** Session exited (process ended) */
export interface SessionExitedEvent extends BaseStreamEvent {
    type: 'session_exited';
    result?: string;
}

/** Session stopped by user/system */
export interface SessionStoppedEvent extends BaseStreamEvent {
    type: 'session_stopped';
}

/** Queue status for inference slot waiting (direct-process) */
export interface QueueStatusEvent extends BaseStreamEvent {
    type: 'queue_status';
    statusMessage: string;
}

/** Performance metrics from inference (direct-process) */
export interface PerformanceEvent extends BaseStreamEvent {
    type: 'performance';
    model: string;
    tokensPerSecond: number;
    outputTokens: number;
    evalDurationMs: number;
}

/** Raw SDK event passthrough */
export interface RawStreamEvent extends BaseStreamEvent {
    type: 'raw';
    message?: { content: string };
}

/**
 * Discriminated union of all Claude stream event types.
 *
 * Use `event.type` to narrow to a specific variant:
 * ```ts
 * switch (event.type) {
 *     case 'result': event.total_cost_usd; // number (required)
 *     case 'error':  event.error.message;  // string
 *     case 'assistant': event.message;     // { role, content }
 * }
 * ```
 *
 * Common fields like `total_cost_usd`, `num_turns`, `duration_ms` are
 * available on all variants as optional — narrowing to `ResultEvent`
 * makes `total_cost_usd` required.
 */
export type ClaudeStreamEvent =
    | MessageStartEvent
    | MessageDeltaEvent
    | MessageStopEvent
    | ContentBlockStartEvent
    | ContentBlockDeltaEvent
    | ContentBlockStopEvent
    | AssistantEvent
    | ThinkingEvent
    | ResultEvent
    | ErrorEvent
    | ToolStatusEvent
    | SystemEvent
    | ApprovalRequestEvent
    | SessionStartedEvent
    | SessionExitedEvent
    | SessionStoppedEvent
    | QueueStatusEvent
    | PerformanceEvent
    | RawStreamEvent;

/**
 * Known event type string literals — useful for type assertions and
 * runtime checks where a union of literal types is needed.
 */
export type ClaudeStreamEventType = ClaudeStreamEvent['type'];

export interface ClaudeInputMessage {
    type: 'user';
    message: {
        role: 'user';
        content: string;
    };
}

export function extractContentText(content: string | ContentBlock[] | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('');
}

export interface ProcessInfo {
    sessionId: string;
    pid: number;
    proc: ReturnType<typeof Bun.spawn>;
    subscribers: Set<(event: ClaudeStreamEvent) => void>;
}

// ── Type guard functions (with type predicates) ─────────────────────────

export function isResultEvent(e: ClaudeStreamEvent): e is ResultEvent {
    return e.type === 'result';
}

export function isErrorEvent(e: ClaudeStreamEvent): e is ErrorEvent {
    return e.type === 'error';
}

export function isApprovalEvent(e: ClaudeStreamEvent): e is ApprovalRequestEvent {
    return e.type === 'approval_request';
}

export function isSessionEndEvent(e: ClaudeStreamEvent): e is SessionExitedEvent | SessionStoppedEvent {
    return e.type === 'session_exited' || e.type === 'session_stopped';
}
