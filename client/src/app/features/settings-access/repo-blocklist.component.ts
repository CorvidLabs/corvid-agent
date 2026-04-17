import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { RepoBlocklistService } from '../../core/services/repo-blocklist.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';

@Component({
    selector: 'app-repo-blocklist',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe, SkeletonComponent, TooltipDirective, EmptyStateComponent],
    template: `
        <div class="page">
            <div class="page__header">
                <h2 class="page-title">
                    Repo Blocklist
                    @if (service.entries().length > 0) {
                        <span class="count">({{ service.entries().length }})</span>
                    }
                </h2>
            </div>

            <div class="add-form">
                <input
                    class="input"
                    type="text"
                    placeholder="owner/repo or owner/*"
                    [value]="newRepo()"
                    (input)="newRepo.set(toInputValue($event))" />
                <input
                    class="input input--reason"
                    type="text"
                    placeholder="Reason (optional)"
                    [value]="newReason()"
                    (input)="newReason.set(toInputValue($event))" />
                <button
                    class="btn btn--primary"
                    [disabled]="!newRepo().trim()"
                    (click)="add()">Block</button>
            </div>

            @if (error()) {
                <p class="error">{{ error() }}</p>
            }

            @if (service.loading()) {
                <app-skeleton variant="line" [count]="4" />
            } @else if (service.entries().length === 0) {
                <app-empty-state
                    icon="[x]"
                    title="No Blocklist"
                    description="No repos blocklisted. All repos are currently allowed." />
            } @else {
                <div class="list" role="list">
                    @for (entry of service.entries(); track entry.repo) {
                        <div class="list__item" role="listitem">
                            <div class="list__item-main">
                                <div class="list__item-repo">{{ entry.repo }}</div>
                                <div class="list__item-detail">
                                    <span class="badge badge--{{ entry.source }}">{{ entry.source }}</span>
                                    @if (entry.reason) {
                                        <span class="list__item-reason">{{ entry.reason }}</span>
                                    }
                                </div>
                            </div>
                            <div class="list__item-meta">
                                <span>{{ entry.createdAt | relativeTime }}</span>
                                <button class="btn btn--danger btn--small" (click)="remove(entry.repo)">Remove</button>
                            </div>
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: clamp(var(--space-3), 2vw, var(--space-6)); }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); flex-wrap: wrap; gap: var(--space-3); }
        .page__header h2 { margin: 0; color: var(--text-primary); font-size: var(--text-xl); }
        .count { color: var(--text-tertiary); font-weight: 400; font-size: var(--text-base); }
        .add-form { display: flex; gap: var(--space-3); margin-bottom: var(--space-5); flex-wrap: wrap; }
        .input {
            flex: 1; padding: var(--space-3) var(--space-4); background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); color: var(--text-primary); font-family: inherit; font-size: var(--text-base);
            min-height: 48px;
        }
        .input::placeholder { color: var(--text-tertiary); }
        .input--reason { max-width: 340px; min-width: 160px; }
        .btn {
            padding: var(--space-3) var(--space-5); border-radius: var(--radius); font-size: var(--text-sm); font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s; background: transparent; min-height: 48px;
        }
        .btn:disabled { opacity: 0.4; cursor: default; }
        .btn--primary { color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--danger { color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: rgba(255, 68, 68, 0.1); }
        .btn--small { padding: var(--space-2) var(--space-3); font-size: var(--text-xs); min-height: 40px; }
        .error { color: var(--accent-red); font-size: var(--text-base); margin-bottom: var(--space-4); }
        .list { display: flex; flex-direction: column; gap: var(--space-4); }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: clamp(var(--space-3), 2vw, var(--space-5)); background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-xl); transition: border-color 0.15s;
        }
        .list__item:hover { border-color: var(--border-bright); }
        .list__item-main { flex: 1; min-width: 0; }
        .list__item-repo { font-family: var(--font-mono); font-size: var(--text-base); color: var(--text-primary); }
        .list__item-detail { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }
        .list__item-reason { font-size: var(--text-sm); color: var(--text-secondary); }
        .badge {
            font-size: var(--text-xxs); padding: 0.25rem 0.625rem; border-radius: var(--radius);
            text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
        }
        .badge--manual { color: var(--accent-cyan); border: 1px solid var(--accent-cyan); }
        .badge--pr_rejection { color: var(--accent-red); border: 1px solid var(--accent-red); }
        .badge--daily_review { color: var(--accent-yellow); border: 1px solid var(--accent-yellow); }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-tertiary); margin-left: var(--space-4); }
    `,
})
export class RepoBlocklistComponent implements OnInit {
    protected readonly service = inject(RepoBlocklistService);

    readonly newRepo = signal('');
    readonly newReason = signal('');
    readonly error = signal<string | null>(null);

    ngOnInit(): void {
        this.service.loadEntries();
    }

    toInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    async add(): Promise<void> {
        const repo = this.newRepo().trim();
        if (!repo) return;
        this.error.set(null);
        try {
            await this.service.addEntry(repo, this.newReason().trim() || undefined);
            this.newRepo.set('');
            this.newReason.set('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add repo';
            this.error.set(msg);
        }
    }

    async remove(repo: string): Promise<void> {
        if (!confirm(`Remove ${repo} from the repo blocklist?`)) return;
        this.error.set(null);
        try {
            await this.service.removeEntry(repo);
        } catch {
            this.error.set('Failed to remove repo');
            await this.service.loadEntries();
        }
    }
}
