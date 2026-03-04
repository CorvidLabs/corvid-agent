import { Injectable } from '@angular/core';
import { EntityStore } from './entity-store';
import type {
    Council,
    CreateCouncilInput,
    UpdateCouncilInput,
    CouncilLaunch,
    CouncilLaunchLog,
    CouncilDiscussionMessage,
} from '../models/council.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CouncilService extends EntityStore<Council> {
    protected readonly apiPath = '/councils';

    // Backward-compatible alias
    readonly councils = this.entities;

    async loadCouncils(): Promise<void> {
        return this.load();
    }

    async getCouncil(id: string): Promise<Council> {
        return this.getById(id);
    }

    async createCouncil(input: CreateCouncilInput): Promise<Council> {
        return this.create(input);
    }

    async updateCouncil(id: string, input: UpdateCouncilInput): Promise<Council> {
        return this.update(id, input);
    }

    async deleteCouncil(id: string): Promise<void> {
        return this.remove(id);
    }

    // ─── Council Launch Operations ───────────────────────────────────────

    async launchCouncil(
        councilId: string,
        projectId: string,
        prompt: string,
    ): Promise<{ launchId: string; sessionIds: string[] }> {
        return firstValueFrom(
            this.api.post<{ launchId: string; sessionIds: string[] }>(
                `/councils/${councilId}/launch`,
                { projectId, prompt },
            ),
        );
    }

    async getCouncilLaunch(launchId: string): Promise<CouncilLaunch> {
        return firstValueFrom(this.api.get<CouncilLaunch>(`/council-launches/${launchId}`));
    }

    async getCouncilLaunches(councilId: string): Promise<CouncilLaunch[]> {
        return firstValueFrom(this.api.get<CouncilLaunch[]>(`/councils/${councilId}/launches`));
    }

    async getAllLaunches(): Promise<CouncilLaunch[]> {
        return firstValueFrom(this.api.get<CouncilLaunch[]>('/council-launches'));
    }

    async abortLaunch(launchId: string): Promise<{ ok: boolean }> {
        return firstValueFrom(this.api.post<{ ok: boolean }>(`/council-launches/${launchId}/abort`));
    }

    async triggerReview(launchId: string): Promise<{ launchId: string; reviewSessionIds: string[] }> {
        return firstValueFrom(
            this.api.post<{ launchId: string; reviewSessionIds: string[] }>(
                `/council-launches/${launchId}/review`,
            ),
        );
    }

    async triggerSynthesis(launchId: string): Promise<{ launchId: string; synthesisSessionId: string }> {
        return firstValueFrom(
            this.api.post<{ launchId: string; synthesisSessionId: string }>(
                `/council-launches/${launchId}/synthesize`,
            ),
        );
    }

    async getLaunchLogs(launchId: string): Promise<CouncilLaunchLog[]> {
        return firstValueFrom(this.api.get<CouncilLaunchLog[]>(`/council-launches/${launchId}/logs`));
    }

    async getDiscussionMessages(launchId: string): Promise<CouncilDiscussionMessage[]> {
        return firstValueFrom(this.api.get<CouncilDiscussionMessage[]>(`/council-launches/${launchId}/discussion-messages`));
    }

    async chatWithCouncil(launchId: string, message: string): Promise<{ sessionId: string; created: boolean }> {
        return firstValueFrom(
            this.api.post<{ sessionId: string; created: boolean }>(
                `/council-launches/${launchId}/chat`,
                { message },
            ),
        );
    }
}
