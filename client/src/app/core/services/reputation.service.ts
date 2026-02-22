import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { ReputationScore, ReputationEvent } from '../models/reputation.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReputationService {
    private readonly api = inject(ApiService);

    readonly scores = signal<ReputationScore[]>([]);
    readonly events = signal<ReputationEvent[]>([]);
    readonly loading = signal(false);

    async loadScores(): Promise<void> {
        this.loading.set(true);
        try {
            const scores = await firstValueFrom(
                this.api.get<ReputationScore[]>('/reputation/scores'),
            );
            this.scores.set(scores);
        } finally {
            this.loading.set(false);
        }
    }

    async getScore(agentId: string): Promise<ReputationScore> {
        return firstValueFrom(
            this.api.get<ReputationScore>(`/reputation/scores/${agentId}`),
        );
    }

    async refreshScore(agentId: string): Promise<ReputationScore> {
        const score = await firstValueFrom(
            this.api.post<ReputationScore>(`/reputation/scores/${agentId}`),
        );
        this.scores.update((current) => {
            const idx = current.findIndex((s) => s.agentId === agentId);
            if (idx >= 0) {
                const copy = [...current];
                copy[idx] = score;
                return copy;
            }
            return [...current, score];
        });
        return score;
    }

    async getEvents(agentId: string): Promise<ReputationEvent[]> {
        const events = await firstValueFrom(
            this.api.get<ReputationEvent[]>(`/reputation/events/${agentId}`),
        );
        this.events.set(events);
        return events;
    }

    async getAttestation(agentId: string): Promise<{ hash: string | null }> {
        return firstValueFrom(
            this.api.get<{ hash: string | null }>(`/reputation/attestation/${agentId}`),
        );
    }

    async createAttestation(agentId: string): Promise<{ hash: string }> {
        return firstValueFrom(
            this.api.post<{ hash: string }>(`/reputation/attestation/${agentId}`),
        );
    }
}
