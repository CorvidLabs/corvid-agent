import { Injectable } from '@angular/core';
import { EntityStore } from './entity-store';
import type {
    SkillBundle,
    CreateSkillBundleInput,
    UpdateSkillBundleInput,
    AgentSkillAssignment,
} from '../models/skill-bundle.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SkillBundleService extends EntityStore<SkillBundle> {
    protected readonly apiPath = '/skill-bundles';

    /** Alias for backward compatibility. */
    readonly bundles = this.entities;

    async loadBundles(): Promise<void> {
        return this.load();
    }

    async createBundle(data: CreateSkillBundleInput): Promise<SkillBundle> {
        return this.create(data);
    }

    async updateBundle(id: string, data: UpdateSkillBundleInput): Promise<SkillBundle> {
        return this.update(id, data);
    }

    async deleteBundle(id: string): Promise<void> {
        return this.remove(id);
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
