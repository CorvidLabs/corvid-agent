import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { firstValueFrom } from 'rxjs';

// ─── API response types ─────────────────────────────────────────────────────

type StorageType = 'arc69' | 'plain-txn' | 'pending';

interface MemoryEntry {
    id: string;
    agentId: string;
    key: string;
    content: string;
    tier: 'longterm' | 'shortterm';
    storageType: StorageType;
    status: string;
    txid: string | null;
    asaId: number | null;
    category: string | null;
    categoryConfidence: number | null;
    decayScore: number;
    createdAt: string;
    updatedAt: string;
}

interface MemoryListResponse {
    entries: MemoryEntry[];
    total: number;
    limit: number;
    offset: number;
}

interface Observation {
    id: string;
    agentId: string;
    source: string;
    sourceId: string | null;
    content: string;
    suggestedKey: string | null;
    relevanceScore: number;
    accessCount: number;
    lastAccessedAt: string | null;
    status: string;
    graduatedKey: string | null;
    createdAt: string;
    expiresAt: string | null;
}

interface ObservationListResponse {
    observations: Observation[];
    total: number;
}

interface ObservationStatsResponse {
    agents: Array<{ agentId: string; active: number; graduated: number; expired: number; dismissed: number }>;
    totalActive: number;
    graduationCandidates: number;
}

interface MemoryStats {
    totalMemories: number;
    byTier: { longterm: number; shortterm: number };
    byStatus: { confirmed: number; pending: number; failed: number };
    byCategory: Record<string, number>;
    byAgent: Array<{ agentId: string; agentName: string; total: number; longterm: number; shortterm: number }>;
    oldestMemory: string | null;
    newestMemory: string | null;
    averageDecayScore: number | null;
}

interface SyncStatus {
    isRunning: boolean;
    pendingCount: number;
    failedCount: number;
    lastSyncAt: string | null;
    syncIntervalMs: number;
    recentErrors: Array<{ memoryId: string; key: string; error: string; failedAt: string }>;
}

