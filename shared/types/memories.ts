export type MemoryStatus = 'pending' | 'confirmed' | 'failed';

export interface AgentMemory {
    id: string;
    agentId: string;
    key: string;
    content: string;
    txid: string | null;
    status: MemoryStatus;
    createdAt: string;
    updatedAt: string;
}
