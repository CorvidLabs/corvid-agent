import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { WebSocketService } from '../../core/services/websocket.service';
import { AgentService } from '../../core/services/agent.service';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import type { Agent } from '../../core/models/agent.model';

interface FeedEntry {
    id: number;
    timestamp: Date;
    direction: 'inbound' | 'outbound' | 'agent';
    participant: string;
    participantLabel: string;
    content: string;
    agentName: string | null;
    fee: number | null;
}

@Component({
    selector: 'app-live-feed',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Live Feed</h2>
                <div class="page__actions">
                    <span class="feed__count">{{ entries().length }} messages</span>
                    <button class="btn btn--secondary" (click)="toggleAutoScroll()">
                        Auto-scroll: {{ autoScroll() ? 'ON' : 'OFF' }}
                    </button>
                    <button class="btn btn--danger" (click)="onClear()">Clear</button>
                </div>
            </div>

            @if (entries().length === 0) {
                <div class="feed__empty">
                    <p>No messages yet. Waiting for AlgoChat activity...</p>
                    <p class="feed__hint">Messages between agents and external participants will appear here in real time.</p>
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
                                @if (entry.agentName) {
                                    <span class="feed__agent">{{ entry.agentName }}</span>
                                }
                                <span class="feed__participant" [title]="entry.participant">{{ entry.participantLabel }}</span>
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
            max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
    private readonly feedList = viewChild<ElementRef<HTMLElement>>('feedList');

    protected readonly entries = signal<FeedEntry[]>([]);
    protected readonly autoScroll = signal(true);

    private unsubscribeWs: (() => void) | null = null;
    private nextId = 0;
    private agentMap: Record<string, Agent> = {};
    private walletToAgent: Record<string, Agent> = {};

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        for (const agent of this.agentService.agents()) {
            this.agentMap[agent.id] = agent;
            if (agent.walletAddress) {
                this.walletToAgent[agent.walletAddress] = agent;
            }
        }

        this.unsubscribeWs = this.wsService.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'algochat_message') {
                this.addEntry({
                    direction: msg.direction,
                    participant: msg.participant,
                    participantLabel: this.labelForAddress(msg.participant),
                    content: msg.content,
                    agentName: this.agentNameForAddress(msg.participant),
                    fee: null,
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
                    });
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.unsubscribeWs?.();
    }

    protected toggleAutoScroll(): void {
        this.autoScroll.update((v) => !v);
    }

    protected onClear(): void {
        this.entries.set([]);
    }

    private addEntry(partial: Omit<FeedEntry, 'id' | 'timestamp'>): void {
        const entry: FeedEntry = {
            id: this.nextId++,
            timestamp: new Date(),
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
