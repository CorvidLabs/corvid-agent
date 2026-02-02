import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
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
export class CouncilService {
    private readonly api = inject(ApiService);

    readonly councils = signal<Council[]>([]);
    readonly loading = signal(false);

    async loadCouncils(): Promise<void> {
        this.loading.set(true);
        try {
            const councils = await firstValueFrom(this.api.get<Council[]>('/councils'));
            this.councils.set(councils);
        } finally {
            this.loading.set(false);
        }
    }

    async getCouncil(id: string): Promise<Council> {
        return firstValueFrom(this.api.get<Council>(`/councils/${id}`));
    }

    async createCouncil(input: CreateCouncilInput): Promise<Council> {
        const council = await firstValueFrom(this.api.post<Council>('/councils', input));
        await this.loadCouncils();
        return council;
    }

    async updateCouncil(id: string, input: UpdateCouncilInput): Promise<Council> {
        const council = await firstValueFrom(this.api.put<Council>(`/councils/${id}`, input));
        await this.loadCouncils();
        return council;
    }

    async deleteCouncil(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/councils/${id}`));
        await this.loadCouncils();
    }

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
}
