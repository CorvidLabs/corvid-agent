export type ClientWsMessage =
    | { type: 'pong' }
    | { type: 'subscribe'; sessionId: string }
    | { type: 'unsubscribe'; sessionId: string }
    | { type: 'send_message'; sessionId: string; content: string }
    | { type: 'chat_send'; agentId: string; content: string; projectId?: string }
    | { type: 'agent_reward'; agentId: string; microAlgos: number }
    | { type: 'agent_invoke'; fromAgentId: string; toAgentId: string; content: string; paymentMicro?: number; projectId?: string }
    | { type: 'approval_response'; requestId: string; behavior: 'allow' | 'deny'; message?: string }
    | { type: 'create_work_task'; agentId: string; description: string; projectId?: string }
    | { type: 'question_response'; questionId: string; answer: string; selectedOption?: number };

/** Content block type for assistant messages. */
export interface ContentBlock {
    type: string;
    text?: string;
}

/** Base fields present on all ClaudeStreamEvent data payloads. */
interface StreamEventDataBase {
    type: string;
    session_id?: string;
    subtype?: string;
    total_cost_usd?: number;
    num_turns?: number;
    duration_ms?: number;
}

interface StreamEventBase {
    timestamp: string;
}

export type StreamEvent =
    | StreamEventBase & { eventType: 'message_start'; data: StreamEventDataBase & { type: 'message_start'; message?: { role?: string; content?: string | ContentBlock[] } } }
    | StreamEventBase & { eventType: 'message_delta'; data: StreamEventDataBase & { type: 'message_delta'; delta?: { type?: string; text?: string } } }
    | StreamEventBase & { eventType: 'message_stop'; data: StreamEventDataBase & { type: 'message_stop' } }
    | StreamEventBase & { eventType: 'content_block_start'; data: StreamEventDataBase & { type: 'content_block_start'; content_block?: { type: string; text?: string; name?: string; input?: unknown } } }
    | StreamEventBase & { eventType: 'content_block_delta'; data: StreamEventDataBase & { type: 'content_block_delta'; delta?: { type?: string; text?: string } } }
    | StreamEventBase & { eventType: 'content_block_stop'; data: StreamEventDataBase & { type: 'content_block_stop' } }
    | StreamEventBase & { eventType: 'assistant'; data: StreamEventDataBase & { type: 'assistant'; message: { role: 'assistant'; content: string | ContentBlock[] } } }
    | StreamEventBase & { eventType: 'thinking'; data: StreamEventDataBase & { type: 'thinking'; thinking: boolean } }
    | StreamEventBase & { eventType: 'result'; data: StreamEventDataBase & { type: 'result'; result?: string; total_cost_usd: number } }
    | StreamEventBase & { eventType: 'error'; data: StreamEventDataBase & { type: 'error'; error: { message: string; type: string } } }
    | StreamEventBase & { eventType: 'tool_status'; data: StreamEventDataBase & { type: 'tool_status'; statusMessage: string } }
    | StreamEventBase & { eventType: 'system'; data: StreamEventDataBase & { type: 'system'; statusMessage?: string; message?: { content: string } } }
    | StreamEventBase & { eventType: 'approval_request'; data: StreamEventDataBase & { type: 'approval_request'; id: string; sessionId: string; toolName: string; description: string; createdAt: number; timeoutMs: number } }
    | StreamEventBase & { eventType: 'session_started'; data: StreamEventDataBase & { type: 'session_started' } }
    | StreamEventBase & { eventType: 'session_exited'; data: StreamEventDataBase & { type: 'session_exited'; result?: string } }
    | StreamEventBase & { eventType: 'session_stopped'; data: StreamEventDataBase & { type: 'session_stopped' } }
    | StreamEventBase & { eventType: 'session_error'; data: StreamEventDataBase & { type: 'session_error'; error: { message: string; errorType: string; severity: string; recoverable: boolean } } }
    | StreamEventBase & { eventType: 'queue_status'; data: StreamEventDataBase & { type: 'queue_status'; statusMessage: string } }
    | StreamEventBase & { eventType: 'performance'; data: StreamEventDataBase & { type: 'performance'; model: string; tokensPerSecond: number; outputTokens: number; evalDurationMs: number } }
    | StreamEventBase & { eventType: 'raw'; data: StreamEventDataBase & { type: 'raw'; message?: { content: string } } };

/** Convenience type for all known stream event type strings. */
export type StreamEventType = StreamEvent['eventType'];

export type ServerWsMessage =
    | { type: 'session_event'; sessionId: string; event: StreamEvent }
    | { type: 'session_status'; sessionId: string; status: string }
    | { type: 'algochat_message'; participant: string; content: string; direction: 'inbound' | 'outbound' | 'status' }
    | { type: 'agent_balance'; agentId: string; balance: number; funded: number }
    | { type: 'chat_stream'; agentId: string; chunk: string; done: boolean }
    | { type: 'chat_tool_use'; agentId: string; toolName: string; input: string }
    | { type: 'chat_thinking'; agentId: string; active: boolean }
    | { type: 'chat_session'; agentId: string; sessionId: string }
    | { type: 'agent_message_update'; message: import('./agent-message.model').AgentMessage }
    | { type: 'approval_request'; request: ApprovalRequestWire }
    | { type: 'council_stage_change'; launchId: string; stage: string; sessionIds?: string[] }
    | { type: 'council_log'; log: import('./council.model').CouncilLaunchLog }
    | { type: 'council_discussion_message'; message: import('./council.model').CouncilDiscussionMessage }
    | { type: 'work_task_update'; task: import('./work-task.model').WorkTask }
    | { type: 'schedule_update'; schedule: import('./schedule.model').AgentSchedule }
    | { type: 'schedule_execution_update'; execution: import('./schedule.model').ScheduleExecution }
    | { type: 'schedule_approval_request'; executionId: string; scheduleId: string; agentId: string; actionType: string; description: string }
    | { type: 'ollama_pull_progress'; model: string; status: string; progress: number; downloadedBytes: number; totalBytes: number; currentLayer: string; error?: string }
    | { type: 'webhook_update'; registration: import('./webhook.model').WebhookRegistration }
    | { type: 'webhook_delivery'; delivery: import('./webhook.model').WebhookDelivery }
    | { type: 'mention_polling_update'; config: import('./mention-polling.model').MentionPollingConfig }
    | { type: 'workflow_run_update'; run: import('./workflow.model').WorkflowRun }
    | { type: 'workflow_node_update'; nodeExecution: import('./workflow.model').WorkflowNodeRun }
    | { type: 'agent_notification'; agentId: string; sessionId: string; title: string | null; message: string; level: string; timestamp: string }
    | { type: 'agent_question'; question: OwnerQuestionWire }
    | { type: 'ping'; serverTime: string }
    | { type: 'welcome'; serverTime: string }
    | { type: 'error'; message: string };

export interface ApprovalRequestWire {
    id: string;
    sessionId: string;
    toolName: string;
    description: string;
    createdAt: number;
    timeoutMs: number;
}

export interface OwnerQuestionWire {
    id: string;
    sessionId: string;
    agentId: string;
    question: string;
    options: string[] | null;
    context: string | null;
    createdAt: string;
    timeoutMs: number;
}
