import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { LibraryService, type LibraryCategory, type LibraryEntry } from '../../core/services/library.service';
import { ViewModeService } from '../../core/services/view-mode.service';
import { ViewModeToggleComponent, type ViewMode } from '../../shared/components/view-mode-toggle.component';
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

@Component({
    selector: 'app-library',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ViewModeToggleComponent, Library3DComponent],
    template: `
        <div class="library">
            <div class="library__header">
                <h2 class="library__title">Library</h2>
                <app-view-mode-toggle
                    [mode]="viewMode()"
                    ariaLabel="Library view mode"
                    (modeChange)="setViewMode($event)" />
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

                <!-- Search -->
                <div class="library__search-row">
                    <input
                        class="library__search"
                        type="text"
                        placeholder="Search by title or tags..."
                        [value]="searchQuery()"
                        (input)="onSearch($event)" />
                </div>

                @if (loading()) {
                    <div class="library__loading">Loading library...</div>
                } @else if (filteredEntries().length === 0) {
                    <div class="library__empty">No library entries found.</div>
                } @else {
                    <div class="library__grid">
                        @for (entry of filteredEntries(); track entry.id) {
                            <div
                                class="library__card"
                                [class.library__card--expanded]="expandedKey() === entry.key"
                                (click)="toggleExpand(entry.key)">
                                <div class="library__card-header">
                                    <span
                                        class="library__card-badge"
                                        [style.background]="getCategoryColor(entry.category)"
                                        [style.box-shadow]="'0 0 8px ' + getCategoryColor(entry.category) + '40'">
                                        {{ entry.category }}
                                    </span>
                                    <span class="library__card-title">{{ entry.key }}</span>
                                    @if (entry.book) {
                                        <span class="library__card-book">{{ entry.book }} p.{{ entry.page }}</span>
                                    }
                                </div>
                                <div class="library__card-meta">
                                    <span class="library__card-author">{{ entry.authorName }}</span>
                                    <span class="library__card-date">{{ formatDate(entry.updatedAt) }}</span>
                                </div>
                                @if (entry.tags.length > 0) {
                                    <div class="library__card-tags">
                                        @for (tag of entry.tags; track tag) {
                                            <span class="library__card-tag">{{ tag }}</span>
                                        }
                                    </div>
                                }
                                @if (expandedKey() === entry.key) {
                                    <div class="library__card-content">
                                        <pre class="library__card-pre">{{ entry.content }}</pre>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            } @else {
                <app-library-3d
                    [entries]="allEntries()"
                    (entrySelect)="onEntrySelect($event)" />
                @if (selectedEntry()) {
                    <div class="library__overlay" (click)="clearSelection()">
                        <div class="library__overlay-content" (click)="$event.stopPropagation()">
                            <div class="library__overlay-header">
                                <span
                                    class="library__card-badge"
                                    [style.background]="getCategoryColor(selectedEntry()!.category)">
                                    {{ selectedEntry()!.category }}
                                </span>
                                <span class="library__overlay-title">{{ selectedEntry()!.key }}</span>
                                <button class="library__overlay-close" (click)="clearSelection()">✕</button>
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
                            <pre class="library__card-pre library__overlay-pre">{{ selectedEntry()!.content }}</pre>
                        </div>
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .library {
            padding: 1rem;
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
            color: var(--text-primary, #e0e0e0);
            margin: 0;
        }
        .library__tabs {
            display: flex;
            gap: 0;
            margin-bottom: 0.75rem;
            background: var(--glass-bg-solid, rgba(20, 21, 30, 0.9));
            border: 1px solid var(--border-subtle, #1a1a2e);
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
            color: var(--text-secondary, #888);
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
            white-space: nowrap;
        }
        .library__tab:hover {
            color: var(--text-primary, #e0e0e0);
            background: var(--bg-hover, rgba(255, 255, 255, 0.04));
        }
        .library__tab--active {
            color: var(--accent-cyan, #00e5ff);
            background: var(--accent-cyan-subtle, rgba(0, 229, 255, 0.08));
        }
        .library__search-row {
            margin-bottom: 0.75rem;
        }
        .library__search {
            width: 100%;
            padding: 0.5rem 0.75rem;
            font-size: 0.8rem;
            font-family: inherit;
            background: var(--input-bg, rgba(15, 15, 25, 0.8));
            border: 1px solid var(--border-subtle, #1a1a2e);
            border-radius: 6px;
            color: var(--text-primary, #e0e0e0);
            outline: none;
            transition: border-color 0.15s;
        }
        .library__search:focus {
            border-color: var(--accent-cyan, #00e5ff);
        }
        .library__loading, .library__empty {
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary, #888);
            font-size: 0.85rem;
        }
        .library__grid {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .library__card {
            background: var(--card-bg, rgba(15, 15, 25, 0.7));
            border: 1px solid var(--border-subtle, #1a1a2e);
            border-radius: 8px;
            padding: 0.75rem;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
        }
        .library__card:hover {
            border-color: var(--border-bright, #2a2a3e);
            background: var(--card-bg-hover, rgba(20, 20, 35, 0.8));
        }
        .library__card--expanded {
            border-color: var(--accent-cyan-border, rgba(0, 229, 255, 0.3));
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
            color: var(--text-primary, #e0e0e0);
        }
        .library__card-book {
            font-size: 0.65rem;
            color: var(--text-secondary, #888);
            background: var(--bg-hover, rgba(255, 255, 255, 0.04));
            padding: 1px 6px;
            border-radius: 4px;
        }
        .library__card-meta {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.25rem;
            font-size: 0.7rem;
            color: var(--text-secondary, #888);
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
            background: var(--tag-bg, rgba(167, 139, 250, 0.1));
            border: 1px solid var(--tag-border, rgba(167, 139, 250, 0.2));
            border-radius: 4px;
            font-size: 0.62rem;
            color: var(--accent-purple, #a78bfa);
            text-transform: lowercase;
        }
        .library__card-content {
            margin-top: 0.5rem;
            border-top: 1px solid var(--border-subtle, #1a1a2e);
            padding-top: 0.5rem;
        }
        .library__card-pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            color: var(--text-primary, #e0e0e0);
            line-height: 1.5;
            margin: 0;
            max-height: 400px;
            overflow-y: auto;
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
            background: var(--card-bg, rgba(15, 15, 25, 0.95));
            border: 1px solid var(--border-bright, #2a2a3e);
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
            color: var(--text-primary, #e0e0e0);
            flex: 1;
        }
        .library__overlay-close {
            background: transparent;
            border: 1px solid var(--border-subtle, #1a1a2e);
            color: var(--text-secondary, #888);
            font-size: 0.8rem;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
        }
        .library__overlay-close:hover {
            color: var(--text-primary, #e0e0e0);
            border-color: var(--border-bright, #2a2a3e);
        }
        .library__overlay-meta {
            font-size: 0.72rem;
            color: var(--text-secondary, #888);
            margin-top: 0.35rem;
        }
        .library__overlay-pre {
            max-height: 50vh;
        }

        @media (max-width: 600px) {
            .library { padding: 0.5rem; }
            .library__card { padding: 0.5rem; }
        }
    `,
})
export class LibraryComponent implements OnInit {
    private readonly libraryService = inject(LibraryService);
    private readonly viewModeService = inject(ViewModeService);

