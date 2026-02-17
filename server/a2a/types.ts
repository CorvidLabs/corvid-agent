/**
 * A2A (Agent-to-Agent) protocol types for inbound task handling.
 */

export type A2ATaskState = 'submitted' | 'working' | 'completed' | 'failed';

export interface A2AMessage {
    role: 'user' | 'agent';
    parts: Array<{ type: 'text'; text: string }>;
}

export interface A2ATask {
    id: string;
    state: A2ATaskState;
    messages: A2AMessage[];
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface A2ATaskSendRequest {
    method: 'tasks/send';
    params: {
        message: string;
        skill?: string;
        timeoutMs?: number;
    };
}
