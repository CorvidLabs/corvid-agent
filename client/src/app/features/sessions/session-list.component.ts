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
                                @if (session.totalCostUsd > 0) {
                                    <span>{{ session.totalCostUsd | number:'1.4-4' }} USD</span>
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
        .page__header h2 { margin: 0; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; }
        .btn--primary { background: #3b82f6; color: #fff; }
        .empty { color: #64748b; }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        .list__item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 1rem; background: #fff; border: 1px solid #e2e8f0;
            border-radius: 8px; text-decoration: none; color: inherit;
            transition: border-color 0.15s;
        }
        .list__item:hover { border-color: #3b82f6; }
        .list__item-title { margin: 0 0 0.25rem; font-size: 1rem; }
        .list__item-desc { margin: 0; color: #64748b; font-size: 0.85rem; }
        .list__item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; font-size: 0.8rem; color: #94a3b8; }
    `,
})
export class SessionListComponent implements OnInit {
    protected readonly sessionService = inject(SessionService);

    ngOnInit(): void {
        this.sessionService.loadSessions();
    }
}
