import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { WebSocketService } from '../../core/services/websocket.service';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
    selector: 'app-header',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent],
    template: `
        <header class="header" role="banner">
            <div class="header__brand">
                <h1 class="header__title">CorvidAgent</h1>
            </div>
            <div class="header__status">
                <span class="header__label">WebSocket:</span>
                <app-status-badge [status]="wsService.connectionStatus()" />
            </div>
        </header>
    `,
    styles: `
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.5rem;
            height: 56px;
            background: var(--bg-surface);
            color: var(--text-primary);
            border-bottom: 1px solid var(--border);
        }
        .header__title {
            font-family: 'Share Tech Mono', 'JetBrains Mono', monospace;
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0;
            color: var(--accent-cyan);
            text-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
            letter-spacing: 0.08em;
        }
        .header__status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .header__label {
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
    `,
})
export class HeaderComponent {
    protected readonly wsService = inject(WebSocketService);
}
