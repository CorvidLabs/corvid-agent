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
            background: #1e293b;
            color: #f8fafc;
            border-bottom: 1px solid #334155;
        }
        .header__title {
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0;
        }
        .header__status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .header__label {
            font-size: 0.8rem;
            color: #94a3b8;
        }
    `,
})
export class HeaderComponent {
    protected readonly wsService = inject(WebSocketService);
}