@Component({
    selector: 'app-brain-viewer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe, RelativeTimePipe, SkeletonComponent],
    template: `
        <div class="brain-viewer">
            <h2>Brain Viewer</h2>

            @if (loading()) {
                <div class="loading"><app-skeleton variant="card" [count]="4" /></div>
            } @else {
                <!-- Sync Status Banner -->
                @if (syncStatus()) {
                    <div class="sync-banner" [class.sync-banner--ok]="syncStatus()!.isRunning" [class.sync-banner--warn]="!syncStatus()!.isRunning">
                        <span class="sync-banner__indicator"></span>
                        <span class="sync-banner__text">
                            Sync {{ syncStatus()!.isRunning ? 'Active' : 'Inactive' }}
                            @if (syncStatus()!.pendingCount > 0) {
                                &middot; {{ syncStatus()!.pendingCount }} pending
                            }
                            @if (syncStatus()!.failedCount > 0) {
                                &middot; {{ syncStatus()!.failedCount }} failed
                            }
                            @if (syncStatus()!.lastSyncAt) {
                                &middot; Last sync: {{ syncStatus()!.lastSyncAt | relativeTime }}
                            }
                        </span>
                    </div>
                }

                <!-- Stats Cards -->
                @if (stats()) {
                    <div class="stats-cards">
                        <div class="stat-card">
                            <span class="stat-card__label">Total Memories</span>
                            <span class="stat-card__value">{{ stats()!.totalMemories }}</span>
                        </div>
                        <div class="stat-card stat-card--longterm">
                            <span class="stat-card__label">Long-term</span>
                            <span class="stat-card__value stat-card__value--longterm">{{ stats()!.byTier.longterm }}</span>
                        </div>
                        <div class="stat-card stat-card--shortterm">
                            <span class="stat-card__label">Short-term</span>
                            <span class="stat-card__value stat-card__value--shortterm">{{ stats()!.byTier.shortterm }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Avg Decay</span>
                            <span class="stat-card__value stat-card__value--decay">{{ stats()!.averageDecayScore !== null ? (stats()!.averageDecayScore | number:'1.2-2') : '—' }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Confirmed</span>
                            <span class="stat-card__value stat-card__value--confirmed">{{ stats()!.byStatus.confirmed }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Pending</span>
                            <span class="stat-card__value stat-card__value--pending">{{ stats()!.byStatus.pending }}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-card__label">Failed</span>
                            <span class="stat-card__value stat-card__value--failed">{{ stats()!.byStatus.failed }}</span>
                        </div>
                        @if (obsStats()) {
                            <div class="stat-card stat-card--observations">
                                <span class="stat-card__label">Observations</span>
                                <span class="stat-card__value stat-card__value--observations">{{ obsStats()!.totalActive }}</span>
                            </div>
                        }
                    </div>

                    <!-- Tier Breakdown Bar -->
                    @if (stats()!.totalMemories > 0) {
                        <div class="section">
                            <h3>Tier Breakdown</h3>
                            <div class="tier-bar">
                                <div
                                    class="tier-bar__segment tier-bar__segment--longterm"
                                    [style.flex]="stats()!.byTier.longterm"
                                    [title]="'Long-term: ' + stats()!.byTier.longterm">
                                    <span class="tier-bar__label">LT ({{ stats()!.byTier.longterm }})</span>
                                </div>
                                <div
                                    class="tier-bar__segment tier-bar__segment--shortterm"
                                    [style.flex]="stats()!.byTier.shortterm"
                                    [title]="'Short-term: ' + stats()!.byTier.shortterm">
                                    <span class="tier-bar__label">ST ({{ stats()!.byTier.shortterm }})</span>
                                </div>
                            </div>
                        </div>
                    }

                    <!-- Per-Agent Breakdown -->
                    @if (stats()!.byAgent.length > 0) {
                        <div class="section">
                            <h3>Memories by Agent</h3>
                            <div class="agent-table">
                                <div class="agent-table__header">
                                    <span>Agent</span>
                                    <span>Total</span>
                                    <span>Long-term</span>
                                    <span>Short-term</span>
                                </div>
                                @for (agent of stats()!.byAgent; track agent.agentId) {
                                    <div class="agent-table__row" (click)="filterByAgent(agent.agentId)">
                                        <span class="agent-name">{{ agent.agentName }}</span>
                                        <span>{{ agent.total }}</span>
                                        <span class="longterm-val">{{ agent.longterm }}</span>
                                        <span class="shortterm-val">{{ agent.shortterm }}</span>
                                    </div>
                                }
                            </div>
                        </div>
                    }

                    <!-- Categories -->
                    @if (categoryEntries().length > 0) {
                        <div class="section">
                            <h3>Categories</h3>
                            <div class="category-chips">
                                @for (cat of categoryEntries(); track cat.name) {
                                    <button
                                        class="chip"
                                        [class.chip--active]="categoryFilter() === cat.name"
                                        (click)="toggleCategory(cat.name)">
                                        {{ cat.name }} ({{ cat.count }})
                                    </button>
                                }
                            </div>
                        </div>
                    }
                }

                <!-- Filters & Search -->
                <div class="section">
                    <h3>Memory Explorer</h3>
                    <div class="filters">
                        <input
                            class="search-input"
                            type="text"
                            placeholder="Search memories..."
                            [value]="searchQuery()"
                            (input)="onSearchInput($event)"
                            (keydown.enter)="applySearch()" />
                        <div class="filter-chips">
                            <button class="chip" [class.chip--active]="tierFilter() === null" (click)="setTier(null)">All</button>
                            <button class="chip chip--lt" [class.chip--active]="tierFilter() === 'longterm'" (click)="setTier('longterm')">Long-term</button>
                            <button class="chip chip--st" [class.chip--active]="tierFilter() === 'shortterm'" (click)="setTier('shortterm')">Short-term</button>
                        </div>
                        <div class="filter-chips">
                            <button class="chip" [class.chip--active]="statusFilter() === null" (click)="setStatus(null)">All</button>
                            <button class="chip" [class.chip--active]="statusFilter() === 'confirmed'" (click)="setStatus('confirmed')">Confirmed</button>
                            <button class="chip" [class.chip--active]="statusFilter() === 'pending'" (click)="setStatus('pending')">Pending</button>
                            <button class="chip" [class.chip--active]="statusFilter() === 'failed'" (click)="setStatus('failed')">Failed</button>
                        </div>
                        @if (agentFilter()) {
                            <button class="chip chip--clear" (click)="clearAgentFilter()">Agent: {{ agentFilter() }} &times;</button>
                        }
                    </div>
                </div>

                <!-- Memory List -->
                @if (listLoading()) {
                    <p class="loading">Searching...</p>
                } @else {
                    <div class="section">
                        <div class="list-header">
                            <span class="list-header__count">{{ listTotal() }} memories</span>
                            <div class="pagination">
                                <button class="btn--sm" [disabled]="currentOffset() === 0" (click)="prevPage()">Prev</button>
                                <span class="page-info">{{ currentOffset() + 1 }}–{{ Math.min(currentOffset() + pageSize(), listTotal()) }}</span>
                                <button class="btn--sm" [disabled]="currentOffset() + pageSize() >= listTotal()" (click)="nextPage()">Next</button>
                            </div>
                        </div>

                        @if (memories().length === 0) {
                            <div class="empty-state">
                                <pre class="empty-state__icon">  _____
 / o o \\
|  ___  |
 \\_____/</pre>
                                <p>No memories found</p>
                            </div>
                        } @else {
                            <div class="memory-list">
                                @for (mem of memories(); track mem.id) {
                                    <div class="memory-card"
                                         [class.memory-card--expanded]="expandedId() === mem.id"
                                         (click)="toggleExpand(mem.id)">
                                        <div class="memory-card__header">
                                            <span class="memory-card__tier" [attr.data-tier]="mem.tier">{{ mem.tier === 'longterm' ? 'LT' : 'ST' }}</span>
                                            <span class="memory-card__storage" [attr.data-storage]="mem.storageType">{{ storageLabel(mem.storageType) }}</span>
                                            <span class="memory-card__key">{{ mem.key }}</span>
                                            <span class="memory-card__status" [attr.data-status]="mem.status">{{ mem.status }}</span>
                                            <span class="memory-card__decay" [title]="'Decay score: ' + mem.decayScore.toFixed(3)">
                                                {{ decayBar(mem.decayScore) }}
                                            </span>
                                            @if (mem.category) {
                                                <span class="memory-card__category">{{ mem.category }}</span>
                                            }
                                            <span class="memory-card__time">{{ mem.updatedAt | relativeTime }}</span>
                                        </div>
                                        @if (expandedId() === mem.id) {
                                            <div class="memory-card__detail">
                                                <div class="detail-row">
                                                    <span class="detail-label">ID</span>
                                                    <span class="detail-value detail-value--mono">{{ mem.id }}</span>
                                                </div>
                                                <div class="detail-row">
                                                    <span class="detail-label">Agent</span>
                                                    <span class="detail-value">{{ mem.agentId }}</span>
                                                </div>
                                                <div class="detail-row">
                                                    <span class="detail-label">Storage</span>
                                                    <span class="detail-value" [attr.data-storage]="mem.storageType">{{ storageLabel(mem.storageType) }}</span>
                                                </div>
                                                @if (mem.txid) {
                                                    <div class="detail-row">
                                                        <span class="detail-label">TXID</span>
                                                        <span class="detail-value detail-value--mono detail-value--txid">{{ mem.txid }}</span>
                                                    </div>
                                                }
                                                @if (mem.asaId) {
                                                    <div class="detail-row">
                                                        <span class="detail-label">ASA ID</span>
                                                        <span class="detail-value detail-value--mono detail-value--asa">{{ mem.asaId }}</span>
                                                    </div>
                                                }
                                                <div class="detail-row">
                                                    <span class="detail-label">Decay</span>
                                                    <span class="detail-value">{{ mem.decayScore | number:'1.4-4' }}</span>
                                                </div>
                                                <div class="detail-row">
                                                    <span class="detail-label">Created</span>
                                                    <span class="detail-value">{{ mem.createdAt }}</span>
                                                </div>
                                                <div class="detail-row">
                                                    <span class="detail-label">Updated</span>
                                                    <span class="detail-value">{{ mem.updatedAt }}</span>
                                                </div>
                                                <div class="detail-content">
                                                    <span class="detail-label">Content</span>
                                                    <pre class="detail-pre">{{ mem.content }}</pre>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }

                <!-- Sync Errors -->
                @if (syncStatus() && syncStatus()!.recentErrors.length > 0) {
                    <div class="section section--errors">
                        <h3>Recent Sync Errors</h3>
                        @for (err of syncStatus()!.recentErrors; track err.memoryId) {
                            <div class="error-row">
                                <span class="error-row__key">{{ err.key }}</span>
                                <span class="error-row__msg">{{ err.error }}</span>
                                <span class="error-row__time">{{ err.failedAt | relativeTime }}</span>
                            </div>
                        }
                    </div>
                }

                <!-- Observations (Short-Term Memory Pipeline) -->
                <div class="section">
                    <div class="obs-header">
                        <h3>Observations</h3>
                        @if (obsStats()) {
                            <span class="obs-header__meta">
                                {{ obsStats()!.totalActive }} active
                                @if (obsStats()!.graduationCandidates > 0) {
                                    &middot; {{ obsStats()!.graduationCandidates }} ready to graduate
                                }
                            </span>
                        }
                    </div>
                    <div class="filter-chips" style="margin-bottom: 0.75rem;">
                        <button class="chip" [class.chip--active]="obsStatusFilter() === null" (click)="setObsStatus(null)">All</button>
                        <button class="chip chip--obs-active" [class.chip--active]="obsStatusFilter() === 'active'" (click)="setObsStatus('active')">Active</button>
                        <button class="chip chip--obs-graduated" [class.chip--active]="obsStatusFilter() === 'graduated'" (click)="setObsStatus('graduated')">Graduated</button>
                        <button class="chip chip--obs-expired" [class.chip--active]="obsStatusFilter() === 'expired'" (click)="setObsStatus('expired')">Expired</button>
                        <button class="chip chip--obs-dismissed" [class.chip--active]="obsStatusFilter() === 'dismissed'" (click)="setObsStatus('dismissed')">Dismissed</button>
                    </div>

                    @if (obsLoading()) {
                        <p class="loading">Loading observations...</p>
                    } @else if (observations().length === 0) {
                        <p class="obs-empty">No observations found</p>
                    } @else {
                        <div class="obs-list">
                            @for (obs of observations(); track obs.id) {
                                <div class="obs-card"
                                     [class.obs-card--expanded]="expandedObsId() === obs.id"
                                     (click)="toggleObsExpand(obs.id)">
                                    <div class="obs-card__header">
                                        <span class="obs-card__source" [attr.data-source]="obs.source">{{ obs.source }}</span>
                                        <span class="obs-card__content-preview">{{ obs.content.slice(0, 80) }}{{ obs.content.length > 80 ? '...' : '' }}</span>
                                        <span class="obs-card__score" [title]="'Relevance: ' + obs.relevanceScore.toFixed(1) + ' / Access: ' + obs.accessCount">
                                            {{ relevanceBar(obs.relevanceScore) }} {{ obs.relevanceScore.toFixed(1) }}
                                        </span>
                                        <span class="obs-card__status" [attr.data-obs-status]="obs.status">{{ obs.status }}</span>
                                    </div>
                                    @if (expandedObsId() === obs.id) {
                                        <div class="obs-card__detail">
                                            <div class="detail-row">
                                                <span class="detail-label">ID</span>
                                                <span class="detail-value detail-value--mono">{{ obs.id }}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Agent</span>
                                                <span class="detail-value">{{ obs.agentId }}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Source</span>
                                                <span class="detail-value">{{ obs.source }}{{ obs.sourceId ? ' (' + obs.sourceId + ')' : '' }}</span>
                                            </div>
                                            @if (obs.suggestedKey) {
                                                <div class="detail-row">
                                                    <span class="detail-label">Key</span>
                                                    <span class="detail-value detail-value--mono">{{ obs.suggestedKey }}</span>
                                                </div>
                                            }
                                            <div class="detail-row">
                                                <span class="detail-label">Score</span>
                                                <span class="detail-value">{{ obs.relevanceScore.toFixed(2) }} ({{ obs.accessCount }} accesses)</span>
                                            </div>
                                            @if (obs.graduatedKey) {
                                                <div class="detail-row">
                                                    <span class="detail-label">Graduated</span>
                                                    <span class="detail-value detail-value--mono" style="color: var(--accent-green)">{{ obs.graduatedKey }}</span>
                                                </div>
                                            }
                                            @if (obs.expiresAt) {
                                                <div class="detail-row">
                                                    <span class="detail-label">Expires</span>
                                                    <span class="detail-value">{{ obs.expiresAt | relativeTime }}</span>
                                                </div>
                                            }
                                            <div class="detail-row">
                                                <span class="detail-label">Created</span>
                                                <span class="detail-value">{{ obs.createdAt }}</span>
                                            </div>
                                            <div class="detail-content">
                                                <span class="detail-label">Content</span>
                                                <pre class="detail-pre">{{ obs.content }}</pre>
                                            </div>
                                            @if (obs.status === 'active') {
                                                <div class="obs-card__actions">
                                                    <button class="btn--action btn--graduate"
                                                            [disabled]="graduatingId() === obs.id"
                                                            (click)="forceGraduate(obs.id, $event)">
                                                        {{ graduatingId() === obs.id ? 'Graduating...' : 'Force Graduate' }}
                                                    </button>
                                                    <button class="btn--action btn--boost"
                                                            (click)="boostObs(obs.id, $event)">
                                                        Boost +1
                                                    </button>
                                                </div>
                                            }
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
        .brain-viewer { padding: var(--space-6); }
        .brain-viewer h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .brain-viewer h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .loading { color: var(--text-secondary); }

        /* ─── Sync Banner ────── */
        .sync-banner {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.6rem var(--space-4);
            border-radius: var(--radius-lg);
            margin-bottom: 1.25rem;
            font-size: 0.75rem;
            border: 1px solid var(--border);
        }
        .sync-banner--ok { background: var(--accent-green-faint); border-color: var(--accent-green); }
        .sync-banner--warn { background: var(--accent-amber-faint); border-color: var(--accent-amber); }
        .sync-banner__indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .sync-banner--ok .sync-banner__indicator { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green); }
        .sync-banner--warn .sync-banner__indicator { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber); }
        .sync-banner__text { color: var(--text-secondary); }

        /* ─── Stats Cards ────── */
        .stats-cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.25rem;
        }
        .stat-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }
        .stat-card--longterm { border-color: var(--accent-cyan); border-style: dashed; }
        .stat-card--shortterm { border-color: var(--accent-amber); border-style: dashed; }
        .stat-card__label {
            font-size: 0.65rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .stat-card__value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--accent-cyan);
            text-shadow: 0 0 10px var(--accent-cyan-dim);
        }
        .stat-card__value--longterm { color: var(--accent-cyan); }
        .stat-card__value--shortterm { color: var(--accent-amber); text-shadow: 0 0 10px var(--accent-amber-dim); }
        .stat-card__value--decay { color: var(--accent-purple); text-shadow: 0 0 10px var(--accent-purple-dim); }
        .stat-card__value--confirmed { color: var(--accent-green); text-shadow: 0 0 10px var(--accent-green-dim); }
        .stat-card__value--pending { color: var(--accent-amber); text-shadow: 0 0 10px var(--accent-amber-dim); }
        .stat-card__value--failed { color: var(--accent-red); text-shadow: 0 0 10px var(--accent-red-dim); }

        /* ─── Section ────── */
        .section {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: var(--space-5);
            margin-bottom: 1.25rem;
        }
        .section--errors { border-color: var(--accent-red); }

        /* ─── Tier Breakdown Bar ────── */
        .tier-bar {
            display: flex;
            height: 28px;
            border-radius: var(--radius);
            overflow: hidden;
            border: 1px solid var(--border);
        }
        .tier-bar__segment {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 40px;
            transition: flex 0.3s;
        }
        .tier-bar__segment--longterm { background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .tier-bar__segment--shortterm { background: var(--accent-amber-dim); color: var(--accent-amber); }
        .tier-bar__label {
            font-size: 0.6rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            white-space: nowrap;
        }

        /* ─── Agent Table ────── */
        .agent-table { display: flex; flex-direction: column; }
        .agent-table__header, .agent-table__row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr;
            gap: 0.5rem;
            padding: 0.4rem 0;
            font-size: 0.7rem;
        }
        .agent-table__header {
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            border-bottom: 1px solid var(--border);
            font-weight: 700;
        }
        .agent-table__row {
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: background 0.15s;
        }
        .agent-table__row:hover { background: var(--bg-hover); }
        .agent-table__row:last-child { border-bottom: none; }
        .agent-name { color: var(--accent-cyan); font-weight: 600; }
        .longterm-val { color: var(--accent-cyan); }
        .shortterm-val { color: var(--accent-amber); }

        /* ─── Categories & Chips ────── */
        .category-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
        }
        .chip {
            padding: 0.3rem 0.65rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            font-size: 0.7rem;
            font-family: inherit;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }
        .chip:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .chip--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .chip--lt.chip--active { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .chip--st.chip--active { border-color: var(--accent-amber); color: var(--accent-amber); background: var(--accent-amber-dim); }
        .chip--clear {
            border-color: var(--accent-magenta);
            color: var(--accent-magenta);
            background: var(--accent-magenta-subtle);
        }

        /* ─── Filters ────── */
        .filters {
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
        }
        .search-input {
            width: 100%;
            padding: var(--space-2) var(--space-3);
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.8rem;
            outline: none;
            transition: border-color 0.15s;
        }
        .search-input:focus { border-color: var(--accent-cyan); }
        .search-input::placeholder { color: var(--text-tertiary); }
        .filter-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }

        /* ─── List Header ────── */
        .list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }
        .list-header__count {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .pagination {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .page-info {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        .btn--sm {
            padding: 0.4rem 0.75rem;
            min-height: 32px;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            font-size: 0.7rem;
            font-family: inherit;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }
        .btn--sm:hover:not(:disabled) { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .btn--sm:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ─── Empty State ────── */
        .empty-state {
            text-align: center;
            padding: var(--space-8);
            color: var(--text-tertiary);
        }
        .empty-state__icon {
            font-size: 0.7rem;
            line-height: 1.3;
            margin-bottom: 0.75rem;
        }

        /* ─── Memory Cards ────── */
        .memory-list { display: flex; flex-direction: column; gap: 4px; }
        .memory-card {
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
        }
        .memory-card:hover { border-color: var(--border-bright); }
        .memory-card--expanded { border-color: var(--accent-cyan); }
        .memory-card__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: var(--space-2) var(--space-3);
            font-size: 0.7rem;
        }
        .memory-card__tier {
            padding: 0.15rem 0.35rem;
            border-radius: var(--radius-sm);
            font-size: 0.55rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            flex-shrink: 0;
        }
        .memory-card__tier[data-tier="longterm"] {
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
        }
        .memory-card__tier[data-tier="shortterm"] {
            background: var(--accent-amber-dim);
            color: var(--accent-amber);
        }
        .memory-card__key {
            color: var(--text-primary);
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .memory-card__status {
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }
        .memory-card__status[data-status="confirmed"] { color: var(--accent-green); }
        .memory-card__status[data-status="pending"] { color: var(--accent-amber); }
        .memory-card__status[data-status="failed"] { color: var(--accent-red); }
        .memory-card__decay {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            flex-shrink: 0;
            font-family: var(--font-mono);
        }
        .memory-card__category {
            padding: 0.1rem 0.3rem;
            background: var(--accent-purple-dim);
            color: var(--accent-purple);
            border-radius: var(--radius-sm);
            font-size: 0.55rem;
            flex-shrink: 0;
        }
        .memory-card__storage {
            padding: 0.15rem 0.35rem;
            border-radius: var(--radius-sm);
            font-size: 0.5rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }
        .memory-card__storage[data-storage="arc69"] {
            background: var(--accent-green-dim);
            color: var(--accent-green);
        }
        .memory-card__storage[data-storage="plain-txn"] {
            background: var(--accent-purple-dim);
            color: var(--accent-purple);
        }
        .memory-card__storage[data-storage="pending"] {
            background: var(--accent-amber-dim);
            color: var(--accent-amber);
        }
        .memory-card__time {
            color: var(--text-tertiary);
            font-size: 0.6rem;
            flex-shrink: 0;
            white-space: nowrap;
        }

        /* ─── Detail View ────── */
        .memory-card__detail {
            padding: var(--space-3);
            border-top: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }
        .detail-row {
            display: flex;
            gap: 0.75rem;
            font-size: 0.7rem;
        }
        .detail-label {
            width: 72px;
            flex-shrink: 0;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-size: 0.6rem;
            padding-top: 0.1rem;
        }
        .detail-value {
            color: var(--text-secondary);
            word-break: break-all;
        }
        .detail-value--mono { font-family: var(--font-mono); font-size: 0.65rem; }
        .detail-value--txid { color: var(--accent-green); }
        .detail-value--asa { color: var(--accent-cyan); }
        [data-storage="arc69"] { color: var(--accent-green); }
        [data-storage="plain-txn"] { color: var(--accent-purple); }
        [data-storage="pending"] { color: var(--accent-amber); }
        .detail-content {
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
            margin-top: 0.3rem;
        }
        .detail-pre {
            background: var(--bg-deep);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: var(--space-3);
            font-size: 0.7rem;
            color: var(--text-secondary);
            white-space: pre-wrap;
            word-break: break-word;
            margin: 0;
            max-height: 300px;
            overflow-y: auto;
        }

        /* ─── Error Rows ────── */
        .error-row {
            display: flex;
            gap: 0.75rem;
            padding: 0.4rem 0;
            font-size: 0.7rem;
            border-bottom: 1px solid var(--border);
            align-items: center;
        }
        .error-row:last-child { border-bottom: none; }
        .error-row__key { color: var(--text-primary); font-weight: 600; flex: 1; }
        .error-row__msg { color: var(--accent-red); flex: 1; }
        .error-row__time { color: var(--text-tertiary); flex-shrink: 0; }

        /* ─── Observations ────── */
        .stat-card--observations { border-color: var(--accent-magenta); border-style: dashed; }
        .stat-card__value--observations { color: var(--accent-magenta); text-shadow: 0 0 10px var(--accent-magenta-dim); }

        .obs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
        }
        .obs-header h3 { margin: 0; }
        .obs-header__meta {
            font-size: 0.65rem;
            color: var(--text-tertiary);
        }
        .obs-empty {
            color: var(--text-tertiary);
            font-size: 0.75rem;
        }
        .chip--obs-active.chip--active { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .chip--obs-graduated.chip--active { border-color: var(--accent-green); color: var(--accent-green); background: var(--accent-green-wash); }
        .chip--obs-expired.chip--active { border-color: var(--text-tertiary); color: var(--text-tertiary); }
        .chip--obs-dismissed.chip--active { border-color: var(--accent-red); color: var(--accent-red); background: var(--accent-red-wash); }

        .obs-list { display: flex; flex-direction: column; gap: 4px; }
        .obs-card {
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: border-color 0.15s;
        }
        .obs-card:hover { border-color: var(--border-bright); }
        .obs-card--expanded { border-color: var(--accent-magenta); }
        .obs-card__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: var(--space-2) var(--space-3);
            font-size: 0.7rem;
        }
        .obs-card__source {
            padding: 0.15rem 0.35rem;
            border-radius: var(--radius-sm);
            font-size: 0.55rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            flex-shrink: 0;
            background: var(--accent-magenta-dim);
            color: var(--accent-magenta);
        }
        .obs-card__content-preview {
            color: var(--text-secondary);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .obs-card__score {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            flex-shrink: 0;
            font-family: var(--font-mono);
        }
        .obs-card__status {
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }
        .obs-card__status[data-obs-status="active"] { color: var(--accent-cyan); }
        .obs-card__status[data-obs-status="graduated"] { color: var(--accent-green); }
        .obs-card__status[data-obs-status="expired"] { color: var(--text-tertiary); }
        .obs-card__status[data-obs-status="dismissed"] { color: var(--accent-red); }
        .obs-card__detail {
            padding: var(--space-3);
            border-top: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }
        .obs-card__actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.5rem;
            padding-top: var(--space-2);
            border-top: 1px solid var(--border);
        }
        .btn--action {
            padding: 0.35rem var(--space-3);
            border-radius: var(--radius-sm);
            font-size: 0.65rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            border: 1px solid;
            transition: opacity 0.15s;
        }
        .btn--action:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--graduate {
            background: var(--accent-green-tint);
            border-color: var(--accent-green);
            color: var(--accent-green);
        }
        .btn--graduate:hover:not(:disabled) { background: var(--accent-green-mid); }
        .btn--boost {
            background: var(--accent-cyan-tint);
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
        }
        .btn--boost:hover { background: var(--accent-cyan-mid); }

        /* ─── Responsive ────── */
        @media (max-width: 767px) {
            .stats-cards { grid-template-columns: repeat(2, 1fr); }
            .memory-card__header { flex-wrap: wrap; }
            .agent-table__header, .agent-table__row { grid-template-columns: 2fr 1fr 1fr 1fr; font-size: 0.6rem; }
        }
    `,
})
export class BrainViewerComponent implements OnInit {
    protected readonly Math = Math;
    private readonly api = inject(ApiService);

