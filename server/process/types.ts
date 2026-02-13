export interface ContentBlock {
    type: string;
    text?: string;
}

/**
 * Known Claude stream event types.
 * The `(string & {})` at the end allows unknown event types from the SDK
 * without breaking existing `event.type === 'result'` checks.
 */
export type ClaudeStreamEventType =
    | 'message_start' | 'message_delta' | 'message_stop'
    | 'content_block_start' | 'content_block_delta' | 'content_block_stop'
    | 'assistant' | 'thinking'
    | 'result' | 'error'
    | 'tool_status' | 'system'
    | 'approval_request'
    | 'session_exited' | 'session_stopped'
    | (string & {});

export interface ClaudeStreamEvent {
    type: ClaudeStreamEventType;
    subtype?: string;
    session_id?: string;
    message?: {
        role?: string;
        content?: string | ContentBlock[];
    };
    /** Plain-string notification for synthetic events (type: 'tool_status' | 'system'). */
    statusMessage?: string;
    content_block?: {
        type: string;
        text?: string;
        name?: string;
        input?: unknown;
    };
    delta?: {
        type?: string;
        text?: string;
    };
    // Result fields live at the top level of the event
    result?: string;
    total_cost_usd?: number;
    duration_ms?: number;
    num_turns?: number;
    error?: {
        message: string;
        type: string;
    };
    // Synthetic event fields — used by ProcessManager and direct processes
    // for custom events emitted through the same event bus.

    /** Approval request fields (type: 'approval_request') */
    id?: string;
    sessionId?: string;
    toolName?: string;
    description?: string;
    createdAt?: number;
    timeoutMs?: number;
}

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

// ── Type guard functions ────────────────────────────────────────────────

export function isResultEvent(e: ClaudeStreamEvent): boolean {
    return e.type === 'result';
}

export function isErrorEvent(e: ClaudeStreamEvent): boolean {
    return e.type === 'error';
}

export function isApprovalEvent(e: ClaudeStreamEvent): boolean {
    return e.type === 'approval_request';
}

export function isSessionEndEvent(e: ClaudeStreamEvent): boolean {
    return e.type === 'session_exited' || e.type === 'session_stopped';
}
