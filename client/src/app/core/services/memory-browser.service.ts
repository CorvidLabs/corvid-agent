/**
 * MemoryBrowserService — signal-based service for browsing, editing, and deleting
 * on-chain ARC-69 memories via the dashboard and MCP API endpoints.
 */

import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MemoryTier = 'longterm' | 'shortterm';
export type StorageType = 'arc69' | 'plain-txn' | 'pending';

export interface MemoryEntry {
    id: string;
    agentId: string;
    key: string;
    content: string;
    tier: MemoryTier;
    storageType: StorageType;
    status: string;
    txid: string | null;
    asaId: number | null;
    category: string | null;
    categoryConfidence: number | null;
    decayScore: number;
    createdAt: string;
    updatedAt: string;
}

export interface MemoryListResponse {
    entries: MemoryEntry[];
    total: number;
    limit: number;
    offset: number;
}

export interface MemoryStats {
    totalMemories: number;
    byTier: { longterm: number; shortterm: number };
    byStatus: { confirmed: number; pending: number; failed: number };
    byCategory: Record<string, number>;
    byAgent: Array<{ agentId: string; agentName: string; total: number; longterm: number; shortterm: number }>;
    oldestMemory: string | null;
    newestMemory: string | null;
    averageDecayScore: number | null;
}

export interface MemoryListParams {
    search?: string;
    tier?: MemoryTier;
    status?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
}

@Injectable({ providedIn: 'root' })
export class MemoryBrowserService {
    private readonly api = inject(ApiService);

    readonly memories = signal<MemoryEntry[]>([]);
    readonly total = signal(0);
    readonly loading = signal(false);
    readonly stats = signal<MemoryStats | null>(null);

    /** Load memories with optional search/filter/pagination. */
    async loadMemories(params: MemoryListParams = {}): Promise<void> {
        this.loading.set(true);
        try {
            const query = new URLSearchParams();
            if (params.search) query.set('search', params.search);
            if (params.tier) query.set('tier', params.tier);
            if (params.status) query.set('status', params.status);
            if (params.agentId) query.set('agentId', params.agentId);
            if (params.limit) query.set('limit', String(params.limit));
            if (params.offset) query.set('offset', String(params.offset));

            const qs = query.toString();
            const path = `/dashboard/memories${qs ? `?${qs}` : ''}`;
            const result = await firstValueFrom(this.api.get<MemoryListResponse>(path));
            this.memories.set(result.entries);
            this.total.set(result.total);
        } finally {
            this.loading.set(false);
        }
    }

    /** Load aggregate stats. */
    async loadStats(): Promise<void> {
        const result = await firstValueFrom(this.api.get<MemoryStats>('/dashboard/memories/stats'));
        this.stats.set(result);
    }

    /** Get a single memory detail by ID. */
    async getMemory(id: string): Promise<MemoryEntry> {
        return firstValueFrom(this.api.get<MemoryEntry>(`/dashboard/memories/${id}`));
    }

    /** Save (create or update) a memory via the MCP API. */
    async saveMemory(agentId: string, key: string, content: string): Promise<{ response: string; isError: boolean }> {
        return firstValueFrom(
            this.api.post<{ response: string; isError: boolean }>('/mcp/save-memory', { agentId, key, content }),
        );
    }

    /** Delete a memory via the MCP API. */
    async deleteMemory(agentId: string, key: string, mode: 'soft' | 'hard' = 'soft'): Promise<{ response: string; isError: boolean }> {
        return firstValueFrom(
            this.api.post<{ response: string; isError: boolean }>('/mcp/delete-memory', { agentId, key, mode }),
        );
    }
}
