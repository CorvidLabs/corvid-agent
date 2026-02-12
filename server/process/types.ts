export interface ContentBlock {
    type: string;
    text?: string;
}

export interface ClaudeStreamEvent {
    type: string;
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
