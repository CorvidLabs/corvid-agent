import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

export type LibraryCategory = 'guide' | 'reference' | 'decision' | 'standard' | 'runbook';

export interface LibraryEntry {
    id: string;
    asaId: number | null;
    key: string;
    authorId: string;
    authorName: string;
    category: LibraryCategory;
    tags: string[];
    content: string;
    book: string | null;
    page: number | null;
    txid: string | null;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
    /** Total pages when using grouped listing */
    totalPages?: number;
    /** Populated for multi-page book entries */
    pages?: LibraryEntry[];
}

export interface ListLibraryParams {
    category?: LibraryCategory;
    tag?: string;
    limit?: number;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
    private readonly api = inject(ApiService);

    readonly entries = signal<LibraryEntry[]>([]);
    readonly loading = signal(false);
    readonly count = computed(() => this.entries().length);

    async load(params: ListLibraryParams = {}): Promise<void> {
        this.loading.set(true);
        try {
            const queryParts: string[] = ['grouped=true'];
            if (params.category) queryParts.push(`category=${params.category}`);
            if (params.tag) queryParts.push(`tag=${encodeURIComponent(params.tag)}`);
            if (params.limit) queryParts.push(`limit=${params.limit}`);
            const qs = `?${queryParts.join('&')}`;
            const items = await firstValueFrom(this.api.get<LibraryEntry[]>(`/library${qs}`));
            this.entries.set(items);
        } finally {
            this.loading.set(false);
        }
    }

    async getEntry(key: string): Promise<LibraryEntry> {
        return firstValueFrom(this.api.get<LibraryEntry>(`/library/${encodeURIComponent(key)}`));
    }
}
