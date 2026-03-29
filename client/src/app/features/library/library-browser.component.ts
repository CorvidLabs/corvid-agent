import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LibraryService, type LibraryCategory, type LibraryEntry } from '../../core/services/library.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

const CATEGORIES: { value: LibraryCategory | ''; label: string }[] = [
    { value: '', label: 'All Categories' },
    { value: 'guide', label: 'Guides' },
    { value: 'reference', label: 'References' },
    { value: 'decision', label: 'Decisions' },
    { value: 'standard', label: 'Standards' },
    { value: 'runbook', label: 'Runbooks' },
];

@Component({
    selector: 'app-library-browser',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RelativeTimePipe, EmptyStateComponent, SkeletonComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Shared Library (CRVLIB)</h2>
                <button class="btn btn--primary btn--sm" (click)="refresh()" [disabled]="libraryService.loading()">
                    {{ libraryService.loading() ? 'Loading...' : 'Refresh' }}
                </button>
            </div>

            <div class="toolbar">
                <input
                    class="search-input"
                    placeholder="Filter by key or content..."
                    [(ngModel)]="searchQuery"
                    (input)="searchQuery = $any($event.target).value" />
                <select class="category-select" [(ngModel)]="categoryFilter" (ngModelChange)="onCategoryChange($event)">
                    @for (cat of categories; track cat.value) {
                        <option [value]="cat.value">{{ cat.label }}</option>
                    }
                </select>
            </div>

            @if (libraryService.loading()) {
                <app-skeleton variant="table" [count]="5" />
            } @else if (libraryService.entries().length === 0) {
                <app-empty-state
                    icon="  [LIB]\n  [===]\n  [___]"
                    title="No library entries yet."
                    description="Library entries are shared knowledge published by agents via CRVLIB on-chain ASAs."
                    actionLabel="View Agents"
                    actionRoute="/agents"
                    actionAriaLabel="View agents that can publish to the library" />
            } @else if (filtered().length === 0) {
                <p class="empty">No entries match your filter.</p>
            } @else {
                <div class="entry-list stagger-children">
                    @for (entry of filtered(); track entry.id) {
                        <div class="entry-card card-lift"
                             [class.entry-card--book]="!!entry.book"
                             [class.entry-card--expanded]="expandedId() === entry.id"
                             (click)="openEntry(entry)">
                            <div class="entry-card__header">
                                <span class="entry-card__key">{{ getDisplayTitle(entry) }}</span>
                                <span class="entry-card__category" [attr.data-category]="entry.category">{{ entry.category }}</span>
                                @if (entry.totalPages && entry.totalPages > 1) {
                                    <span class="entry-card__pages">{{ entry.totalPages }} pages</span>
                                }
                            </div>
                            <div class="entry-card__meta">
                                <span class="entry-card__author">{{ entry.authorName || 'Unknown' }}</span>
                                <span class="entry-card__time">{{ entry.updatedAt | relativeTime }}</span>
                                @if (entry.asaId) {
                                    <span class="entry-card__asa">ASA #{{ entry.asaId }}</span>
                                }
                            </div>
                            @if (entry.tags.length > 0) {
                                <div class="entry-card__tags">
                                    @for (tag of entry.tags; track tag) {
                                        <span class="tag">{{ tag }}</span>
                                    }
                                </div>
                            }
                            @if (expandedId() === entry.id) {
                                @if (loadingBook()) {
                                    <div class="entry-card__content"><p class="loading-text">Loading book...</p></div>
                                } @else if (bookPages().length > 1) {
                                    <div class="entry-card__content entry-card__book-reader">
                                        @for (page of bookPages(); track page.id; let i = $index) {
                                            @if (i > 0) {
                                                <div class="page-divider">
                                                    <span class="page-divider__label">Page {{ i + 1 }}</span>
                                                </div>
                                            }
                                            <pre>{{ page.content }}</pre>
                                        }
                                    </div>
                                } @else {
                                    <div class="entry-card__content">
                                        <pre>{{ entry.content }}</pre>
                                    </div>
                                }
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page__header h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0; }

        .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .search-input {
            flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .category-select {
            padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius);
            background: var(--bg-input); color: var(--text-secondary); font-size: 0.85rem; font-family: inherit;
        }

        .empty { color: var(--text-tertiary); font-size: 0.85rem; }

        .entry-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .entry-card {
            border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem 1rem;
            cursor: pointer; transition: border-color 0.15s, background 0.15s;
        }
        .entry-card:hover { border-color: var(--border-bright); background: var(--bg-hover); }
        .entry-card--expanded { border-color: var(--accent-cyan); }

        .entry-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
        .entry-card__key { font-weight: 600; color: var(--accent-cyan); font-size: 0.85rem; }
        .entry-card__category {
            font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
            padding: 0.15rem 0.4rem; border-radius: var(--radius-sm); background: var(--bg-raised); color: var(--text-secondary);
        }
        .entry-card__category[data-category="guide"] { color: var(--accent-green); }
        .entry-card__category[data-category="reference"] { color: var(--accent-cyan); }
        .entry-card__category[data-category="decision"] { color: var(--accent-amber); }
        .entry-card__category[data-category="standard"] { color: var(--accent-purple, #a78bfa); }
        .entry-card__category[data-category="runbook"] { color: var(--accent-red); }

        .entry-card__meta { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--text-tertiary); margin-bottom: 0.25rem; }
        .entry-card__asa { font-family: var(--font-mono); color: var(--accent-green); }
        .entry-card--book { border-left: 3px solid var(--accent-purple, #a78bfa); }
        .entry-card__pages {
            font-size: 0.6rem; font-weight: 700; color: var(--accent-purple, #a78bfa);
            background: rgba(167, 139, 250, 0.1); border: 1px solid rgba(167, 139, 250, 0.2);
            padding: 1px 8px; border-radius: 10px;
        }

        .entry-card__tags { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .tag {
            font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: var(--radius-sm);
            background: var(--accent-cyan-dim); color: var(--accent-cyan); font-weight: 600;
        }

        .entry-card__content {
            margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border);
        }
        .entry-card__content pre {
            font-size: 0.8rem; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word;
            margin: 0; font-family: inherit; line-height: 1.5;
        }
        .entry-card__book-reader { max-height: 500px; overflow-y: auto; }
        .loading-text { color: var(--text-tertiary); font-size: 0.8rem; margin: 0; }
        .page-divider {
            display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0;
        }
        .page-divider::before, .page-divider::after {
            content: ''; flex: 1; height: 1px; background: var(--border);
        }
        .page-divider__label {
            font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.05em; color: var(--text-tertiary); white-space: nowrap;
        }

        @media (max-width: 767px) {
            .toolbar { flex-direction: column; }
            .entry-card__meta { flex-wrap: wrap; gap: 0.5rem; }
        }
    `,
})
export class LibraryBrowserComponent implements OnInit {
    protected readonly libraryService = inject(LibraryService);
    protected readonly categories = CATEGORIES;

    protected searchQuery = '';
    protected categoryFilter = '';
    protected readonly expandedId = signal<string | null>(null);
    protected readonly bookPages = signal<LibraryEntry[]>([]);
    protected readonly loadingBook = signal(false);

    protected readonly filtered = computed(() => {
        let entries = this.libraryService.entries();
        const query = this.searchQuery.toLowerCase();
        if (query) {
            entries = entries.filter(
                (e) =>
                    (e.title ?? '').toLowerCase().includes(query) ||
                    e.key.toLowerCase().includes(query) ||
                    e.content.toLowerCase().includes(query),
            );
        }
        return entries;
    });

    ngOnInit(): void {
        this.libraryService.load();
    }

    protected refresh(): void {
        const cat = this.categoryFilter as LibraryCategory | '';
        this.libraryService.load(cat ? { category: cat } : undefined);
    }

    protected onCategoryChange(category: string): void {
        this.categoryFilter = category;
        this.refresh();
    }

    protected openEntry(entry: LibraryEntry): void {
        const isExpanded = this.expandedId() === entry.id;
        if (isExpanded) {
            this.expandedId.set(null);
            this.bookPages.set([]);
            this.loadingBook.set(false);
            return;
        }

        this.expandedId.set(entry.id);
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

    protected getDisplayTitle(entry: LibraryEntry): string {
        if (entry.title) return entry.title;
        const raw = entry.book ?? entry.key;
        return raw
            .replace(/^(ref|guide|std|dec|rb|runbook|decision|standard|reference)-/i, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
