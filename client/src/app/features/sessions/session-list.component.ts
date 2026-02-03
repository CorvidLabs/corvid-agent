import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { DecimalPipe, SlicePipe } from '@angular/common';

@Component({
    selector: 'app-session-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, StatusBadgeComponent, RelativeTimePipe, DecimalPipe, SlicePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Sessions</h2>
                <a class="btn btn--primary" routerLink="/sessions/new">New Session</a>
            </div>

            @if (sessionService.loading()) {
                <p>Loading...</p>
            } @else if (sessionService.sessions().length === 0) {
                <p class="empty">No sessions yet.</p>
            } @else {
                <div class="list" role="list">
                    @for (session of sessionService.sessions(); track session.id) {
                        <a
                            class="list__item"
                            role="listitem"
                            [routerLink]="['/sessions', session.id]">
                            <div class="list__item-main">
                                <h3 class="list__item-title">{{ session.name || session.id.slice(0, 8) }}</h3>
                                <p class="list__item-desc">{{ session.initialPrompt | slice:0:100 }}</p>
                            </div>
                            <div class="list__item-meta">
                                <app-status-badge [status]="session.status" />
                                <span>{{ session.source }}</span>
                                @if (session.totalAlgoSpent > 0) {
                                    <span>{{ session.totalAlgoSpent / 1000000 | number:'1.3-6' }} ALGO</span>
                                }
                                <span>{{ session.updatedAt | relativeTime }}</span>
                            </div>
                        </a>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .empty { color: var(--text-tertiary); }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); text-decoration: none; color: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .list__item:hover { border-color: var(--accent-cyan); box-shadow: 0 0 12px rgba(0, 229, 255, 0.08); }
        .list__item-title { margin: 0 0 0.25rem; font-size: 0.95rem; color: var(--text-primary); }
        .list__item-desc { margin: 0; color: var(--text-secondary); font-size: 0.8rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.75rem; color: var(--text-tertiary); }
    `,
})
export class SessionListComponent implements OnInit {
    protected readonly sessionService = inject(SessionService);

    ngOnInit(): void {
        this.sessionService.loadSessions();
    }
}
