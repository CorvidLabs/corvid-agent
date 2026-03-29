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
            transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .status-badge--idle { background: var(--bg-raised); color: var(--text-secondary); border-color: var(--border-bright); }
        .status-badge--loading { background: var(--accent-cyan-dim, var(--accent-cyan-dim)); color: var(--accent-cyan, #00c8ff); border-color: var(--accent-cyan-border); }
        .status-badge--running { background: var(--accent-green-dim); color: var(--accent-green); border-color: var(--accent-green-border); box-shadow: 0 0 6px rgba(52, 211, 153, 0.15); }
        .status-badge--thinking { background: var(--accent-purple-dim, var(--accent-purple-subtle)); color: var(--accent-purple, #a855f7); border-color: var(--accent-purple-border); animation: statusPulse 1.5s ease-in-out infinite; }
        .status-badge--tool_use { background: var(--accent-cyan-dim, var(--accent-cyan-dim)); color: var(--accent-cyan, #00c8ff); border-color: var(--accent-cyan-border); animation: statusPulse 1s ease-in-out infinite; }
        @keyframes statusPulse {
            0%, 100% { opacity: 1; box-shadow: none; transform: scale(1); }
            50% { opacity: 0.8; box-shadow: 0 0 8px 2px currentColor; transform: scale(1.04); }
        }
        .status-badge--paused { background: var(--accent-amber-dim); color: var(--accent-amber); border-color: var(--accent-amber-border); }
        .status-badge--stopped { background: var(--bg-raised); color: var(--text-tertiary); border-color: var(--border); }
        .status-badge--error { background: var(--accent-red-dim); color: var(--accent-red); border-color: var(--accent-red-border); }
        .status-badge--queued { background: var(--accent-amber-dim); color: var(--accent-yellow, #fbbf24); border-color: var(--accent-amber-border); }
        .status-badge--completed { background: var(--accent-green-dim); color: var(--accent-green); border-color: var(--accent-green-border); }
        .status-badge--failed { background: var(--accent-red-dim); color: var(--accent-red); border-color: var(--accent-red-border); }
        .status-badge--pending { background: var(--accent-amber-dim); color: var(--accent-amber); border-color: var(--accent-amber-border); }
        .status-badge--branching,
        .status-badge--validating { background: var(--accent-cyan-dim, var(--accent-cyan-dim)); color: var(--accent-cyan, #00c8ff); border-color: var(--accent-cyan-border); animation: statusPulse 1.5s ease-in-out infinite; }
        .status-badge--cancelled { background: var(--bg-raised); color: var(--text-tertiary); border-color: var(--border); }
        .status-badge--active { background: var(--accent-green-dim); color: var(--accent-green); border-color: var(--accent-green-border); box-shadow: 0 0 6px rgba(52, 211, 153, 0.15); }
        .status-badge--connected { background: var(--accent-green-dim); color: var(--accent-green); border-color: var(--accent-green-border); box-shadow: 0 0 6px rgba(52, 211, 153, 0.15); }
        .status-badge--disconnected { background: var(--accent-red-dim); color: var(--accent-red); border-color: var(--accent-red-border); }
    `,
})
export class StatusBadgeComponent {
    readonly status = input.required<string>();
}
