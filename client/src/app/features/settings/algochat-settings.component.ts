import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SessionService } from '../../core/services/session.service';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-algochat-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                AlgoChat
            </h3>
            @if (!collapsed()) {
                @if (algochatStatus(); as status) {
                    <div class="info-grid section-collapse">
                        <div class="info-item">
                            <span class="info-label">Status</span>
                            <span class="info-value" [class.info-value--active]="status.enabled" [class.info-value--inactive]="!status.enabled">
                                {{ status.enabled ? 'Connected' : 'Disconnected' }}
                            </span>
                        </div>
                        @if (status.address && status.address !== 'local') {
                            <div class="info-item">
                                <span class="info-label">Address</span>
                                <code class="info-code">{{ status.address }}</code>
                            </div>
                        }
                        <div class="info-item">
                            <span class="info-label">Network</span>
                            <span class="info-value network-badge" [attr.data-network]="status.network">{{ status.network }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Server Balance</span>
                            <span class="info-value" [class.algo-balance--low]="status.balance < 1000000">
                                {{ status.balance / 1000000 | number:'1.2-4' }} ALGO
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Active Chats</span>
                            <span class="info-value">{{ status.activeConversations }}</span>
                        </div>
                    </div>
                } @else {
                    <p class="muted">AlgoChat not configured</p>
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .network-badge { text-transform: uppercase; font-size: 0.75rem; }
        .network-badge[data-network="testnet"] { color: var(--network-testnet); }
        .network-badge[data-network="mainnet"] { color: var(--network-mainnet); }
        .network-badge[data-network="localnet"] { color: var(--accent-gold); }
        .algo-balance--low { color: var(--accent-red) !important; }
    `,
})
export class AlgochatSettingsComponent {
    private readonly sessionService = inject(SessionService);

    readonly algochatStatus = this.sessionService.algochatStatus;
    readonly collapsed = signal(false);

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }
}
