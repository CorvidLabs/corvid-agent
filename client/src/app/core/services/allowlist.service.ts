import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

export interface AllowlistEntry {
    address: string;
    label: string;
    createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AllowlistService {
    private readonly api = inject(ApiService);

    readonly entries = signal<AllowlistEntry[]>([]);
    readonly loading = signal(false);

    async loadEntries(): Promise<void> {
        this.loading.set(true);
        try {
            const entries = await firstValueFrom(this.api.get<AllowlistEntry[]>('/allowlist'));
            this.entries.set(entries);
        } finally {
            this.loading.set(false);
        }
    }

    async addEntry(address: string, label?: string): Promise<AllowlistEntry> {
        const entry = await firstValueFrom(
            this.api.post<AllowlistEntry>('/allowlist', { address, label }),
        );
        this.entries.update((current) => [entry, ...current]);
        return entry;
    }

    async updateEntry(address: string, label: string): Promise<AllowlistEntry> {
        const entry = await firstValueFrom(
            this.api.put<AllowlistEntry>(`/allowlist/${encodeURIComponent(address)}`, { label }),
        );
        this.entries.update((current) =>
            current.map((e) => (e.address === address ? entry : e)),
        );
        return entry;
    }

    async removeEntry(address: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/allowlist/${encodeURIComponent(address)}`));
        this.entries.update((current) => current.filter((e) => e.address !== address));
    }
}
