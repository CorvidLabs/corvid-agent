import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

@Component({
    selector: 'app-status-badge',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <span
            class="status-badge"
            [class.status-badge--idle]="status() === 'idle'"
            [class.status-badge--loading]="status() === 'loading'"
            [class.status-badge--running]="status() === 'running'"
            [class.status-badge--thinking]="status() === 'thinking'"
            [class.status-badge--tool_use]="status() === 'tool_use'"
            [class.status-badge--paused]="status() === 'paused'"
            [class.status-badge--stopped]="status() === 'stopped'"
            [class.status-badge--error]="status() === 'error'"
            [class.status-badge--queued]="status() === 'queued'"
            [class.status-badge--connected]="status() === 'connected'"
            [class.status-badge--disconnected]="status() === 'disconnected'"
            [attr.aria-label]="'Status: ' + status()">
            {{ statusLabel() }}
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
        .status-badge--loading { background: var(--accent-cyan-dim, rgba(0, 200, 255, 0.1)); color: var(--accent-cyan, #00c8ff); border-color: rgba(0, 200, 255, 0.3); }
        .status-badge--running { background: var(--accent-green-dim); color: var(--accent-green); border-color: rgba(0, 255, 136, 0.3); }
        .status-badge--thinking { background: var(--accent-purple-dim, rgba(168, 85, 247, 0.1)); color: var(--accent-purple, #a855f7); border-color: rgba(168, 85, 247, 0.3); animation: pulse 1.5s ease-in-out infinite; }
        .status-badge--tool_use { background: var(--accent-cyan-dim, rgba(0, 200, 255, 0.1)); color: var(--accent-cyan, #00c8ff); border-color: rgba(0, 200, 255, 0.3); animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
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

    /** Human-readable label with underscores replaced by spaces */
    protected readonly statusLabel = computed(() => this.status().replace(/_/g, ' '));
}
