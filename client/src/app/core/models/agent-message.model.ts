export type AgentMessageStatus = 'pending' | 'sent' | 'processing' | 'completed' | 'failed';

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
    createdAt: string;
    completedAt: string | null;
}
