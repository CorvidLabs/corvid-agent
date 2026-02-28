import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

export interface GitHubAllowlistEntry {
    username: string;
    label: string;
    createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class GitHubAllowlistService {
    private readonly api = inject(ApiService);

    readonly entries = signal<GitHubAllowlistEntry[]>([]);
    readonly loading = signal(false);

    async loadEntries(): Promise<void> {
        this.loading.set(true);
        try {
            const entries = await firstValueFrom(this.api.get<GitHubAllowlistEntry[]>('/github-allowlist'));
            this.entries.set(entries);
        } finally {
            this.loading.set(false);
        }
    }

    async addEntry(username: string, label?: string): Promise<GitHubAllowlistEntry> {
        const entry = await firstValueFrom(
            this.api.post<GitHubAllowlistEntry>('/github-allowlist', { username, label }),
        );
        this.entries.update((current) => [entry, ...current]);
        return entry;
    }

    async updateEntry(username: string, label: string): Promise<GitHubAllowlistEntry> {
        const entry = await firstValueFrom(
            this.api.put<GitHubAllowlistEntry>(`/github-allowlist/${encodeURIComponent(username)}`, { label }),
        );
        this.entries.update((current) =>
            current.map((e) => (e.username === username ? entry : e)),
        );
        return entry;
    }

    async removeEntry(username: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/github-allowlist/${encodeURIComponent(username)}`));
        this.entries.update((current) => current.filter((e) => e.username !== username));
    }
}
