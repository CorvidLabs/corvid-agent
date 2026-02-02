import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../models/agent.model';
import type { AgentMessage } from '../models/agent-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AgentService {
    private readonly api = inject(ApiService);

    readonly agents = signal<Agent[]>([]);
    readonly loading = signal(false);

    async loadAgents(): Promise<void> {
        this.loading.set(true);
        try {
            const agents = await firstValueFrom(this.api.get<Agent[]>('/agents'));
            this.agents.set(agents);
        } finally {
            this.loading.set(false);
        }
    }

    async getAgent(id: string): Promise<Agent> {
        return firstValueFrom(this.api.get<Agent>(`/agents/${id}`));
    }

    async createAgent(input: CreateAgentInput): Promise<Agent> {
        const agent = await firstValueFrom(this.api.post<Agent>('/agents', input));
        this.agents.update((current) => [...current, agent]);
        return agent;
    }

    async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
        const agent = await firstValueFrom(this.api.put<Agent>(`/agents/${id}`, input));
        this.agents.update((current) => current.map((a) => (a.id === id ? agent : a)));
        return agent;
    }

    async deleteAgent(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/agents/${id}`));
        this.agents.update((current) => current.filter((a) => a.id !== id));
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
