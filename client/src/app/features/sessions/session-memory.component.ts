import {
    Component,
    ChangeDetectionStrategy,
    inject,
    input,
    signal,
    OnInit,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ApiService } from '../../core/services/api.service';
import { MemoryBrowserService } from '../../core/services/memory-browser.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { firstValueFrom } from 'rxjs';
import type { MemoryEntry } from '../../core/services/memory-browser.service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Observation {
    id: string;
    agentId: string;
    source: string;
    sourceId: string | null;
    content: string;
    suggestedKey: string | null;
    relevanceScore: number;
    accessCount: number;
    status: string;
    graduatedKey: string | null;
    createdAt: string;
    expiresAt: string | null;
}

type MemoryTab = 'observations' | 'longterm';

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
    selector: 'app-session-memory',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe, EmptyStateComponent, SkeletonComponent, MatButtonToggleModule],
    template: `
        <div class="session-memory">
            <!-- Tab bar -->
            <div class="session-memory__tabs">
                <mat-button-toggle-group [value]="activeTab()" (change)="activeTab.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle value="observations">
                        Short-term
                        @if (observations().length > 0) {
                            <span class="session-memory__badge">{{ observations().length }}</span>
                        }
                    </mat-button-toggle>
                    <mat-button-toggle value="longterm">
                        On-Chain
                        @if (memories().length > 0) {
                            <span class="session-memory__badge session-memory__badge--chain">{{ memories().length }}</span>
                        }
                    </mat-button-toggle>
                </mat-button-toggle-group>
            </div>

            <!-- Short-term observations -->
            @if (activeTab() === 'observations') {
                @if (loadingObs()) {
                    <div class="session-memory__list">
                        @for (_ of [1,2,3]; track $index) {
                            <app-skeleton />
                        }
                    </div>
                } @else if (observations().length === 0) {
                    <app-empty-state
                        icon="visibility"
                        title="No observations yet"
                        description="Short-term observations for this agent will appear here as they accumulate." />
                } @else {
                    <div class="session-memory__list">
                        @for (obs of observations(); track obs.id) {
                            <div class="memory-card" [class.memory-card--graduated]="obs.status === 'graduated'">
                                <div class="memory-card__header">
                                    <span class="memory-card__source">{{ obs.source }}</span>
                                    <span class="memory-card__status memory-card__status--{{ obs.status }}">{{ obs.status }}</span>
                                    <span class="memory-card__score" title="Relevance score">{{ obs.relevanceScore.toFixed(1) }}</span>
                                    <span class="memory-card__time">{{ obs.createdAt | relativeTime }}</span>
                                </div>
                                <p class="memory-card__content">{{ obs.content }}</p>
                                @if (obs.suggestedKey) {
                                    <div class="memory-card__key">key: {{ obs.suggestedKey }}</div>
                                }
                                @if (obs.graduatedKey) {
                                    <div class="memory-card__key memory-card__key--graduated">graduated → {{ obs.graduatedKey }}</div>
                                }
                            </div>
                        }
                    </div>
                }
            }

            <!-- Long-term on-chain memories -->
            @if (activeTab() === 'longterm') {
                @if (loadingMem()) {
                    <div class="session-memory__list">
                        @for (_ of [1,2,3]; track $index) {
                            <app-skeleton />
                        }
                    </div>
                } @else if (memories().length === 0) {
                    <app-empty-state
                        icon="memory"
                        title="No on-chain memories"
                        description="Long-term memories stored on Algorand for this agent will appear here." />
                } @else {
                    <div class="session-memory__list">
                        @for (mem of memories(); track mem.id) {
                            <div class="memory-card">
                                <div class="memory-card__header">
                                    <span class="memory-card__key-label">{{ mem.key }}</span>
                                    <span class="memory-card__tier memory-card__tier--{{ mem.tier }}">{{ mem.tier }}</span>
                                    @if (mem.decayScore !== null) {
                                        <span class="memory-card__decay" title="Freshness">{{ (mem.decayScore * 100).toFixed(0) }}%</span>
                                    }
                                    <span class="memory-card__time">{{ mem.updatedAt | relativeTime }}</span>
                                </div>
                                <p class="memory-card__content">{{ mem.content }}</p>
                                @if (mem.txid) {
                                    <div class="memory-card__txid">txid: {{ mem.txid.slice(0, 16) }}…</div>
                                }
                            </div>
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .session-memory {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .session-memory__tabs {
            border-bottom: 1px solid var(--border);
            background: var(--bg-surface);
            flex-shrink: 0;
            padding: var(--space-2);
        }
        .session-memory__badge {
            padding: 0.1rem 0.4rem;
            border-radius: 10px;
            background: var(--bg-hover);
            color: var(--text-secondary);
            font-size: 0.65rem;
        }
        .session-memory__badge--chain {
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
        }
        .session-memory__list {
            flex: 1;
            overflow-y: auto;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .memory-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
            transition: border-color 0.15s;
        }
        .memory-card:hover { border-color: var(--border-bright); }
        .memory-card--graduated { opacity: 0.7; }
        .memory-card__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.4rem;
            flex-wrap: wrap;
        }
        .memory-card__source,
        .memory-card__key-label {
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--accent-cyan);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .memory-card__status {
            font-size: 0.65rem;
            padding: 0.1rem 0.35rem;
            border-radius: 8px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .memory-card__status--active { background: var(--accent-green-dim); color: var(--accent-green); }
        .memory-card__status--graduated { background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .memory-card__status--expired,
        .memory-card__status--dismissed { background: var(--bg-hover); color: var(--text-tertiary); }
        .memory-card__tier {
            font-size: 0.65rem;
            padding: 0.1rem 0.35rem;
            border-radius: 8px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .memory-card__tier--longterm { background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .memory-card__tier--shortterm { background: var(--bg-hover); color: var(--text-secondary); }
        .memory-card__score,
        .memory-card__decay {
            margin-left: auto;
            font-size: 0.65rem;
            color: var(--text-tertiary);
        }
        .memory-card__time {
            font-size: 0.65rem;
            color: var(--text-tertiary);
        }
        .memory-card__content {
            margin: 0;
            font-size: 0.8rem;
            color: var(--text-primary);
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .memory-card__key,
        .memory-card__txid {
            margin-top: 0.4rem;
            font-size: 0.65rem;
            color: var(--text-tertiary);
            font-family: var(--font-mono, monospace);
        }
        .memory-card__key--graduated { color: var(--accent-cyan); }
    `,
})
export class SessionMemoryComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly memoryService = inject(MemoryBrowserService);

    readonly agentId = input.required<string>();

    protected readonly activeTab = signal<MemoryTab>('observations');
    protected readonly observations = signal<Observation[]>([]);
    protected readonly memories = signal<MemoryEntry[]>([]);
    protected readonly loadingObs = signal(false);
    protected readonly loadingMem = signal(false);

    ngOnInit(): void {
        this.loadObservations();
        this.loadMemories();
    }

    private async loadObservations(): Promise<void> {
        this.loadingObs.set(true);
        try {
            const result = await firstValueFrom(
                this.api.get<{ observations: Observation[]; total: number }>(
                    `/dashboard/memories/observations?agentId=${encodeURIComponent(this.agentId())}&limit=50`,
                ),
            );
            this.observations.set(result.observations);
        } finally {
            this.loadingObs.set(false);
        }
    }

    private async loadMemories(): Promise<void> {
        this.loadingMem.set(true);
        try {
            await this.memoryService.loadMemories({ agentId: this.agentId(), limit: 50 });
            this.memories.set(this.memoryService.memories());
        } finally {
            this.loadingMem.set(false);
        }
    }
}
