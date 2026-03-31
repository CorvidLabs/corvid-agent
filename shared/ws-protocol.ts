import type { AgentMessage } from './types/algochat';
import type { CouncilDiscussionMessage, CouncilLaunchLog } from './types/councils';
import type { AgentSchedule, ScheduleExecution } from './types/schedules';
import type { MentionPollingConfig, WebhookDelivery, WebhookRegistration } from './types/webhooks';
import type { WorkTask } from './types/work-tasks';
import type { WorkflowNodeRun, WorkflowRun } from './types/workflows';

// ── Client → Server messages ─────────────────────────────────────────

export type ClientMessage =
    | { type: 'auth'; key: string }
    | { type: 'pong' }
    | { type: 'subscribe'; sessionId: string }
    | { type: 'unsubscribe'; sessionId: string }
    | { type: 'send_message'; sessionId: string; content: string }
    | { type: 'chat_send'; agentId: string; content: string; projectId?: string; tools?: string[] }
    | { type: 'agent_reward'; agentId: string; microAlgos: number }
    | { type: 'agent_invoke'; fromAgentId: string; toAgentId: string; content: string; paymentMicro?: number; projectId?: string }
    | { type: 'approval_response'; requestId: string; behavior: 'allow' | 'deny'; message?: string }
    | { type: 'create_work_task'; agentId: string; description: string; projectId?: string }
    | { type: 'schedule_approval'; executionId: string; approved: boolean }
    | { type: 'question_response'; questionId: string; answer: string; selectedOption?: number };

/** Alias for Angular client compatibility. */
export type ClientWsMessage = ClientMessage;

// ── Server → Client messages ─────────────────────────────────────────
// Each variant is exported as a named interface so consumers can import
// individual event shapes and the compiler can narrow on `type`.

export interface SessionEventMessage { type: 'session_event'; sessionId: string; event: StreamEvent }
export interface SessionStatusMessage { type: 'session_status'; sessionId: string; status: string }
export interface AlgochatMessageEvent { type: 'algochat_message'; participant: string; content: string; direction: 'inbound' | 'outbound' | 'status' }
export interface AgentBalanceMessage { type: 'agent_balance'; agentId: string; balance: number; funded: number }
export interface ChatStreamMessage { type: 'chat_stream'; agentId: string; chunk: string; done: boolean }
export interface ChatToolUseMessage { type: 'chat_tool_use'; agentId: string; toolName: string; input: string }
export interface ChatThinkingMessage { type: 'chat_thinking'; agentId: string; active: boolean }
export interface ChatSessionMessage { type: 'chat_session'; agentId: string; sessionId: string }
export interface AgentMessageUpdateEvent { type: 'agent_message_update'; message: AgentMessage }
export interface ApprovalRequestMessage { type: 'approval_request'; request: ApprovalRequestWire }
export interface CouncilStageChangeMessage { type: 'council_stage_change'; launchId: string; stage: string; sessionIds?: string[] }
export interface CouncilLogMessage { type: 'council_log'; log: CouncilLaunchLog }
export interface CouncilDiscussionMessageEvent { type: 'council_discussion_message'; message: CouncilDiscussionMessage }
export interface WorkTaskUpdateMessage { type: 'work_task_update'; task: WorkTask }
export interface WorkTaskQueueUpdateMessage { type: 'work_task_queue_update'; tasks: Array<{ id: string; position: number; projectId: string }> }
export interface ScheduleUpdateMessage { type: 'schedule_update'; schedule: AgentSchedule }
export interface ScheduleExecutionUpdateMessage { type: 'schedule_execution_update'; execution: ScheduleExecution }
export interface ScheduleApprovalRequestMessage { type: 'schedule_approval_request'; executionId: string; scheduleId: string; agentId: string; actionType: string; description: string }
export interface OllamaPullProgressMessage { type: 'ollama_pull_progress'; model: string; status: string; progress: number; downloadedBytes: number; totalBytes: number; currentLayer: string; error?: string }
export interface WebhookUpdateMessage { type: 'webhook_update'; registration: WebhookRegistration }
export interface WebhookDeliveryMessage { type: 'webhook_delivery'; delivery: WebhookDelivery }
export interface MentionPollingUpdateMessage { type: 'mention_polling_update'; config: MentionPollingConfig }
export interface WorkflowRunUpdateMessage { type: 'workflow_run_update'; run: WorkflowRun }
export interface WorkflowNodeUpdateMessage { type: 'workflow_node_update'; nodeExecution: WorkflowNodeRun }
export interface AgentNotificationMessage { type: 'agent_notification'; agentId: string; sessionId: string; title: string | null; message: string; level: string; timestamp: string }
export interface AgentQuestionMessage { type: 'agent_question'; question: OwnerQuestionWire }
export interface GovernanceVoteCastMessage { type: 'governance_vote_cast'; launchId: string; agentId: string; vote: 'approve' | 'reject' | 'abstain'; weight: number; weightedApprovalRatio: number; totalVotesCast: number; totalMembers: number }
export interface GovernanceVoteResolvedMessage { type: 'governance_vote_resolved'; launchId: string; status: 'approved' | 'rejected' | 'awaiting_human'; weightedApprovalRatio: number; effectiveThreshold: number; reason: string }
export interface GovernanceQuorumReachedMessage { type: 'governance_quorum_reached'; launchId: string; weightedApprovalRatio: number; threshold: number }
export interface PingMessage { type: 'ping'; serverTime: string }
export interface WelcomeMessage { type: 'welcome'; serverTime: string }
export interface ErrorMessage { type: 'error'; message: string; severity?: ErrorSeverity; errorCode?: string }
export interface ServerShutdownMessage { type: 'server_shutdown'; signal: string; activeSessions: number; message: string }
export interface SessionErrorMessage { type: 'session_error'; sessionId: string; error: SessionErrorInfo }
export interface CouncilAgentErrorMessage { type: 'council_agent_error'; launchId: string; agentId: string; agentName: string; error: CouncilAgentErrorInfo }

