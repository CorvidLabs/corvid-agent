import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

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
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .status-badge--idle { background: #e2e8f0; color: #475569; }
        .status-badge--running { background: #dcfce7; color: #166534; }
        .status-badge--paused { background: #fef3c7; color: #92400e; }
        .status-badge--stopped { background: #f1f5f9; color: #64748b; }
        .status-badge--error { background: #fecaca; color: #991b1b; }
        .status-badge--connected { background: #dcfce7; color: #166534; }
        .status-badge--disconnected { background: #fecaca; color: #991b1b; }
    `,
})
export class StatusBadgeComponent {
    readonly status = input.required<string>();
}
