import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

export interface RepoBlocklistEntry {
    repo: string;
    reason: string;
    source: 'manual' | 'pr_rejection' | 'daily_review';
    prUrl: string;
    tenantId: string;
    createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class RepoBlocklistService {
    private readonly api = inject(ApiService);

    readonly entries = signal<RepoBlocklistEntry[]>([]);
    readonly loading = signal(false);

    async loadEntries(): Promise<void> {
        this.loading.set(true);
        try {
            const entries = await firstValueFrom(this.api.get<RepoBlocklistEntry[]>('/repo-blocklist'));
            this.entries.set(entries);
        } finally {
            this.loading.set(false);
        }
    }

    async addEntry(repo: string, reason?: string): Promise<RepoBlocklistEntry> {
        const entry = await firstValueFrom(
            this.api.post<RepoBlocklistEntry>('/repo-blocklist', { repo, reason, source: 'manual' }),
        );
        this.entries.update((current) => [entry, ...current]);
        return entry;
    }

    async removeEntry(repo: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/repo-blocklist/${encodeURIComponent(repo)}`));
        this.entries.update((current) => current.filter((e) => e.repo !== repo));
    }
}
