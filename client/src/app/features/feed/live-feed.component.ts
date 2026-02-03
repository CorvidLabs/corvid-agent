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
    direction: 'inbound' | 'outbound' | 'agent';
    participant: string;
    participantLabel: string;
    content: string;
    agentName: string | null;
    fee: number | null;
    threadId: string | null;
}

@Component({
    selector: 'app-live-feed',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>AlgoChat Feed</h2>
                <div class="page__actions">
                    <span class="feed__count">{{ totalMessages() }} messages</span>
                    <button class="btn btn--secondary" (click)="toggleAutoScroll()">
                        Auto-scroll: {{ autoScroll() ? 'ON' : 'OFF' }}
                    </button>
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
                        <p>No messages yet. Waiting for AlgoChat activity...</p>
                        <p class="feed__hint">Messages between agents and external participants will appear here in real time.</p>
                    }
                </div>
            } @else {
                <div class="feed__list" #feedList>
                    @for (entry of entries(); track entry.id) {
                        <div class="feed__entry" [attr.data-direction]="entry.direction">
                            <div class="feed__meta">
                                <span class="feed__time">{{ entry.timestamp | date:'HH:mm:ss.SSS' }}</span>
                                <span class="feed__direction" [attr.data-dir]="entry.direction">
                                    {{ entry.direction === 'inbound' ? 'IN' : entry.direction === 'outbound' ? 'OUT' : 'A2A' }}
                                </span>
                                @if (entry.agentName && entry.direction !== 'agent') {
                                    <span class="feed__agent">{{ entry.agentName }}</span>
                                }
                                <span class="feed__participant" [title]="entry.participant">{{ entry.participantLabel }}</span>
                                @if (entry.threadId) {
                                    <button class="feed__thread" [title]="entry.threadId" (click)="filterByThread(entry.threadId!)">thread:{{ entry.threadId.slice(0, 6) }}</button>
                                }
                                @if (entry.fee !== null && entry.fee > 0) {
                                    <span class="feed__fee">{{ (entry.fee / 1000000).toFixed(4) }} ALGO</span>
                                }
                            </div>
                            <pre class="feed__content">{{ entry.content }}</pre>
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
            flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem;
            scrollbar-width: thin; scrollbar-color: var(--border-bright) transparent;
        }
        .feed__entry {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.5rem 0.75rem; font-size: 0.8rem;
            border-left: 3px solid var(--border);
        }
        .feed__entry[data-direction="inbound"] { border-left-color: var(--accent-cyan); }
        .feed__entry[data-direction="outbound"] { border-left-color: var(--accent-green); }
        .feed__entry[data-direction="agent"] { border-left-color: var(--accent-magenta); }
        .feed__meta {
            display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;
        }
        .feed__time { font-family: var(--font-mono, monospace); font-size: 0.7rem; color: var(--text-secondary); opacity: 0.7; }
        .feed__direction {
            font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: var(--radius-sm);
            text-transform: uppercase; letter-spacing: 0.08em;
        }
        .feed__direction[data-dir="inbound"] { color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.2); }
        .feed__direction[data-dir="outbound"] { color: var(--accent-green); background: rgba(0, 255, 136, 0.08); border: 1px solid rgba(0, 255, 136, 0.2); }
        .feed__direction[data-dir="agent"] { color: var(--accent-magenta); background: rgba(255, 0, 200, 0.08); border: 1px solid rgba(255, 0, 200, 0.2); }
        .feed__agent { font-weight: 600; color: var(--accent-magenta); font-size: 0.75rem; }
        .feed__participant {
            font-family: var(--font-mono, monospace); font-size: 0.7rem; color: var(--text-secondary);
            max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .feed__thread {
            font-size: 0.65rem; font-family: var(--font-mono, monospace); color: var(--accent-yellow, #ffd700);
            background: rgba(255, 215, 0, 0.08); border: 1px solid rgba(255, 215, 0, 0.2);
            padding: 1px 5px; border-radius: var(--radius-sm); cursor: pointer;
        }
        .feed__fee { font-size: 0.7rem; color: var(--accent-green); font-weight: 600; }
        .feed__content {
            margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-primary);
            font-size: 0.8rem; line-height: 1.4; max-height: 300px; overflow-y: auto;
        }
    `,
})
export class LiveFeedComponent implements OnInit, OnDestroy {
    private readonly wsService = inject(WebSocketService);
    private readonly agentService = inject(AgentService);
    private readonly api = inject(ApiService);
    private readonly feedList = viewChild<ElementRef<HTMLElement>>('feedList');

    protected readonly entries = signal<FeedEntry[]>([]);
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

    private unsubscribeWs: (() => void) | null = null;
    private nextId = 0;
    private agentMap: Record<string, Agent> = {};
    private walletToAgent: Record<string, Agent> = {};
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
                this.addEntry({
                    direction: msg.direction,
                    participant: msg.participant,
                    participantLabel: this.labelForAddress(msg.participant),
                    content: msg.content,
                    agentName: this.agentNameForAddress(msg.participant),
                    fee: null,
                    threadId: null,
                });
            }

            if (msg.type === 'agent_message_update') {
                const m = msg.message;
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                if (m.status === 'sent' || m.status === 'processing') {
                    this.addEntry({
                        direction: 'agent',
                        participant: `${fromName} -> ${toName}`,
                        participantLabel: `${fromName} -> ${toName}`,
                        content: m.content,
                        agentName: fromName,
                        fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                        threadId: m.threadId ?? null,
                    });
                }

                if (m.status === 'completed' && m.response) {
                    this.addEntry({
                        direction: 'agent',
                        participant: `${toName} -> ${fromName}`,
                        participantLabel: `${toName} -> ${fromName}`,
                        content: m.response,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                    });
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    }

    protected toggleAutoScroll(): void {
        this.autoScroll.update((v) => !v);
    }

    protected onClear(): void {
        this.entries.set([]);
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

            const result = await firstValueFrom(
                this.api.get<{ messages: AgentMessage[]; total: number }>(`/feed/history?${params}`),
            );
            this.totalMessages.set(result.total);

            this.nextId = 0;
            const newEntries: FeedEntry[] = [];
            // Messages come newest-first from API; reverse to show oldest first
            for (const m of [...result.messages].reverse()) {
                const fromName = this.agentMap[m.fromAgentId]?.name ?? m.fromAgentId.slice(0, 8);
                const toName = this.agentMap[m.toAgentId]?.name ?? m.toAgentId.slice(0, 8);

                newEntries.push({
                    id: this.nextId++,
                    timestamp: m.createdAt ? new Date(m.createdAt + 'Z') : new Date(),
                    direction: 'agent',
                    participant: `${fromName} -> ${toName}`,
                    participantLabel: `${fromName} -> ${toName}`,
                    content: m.content,
                    agentName: fromName,
                    fee: m.paymentMicro > 0 ? m.paymentMicro : null,
                    threadId: m.threadId ?? null,
                });

                if (m.status === 'completed' && m.response) {
                    newEntries.push({
                        id: this.nextId++,
                        timestamp: m.completedAt ? new Date(m.completedAt + 'Z') : new Date(),
                        direction: 'agent',
                        participant: `${toName} -> ${fromName}`,
                        participantLabel: `${toName} -> ${fromName}`,
                        content: m.response,
                        agentName: toName,
                        fee: null,
                        threadId: m.threadId ?? null,
                    });
                }
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

    private agentNameForAddress(address: string): string | null {
        return this.walletToAgent[address]?.name ?? null;
    }
}
