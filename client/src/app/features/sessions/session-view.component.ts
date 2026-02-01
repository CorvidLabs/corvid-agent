import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { SessionOutputComponent } from './session-output.component';
import { SessionInputComponent } from './session-input.component';
import { DecimalPipe } from '@angular/common';
import type { Session, SessionMessage } from '../../core/models/session.model';
import type { StreamEvent } from '../../core/models/ws-message.model';

@Component({
    selector: 'app-session-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent, SessionOutputComponent, SessionInputComponent, DecimalPipe],
    template: `
        @if (session(); as s) {
            <div class="session-view">
                <div class="session-view__header">
                    <div class="session-view__info">
                        <h2>{{ s.name || s.id.slice(0, 8) }}</h2>
                        <app-status-badge [status]="s.status" />
                    </div>
                    <div class="session-view__meta">
                        @if (s.totalCostUsd > 0) {
                            <span>Cost: {{ s.totalCostUsd | number:'1.4-4' }} USD</span>
                        }
                        <span>Turns: {{ s.totalTurns }}</span>
                    </div>
                    <div class="session-view__actions">
                        @if (s.status === 'running') {
                            <button class="btn btn--danger" (click)="onStop()">Stop</button>
                        } @else {
                            <button class="btn btn--primary" (click)="onResume()">Resume</button>
                        }
                        <button class="btn btn--secondary" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <app-session-output [messages]="messages()" [events]="events()" />

                <app-session-input
                    [disabled]="s.status !== 'running'"
                    (messageSent)="onSendMessage($event)" />
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .session-view { display: flex; flex-direction: column; height: 100%; }
        .session-view__header {
            display: flex; align-items: center; gap: 1rem;
            padding: 0.75rem 1rem;
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
        }
        .session-view__info { display: flex; align-items: center; gap: 0.75rem; }
        .session-view__info h2 { margin: 0; font-size: 1rem; color: var(--text-primary); }
        .session-view__meta { display: flex; gap: 1rem; font-size: 0.75rem; color: var(--text-secondary); margin-left: auto; }
        .session-view__actions { display: flex; gap: 0.5rem; }
        .btn {
            padding: 0.375rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); box-shadow: 0 0 8px rgba(255, 51, 85, 0.25); }
        .page { padding: 1.5rem; color: var(--text-primary); }
    `,
})
export class SessionViewComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly sessionService = inject(SessionService);

    protected readonly session = signal<Session | null>(null);
    protected readonly messages = signal<SessionMessage[]>([]);

    protected readonly events = computed(() => {
        const s = this.session();
        if (!s) return [];
        return this.sessionService.activeEvents().get(s.id) ?? [];
    });

    private sessionId: string | null = null;

    async ngOnInit(): Promise<void> {
        this.sessionId = this.route.snapshot.paramMap.get('id');
        if (!this.sessionId) return;

        const session = await this.sessionService.getSession(this.sessionId);
        this.session.set(session);

        const messages = await this.sessionService.getMessages(this.sessionId);
        this.messages.set(messages);

        this.sessionService.subscribeToSession(this.sessionId);
    }

    ngOnDestroy(): void {
        if (this.sessionId) {
            this.sessionService.unsubscribeFromSession(this.sessionId);
        }
    }

    protected onSendMessage(content: string): void {
        if (!this.sessionId) return;
        this.sessionService.sendMessage(this.sessionId, content);
    }

    protected async onStop(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.stopSession(this.sessionId);
        const session = await this.sessionService.getSession(this.sessionId);
        this.session.set(session);
    }

    protected async onResume(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.resumeSession(this.sessionId);
        const session = await this.sessionService.getSession(this.sessionId);
        this.session.set(session);
    }

    protected async onDelete(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.deleteSession(this.sessionId);
        this.router.navigate(['/sessions']);
    }
}
