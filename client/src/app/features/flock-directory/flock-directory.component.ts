import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import type {
    FlockAgent,
    FlockAgentStatus,
    FlockSortField,
    FlockSortOrder,
    FlockDirectorySearchResult,
} from '@shared/types/flock-directory';

interface FlockStats {
    total: number;
    active: number;
    inactive: number;
    onChainAppId: number | null;
}

@Component({
    selector: 'app-flock-directory',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="flock-page">
            <!-- Stats Header -->
            <div class="flock-header">
                <div class="flock-header__title-row">
                    <h1 class="flock-header__title">Flock Directory</h1>
                    @if (stats()) {
                        <div class="flock-header__stats">
                            <div class="stat-pill">
                                <span class="stat-pill__value">{{ stats()!.total }}</span>
                                <span class="stat-pill__label">Total</span>
                            </div>
                            <div class="stat-pill stat-pill--active">
                                <span class="stat-pill__value">{{ stats()!.active }}</span>
                                <span class="stat-pill__label">Active</span>
                            </div>
                            <div class="stat-pill stat-pill--inactive">
                                <span class="stat-pill__value">{{ stats()!.inactive }}</span>
                                <span class="stat-pill__label">Offline</span>
                            </div>
                            @if (stats()!.onChainAppId) {
                                <div class="stat-pill stat-pill--chain">
                                    <span class="stat-pill__value">On-Chain</span>
                                    <span class="stat-pill__label">App {{ stats()!.onChainAppId }}</span>
                                </div>
                            }
                        </div>
                    }
                </div>
                <p class="flock-header__subtitle">Discover agents in the network. Search by name, capability, or reputation.</p>
            </div>

            <!-- Search & Filters -->
            <div class="flock-controls">
                <div class="flock-search">
                    <span class="flock-search__icon">/</span>
                    <input
                        class="flock-search__input"
                        type="text"
                        placeholder="Search agents..."
                        [value]="searchQuery()"
                        (input)="onSearchInput($event)"
                        autocomplete="off"
                        spellcheck="false" />
                </div>
                <div class="flock-filters">
                    <select class="flock-filter" [value]="statusFilter()" (change)="onStatusChange($event)">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <select class="flock-filter" [value]="capabilityFilter()" (change)="onCapabilityChange($event)">
                        <option value="">All Capabilities</option>
                        @for (cap of allCapabilities(); track cap) {
                            <option [value]="cap">{{ cap }}</option>
                        }
                    </select>
                    <select class="flock-filter" [value]="sortBy()" (change)="onSortByChange($event)">
                        <option value="reputation">Reputation</option>
                        <option value="name">Name</option>
                        <option value="uptime">Uptime</option>
                        <option value="registered">Newest</option>
                        <option value="attestations">Attestations</option>
                    </select>
                    <button class="flock-sort-toggle" (click)="toggleSortOrder()" [title]="sortOrder() === 'desc' ? 'Descending' : 'Ascending'">
                        {{ sortOrder() === 'desc' ? '↓' : '↑' }}
                    </button>
                </div>
            </div>

            <!-- Capability Quick-Filters -->
            @if (allCapabilities().length > 0) {
                <div class="flock-cap-bar">
                    @for (cap of allCapabilities(); track cap) {
                        <button
                            class="flock-cap-pill"
                            [class.flock-cap-pill--active]="capabilityFilter() === cap"
                            (click)="toggleCapability(cap)">
                            {{ cap }}
                        </button>
                    }
                </div>
            }

            <!-- Loading -->
            @if (loading()) {
                <div class="flock-loading">Loading directory...</div>
            }

            <!-- Agent Grid -->
            @if (!loading()) {
                @if (agents().length === 0) {
                    <div class="flock-empty">
                        <div class="flock-empty__icon">🔍</div>
                        <h3 class="flock-empty__title">No agents found</h3>
                        <p class="flock-empty__text">
                            @if (searchQuery() || statusFilter() || capabilityFilter()) {
                                Try adjusting your search or filters.
                            } @else {
                                No agents registered in the directory yet.
                            }
                        </p>
                    </div>
                } @else {
                    <div class="flock-grid stagger-children">
                        @for (agent of agents(); track agent.id) {
                            <button class="flock-card" (click)="selectAgent(agent)" [class.flock-card--selected]="selectedAgent()?.id === agent.id" type="button">
                                <div class="flock-card__header">
                                    <div class="flock-card__avatar" [attr.data-status]="agent.status">
                                        {{ agent.name.charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="flock-card__info">
                                        <span class="flock-card__name">{{ agent.name }}</span>
                                        <span class="flock-card__status" [attr.data-status]="agent.status">{{ agent.status }}</span>
                                    </div>
                                    <div class="flock-card__score" [attr.data-level]="getRepLevel(agent.reputationScore)">
                                        {{ agent.reputationScore }}
                                    </div>
                                </div>
                                @if (agent.description) {
                                    <p class="flock-card__desc">{{ truncate(agent.description, 100) }}</p>
                                }
                                @if (agent.capabilities.length > 0) {
                                    <div class="flock-card__caps">
                                        @for (cap of agent.capabilities.slice(0, 3); track cap) {
                                            <span class="flock-card__cap">{{ cap }}</span>
                                        }
                                        @if (agent.capabilities.length > 3) {
                                            <span class="flock-card__cap flock-card__cap--more">+{{ agent.capabilities.length - 3 }}</span>
                                        }
                                    </div>
                                }
                                <div class="flock-card__metrics">
                                    <span class="flock-card__metric" title="Uptime">↑ {{ agent.uptimePct.toFixed(0) }}%</span>
                                    <span class="flock-card__metric" title="Attestations">✓ {{ agent.attestationCount }}</span>
                                    <span class="flock-card__metric" title="Councils">◎ {{ agent.councilParticipations }}</span>
                                </div>
                            </button>
                        }
                    </div>

                    <!-- Pagination -->
                    @if (totalAgents() > pageSize) {
                        <div class="flock-pagination">
                            <button class="flock-pagination__btn" [disabled]="currentPage() === 0" (click)="prevPage()">← Prev</button>
                            <span class="flock-pagination__info">
                                {{ currentPage() * pageSize + 1 }}–{{ min((currentPage() + 1) * pageSize, totalAgents()) }} of {{ totalAgents() }}
                            </span>
                            <button class="flock-pagination__btn" [disabled]="(currentPage() + 1) * pageSize >= totalAgents()" (click)="nextPage()">Next →</button>
                        </div>
                    }
                }
            }

            <!-- Agent Detail Panel -->
            @if (selectedAgent(); as agent) {
                <div class="flock-detail-backdrop" (click)="selectedAgent.set(null)">
                    <div class="flock-detail" (click)="$event.stopPropagation()">
                        <div class="flock-detail__header">
                            <div class="flock-detail__avatar" [attr.data-status]="agent.status">
                                {{ agent.name.charAt(0).toUpperCase() }}
                            </div>
                            <div>
                                <h2 class="flock-detail__name">{{ agent.name }}</h2>
                                <span class="flock-detail__status" [attr.data-status]="agent.status">{{ agent.status }}</span>
                            </div>
                            <button class="flock-detail__close" (click)="selectedAgent.set(null)" title="Close">&times;</button>
                        </div>

                        @if (agent.description) {
                            <p class="flock-detail__desc">{{ agent.description }}</p>
                        }

                        <!-- Reputation Score -->
                        <div class="flock-detail__section">
                            <h3 class="flock-detail__section-title">Reputation</h3>
                            <div class="flock-detail__rep">
                                <div class="flock-detail__rep-bar">
                                    <div class="flock-detail__rep-fill" [style.width.%]="agent.reputationScore" [attr.data-level]="getRepLevel(agent.reputationScore)"></div>
                                </div>
                                <span class="flock-detail__rep-value" [attr.data-level]="getRepLevel(agent.reputationScore)">{{ agent.reputationScore }}/100</span>
                            </div>
                        </div>

                        <!-- Metrics Grid -->
                        <div class="flock-detail__section">
                            <h3 class="flock-detail__section-title">Metrics</h3>
                            <div class="flock-detail__metrics">
                                <div class="flock-detail__metric">
                                    <span class="flock-detail__metric-value">{{ agent.uptimePct.toFixed(1) }}%</span>
                                    <span class="flock-detail__metric-label">Uptime</span>
                                </div>
                                <div class="flock-detail__metric">
                                    <span class="flock-detail__metric-value">{{ agent.attestationCount }}</span>
                                    <span class="flock-detail__metric-label">Attestations</span>
                                </div>
                                <div class="flock-detail__metric">
                                    <span class="flock-detail__metric-value">{{ agent.councilParticipations }}</span>
                                    <span class="flock-detail__metric-label">Councils</span>
                                </div>
                            </div>
                        </div>

                        <!-- Capabilities -->
                        @if (agent.capabilities.length > 0) {
                            <div class="flock-detail__section">
                                <h3 class="flock-detail__section-title">Capabilities</h3>
                                <div class="flock-detail__caps">
                                    @for (cap of agent.capabilities; track cap) {
                                        <span class="flock-detail__cap">{{ cap }}</span>
                                    }
                                </div>
                            </div>
                        }

                        <!-- Details -->
                        <div class="flock-detail__section">
                            <h3 class="flock-detail__section-title">Details</h3>
                            <div class="flock-detail__fields">
                                <div class="flock-detail__field">
                                    <span class="flock-detail__field-label">Address</span>
                                    <span class="flock-detail__field-value flock-detail__field-value--mono">{{ agent.address.slice(0, 8) }}...{{ agent.address.slice(-6) }}</span>
                                </div>
                                @if (agent.instanceUrl) {
                                    <div class="flock-detail__field">
                                        <span class="flock-detail__field-label">Instance</span>
                                        <span class="flock-detail__field-value flock-detail__field-value--mono">{{ agent.instanceUrl }}</span>
                                    </div>
                                }
                                <div class="flock-detail__field">
                                    <span class="flock-detail__field-label">Registered</span>
                                    <span class="flock-detail__field-value">{{ formatDate(agent.registeredAt) }}</span>
                                </div>
                                @if (agent.lastHeartbeat) {
                                    <div class="flock-detail__field">
                                        <span class="flock-detail__field-label">Last Heartbeat</span>
                                        <span class="flock-detail__field-value">{{ formatRelative(agent.lastHeartbeat) }}</span>
                                    </div>
                                }
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flock-detail__actions">
                            <button class="flock-detail__action-btn" (click)="messageAgent(agent)">Message Agent</button>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .flock-page {
            padding: 1.5rem;
            max-width: 1200px;
            margin: 0 auto;
            animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Header */
        .flock-header { margin-bottom: 1.5rem; }
        .flock-header__title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 0.5rem;
        }
        .flock-header__title {
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--text-primary, #eee);
            margin: 0;
        }
        .flock-header__stats {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .flock-header__subtitle {
            font-size: 0.8rem;
            color: var(--text-tertiary, #666);
            margin: 0;
        }

        /* Stat Pills */
        .stat-pill {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.25rem 0.6rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 6px;
            font-size: 0.7rem;
        }
        .stat-pill__value { font-weight: 700; color: var(--text-primary, #eee); }
        .stat-pill__label { color: var(--text-tertiary, #666); }
        .stat-pill--active .stat-pill__value { color: var(--accent-green, #0f0); }
        .stat-pill--inactive .stat-pill__value { color: var(--text-tertiary, #666); }
        .stat-pill--chain { border-color: var(--accent-cyan, #0ef); }
        .stat-pill--chain .stat-pill__value { color: var(--accent-cyan, #0ef); }

        /* Search & Filters */
        .flock-controls {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
        }
        .flock-search {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex: 1;
            min-width: 200px;
            padding: 0.5rem 0.75rem;
            background: var(--bg-input, #1a1a2e);
            border: 1px solid var(--border, #333);
            border-radius: 8px;
            transition: border-color 0.15s;
        }
        .flock-search:focus-within { border-color: var(--accent-cyan, #0ef); }
        .flock-search__icon {
            color: var(--accent-cyan, #0ef);
            font-weight: 700;
            font-size: 0.85rem;
            flex-shrink: 0;
        }
        .flock-search__input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary, #eee);
            font-family: inherit;
            font-size: 0.8rem;
            outline: none;
        }
        .flock-search__input::placeholder { color: var(--text-tertiary, #666); }

        .flock-filters {
            display: flex;
            gap: 0.5rem;
            align-items: center;
            flex-wrap: wrap;
        }
        .flock-filter {
            padding: 0.4rem 0.6rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 6px;
            color: var(--text-secondary, #bbb);
            font-family: inherit;
            font-size: 0.7rem;
            cursor: pointer;
            outline: none;
        }
        .flock-filter:focus { border-color: var(--accent-cyan, #0ef); }
        .flock-filter option { background: var(--bg-surface, #1a1a2e); }

        .flock-sort-toggle {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 6px;
            color: var(--text-secondary, #bbb);
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.1s;
        }
        .flock-sort-toggle:hover { background: var(--bg-hover, #2a2a3e); }

        /* Capability Quick-Filters */
        .flock-cap-bar {
            display: flex;
            gap: 0.35rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
        }
        .flock-cap-pill {
            padding: 0.2rem 0.5rem;
            background: transparent;
            border: 1px solid var(--border, #333);
            border-radius: 12px;
            color: var(--text-tertiary, #666);
            font-family: inherit;
            font-size: 0.6rem;
            cursor: pointer;
            transition: all 0.1s;
        }
        .flock-cap-pill:hover { border-color: var(--accent-magenta, #f08); color: var(--accent-magenta, #f08); }
        .flock-cap-pill--active {
            background: rgba(255, 0, 128, 0.1);
            border-color: var(--accent-magenta, #f08);
            color: var(--accent-magenta, #f08);
        }

        /* Loading */
        .flock-loading {
            padding: 3rem;
            text-align: center;
            color: var(--text-tertiary, #666);
            font-size: 0.8rem;
        }

        /* Empty State */
        .flock-empty {
            padding: 3rem;
            text-align: center;
        }
        .flock-empty__icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .flock-empty__title {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary, #eee);
            margin: 0 0 0.5rem;
        }
        .flock-empty__text {
            font-size: 0.8rem;
            color: var(--text-tertiary, #666);
            margin: 0;
        }

        /* Agent Grid — fluid with container queries */
        :host { container-type: inline-size; }
        .flock-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 0.85rem;
        }
        @container (max-width: 580px) {
            .flock-grid { grid-template-columns: 1fr; }
        }
        @container (min-width: 581px) and (max-width: 900px) {
            .flock-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @container (min-width: 1200px) {
            .flock-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        }

        /* Agent Card — glassmorphic with lift */
        .flock-card {
            display: flex;
            flex-direction: column;
            padding: 1rem;
            background: rgba(15, 16, 24, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: var(--radius-xl, 16px);
            cursor: pointer;
            transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s, background 0.25s;
            text-align: left;
            color: inherit;
            font-family: inherit;
            position: relative;
        }
        .flock-card::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            padding: 1px;
            background: linear-gradient(135deg, rgba(0, 229, 255, 0.3), rgba(255, 0, 170, 0.15), rgba(0, 255, 136, 0.1));
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .flock-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 229, 255, 0.06);
            background: rgba(15, 16, 24, 0.75);
        }
        .flock-card:hover::before { opacity: 1; }
        .flock-card:active { transform: translateY(-1px); transition-duration: 0.1s; }
        .flock-card--selected { border-color: var(--accent-magenta, #f08); }

        .flock-card__header {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            margin-bottom: 0.6rem;
        }
        .flock-card__avatar {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: var(--bg-raised, #222);
            border: 2px solid var(--border, #333);
            font-weight: 700;
            font-size: 0.85rem;
            color: var(--text-primary, #eee);
            flex-shrink: 0;
        }
        .flock-card__avatar[data-status="active"] { border-color: var(--accent-green, #0f0); }
        .flock-card__avatar[data-status="inactive"] { border-color: var(--text-tertiary, #666); }

        .flock-card__info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.1rem;
        }
        .flock-card__name {
            font-weight: 700;
            font-size: 0.8rem;
            color: var(--text-primary, #eee);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .flock-card__status {
            font-size: 0.55rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .flock-card__status[data-status="active"] { color: var(--accent-green, #0f0); }
        .flock-card__status[data-status="inactive"] { color: var(--text-tertiary, #666); }

        .flock-card__score {
            padding: 0.2rem 0.5rem;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.75rem;
            border: 1px solid;
            flex-shrink: 0;
        }
        .flock-card__score[data-level="high"] { color: var(--accent-green, #0f0); border-color: var(--accent-green, #0f0); background: rgba(0, 255, 0, 0.06); }
        .flock-card__score[data-level="mid"] { color: var(--accent-amber, #fa0); border-color: var(--accent-amber, #fa0); background: rgba(255, 170, 0, 0.06); }
        .flock-card__score[data-level="low"] { color: var(--accent-red, #f44); border-color: var(--accent-red, #f44); background: rgba(255, 68, 68, 0.06); }

        .flock-card__desc {
            font-size: 0.7rem;
            color: var(--text-tertiary, #888);
            margin: 0 0 0.5rem;
            line-height: 1.45;
        }

        .flock-card__caps {
            display: flex;
            gap: 0.25rem;
            flex-wrap: wrap;
            margin-bottom: 0.6rem;
        }
        .flock-card__cap {
            padding: 0.1rem 0.4rem;
            background: rgba(255, 0, 128, 0.06);
            border: 1px solid rgba(255, 0, 128, 0.2);
            border-radius: 4px;
            font-size: 0.55rem;
            color: var(--accent-magenta, #f08);
        }
        .flock-card__cap--more { background: transparent; border-style: dashed; }

        .flock-card__metrics {
            display: flex;
            gap: 0.75rem;
            font-size: 0.6rem;
            color: var(--text-tertiary, #666);
            margin-top: auto;
        }
        .flock-card__metric { display: flex; gap: 0.2rem; align-items: center; }

        /* Pagination */
        .flock-pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            padding: 1.5rem 0;
        }
        .flock-pagination__btn {
            padding: 0.35rem 0.75rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 6px;
            color: var(--text-secondary, #bbb);
            font-family: inherit;
            font-size: 0.7rem;
            cursor: pointer;
            transition: background 0.1s;
        }
        .flock-pagination__btn:hover:not(:disabled) { background: var(--bg-hover, #2a2a3e); }
        .flock-pagination__btn:disabled { opacity: 0.4; cursor: default; }
        .flock-pagination__info { font-size: 0.7rem; color: var(--text-tertiary, #666); }

        /* Detail Panel (Overlay) */
        .flock-detail-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9998;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex;
            justify-content: center;
            padding-top: 8vh;
            animation: fadeIn 0.15s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes panelSlideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .flock-detail {
            width: 520px;
            max-height: 80vh;
            background: rgba(15, 16, 24, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: var(--radius-xl, 16px);
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 32px rgba(0, 229, 255, 0.04);
            overflow-y: auto;
            align-self: flex-start;
            padding: 1.5rem;
            animation: panelSlideUp 0.25s ease-out;
        }

        .flock-detail__header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1rem;
        }
        .flock-detail__avatar {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            background: var(--bg-raised, #222);
            border: 2px solid var(--border, #333);
            font-weight: 700;
            font-size: 1.1rem;
            color: var(--text-primary, #eee);
            flex-shrink: 0;
        }
        .flock-detail__avatar[data-status="active"] { border-color: var(--accent-green, #0f0); }
        .flock-detail__name {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary, #eee);
            margin: 0;
        }
        .flock-detail__status {
            font-size: 0.6rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .flock-detail__status[data-status="active"] { color: var(--accent-green, #0f0); }
        .flock-detail__status[data-status="inactive"] { color: var(--text-tertiary, #666); }
        .flock-detail__close {
            margin-left: auto;
            background: transparent;
            border: none;
            color: var(--text-tertiary, #666);
            font-size: 1.4rem;
            cursor: pointer;
            padding: 0.25rem;
            line-height: 1;
        }
        .flock-detail__close:hover { color: var(--text-primary, #eee); }

        .flock-detail__desc {
            font-size: 0.8rem;
            color: var(--text-secondary, #bbb);
            line-height: 1.5;
            margin: 0 0 1.25rem;
        }

        .flock-detail__section { margin-bottom: 1.25rem; }
        .flock-detail__section-title {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-tertiary, #666);
            margin: 0 0 0.5rem;
        }

        /* Reputation Bar */
        .flock-detail__rep {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .flock-detail__rep-bar {
            flex: 1;
            height: 8px;
            background: var(--bg-raised, #222);
            border-radius: 4px;
            overflow: hidden;
        }
        .flock-detail__rep-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        .flock-detail__rep-fill[data-level="high"] { background: var(--accent-green, #0f0); }
        .flock-detail__rep-fill[data-level="mid"] { background: var(--accent-amber, #fa0); }
        .flock-detail__rep-fill[data-level="low"] { background: var(--accent-red, #f44); }
        .flock-detail__rep-value {
            font-weight: 700;
            font-size: 0.8rem;
            flex-shrink: 0;
        }
        .flock-detail__rep-value[data-level="high"] { color: var(--accent-green, #0f0); }
        .flock-detail__rep-value[data-level="mid"] { color: var(--accent-amber, #fa0); }
        .flock-detail__rep-value[data-level="low"] { color: var(--accent-red, #f44); }

        /* Metrics Grid */
        .flock-detail__metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
        }
        .flock-detail__metric {
            text-align: center;
            padding: 0.6rem;
            background: var(--bg-raised, #222);
            border-radius: 8px;
        }
        .flock-detail__metric-value {
            display: block;
            font-weight: 700;
            font-size: 1rem;
            color: var(--text-primary, #eee);
        }
        .flock-detail__metric-label {
            display: block;
            font-size: 0.55rem;
            color: var(--text-tertiary, #666);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 0.15rem;
        }

        /* Capabilities */
        .flock-detail__caps {
            display: flex;
            gap: 0.35rem;
            flex-wrap: wrap;
        }
        .flock-detail__cap {
            padding: 0.2rem 0.5rem;
            background: rgba(255, 0, 128, 0.08);
            border: 1px solid rgba(255, 0, 128, 0.25);
            border-radius: 4px;
            font-size: 0.65rem;
            color: var(--accent-magenta, #f08);
        }

        /* Detail Fields */
        .flock-detail__fields {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .flock-detail__field {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.75rem;
        }
        .flock-detail__field-label { color: var(--text-tertiary, #666); }
        .flock-detail__field-value { color: var(--text-secondary, #bbb); }
        .flock-detail__field-value--mono { font-family: monospace; font-size: 0.7rem; }

        /* Actions */
        .flock-detail__actions {
            padding-top: 0.75rem;
            border-top: 1px solid var(--border, #2a2a3e);
        }
        .flock-detail__action-btn {
            width: 100%;
            padding: 0.6rem;
            background: rgba(0, 229, 255, 0.08);
            border: 1px solid rgba(0, 229, 255, 0.3);
            border-radius: 8px;
            color: var(--accent-cyan, #0ef);
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.1s;
        }
        .flock-detail__action-btn:hover { background: rgba(0, 229, 255, 0.15); }

        /* Responsive */
        @media (max-width: 640px) {
            .flock-page { padding: 1rem; }
            .flock-grid { grid-template-columns: 1fr; }
            .flock-detail { width: calc(100vw - 2rem); }
            .flock-header__title-row { flex-direction: column; align-items: flex-start; }
        }
    `,
})
export class FlockDirectoryComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly router = inject(Router);

    readonly pageSize = 24;

    readonly loading = signal(true);
    readonly agents = signal<FlockAgent[]>([]);
    readonly totalAgents = signal(0);
    readonly stats = signal<FlockStats | null>(null);
    readonly allCapabilities = signal<string[]>([]);
    readonly selectedAgent = signal<FlockAgent | null>(null);

    readonly searchQuery = signal('');
    readonly statusFilter = signal<FlockAgentStatus | ''>('');
    readonly capabilityFilter = signal('');
    readonly sortBy = signal<FlockSortField>('reputation');
    readonly sortOrder = signal<FlockSortOrder>('desc');
    readonly currentPage = signal(0);

    private searchDebounce: ReturnType<typeof setTimeout> | null = null;

    ngOnInit(): void {
        this.loadStats();
        this.loadCapabilities();
        this.search();
    }

    onSearchInput(event: Event): void {
        this.searchQuery.set((event.target as HTMLInputElement).value);
        this.currentPage.set(0);
        this.debounceSearch();
    }

    onStatusChange(event: Event): void {
        this.statusFilter.set((event.target as HTMLSelectElement).value as FlockAgentStatus | '');
        this.currentPage.set(0);
        this.search();
    }

    onCapabilityChange(event: Event): void {
        this.capabilityFilter.set((event.target as HTMLSelectElement).value);
        this.currentPage.set(0);
        this.search();
    }

    onSortByChange(event: Event): void {
        this.sortBy.set((event.target as HTMLSelectElement).value as FlockSortField);
        this.search();
    }

    toggleSortOrder(): void {
        this.sortOrder.update((o) => (o === 'desc' ? 'asc' : 'desc'));
        this.search();
    }

    toggleCapability(cap: string): void {
        this.capabilityFilter.update((c) => (c === cap ? '' : cap));
        this.currentPage.set(0);
        this.search();
    }

    prevPage(): void {
        this.currentPage.update((p) => Math.max(0, p - 1));
        this.search();
    }

    nextPage(): void {
        this.currentPage.update((p) => p + 1);
        this.search();
    }

    selectAgent(agent: FlockAgent): void {
        this.selectedAgent.set(agent);
    }

    messageAgent(agent: FlockAgent): void {
        this.selectedAgent.set(null);
        this.router.navigate(['/sessions/new'], { queryParams: { agent: agent.name } });
    }

    getRepLevel(score: number): string {
        if (score >= 70) return 'high';
        if (score >= 30) return 'mid';
        return 'low';
    }

    truncate(text: string, max: number): string {
        return text.length > max ? text.slice(0, max) + '...' : text;
    }

    min(a: number, b: number): number {
        return Math.min(a, b);
    }

    formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    formatRelative(iso: string): string {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    private debounceSearch(): void {
        if (this.searchDebounce) clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => this.search(), 250);
    }

    private async search(): Promise<void> {
        this.loading.set(true);
        try {
            const params = new URLSearchParams();
            const q = this.searchQuery().trim();
            if (q) params.set('q', q);
            if (this.statusFilter()) params.set('status', this.statusFilter());
            if (this.capabilityFilter()) params.set('capability', this.capabilityFilter());
            params.set('sortBy', this.sortBy());
            params.set('sortOrder', this.sortOrder());
            params.set('limit', String(this.pageSize));
            params.set('offset', String(this.currentPage() * this.pageSize));

            const result = await firstValueFrom(
                this.api.get<FlockDirectorySearchResult>(`/flock-directory/search?${params.toString()}`),
            );
            this.agents.set(result.agents);
            this.totalAgents.set(result.total);
        } catch {
            this.agents.set([]);
            this.totalAgents.set(0);
        } finally {
            this.loading.set(false);
        }
    }

    private async loadStats(): Promise<void> {
        try {
            const stats = await firstValueFrom(this.api.get<FlockStats>('/flock-directory/stats'));
            this.stats.set(stats);
        } catch {
            // Stats not critical
        }
    }

    private async loadCapabilities(): Promise<void> {
        try {
            // Fetch all agents to extract unique capabilities
            const result = await firstValueFrom(
                this.api.get<FlockDirectorySearchResult>('/flock-directory/search?limit=200'),
            );
            const caps = new Set<string>();
            for (const agent of result.agents) {
                for (const c of agent.capabilities) caps.add(c);
            }
            this.allCapabilities.set([...caps].sort());
        } catch {
            // Not critical
        }
    }
}
