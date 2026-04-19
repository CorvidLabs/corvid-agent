import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';

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

interface DuplicatePair {
    primaryId: string;
    primaryKey: string;
    duplicateId: string;
    duplicateKey: string;
    similarityScore: number;
    method: 'jaccard' | 'tfidf' | 'combined';
}

interface MergeSuggestion {
    id: string;
    primaryId: string;
    primaryKey: string;
    primaryContent: string;
    duplicateIds: string[];
    duplicateKeys: string[];
    maxSimilarity: number;
    previewContent: string;
    keyPrefix: string | null;
}

interface ConsolidationResponse {
    suggestions: MergeSuggestion[];
    duplicates: DuplicatePair[];
    total: number;
    threshold: number;
}

@Component({
    selector: 'app-brain-viewer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe, RelativeTimePipe, SkeletonComponent, MetricCardComponent, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule],
    template: `
        <div class="brain-viewer">
            <div class="brain-viewer__title-row">
                <h2>Brain Viewer</h2>
                <div class="export-area">
                    <button mat-stroked-button (click)="toggleExportPanel()">Export</button>
                    @if (showExportPanel()) {
                        <div class="export-panel">
                            <div class="export-panel__row">
                                <label class="export-panel__label">Format</label>
                                <mat-chip-listbox class="export-panel__chips" [value]="exportFormat()" (change)="exportFormat.set($event.value)">
                                    <mat-chip-option value="json">JSON</mat-chip-option>
                                    <mat-chip-option value="csv">CSV</mat-chip-option>
                                </mat-chip-listbox>
                            </div>
                            <div class="export-panel__row">
                                <label class="export-panel__label">Tier</label>
                                <mat-chip-listbox class="export-panel__chips" [value]="exportTier()" (change)="exportTier.set($event.value)">
                                    <mat-chip-option value="all">All</mat-chip-option>
                                    <mat-chip-option value="long-term">Long-term</mat-chip-option>
                                    <mat-chip-option value="short-term">Short-term</mat-chip-option>
                                </mat-chip-listbox>
                            </div>
                            @if (categoryEntries().length > 0) {
                                <div class="export-panel__row">
                                    <mat-form-field appearance="outline" class="export-category-field">
                                        <mat-label>Category</mat-label>
                                        <mat-select [value]="exportCategory()" (selectionChange)="onExportCategoryChangeMat($event.value)">
                                            <mat-option value="">All categories</mat-option>
                                            @for (cat of categoryEntries(); track cat.name) {
                                                <mat-option [value]="cat.name">{{ cat.name }}</mat-option>
                                            }
                                        </mat-select>
                                    </mat-form-field>
                                </div>
                            }
                            <button mat-flat-button color="primary" (click)="doExport()">Download</button>
                        </div>
                    }
                </div>
            </div>

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
                        <app-metric-card label="Total Memories" accent="cyan">{{ stats()!.totalMemories }}</app-metric-card>
                        <app-metric-card label="Long-term" accent="purple">{{ stats()!.byTier.longterm }}</app-metric-card>
                        <app-metric-card label="Short-term" accent="amber">{{ stats()!.byTier.shortterm }}</app-metric-card>
                        <app-metric-card label="Avg Decay" accent="cyan">{{ stats()!.averageDecayScore !== null ? (stats()!.averageDecayScore | number:'1.2-2') : '—' }}</app-metric-card>
                        <app-metric-card label="Confirmed" accent="green">{{ stats()!.byStatus.confirmed }}</app-metric-card>
                        <app-metric-card label="Pending" accent="amber">{{ stats()!.byStatus.pending }}</app-metric-card>
                        <app-metric-card label="Failed" accent="red">{{ stats()!.byStatus.failed }}</app-metric-card>
                        @if (obsStats()) {
                            <app-metric-card label="Observations" accent="magenta">{{ obsStats()!.totalActive }}</app-metric-card>
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
                                        mat-stroked-button
                                        [class.category-chip--active]="categoryFilter() === cat.name"
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
                        <mat-form-field appearance="outline" class="search-field">
                            <mat-label>Search</mat-label>
                            <input matInput
                                type="text"
                                placeholder="Search memories..."
                                [value]="searchQuery()"
                                (input)="onSearchInput($event)"
                                (keydown.enter)="applySearch()" />
                        </mat-form-field>
                        <mat-chip-listbox class="filter-chips" [value]="tierFilter() ?? 'all'" (change)="setTier($event.value === 'all' ? null : $event.value)">
                            <mat-chip-option value="all">All</mat-chip-option>
                            <mat-chip-option value="longterm">Long-term</mat-chip-option>
                            <mat-chip-option value="shortterm">Short-term</mat-chip-option>
                        </mat-chip-listbox>
                        <mat-chip-listbox class="filter-chips" [value]="statusFilter() ?? 'all'" (change)="setStatus($event.value === 'all' ? null : $event.value)">
                            <mat-chip-option value="all">All</mat-chip-option>
                            <mat-chip-option value="confirmed">Confirmed</mat-chip-option>
                            <mat-chip-option value="pending">Pending</mat-chip-option>
                            <mat-chip-option value="failed">Failed</mat-chip-option>
                        </mat-chip-listbox>
                        @if (agentFilter()) {
                            <button mat-stroked-button class="agent-clear-btn" (click)="clearAgentFilter()">Agent: {{ agentFilter() }} &times;</button>
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
                                <button mat-stroked-button [disabled]="currentOffset() === 0" (click)="prevPage()">Prev</button>
                                <span class="page-info">{{ currentOffset() + 1 }}–{{ Math.min(currentOffset() + pageSize(), listTotal()) }}</span>
                                <button mat-stroked-button [disabled]="currentOffset() + pageSize() >= listTotal()" (click)="nextPage()">Next</button>
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
                    <mat-chip-listbox class="filter-chips" style="margin-bottom: 0.75rem;" [value]="obsStatusFilter() ?? 'all'" (change)="setObsStatus($event.value === 'all' ? null : $event.value)">
                        <mat-chip-option value="all">All</mat-chip-option>
                        <mat-chip-option value="active">Active</mat-chip-option>
                        <mat-chip-option value="graduated">Graduated</mat-chip-option>
                        <mat-chip-option value="expired">Expired</mat-chip-option>
                        <mat-chip-option value="dismissed">Dismissed</mat-chip-option>
                    </mat-chip-listbox>

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
                                                    <button mat-flat-button color="primary"
                                                            [disabled]="graduatingId() === obs.id"
                                                            (click)="forceGraduate(obs.id, $event)">
                                                        {{ graduatingId() === obs.id ? 'Graduating...' : 'Force Graduate' }}
                                                    </button>
                                                    <button mat-stroked-button
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

                <!-- Consolidation -->
                <div class="section section--consolidation">
                    <div class="consolidation-header">
                        <h3>Consolidation</h3>
                        <div class="consolidation-controls">
                            <label class="threshold-label">
                                Threshold: {{ consolidationThreshold() }}%
                                <input type="range" min="40" max="95" step="5"
                                       [value]="consolidationThreshold()"
                                       (input)="onThresholdChange($event)" />
                            </label>
                            <button mat-stroked-button (click)="loadConsolidation()" [disabled]="consolidationLoading()">
                                {{ consolidationLoading() ? 'Scanning...' : 'Scan for Duplicates' }}
                            </button>
                        </div>
                    </div>

                    @if (consolidationLoading()) {
                        <p class="loading">Scanning memories...</p>
                    } @else if (consolidationData()) {
                        @if (consolidationData()!.suggestions.length === 0 && consolidationData()!.duplicates.length === 0) {
                            <p class="consolidation-empty">No duplicates or near-duplicates found at {{ consolidationData()!.threshold }}% threshold.</p>
                        } @else {
                            <!-- Merge Suggestions -->
                            @if (consolidationData()!.suggestions.length > 0) {
                                <div class="consolidation-subsection">
                                    <h4>Merge Suggestions ({{ consolidationData()!.suggestions.length }})</h4>
                                    @for (sug of consolidationData()!.suggestions; track sug.id) {
                                        <div class="merge-card" [class.merge-card--expanded]="expandedMergeId() === sug.id">
                                            <div class="merge-card__header" (click)="toggleMergeExpand(sug.id)">
                                                <span class="merge-score">{{ (sug.maxSimilarity * 100).toFixed(0) }}%</span>
                                                <span class="merge-primary">{{ sug.primaryKey }}</span>
                                                <span class="merge-dupes">+ {{ sug.duplicateIds.length }} duplicate{{ sug.duplicateIds.length > 1 ? 's' : '' }}</span>
                                                @if (sug.keyPrefix) {
                                                    <span class="merge-prefix">prefix: {{ sug.keyPrefix }}</span>
                                                }
                                            </div>
                                            @if (expandedMergeId() === sug.id) {
                                                <div class="merge-card__detail">
                                                    <div class="merge-diff">
                                                        <div class="merge-diff__col">
                                                            <span class="merge-diff__label">Primary: {{ sug.primaryKey }}</span>
                                                            <pre class="detail-pre merge-diff__pre">{{ sug.primaryContent }}</pre>
                                                        </div>
                                                        <div class="merge-diff__col">
                                                            <span class="merge-diff__label">Duplicates: {{ sug.duplicateKeys.join(', ') }}</span>
                                                            <pre class="detail-pre merge-diff__pre merge-diff__pre--dupe">{{ sug.duplicateKeys.join('\n---\n') }}</pre>
                                                        </div>
                                                    </div>
                                                    <div class="merge-preview">
                                                        <span class="merge-diff__label">Consolidated Preview</span>
                                                        <pre class="detail-pre merge-preview__pre">{{ sug.previewContent }}</pre>
                                                    </div>
                                                    <div class="merge-card__actions">
                                                        <button mat-flat-button color="warn"
                                                                [disabled]="mergingId() === sug.id"
                                                                (click)="executeMerge(sug, $event)">
                                                            {{ mergingId() === sug.id ? 'Merging...' : 'Execute Merge' }}
                                                        </button>
                                                    </div>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }

                            <!-- Duplicate Pairs -->
                            @if (consolidationData()!.duplicates.length > 0) {
                                <div class="consolidation-subsection">
                                    <h4>Duplicate Pairs ({{ consolidationData()!.duplicates.length }})</h4>
                                    @for (pair of consolidationData()!.duplicates; track pair.primaryId + pair.duplicateId) {
                                        <div class="dup-row">
                                            <span class="dup-score" [class.dup-score--high]="pair.similarityScore >= 0.9">{{ (pair.similarityScore * 100).toFixed(0) }}%</span>
                                            <span class="dup-method">{{ pair.method }}</span>
                                            <span class="dup-key">{{ pair.primaryKey }}</span>
                                            <span class="dup-separator">≈</span>
                                            <span class="dup-key">{{ pair.duplicateKey }}</span>
                                        </div>
                                    }
                                </div>
                            }

                            <!-- Bulk Archive -->
                            <div class="consolidation-subsection">
                                <h4>Bulk Archive</h4>
                                <div class="archive-controls">
                                    <div class="archive-field">
                                        <mat-form-field appearance="outline" class="archive-form-field">
                                            <mat-label>Max Decay Score (0-1)</mat-label>
                                            <input matInput type="number" min="0" max="1" step="0.05"
                                                   placeholder="e.g. 0.3"
                                                   [value]="archiveDecayThreshold()"
                                                   (input)="onArchiveDecayChange($event)" />
                                        </mat-form-field>
                                    </div>
                                    <div class="archive-field">
                                        <mat-form-field appearance="outline" class="archive-form-field">
                                            <mat-label>Older Than (days)</mat-label>
                                            <input matInput type="number" min="0" step="1"
                                                   placeholder="e.g. 30"
                                                   [value]="archiveOlderThanDays()"
                                                   (input)="onArchiveOlderThanChange($event)" />
                                        </mat-form-field>
                                    </div>
                                    <button mat-stroked-button color="warn"
                                            [disabled]="archiving()"
                                            (click)="executeBulkArchive()">
                                        {{ archiving() ? 'Archiving...' : 'Bulk Archive' }}
                                    </button>
                                </div>
                                @if (archiveResult()) {
                                    <div class="archive-result">
                                        Archived {{ archiveResult()!.archivedCount }} memories.
                                        @if (archiveResult()!.archivedKeys.length > 0) {
                                            <span class="archive-keys">{{ archiveResult()!.archivedKeys.slice(0, 5).join(', ') }}{{ archiveResult()!.archivedKeys.length > 5 ? '...' : '' }}</span>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .brain-viewer { padding: var(--space-6); }
        .brain-viewer__title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
        }
        .brain-viewer__title-row h2 { margin: 0; color: var(--text-primary); }
        .brain-viewer h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .loading { color: var(--text-secondary); }

        /* ─── Export Panel ────── */
        .export-area { position: relative; }
        .export-panel {
            position: absolute;
            right: 0;
            top: calc(100% + 6px);
            background: var(--bg-surface);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            min-width: 260px;
            z-index: 100;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .export-panel__row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .export-panel__label {
            font-size: 0.65rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.07em;
            width: 60px;
            flex-shrink: 0;
        }
        .export-panel__chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
        .export-category-field {
            width: 100%;
            --mat-form-field-container-vertical-padding: 8px;
        }
        .export-panel button[mat-flat-button] { align-self: flex-end; }

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
        .category-chip--active {
            border-color: var(--accent-cyan) !important;
            color: var(--accent-cyan) !important;
            background: var(--accent-cyan-dim) !important;
        }
        .agent-clear-btn {
            border-color: var(--accent-magenta) !important;
            color: var(--accent-magenta) !important;
        }

        /* ─── Filters ────── */
        .filters {
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
        }
        .search-field { width: 100%; }
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
        .pagination button { font-size: 0.75rem; }

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
        .obs-card__actions button { font-size: 0.75rem; }

        /* ─── Consolidation ────── */
        .section--consolidation { border-color: var(--accent-orange, #f59e0b); }
        .consolidation-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .consolidation-header h3 { margin: 0; }
        .consolidation-controls {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
        }
        .threshold-label {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        .threshold-label input[type=range] { width: 80px; cursor: pointer; }
        .consolidation-empty { color: var(--text-tertiary); font-size: 0.75rem; }
        .consolidation-subsection { margin-top: 1rem; }
        .consolidation-subsection h4 {
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin: 0 0 0.5rem;
        }

        /* Merge cards */
        .merge-card {
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            margin-bottom: 4px;
        }
        .merge-card--expanded { border-color: var(--accent-orange, #f59e0b); }
        .merge-card__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: var(--space-2) var(--space-3);
            font-size: 0.7rem;
            cursor: pointer;
        }
        .merge-card__header:hover { background: var(--bg-hover); }
        .merge-score {
            padding: 0.15rem 0.4rem;
            background: var(--accent-orange-dim, rgba(245,158,11,0.15));
            color: var(--accent-orange, #f59e0b);
            border-radius: var(--radius-sm);
            font-size: 0.6rem;
            font-weight: 700;
            flex-shrink: 0;
        }
        .merge-primary { color: var(--text-primary); font-weight: 600; flex: 1; }
        .merge-dupes { color: var(--text-tertiary); font-size: 0.65rem; flex-shrink: 0; }
        .merge-prefix {
            padding: 0.1rem 0.3rem;
            background: var(--accent-purple-dim);
            color: var(--accent-purple);
            border-radius: var(--radius-sm);
            font-size: 0.55rem;
            flex-shrink: 0;
        }
        .merge-card__detail {
            padding: var(--space-3);
            border-top: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        .merge-diff {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }
        .merge-diff__col { display: flex; flex-direction: column; gap: 0.3rem; }
        .merge-diff__label { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .merge-diff__pre { max-height: 160px; }
        .merge-diff__pre--dupe { border-color: var(--accent-red); }
        .merge-preview { display: flex; flex-direction: column; gap: 0.3rem; }
        .merge-preview__pre { border-color: var(--accent-green); max-height: 120px; }
        .merge-card__actions {
            display: flex;
            gap: 0.5rem;
            padding-top: var(--space-2);
            border-top: 1px solid var(--border);
        }
        .merge-card__actions button { font-size: 0.75rem; }

        /* Duplicate rows */
        .dup-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.35rem 0;
            font-size: 0.7rem;
            border-bottom: 1px solid var(--border);
        }
        .dup-row:last-child { border-bottom: none; }
        .dup-score {
            padding: 0.1rem 0.35rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            font-size: 0.6rem;
            font-weight: 700;
            color: var(--accent-amber);
            flex-shrink: 0;
        }
        .dup-score--high { color: var(--accent-red); border-color: var(--accent-red); }
        .dup-method {
            font-size: 0.55rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .dup-key { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dup-separator { color: var(--text-tertiary); flex-shrink: 0; }

        /* Bulk archive */
        .archive-controls {
            display: flex;
            align-items: flex-end;
            gap: 0.75rem;
            flex-wrap: wrap;
        }
        .archive-field { display: flex; flex-direction: column; }
        .archive-form-field { width: 120px; }
        .archive-controls button { align-self: flex-end; }
        .archive-result {
            margin-top: 0.5rem;
            font-size: 0.7rem;
            color: var(--accent-green);
        }
        .archive-keys { color: var(--text-tertiary); margin-left: 0.4rem; }

        /* ─── Responsive ────── */
        @media (max-width: 767px) {
            .stats-cards { grid-template-columns: repeat(2, 1fr); }
            .memory-card__header { flex-wrap: wrap; }
            .agent-table__header, .agent-table__row { grid-template-columns: 2fr 1fr 1fr 1fr; font-size: 0.6rem; }
            .merge-diff { grid-template-columns: 1fr; }
            .archive-controls { flex-direction: column; align-items: stretch; }
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

    // Consolidation
    readonly consolidationData = signal<ConsolidationResponse | null>(null);
    readonly consolidationLoading = signal(false);
    readonly consolidationThreshold = signal(70);
    readonly expandedMergeId = signal<string | null>(null);
    readonly mergingId = signal<string | null>(null);
    readonly archiving = signal(false);
    readonly archiveResult = signal<{ archivedCount: number; archivedKeys: string[] } | null>(null);
    readonly archiveDecayThreshold = signal<number | null>(null);
    readonly archiveOlderThanDays = signal<number | null>(null);

    // Filters
    readonly searchQuery = signal('');
    readonly tierFilter = signal<'longterm' | 'shortterm' | null>(null);
    readonly statusFilter = signal<string | null>(null);
    readonly categoryFilter = signal<string | null>(null);
    readonly agentFilter = signal<string | null>(null);
    readonly currentOffset = signal(0);

    // Export
    readonly showExportPanel = signal(false);
    readonly exportFormat = signal<'json' | 'csv'>('json');
    readonly exportTier = signal<'all' | 'long-term' | 'short-term'>('all');
    readonly exportCategory = signal<string>('');

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

    // ─── Consolidation actions ───────────────────────────────────────────────

    onThresholdChange(event: Event): void {
        const val = parseInt((event.target as HTMLInputElement).value, 10);
        if (!isNaN(val)) this.consolidationThreshold.set(val);
    }

    onArchiveDecayChange(event: Event): void {
        const val = parseFloat((event.target as HTMLInputElement).value);
        this.archiveDecayThreshold.set(isNaN(val) ? null : val);
    }

    onArchiveOlderThanChange(event: Event): void {
        const val = parseInt((event.target as HTMLInputElement).value, 10);
        this.archiveOlderThanDays.set(isNaN(val) ? null : val);
    }

    async loadConsolidation(): Promise<void> {
        this.consolidationLoading.set(true);
        this.consolidationData.set(null);
        try {
            const params = new URLSearchParams();
            params.set('threshold', String(this.consolidationThreshold()));
            if (this.agentFilter()) params.set('agentId', this.agentFilter()!);

            const data = await firstValueFrom(
                this.api.get<ConsolidationResponse>(`/brain/consolidation/suggestions?${params.toString()}`),
            );
            this.consolidationData.set(data);
        } catch {
            // Non-critical
        } finally {
            this.consolidationLoading.set(false);
        }
    }

    async executeMerge(sug: MergeSuggestion, event: Event): Promise<void> {
        event.stopPropagation();
        this.mergingId.set(sug.id);
        try {
            await firstValueFrom(
                this.api.post<{ success: boolean }>('/brain/consolidation/merge', {
                    primaryId: sug.primaryId,
                    duplicateIds: sug.duplicateIds,
                    mergedContent: sug.previewContent,
                }),
            );
            // Reload everything
            await this.loadConsolidation();
            await this.loadMemories();
        } catch {
            // Non-critical
        } finally {
            this.mergingId.set(null);
        }
    }

    async executeBulkArchive(): Promise<void> {
        this.archiving.set(true);
        this.archiveResult.set(null);
        try {
            const body: Record<string, unknown> = { statuses: ['short_term'] };
            if (this.agentFilter()) body['agentId'] = this.agentFilter();
            if (this.archiveDecayThreshold() !== null) body['maxDecayScore'] = this.archiveDecayThreshold();
            if (this.archiveOlderThanDays() !== null) body['olderThanDays'] = this.archiveOlderThanDays();

            const result = await firstValueFrom(
                this.api.post<{ archivedCount: number; archivedKeys: string[] }>('/brain/consolidation/archive', body),
            );
            this.archiveResult.set(result);
            if (result.archivedCount > 0) {
                await this.loadMemories();
            }
        } catch {
            // Non-critical
        } finally {
            this.archiving.set(false);
        }
    }

    toggleMergeExpand(id: string): void {
        this.expandedMergeId.set(this.expandedMergeId() === id ? null : id);
    }

    // ─── Export ─────────────────────────────────────────────────────────────

    toggleExportPanel(): void {
        this.showExportPanel.set(!this.showExportPanel());
    }

    onExportCategoryChange(event: Event): void {
        this.exportCategory.set((event.target as HTMLSelectElement).value);
    }

    onExportCategoryChangeMat(value: string): void {
        this.exportCategory.set(value);
    }

    async doExport(): Promise<void> {
        const params = new URLSearchParams();
        params.set('format', this.exportFormat());
        if (this.exportTier() !== 'all') params.set('tier', this.exportTier());
        if (this.exportCategory()) params.set('category', this.exportCategory());
        if (this.agentFilter()) params.set('agent_id', this.agentFilter()!);

        try {
            const blob = await firstValueFrom(
                this.api.getBlob(`/dashboard/memories/export?${params.toString()}`),
            );
            const ext = this.exportFormat();
            const filename = `memories-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
            this.downloadBlob(blob, filename);
            this.showExportPanel.set(false);
        } catch {
            // Non-critical
        }
    }

    private downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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