    readonly loading = signal(true);
    readonly listLoading = signal(false);
    readonly stats = signal<MemoryStats | null>(null);
    readonly syncStatus = signal<SyncStatus | null>(null);
    readonly memories = signal<MemoryEntry[]>([]);
    readonly listTotal = signal(0);
    readonly expandedId = signal<string | null>(null);

    // Observations
    readonly observations = signal<Observation[]>([]);
    readonly obsStats = signal<ObservationStatsResponse | null>(null);
    readonly obsLoading = signal(false);
    readonly obsStatusFilter = signal<string | null>('active');
    readonly expandedObsId = signal<string | null>(null);
    readonly graduatingId = signal<string | null>(null);

    // Filters
    readonly searchQuery = signal('');
    readonly tierFilter = signal<'longterm' | 'shortterm' | null>(null);
    readonly statusFilter = signal<string | null>(null);
    readonly categoryFilter = signal<string | null>(null);
    readonly agentFilter = signal<string | null>(null);
    readonly currentOffset = signal(0);

    readonly categoryEntries = computed(() => {
        const s = this.stats();
        if (!s) return [];
        return Object.entries(s.byCategory)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    });

    pageSize(): number {
        return 50;
    }

    ngOnInit(): void {
        this.loadAll();
    }

    // ─── Filter actions ──────────────────────────────────────────────────────

