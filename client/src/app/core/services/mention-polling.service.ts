import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type {
    MentionPollingConfig,
    CreateMentionPollingInput,
    UpdateMentionPollingInput,
    MentionPollingStats,
} from '../models/mention-polling.model';
import type { ServerWsMessage } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MentionPollingService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly configs = signal<MentionPollingConfig[]>([]);
    readonly stats = signal<MentionPollingStats | null>(null);
    readonly loading = signal(false);

    private unsubscribeWs: (() => void) | null = null;

    startListening(): void {
        if (this.unsubscribeWs) return;

        this.unsubscribeWs = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'mention_polling_update') {
                const config = msg.config as MentionPollingConfig;
                this.configs.update((list) => {
                    const idx = list.findIndex((c) => c.id === config.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = config;
                        return copy;
                    }
                    return [config, ...list];
                });
            }
        });
    }

    stopListening(): void {
        this.unsubscribeWs?.();
        this.unsubscribeWs = null;
    }

    async loadConfigs(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/mention-polling?agentId=${agentId}` : '/mention-polling';
            const configs = await firstValueFrom(this.api.get<MentionPollingConfig[]>(path));
            this.configs.set(configs);
        } finally {
            this.loading.set(false);
        }
    }

    async getConfig(id: string): Promise<MentionPollingConfig> {
        return firstValueFrom(this.api.get<MentionPollingConfig>(`/mention-polling/${id}`));
    }

    async createConfig(input: CreateMentionPollingInput): Promise<MentionPollingConfig> {
        const config = await firstValueFrom(
            this.api.post<MentionPollingConfig>('/mention-polling', input),
        );
        this.configs.update((list) => [config, ...list]);
        return config;
    }

    async updateConfig(id: string, input: UpdateMentionPollingInput): Promise<MentionPollingConfig> {
        const config = await firstValueFrom(
            this.api.put<MentionPollingConfig>(`/mention-polling/${id}`, input),
        );
        this.configs.update((list) => list.map((c) => (c.id === id ? config : c)));
        return config;
    }

    async deleteConfig(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/mention-polling/${id}`));
        this.configs.update((list) => list.filter((c) => c.id !== id));
    }

    async loadStats(): Promise<void> {
        try {
            const stats = await firstValueFrom(
                this.api.get<MentionPollingStats>('/mention-polling/stats'),
            );
            this.stats.set(stats);
        } catch {
            // Stats endpoint may not exist yet
        }
    }
}