/** Union of all server → client WebSocket messages. */
export type ServerMessage =
    | SessionEventMessage
    | SessionStatusMessage
    | AlgochatMessageEvent
    | AgentBalanceMessage
    | ChatStreamMessage
    | ChatToolUseMessage
    | ChatThinkingMessage
    | ChatSessionMessage
    | AgentMessageUpdateEvent
    | ApprovalRequestMessage
    | CouncilStageChangeMessage
    | CouncilLogMessage
    | CouncilDiscussionMessageEvent
    | WorkTaskUpdateMessage
    | WorkTaskQueueUpdateMessage
    | ScheduleUpdateMessage
    | ScheduleExecutionUpdateMessage
    | ScheduleApprovalRequestMessage
    | OllamaPullProgressMessage
    | WebhookUpdateMessage
    | WebhookDeliveryMessage
    | MentionPollingUpdateMessage
    | WorkflowRunUpdateMessage
    | WorkflowNodeUpdateMessage
    | AgentNotificationMessage
    | AgentQuestionMessage
    | GovernanceVoteCastMessage
    | GovernanceVoteResolvedMessage
    | GovernanceQuorumReachedMessage
    | PingMessage
    | WelcomeMessage
    | ErrorMessage
    | ServerShutdownMessage
    | SessionErrorMessage
    | CouncilAgentErrorMessage;

/** Alias for Angular client compatibility. */
export type ServerWsMessage = ServerMessage;

// ── Utility types ────────────────────────────────────────────────────

/** Extract the `type` discriminant from the ServerMessage union. */
export type ServerMessageType = ServerMessage['type'];

/** Extract a specific ServerMessage variant by its `type` discriminant. */
export type ServerMessageOfType<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

/** Typed handler map — one optional callback per server message type. */
export type ServerMessageHandlerMap = {
    [K in ServerMessageType]?: (msg: ServerMessageOfType<K>) => void;
};

// ── Wire types (shared between server and client) ────────────────────

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

// ── Error types ──────────────────────────────────────────────────────

/** Error severity level for structured WebSocket error messages. */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

/** Structured error info for session failure recovery events. */
export interface SessionErrorInfo {
    message: string;
    errorType: 'spawn_error' | 'credits_exhausted' | 'context_exhausted' | 'timeout' | 'crash' | 'unknown';
    severity: ErrorSeverity;
    recoverable: boolean;
    sessionStatus?: string;
}

/** Structured error info for council agent failure events. */
export interface CouncilAgentErrorInfo {
    message: string;
    errorType: 'spawn_error' | 'timeout' | 'crash' | 'unknown';
    severity: ErrorSeverity;
    stage: string;
    sessionId?: string;
    round?: number;
}

// ── StreamEvent: discriminated union for WebSocket session events ─────
// Each variant is keyed on `eventType` and carries a typed `data` field
// matching the corresponding ClaudeStreamEvent payload from server/process/types.ts.
// The JSON wire format is unchanged — only TypeScript types get tighter.

/** Content block type shared between server and client. */
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

// ── Type guard ───────────────────────────────────────────────────────

export function isClientMessage(data: unknown): data is ClientMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    if (typeof msg.type !== 'string') return false;

    switch (msg.type) {
        case 'auth':
            return typeof msg.key === 'string';
        case 'subscribe':
        case 'unsubscribe':
            return typeof msg.sessionId === 'string';
        case 'send_message':
            return typeof msg.sessionId === 'string' && typeof msg.content === 'string';
        case 'chat_send':
            return typeof msg.agentId === 'string' && typeof msg.content === 'string'
                && (msg.projectId === undefined || typeof msg.projectId === 'string')
                && (msg.tools === undefined || Array.isArray(msg.tools));
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
        case 'pong':
            return true;
        case 'question_response':
            return typeof msg.questionId === 'string' && typeof msg.answer === 'string';
        default:
            return false;
    }
}
