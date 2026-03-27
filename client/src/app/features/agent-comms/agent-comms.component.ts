import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
    OnDestroy,
    ElementRef,
    viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { WebSocketService } from '../../core/services/websocket.service';
import { AgentService } from '../../core/services/agent.service';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';
import type { ServerWsMessage } from '@shared/ws-protocol';
import type { Agent } from '../../core/models/agent.model';
import type { AgentMessage } from '../../core/models/agent-message.model';

interface CommEntry {
    id: number;
    timestamp: Date;
    fromAgent: string;
    fromAgentId: string;
    toAgent: string;
    toAgentId: string;
    channel: 'algochat' | 'agent-invoke' | 'council' | 'system';
    status: 'sent' | 'processing' | 'completed' | 'failed';
    content: string;
    response: string | null;
    fee: number | null;
    threadId: string | null;
    messageId?: string;
    colorIndex: number;
}

@Component({
    selector: 'app-agent-comms',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Agent Communications</h2>
                <div class="page__actions">
                    <span class="comms__count">{{ totalMessages() }} messages</span>
                    <button class="btn btn--secondary" (click)="toggleAutoScroll()">
                        Auto-scroll: {{ autoScroll() ? 'ON' : 'OFF' }}
                    </button>
                    <span class="comms__status" [attr.data-status]="wsConnected() ? 'on' : 'off'">
                        {{ wsConnected() ? 'LIVE' : 'OFFLINE' }}
                    </span>
                </div>
            </div>

            <div class="comms__filters">
                <div class="comms__filter-group">
                    <label class="comms__filter-label">Agent</label>
                    <select
                        class="comms__select"
                        [value]="agentFilter()"
                        (change)="onAgentFilterChange($event)"
                        aria-label="Filter by agent"
                    >
                        <option value="">All Agents</option>
                        @for (agent of agents(); track agent.id) {
                            <option [value]="agent.id">{{ agent.name }}</option>
                        }
                    </select>
                </div>
                <div class="comms__filter-group">
                    <label class="comms__filter-label">Channel</label>
                    <div class="comms__channel-chips">
                        @for (ch of channelFilters; track ch.value) {
                            <button
                                class="ch-chip"
                                [class.ch-chip--active]="channelFilter() === ch.value"
                                (click)="setChannelFilter(ch.value)"
                            >{{ ch.label }}</button>
                        }
                    </div>
                </div>
                <div class="comms__filter-group">
                    <label class="comms__filter-label">Status</label>
                    <div class="comms__channel-chips">
                        @for (s of statusFilters; track s.value) {
                            <button
                                class="ch-chip"
                                [class.ch-chip--active]="statusFilter() === s.value"
                                (click)="setStatusFilter(s.value)"
                            >{{ s.label }}</button>
                        }
                    </div>
                </div>
            </div>

            @if (loading()) {
                <app-skeleton variant="table" [count]="6" />
            } @else if (entries().length === 0) {
                <app-empty-state
                    icon="<- ->"
                    [title]="hasActiveFilters() ? 'No matches' : 'No agent communications yet'"
                    [description]="hasActiveFilters()
                        ? 'No messages match your current filters.'
                        : 'Agent-to-agent messages will appear here in real-time as they communicate.'" />
            } @else {
                <div class="comms__timeline" #timeline>
                    @for (entry of entries(); track entry.id) {
                        <div
                            class="comms__msg"
                            [attr.data-status]="entry.status"
                            [attr.data-channel]="entry.channel"
                            [style.border-left-color]="agentColor(entry.colorIndex)"
                            (click)="toggleExpand(entry.id)"
                        >
                            <div class="comms__msg-header">
                                <span class="comms__time">{{ entry.timestamp | date:'HH:mm:ss.SSS' }}</span>
                                <span class="comms__channel-badge" [attr.data-channel]="entry.channel">
                                    {{ channelLabel(entry.channel) }}
                                </span>
                                <span class="comms__status-dot" [attr.data-status]="entry.status"
                                      [title]="entry.status"></span>
                            </div>
                            <div class="comms__msg-flow">
                                <span class="comms__agent-from" [style.color]="agentColor(entry.colorIndex)">
                                    {{ entry.fromAgent }}
                                </span>
                                <span class="comms__arrow" [attr.data-status]="entry.status">
                                    @if (entry.status === 'processing') {
                                        <span class="comms__arrow-anim"></span>
                                    } @else {
                                        -->
                                    }
                                </span>
                                <span class="comms__agent-to">
                                    {{ entry.toAgent }}
                                </span>
                                @if (entry.fee !== null && entry.fee > 0) {
                                    <span class="comms__fee">{{ (entry.fee / 1000000).toFixed(4) }} ALGO</span>
                                }
                                @if (entry.threadId) {
                                    <span class="comms__thread" [title]="entry.threadId">
                                        thread:{{ entry.threadId.slice(0, 6) }}
                                    </span>
                                }
                            </div>
                            <div class="comms__msg-preview" [class.comms__msg-preview--hidden]="expandedIds().has(entry.id)">
                                {{ previewText(entry.content) }}
                            </div>
                            @if (expandedIds().has(entry.id)) {
                                <div class="comms__msg-detail">
                                    <div class="comms__msg-section">
                                        <span class="comms__msg-section-label">Message</span>
                                        <pre class="comms__msg-content">{{ entry.content }}</pre>
                                    </div>
                                    @if (entry.response) {
                                        <div class="comms__msg-section">
                                            <span class="comms__msg-section-label">Response</span>
                                            <pre class="comms__msg-content comms__msg-content--response">{{ entry.response }}</pre>
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; height: 100%; display: flex; flex-direction: column; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-shrink: 0; flex-wrap: wrap; gap: 0.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__actions { display: flex; align-items: center; gap: 0.75rem; }
        .comms__count { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

        .comms__status {
            font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;
            text-transform: uppercase; letter-spacing: 0.1em;
        }
        .comms__status[data-status="on"] {
            color: var(--accent-green); background: rgba(0, 255, 136, 0.1); border: 1px solid rgba(0, 255, 136, 0.3);
            animation: live-pulse 2s ease-in-out infinite;
        }
        .comms__status[data-status="off"] {
            color: var(--accent-red); background: rgba(255, 80, 80, 0.1); border: 1px solid rgba(255, 80, 80, 0.3);
        }
        @keyframes live-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }

        .btn {
            padding: 0.4rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s;
        }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* ── Filters ──────────────────────────────────────────────── */
        .comms__filters {
            display: flex; gap: 1rem; margin-bottom: 0.75rem; flex-shrink: 0; flex-wrap: wrap;
            align-items: flex-end;
        }
        .comms__filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
        .comms__filter-label { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }
        .comms__select {
            padding: 0.35rem 0.6rem; font-size: 0.75rem; font-family: inherit;
            background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-bright);
            border-radius: var(--radius); outline: none; cursor: pointer;
            min-width: 140px;
        }
        .comms__select:focus { border-color: var(--accent-cyan); }
        .comms__channel-chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .ch-chip {
            padding: 0.25rem 0.55rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: 20px; color: var(--text-tertiary); font-size: 0.65rem; font-family: inherit;
            cursor: pointer; text-transform: uppercase; transition: all 0.15s;
        }
        .ch-chip:hover { border-color: var(--border-bright); color: var(--text-secondary); }
        .ch-chip--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        /* ── Timeline ─────────────────────────────────────────────── */
        .comms__timeline {
            flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;
            scrollbar-width: thin; scrollbar-color: var(--border-bright) transparent;
        }
        .comms__msg {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.5rem 0.75rem; border-left: 3px solid var(--border);
            cursor: pointer; transition: background 0.1s;
        }
        .comms__msg:hover { background: var(--bg-hover); }
        .comms__msg[data-status="processing"] { background: rgba(255, 160, 64, 0.03); }
        .comms__msg[data-status="failed"] { background: rgba(255, 80, 80, 0.03); }

        .comms__msg-header {
            display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;
        }
        .comms__time {
            font-family: var(--font-mono, monospace); font-size: 0.65rem;
            color: var(--text-secondary); opacity: 0.7; flex-shrink: 0;
        }
        .comms__channel-badge {
            font-size: 0.55rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0;
        }
        .comms__channel-badge[data-channel="agent-invoke"] {
            color: #60c0ff; background: rgba(96, 192, 255, 0.08); border: 1px solid rgba(96, 192, 255, 0.25);
        }
        .comms__channel-badge[data-channel="algochat"] {
            color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.2);
        }
        .comms__channel-badge[data-channel="council"] {
            color: #a78bfa; background: rgba(167, 139, 250, 0.08); border: 1px solid rgba(167, 139, 250, 0.25);
        }
        .comms__channel-badge[data-channel="system"] {
            color: var(--accent-amber); background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2);
        }

        .comms__status-dot {
            width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        }
        .comms__status-dot[data-status="sent"] { background: var(--accent-cyan); }
        .comms__status-dot[data-status="processing"] { background: #ffa040; animation: dot-pulse 1.5s ease-in-out infinite; }
        .comms__status-dot[data-status="completed"] { background: var(--accent-green); }
        .comms__status-dot[data-status="failed"] { background: var(--accent-red); }
        @keyframes dot-pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.3); } }

        .comms__msg-flow {
            display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
        }
        .comms__agent-from { font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
        .comms__arrow {
            color: var(--text-secondary); opacity: 0.5; font-size: 0.7rem;
            font-family: var(--font-mono, monospace); flex-shrink: 0;
        }
        .comms__arrow[data-status="processing"] { color: #ffa040; opacity: 1; }
        .comms__arrow-anim {
            display: inline-block; width: 24px; height: 2px; background: #ffa040;
            position: relative; border-radius: 1px;
        }
        .comms__arrow-anim::after {
            content: ''; position: absolute; right: 0; top: -3px;
            width: 0; height: 0; border-left: 5px solid #ffa040;
            border-top: 4px solid transparent; border-bottom: 4px solid transparent;
        }
        .comms__agent-to { font-weight: 500; font-size: 0.8rem; color: var(--text-secondary); flex-shrink: 0; }
        .comms__fee { font-size: 0.7rem; color: var(--accent-green); font-weight: 600; flex-shrink: 0; }
        .comms__thread {
            font-size: 0.6rem; font-family: var(--font-mono, monospace); color: var(--accent-yellow, #ffd700);
            background: rgba(255, 215, 0, 0.08); border: 1px solid rgba(255, 215, 0, 0.2);
            padding: 1px 5px; border-radius: var(--radius-sm); flex-shrink: 0;
        }

        .comms__msg-preview {
            font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.2rem;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .comms__msg-preview--hidden { display: none; }

        .comms__msg-detail { margin-top: 0.5rem; }
        .comms__msg-section { margin-bottom: 0.5rem; }
        .comms__msg-section-label {
            font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase;
            letter-spacing: 0.08em; display: block; margin-bottom: 0.2rem;
        }
        .comms__msg-content {
            margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            font-size: 0.78rem; line-height: 1.5; max-height: 400px; overflow-y: auto;
            padding: 0.5rem; background: var(--bg-deep); border-radius: var(--radius-sm);
            border: 1px solid var(--border);
        }
        .comms__msg-content--response { border-color: rgba(0, 255, 136, 0.15); }

        /* ── Mobile-first responsive ──────────────────────────────── */
        @media (max-width: 768px) {
            .page { padding: 0.75rem; }
            .page__header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
            .page__actions { width: 100%; justify-content: space-between; }
            .comms__filters { flex-direction: column; gap: 0.5rem; }
            .comms__select { min-width: unset; width: 100%; }
            .comms__msg-flow { font-size: 0.75rem; }
            .comms__msg { padding: 0.4rem 0.5rem; }
            .comms__time { font-size: 0.6rem; }
            .comms__agent-from, .comms__agent-to { font-size: 0.75rem; }
        }

        @media (max-width: 480px) {
            .page { padding: 0.5rem; }
            .comms__msg-header { flex-wrap: wrap; }
            .comms__msg-flow { flex-wrap: wrap; gap: 0.25rem; }
        }

        @media (prefers-reduced-motion: reduce) {
            .comms__status[data-status="on"] { animation: none; }
            .comms__status-dot[data-status="processing"] { animation: none; opacity: 1; }
        }
    `,
})
export class AgentCommsComponent implements OnInit, OnDestroy {
    private readonly wsService = inject(WebSocketService);
    private readonly agentService = inject(AgentService);
    private readonly api = inject(ApiService);
    private readonly timelineEl = viewChild<ElementRef<HTMLElement>>('timeline');

    protected readonly loading = signal(true);
    protected readonly rawEntries = signal<CommEntry[]>([]);
    protected readonly agentFilter = signal('');
    protected readonly channelFilter = signal('all');
    protected readonly statusFilter = signal('all');
    protected readonly expandedIds = signal<Set<number>>(new Set());
    protected readonly autoScroll = signal(true);
    protected readonly totalMessages = signal(0);
    protected readonly agents = signal<Agent[]>([]);
    protected readonly wsConnected = this.wsService.connected;

    protected readonly channelFilters = [
        { value: 'all', label: 'All' },
        { value: 'agent-invoke', label: 'A2A' },
        { value: 'algochat', label: 'AlgoChat' },
        { value: 'council', label: 'Council' },
    ];

    protected readonly statusFilters = [
        { value: 'all', label: 'All' },
        { value: 'sent', label: 'Sent' },
        { value: 'processing', label: 'Active' },
        { value: 'completed', label: 'Done' },
        { value: 'failed', label: 'Failed' },
    ];

    protected readonly entries = computed(() => {
        let list = this.rawEntries();
        const agent = this.agentFilter();
        const channel = this.channelFilter();
        const status = this.statusFilter();

        if (agent) {
            list = list.filter((e) => e.fromAgentId === agent || e.toAgentId === agent);
        }
        if (channel !== 'all') {
            list = list.filter((e) => e.channel === channel);
        }
        if (status !== 'all') {
            list = list.filter((e) => e.status === status);
        }
        return list;
    });

    protected readonly hasActiveFilters = computed(
        () => this.agentFilter() !== '' || this.channelFilter() !== 'all' || this.statusFilter() !== 'all',
    );

    private static readonly AGENT_COLORS = [
        '#ff6b9d', '#00e5ff', '#ffa040', '#a78bfa',
        '#34d399', '#f472b6', '#60a5fa', '#fbbf24',
    ];

    private unsubscribeWs: (() => void) | null = null;
    private nextId = 0;
    private agentMap: Record<string, Agent> = {};
    private agentColorMap: Record<string, number> = {};
    private nextColorIndex = 0;
    private seenMessageKeys = new Set<string>();

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        const agentList = this.agentService.agents();
        this.agents.set(agentList);

        for (const agent of agentList) {
            this.agentMap[agent.id] = agent;
        }

        try {
            await this.loadHistory();
        } finally {
            this.loading.set(false);
        }

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'agent_message_update') {
                const m = msg.message;
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                const dedupKey = `${m.id}:${m.status}`;
                if (this.seenMessageKeys.has(dedupKey)) return;
                this.seenMessageKeys.add(dedupKey);

                if (m.status === 'processing') {
                    // Remove sent entry if present and add processing
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        fromAgent: fromName,
                        fromAgentId: m.fromAgentId,
                        toAgent: toName,
                        toAgentId: m.toAgentId,
                        channel: 'agent-invoke',
                        status: 'processing',
                        content: m.content,
                        response: null,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                        messageId: m.id,
                    });
                } else if (m.status === 'completed') {
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        fromAgent: fromName,
                        fromAgentId: m.fromAgentId,
                        toAgent: toName,
                        toAgentId: m.toAgentId,
                        channel: 'agent-invoke',
                        status: 'completed',
                        content: m.content,
                        response: m.response,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                        messageId: m.id,
                    });
                } else if (m.status === 'failed') {
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        fromAgent: fromName,
                        fromAgentId: m.fromAgentId,
                        toAgent: toName,
                        toAgentId: m.toAgentId,
                        channel: 'agent-invoke',
                        status: 'failed',
                        content: m.content,
                        response: null,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                        messageId: m.id,
                    });
                } else if (m.status === 'sent') {
                    this.addEntry({
                        fromAgent: fromName,
                        fromAgentId: m.fromAgentId,
                        toAgent: toName,
                        toAgentId: m.toAgentId,
                        channel: 'agent-invoke',
                        status: 'sent',
                        content: m.content,
                        response: null,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                        messageId: m.id,
                    });
                }
            }

            if (msg.type === 'algochat_message') {
                // AlgoChat external messages — show as agent comms only if it involves a known agent
                const agentList = this.agentService.agents();
                const handlingAgent = agentList.find((a) => a.algochatEnabled) ?? agentList[0];
                if (!handlingAgent) return;

                const agentName = handlingAgent.name;
                const participantLabel = msg.participant === 'local'
                    ? 'Local UI'
                    : msg.participant.slice(0, 8) + '...' + msg.participant.slice(-4);

                if (msg.direction === 'inbound') {
                    this.addEntry({
                        fromAgent: participantLabel,
                        fromAgentId: msg.participant,
                        toAgent: agentName,
                        toAgentId: handlingAgent.id,
                        channel: 'algochat',
                        status: 'completed',
                        content: msg.content,
                        response: null,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(participantLabel),
                    });
                } else if (msg.direction === 'outbound') {
                    this.addEntry({
                        fromAgent: agentName,
                        fromAgentId: handlingAgent.id,
                        toAgent: participantLabel,
                        toAgentId: msg.participant,
                        channel: 'algochat',
                        status: 'completed',
                        content: msg.content,
                        response: null,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(agentName),
                    });
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
    }

    protected agentColor(index: number): string {
        return AgentCommsComponent.AGENT_COLORS[index % AgentCommsComponent.AGENT_COLORS.length];
    }

    protected channelLabel(channel: string): string {
        switch (channel) {
            case 'agent-invoke': return 'A2A';
            case 'algochat': return 'AlgoChat';
            case 'council': return 'Council';
            case 'system': return 'System';
            default: return channel;
        }
    }

    protected previewText(content: string): string {
        const oneLine = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        return oneLine.length > 100 ? oneLine.slice(0, 100) + '...' : oneLine;
    }

    protected toggleExpand(id: number): void {
        this.expandedIds.update((set) => {
            const next = new Set(set);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    protected toggleAutoScroll(): void {
        this.autoScroll.update((v) => !v);
    }

    protected onAgentFilterChange(event: Event): void {
        this.agentFilter.set((event.target as HTMLSelectElement).value);
    }

    protected setChannelFilter(value: string): void {
        this.channelFilter.set(value);
    }

    protected setStatusFilter(value: string): void {
        this.statusFilter.set(value);
    }

    private colorIndexForAgent(agentName: string): number {
        if (!(agentName in this.agentColorMap)) {
            this.agentColorMap[agentName] = this.nextColorIndex++;
        }
        return this.agentColorMap[agentName];
    }

    private addEntry(partial: Omit<CommEntry, 'id' | 'timestamp'>, timestamp?: Date): void {
        const entry: CommEntry = {
            id: this.nextId++,
            timestamp: timestamp ?? new Date(),
            ...partial,
        };
        this.rawEntries.update((list) => [...list, entry]);
        this.totalMessages.update((n) => n + 1);

        if (this.autoScroll()) {
            requestAnimationFrame(() => {
                const el = this.timelineEl()?.nativeElement;
                if (el) el.scrollTop = el.scrollHeight;
            });
        }
    }

    private removeEntriesByMessageId(messageId: string): void {
        this.rawEntries.update((list) => list.filter((e) => e.messageId !== messageId));
    }

    private async loadHistory(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{
                    messages: AgentMessage[];
                    total: number;
                }>('/feed/history?limit=100&offset=0'),
            );

            this.totalMessages.set(result.total);
            this.nextId = 0;
            this.seenMessageKeys.clear();

            const newEntries: CommEntry[] = [];
            for (const m of [...result.messages].reverse()) {
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                const entry: CommEntry = {
                    id: this.nextId++,
                    timestamp: m.createdAt ? new Date(m.createdAt + 'Z') : new Date(),
                    fromAgent: fromName,
                    fromAgentId: m.fromAgentId,
                    toAgent: toName,
                    toAgentId: m.toAgentId,
                    channel: 'agent-invoke',
                    status: m.status === 'completed' || m.status === 'failed' ? m.status : 'sent',
                    content: m.content,
                    response: m.response,
                    fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                    threadId: m.threadId ?? null,
                    colorIndex: this.colorIndexForAgent(fromName),
                    messageId: m.id,
                };
                newEntries.push(entry);
                this.seenMessageKeys.add(`${m.id}:${m.status}`);
            }

            newEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            this.nextId = 0;
            for (const entry of newEntries) {
                entry.id = this.nextId++;
            }

            this.rawEntries.set(newEntries);
        } catch {
            // History unavailable — rely on real-time WebSocket only
        }
    }
}