    protected readonly categories = CATEGORIES;
    protected readonly activeCategory = signal<LibraryCategory | 'all'>('all');
    protected readonly searchQuery = signal('');
    protected readonly expandedKey = signal<string | null>(null);
    protected readonly selectedEntry = signal<LibraryEntry | null>(null);

    protected readonly viewMode = this.viewModeService.getMode('library');
    protected readonly loading = this.libraryService.loading;
    protected readonly allEntries = this.libraryService.entries;

    protected readonly filteredEntries = computed(() => {
        let entries = this.allEntries();
        const cat = this.activeCategory();
        if (cat !== 'all') {
            entries = entries.filter((e) => e.category === cat);
        }
        const q = this.searchQuery().toLowerCase().trim();
        if (q) {
            entries = entries.filter(
                (e) =>
                    e.key.toLowerCase().includes(q) ||
                    e.tags.some((t) => t.toLowerCase().includes(q)) ||
                    e.content.toLowerCase().includes(q),
            );
        }
        return entries;
    });

    ngOnInit(): void {
        this.libraryService.load({ limit: 200 });
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

    protected toggleExpand(key: string): void {
        this.expandedKey.update((current) => (current === key ? null : key));
    }

    protected onEntrySelect(entry: LibraryEntry): void {
        this.selectedEntry.set(entry);
    }

    protected clearSelection(): void {
        this.selectedEntry.set(null);
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
}
