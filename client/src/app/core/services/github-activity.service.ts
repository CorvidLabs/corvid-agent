import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import type {
    GitHubEvent,
    GitHubPR,
    GitHubIssue,
    GitHubRun,
    ActivitySummary,
} from '../models/github-activity.model';

@Injectable({ providedIn: 'root' })
export class GitHubActivityService {
    private readonly api = inject(ApiService);

    readonly events = signal<GitHubEvent[]>([]);
    readonly prs = signal<GitHubPR[]>([]);
    readonly issues = signal<GitHubIssue[]>([]);
    readonly runs = signal<GitHubRun[]>([]);
    readonly summary = signal<ActivitySummary | null>(null);
    readonly loading = signal(false);

    async loadEvents(owner: string, repo: string, limit = 30): Promise<void> {
        const res = await firstValueFrom(
            this.api.get<{ events: GitHubEvent[] }>(
                `/github-activity/events?owner=${owner}&repo=${repo}&limit=${limit}`,
            ),
        );
        this.events.set(res.events);
    }

    async loadPRs(owner: string, repo: string): Promise<void> {
        const res = await firstValueFrom(
            this.api.get<{ prs: GitHubPR[] }>(
                `/github-activity/prs?owner=${owner}&repo=${repo}`,
            ),
        );
        this.prs.set(res.prs);
    }

    async loadIssues(owner: string, repo: string): Promise<void> {
        const res = await firstValueFrom(
            this.api.get<{ issues: GitHubIssue[] }>(
                `/github-activity/issues?owner=${owner}&repo=${repo}`,
            ),
        );
        this.issues.set(res.issues);
    }

    async loadRuns(owner: string, repo: string): Promise<void> {
        const res = await firstValueFrom(
            this.api.get<{ runs: GitHubRun[] }>(
                `/github-activity/runs?owner=${owner}&repo=${repo}`,
            ),
        );
        this.runs.set(res.runs);
    }

    async loadSummary(owner: string, repo: string): Promise<void> {
        const res = await firstValueFrom(
            this.api.get<ActivitySummary>(
                `/github-activity/summary?owner=${owner}&repo=${repo}`,
            ),
        );
        this.summary.set(res);
    }

    async loadAll(owner: string, repo: string): Promise<void> {
        this.loading.set(true);
        try {
            await Promise.all([
                this.loadEvents(owner, repo),
                this.loadPRs(owner, repo),
                this.loadIssues(owner, repo),
                this.loadSummary(owner, repo),
            ]);
        } finally {
            this.loading.set(false);
        }
    }
}
