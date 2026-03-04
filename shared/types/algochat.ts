export interface AlgoChatConversation {
    id: string;
    participantAddr: string;
    agentId: string | null;
    sessionId: string | null;
    lastRound: number;
    createdAt: string;
}

export type AlgoChatNetwork = 'localnet' | 'testnet' | 'mainnet';

export interface AlgoChatStatus {
    enabled: boolean;
    address: string | null;
    network: AlgoChatNetwork;
    syncInterval: number;
    activeConversations: number;
    balance: number;
}

export type AgentMessageStatus = 'pending' | 'sent' | 'processing' | 'completed' | 'failed';

/**
 * Structured error codes for agent message delivery failures.
 * Used to categorize failure reasons for programmatic handling.
 */
export type MessageErrorCode =
    | 'DELIVERY_FAILED'       // Generic delivery failure
    | 'SPENDING_LIMIT'        // Daily ALGO spending limit exceeded
    | 'AGENT_NOT_FOUND'       // Target or source agent not found
    | 'SELF_INVOKE'           // Agent tried to invoke itself
    | 'NO_WALLET'             // Agent has no wallet configured
    | 'CHAIN_ERROR'           // On-chain transaction failed
    | 'EMPTY_RESPONSE'        // Agent session produced no response
    | 'RESPONSE_SEND_FAILED'  // On-chain response delivery failed
    | 'WORK_TASK_ERROR'       // Work task creation failed
    | 'CIRCUIT_OPEN'          // Circuit breaker open for target agent
    | 'RATE_LIMITED';         // Per-agent rate limit exceeded

/** Current message protocol version for forward compatibility. */
export const MESSAGE_PROTOCOL_VERSION = 1;

export interface AgentMessage {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro: number;
    txid: string | null;
    status: AgentMessageStatus;
    response: string | null;
    responseTxid: string | null;
    sessionId: string | null;
    threadId: string | null;
    provider?: string;
    model?: string;
    /** Whether this was a fire-and-forget message (no response expected). */
    fireAndForget: boolean;
    /** Message protocol version for forward compatibility. */
    messageVersion: number;
    /** Structured error code when status is 'failed'. */
    errorCode: MessageErrorCode | null;
    createdAt: string;
    completedAt: string | null;
}
