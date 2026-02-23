import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type {
    SkillBundle,
    CreateSkillBundleInput,
    UpdateSkillBundleInput,
    AgentSkillAssignment,
} from '../models/skill-bundle.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SkillBundleService {
    private readonly api = inject(ApiService);

    readonly bundles = signal<SkillBundle[]>([]);
    readonly loading = signal(false);

    async loadBundles(): Promise<void> {
        this.loading.set(true);
        try {
            const bundles = await firstValueFrom(this.api.get<SkillBundle[]>('/skill-bundles'));
            this.bundles.set(bundles);
        } finally {
            this.loading.set(false);
        }
    }

    async createBundle(data: CreateSkillBundleInput): Promise<SkillBundle> {
        const bundle = await firstValueFrom(
            this.api.post<SkillBundle>('/skill-bundles', data),
        );
        this.bundles.update((current) => [...current, bundle]);
        return bundle;
    }

    async updateBundle(id: string, data: UpdateSkillBundleInput): Promise<SkillBundle> {
        const bundle = await firstValueFrom(
            this.api.put<SkillBundle>(`/skill-bundles/${id}`, data),
        );
        this.bundles.update((current) => current.map((b) => (b.id === id ? bundle : b)));
        return bundle;
    }

    async deleteBundle(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/skill-bundles/${id}`));
        this.bundles.update((current) => current.filter((b) => b.id !== id));
    }

    async getAgentBundles(agentId: string): Promise<AgentSkillAssignment[]> {
        return firstValueFrom(
            this.api.get<AgentSkillAssignment[]>(`/agents/${agentId}/skills`),
        );
    }

    async assignToAgent(agentId: string, bundleId: string): Promise<AgentSkillAssignment> {
        return firstValueFrom(
            this.api.post<AgentSkillAssignment>(`/agents/${agentId}/skills`, { bundleId }),
        );
    }

    async removeFromAgent(agentId: string, bundleId: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/agents/${agentId}/skills/${bundleId}`));
    }
}
