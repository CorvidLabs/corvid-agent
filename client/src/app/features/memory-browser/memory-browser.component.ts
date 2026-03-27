import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MemoryBrowserService } from '../../core/services/memory-browser.service';
import type { MemoryEntry, MemoryTier } from '../../core/services/memory-browser.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

@Component({
    selector: 'app-memory-browser',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2 class="page-title">Memory Browser</h2>
            </div>

            <!-- Stats summary -->
            @if (memoryService.stats(); as stats) {
                <div class="stats-bar">
                    <div class="stat">
                        <span class="stat__value">{{ stats.totalMemories }}</span>
                        <span class="stat__label">Total</span>
                    </div>
                    <div class="stat stat--longterm">
                        <span class="stat__value">{{ stats.byTier.longterm }}</span>
                        <span class="stat__label">On-Chain</span>
                    </div>
                    <div class="stat stat--shortterm">
                        <span class="stat__value">{{ stats.byTier.shortterm }}</span>
                        <span class="stat__label">Pending</span>
                    </div>
                    @if (stats.averageDecayScore !== null) {
                        <div class="stat">
                            <span class="stat__value">{{ (stats.averageDecayScore * 100).toFixed(0) }}%</span>
                            <span class="stat__label">Avg Freshness</span>
                        </div>
                    }
                </div>
            }

            <!-- Toolbar: search + filters -->
            <div class="page__toolbar">
                <input
                    class="search-input"
                    type="text"
                    placeholder="Search by key or content..."
                    [ngModel]="searchQuery()"
                    (ngModelChange)="onSearchChange($event)"
                    aria-label="Search memories" />
                <select
                    class="filter-select"
                    [ngModel]="tierFilter()"
                    (ngModelChange)="onTierChange($event)"
                    aria-label="Filter by tier">
                    <option value="">All Tiers</option>
                    <option value="longterm">On-Chain (longterm)</option>
                    <option value="shortterm">Pending (shortterm)</option>
                </select>
                <select
                    class="filter-select"
                    [ngModel]="statusFilter()"
                    (ngModelChange)="onStatusChange($event)"
                    aria-label="Filter by status">
                    <option value="">All Statuses</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            @if (memoryService.loading()) {
                <app-skeleton variant="table" [count]="6" />
            } @else if (memoryService.memories().length === 0 && !searchQuery() && !tierFilter() && !statusFilter()) {
                <app-empty-state
                    icon="  [mem]\n  /   \\\n |     |"
                    title="No memories found."
                    description="Agent memories will appear here once the agent starts storing data on-chain or locally." />
            } @else {
                <div class="memory-layout">
                    <!-- List panel -->
                    <div class="memory-list" role="list">
                        @for (memory of memoryService.memories(); track memory.id) {
                            <button
                                class="memory-card"
                                role="listitem"
                                [class.memory-card--active]="selectedMemory()?.id === memory.id"
                                (click)="selectMemory(memory)">
                                <div class="memory-card__header">
                                    <code class="memory-card__key">{{ memory.key }}</code>
                                    <span class="tier-badge tier-badge--{{ memory.tier }}">
                                        {{ memory.tier === 'longterm' ? 'ON-CHAIN' : 'LOCAL' }}
                                    </span>
                                </div>
                                <div class="memory-card__meta">
                                    @if (memory.asaId) {
                                        <span class="memory-card__asa">ASA #{{ memory.asaId }}</span>
                                    }
                                    <span class="status-chip status-chip--{{ memory.status }}">{{ memory.status }}</span>
                                    <span class="memory-card__time">{{ memory.updatedAt | relativeTime }}</span>
                                </div>
                                <p class="memory-card__preview">{{ truncate(memory.content, 120) }}</p>
                            </button>
                        } @empty {
                            <p class="no-results">No memories match your search.</p>
                        }

                        <!-- Pagination -->
                        @if (memoryService.total() > pageSize) {
                            <div class="pagination">
                                <button
                                    class="btn btn--ghost btn--sm"
                                    [disabled]="currentPage() <= 1"
                                    (click)="goToPage(currentPage() - 1)">Prev</button>
                                <span class="pagination__info">
                                    Page {{ currentPage() }} of {{ totalPages() }}
                                    ({{ memoryService.total() }} total)
                                </span>
                                <button
                                    class="btn btn--ghost btn--sm"
                                    [disabled]="currentPage() >= totalPages()"
                                    (click)="goToPage(currentPage() + 1)">Next</button>
                            </div>
                        }
                    </div>

                    <!-- Detail panel -->
                    @if (selectedMemory(); as mem) {
                        <div class="memory-detail">
                            @if (editing()) {
                                <div class="detail-section">
                                    <h3 class="detail-title">Edit Memory</h3>
                                    <label class="field-label">Key</label>
                                    <input
                                        class="field-input field-input--disabled"
                                        type="text"
                                        [value]="mem.key"
                                        disabled />
                                    <label class="field-label">Content</label>
                                    <textarea
                                        class="field-input field-textarea"
                                        rows="10"
                                        [ngModel]="editContent()"
                                        (ngModelChange)="editContent.set($event)"></textarea>
                                    <div class="detail-actions">
                                        <button class="btn btn--primary" (click)="saveEdit()" [disabled]="saving()">
                                            {{ saving() ? 'Saving...' : 'Save' }}
                                        </button>
                                        <button class="btn btn--ghost" (click)="editing.set(false)">Cancel</button>
                                    </div>
                                </div>
                            } @else {
                                <div class="detail-header">
                                    <div>
                                        <h3 class="detail-name">
                                            <code>{{ mem.key }}</code>
                                        </h3>
                                        <span class="detail-meta">Updated {{ mem.updatedAt | relativeTime }}</span>
                                    </div>
                                    <div class="detail-header-actions">
                                        <button class="btn btn--ghost btn--sm" (click)="startEdit()">Edit</button>
                                        <button class="btn btn--danger btn--sm" (click)="confirmDelete()">Delete</button>
                                    </div>
                                </div>

                                <!-- Metadata grid -->
                                <div class="meta-grid">
                                    <div class="meta-item">
                                        <span class="meta-label">Tier</span>
                                        <span class="tier-badge tier-badge--{{ mem.tier }}">
                                            {{ mem.tier === 'longterm' ? 'ON-CHAIN' : 'LOCAL' }}
                                        </span>
                                    </div>
                                    <div class="meta-item">
                                        <span class="meta-label">Status</span>
                                        <span class="status-chip status-chip--{{ mem.status }}">{{ mem.status }}</span>
                                    </div>
                                    <div class="meta-item">
                                        <span class="meta-label">Storage</span>
                                        <span class="meta-value">{{ mem.storageType }}</span>
                                    </div>
                                    @if (mem.asaId) {
                                        <div class="meta-item">
                                            <span class="meta-label">ASA ID</span>
                                            <span class="meta-value meta-value--mono">{{ mem.asaId }}</span>
                                        </div>
                                    }
                                    @if (mem.txid) {
                                        <div class="meta-item meta-item--wide">
                                            <span class="meta-label">Transaction ID</span>
                                            <code class="meta-value meta-value--mono meta-value--break">{{ mem.txid }}</code>
                                        </div>
                                    }
                                    <div class="meta-item">
                                        <span class="meta-label">Agent</span>
                                        <span class="meta-value meta-value--mono">{{ mem.agentId }}</span>
                                    </div>
                                    <div class="meta-item">
                                        <span class="meta-label">Created</span>
                                        <span class="meta-value">{{ mem.createdAt | relativeTime }}</span>
                                    </div>
                                    <div class="meta-item">
                                        <span class="meta-label">Freshness</span>
                                        <div class="decay-bar">
                                            <div class="decay-bar__fill" [style.width.%]="mem.decayScore * 100"></div>
                                        </div>
                                        <span class="meta-value">{{ (mem.decayScore * 100).toFixed(0) }}%</span>
                                    </div>
                                    @if (mem.category) {
                                        <div class="meta-item">
                                            <span class="meta-label">Category</span>
                                            <span class="meta-value">{{ mem.category }}
                                                @if (mem.categoryConfidence !== null) {
                                                    <span class="confidence">({{ (mem.categoryConfidence * 100).toFixed(0) }}%)</span>
                                                }
                                            </span>
                                        </div>
                                    }
                                </div>

                                <!-- Full content -->
                                <div class="detail-section">
                                    <h4 class="section-label">Content</h4>
                                    <pre class="memory-content">{{ mem.content }}</pre>
                                </div>
                            }
                        </div>
                    } @else {
                        <div class="memory-detail memory-detail--empty">
                            <p>Select a memory to view details</p>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; height: 100%; display: flex; flex-direction: column; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__toolbar { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }

        /* ── Stats bar ── */
        .stats-bar {
            display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;
        }
        .stat {
            padding: 0.5rem 1rem; background: var(--bg-surface);
            border: 1px solid var(--border); border-radius: var(--radius);
            display: flex; flex-direction: column; align-items: center; min-width: 80px;
        }
        .stat__value { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
        .stat__label { font-size: 0.65rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
        .stat--longterm { border-color: var(--accent-green, #00ff88); }
        .stat--longterm .stat__value { color: var(--accent-green, #00ff88); }
        .stat--shortterm { border-color: var(--accent-yellow, #ffcc00); }
        .stat--shortterm .stat__value { color: var(--accent-yellow, #ffcc00); }

        /* ── Search & filters ── */
        .search-input {
            flex: 1; min-width: 200px; padding: 0.5rem 0.75rem;
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius); color: var(--text-primary);
            font-size: 0.85rem; font-family: inherit;
            transition: border-color 0.2s;
        }
        .search-input:focus { outline: none; border-color: var(--accent-cyan); }
        .search-input::placeholder { color: var(--text-tertiary); }

        .filter-select {
            padding: 0.5rem 0.75rem; background: var(--bg-surface);
            border: 1px solid var(--border); border-radius: var(--radius);
            color: var(--text-primary); font-size: 0.85rem; font-family: inherit;
            appearance: auto; cursor: pointer;
        }
        .filter-select:focus { outline: none; border-color: var(--accent-cyan); }

        /* ── Buttons ── */
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem;
            font-weight: 600; cursor: pointer; border: 1px solid; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent;
        }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn--ghost { color: var(--text-secondary); border-color: var(--border); }
        .btn--ghost:hover { border-color: var(--text-tertiary); }
        .btn--ghost:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn--danger { color: var(--accent-red, #ff5555); border-color: var(--accent-red, #ff5555); }
        .btn--danger:hover { background: rgba(255, 85, 85, 0.1); }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }

        /* ── Layout ── */
        .memory-layout {
            display: grid; grid-template-columns: 1fr 1.2fr; gap: 1.5rem;
            flex: 1; min-height: 0;
        }

        /* ── List panel ── */
        .memory-list {
            display: flex; flex-direction: column; gap: 0.5rem;
            overflow-y: auto; max-height: calc(100vh - 320px);
        }

        .memory-card {
            display: flex; flex-direction: column; gap: 0.35rem;
            padding: 0.75rem 1rem; background: var(--bg-surface);
            border: 1px solid var(--border); border-radius: var(--radius-lg);
            cursor: pointer; text-align: left; width: 100%;
            font-family: inherit; color: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .memory-card:hover { border-color: var(--accent-green); box-shadow: 0 0 12px rgba(0, 255, 136, 0.08); }
        .memory-card--active { border-color: var(--accent-cyan); box-shadow: 0 0 16px rgba(0, 200, 255, 0.12); }

        .memory-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .memory-card__key {
            font-size: 0.85rem; font-weight: 600; color: var(--text-primary);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .memory-card__meta {
            display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
        }
        .memory-card__asa {
            font-size: 0.7rem; color: var(--accent-cyan); font-weight: 600;
            font-family: var(--font-mono, monospace);
        }
        .memory-card__time { font-size: 0.7rem; color: var(--text-tertiary); margin-left: auto; }
        .memory-card__preview {
            margin: 0; font-size: 0.75rem; color: var(--text-secondary);
            line-height: 1.4; overflow: hidden;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }

        /* ── Tier badge ── */
        .tier-badge {
            display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px;
            font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.05em; border: 1px solid; flex-shrink: 0;
        }
        .tier-badge--longterm {
            color: var(--accent-green, #00ff88); border-color: var(--accent-green, #00ff88);
            background: rgba(0, 255, 136, 0.1);
        }
        .tier-badge--shortterm {
            color: var(--accent-yellow, #ffcc00); border-color: var(--accent-yellow, #ffcc00);
            background: rgba(255, 204, 0, 0.1);
        }

        /* ── Status chip ── */
        .status-chip {
            display: inline-block; padding: 0.1rem 0.35rem; border-radius: 4px;
            font-size: 0.6rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .status-chip--confirmed { color: var(--accent-green, #00ff88); background: rgba(0, 255, 136, 0.1); }
        .status-chip--pending { color: var(--accent-yellow, #ffcc00); background: rgba(255, 204, 0, 0.1); }
        .status-chip--failed { color: var(--accent-red, #ff5555); background: rgba(255, 85, 85, 0.1); }

        .no-results { color: var(--text-tertiary); font-size: 0.85rem; padding: 1rem; }

        /* ── Pagination ── */
        .pagination {
            display: flex; align-items: center; justify-content: center; gap: 0.75rem;
            padding: 0.75rem 0; margin-top: 0.5rem;
        }
        .pagination__info { font-size: 0.75rem; color: var(--text-tertiary); }

        /* ── Detail panel ── */
        .memory-detail {
            background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); padding: 1.5rem;
            overflow-y: auto; max-height: calc(100vh - 320px);
        }
        .memory-detail--empty {
            display: flex; align-items: center; justify-content: center;
            color: var(--text-tertiary);
        }

        .detail-header {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 1rem; margin-bottom: 1.5rem;
        }
        .detail-name { margin: 0; font-size: 1rem; color: var(--text-primary); }
        .detail-name code { font-size: 0.95rem; }
        .detail-meta { font-size: 0.75rem; color: var(--text-tertiary); }
        .detail-header-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

        /* ── Metadata grid ── */
        .meta-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 0.75rem; margin-bottom: 1.5rem;
        }
        .meta-item {
            padding: 0.5rem 0.75rem;
            background: var(--bg-base, rgba(0, 0, 0, 0.2));
            border-radius: var(--radius);
        }
        .meta-item--wide { grid-column: 1 / -1; }
        .meta-label {
            display: block; font-size: 0.65rem; font-weight: 600; color: var(--text-tertiary);
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;
        }
        .meta-value { font-size: 0.8rem; color: var(--text-primary); }
        .meta-value--mono { font-family: var(--font-mono, monospace); font-size: 0.75rem; }
        .meta-value--break { word-break: break-all; }
        .confidence { font-size: 0.7rem; color: var(--text-tertiary); }

        /* ── Decay bar ── */
        .decay-bar {
            width: 100%; height: 4px; background: var(--border);
            border-radius: 2px; margin: 0.25rem 0; overflow: hidden;
        }
        .decay-bar__fill {
            height: 100%; background: var(--accent-cyan);
            border-radius: 2px; transition: width 0.3s;
        }

        /* ── Content ── */
        .detail-section { margin-bottom: 1.5rem; }
        .detail-title { margin: 0 0 1rem; color: var(--text-primary); }
        .section-label {
            margin: 0 0 0.5rem; font-size: 0.75rem; font-weight: 600;
            color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .memory-content {
            margin: 0; padding: 1rem; background: var(--bg-base, rgba(0, 0, 0, 0.3));
            border-radius: var(--radius); color: var(--text-secondary);
            font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap;
            word-break: break-word; max-height: 400px; overflow-y: auto;
            font-family: var(--font-mono, monospace);
        }

        .detail-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

        /* ── Form fields ── */
        .field-label {
            display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary);
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; margin-top: 0.75rem;
        }
        .field-input {
            width: 100%; padding: 0.5rem 0.75rem; background: var(--bg-base, rgba(0, 0, 0, 0.3));
            border: 1px solid var(--border); border-radius: var(--radius);
            color: var(--text-primary); font-size: 0.85rem; font-family: inherit;
            box-sizing: border-box;
        }
        .field-input:focus { outline: none; border-color: var(--accent-cyan); }
        .field-input--disabled { opacity: 0.5; cursor: not-allowed; }
        .field-textarea {
            resize: vertical; min-height: 120px;
            font-family: var(--font-mono, monospace); font-size: 0.8rem;
        }

        /* ── Responsive (mobile-first) ── */
        @media (max-width: 768px) {
            .page { padding: 1rem; }
            .memory-layout { grid-template-columns: 1fr; }
            .memory-list { max-height: none; }
            .memory-detail { max-height: none; }
            .stats-bar { gap: 0.5rem; }
            .stat { min-width: 60px; padding: 0.35rem 0.5rem; }
            .stat__value { font-size: 1rem; }
            .meta-grid { grid-template-columns: 1fr 1fr; }
            .page__toolbar { flex-direction: column; }
            .search-input { min-width: unset; }
        }
    `,
})
export class MemoryBrowserComponent implements OnInit {
    protected readonly memoryService = inject(MemoryBrowserService);

    // Search & filter state
    readonly searchQuery = signal('');
    readonly tierFilter = signal<MemoryTier | ''>('');
    readonly statusFilter = signal('');

    // Pagination
    readonly pageSize = 50;
    readonly currentPage = signal(1);
    readonly totalPages = computed(() => Math.max(1, Math.ceil(this.memoryService.total() / this.pageSize)));

    // Selection
    readonly selectedMemory = signal<MemoryEntry | null>(null);

    // Edit state
    readonly editing = signal(false);
    readonly editContent = signal('');
    readonly saving = signal(false);

    // Debounce timer for search
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    ngOnInit(): void {
        this.loadData();
    }

    private async loadData(): Promise<void> {
        await Promise.all([
            this.memoryService.loadMemories({ limit: this.pageSize }),
            this.memoryService.loadStats(),
        ]);
    }

    onSearchChange(value: string): void {
        this.searchQuery.set(value);
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            this.currentPage.set(1);
            this.reloadMemories();
        }, 300);
    }

    onTierChange(value: string): void {
        this.tierFilter.set(value as MemoryTier | '');
        this.currentPage.set(1);
        this.reloadMemories();
    }

    onStatusChange(value: string): void {
        this.statusFilter.set(value);
        this.currentPage.set(1);
        this.reloadMemories();
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages()) return;
        this.currentPage.set(page);
        this.reloadMemories();
    }

    selectMemory(memory: MemoryEntry): void {
        this.selectedMemory.set(memory);
        this.editing.set(false);
    }

    // ── Edit ─────────────────────────────────────────────────────────────

    startEdit(): void {
        const mem = this.selectedMemory();
        if (!mem) return;
        this.editContent.set(mem.content);
        this.editing.set(true);
    }

    async saveEdit(): Promise<void> {
        const mem = this.selectedMemory();
        if (!mem) return;
        const content = this.editContent().trim();
        if (!content) return;

        this.saving.set(true);
        try {
            const result = await this.memoryService.saveMemory(mem.agentId, mem.key, content);
            if (!result.isError) {
                this.editing.set(false);
                await this.reloadMemories();
                // Re-select the updated memory
                const updated = this.memoryService.memories().find((m) => m.key === mem.key && m.agentId === mem.agentId);
                if (updated) this.selectedMemory.set(updated);
            }
        } finally {
            this.saving.set(false);
        }
    }

    // ── Delete ───────────────────────────────────────────────────────────

    async confirmDelete(): Promise<void> {
        const mem = this.selectedMemory();
        if (!mem) return;
        if (!confirm(`Delete memory "${mem.key}"? This will archive the memory.`)) return;

        const result = await this.memoryService.deleteMemory(mem.agentId, mem.key, 'soft');
        if (!result.isError) {
            this.selectedMemory.set(null);
            await this.reloadMemories();
            await this.memoryService.loadStats();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    truncate(text: string, maxLength: number): string {
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    private async reloadMemories(): Promise<void> {
        await this.memoryService.loadMemories({
            search: this.searchQuery() || undefined,
            tier: (this.tierFilter() || undefined) as MemoryTier | undefined,
            status: this.statusFilter() || undefined,
            limit: this.pageSize,
            offset: (this.currentPage() - 1) * this.pageSize,
        });
    }
}
