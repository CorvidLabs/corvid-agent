import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { SessionService } from '../../core/services/session.service';
import { AgentService } from '../../core/services/agent.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { SessionOutputComponent } from './session-output.component';
import { SessionInputComponent } from './session-input.component';
import { SessionMemoryComponent } from './session-memory.component';
import { ApprovalDialogComponent, type ApprovalDecision } from './approval-dialog.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import type { Session, SessionMessage } from '../../core/models/session.model';
import type { StreamEvent, ApprovalRequestWire, OwnerQuestionWire } from '@shared/ws-protocol';
import { NotificationService } from '../../core/services/notification.service';
import { ChatTabsService } from '../../core/services/chat-tabs.service';

type SessionTab = 'conversation' | 'memory' | 'info';

@Component({
    selector: 'app-session-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent, SessionOutputComponent, SessionInputComponent, SessionMemoryComponent, ApprovalDialogComponent, DecimalPipe, RelativeTimePipe],
    template: `
        @if (session(); as s) {
            <div class="session-view">
                <div class="session-view__header">
                    <div class="session-view__info">
                        <h2>{{ s.name || s.id.slice(0, 8) }}</h2>
                        <app-status-badge [status]="s.status" />
                        @if (s.status === 'running' || s.status === 'thinking' || s.status === 'tool_use') {
                            <span class="session-view__live-dot" title="Session is active"></span>
                        }
                    </div>
                    <div class="session-view__meta">
                        <span class="meta-item"><span class="meta-label">Agent</span> {{ agentName() }}</span>
                        <span class="meta-item"><span class="meta-label">Turns</span> {{ s.totalTurns }}</span>
                        <span class="meta-item"><span class="meta-label">Cost</span> {{ '$' + (s.totalCostUsd | number:'1.2-4') }}</span>
                        <span class="meta-item"><span class="meta-label">Source</span> {{ s.source }}</span>
                        <span class="meta-item">{{ s.updatedAt | relativeTime }}</span>
                    </div>
                    <div class="session-view__actions">
                        <div class="export-group">
                            <button class="btn btn--secondary" (click)="onCopyLog()">
                                {{ logCopied() ? 'Copied!' : 'Copy Log' }}
                            </button>
                            <button class="btn btn--secondary" (click)="onExportJson()">JSON</button>
                            <button class="btn btn--secondary" (click)="onExportMarkdown()">MD</button>
                        </div>
                        @if (s.status === 'running' || s.status === 'loading' || s.status === 'thinking' || s.status === 'tool_use') {
                            <button class="btn btn--danger" (click)="onStop()">Stop</button>
                        } @else {
                            <button class="btn btn--primary" (click)="onResume()">Resume</button>
                        }
                        <button class="btn btn--secondary" (click)="showDeleteConfirm.set(true)">Delete</button>
                        <div class="mobile-menu-wrapper">
                            <button class="btn btn--secondary mobile-menu-btn" (click)="showMobileMenu.set(!showMobileMenu())" title="More actions">···</button>
                            @if (showMobileMenu()) {
                                <div class="mobile-menu-backdrop" (click)="showMobileMenu.set(false)"></div>
                                <div class="mobile-menu">
                                    <button class="mobile-menu__item" (click)="onCopyLog(); showMobileMenu.set(false)">
                                        {{ logCopied() ? 'Copied!' : 'Copy Log' }}
                                    </button>
                                    <button class="mobile-menu__item" (click)="onExportJson(); showMobileMenu.set(false)">Export JSON</button>
                                    <button class="mobile-menu__item" (click)="onExportMarkdown(); showMobileMenu.set(false)">Export Markdown</button>
                                </div>
                            }
                        </div>
                    </div>
                </div>

                <!-- Tab bar -->
                <div class="session-view__tab-bar" role="tablist">
                    <button class="session-view__tab" [class.session-view__tab--active]="activeTab() === 'conversation'" (click)="activeTab.set('conversation')" role="tab">Conversation</button>
                    @if (s.agentId) {
                        <button class="session-view__tab" [class.session-view__tab--active]="activeTab() === 'memory'" (click)="activeTab.set('memory')" role="tab">Memory</button>
                    }
                    <button class="session-view__tab" [class.session-view__tab--active]="activeTab() === 'info'" (click)="activeTab.set('info')" role="tab">Info</button>
                </div>

                @if (activeTab() === 'conversation') {
                    <app-session-output [messages]="messages()" [events]="events()" [isRunning]="s.status === 'running' || s.status === 'loading' || s.status === 'thinking' || s.status === 'tool_use'" [agentName]="agentName()" />

                    <app-session-input
                        [disabled]="false"
                        [placeholder]="s.status === 'running' || s.status === 'loading' || s.status === 'thinking' || s.status === 'tool_use' ? 'Send message to session' : 'Send message to resume...'"
                        (messageSent)="onSendMessage($event)" />
                }

                @if (activeTab() === 'memory' && s.agentId) {
                    <app-session-memory [agentId]="s.agentId" />
                }

                @if (activeTab() === 'info') {
                    <div class="session-view__info-panel">
                        <dl class="info-grid">
                            <dt>Session ID</dt><dd class="mono">{{ s.id }}</dd>
                            <dt>Agent</dt><dd>{{ agentName() }}@if (s.agentId) { <span class="mono text-tertiary"> ({{ s.agentId.slice(0, 8) }}…)</span> }</dd>
                            <dt>Status</dt><dd><app-status-badge [status]="s.status" /></dd>
                            <dt>Source</dt><dd>{{ s.source }}</dd>
                            <dt>Turns</dt><dd>{{ s.totalTurns }}</dd>
                            <dt>Cost</dt><dd>{{ '$' + (s.totalCostUsd | number:'1.2-4') }}</dd>
                            <dt>Created</dt><dd>{{ s.createdAt | relativeTime }}</dd>
                            <dt>Updated</dt><dd>{{ s.updatedAt | relativeTime }}</dd>
                            @if (s.projectId) {
                                <dt>Project</dt><dd class="mono">{{ s.projectId }}</dd>
                            }
                        </dl>
                    </div>
                }
            </div>

            @if (pendingApproval(); as approval) {
                <app-approval-dialog
                    [request]="approval"
                    (decided)="onApprovalDecision($event)" />
            }

            @if (pendingQuestion(); as q) {
                <div class="question-card" [class]="'question-card--' + (q.context ? 'with-context' : 'simple')">
                    <div class="question-card__header">Agent Question</div>
                    <p class="question-card__text">{{ q.question }}</p>
                    @if (q.context) {
                        <p class="question-card__context">{{ q.context }}</p>
                    }
                    @if (q.options && q.options.length > 0) {
                        <div class="question-card__options">
                            @for (opt of q.options; track opt; let i = $index) {
                                <button class="btn btn--secondary" (click)="onQuestionOption(q, i, opt)">{{ opt }}</button>
                            }
                        </div>
                    } @else {
                        <div class="question-card__input">
                            <input #answerInput type="text" placeholder="Type your answer..."
                                (keyup.enter)="onQuestionAnswer(q, answerInput.value); answerInput.value = ''" />
                            <button class="btn btn--primary" (click)="onQuestionAnswer(q, answerInput.value); answerInput.value = ''">Send</button>
                        </div>
                    }
                </div>
            }
            @if (showDeleteConfirm()) {
                <div class="confirm-overlay" (click)="showDeleteConfirm.set(false)">
                    <div class="confirm-dialog" (click)="$event.stopPropagation()">
                        <h3 class="confirm-dialog__title">Delete session?</h3>
                        <p class="confirm-dialog__text">This will permanently delete this session and all its messages. This cannot be undone.</p>
                        <div class="confirm-dialog__actions">
                            <button class="btn btn--secondary" (click)="showDeleteConfirm.set(false)">Cancel</button>
                            <button class="btn btn--danger" (click)="onDelete()">Delete</button>
                        </div>
                    </div>
                </div>
            }
        } @else {
            <div class="session-view__loading">
                <div class="skeleton skeleton--title"></div>
                <div class="skeleton skeleton--line"></div>
                <div class="skeleton skeleton--line skeleton--short"></div>
                <div class="skeleton skeleton--line"></div>
                <div class="skeleton skeleton--line skeleton--medium"></div>
            </div>
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
        .session-view__tab-bar {
            display: flex;
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .session-view__tab {
            padding: 0.5rem 1rem;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
        }
        .session-view__tab:hover { color: var(--text-primary); }
        .session-view__tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }
        .session-view__info-panel {
            flex: 1;
            overflow-y: auto;
            padding: 1.25rem;
        }
        .info-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 0.5rem 1rem;
            margin: 0;
            font-size: 0.8rem;
        }
        .info-grid dt {
            color: var(--text-tertiary);
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
            padding-top: 0.1rem;
        }
        .info-grid dd {
            margin: 0;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .mono { font-family: var(--font-mono, monospace); font-size: 0.75rem; }
        .text-tertiary { color: var(--text-tertiary); }
        .session-view__header {
            display: flex; align-items: center; gap: 1rem;
            padding: 0.75rem 1rem;
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
        }
        .session-view__info { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
        .session-view__info h2 { margin: 0; font-size: 1rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .session-view__live-dot {
            width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
            background: var(--accent-green);
            box-shadow: 0 0 6px var(--accent-green-glow);
            animation: livePulse 1.5s ease-in-out infinite;
        }
        @keyframes livePulse {
            0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--accent-green-glow); }
            50% { opacity: 0.5; box-shadow: 0 0 12px var(--accent-green-glow); }
        }
        .session-view__meta { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--text-secondary); margin-left: auto; flex-wrap: wrap; align-items: center; }
        .meta-item { white-space: nowrap; }
        .meta-label { color: var(--text-tertiary); text-transform: uppercase; font-size: 0.6rem; letter-spacing: 0.05em; margin-right: 0.2rem; }
        .session-view__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .export-group { display: flex; gap: 0.25rem; }
        .btn {
            padding: 0.375rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }

        /* Mobile: compact header — hide meta, shrink actions */
        @media (max-width: 767px) {
            .session-view__header {
                flex-wrap: wrap;
                padding: 0.5rem 0.75rem;
                gap: 0.5rem;
            }
            .session-view__meta {
                display: none;
            }
            .session-view__actions {
                gap: 0.25rem;
            }
            .export-group {
                display: none;
            }
            .btn {
                padding: 0.25rem 0.5rem;
                font-size: 0.65rem;
            }
            .question-card {
                margin: 0.5rem 0.5rem;
                padding: 0.75rem;
            }
            .question-card__options { gap: 0.375rem; }
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); box-shadow: 0 0 8px var(--accent-red-border); }
        .page { padding: 1.5rem; color: var(--text-primary); }
        .question-card {
            margin: 0.75rem 1rem; padding: 1rem; border-radius: var(--radius);
            background: var(--bg-surface); border: 1px solid var(--accent-cyan);
            box-shadow: var(--glow-cyan);
        }
        .question-card__header { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-cyan); margin-bottom: 0.5rem; font-weight: 700; }
        .question-card__text { margin: 0 0 0.5rem; color: var(--text-primary); font-size: 0.875rem; }
        .question-card__context { margin: 0 0 0.75rem; color: var(--text-secondary); font-size: 0.75rem; font-style: italic; }
        .question-card__options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .question-card__input { display: flex; gap: 0.5rem; }
        .question-card__input input {
            flex: 1; padding: 0.375rem 0.75rem; border-radius: var(--radius);
            background: var(--bg-primary); border: 1px solid var(--border-bright);
            color: var(--text-primary); font-size: 0.8rem; font-family: inherit;
        }
        .question-card__input input:focus { outline: none; border-color: var(--accent-cyan); }

        /* Delete confirmation overlay */
        .confirm-overlay {
            position: fixed; inset: 0; z-index: 1000;
            background: var(--overlay-heavy); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.15s ease;
        }
        .confirm-dialog {
            background: var(--bg-surface); border: 1px solid var(--border-bright);
            border-radius: var(--radius-lg); padding: 1.5rem;
            max-width: 400px; width: 90%; box-shadow: 0 8px 32px var(--overlay);
            animation: slideUp 0.2s ease;
        }
        .confirm-dialog__title { margin: 0 0 0.5rem; font-size: 1rem; color: var(--text-primary); }
        .confirm-dialog__text { margin: 0 0 1.25rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5; }
        .confirm-dialog__actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* Mobile overflow menu */
        .mobile-menu-wrapper { display: none; position: relative; z-index: 100; }
        .mobile-menu-btn { font-size: 0.9rem; letter-spacing: 0.15em; }
        .mobile-menu-backdrop { position: fixed; inset: 0; z-index: 99; }
        .mobile-menu {
            position: absolute; right: 0; top: 100%; z-index: 101;
            background: var(--bg-surface); border: 1px solid var(--border-bright);
            border-radius: var(--radius); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            min-width: 160px; overflow: hidden; animation: slideUp 0.15s ease;
        }
        .mobile-menu__item {
            display: block; width: 100%; padding: 0.6rem 0.75rem;
            background: none; border: none; border-bottom: 1px solid var(--border);
            color: var(--text-primary); font-family: inherit; font-size: 0.75rem;
            text-align: left; cursor: pointer; transition: background 0.1s;
        }
        .mobile-menu__item:last-child { border-bottom: none; }
        .mobile-menu__item:hover { background: var(--bg-hover); }

        /* Loading skeleton */
        .session-view__loading { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .skeleton {
            height: 14px; border-radius: 4px;
            background: linear-gradient(90deg, var(--bg-surface) 25%, rgba(255,255,255,0.04) 50%, var(--bg-surface) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s ease-in-out infinite;
        }
        .skeleton--title { height: 20px; width: 40%; margin-bottom: 0.5rem; }
        .skeleton--line { width: 100%; }
        .skeleton--short { width: 55%; }
        .skeleton--medium { width: 80%; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        @media (max-width: 767px) {
            .mobile-menu-wrapper { display: block; }
        }
    `,
})
export class SessionViewComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly sessionService = inject(SessionService);
    private readonly agentService = inject(AgentService);
    private readonly wsService = inject(WebSocketService);
    private readonly notifications = inject(NotificationService);
    private readonly chatTabs = inject(ChatTabsService);

    protected readonly session = signal<Session | null>(null);
    protected readonly agentName = signal('assistant');
    protected readonly messages = signal<SessionMessage[]>([]);
    protected readonly logCopied = signal(false);
    protected readonly pendingApproval = signal<ApprovalRequestWire | null>(null);
    protected readonly pendingQuestion = signal<OwnerQuestionWire | null>(null);
    protected readonly showDeleteConfirm = signal(false);
    protected readonly showMobileMenu = signal(false);
    protected readonly activeTab = signal<SessionTab>('conversation');

    protected readonly events = computed(() => {
        const s = this.session();
        if (!s) return [];
        return this.sessionService.activeEvents().get(s.id) ?? [];
    });

    private sessionId: string | null = null;
    private approvalCleanup: (() => void) | null = null;
    private questionTimeout: ReturnType<typeof setTimeout> | null = null;
    private paramSub: Subscription | null = null;

    ngOnInit(): void {
        this.paramSub = this.route.paramMap.subscribe((params) => {
            const newId = params.get('id');
            if (!newId || newId === this.sessionId) return;
            this.cleanupCurrentSession();
            this.sessionId = newId;
            this.chatTabs.activeSessionId.set(newId);
            this.loadSession(newId);
        });
    }

    private async loadSession(sid: string): Promise<void> {
        // Reset state for new session
        this.session.set(null);
        this.messages.set([]);
        this.agentName.set('assistant');
        this.pendingApproval.set(null);
        this.pendingQuestion.set(null);
        this.activeTab.set('conversation');

        // Subscribe to WebSocket FIRST so no events are missed during HTTP fetch
        this.sessionService.subscribeToSession(sid);
        this.approvalCleanup = this.wsService.onMessage((msg) => {
            if (msg.type === 'approval_request' && msg.request.sessionId === sid) {
                this.pendingApproval.set(msg.request);
            }
            if (msg.type === 'session_status' && msg.sessionId === sid) {
                this.session.update((cur) => cur ? { ...cur, status: msg.status as Session['status'] } : cur);
                this.chatTabs.updateTabStatus(sid, msg.status as string);
            }
            if (msg.type === 'agent_notification' && msg.sessionId === sid) {
                const level = msg.level as 'info' | 'warning' | 'success' | 'error';
                const text = msg.title ? `${msg.title}: ${msg.message}` : msg.message;
                if (level === 'error') this.notifications.error(text);
                else if (level === 'warning') this.notifications.warning(text);
                else if (level === 'success') this.notifications.success(text);
                else this.notifications.info(text);
            }
            if (msg.type === 'agent_question' && msg.question.sessionId === sid) {
                this.pendingQuestion.set(msg.question);
                // Auto-dismiss on timeout
                if (this.questionTimeout) clearTimeout(this.questionTimeout);
                this.questionTimeout = setTimeout(() => {
                    this.pendingQuestion.set(null);
                    this.questionTimeout = null;
                }, msg.question.timeoutMs);
            }
        });

        // Fetch session and messages in parallel
        let session: Session;
        let messages: SessionMessage[];
        try {
            [session, messages] = await Promise.all([
                this.sessionService.getSession(sid),
                this.sessionService.getMessages(sid),
            ]);
        } catch {
            // Session no longer exists — close the stale tab and navigate away
            this.chatTabs.closeTab(sid);
            this.router.navigate(['/chat']);
            return;
        }
        this.session.set(session);
        this.messages.set(messages);

        // Register tab — if we've already navigated away, register passively (don't hijack active session)
        const tabLabel = session.name || session.initialPrompt?.slice(0, 40) || session.id.slice(0, 8);
        const isCurrentSession = this.sessionId === sid;
        this.chatTabs.openTab(session.id, tabLabel, session.status, undefined, isCurrentSession);

        if (session.agentId) {
            this.agentService.getAgent(session.agentId).then((agent) => {
                // Guard against stale callbacks: if we've navigated to a different session,
                // don't re-add this session's tab (fixes race where getAgent resolves after tab close)
                if (this.sessionId !== sid) return;
                this.agentName.set(agent.name);
                this.chatTabs.openTab(session.id, tabLabel, session.status, agent.name);
            }).catch(() => {});
        }
    }

    private cleanupCurrentSession(): void {
        if (this.sessionId) {
            this.sessionService.unsubscribeFromSession(this.sessionId);
        }
        this.approvalCleanup?.();
        this.approvalCleanup = null;
        if (this.questionTimeout) {
            clearTimeout(this.questionTimeout);
            this.questionTimeout = null;
        }
    }

    ngOnDestroy(): void {
        this.cleanupCurrentSession();
        this.paramSub?.unsubscribe();
    }

    protected onApprovalDecision(decision: ApprovalDecision): void {
        this.pendingApproval.set(null);
        this.wsService.sendApprovalResponse(decision.requestId, decision.behavior);
    }

    protected onQuestionOption(q: OwnerQuestionWire, index: number, option: string): void {
        this.wsService.sendQuestionResponse(q.id, option, index);
        this.pendingQuestion.set(null);
        if (this.questionTimeout) { clearTimeout(this.questionTimeout); this.questionTimeout = null; }
    }

    protected onQuestionAnswer(q: OwnerQuestionWire, answer: string): void {
        if (!answer.trim()) return;
        this.wsService.sendQuestionResponse(q.id, answer);
        this.pendingQuestion.set(null);
        if (this.questionTimeout) { clearTimeout(this.questionTimeout); this.questionTimeout = null; }
    }

    protected onSendMessage(content: string): void {
        if (!this.sessionId) return;

        const s = this.session();
        if (s && s.status !== 'running' && s.status !== 'thinking' && s.status !== 'tool_use') {
            // Session is idle/stopped — resume with the new message as prompt
            this.sessionService.resumeSession(this.sessionId, content);
            this.session.update((cur) => cur ? { ...cur, status: 'running' } : cur);
        } else {
            // Process running — send message via WebSocket
            this.sessionService.sendMessage(this.sessionId, content);
        }

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
        try {
            await this.sessionService.stopSession(this.sessionId);
            this.session.update((s) => s ? { ...s, status: 'stopped' } : s);
        } catch (e) {
            this.notifications.error('Failed to stop session', String(e));
        }
    }

    protected async onResume(): Promise<void> {
        if (!this.sessionId) return;
        try {
            await this.sessionService.resumeSession(this.sessionId);
            this.session.update((s) => s ? { ...s, status: 'running' } : s);
        } catch (e) {
            this.notifications.error('Failed to resume session', String(e));
        }
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
        }).catch(() => {
            this.notifications.error('Failed to copy to clipboard');
        });
    }

    protected onExportJson(): void {
        const s = this.session();
        if (!s) return;
        const data = {
            session: s,
            messages: this.messages(),
            exportedAt: new Date().toISOString(),
        };
        this.downloadFile(
            `session-${s.id.slice(0, 8)}.json`,
            JSON.stringify(data, null, 2),
            'application/json',
        );
    }

    protected onExportMarkdown(): void {
        const s = this.session();
        if (!s) return;
        const lines: string[] = [
            `# Session: ${s.name || s.id.slice(0, 8)}`,
            '',
            `- **Status:** ${s.status}`,
            `- **Agent:** ${this.agentName()}`,
            `- **Turns:** ${s.totalTurns}`,
            `- **Cost:** $${s.totalCostUsd.toFixed(4)}`,
            `- **Source:** ${s.source}`,
            `- **Created:** ${s.createdAt}`,
            '',
            '---',
            '',
        ];
        for (const msg of this.messages()) {
            const time = this.formatTime(msg.timestamp);
            const role = msg.role === 'assistant' ? this.agentName() : msg.role;
            lines.push(`### ${role} (${time})${msg.costUsd > 0 ? ` — $${msg.costUsd.toFixed(4)}` : ''}`);
            lines.push('');
            lines.push(msg.content);
            lines.push('');
        }
        this.downloadFile(
            `session-${s.id.slice(0, 8)}.md`,
            lines.join('\n'),
            'text/markdown',
        );
    }

    private downloadFile(filename: string, content: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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
