import type { Database } from 'bun:sqlite';
import type { AgentWalletService } from './agent-wallet';
import { getAgent, listAgents } from '../db/agents';
import { createLogger } from '../lib/logger';

const log = createLogger('AgentDirectory');

export interface AgentDirectoryEntry {
    agentId: string;
    agentName: string;
    walletAddress: string | null;
    publicKey: Uint8Array | null;
}

export class AgentDirectory {
    private db: Database;
    private agentWalletService: AgentWalletService;
    private cache: Map<string, AgentDirectoryEntry> = new Map();

    constructor(db: Database, agentWalletService: AgentWalletService) {
        this.db = db;
        this.agentWalletService = agentWalletService;
    }

    async resolve(agentId: string): Promise<AgentDirectoryEntry | null> {
        const cached = this.cache.get(agentId);
        if (cached) return cached;

        const agent = getAgent(this.db, agentId);
        if (!agent) return null;

        let publicKey: Uint8Array | null = null;
        try {
            const chatAccount = await this.agentWalletService.getAgentChatAccount(agentId);
            if (chatAccount) {
                publicKey = chatAccount.account.encryptionKeys?.publicKey ?? null;
            }
        } catch {
            log.debug(`Could not get public key for agent ${agentId}`);
        }

        const entry: AgentDirectoryEntry = {
            agentId: agent.id,
            agentName: agent.name,
            walletAddress: agent.walletAddress,
            publicKey,
        };

        this.cache.set(agentId, entry);
        return entry;
    }

    findAgentByAddress(walletAddress: string): string | null {
        // Check cache first
        for (const [agentId, entry] of this.cache) {
            if (entry.walletAddress === walletAddress) return agentId;
        }

        // Query DB
        const row = this.db.query(
            'SELECT id FROM agents WHERE wallet_address = ?'
        ).get(walletAddress) as { id: string } | null;

        return row?.id ?? null;
    }

    async listAvailable(): Promise<AgentDirectoryEntry[]> {
        const agents = listAgents(this.db);
        const entries: AgentDirectoryEntry[] = [];

        for (const agent of agents) {
            const entry = await this.resolve(agent.id);
            if (entry) entries.push(entry);
        }

        return entries;
    }

    clearCache(): void {
        this.cache.clear();
    }
}