    setTier(tier: 'longterm' | 'shortterm' | null): void {
        this.tierFilter.set(tier);
        this.currentOffset.set(0);
        this.loadMemories();
    }

    setStatus(status: string | null): void {
        this.statusFilter.set(status);
        this.currentOffset.set(0);
        this.loadMemories();
    }

    toggleCategory(cat: string): void {
        this.categoryFilter.set(this.categoryFilter() === cat ? null : cat);
        this.currentOffset.set(0);
        this.loadMemories();
    }

    filterByAgent(agentId: string): void {
        this.agentFilter.set(agentId);
        this.currentOffset.set(0);
        this.loadMemories();
    }

    clearAgentFilter(): void {
        this.agentFilter.set(null);
        this.currentOffset.set(0);
        this.loadMemories();
    }

    onSearchInput(event: Event): void {
        this.searchQuery.set((event.target as HTMLInputElement).value);
    }

    applySearch(): void {
        this.currentOffset.set(0);
        this.loadMemories();
    }

    toggleExpand(id: string): void {
        this.expandedId.set(this.expandedId() === id ? null : id);
    }

    prevPage(): void {
        this.currentOffset.set(Math.max(0, this.currentOffset() - this.pageSize()));
        this.loadMemories();
    }

    nextPage(): void {
        this.currentOffset.set(this.currentOffset() + this.pageSize());
        this.loadMemories();
    }

