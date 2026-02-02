import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import type { Session, SessionMessage, CreateSessionInput, AlgoChatStatus } from '../models/session.model';
import type { ServerWsMessage, StreamEvent, ApprovalRequestWire } from '../models/ws-message.model';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
    private static readonly MAX_EVENTS = 500;

    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);

    readonly sessions = signal<Session[]>([]);
    readonly loading = signal(false);
    readonly activeEvents = signal<Map<string, StreamEvent[]>>(new Map());
    readonly algochatStatus = signal<AlgoChatStatus | null>(null);
    readonly pendingApprovals = signal<Map<string, ApprovalRequestWire>>(new Map());

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
        this.sessions.update((current) => [session, ...current]);
        return session;
    }

    async stopSession(id: string): Promise<void> {
        await firstValueFrom(this.api.post(`/sessions/${id}/stop`));
        this.sessions.update((current) =>
            current.map((s) => (s.id === id ? { ...s, status: 'stopped' as Session['status'] } : s)),
        );
    }

    async resumeSession(id: string, prompt?: string): Promise<void> {
        await firstValueFrom(this.api.post(`/sessions/${id}/resume`, { prompt }));
        this.sessions.update((current) =>
            current.map((s) => (s.id === id ? { ...s, status: 'running' as Session['status'] } : s)),
        );
    }

    async deleteSession(id: string): Promise<void> {
        await firstValueFrom(this.api.delete(`/sessions/${id}`));
        this.sessions.update((current) => current.filter((s) => s.id !== id));
        this.activeEvents.update((current) => {
            const updated = new Map(current);
            updated.delete(id);
            return updated;
        });
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
        this.activeEvents.update((current) => {
            const updated = new Map(current);
            updated.delete(sessionId);
            return updated;
        });
    }

    sendMessage(sessionId: string, content: string): void {
        this.ws.sendMessage(sessionId, content);
    }

    private handleWsMessage(msg: ServerWsMessage): void {
        if (msg.type === 'session_event') {
            this.activeEvents.update((current) => {
                const updated = new Map(current);
                const existing = updated.get(msg.sessionId) ?? [];
                const next = [...existing, msg.event];
                updated.set(
                    msg.sessionId,
                    next.length > SessionService.MAX_EVENTS
                        ? next.slice(next.length - SessionService.MAX_EVENTS)
                        : next,
                );
                return updated;
            });
        }

        if (msg.type === 'session_status') {
            this.sessions.update((current) =>
                current.map((s) =>
                    s.id === msg.sessionId ? { ...s, status: msg.status as Session['status'] } : s,
                ),
            );
        }

        if (msg.type === 'approval_request') {
            const approvals = new Map(this.pendingApprovals());
            approvals.set(msg.request.id, msg.request);
            this.pendingApprovals.set(approvals);
        }
    }

    clearApproval(requestId: string): void {
        const approvals = new Map(this.pendingApprovals());
        approvals.delete(requestId);
        this.pendingApprovals.set(approvals);
    }
}
