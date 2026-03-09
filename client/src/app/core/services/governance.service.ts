import { Injectable, signal } from '@angular/core';
import { EntityStore } from './entity-store';
import type {
    GovernanceProposal,
    CreateProposalInput,
    UpdateProposalInput,
    WeightedVoteRecord,
    WeightedGovernanceVoteCheck,
    GovernanceVoteStatusResponse,
    CastVoteResponse,
    GovernanceVoteOption,
} from '../models/governance.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GovernanceService extends EntityStore<GovernanceProposal> {
    protected readonly apiPath = '/proposals';

    // Backward-compatible alias
    readonly proposals = this.entities;

    /** Active vote status for a council launch (loaded on demand). */
    readonly activeVote = signal<GovernanceVoteStatusResponse | null>(null);

    /** Whether a vote status request is in-flight. */
    readonly voteLoading = signal(false);

    // ─── Proposal CRUD ───────────────────────────────────────────────────

    async loadProposals(councilId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = councilId
                ? `${this.apiPath}?councilId=${encodeURIComponent(councilId)}`
                : this.apiPath;
            const items = await firstValueFrom(this.api.get<GovernanceProposal[]>(path));
            this.entities.set(items);
        } finally {
            this.loading.set(false);
        }
    }

    async createProposal(input: CreateProposalInput): Promise<GovernanceProposal> {
        return this.create(input);
    }

    async updateProposal(id: string, input: UpdateProposalInput): Promise<GovernanceProposal> {
        return this.update(id, input);
    }

    async deleteProposal(id: string): Promise<void> {
        return this.remove(id);
    }

    async transitionProposal(
        id: string,
        status: GovernanceProposal['status'],
        decision?: 'approved' | 'rejected',
    ): Promise<GovernanceProposal> {
        const body: Record<string, unknown> = { status };
        if (decision) body['decision'] = decision;
        const proposal = await firstValueFrom(
            this.api.post<GovernanceProposal>(`${this.apiPath}/${id}/transition`, body),
        );
        this.entities.update((list) => list.map((p) => (p.id === id ? proposal : p)));
        return proposal;
    }

    // ─── Council Launch Vote Operations ──────────────────────────────────

    async getVoteStatus(launchId: string): Promise<GovernanceVoteStatusResponse> {
        this.voteLoading.set(true);
        try {
            const status = await firstValueFrom(
                this.api.get<GovernanceVoteStatusResponse>(`/council-launches/${launchId}/vote`),
            );
            this.activeVote.set(status);
            return status;
        } finally {
            this.voteLoading.set(false);
        }
    }

    async refreshVoteStatus(launchId: string): Promise<void> {
        try {
            const status = await firstValueFrom(
                this.api.get<GovernanceVoteStatusResponse>(`/council-launches/${launchId}/vote`),
            );
            this.activeVote.set(status);
        } catch {
            // Vote may not exist for non-governance launches
        }
    }

    async castVote(
        launchId: string,
        agentId: string,
        vote: GovernanceVoteOption,
        reason?: string,
    ): Promise<CastVoteResponse> {
        const body: Record<string, unknown> = { agentId, vote };
        if (reason) body['reason'] = reason;
        const result = await firstValueFrom(
            this.api.post<CastVoteResponse>(`/council-launches/${launchId}/vote`, body),
        );
        // Update the local activeVote evaluation
        this.activeVote.update((current) => {
            if (!current) return current;
            return { ...current, evaluation: result.evaluation };
        });
        return result;
    }

    async approveHuman(launchId: string, approvedBy: string): Promise<void> {
        const result = await firstValueFrom(
            this.api.post<{ ok: boolean; evaluation: WeightedGovernanceVoteCheck }>(
                `/council-launches/${launchId}/vote/approve`,
                { approvedBy },
            ),
        );
        this.activeVote.update((current) => {
            if (!current) return current;
            return {
                ...current,
                humanApproved: true,
                humanApprovedBy: approvedBy,
                evaluation: result.evaluation,
            };
        });
    }

    /** Clear the active vote state (e.g. when navigating away). */
    clearActiveVote(): void {
        this.activeVote.set(null);
    }
}