    /** ASCII decay bar: ████░░░░ style indicator */
    decayBar(score: number): string {
        const filled = Math.round(score * 6);
        return '\u2588'.repeat(filled) + '\u2591'.repeat(6 - filled);
    }

    /** Storage type label */
    storageLabel(type: StorageType): string {
        switch (type) {
            case 'arc69': return 'ARC-69';
            case 'plain-txn': return 'Plain Txn';
            case 'pending': return 'Pending';
        }
    }

    /** Relevance score bar for observations */
    relevanceBar(score: number): string {
        const capped = Math.min(score, 5);
        const filled = Math.round(capped);
        return '\u2b50'.repeat(filled);
    }

    // ─── Observation actions ─────────────────────────────────────────────────

    setObsStatus(status: string | null): void {
        this.obsStatusFilter.set(status);
        this.loadObservations();
    }

    toggleObsExpand(id: string): void {
        this.expandedObsId.set(this.expandedObsId() === id ? null : id);
    }

    async forceGraduate(obsId: string, event: Event): Promise<void> {
        event.stopPropagation();
        this.graduatingId.set(obsId);
        try {
            await firstValueFrom(
                this.api.post<{ success: boolean; message: string }>(`/dashboard/memories/observations/${obsId}/graduate`, {}),
            );
            // Reload both observations and memories
            await Promise.all([this.loadObservations(), this.loadMemories()]);
            // Refresh stats too
            const [stats, obsStats] = await Promise.all([
                firstValueFrom(this.api.get<MemoryStats>('/dashboard/memories/stats')),
                firstValueFrom(this.api.get<ObservationStatsResponse>('/dashboard/memories/observations/stats')),
            ]);
            this.stats.set(stats);
            this.obsStats.set(obsStats);
        } catch {
            // Non-critical
        } finally {
            this.graduatingId.set(null);
        }
    }

