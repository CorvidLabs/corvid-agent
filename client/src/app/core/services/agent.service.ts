import { Injectable } from '@angular/core';
import { EntityStore } from './entity-store';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../models/agent.model';
import type { AgentMessage } from '../models/agent-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AgentService extends EntityStore<Agent> {
    protected readonly apiPath = '/agents';

    /** Alias for backward compatibility. */
    readonly agents = this.entities;

    async loadAgents(): Promise<void> {
        return this.load();
    }

    async getAgent(id: string): Promise<Agent> {
        return this.getById(id);
    }

    async createAgent(input: CreateAgentInput): Promise<Agent> {
        return this.create(input);
    }

    async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
        return this.update(id, input);
    }

    async deleteAgent(id: string): Promise<void> {
        return this.remove(id);
    }

    async getBalance(id: string): Promise<{ balance: number; address: string | null }> {
        return firstValueFrom(this.api.get<{ balance: number; address: string | null }>(`/agents/${id}/balance`));
    }

    async getMessages(agentId: string): Promise<AgentMessage[]> {
        return firstValueFrom(this.api.get<AgentMessage[]>(`/agents/${agentId}/messages`));
    }

    async invokeAgent(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        paymentMicro?: number,
    ): Promise<{ messageId: string; txid: string | null; sessionId: string }> {
        return firstValueFrom(
            this.api.post<{ messageId: string; txid: string | null; sessionId: string }>(
                `/agents/${fromAgentId}/invoke`,
                { toAgentId, content, paymentMicro },
            ),
        );
    }
}
