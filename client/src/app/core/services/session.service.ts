import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type { Session, SessionMessage, CreateSessionInput, AlgoChatStatus } from '../models/session.model';
import type { ServerWsMessage, StreamEvent } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly sessions = signal<Session[]>([]);
    readonly loading = signal(false);
    readonly activeEvents = signal<Map<string, StreamEvent[]>>(new Map());
    readonly algochatStatus = signal<AlgoChatStatus | null>(null);

    private cleanupFn: (() => void) | null = null;

    init(): void {
        this.cleanupFn = this.ws.onMessage((msg) => this.handleWsMessage(msg));
    }

    destroy(): void {
        this.cleanupFn?.();
    }

    async loadSessions(projectId?: string): Promise<void> {
        this.loading.set(true);
        try {
            const params = projectId ? `?projectId=${projectId}` : '';
            const sessions = await firstValueFrom(this.api.get<Session[]>(`/sessions${params}`));
            this.sessions.set(sessions);
        } finally {
            this.loading.set(false);
        }
    }

    async getSession(id: string): Promise<Session> {
        return firstValueFrom(this.api.get<Session>(`/sessions/${id}`));
    }

    async getMessages(sessionId: string): Promise<SessionMessage[]> {
        return firstValueFrom(this.api.get<SessionMessage[]>(`/sessions/${sessionId}/messages`));
    }

    async createSession(input: CreateSessionInput): Promise<Session> {
        const session = await firstValueFrom(this.api.post<Session>('/sessions', input));
        await this.loadSessions();
        return session;
    }

    async stopSession(id: string): Promise<void> {
        await firstValueFrom(this.api.post(`/sessions/${id}/stop`));
        await this.loadSessions();
    }

    async resumeSession(id: string, prompt?: string): Promise<void> {
        await firstValueFrom(this.api.post(`/sessions/${id}/resume`, { prompt }));
        await this.loadSessions();
    }

    async deleteSession(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/sessions/${id}`));
        await this.loadSessions();
    }

    async loadAlgoChatStatus(): Promise<void> {
        const status = await firstValueFrom(this.api.get<AlgoChatStatus>('/algochat/status'));
        this.algochatStatus.set(status);
    }

    subscribeToSession(sessionId: string): void {
        this.ws.subscribe(sessionId);
    }

    unsubscribeFromSession(sessionId: string): void {
        this.ws.unsubscribe(sessionId);
    }

    sendMessage(sessionId: string, content: string): void {
        this.ws.sendMessage(sessionId, content);
    }

    private handleWsMessage(msg: ServerWsMessage): void {
        if (msg.type === 'session_event') {
            const events = new Map(this.activeEvents());
            const existing = events.get(msg.sessionId) ?? [];
            events.set(msg.sessionId, [...existing, msg.event]);
            this.activeEvents.set(events);
        }

        if (msg.type === 'session_status') {
            // Refresh sessions list on status change
            this.loadSessions();
        }
    }
}
