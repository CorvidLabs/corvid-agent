export type ClientWsMessage =
    | { type: 'subscribe'; sessionId: string }
    | { type: 'unsubscribe'; sessionId: string }
    | { type: 'send_message'; sessionId: string; content: string }
    | { type: 'chat_send'; agentId: string; content: string; projectId?: string }
    | { type: 'agent_reward'; agentId: string; microAlgos: number }
    | { type: 'agent_invoke'; fromAgentId: string; toAgentId: string; content: string; paymentMicro?: number; projectId?: string }
    | { type: 'approval_response'; requestId: string; behavior: 'allow' | 'deny'; message?: string }
    | { type: 'create_work_task'; agentId: string; description: string; projectId?: string };

export interface StreamEvent {
    eventType: string;
    data: unknown;
    timestamp: string;
}

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
    | { type: 'error'; message: string };

export interface ApprovalRequestWire {
    id: string;
    sessionId: string;
    toolName: string;
    description: string;
    createdAt: number;
    timeoutMs: number;
}
