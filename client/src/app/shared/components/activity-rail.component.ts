import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    OnInit,
    OnDestroy,
    computed,
    effect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from './status-badge.component';
import { ResizeHandleComponent } from './resize-handle.component';
import type { Session } from '../../core/models/session.model';

@Component({
    selector: 'app-activity-rail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, StatusBadgeComponent, ResizeHandleComponent],
    template: `
        @if (open()) {
            <app-resize-handle position="left" (resized)="onResize($event)" (resizeEnd)="onResizeEnd()" />
        }
        <aside
            class="rail"
            [class.rail--open]="open()"
            [style.width.px]="effectiveWidth()"
            [style.min-width.px]="effectiveWidth()"
            role="complementary"
            aria-label="Activity panel">
            <button
                class="rail__toggle"
                (click)="toggle()"
                [attr.aria-expanded]="open()"
                [attr.title]="open() ? 'Collapse activity' : 'Show activity'"
                type="button">
                {{ open() ? '\u00BB' : '\u00AB' }}
            </button>

            @if (open()) {
                <div class="rail__content">
                    <div class="rail__section">
                        <h3 class="rail__heading">Active Sessions</h3>
                        @if (activeSessions().length === 0) {
                            <p class="rail__empty">No active sessions</p>
                        }
                        @for (session of activeSessions(); track session.id) {
                            <a class="rail__item" [routerLink]="['/sessions', session.id]">
                                <div class="rail__item-top">
                                    <span class="rail__item-name">{{ session.name || 'Session' }}</span>
                                    <app-status-badge [status]="session.status" />
                                </div>
                            </a>
                        }
                    </div>

                    <div class="rail__section">
                        <h3 class="rail__heading">System</h3>
                        <div class="rail__stat">
                            <span class="rail__stat-label">WebSocket</span>
                            <app-status-badge [status]="wsService.connectionStatus()" />
                        </div>
                        <div class="rail__stat">
                            <span class="rail__stat-label">Sessions</span>
                            <span class="rail__stat-value">{{ sessionCount() }}</span>
                        </div>
                    </div>
                </div>
            }
        </aside>
    `,
    styles: `
        :host {
            display: flex;
            flex-shrink: 0;
        }
        .rail {
            width: 100%;
            min-width: 0;
            background: var(--glass-bg-solid);
            border-left: 1px solid var(--border-subtle);
            display: flex;
            flex-direction: column;
            transition: width 0.2s ease, min-width 0.2s ease;
            overflow: hidden;
        }
        .rail--open {
            /* width controlled by [style.width.px] binding */
        }
        .rail__toggle {
            width: 100%;
            padding: 0.6rem;
            background: none;
            border: none;
            border-bottom: 1px solid var(--border);
            color: var(--text-tertiary);
            font-size: 0.85rem;
            font-family: inherit;
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
        }
        .rail__toggle:hover {
            color: var(--accent-cyan);
            background: var(--bg-hover);
        }
        .rail__content {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-2) 0;
        }
        .rail__section {
            padding: var(--space-2) var(--space-3);
            border-bottom: 1px solid var(--border);
        }
        .rail__section:last-child {
            border-bottom: none;
        }
        .rail__heading {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-tertiary);
            font-weight: 700;
            margin: 0 0 0.5rem;
        }
        .rail__empty {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            margin: 0;
            padding: var(--space-1) 0;
        }
        .rail__item {
            display: block;
            padding: 0.4rem var(--space-2);
            margin: 0.2rem 0;
            border-radius: var(--radius);
            text-decoration: none;
            color: var(--text-secondary);
            transition: background 0.1s;
        }
        .rail__item:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }
        .rail__item-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.4rem;
        }
        .rail__item-name {
            font-size: 0.72rem;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .rail__stat {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.3rem 0;
        }
        .rail__stat-label {
            font-size: 0.68rem;
            color: var(--text-secondary);
        }
        .rail__stat-value {
            font-size: 0.68rem;
            color: var(--text-primary);
            font-weight: 600;
        }

        @media (max-width: 767px) {
            .rail { display: none; }
        }
    `,
})
export class ActivityRailComponent implements OnInit, OnDestroy {
    protected readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);

    protected readonly open = signal(
        typeof localStorage !== 'undefined' && localStorage.getItem('activity_rail_open') === 'true',
    );

    /** Custom width for open state — persisted */
    protected readonly customWidth = signal(this.loadWidth());

    /** Effective width considering open/closed state */
    protected readonly effectiveWidth = computed(() => this.open() ? this.customWidth() : 36);

    private interval: ReturnType<typeof setInterval> | null = null;

    protected readonly activeSessions = computed(() => {
        const sessions = this.sessionService.sessions();
        return sessions
            .filter((s) => s.status === 'running' || s.status === 'thinking' || s.status === 'tool_use')
            .slice(0, 10);
    });

    protected readonly sessionCount = computed(() => {
        return this.sessionService.sessions().length;
    });

    constructor() {
        // Persist rail open/closed state
        effect(() => {
            const isOpen = this.open();
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('activity_rail_open', String(isOpen));
            }
        });
    }

    ngOnInit(): void {
        this.sessionService.loadSessions();
        this.interval = setInterval(() => {
            this.sessionService.loadSessions();
        }, 15000);
    }

    ngOnDestroy(): void {
        if (this.interval) clearInterval(this.interval);
    }

    protected toggle(): void {
        this.open.set(!this.open());
    }

    protected onResize(delta: number): void {
        const current = this.customWidth();
        const next = Math.max(180, Math.min(500, current + delta));
        this.customWidth.set(next);
    }

    protected onResizeEnd(): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('activity_rail_width', String(this.customWidth()));
        }
    }

    private loadWidth(): number {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('activity_rail_width');
            if (stored) {
                const val = parseInt(stored, 10);
                if (!isNaN(val) && val >= 180 && val <= 500) return val;
            }
        }
        return 260;
    }
}
