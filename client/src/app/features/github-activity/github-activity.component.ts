import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitHubActivityService } from '../../core/services/github-activity.service';

type Tab = 'events' | 'prs' | 'issues' | 'ci';

@Component({
    selector: 'app-github-activity',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, FormsModule],
    template: `
        <div class="gh">
            <div class="gh__header">
                <h2>GitHub Activity</h2>
                <div class="gh__repo-input">
                    <input
                        [(ngModel)]="ownerInput"
                        placeholder="owner"
                        class="gh__input gh__input--small"
                        (keydown.enter)="refresh()" />
                    <span class="gh__slash">/</span>
                    <input
                        [(ngModel)]="repoInput"
                        placeholder="repo"
                        class="gh__input"
                        (keydown.enter)="refresh()" />
                    <button class="gh__btn" (click)="refresh()">Load</button>
                </div>
            </div>

            @if (svc.loading()) {
                <p class="gh__loading">Loading activity data...</p>
            } @else if (svc.summary()) {
                <div class="gh__cards">
                    <div class="gh__card">
                        <span class="gh__card-label">Open PRs</span>
                        <span class="gh__card-value gh__card-value--cyan">{{ svc.summary()!.openPRs }}</span>
                    </div>
                    <div class="gh__card">
                        <span class="gh__card-label">Open Issues</span>
                        <span class="gh__card-value gh__card-value--yellow">{{ svc.summary()!.openIssues }}</span>
                    </div>
                    <div class="gh__card">
                        <span class="gh__card-label">Recent Commits</span>
                        <span class="gh__card-value">{{ svc.summary()!.recentCommits }}</span>
                    </div>
                    <div class="gh__card">
                        <span class="gh__card-label">CI Pass Rate</span>
                        <span class="gh__card-value" [class.gh__card-value--green]="svc.summary()!.ciPassRate >= 80"
                              [class.gh__card-value--red]="svc.summary()!.ciPassRate < 80 && svc.summary()!.ciPassRate > 0">
                            {{ svc.summary()!.ciPassRate }}%
                        </span>
                    </div>
                </div>
            }

            <div class="gh__tabs">
                <button class="gh__tab" [class.gh__tab--active]="activeTab() === 'events'" (click)="activeTab.set('events')">Events</button>
                <button class="gh__tab" [class.gh__tab--active]="activeTab() === 'prs'" (click)="activeTab.set('prs')">Pull Requests</button>
                <button class="gh__tab" [class.gh__tab--active]="activeTab() === 'issues'" (click)="activeTab.set('issues')">Issues</button>
                <button class="gh__tab" [class.gh__tab--active]="activeTab() === 'ci'" (click)="switchToCi()">CI Runs</button>
            </div>

            <div class="gh__content">
                @switch (activeTab()) {
                    @case ('events') {
                        @if (svc.events().length === 0) {
                            <p class="gh__empty">No recent events</p>
                        } @else {
                            <ul class="gh__list">
                                @for (event of svc.events(); track event.id) {
                                    <li class="gh__item">
                                        <span class="gh__event-type" [attr.data-type]="event.type">{{ eventLabel(event.type) }}</span>
                                        <span class="gh__event-actor">{{ event.actor }}</span>
                                        @if (event.type === 'PushEvent') {
                                            <span class="gh__event-detail">pushed {{ event.commits }} commit{{ event.commits === 1 ? '' : 's' }} to {{ event.ref }}</span>
                                        } @else if (event.title) {
                                            <span class="gh__event-detail">
                                                {{ event.action }}
                                                @if (event.url) {
                                                    <a [href]="event.url" target="_blank" rel="noopener">#{{ event.number }} {{ event.title }}</a>
                                                } @else {
                                                    #{{ event.number }} {{ event.title }}
                                                }
                                            </span>
                                        } @else {
                                            <span class="gh__event-detail">{{ event.action ?? event.type }}</span>
                                        }
                                        <span class="gh__time">{{ event.createdAt | date:'short' }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    }
                    @case ('prs') {
                        @if (svc.prs().length === 0) {
                            <p class="gh__empty">No open pull requests</p>
                        } @else {
                            <ul class="gh__list">
                                @for (pr of svc.prs(); track pr.number) {
                                    <li class="gh__item">
                                        <a [href]="pr.url" target="_blank" rel="noopener" class="gh__pr-title">
                                            #{{ pr.number }} {{ pr.title }}
                                        </a>
                                        <span class="gh__meta">
                                            by {{ pr.author }}
                                            @if (pr.draft) { <span class="gh__badge gh__badge--draft">draft</span> }
                                            @for (label of pr.labels; track label) {
                                                <span class="gh__badge">{{ label }}</span>
                                            }
                                        </span>
                                        <span class="gh__time">{{ pr.updatedAt | date:'short' }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    }
                    @case ('issues') {
                        @if (svc.issues().length === 0) {
                            <p class="gh__empty">No open issues</p>
                        } @else {
                            <ul class="gh__list">
                                @for (issue of svc.issues(); track issue.number) {
                                    <li class="gh__item">
                                        <a [href]="issue.url" target="_blank" rel="noopener" class="gh__pr-title">
                                            #{{ issue.number }} {{ issue.title }}
                                        </a>
                                        <span class="gh__meta">
                                            by {{ issue.author }}
                                            @for (label of issue.labels; track label) {
                                                <span class="gh__badge">{{ label }}</span>
                                            }
                                        </span>
                                        <span class="gh__time">{{ issue.updatedAt | date:'short' }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    }
                    @case ('ci') {
                        @if (ciLoading()) {
                            <p class="gh__loading">Loading CI runs...</p>
                        } @else if (svc.runs().length === 0) {
                            <p class="gh__empty">No recent CI runs</p>
                        } @else {
                            <ul class="gh__list">
                                @for (run of svc.runs(); track run.id) {
                                    <li class="gh__item">
                                        <span class="gh__ci-status" [attr.data-conclusion]="run.conclusion || run.status">
                                            {{ run.conclusion || run.status }}
                                        </span>
                                        <a [href]="run.url" target="_blank" rel="noopener" class="gh__pr-title">
                                            {{ run.name }}
                                        </a>
                                        <span class="gh__meta">{{ run.branch }}</span>
                                        <span class="gh__time">{{ run.createdAt | date:'short' }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    }
                }
            </div>
        </div>
    `,
    styles: `
        .gh { padding: 1.5rem; max-width: 900px; }
        .gh__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        .gh__header h2 { margin: 0; color: var(--text-primary); }
        .gh__repo-input {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }
        .gh__slash { color: var(--text-tertiary); font-size: 1.1rem; }
        .gh__input {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 0.4rem 0.6rem;
            border-radius: 4px;
            font-size: 0.85rem;
            width: 140px;
        }
        .gh__input--small { width: 100px; }
        .gh__input:focus { outline: 1px solid var(--accent-cyan); border-color: var(--accent-cyan); }
        .gh__btn {
            background: var(--accent-cyan);
            color: var(--bg-base);
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 4px;
            font-size: 0.85rem;
            cursor: pointer;
            font-weight: 600;
            margin-left: 0.5rem;
        }
        .gh__btn:hover { opacity: 0.85; }
        .gh__loading, .gh__empty {
            color: var(--text-secondary);
            padding: 2rem;
            text-align: center;
        }

        /* Summary cards */
        .gh__cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .gh__card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 1rem;
            text-align: center;
        }
        .gh__card-label {
            display: block;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-tertiary);
            margin-bottom: 0.4rem;
        }
        .gh__card-value {
            font-size: 1.6rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .gh__card-value--cyan { color: var(--accent-cyan); }
        .gh__card-value--yellow { color: var(--accent-yellow, #fbbf24); }
        .gh__card-value--green { color: var(--accent-green); }
        .gh__card-value--red { color: var(--accent-red); }

        /* Tabs */
        .gh__tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--border);
            margin-bottom: 1rem;
        }
        .gh__tab {
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            padding: 0.6rem 1rem;
            font-size: 0.85rem;
            cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
        }
        .gh__tab:hover { color: var(--text-primary); }
        .gh__tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }

        /* List items */
        .gh__list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .gh__item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.6rem 0.75rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.85rem;
            flex-wrap: wrap;
        }
        .gh__item:last-child { border-bottom: none; }

        /* Event type badges */
        .gh__event-type {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 0.15rem 0.4rem;
            border-radius: 3px;
            background: var(--bg-raised);
            color: var(--text-secondary);
            min-width: 60px;
            text-align: center;
            flex-shrink: 0;
        }
        .gh__event-type[data-type="PushEvent"] { color: var(--accent-green); }
        .gh__event-type[data-type="PullRequestEvent"] { color: var(--accent-cyan); }
        .gh__event-type[data-type="IssuesEvent"] { color: var(--accent-yellow, #fbbf24); }
        .gh__event-type[data-type="ReleaseEvent"] { color: var(--accent-magenta, #c084fc); }
        .gh__event-type[data-type="CreateEvent"] { color: var(--accent-green); }
        .gh__event-type[data-type="DeleteEvent"] { color: var(--accent-red); }

        .gh__event-actor {
            color: var(--accent-cyan);
            font-weight: 500;
            flex-shrink: 0;
        }
        .gh__event-detail {
            color: var(--text-secondary);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .gh__event-detail a {
            color: var(--text-primary);
            text-decoration: none;
        }
        .gh__event-detail a:hover { text-decoration: underline; }

        .gh__pr-title {
            color: var(--text-primary);
            text-decoration: none;
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .gh__pr-title:hover { text-decoration: underline; color: var(--accent-cyan); }

        .gh__meta {
            color: var(--text-tertiary);
            font-size: 0.8rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            flex-shrink: 0;
        }
        .gh__badge {
            font-size: 0.65rem;
            padding: 0.1rem 0.35rem;
            border-radius: 3px;
            background: var(--bg-raised);
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }
        .gh__badge--draft { color: var(--accent-yellow, #fbbf24); border-color: var(--accent-yellow, #fbbf24); }

        .gh__time {
            color: var(--text-tertiary);
            font-size: 0.75rem;
            flex-shrink: 0;
            margin-left: auto;
        }

        /* CI status */
        .gh__ci-status {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            padding: 0.15rem 0.5rem;
            border-radius: 3px;
            min-width: 70px;
            text-align: center;
            flex-shrink: 0;
        }
        .gh__ci-status[data-conclusion="success"] { color: var(--accent-green); background: rgba(34,197,94,0.1); }
        .gh__ci-status[data-conclusion="failure"] { color: var(--accent-red); background: rgba(239,68,68,0.1); }
        .gh__ci-status[data-conclusion="cancelled"] { color: var(--text-tertiary); background: var(--bg-raised); }
        .gh__ci-status[data-conclusion="in_progress"] { color: var(--accent-cyan); background: rgba(0,229,255,0.1); }
        .gh__ci-status[data-conclusion="queued"] { color: var(--accent-yellow, #fbbf24); background: rgba(251,191,36,0.1); }

        @media (max-width: 600px) {
            .gh { padding: 1rem; }
            .gh__header { flex-direction: column; align-items: flex-start; }
            .gh__cards { grid-template-columns: repeat(2, 1fr); }
            .gh__item { font-size: 0.8rem; gap: 0.5rem; }
        }
    `,
})
export class GitHubActivityComponent implements OnInit {
    protected readonly svc = inject(GitHubActivityService);

