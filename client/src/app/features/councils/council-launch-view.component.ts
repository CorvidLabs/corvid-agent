import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { SessionOutputComponent } from '../sessions/session-output.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import type { CouncilLaunch, CouncilLaunchLog, CouncilDiscussionMessage } from '../../core/models/council.model';
import type { Session } from '../../core/models/session.model';
import type { ServerWsMessage, StreamEvent } from '../../core/models/ws-message.model';

@Component({
    selector: 'app-council-launch-view',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, DatePipe, DecimalPipe, SessionOutputComponent, StatusBadgeComponent],
    template: `
        @if (launch(); as l) {
            <div class="page">
                <div class="page__header">
                    <div>
                        <h2>Council Launch</h2>
                        <p class="page__prompt">{{ l.prompt }}</p>
                    </div>
                    <a class="btn btn--secondary" [routerLink]="['/councils', l.councilId]">Back to Council</a>
                </div>

                <div class="stage-bar">
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'responding'" [class.stage-step--done]="stageIndex() > 0">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Responding</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 0"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'discussing'" [class.stage-step--done]="stageIndex() > 1">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Discussing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 1"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'reviewing'" [class.stage-step--done]="stageIndex() > 2">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Reviewing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 2"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'synthesizing'" [class.stage-step--done]="stageIndex() > 3">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Synthesizing</span>
                    </div>
                    <div class="stage-connector" [class.stage-connector--done]="stageIndex() > 3"></div>
                    <div class="stage-step" [class.stage-step--active]="l.stage === 'complete'" [class.stage-step--done]="l.stage === 'complete'">
                        <span class="stage-dot"></span>
                        <span class="stage-label">Complete</span>
                    </div>
                </div>

                <div class="actions">
                    @if (l.stage === 'responding') {
                        @if (allMembersDone()) {
                            <span class="auto-label">Auto-advancing to discussion...</span>
                        }
                        <button
                            class="btn btn--secondary btn--sm"
                            [disabled]="!allMembersDone() || triggeringReview()"
                            (click)="onStartReview()"
                        >{{ triggeringReview() ? 'Starting...' : 'Skip Discussion & Start Review' }}</button>
                    }
                    @if (l.stage === 'discussing') {
                        <span class="auto-label">
                            Agents are discussing... (Round {{ l.currentDiscussionRound }}/{{ l.totalDiscussionRounds }})
                        </span>
                    }
                    @if (l.stage === 'reviewing' && hasChairman()) {
                        @if (allReviewsDone()) {
                            <span class="auto-label">Auto-advancing to synthesis...</span>
                        }
                        <button
                            class="btn btn--secondary btn--sm"
                            [disabled]="!allReviewsDone() || triggeringSynthesis()"
                            (click)="onSynthesize()"
                        >{{ triggeringSynthesis() ? 'Starting...' : 'Synthesize Now' }}</button>
                    }
                    <button class="btn btn--secondary btn--sm" (click)="logsOpen.set(!logsOpen())">
                        {{ logsOpen() ? 'Hide' : 'Show' }} Logs ({{ logs().length }})
                    </button>
                </div>

                @if (logsOpen()) {
                    <div class="log-panel" role="log" aria-label="Council activity log">
                        @for (entry of logs(); track entry.id) {
                            <div class="log-entry" [class]="'log-entry--' + entry.level">
                                <span class="log-ts">{{ entry.createdAt | date:'HH:mm:ss' }}</span>
                                <span class="log-level">{{ entry.level }}</span>
                                <span class="log-msg">{{ entry.message }}</span>
                                @if (entry.detail) {
                                    <span class="log-detail">{{ entry.detail }}</span>
                                }
                            </div>
                        } @empty {
                            <div class="log-empty">No log entries yet</div>
                        }
                    </div>
                }

                <h3 class="section-title">Member Responses</h3>
                <div class="grid">
                    @for (session of memberSessions(); track session.id) {
                        <div class="grid-card">
                            <div class="grid-card__header">
                                <span class="grid-card__name">{{ getAgentName(session.agentId) }}</span>
                                <app-status-badge [status]="session.status" />
                                @if (session.totalCostUsd > 0) {
                                    <span class="grid-card__cost">{{ session.totalCostUsd | number:'1.4-4' }} USD</span>
                                }
                            </div>
                            @if (session.status === 'running') {
                                <div class="grid-card__loading">
                                    <span class="spinner"></span>
                                    <span>{{ getActivity(session.agentId) || 'Agent is responding...' }}</span>
                                </div>
                            }
                            <div class="grid-card__output">
                                <app-session-output
                                    [messages]="getMessages(session.id)"
                                    [events]="getEvents(session.id)"
                                    [isRunning]="session.status === 'running'"
                                />
                            </div>
                        </div>
                    }
                </div>

                @if (discussionMessages().length > 0 || l.stage === 'discussing') {
                    <h3 class="section-title">Discussion</h3>
                    @if (l.stage === 'discussing') {
                        <div class="discussion-loading">
                            <span class="spinner"></span>
                            <span>Agents are discussing... (Round {{ l.currentDiscussionRound }}/{{ l.totalDiscussionRounds }})</span>
                        </div>
                    }
                    <div class="discussion-timeline" role="log" aria-label="Council discussion">
                        @for (msg of discussionMessages(); track msg.id) {
                            <div class="discussion-msg">
                                <div class="discussion-msg__header">
                                    <span class="discussion-msg__name">{{ msg.agentName }}</span>
                                    <span class="discussion-msg__round">R{{ msg.round }}</span>
                                    <span class="discussion-msg__time">{{ msg.createdAt | date:'HH:mm:ss' }}</span>
                                    @if (msg.txid) {
                                        <a class="discussion-msg__tx"
                                           href="https://lora.algokit.io/{{ explorerNetwork() }}/transaction/{{ msg.txid }}"
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           aria-label="View transaction on chain"
                                        >tx</a>
                                    }
                                </div>
                                <pre class="discussion-msg__content">{{ msg.content }}</pre>
                            </div>
                        } @empty {
                            @if (l.stage !== 'discussing') {
                                <div class="discussion-empty">No discussion messages yet.</div>
                            }
                        }
                    </div>
                }

                @if (reviewSessions().length > 0) {
                    <h3 class="section-title">Peer Reviews</h3>
                    <div class="grid">
                        @for (session of reviewSessions(); track session.id) {
                            <div class="grid-card">
                                <div class="grid-card__header">
                                    <span class="grid-card__name">{{ getAgentName(session.agentId) }}</span>
                                    <app-status-badge [status]="session.status" />
                                    @if (session.totalCostUsd > 0) {
                                        <span class="grid-card__cost">{{ session.totalCostUsd | number:'1.4-4' }} USD</span>
                                    }
                                </div>
                                @if (session.status === 'running') {
                                    <div class="grid-card__loading">
                                        <span class="spinner"></span>
                                        <span>{{ getActivity(session.agentId) || 'Reviewing responses...' }}</span>
                                    </div>
                                }
                                <div class="grid-card__output">
                                    <app-session-output
                                        [messages]="getMessages(session.id)"
                                        [events]="getEvents(session.id)"
                                        [isRunning]="session.status === 'running'"
                                    />
                                </div>
                            </div>
                        }
                    </div>
                }

                @if (l.stage === 'complete') {
                    <div class="synthesis" [class.synthesis--empty]="!l.synthesis">
                        <div class="synthesis__header">
                            <span class="synthesis__icon" aria-hidden="true">&#10003;</span>
                            <h3 class="synthesis__title">Council Decision</h3>
                        </div>
                        @if (l.synthesis) {
                            <pre class="synthesis__content">{{ l.synthesis }}</pre>
                        } @else {
                            <p class="synthesis__warning">No synthesis was produced for this council launch.</p>
                        }
                    </div>
                }
            </div>
        } @else {
            <div class="page"><p>Loading...</p></div>
        }
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__prompt { margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.9rem; max-width: 600px; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; text-decoration: none; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .btn--secondary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--sm { font-size: 0.7rem; padding: 0.35rem 0.75rem; }

        .auto-label {
            font-size: 0.8rem; color: var(--accent-cyan); font-weight: 600;
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .stage-bar {
            display: flex; align-items: center; gap: 0; margin-bottom: 1.5rem;
            padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
        }
        .stage-step { display: flex; align-items: center; gap: 0.5rem; }
        .stage-dot {
            width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border-bright);
            background: transparent; transition: all 0.2s;
        }
        .stage-step--active .stage-dot { border-color: var(--accent-cyan); background: var(--accent-cyan); box-shadow: 0 0 8px rgba(0, 229, 255, 0.4); }
        .stage-step--done .stage-dot { border-color: var(--accent-green); background: var(--accent-green); }
        .stage-label { font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .stage-step--active .stage-label { color: var(--accent-cyan); }
        .stage-step--done .stage-label { color: var(--accent-green); }
        .stage-connector { flex: 1; height: 2px; background: var(--border); margin: 0 0.5rem; min-width: 20px; }
        .stage-connector--done { background: var(--accent-green); }

        .actions { margin-bottom: 1.5rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .section-title { margin: 1.5rem 0 0.75rem; color: var(--text-primary); }

        .log-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 0.5rem; margin-bottom: 1.5rem; max-height: 250px; overflow-y: auto;
            font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.75rem; line-height: 1.6;
        }
        .log-entry { display: flex; gap: 0.5rem; padding: 0.15rem 0.5rem; border-radius: 2px; }
        .log-entry:hover { background: var(--bg-hover); }
        .log-ts { color: var(--text-tertiary); flex-shrink: 0; }
        .log-level {
            flex-shrink: 0; width: 3.5em; text-transform: uppercase; font-weight: 700;
        }
        .log-entry--info .log-level { color: var(--accent-cyan); }
        .log-entry--stage .log-level { color: var(--accent-green); }
        .log-entry--warn .log-level { color: var(--accent-yellow, #fbbf24); }
        .log-entry--error .log-level { color: var(--accent-red, #f87171); }
        .log-msg { color: var(--text-primary); }
        .log-detail { color: var(--text-tertiary); }
        .log-empty { color: var(--text-tertiary); padding: 0.5rem; text-align: center; }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 1rem;
        }
        .grid-card {
            display: flex; flex-direction: column;
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
            overflow: hidden;
        }
        .grid-card__header {
            display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border); background: var(--bg-raised);
        }
        .grid-card__name { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
        .grid-card__cost { font-size: 0.7rem; color: var(--text-tertiary); margin-left: auto; }
        .grid-card__output { height: 300px; overflow-y: auto; display: flex; flex-direction: column; }

        .grid-card__loading {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.5rem 1rem; font-size: 0.75rem; color: var(--accent-cyan);
            border-bottom: 1px solid var(--border); background: var(--bg-surface);
        }
        .spinner {
            width: 14px; height: 14px; border: 2px solid var(--border-bright);
            border-top-color: var(--accent-cyan); border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .discussion-loading {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.75rem; font-size: 0.8rem; color: var(--accent-cyan);
            animation: pulse 1.5s ease-in-out infinite;
        }
        .discussion-timeline {
            display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;
        }
        .discussion-msg {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            overflow: hidden;
        }
        .discussion-msg__header {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); background: var(--bg-raised);
        }
        .discussion-msg__name { font-weight: 600; font-size: 0.8rem; color: var(--text-primary); }
        .discussion-msg__round {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--accent-cyan-dim, rgba(0, 229, 255, 0.1)); color: var(--accent-cyan);
            font-weight: 700; text-transform: uppercase;
        }
        .discussion-msg__time { font-size: 0.7rem; color: var(--text-tertiary); margin-left: auto; }
        .discussion-msg__tx {
            font-size: 0.65rem; padding: 1px 5px; border-radius: var(--radius-sm);
            background: var(--bg-raised); border: 1px solid var(--border-bright);
            color: var(--accent-magenta); text-decoration: none; font-weight: 600;
        }
        .discussion-msg__tx:hover { background: var(--bg-hover); }
        .discussion-msg__content {
            padding: 0.75rem; font-size: 0.8rem; margin: 0;
            white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            line-height: 1.5; max-height: 200px; overflow-y: auto;
        }
        .discussion-empty { color: var(--text-tertiary); font-size: 0.8rem; padding: 0.5rem; }

        .synthesis {
            margin-top: 1.5rem; border: 1px solid var(--accent-green); border-radius: var(--radius-lg);
            background: var(--bg-surface); box-shadow: 0 0 16px rgba(0, 255, 136, 0.08);
        }
        .synthesis--empty { border-color: var(--accent-yellow, #fbbf24); box-shadow: 0 0 12px rgba(251, 191, 36, 0.06); }
        .synthesis__header {
            display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem;
            border-bottom: 1px solid var(--border); background: var(--bg-raised); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }
        .synthesis__icon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 22px; height: 22px; border-radius: 50%;
            background: var(--accent-green); color: var(--bg-base, #0a0f1a);
            font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
        }
        .synthesis--empty .synthesis__icon { background: var(--accent-yellow, #fbbf24); }
        .synthesis__title { margin: 0; font-size: 0.95rem; color: var(--accent-green); font-weight: 700; }
        .synthesis--empty .synthesis__title { color: var(--accent-yellow, #fbbf24); }
        .synthesis__content {
            padding: 1.25rem; font-size: 0.85rem; margin: 0;
            white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            line-height: 1.6;
        }
        .synthesis__warning {
            padding: 1rem 1.25rem; margin: 0; font-size: 0.85rem;
            color: var(--accent-yellow, #fbbf24); font-style: italic;
        }
    `,
})
export class CouncilLaunchViewComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);
    private readonly wsService = inject(WebSocketService);

    protected readonly launch = signal<CouncilLaunch | null>(null);
    protected readonly hasChairman = signal(false);
    protected readonly allSessions = signal<Session[]>([]);
    protected readonly logs = signal<CouncilLaunchLog[]>([]);
    protected readonly discussionMessages = signal<CouncilDiscussionMessage[]>([]);
    protected readonly logsOpen = signal(true);
    protected readonly triggeringReview = signal(false);
    protected readonly triggeringSynthesis = signal(false);

    private agentNameMap: Record<string, string> = {};
    private agentIdBySession: Record<string, string> = {};
    private sessionMessages = signal<Map<string, import('../../core/models/session.model').SessionMessage[]>>(new Map());
    private sessionEvents = signal<Map<string, StreamEvent[]>>(new Map());
    protected readonly agentActivity = signal<Map<string, string>>(new Map());
    private unsubscribeWs: (() => void) | null = null;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;
    private activityTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    protected readonly memberSessions = computed(() =>
        this.allSessions().filter((s) => s.councilRole === 'member')
    );

    protected readonly reviewSessions = computed(() =>
        this.allSessions().filter((s) => s.councilRole === 'reviewer')
    );

    protected readonly stageIndex = computed(() => {
        const l = this.launch();
        if (!l) return 0;
        const stages = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];
        return stages.indexOf(l.stage);
    });

    protected readonly allMembersDone = computed(() => {
        const members = this.memberSessions();
        return members.length > 0 && members.every((s) => s.status !== 'running');
    });

    protected readonly allReviewsDone = computed(() => {
        const reviews = this.reviewSessions();
        return reviews.length > 0 && reviews.every((s) => s.status !== 'running');
    });

    protected readonly explorerNetwork = computed(() => {
        const status = this.sessionService.algochatStatus();
        return status?.network ?? 'testnet';
    });

    async ngOnInit(): Promise<void> {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) return;

        await this.agentService.loadAgents();
        for (const a of this.agentService.agents()) {
            this.agentNameMap[a.id] = a.name;
        }

        // Load AlgoChat status for explorer network URL
        this.sessionService.loadAlgoChatStatus().catch(() => { /* ignore */ });

        await this.loadLaunchData(id);

        // Load existing logs and discussion messages
        try {
            const existingLogs = await this.councilService.getLaunchLogs(id);
            this.logs.set(existingLogs);
        } catch { /* ignore */ }

        try {
            const existingMessages = await this.councilService.getDiscussionMessages(id);
            this.discussionMessages.set(existingMessages);
        } catch { /* ignore */ }

        // Subscribe to session events for live updates
        for (const session of this.allSessions()) {
            this.sessionService.subscribeToSession(session.id);
        }

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'session_event') {
                const events = new Map(this.sessionEvents());
                const existing = events.get(msg.sessionId) ?? [];
                events.set(msg.sessionId, [...existing, msg.event]);
                this.sessionEvents.set(events);
            }
            if (msg.type === 'session_status') {
                this.refreshSessions();
            }
            if (msg.type === 'council_stage_change' && msg.launchId === id) {
                this.loadLaunchData(id);
            }
            if (msg.type === 'council_log' && msg.log.launchId === id) {
                this.logs.update((prev) => [...prev, msg.log]);
            }
            if (msg.type === 'council_discussion_message' && msg.message.launchId === id) {
                this.discussionMessages.update((prev) => [...prev, msg.message]);
            }
            if (msg.type === 'chat_thinking') {
                this.setActivity(msg.agentId, msg.active ? 'Thinking...' : '');
            }
            if (msg.type === 'chat_tool_use') {
                this.setActivity(msg.agentId, `Using ${msg.toolName}`, 3000);
            }
            if (msg.type === 'algochat_message') {
                const label = msg.direction === 'outbound' ? `Sending message to ${msg.participant}` : `Message from ${msg.participant}`;
                this.setActivity(msg.participant, label, 4000);
            }
        });

        // Periodically refresh to pick up stage changes (fallback for missed WS messages)
        this.refreshInterval = setInterval(() => this.refreshLaunch(id), 5000);
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        for (const timer of this.activityTimers.values()) {
            clearTimeout(timer);
        }
        for (const session of this.allSessions()) {
            this.sessionService.unsubscribeFromSession(session.id);
        }
    }

    protected getAgentName(agentId: string | null): string {
        if (!agentId) return 'Unknown';
        return this.agentNameMap[agentId] ?? agentId.slice(0, 8);
    }

    protected getActivity(agentId: string | null): string {
        if (!agentId) return '';
        return this.agentActivity().get(agentId) ?? '';
    }

    private setActivity(agentId: string, text: string, autoClearMs?: number): void {
        const map = new Map(this.agentActivity());
        if (text) {
            map.set(agentId, text);
        } else {
            map.delete(agentId);
        }
        this.agentActivity.set(map);

        // Clear previous timer for this agent
        const existing = this.activityTimers.get(agentId);
        if (existing) clearTimeout(existing);

        if (text && autoClearMs) {
            this.activityTimers.set(agentId, setTimeout(() => {
                const m = new Map(this.agentActivity());
                m.delete(agentId);
                this.agentActivity.set(m);
            }, autoClearMs));
        }
    }

    protected getMessages(sessionId: string): import('../../core/models/session.model').SessionMessage[] {
        return this.sessionMessages().get(sessionId) ?? [];
    }

    protected getEvents(sessionId: string): StreamEvent[] {
        return this.sessionEvents().get(sessionId) ?? [];
    }

    protected async onStartReview(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        this.triggeringReview.set(true);
        try {
            await this.councilService.triggerReview(l.id);
            await this.loadLaunchData(l.id);
        } finally {
            this.triggeringReview.set(false);
        }
    }

    protected async onSynthesize(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        this.triggeringSynthesis.set(true);
        try {
            await this.councilService.triggerSynthesis(l.id);
            await this.loadLaunchData(l.id);
        } finally {
            this.triggeringSynthesis.set(false);
        }
    }

    private async loadLaunchData(launchId: string): Promise<void> {
        const launch = await this.councilService.getCouncilLaunch(launchId);
        this.launch.set(launch);

        try {
            const council = await this.councilService.getCouncil(launch.councilId);
            this.hasChairman.set(!!council.chairmanAgentId);
        } catch { /* ignore */ }

        const sessions: Session[] = [];
        const messagesMap = new Map<string, import('../../core/models/session.model').SessionMessage[]>();

        for (const sessionId of launch.sessionIds) {
            try {
                const session = await this.sessionService.getSession(sessionId);
                sessions.push(session);
                const messages = await this.sessionService.getMessages(sessionId);
                messagesMap.set(sessionId, messages);
            } catch { /* ignore */ }
        }

        this.allSessions.set(sessions);
        this.sessionMessages.set(messagesMap);

        for (const session of sessions) {
            if (session.agentId) {
                this.agentIdBySession[session.id] = session.agentId;
            }
            this.sessionService.subscribeToSession(session.id);
        }
    }

    private async refreshSessions(): Promise<void> {
        const l = this.launch();
        if (!l) return;
        const sessions: Session[] = [];
        for (const sessionId of l.sessionIds) {
            try {
                sessions.push(await this.sessionService.getSession(sessionId));
            } catch { /* ignore */ }
        }
        this.allSessions.set(sessions);
    }

    private async refreshLaunch(launchId: string): Promise<void> {
        try {
            const launch = await this.councilService.getCouncilLaunch(launchId);
            const current = this.launch();
            if (current && (launch.stage !== current.stage || launch.sessionIds.length !== current.sessionIds.length)) {
                this.launch.set(launch);
                if (launch.sessionIds.length !== current.sessionIds.length) {
                    await this.loadLaunchData(launchId);
                }
            }
        } catch { /* ignore */ }
    }
}
