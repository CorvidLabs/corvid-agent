import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { SessionOutputComponent } from './session-output.component';
import { SessionInputComponent } from './session-input.component';
import { ApprovalDialogComponent, type ApprovalDecision } from './approval-dialog.component';
import type { Session, SessionMessage } from '../../core/models/session.model';
import type { StreamEvent, ApprovalRequestWire } from '../../core/models/ws-message.model';

@Component({
    selector: 'app-session-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent, SessionOutputComponent, SessionInputComponent, ApprovalDialogComponent],
    template: `
        @if (session(); as s) {
            <div class="session-view">
                <div class="session-view__header">
                    <div class="session-view__info">
                        <h2>{{ s.name || s.id.slice(0, 8) }}</h2>
                        <app-status-badge [status]="s.status" />
                    </div>
                    <div class="session-view__meta">
                        <span>Turns: {{ s.totalTurns }}</span>
                    </div>
                    <div class="session-view__actions">
                        <button class="btn btn--secondary" (click)="onCopyLog()">
                            {{ logCopied() ? 'Copied!' : 'Copy Log' }}
                        </button>
                        @if (s.status === 'running') {
                            <button class="btn btn--danger" (click)="onStop()">Stop</button>
                        } @else {
                            <button class="btn btn--primary" (click)="onResume()">Resume</button>
                        }
                        <button class="btn btn--secondary" (click)="onDelete()">Delete</button>
                    </div>
                </div>

                <app-session-output [messages]="messages()" [events]="events()" [isRunning]="s.status === 'running'" />

                <app-session-input
                    [disabled]="s.status !== 'running'"
                    (messageSent)="onSendMessage($event)" />
            </div>

            @if (pendingApproval(); as approval) {
                <app-approval-dialog
                    [request]="approval"
                    (decided)="onApprovalDecision($event)" />
            }
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            position: absolute;
            inset: 0;
        }
        .session-view { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
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
    private readonly wsService = inject(WebSocketService);

    protected readonly session = signal<Session | null>(null);
    protected readonly messages = signal<SessionMessage[]>([]);
    protected readonly logCopied = signal(false);
    protected readonly pendingApproval = signal<ApprovalRequestWire | null>(null);

    protected readonly events = computed(() => {
        const s = this.session();
        if (!s) return [];
        return this.sessionService.activeEvents().get(s.id) ?? [];
    });

    private sessionId: string | null = null;
    private approvalCleanup: (() => void) | null = null;

    async ngOnInit(): Promise<void> {
        this.sessionId = this.route.snapshot.paramMap.get('id');
        if (!this.sessionId) return;

        const session = await this.sessionService.getSession(this.sessionId);
        this.session.set(session);

        const messages = await this.sessionService.getMessages(this.sessionId);
        this.messages.set(messages);

        this.sessionService.subscribeToSession(this.sessionId);

        // Listen for approval requests targeting this session
        const sid = this.sessionId;
        this.approvalCleanup = this.wsService.onMessage((msg) => {
            if (msg.type === 'approval_request' && msg.request.sessionId === sid) {
                this.pendingApproval.set(msg.request);
            }
        });
    }

    ngOnDestroy(): void {
        if (this.sessionId) {
            this.sessionService.unsubscribeFromSession(this.sessionId);
        }
        this.approvalCleanup?.();
    }

    protected onApprovalDecision(decision: ApprovalDecision): void {
        this.pendingApproval.set(null);
        this.wsService.sendApprovalResponse(decision.requestId, decision.behavior);
    }

    protected onSendMessage(content: string): void {
        if (!this.sessionId) return;
        this.sessionService.sendMessage(this.sessionId, content);

        // Immediately show the user's message in the output
        this.messages.update((msgs) => [
            ...msgs,
            {
                id: Date.now(),
                sessionId: this.sessionId as string,
                role: 'user' as const,
                content,
                costUsd: 0,
                timestamp: new Date().toISOString(),
            },
        ]);
    }

    protected async onStop(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.stopSession(this.sessionId);
        this.session.update((s) => s ? { ...s, status: 'stopped' } : s);
    }

    protected async onResume(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.resumeSession(this.sessionId);
        this.session.update((s) => s ? { ...s, status: 'running' } : s);
    }

    protected onCopyLog(): void {
        const lines: string[] = [];

        for (const msg of this.messages()) {
            const time = this.formatTime(msg.timestamp);
            lines.push(`[${time}] ${msg.role.toUpperCase()}: ${msg.content}`);
        }

        for (const evt of this.events()) {
            const time = this.formatTime(evt.timestamp);
            lines.push(`[${time}] EVENT(${evt.eventType}): ${JSON.stringify(evt.data)}`);
        }

        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            this.logCopied.set(true);
            setTimeout(() => this.logCopied.set(false), 2000);
        });
    }

    private formatTime(timestamp: string): string {
        const d = new Date(timestamp);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        const s = d.getSeconds().toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    protected async onDelete(): Promise<void> {
        if (!this.sessionId) return;
        await this.sessionService.deleteSession(this.sessionId);
        this.router.navigate(['/sessions']);
    }
}