    ownerInput = 'CorvidLabs';
    repoInput = 'corvid-agent';
    readonly activeTab = signal<Tab>('events');
    readonly ciLoading = signal(false);

    ngOnInit(): void {
        this.refresh();
    }

    refresh(): void {
        const owner = this.ownerInput.trim();
        const repo = this.repoInput.trim();
        if (!owner || !repo) return;
        this.svc.loadAll(owner, repo);
    }

    async switchToCi(): Promise<void> {
        this.activeTab.set('ci');
        const owner = this.ownerInput.trim();
        const repo = this.repoInput.trim();
        if (!owner || !repo) return;
        this.ciLoading.set(true);
        try {
            await this.svc.loadRuns(owner, repo);
        } finally {
            this.ciLoading.set(false);
        }
    }

    eventLabel(type: string): string {
        const labels: Record<string, string> = {
            PushEvent: 'Push',
            PullRequestEvent: 'PR',
            IssuesEvent: 'Issue',
            ReleaseEvent: 'Release',
            CreateEvent: 'Create',
            DeleteEvent: 'Delete',
            WatchEvent: 'Star',
            ForkEvent: 'Fork',
            IssueCommentEvent: 'Comment',
            PullRequestReviewEvent: 'Review',
            PullRequestReviewCommentEvent: 'Review',
        };
        return labels[type] ?? type.replace('Event', '');
    }
}
