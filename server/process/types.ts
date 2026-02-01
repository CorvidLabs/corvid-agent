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
    content_block?: {
        type: string;
        text?: string;
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
