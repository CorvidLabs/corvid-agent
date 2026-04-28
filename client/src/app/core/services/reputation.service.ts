import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { ReputationScore, ReputationEvent, ScoreExplanation, AgentReputationStats, ReputationHistoryPoint, ActivitySummary, MemoryAttestation, AuditGuide } from '../models/reputation.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReputationService {
    private readonly api = inject(ApiService);

    readonly scores = signal<ReputationScore[]>([]);
    readonly events = signal<ReputationEvent[]>([]);
    readonly explanation = signal<ScoreExplanation | null>(null);
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

    async computeAll(): Promise<void> {
        this.loading.set(true);
        try {
            const scores = await firstValueFrom(
                this.api.post<ReputationScore[]>('/reputation/scores'),
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

    async getEvents(agentId: string, limit?: number): Promise<ReputationEvent[]> {
        const params = limit !== undefined ? `?limit=${limit}` : '';
        const events = await firstValueFrom(
            this.api.get<ReputationEvent[]>(`/reputation/events/${agentId}${params}`),
        );
        this.events.set(events);
        return events;
    }

    async getExplanation(agentId: string): Promise<ScoreExplanation> {
        const explanation = await firstValueFrom(
            this.api.get<ScoreExplanation>(`/reputation/explain/${agentId}`),
        );
        this.explanation.set(explanation);
        return explanation;
    }

    async getStats(agentId: string): Promise<AgentReputationStats> {
        return firstValueFrom(
            this.api.get<AgentReputationStats>(`/reputation/stats/${agentId}`),
        );
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

    async getHistory(agentId: string, days = 90): Promise<ReputationHistoryPoint[]> {
        return firstValueFrom(
            this.api.get<ReputationHistoryPoint[]>(`/reputation/history/${agentId}?days=${days}`),
        );
    }

    async getActivitySummaries(period?: string, limit = 10): Promise<ActivitySummary[]> {
        const params = new URLSearchParams();
        if (period) params.set('period', period);
        params.set('limit', String(limit));
        return firstValueFrom(
            this.api.get<ActivitySummary[]>(`/reputation/summaries?${params}`),
        );
    }

    async getMemoryAttestations(agentId: string, limit = 20): Promise<MemoryAttestation[]> {
        return firstValueFrom(
            this.api.get<MemoryAttestation[]>(`/memories/attestations?agentId=${agentId}&limit=${limit}`),
        );
    }

    async triggerActivitySummary(period: 'daily' | 'weekly'): Promise<{ ok: boolean; hash: string; txid: string | null }> {
        return firstValueFrom(
            this.api.post<{ ok: boolean; hash: string; txid: string | null }>('/reputation/summaries', { period }),
        );
    }

    async getAuditGuide(): Promise<AuditGuide> {
        return firstValueFrom(
            this.api.get<AuditGuide>('/reputation/audit-guide'),
        );
    }
}