    async boostObs(obsId: string, event: Event): Promise<void> {
        event.stopPropagation();
        try {
            await firstValueFrom(
                this.api.post<{ observation: Observation }>(`/dashboard/memories/observations/${obsId}/boost`, {}),
            );
            await this.loadObservations();
        } catch {
            // Non-critical
        }
    }

    // ─── Data loading ────────────────────────────────────────────────────────

    private async loadAll(): Promise<void> {
        this.loading.set(true);
        try {
            const [stats, syncStatus, list, obsStatsRes] = await Promise.all([
                firstValueFrom(this.api.get<MemoryStats>('/dashboard/memories/stats')),
                firstValueFrom(this.api.get<SyncStatus>('/dashboard/memories/sync-status')),
                firstValueFrom(this.api.get<MemoryListResponse>('/dashboard/memories?limit=50&offset=0')),
                firstValueFrom(this.api.get<ObservationStatsResponse>('/dashboard/memories/observations/stats')).catch(() => null),
            ]);
            this.stats.set(stats);
            this.syncStatus.set(syncStatus);
            this.memories.set(list.entries);
            this.listTotal.set(list.total);
            this.obsStats.set(obsStatsRes);
            // Load observations after main data
            this.loadObservations();
        } catch {
            // Non-critical — page still renders with empty state
        } finally {
            this.loading.set(false);
        }
    }

