import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { AgentPersona, UpsertPersonaInput } from '../models/persona.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PersonaService {
    private readonly api = inject(ApiService);

    readonly persona = signal<AgentPersona | null>(null);
    readonly loading = signal(false);

    async loadPersona(agentId: string): Promise<AgentPersona | null> {
        this.loading.set(true);
        try {
            const persona = await firstValueFrom(
                this.api.get<AgentPersona>(`/agents/${agentId}/persona`),
            );
            this.persona.set(persona);
            return persona;
        } catch {
            this.persona.set(null);
            return null;
        } finally {
            this.loading.set(false);
        }
    }

    /** Check if a persona exists for an agent without touching shared signals. */
    async checkPersonaExists(agentId: string): Promise<boolean> {
        try {
            await firstValueFrom(
                this.api.get<AgentPersona>(`/agents/${agentId}/persona`),
            );
            return true;
        } catch {
            return false;
        }
    }

    async savePersona(agentId: string, data: UpsertPersonaInput): Promise<AgentPersona> {
        const persona = await firstValueFrom(
            this.api.put<AgentPersona>(`/agents/${agentId}/persona`, data),
        );
        this.persona.set(persona);
        return persona;
    }

    async deletePersona(agentId: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/agents/${agentId}/persona`));
        this.persona.set(null);
    }
}
