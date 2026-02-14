import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
    selector: 'app-status-badge',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <span
            class="status-badge"
            [class]="'status-badge--' + status()"
            [attr.aria-label]="'Status: ' + status()">
            {{ status() }}
        </span>
    `,
    styles: `
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border: 1px solid;
        }
        .status-badge--idle { background: var(--bg-raised); color: var(--text-secondary); border-color: var(--border-bright); }
        .status-badge--running { background: var(--accent-green-dim); color: var(--accent-green); border-color: rgba(0, 255, 136, 0.3); }
        .status-badge--paused { background: var(--accent-amber-dim); color: var(--accent-amber); border-color: rgba(255, 170, 0, 0.3); }
        .status-badge--stopped { background: var(--bg-raised); color: var(--text-tertiary); border-color: var(--border); }
        .status-badge--error { background: var(--accent-red-dim); color: var(--accent-red); border-color: rgba(255, 51, 85, 0.3); }
        .status-badge--queued { background: rgba(251, 191, 36, 0.1); color: var(--accent-yellow, #fbbf24); border-color: rgba(251, 191, 36, 0.3); }
        .status-badge--connected { background: var(--accent-green-dim); color: var(--accent-green); border-color: rgba(0, 255, 136, 0.3); }
        .status-badge--disconnected { background: var(--accent-red-dim); color: var(--accent-red); border-color: rgba(255, 51, 85, 0.3); }
    `,
})
export class StatusBadgeComponent {
    readonly status = input.required<string>();
}