    private async loadObservations(): Promise<void> {
        this.obsLoading.set(true);
        try {
            const params = new URLSearchParams();
            if (this.obsStatusFilter()) params.set('status', this.obsStatusFilter()!);
            if (this.agentFilter()) params.set('agentId', this.agentFilter()!);
            params.set('limit', '50');

            const res = await firstValueFrom(
                this.api.get<ObservationListResponse>(`/dashboard/memories/observations?${params.toString()}`),
            );
            this.observations.set(res.observations);
        } catch {
            // Non-critical
        } finally {
            this.obsLoading.set(false);
        }
    }

    private async loadMemories(): Promise<void> {
        this.listLoading.set(true);
        try {
            const params = new URLSearchParams();
            params.set('limit', String(this.pageSize()));
            params.set('offset', String(this.currentOffset()));

            if (this.tierFilter()) params.set('tier', this.tierFilter()!);
            if (this.statusFilter()) params.set('status', this.statusFilter()!);
            if (this.categoryFilter()) params.set('category', this.categoryFilter()!);
            if (this.agentFilter()) params.set('agentId', this.agentFilter()!);
            if (this.searchQuery().trim()) params.set('search', this.searchQuery().trim());

            const list = await firstValueFrom(
                this.api.get<MemoryListResponse>(`/dashboard/memories?${params.toString()}`),
            );
            this.memories.set(list.entries);
            this.listTotal.set(list.total);
            this.expandedId.set(null);
        } catch {
            // Non-critical
        } finally {
            this.listLoading.set(false);
        }
    }
}
