import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { WebSocketService } from '../../core/services/websocket.service';
import { AgentService } from '../../core/services/agent.service';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import type { Agent } from '../../core/models/agent.model';
import type { AgentMessage } from '../../core/models/agent-message.model';

interface FeedEntry {
    id: number;
    timestamp: Date;
    direction: 'inbound' | 'outbound' | 'agent-send' | 'agent-reply' | 'agent-processing' | 'status';
    participant: string;
    participantLabel: string;
    content: string;
    agentName: string | null;
    fee: number | null;
    threadId: string | null;
    colorIndex: number;
    /** Links processing entries to their agent message ID for removal on completion. */
    messageId?: string;
}

@Component({
    selector: 'app-live-feed',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Feed</h2>
                <div class="page__actions">
                    <span class="feed__count">{{ totalMessages() }} messages</span>
                    <button class="btn btn--secondary" (click)="toggleAutoScroll()">
                        Auto-scroll: {{ autoScroll() ? 'ON' : 'OFF' }}
                    </button>
                    <button class="btn btn--secondary" (click)="collapseAll()">Collapse all</button>
                    <button class="btn btn--danger" (click)="onClear()">Clear</button>
                </div>
            </div>

            <div class="feed__toolbar">
                <input
                    class="feed__search"
                    type="search"
                    placeholder="Search messages..."
                    [value]="searchTerm()"
                    (input)="onSearchInput($event)"
                    aria-label="Search messages"
                />
                @if (activeThreadFilter()) {
                    <button class="btn btn--filter" (click)="clearThreadFilter()">
                        thread:{{ activeThreadFilter()!.slice(0, 6) }} ✕
                    </button>
                }
            </div>

            @if (isFiltered()) {
                <div class="feed__pagination">
                    <span class="feed__page-info">
                        Showing {{ currentOffset() + 1 }}–{{ showingEnd() }} of {{ totalMessages() }}
                    </span>
                    <div class="feed__page-controls">
                        <button class="btn btn--secondary" [disabled]="!hasPrevPage()" (click)="prevPage()">Previous</button>
                        <button class="btn btn--secondary" [disabled]="!hasNextPage()" (click)="nextPage()">Next</button>
                    </div>
                </div>
            }

            @if (entries().length === 0) {
                <div class="feed__empty">
                    @if (isFiltered()) {
                        <p>No messages match your search.</p>
                    } @else {
                        <p>No messages yet. Waiting for activity...</p>
                        <p class="feed__hint">Messages between agents and external participants will appear here in real time.</p>
                    }
                </div>
            } @else {
                <div class="feed__list" #feedList>
                    @for (entry of entries(); track entry.id) {
                        <div class="feed__entry"
                             [attr.data-direction]="entry.direction"
                             [class.feed__entry--expanded]="expandedIds().has(entry.id)"
                             [style.border-left-color]="agentColor(entry.colorIndex)"
                             (click)="entry.direction !== 'agent-processing' && toggleExpand(entry.id)">
                            <div class="feed__meta">
                                <span class="feed__time">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
                                <span class="feed__direction" [attr.data-dir]="entry.direction">
                                    {{ directionLabel(entry.direction) }}
                                </span>
                                <span class="feed__sender" [style.color]="agentColor(entry.colorIndex)">{{ entry.agentName }}</span>
                                <span class="feed__arrow">-></span>
                                <span class="feed__participant" [title]="entry.participant">{{ recipientFrom(entry.participantLabel) }}</span>
                                @if (entry.threadId) {
                                    <button class="feed__thread" [title]="entry.threadId" (click)="filterByThread(entry.threadId!); $event.stopPropagation()">thread:{{ entry.threadId.slice(0, 6) }}</button>
                                }
                                @if (entry.fee !== null && entry.fee > 0) {
                                    <span class="feed__fee">{{ (entry.fee / 1000000).toFixed(4) }} ALGO</span>
                                }
                                @if (entry.direction === 'agent-processing') {
                                    <span class="feed__processing-indicator"><span class="feed__processing-dot"></span> processing...</span>
                                } @else {
                                    <span class="feed__preview" [class.feed__preview--hidden]="expandedIds().has(entry.id)">{{ previewText(entry.content) }}</span>
                                    <span class="feed__toggle">{{ expandedIds().has(entry.id) ? '▾' : '▸' }}</span>
                                }
                            </div>
                            @if (expandedIds().has(entry.id)) {
                                <pre class="feed__content">{{ entry.content }}</pre>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; height: 100%; display: flex; flex-direction: column; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-shrink: 0; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__actions { display: flex; align-items: center; gap: 0.75rem; }
        .feed__count { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .btn {
            padding: 0.4rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s;
        }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .feed__toolbar {
            display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-shrink: 0;
        }
        .feed__search {
            flex: 1; padding: 0.4rem 0.75rem; font-size: 0.8rem; font-family: inherit;
            background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-bright);
            border-radius: var(--radius); outline: none;
        }
        .feed__search:focus { border-color: var(--accent-cyan); }
        .feed__search::placeholder { color: var(--text-secondary); opacity: 0.6; }
        .btn--filter {
            background: rgba(255, 215, 0, 0.1); color: var(--accent-yellow, #ffd700);
            border: 1px solid rgba(255, 215, 0, 0.3); padding: 0.3rem 0.6rem; border-radius: var(--radius);
            font-size: 0.7rem; font-family: var(--font-mono, monospace); cursor: pointer;
        }
        .btn--filter:hover { background: rgba(255, 215, 0, 0.2); }
        .feed__pagination {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-shrink: 0;
        }
        .feed__page-info { font-size: 0.75rem; color: var(--text-secondary); }
        .feed__page-controls { display: flex; gap: 0.5rem; }
        .feed__empty { color: var(--text-secondary); text-align: center; margin-top: 4rem; }
        .feed__hint { font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.6; }
        .feed__list {
            flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
            scrollbar-width: thin; scrollbar-color: var(--border-bright) transparent;
        }
        .feed__entry {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.35rem 0.75rem; font-size: 0.8rem;
            border-left: 3px solid var(--border);
            cursor: pointer; transition: background 0.1s;
        }
        .feed__entry:hover { background: var(--bg-hover); }
        .feed__entry--expanded { background: var(--bg-raised); }
        .feed__entry--expanded:hover { background: var(--bg-raised); }
        .feed__entry[data-direction="inbound"] { border-left-color: var(--accent-cyan); }
        .feed__entry[data-direction="outbound"] { border-left-color: var(--accent-green); }
        .feed__entry[data-direction="agent-reply"] { }
        .feed__entry[data-direction="agent-processing"] { border-left-color: #ffa040; background: rgba(255, 160, 64, 0.04); }
        .feed__entry[data-direction="status"] { border-left-color: var(--accent-amber); opacity: 0.8; }
        .feed__meta {
            display: flex; align-items: center; gap: 0.4rem; flex-wrap: nowrap; overflow: hidden;
        }
        .feed__time { font-family: var(--font-mono, monospace); font-size: 0.7rem; color: var(--text-secondary); opacity: 0.7; flex-shrink: 0; }
        .feed__direction {
            font-size: 0.6rem; font-weight: 700; padding: 1px 5px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0;
        }
        .feed__direction[data-dir="inbound"] { color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.2); }
        .feed__direction[data-dir="outbound"] { color: var(--accent-green); background: rgba(0, 255, 136, 0.08); border: 1px solid rgba(0, 255, 136, 0.2); }
        .feed__direction[data-dir="agent-send"] { color: #ffa040; background: rgba(255, 160, 64, 0.08); border: 1px solid rgba(255, 160, 64, 0.25); }
        .feed__direction[data-dir="agent-reply"] { color: #60c0ff; background: rgba(96, 192, 255, 0.08); border: 1px solid rgba(96, 192, 255, 0.25); }
        .feed__direction[data-dir="agent-processing"] { color: #ffa040; background: rgba(255, 160, 64, 0.08); border: 1px solid rgba(255, 160, 64, 0.25); animation: pulse-bg 2s ease-in-out infinite; }
        @keyframes pulse-bg { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        .feed__direction[data-dir="status"] { color: var(--accent-amber); background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2); }
        .feed__sender { font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
        .feed__arrow { color: var(--text-secondary); opacity: 0.4; font-size: 0.7rem; flex-shrink: 0; }
        .feed__participant {
            font-size: 0.75rem; color: var(--text-secondary); font-weight: 500; flex-shrink: 0;
            max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .feed__thread {
            font-size: 0.65rem; font-family: var(--font-mono, monospace); color: var(--accent-yellow, #ffd700);
            background: rgba(255, 215, 0, 0.08); border: 1px solid rgba(255, 215, 0, 0.2);
            padding: 1px 5px; border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0;
        }
        .feed__fee { font-size: 0.7rem; color: var(--accent-green); font-weight: 600; flex-shrink: 0; }
        .feed__preview {
            flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            color: var(--text-tertiary); font-size: 0.75rem; margin-left: 0.25rem;
        }
        .feed__preview--hidden { display: none; }
        .feed__toggle {
            flex-shrink: 0; color: var(--text-tertiary); font-size: 0.7rem; margin-left: auto;
            user-select: none;
        }
        .feed__content {
            margin: 0.4rem 0 0 0; white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            font-size: 0.78rem; line-height: 1.5; max-height: 600px; overflow-y: auto;
            padding: 0.5rem; background: var(--bg-deep); border-radius: var(--radius-sm);
            border: 1px solid var(--border);
        }
        .feed__processing-indicator {
            display: flex; align-items: center; gap: 0.4rem;
            font-size: 0.75rem; color: #ffa040; font-style: italic; margin-left: 0.25rem;
        }
        .feed__processing-dot {
            width: 6px; height: 6px; border-radius: 50%; background: #ffa040;
            animation: processing-pulse 1.5s ease-in-out infinite;
        }
        @keyframes processing-pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
        }
    `,
})
export class LiveFeedComponent implements OnInit, OnDestroy {
    private readonly wsService = inject(WebSocketService);
    private readonly agentService = inject(AgentService);
    private readonly api = inject(ApiService);
    private readonly feedList = viewChild<ElementRef<HTMLElement>>('feedList');

    protected readonly entries = signal<FeedEntry[]>([]);
    protected readonly expandedIds = signal<Set<number>>(new Set());
    protected readonly autoScroll = signal(true);
    protected readonly searchTerm = signal('');
    protected readonly currentOffset = signal(0);
    protected readonly pageSize = signal(50);
    protected readonly totalMessages = signal(0);
    protected readonly activeThreadFilter = signal<string | null>(null);
    protected readonly isFiltered = computed(() => this.searchTerm().length > 0 || this.currentOffset() > 0 || this.activeThreadFilter() !== null);
    protected readonly showingEnd = computed(() => Math.min(this.currentOffset() + this.pageSize(), this.totalMessages()));
    protected readonly hasPrevPage = computed(() => this.currentOffset() > 0);
    protected readonly hasNextPage = computed(() => this.currentOffset() + this.pageSize() < this.totalMessages());

    private static readonly AGENT_COLORS = [
        '#ff6b9d', // pink
        '#00e5ff', // cyan
        '#ffa040', // orange
        '#a78bfa', // violet
        '#34d399', // emerald
        '#f472b6', // rose
        '#60a5fa', // blue
        '#fbbf24', // amber
    ];

    private unsubscribeWs: (() => void) | null = null;
    private nextId = 0;
    private agentMap: Record<string, Agent> = {};
    private walletToAgent: Record<string, Agent> = {};
    private agentColorMap: Record<string, number> = {};
    private nextColorIndex = 0;
    private seenMessageKeys = new Set<string>();
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        for (const agent of this.agentService.agents()) {
            this.agentMap[agent.id] = agent;
            if (agent.walletAddress) {
                this.walletToAgent[agent.walletAddress] = agent;
            }
        }

        // Load message history from DB
        await this.loadHistory();

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (this.isFiltered()) return;

            if (msg.type === 'algochat_message') {
                // Skip messages from/to known agent wallet addresses —
                // those are displayed via agent_message_update instead
                if (this.walletToAgent[msg.participant]) return;

                const userLabel = this.labelForAddress(msg.participant);
                const handlingAgent = this.findAgentForParticipant(msg.participant);
                const agentLabel = handlingAgent?.name ?? 'Agent';

                if (msg.direction === 'inbound') {
                    // External user sent a message to our agent
                    this.addEntry({
                        direction: 'inbound',
                        participant: msg.participant,
                        participantLabel: `${userLabel} \u2192 ${agentLabel}`,
                        content: msg.content,
                        agentName: userLabel,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(userLabel),
                    });
                } else if (msg.direction === 'outbound') {
                    // Our agent sent a response to the external user
                    this.addEntry({
                        direction: 'outbound',
                        participant: msg.participant,
                        participantLabel: `${agentLabel} \u2192 ${userLabel}`,
                        content: msg.content,
                        agentName: agentLabel,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(agentLabel),
                    });
                } else {
                    // Status messages
                    this.addEntry({
                        direction: 'status',
                        participant: msg.participant,
                        participantLabel: agentLabel,
                        content: msg.content,
                        agentName: agentLabel,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(agentLabel),
                    });
                }
            }

            if (msg.type === 'agent_message_update') {
                const m = msg.message;
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                // Deduplicate: skip if we already have an entry for this message+status
                const dedupKey = `${m.id}:${m.status}`;
                if (this.seenMessageKeys.has(dedupKey)) return;
                this.seenMessageKeys.add(dedupKey);

                if (m.status === 'sent') {
                    this.addEntry({
                        direction: 'agent-send',
                        participant: `${fromName} \u2192 ${toName}`,
                        participantLabel: `${fromName} \u2192 ${toName}`,
                        content: m.content,
                        agentName: fromName,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                    });
                }

                if (m.status === 'processing') {
                    // Remove any existing 'sent' entry for same message to avoid duplication
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        direction: 'agent-processing',
                        participant: `${toName}`,
                        participantLabel: `${fromName} \u2192 ${toName}`,
                        content: m.content,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(toName),
                        messageId: m.id,
                    });
                }

                if (m.status === 'completed' && m.response) {
                    // Remove the processing indicator for this message
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        direction: 'agent-reply',
                        participant: `${toName} \u2192 ${fromName}`,
                        participantLabel: `${toName} \u2192 ${fromName}`,
                        content: m.response,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(toName),
                    });
                }

                if (m.status === 'failed') {
                    this.removeEntriesByMessageId(m.id);
                    this.addEntry({
                        direction: 'status',
                        participant: `${fromName} \u2192 ${toName}`,
                        participantLabel: `${fromName} \u2192 ${toName}`,
                        content: `Message failed: ${m.content.slice(0, 80)}`,
                        agentName: fromName,
                        fee: null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(fromName),
                    });
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    }

    protected agentColor(index: number): string {
        return LiveFeedComponent.AGENT_COLORS[index % LiveFeedComponent.AGENT_COLORS.length];
    }

    protected directionLabel(dir: string): string {
        switch (dir) {
            case 'inbound': return 'IN';
            case 'outbound': return 'OUT';
            case 'agent-send': return 'SEND';
            case 'agent-reply': return 'REPLY';
            case 'agent-processing': return 'WORKING';
            case 'status': return 'STATUS';
            default: return 'A2A';
        }
    }

    protected recipientFrom(label: string): string {
        const parts = label.split(' \u2192 ');
        return parts.length > 1 ? parts[1] : label;
    }

    protected previewText(content: string): string {
        const oneLine = content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        return oneLine.length > 120 ? oneLine.slice(0, 120) + '...' : oneLine;
    }

    protected toggleExpand(id: number): void {
        this.expandedIds.update((set) => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    protected collapseAll(): void {
        this.expandedIds.set(new Set());
    }

    private colorIndexForAgent(agentName: string): number {
        if (!(agentName in this.agentColorMap)) {
            this.agentColorMap[agentName] = this.nextColorIndex++;
        }
        return this.agentColorMap[agentName];
    }

    protected toggleAutoScroll(): void {
        this.autoScroll.update((v) => !v);
    }

    protected onClear(): void {
        this.entries.set([]);
        this.expandedIds.set(new Set());
        this.seenMessageKeys.clear();
        this.searchTerm.set('');
        this.currentOffset.set(0);
        this.activeThreadFilter.set(null);
    }

    protected onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
            this.searchTerm.set(value);
            this.currentOffset.set(0);
            this.loadHistory();
        }, 300);
    }

    protected filterByThread(threadId: string): void {
        this.activeThreadFilter.set(threadId);
        this.currentOffset.set(0);
        this.loadHistory();
    }

    protected clearThreadFilter(): void {
        this.activeThreadFilter.set(null);
        this.currentOffset.set(0);
        this.loadHistory();
    }

    protected nextPage(): void {
        this.currentOffset.update((o) => o + this.pageSize());
        this.loadHistory();
    }

    protected prevPage(): void {
        this.currentOffset.update((o) => Math.max(0, o - this.pageSize()));
        this.loadHistory();
    }

    private async loadHistory(): Promise<void> {
        try {
            const params = new URLSearchParams({
                limit: String(this.pageSize()),
                offset: String(this.currentOffset()),
            });
            const search = this.searchTerm();
            if (search) params.set('search', search);
            const threadId = this.activeThreadFilter();
            if (threadId) params.set('threadId', threadId);

            interface AlgoChatMsg {
                id: number;
                participant: string;
                content: string;
                direction: 'inbound' | 'outbound' | 'status';
                fee: number;
                createdAt: string;
            }

            const result = await firstValueFrom(
                this.api.get<{
                    messages: AgentMessage[];
                    algochatMessages?: AlgoChatMsg[];
                    total: number;
                    algochatTotal?: number;
                }>(`/feed/history?${params}`),
            );
            this.totalMessages.set(result.total + (result.algochatTotal ?? 0));

            this.nextId = 0;
            this.seenMessageKeys.clear();

            // Build entries from agent messages (agent-to-agent)
            const newEntries: FeedEntry[] = [];
            for (const m of [...result.messages].reverse()) {
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                newEntries.push({
                    id: this.nextId++,
                    timestamp: m.createdAt ? new Date(m.createdAt + 'Z') : new Date(),
                    direction: 'agent-send',
                    participant: `${fromName} \u2192 ${toName}`,
                    participantLabel: `${fromName} \u2192 ${toName}`,
                    content: m.content,
                    agentName: fromName,
                    fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                    threadId: m.threadId ?? null,
                    colorIndex: this.colorIndexForAgent(fromName),
                });

                if (m.status === 'processing') {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: new Date(),
                        direction: 'agent-processing',
                        participant: `${toName}`,
                        participantLabel: `${fromName} \u2192 ${toName}`,
                        content: m.content,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(toName),
                        messageId: m.id,
                    });
                }

                if (m.status === 'completed' && m.response) {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: m.completedAt ? new Date(m.completedAt + 'Z') : new Date(),
                        direction: 'agent-reply',
                        participant: `${toName} \u2192 ${fromName}`,
                        participantLabel: `${toName} \u2192 ${fromName}`,
                        content: m.response,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                        colorIndex: this.colorIndexForAgent(toName),
                    });
                }
            }

            // Build entries from algochat messages (external user IN/OUT/status)
            for (const ac of [...(result.algochatMessages ?? [])].reverse()) {
                if (this.walletToAgent[ac.participant]) continue; // skip agent-wallet messages

                const userLabel = this.labelForAddress(ac.participant);
                const handlingAgent = this.findAgentForParticipant(ac.participant);
                const agentLabel = handlingAgent?.name ?? 'Agent';

                if (ac.direction === 'inbound') {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: ac.createdAt ? new Date(ac.createdAt + 'Z') : new Date(),
                        direction: 'inbound',
                        participant: ac.participant,
                        participantLabel: `${userLabel} \u2192 ${agentLabel}`,
                        content: ac.content,
                        agentName: userLabel,
                        fee: ac.fee > 0 ? ac.fee : null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(userLabel),
                    });
                } else if (ac.direction === 'outbound') {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: ac.createdAt ? new Date(ac.createdAt + 'Z') : new Date(),
                        direction: 'outbound',
                        participant: ac.participant,
                        participantLabel: `${agentLabel} \u2192 ${userLabel}`,
                        content: ac.content,
                        agentName: agentLabel,
                        fee: ac.fee > 0 ? ac.fee : null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(agentLabel),
                    });
                } else {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: ac.createdAt ? new Date(ac.createdAt + 'Z') : new Date(),
                        direction: 'status',
                        participant: ac.participant,
                        participantLabel: agentLabel,
                        content: ac.content,
                        agentName: agentLabel,
                        fee: null,
                        threadId: null,
                        colorIndex: this.colorIndexForAgent(agentLabel),
                    });
                }
            }

            // Sort all entries by timestamp so agent and algochat messages interleave correctly
            newEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            // Re-assign IDs after sort
            this.nextId = 0;
            for (const entry of newEntries) {
                entry.id = this.nextId++;
            }

            this.entries.set(newEntries);
        } catch {
            // History unavailable — rely on real-time WebSocket only
        }
    }

    private addEntry(partial: Omit<FeedEntry, 'id' | 'timestamp'>, timestamp?: Date): void {
        const entry: FeedEntry = {
            id: this.nextId++,
            timestamp: timestamp ?? new Date(),
            ...partial,
        };
        this.entries.update((list) => [...list, entry]);

        if (this.autoScroll()) {
            requestAnimationFrame(() => {
                const el = this.feedList()?.nativeElement;
                if (el) {
                    el.scrollTop = el.scrollHeight;
                }
            });
        }
    }

    private labelForAddress(address: string): string {
        const agent = this.walletToAgent[address];
        if (agent) return agent.name;
        if (address === 'local') return 'Local UI';
        return address.slice(0, 8) + '...' + address.slice(-4);
    }

    private removeEntriesByMessageId(messageId: string): void {
        this.entries.update((list) => list.filter((e) => e.messageId !== messageId));
    }

    /** Find which agent handles conversations with an external participant. */
    private findAgentForParticipant(_address: string): Agent | null {
        // For now, use the first agent with AlgoChat enabled (most setups have one primary agent)
        const agents = this.agentService.agents();
        return agents.find((a) => a.algochatEnabled) ?? agents[0] ?? null;
    }

    private agentNameForAddress(address: string): string | null {
        return this.walletToAgent[address]?.name ?? null;
    }
}
