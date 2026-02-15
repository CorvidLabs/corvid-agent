import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type {
    WebhookRegistration,
    CreateWebhookRegistrationInput,
    UpdateWebhookRegistrationInput,
    WebhookDelivery,
} from '../models/webhook.model';
import type { ServerWsMessage } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebhookService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly registrations = signal<WebhookRegistration[]>([]);
    readonly deliveries = signal<WebhookDelivery[]>([]);
    readonly loading = signal(false);

    private unsubscribeWs: (() => void) | null = null;

    startListening(): void {
        if (this.unsubscribeWs) return;

        this.unsubscribeWs = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'webhook_update') {
                const reg = msg.registration as WebhookRegistration;
                this.registrations.update((list) => {
                    const idx = list.findIndex((r) => r.id === reg.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = reg;
                        return copy;
                    }
                    return [reg, ...list];
                });
            }
            if (msg.type === 'webhook_delivery') {
                const delivery = msg.delivery as WebhookDelivery;
                this.deliveries.update((list) => {
                    const idx = list.findIndex((d) => d.id === delivery.id);
                    if (idx >= 0) {
                        const copy = [...list];
                        copy[idx] = delivery;
                        return copy;
                    }
                    return [delivery, ...list];
                });
            }
        });
    }

    stopListening(): void {
        this.unsubscribeWs?.();
        this.unsubscribeWs = null;
    }

    async loadRegistrations(agentId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const path = agentId ? `/webhooks?agentId=${agentId}` : '/webhooks';
            const result = await firstValueFrom(this.api.get<WebhookRegistration[] | { registrations: WebhookRegistration[] }>(path));
            this.registrations.set(Array.isArray(result) ? result : result.registrations);
        } finally {
            this.loading.set(false);
        }
    }

    async getRegistration(id: string): Promise<WebhookRegistration> {
        return firstValueFrom(this.api.get<WebhookRegistration>(`/webhooks/${id}`));
    }

    async createRegistration(input: CreateWebhookRegistrationInput): Promise<WebhookRegistration> {
        const reg = await firstValueFrom(
            this.api.post<WebhookRegistration>('/webhooks', input),
        );
        this.registrations.update((list) => [reg, ...list]);
        return reg;
    }

    async updateRegistration(id: string, input: UpdateWebhookRegistrationInput): Promise<WebhookRegistration> {
        const reg = await firstValueFrom(
            this.api.put<WebhookRegistration>(`/webhooks/${id}`, input),
        );
        this.registrations.update((list) => list.map((r) => (r.id === id ? reg : r)));
        return reg;
    }

    async deleteRegistration(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/webhooks/${id}`));
        this.registrations.update((list) => list.filter((r) => r.id !== id));
    }

    async loadDeliveries(registrationId?: string, limit: number = 50): Promise<void> {
        const path = registrationId
            ? `/webhooks/${registrationId}/deliveries?limit=${limit}`
            : `/webhooks/deliveries?limit=${limit}`;
        const result = await firstValueFrom(this.api.get<WebhookDelivery[] | { deliveries: WebhookDelivery[] }>(path));
        this.deliveries.set(Array.isArray(result) ? result : result.deliveries);
    }
}
