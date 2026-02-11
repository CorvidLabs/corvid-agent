import type { SessionSource } from '../../shared/types';

export interface ApprovalRequest {
    id: string;
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    description: string;
    createdAt: number;
    timeoutMs: number;
    source: SessionSource;
}

export interface ApprovalResponse {
    requestId: string;
    behavior: 'allow' | 'deny';
    message?: string;
    updatedInput?: Record<string, unknown>;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResponse>;

/** Subset of ApprovalRequest safe to send over the wire (no toolInput). */
export interface ApprovalRequestWire {
    id: string;
    sessionId: string;
    toolName: string;
    description: string;
    createdAt: number;
    timeoutMs: number;
}

export function formatToolDescription(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
        case 'Bash':
            return `Run command: ${String(input.command ?? '').slice(0, 400)}`;
        case 'Write':
        case 'FileWrite':
            return `Write file: ${String(input.file_path ?? '')}`;
        case 'Edit':
        case 'FileEdit':
            return `Edit file: ${String(input.file_path ?? '')}`;
        case 'WebFetch':
            return `Fetch URL: ${String(input.url ?? '')}`;
        case 'WebSearch':
            return `Web search: ${String(input.query ?? '')}`;
        case 'read_file':
            return `Read file: ${String(input.path ?? '')}`;
        case 'write_file':
            return `Write file: ${String(input.path ?? '')}`;
        case 'edit_file':
            return `Edit file: ${String(input.path ?? '')}`;
        case 'run_command':
            return `Run command: ${String(input.command ?? '').slice(0, 400)}`;
        case 'list_files':
            return `List files: ${String(input.path ?? '.')}`;
        case 'search_files':
            return `Search: ${String(input.pattern ?? '')}`;
        default:
            return `Use tool: ${toolName}`;
    }
}
