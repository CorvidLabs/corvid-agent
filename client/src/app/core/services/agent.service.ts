import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../models/agent.model';
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
        await this.loadAgents();
        return agent;
    }

    async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
        const agent = await firstValueFrom(this.api.put<Agent>(`/agents/${id}`, input));
        await this.loadAgents();
        return agent;
    }

    async deleteAgent(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/agents/${id}`));
        await this.loadAgents();
    }
}
