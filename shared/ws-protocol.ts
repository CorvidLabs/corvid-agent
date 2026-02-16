export type ClientMessage =
    | { type: 'subscribe'; sessionId: string }
    | { type: 'unsubscribe'; sessionId: string }
    | { type: 'send_message'; sessionId: string; content: string }
    | { type: 'chat_send'; agentId: string; content: string; projectId?: string }
    | { type: 'agent_reward'; agentId: string; microAlgos: number }
    | { type: 'agent_invoke'; fromAgentId: string; toAgentId: string; content: string; paymentMicro?: number; projectId?: string }
    | { type: 'approval_response'; requestId: string; behavior: 'allow' | 'deny'; message?: string }
    | { type: 'create_work_task'; agentId: string; description: string; projectId?: string }
    | { type: 'schedule_approval'; executionId: string; approved: boolean }
    | { type: 'question_response'; questionId: string; answer: string; selectedOption?: number };

export type ServerMessage =
    | { type: 'session_event'; sessionId: string; event: StreamEvent }
    | { type: 'session_status'; sessionId: string; status: string }
    | { type: 'algochat_message'; participant: string; content: string; direction: 'inbound' | 'outbound' | 'status' }
    | { type: 'agent_balance'; agentId: string; balance: number; funded: number }
    | { type: 'chat_stream'; agentId: string; chunk: string; done: boolean }
    | { type: 'chat_tool_use'; agentId: string; toolName: string; input: string }
    | { type: 'chat_thinking'; agentId: string; active: boolean }
    | { type: 'chat_session'; agentId: string; sessionId: string }
    | { type: 'agent_message_update'; message: import('./types').AgentMessage }
    | { type: 'approval_request'; request: { id: string; sessionId: string; toolName: string; description: string; createdAt: number; timeoutMs: number } }
    | { type: 'council_stage_change'; launchId: string; stage: string; sessionIds?: string[] }
    | { type: 'council_log'; log: import('./types').CouncilLaunchLog }
    | { type: 'council_discussion_message'; message: import('./types').CouncilDiscussionMessage }
    | { type: 'work_task_update'; task: import('./types').WorkTask }
    | { type: 'schedule_update'; schedule: import('./types').AgentSchedule }
    | { type: 'schedule_execution_update'; execution: import('./types').ScheduleExecution }
    | { type: 'schedule_approval_request'; executionId: string; scheduleId: string; agentId: string; actionType: string; description: string }
    | { type: 'ollama_pull_progress'; model: string; status: string; progress: number; downloadedBytes: number; totalBytes: number; currentLayer: string; error?: string }
    | { type: 'agent_notification'; agentId: string; sessionId: string; title: string | null; message: string; level: string; timestamp: string }
    | { type: 'agent_question'; question: { id: string; sessionId: string; agentId: string; question: string; options: string[] | null; context: string | null; createdAt: string; timeoutMs: number } }
    | { type: 'error'; message: string };

export interface StreamEvent {
    eventType: string;
    data: unknown;
    timestamp: string;
}

export function isClientMessage(data: unknown): data is ClientMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    if (typeof msg.type !== 'string') return false;

    switch (msg.type) {
        case 'subscribe':
        case 'unsubscribe':
            return typeof msg.sessionId === 'string';
        case 'send_message':
            return typeof msg.sessionId === 'string' && typeof msg.content === 'string';
        case 'chat_send':
            return typeof msg.agentId === 'string' && typeof msg.content === 'string'
                && (msg.projectId === undefined || typeof msg.projectId === 'string');
        case 'agent_reward':
            return typeof msg.agentId === 'string' && typeof msg.microAlgos === 'number';
        case 'agent_invoke':
            return typeof msg.fromAgentId === 'string' && typeof msg.toAgentId === 'string'
                && typeof msg.content === 'string';
        case 'approval_response':
            return typeof msg.requestId === 'string'
                && (msg.behavior === 'allow' || msg.behavior === 'deny');
        case 'create_work_task':
            return typeof msg.agentId === 'string' && typeof msg.description === 'string'
                && (msg.projectId === undefined || typeof msg.projectId === 'string');
        case 'schedule_approval':
            return typeof msg.executionId === 'string' && typeof msg.approved === 'boolean';
        case 'question_response':
            return typeof msg.questionId === 'string' && typeof msg.answer === 'string';
        default:
            return false;
    }
}
