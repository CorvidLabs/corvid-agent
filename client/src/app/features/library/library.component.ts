import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { LibraryService, type LibraryCategory, type LibraryEntry } from '../../core/services/library.service';
import { ViewModeService } from '../../core/services/view-mode.service';
import { ViewModeToggleComponent, type ViewMode } from '../../shared/components/view-mode-toggle.component';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { Library3DComponent } from './library-3d.component';

const CATEGORIES: { key: LibraryCategory | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'guide', label: 'Guides' },
    { key: 'reference', label: 'Reference' },
    { key: 'decision', label: 'Decisions' },
    { key: 'standard', label: 'Standards' },
    { key: 'runbook', label: 'Runbooks' },
];

const CATEGORY_COLORS: Record<LibraryCategory, string> = {
    guide: '#00e5ff',
    reference: '#a78bfa',
    decision: '#f59e0b',
    standard: '#10b981',
    runbook: '#f43f5e',
};

type SortKey = 'date' | 'name' | 'author';

@Component({
    selector: 'app-library',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ViewModeToggleComponent, Library3DComponent, MarkdownPipe],
    template: `
        <div class="library">
            <div class="library__header">
                <h2 class="library__title">Library</h2>
                <app-view-mode-toggle
                    [mode]="viewMode()"
                    ariaLabel="Library view mode"
                    (modeChange)="setViewMode($event)" />
            </div>

            <!-- Stats bar -->
            <div class="library__stats">
                @for (stat of categoryStats(); track stat.key) {
                    <span class="library__stat" [style.color]="stat.color">
                        <span class="library__stat-count">{{ stat.count }}</span>
                        <span class="library__stat-label">{{ stat.label }}</span>
                    </span>
                }
            </div>

            @if (viewMode() === 'basic') {
                <!-- Category filter tabs -->
                <div class="library__tabs" role="tablist">
                    @for (cat of categories; track cat.key) {
                        <button
                            class="library__tab"
                            [class.library__tab--active]="activeCategory() === cat.key"
                            (click)="selectCategory(cat.key)"
                            role="tab"
                            [attr.aria-selected]="activeCategory() === cat.key">
                            {{ cat.label }}
                        </button>
                    }
                </div>

                <!-- Search + Sort row -->
                <div class="library__toolbar">
                    <input
                        class="library__search"
                        type="text"
                        placeholder="Search by title, key, or tags..."
                        [value]="searchQuery()"
                        (input)="onSearch($event)" />
                    <div class="library__sort-buttons">
                        @for (s of sortOptions; track s.key) {
                            <button
                                class="library__sort-btn"
                                [class.library__sort-btn--active]="sortKey() === s.key"
                                (click)="sortKey.set(s.key)">
                                {{ s.label }}
                            </button>
                        }
                    </div>
                </div>

                <!-- Stats bar -->
                @if (!loading() && allEntries().length > 0) {
                    <div class="library__stats">
                        <span class="library__stat library__stat--total">{{ allEntries().length }} total</span>
                        @for (stat of categoryStats(); track stat.key) {
                            <span class="library__stat" [style.color]="stat.color">
                                {{ stat.count }} {{ stat.label }}
                            </span>
                        }
                    </div>
                }

                @if (activeTag()) {
                    <div class="library__active-filter">
                        <span class="library__filter-label">Tag:</span>
                        <span class="library__filter-chip">
                            {{ activeTag() }}
                            <button class="library__filter-clear" (click)="clearTagFilter()">&#x2715;</button>
                        </span>
                    </div>
                }

                @if (loading()) {
                    <div class="library__loading">Loading library...</div>
                } @else if (filteredEntries().length === 0) {
                    <div class="library__empty">No library entries found.</div>
                } @else {
                    <div class="library__grid">
                        @for (entry of filteredEntries(); track entry.id) {
                            <div
                                class="library__card"
                                [class.library__card--book]="!!entry.book"
                                (click)="openEntry(entry)">
                                <div class="library__card-header">
                                    <span
                                        class="library__card-badge"
                                        [style.background]="getCategoryColor(entry.category)"
                                        [style.box-shadow]="'0 0 8px ' + getCategoryColor(entry.category) + '40'">
                                        {{ entry.category }}
                                    </span>
                                    <span class="library__card-title">{{ getDisplayTitle(entry) }}</span>
                                    @if (entry.totalPages && entry.totalPages > 1) {
                                        <span class="library__card-pages">{{ entry.totalPages }} pages</span>
                                    }
                                </div>
                                <div class="library__card-meta">
                                    <span class="library__card-author">{{ entry.authorName }}</span>
                                    <span class="library__card-date">{{ formatDate(entry.updatedAt) }}</span>
                                </div>
                                @if (entry.tags.length > 0) {
                                    <div class="library__card-tags">
                                        @for (tag of entry.tags; track tag) {
                                            <span class="library__card-tag library__card-tag--clickable"
                                                  [class.library__card-tag--active]="activeTag() === tag"
                                                  (click)="filterByTag(tag, $event)">{{ tag }}</span>
                                        }
                                    </div>
                                }
                                <div class="library__card-preview">
                                    {{ getPreview(entry.content) }}
                                </div>
                            </div>
                        }
                    </div>
                }
            } @else {
                <app-library-3d
                    [entries]="allEntries()"
                    [paused]="!!selectedEntry() || showSearch()"
                    (entrySelect)="onEntrySelect($event)"
                    (orbSearch)="openSearch()" />
                @if (showSearch()) {
                    <div class="library__overlay" (click)="closeSearch()">
                        <div class="library__search-panel" (click)="$event.stopPropagation()">
                            <div class="library__search-panel-header">
                                <span class="library__search-panel-title">Search Library</span>
                                <span class="library__search-panel-count">{{ searchResults().length }} entries</span>
                                <button class="library__overlay-close" (click)="closeSearch()">&#x2715;</button>
                            </div>
                            <input
                                class="library__search library__search--panel"
                                type="text"
                                placeholder="Search by title, tags, or content..."
                                [value]="orbSearchQuery()"
                                (input)="onOrbSearch($event)"
                                autofocus />
                            <div class="library__search-panel-tabs">
                                @for (cat of categories; track cat.key) {
                                    <button
                                        class="library__tab"
                                        [class.library__tab--active]="orbSearchCategory() === cat.key"
                                        (click)="orbSearchCategory.set(cat.key)">
                                        {{ cat.label }}
                                    </button>
                                }
                            </div>
                            <div class="library__search-results">
                                @for (entry of searchResults(); track entry.id) {
                                    <div class="library__search-result" (click)="onSearchResultClick(entry)">
                                        <span
                                            class="library__card-badge"
                                            [style.background]="getCategoryColor(entry.category)"
                                            [style.box-shadow]="'0 0 6px ' + getCategoryColor(entry.category) + '30'">
                                            {{ entry.category }}
                                        </span>
                                        <div class="library__search-result-info">
                                            <span class="library__search-result-title">{{ getDisplayTitle(entry) }}</span>
                                            @if (entry.totalPages && entry.totalPages > 1) {
                                                <span class="library__card-pages">{{ entry.totalPages }} pages</span>
                                            }
                                            <span class="library__search-result-preview">{{ getPreview(entry.content) }}</span>
                                        </div>
                                        @if (entry.tags.length > 0) {
                                            <div class="library__card-tags library__search-result-tags">
                                                @for (tag of entry.tags.slice(0, 3); track tag) {
                                                    <span class="library__card-tag">{{ tag }}</span>
                                                }
                                            </div>
                                        }
                                    </div>
                                }
                                @if (searchResults().length === 0) {
                                    <div class="library__empty">No matching entries.</div>
                                }
                            </div>
                        </div>
                    </div>
                }
            }

            @if (selectedEntry()) {
                <div class="library__overlay" (click)="clearSelection()">
                    <div class="library__overlay-content library__overlay-content--reader" (click)="$event.stopPropagation()">
                        <div class="library__overlay-header">
                            <span
                                class="library__card-badge"
                                [style.background]="getCategoryColor(selectedEntry()!.category)">
                                {{ selectedEntry()!.category }}
                            </span>
                            <span class="library__overlay-title">{{ getDisplayTitle(selectedEntry()!) }}</span>
                            @if (bookPages().length > 1) {
                                <span class="library__overlay-page-info">
                                    {{ bookPages().length }} pages
                                </span>
                            } @else {
                                <span class="library__overlay-type">Note</span>
                            }
                            <button class="library__overlay-close" (click)="clearSelection()">&#x2715;</button>
                        </div>
                        <div class="library__overlay-meta">
                            {{ selectedEntry()!.authorName }} · {{ formatDate(selectedEntry()!.updatedAt) }}
                        </div>
                        @if (selectedEntry()!.tags.length > 0) {
                            <div class="library__card-tags">
                                @for (tag of selectedEntry()!.tags; track tag) {
                                    <span class="library__card-tag">{{ tag }}</span>
                                }
                            </div>
                        }
                        @if (loadingBook()) {
                            <div class="library__loading">Loading book...</div>
                        } @else if (bookPages().length > 1) {
                            <div class="library__book-reader">
                                @for (page of bookPages(); track page.id; let i = $index) {
                                    @if (i > 0) {
                                        <div class="library__page-divider">
                                            <span class="library__page-divider-label">Page {{ i + 1 }}</span>
                                        </div>
                                    }
                                    <div class="library__markdown-content" [innerHTML]="page.content | markdown"></div>
                                }
                            </div>
                        } @else {
                            <div class="library__markdown-content" [innerHTML]="selectedEntry()!.content | markdown"></div>
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: `
        .library {
            padding: 1.5rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        .library__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1rem;
        }
        .library__title {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text-primary);
            margin: 0;
        }

        /* Stats bar */
        .library__stats {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
            flex-wrap: wrap;
        }
        .library__stat {
            display: flex;
            align-items: baseline;
            gap: 0.25rem;
            font-size: 0.7rem;
        }
        .library__stat-count {
            font-weight: 700;
            font-size: 0.85rem;
        }
        .library__stat-label {
            opacity: 0.7;
            text-transform: lowercase;
        }

        .library__tabs {
            display: flex;
            gap: 0;
            margin-bottom: 0.75rem;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            overflow-x: auto;
        }
        .library__tab {
            padding: 0.4rem 0.8rem;
            font-size: 0.72rem;
            font-weight: 600;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
            white-space: nowrap;
        }
        .library__tab:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .library__tab--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-subtle);
        }
        .library__toolbar {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            align-items: center;
        }
        .library__search {
            flex: 1;
            padding: 0.5rem 0.75rem;
            font-size: 0.8rem;
            font-family: inherit;
            background: var(--input-bg);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            color: var(--text-primary);
            outline: none;
            transition: border-color 0.15s;
        }
        .library__search:focus {
            border-color: var(--accent-cyan);
        }
        .library__sort-buttons {
            display: flex;
            gap: 0;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            flex-shrink: 0;
        }
        .library__sort-btn {
            padding: 0.4rem 0.6rem;
            font-size: 0.68rem;
            font-weight: 600;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
            white-space: nowrap;
        }
        .library__sort-btn:hover {
            color: var(--text-primary);
        }
        .library__sort-btn--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-subtle);
        }
        .library__stats {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            font-size: 0.68rem;
            font-weight: 600;
        }
        .library__stat {
            padding: 2px 8px;
            background: var(--glass-bg-solid);
            border-radius: 10px;
        }
        .library__stat--total {
            color: var(--text-primary);
        }
        .library__loading, .library__empty {
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
        .library__grid {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .library__card {
            background: var(--card-bg);
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 0.75rem;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
        }
        .library__card:hover {
            border-color: var(--border-bright);
            background: var(--card-bg-hover);
        }
        .library__card--expanded {
            border-color: var(--accent-cyan-border);
        }
        .library__card-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .library__card-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #000;
        }
        .library__card-title {
            font-weight: 600;
            font-size: 0.85rem;
            color: var(--text-primary);
        }
        .library__card-pages {
            font-size: 0.6rem;
            font-weight: 700;
            color: var(--accent-purple);
            background: var(--tag-bg);
            border: 1px solid var(--tag-border);
            padding: 1px 8px;
            border-radius: 10px;
        }
        .library__card--book {
            border-left: 3px solid var(--accent-purple);
        }
        .library__card-preview {
            margin-top: 0.35rem;
            font-size: 0.72rem;
            color: var(--text-tertiary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .library__card-meta {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.25rem;
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        .library__card-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 0.35rem;
        }
        .library__card-tag {
            display: inline-block;
            padding: 1px 6px;
            background: var(--tag-bg);
            border: 1px solid var(--tag-border);
            border-radius: 4px;
            font-size: 0.62rem;
            color: var(--accent-purple);
            text-transform: lowercase;
        }
        .library__card-content {
            margin-top: 0.5rem;
            border-top: 1px solid var(--border-subtle);
            padding-top: 0.5rem;
        }
        .library__card-pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            color: var(--text-primary);
            line-height: 1.5;
            margin: 0;
            max-height: 400px;
            overflow-y: auto;
        }

        /* Markdown rendered content */
        .library__markdown {
            font-size: 0.82rem;
            color: var(--text-primary);
            line-height: 1.65;
            word-break: break-word;
            max-height: 60vh;
            overflow-y: auto;
            margin-top: 0.75rem;
        }
        :host ::ng-deep .library__markdown > :first-child { margin-top: 0; }
        :host ::ng-deep .library__markdown h1,
        :host ::ng-deep .library__markdown h2,
        :host ::ng-deep .library__markdown h3 {
            color: var(--accent-cyan);
            margin: 1.25rem 0 0.5rem;
            line-height: 1.3;
        }
        :host ::ng-deep .library__markdown h1 { font-size: 1.15rem; }
        :host ::ng-deep .library__markdown h2 { font-size: 1rem; }
        :host ::ng-deep .library__markdown h3 { font-size: 0.9rem; }
        :host ::ng-deep .library__markdown p { margin: 0.5rem 0; }
        :host ::ng-deep .library__markdown ul,
        :host ::ng-deep .library__markdown ol {
            padding-left: 1.5rem;
            margin: 0.5rem 0;
        }
        :host ::ng-deep .library__markdown li { margin: 0.25rem 0; }
        :host ::ng-deep .library__markdown code {
            background: rgba(255, 255, 255, 0.06);
            padding: 1px 5px;
            border-radius: 3px;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.78rem;
        }
        :host ::ng-deep .library__markdown pre {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 0.75rem;
            overflow-x: auto;
            margin: 0.75rem 0;
        }
        :host ::ng-deep .library__markdown pre code {
            background: none;
            padding: 0;
            font-size: 0.75rem;
        }
        :host ::ng-deep .library__markdown blockquote {
            border-left: 3px solid var(--accent-cyan);
            margin: 0.75rem 0;
            padding: 0.25rem 0.75rem;
            color: var(--text-secondary);
        }
        :host ::ng-deep .library__markdown a {
            color: var(--accent-cyan);
            text-decoration: none;
        }
        :host ::ng-deep .library__markdown a:hover { text-decoration: underline; }
        :host ::ng-deep .library__markdown table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.75rem 0;
            font-size: 0.78rem;
        }
        :host ::ng-deep .library__markdown th,
        :host ::ng-deep .library__markdown td {
            border: 1px solid var(--border-subtle);
            padding: 0.35rem 0.6rem;
            text-align: left;
        }
        :host ::ng-deep .library__markdown th {
            background: rgba(255, 255, 255, 0.04);
            font-weight: 600;
        }
        :host ::ng-deep .library__markdown hr {
            border: none;
            border-top: 1px solid var(--border-subtle);
            margin: 1rem 0;
        }

        /* 3D overlay */
        .library__overlay {
            position: fixed;
            inset: 0;
            z-index: 100;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            backdrop-filter: blur(4px);
        }
        .library__overlay-content {
            background: var(--card-bg);
            border: 1px solid var(--border-bright);
            border-radius: 12px;
            padding: 1.25rem;
            max-width: 700px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
        }
        .library__overlay-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .library__overlay-title {
            font-weight: 700;
            font-size: 1rem;
            color: var(--text-primary);
            flex: 1;
        }
        .library__overlay-close {
            background: transparent;
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            font-size: 0.8rem;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
        }
        .library__overlay-close:hover {
            color: var(--text-primary);
            border-color: var(--border-bright);
        }
        .library__overlay-meta {
            font-size: 0.72rem;
            color: var(--text-secondary);
            margin-top: 0.35rem;
        }
        .library__overlay-content--reader {
            max-height: 85vh;
        }
        .library__overlay-pre {
            max-height: 60vh;
        }
        .library__book-reader {
            margin-top: 0.75rem;
            max-height: 65vh;
            overflow-y: auto;
            padding-right: 0.5rem;
        }
        .library__page-content {
            margin: 0;
        }
        .library__page-divider {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin: 1rem 0;
        }
        .library__page-divider::before,
        .library__page-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border-subtle);
        }
        .library__page-divider-label {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-tertiary);
            white-space: nowrap;
        }
        .library__overlay-type {
            font-size: 0.6rem;
            text-transform: uppercase;
            color: var(--text-secondary);
            background: var(--bg-hover);
            padding: 1px 6px;
            border-radius: 4px;
        }
        .library__overlay-page-info {
            font-size: 0.65rem;
            color: var(--accent-cyan);
            font-weight: 600;
        }

        /* Tag filtering */
        .library__card-tag--clickable {
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
        }
        .library__card-tag--clickable:hover {
            background: var(--accent-purple-mid);
            border-color: rgba(167, 139, 250, 0.4);
        }
        .library__card-tag--active {
            background: var(--accent-purple-glow);
            border-color: var(--accent-purple);
        }
        .library__active-filter {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            font-size: 0.72rem;
        }
        .library__filter-label {
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .library__filter-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: var(--accent-purple-dim);
            border: 1px solid var(--accent-purple-glow);
            border-radius: 10px;
            color: var(--accent-purple);
            font-weight: 600;
        }
        .library__filter-clear {
            background: transparent;
            border: none;
            color: var(--accent-purple);
            cursor: pointer;
            font-size: 0.6rem;
            padding: 0 2px;
            font-family: inherit;
            line-height: 1;
        }
        .library__filter-clear:hover {
            color: var(--text-primary);
        }

        /* Page navigation */
        .library__page-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            margin-top: 0.75rem;
            padding: 0.5rem;
            background: var(--glass-bg-solid);
            border-radius: 8px;
        }
        .library__page-btn {
            padding: 0.3rem 0.6rem;
            font-size: 0.7rem;
            font-weight: 600;
            font-family: inherit;
            background: var(--bg-hover);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            color: var(--accent-cyan);
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
        }
        .library__page-btn:hover:not(:disabled) {
            background: var(--accent-cyan-subtle);
            border-color: var(--accent-cyan);
        }
        .library__page-btn:disabled {
            color: var(--text-tertiary);
            cursor: not-allowed;
            opacity: 0.5;
        }
        .library__page-indicator {
            font-size: 0.68rem;
            font-weight: 600;
            color: var(--text-secondary);
            min-width: 6rem;
            text-align: center;
        }

        /* Markdown content styling */
        .library__markdown-content {
            margin-top: 0.75rem;
            font-size: 0.8rem;
            line-height: 1.6;
            color: var(--text-primary);
        }
        :host ::ng-deep .library__markdown-content h1,
        :host ::ng-deep .library__markdown-content h2,
        :host ::ng-deep .library__markdown-content h3,
        :host ::ng-deep .library__markdown-content h4 {
            color: var(--accent-cyan);
            margin: 1rem 0 0.5rem;
            font-weight: 700;
        }
        :host ::ng-deep .library__markdown-content h1 { font-size: 1.1rem; }
        :host ::ng-deep .library__markdown-content h2 { font-size: 1rem; }
        :host ::ng-deep .library__markdown-content h3 { font-size: 0.9rem; }
        :host ::ng-deep .library__markdown-content h4 { font-size: 0.85rem; }
        :host ::ng-deep .library__markdown-content p {
            margin: 0.5rem 0;
        }
        :host ::ng-deep .library__markdown-content code {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            background: var(--accent-cyan-subtle);
            padding: 1px 4px;
            border-radius: 3px;
            color: var(--accent-cyan);
        }
        :host ::ng-deep .library__markdown-content pre {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 0.75rem;
            overflow-x: auto;
            margin: 0.5rem 0;
        }
        :host ::ng-deep .library__markdown-content pre code {
            background: transparent;
            padding: 0;
        }
        :host ::ng-deep .library__markdown-content ul,
        :host ::ng-deep .library__markdown-content ol {
            padding-left: 1.5rem;
            margin: 0.5rem 0;
        }
        :host ::ng-deep .library__markdown-content li {
            margin: 0.25rem 0;
        }
        :host ::ng-deep .library__markdown-content blockquote {
            border-left: 3px solid var(--accent-purple);
            padding-left: 0.75rem;
            margin: 0.5rem 0;
            color: var(--text-secondary);
        }
        :host ::ng-deep .library__markdown-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.5rem 0;
            font-size: 0.75rem;
        }
        :host ::ng-deep .library__markdown-content th,
        :host ::ng-deep .library__markdown-content td {
            border: 1px solid var(--border-subtle);
            padding: 0.35rem 0.5rem;
            text-align: left;
        }
        :host ::ng-deep .library__markdown-content th {
            background: var(--accent-cyan-subtle);
            font-weight: 600;
        }
        :host ::ng-deep .library__markdown-content a {
            color: var(--accent-cyan);
            text-decoration: none;
        }
        :host ::ng-deep .library__markdown-content a:hover {
            text-decoration: underline;
        }
        :host ::ng-deep .library__markdown-content hr {
            border: none;
            border-top: 1px solid var(--border-subtle);
            margin: 1rem 0;
        }

        /* Search panel */
        .library__search-panel {
            background: var(--card-bg);
            border: 1px solid var(--border-bright);
            border-radius: 12px;
            padding: 1rem;
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .library__search-panel-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .library__search-panel-title {
            font-weight: 700;
            font-size: 1rem;
            color: var(--accent-cyan);
            flex: 1;
        }
        .library__search-panel-count {
            font-size: 0.65rem;
            color: var(--text-secondary);
        }
        .library__search--panel {
            margin-bottom: 0;
        }
        .library__search-panel-tabs {
            display: flex;
            gap: 0;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            overflow-x: auto;
        }
        .library__search-results {
            display: flex;
            flex-direction: column;
            gap: 4px;
            overflow-y: auto;
            max-height: 50vh;
            padding-right: 4px;
        }
        .library__search-result {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 0.5rem 0.6rem;
            background: var(--card-bg);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
        }
        .library__search-result:hover {
            border-color: var(--accent-cyan-border);
            background: var(--card-bg-hover);
        }
        .library__search-result-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .library__search-result-title {
            font-weight: 600;
            font-size: 0.8rem;
            color: var(--text-primary);
        }
        .library__search-result-preview {
            font-size: 0.68rem;
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .library__search-result-tags {
            flex-shrink: 0;
            align-self: center;
        }

        @media (max-width: 600px) {
            .library { padding: 0.5rem; }
            .library__card { padding: 0.5rem; }
            .library__search-panel { max-width: 100%; padding: 0.75rem; }
            .library__toolbar { flex-direction: column; }
            .library__sort-buttons { align-self: flex-end; }
        }
    `,
})
export class LibraryComponent implements OnInit, OnDestroy {
    private readonly libraryService = inject(LibraryService);
    private readonly viewModeService = inject(ViewModeService);
    protected readonly categories = CATEGORIES;
    protected readonly sortOptions: { key: SortKey; label: string }[] = [
        { key: 'date', label: 'Date' },
        { key: 'name', label: 'Name' },
        { key: 'author', label: 'Author' },
    ];
    protected readonly activeCategory = signal<LibraryCategory | 'all'>('all');
    protected readonly activeTag = signal<string | null>(null);
    protected readonly searchQuery = signal('');
    protected readonly sortKey = signal<SortKey>('date');
    protected readonly selectedEntry = signal<LibraryEntry | null>(null);
    protected readonly bookPages = signal<LibraryEntry[]>([]);
    protected readonly loadingBook = signal(false);
    protected readonly showSearch = signal(false);
    protected readonly orbSearchQuery = signal('');
    protected readonly orbSearchCategory = signal<LibraryCategory | 'all'>('all');

    protected readonly viewMode = this.viewModeService.getMode('library');
    protected readonly loading = this.libraryService.loading;
    protected readonly allEntries = this.libraryService.entries;

    protected readonly categoryStats = computed(() => {
        const entries = this.allEntries();
        const counts = new Map<LibraryCategory, number>();
        for (const e of entries) {
            counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
        }
        return [
            { key: 'total' as string, label: 'total', count: entries.length, color: 'var(--text-primary)' },
            ...CATEGORIES.filter((c) => c.key !== 'all')
                .map((c) => ({
                    key: c.key as string,
                    label: c.label.toLowerCase(),
                    count: counts.get(c.key as LibraryCategory) ?? 0,
                    color: CATEGORY_COLORS[c.key as LibraryCategory] ?? '#888',
                }))
                .filter((s) => s.count > 0),
        ];
    });

    protected readonly searchResults = computed(() => {
        let entries = this.allEntries();
        const cat = this.orbSearchCategory();
        if (cat !== 'all') {
            entries = entries.filter((e) => e.category === cat);
        }
        const q = this.orbSearchQuery().toLowerCase().trim();
        if (q) {
            entries = entries.filter(
                (e) =>
                    (e.title ?? '').toLowerCase().includes(q) ||
                    e.key.toLowerCase().includes(q) ||
                    (e.title ?? '').toLowerCase().includes(q) ||
                    e.tags.some((t) => t.toLowerCase().includes(q)) ||
                    e.content.toLowerCase().includes(q),
            );
        }
        return [...entries].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    protected readonly filteredEntries = computed(() => {
        let entries = this.allEntries();
        const cat = this.activeCategory();
        if (cat !== 'all') {
            entries = entries.filter((e) => e.category === cat);
        }
        const tag = this.activeTag();
        if (tag) {
            entries = entries.filter((e) => e.tags.includes(tag));
        }
        const q = this.searchQuery().toLowerCase().trim();
        if (q) {
            entries = entries.filter(
                (e) =>
                    (e.title ?? '').toLowerCase().includes(q) ||
                    e.key.toLowerCase().includes(q) ||
                    (e.title ?? '').toLowerCase().includes(q) ||
                    e.tags.some((t) => t.toLowerCase().includes(q)) ||
                    e.content.toLowerCase().includes(q),
            );
        }
        const key = this.sortKey();
        return [...entries].sort((a, b) => {
            if (key === 'name') {
                return this.getDisplayTitle(a).localeCompare(this.getDisplayTitle(b));
            }
            if (key === 'author') {
                return a.authorName.localeCompare(b.authorName) ||
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    });

    private onEscKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (this.selectedEntry()) {
                this.clearSelection();
            } else if (this.showSearch()) {
                this.closeSearch();
            }
        }
    };

    ngOnInit(): void {
        this.libraryService.load({ limit: 200 });
        window.addEventListener('keydown', this.onEscKey);
    }

    ngOnDestroy(): void {
        window.removeEventListener('keydown', this.onEscKey);
    }

    protected setViewMode(mode: ViewMode): void {
        this.viewModeService.setMode('library', mode);
    }

    protected selectCategory(key: LibraryCategory | 'all'): void {
        this.activeCategory.set(key);
    }

    protected onSearch(event: Event): void {
        this.searchQuery.set((event.target as HTMLInputElement).value);
    }

    protected openEntry(entry: LibraryEntry): void {
        this.selectedEntry.set(entry);
        this.bookPages.set([]);

        if (entry.book) {
            this.loadingBook.set(true);
            this.libraryService.getEntry(entry.key).then((full) => {
                if (full.pages && full.pages.length > 1) {
                    this.bookPages.set(full.pages);
                }
                this.loadingBook.set(false);
            }).catch(() => {
                this.loadingBook.set(false);
            });
        }
    }

    protected onEntrySelect(entry: LibraryEntry): void {
        this.openEntry(entry);
    }

    protected clearSelection(): void {
        this.selectedEntry.set(null);
        this.bookPages.set([]);
        this.loadingBook.set(false);
    }

    protected filterByTag(tag: string, event: Event): void {
        event.stopPropagation();
        this.activeTag.set(this.activeTag() === tag ? null : tag);
    }

    protected clearTagFilter(): void {
        this.activeTag.set(null);
    }

    protected getDisplayTitle(entry: LibraryEntry): string {
        // Prefer explicit title
        if (entry.title) return entry.title;
        // For books, humanize the book key
        if (entry.book) {
            return this.humanizeKey(entry.book);
        }
        // For notes, humanize the entry key (strip common prefixes)
        return this.humanizeKey(entry.key);
    }

    protected openSearch(): void {
        this.showSearch.set(true);
        this.orbSearchQuery.set('');
        this.orbSearchCategory.set('all');
    }

    protected closeSearch(): void {
        this.showSearch.set(false);
    }

    protected onOrbSearch(event: Event): void {
        this.orbSearchQuery.set((event.target as HTMLInputElement).value);
    }

    protected onSearchResultClick(entry: LibraryEntry): void {
        this.showSearch.set(false);
        this.onEntrySelect(entry);
    }

    protected getPreview(content: string): string {
        // Skip markdown headers and blank lines, strip formatting chars
        const lines = content.split('\n');
        const line = lines.find((l) => {
            const t = l.trim();
            return t.length > 0 && !t.startsWith('#') && !t.startsWith('---') && !t.startsWith('===');
        }) ?? '';
        const clean = line.replace(/[*_`~#>]/g, '').trim();
        return clean.length > 100 ? `${clean.slice(0, 98)}...` : clean;
    }

    protected getCategoryColor(category: LibraryCategory): string {
        return CATEGORY_COLORS[category] ?? '#888';
    }

    protected formatDate(iso: string): string {
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return iso;
        }
    }

    private humanizeKey(key: string): string {
        // Strip common prefixes like "ref-", "guide-", "std-", "dec-", "rb-"
        const stripped = key.replace(/^(ref|guide|std|dec|rb|runbook|decision|standard|reference)-/i, '');
        return stripped
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
