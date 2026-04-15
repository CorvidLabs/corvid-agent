import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { SecurityOverviewComponent } from './security-overview.component';
import { WalletViewerComponent } from './wallet-viewer.component';
import { SpendingComponent } from './spending.component';

type SecuritySection = 'overview' | 'wallets' | 'spending';

@Component({
    selector: 'app-settings-security',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SecurityOverviewComponent, WalletViewerComponent, SpendingComponent],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" role="tablist" aria-label="Security sections">
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'overview'"
                    (click)="section.set('overview')"
                    role="tab">
                    Security
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'wallets'"
                    (click)="section.set('wallets')"
                    role="tab">
                    Wallets
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'spending'"
                    (click)="section.set('spending')"
                    role="tab">
                    Spending
                </button>
            </div>
            <div class="settings-section__content">
                @switch (section()) {
                    @case ('overview') { <app-security-overview /> }
                    @case ('wallets') { <app-wallet-viewer /> }
                    @case ('spending') { <app-spending /> }
                }
            </div>
        </div>
    `,
    styles: `
        .settings-section {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .settings-section__nav {
            display: flex;
            gap: 0;
            padding: 0 var(--space-4);
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.2);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings-section__nav::-webkit-scrollbar { display: none; }
        .settings-section__btn {
            padding: var(--space-2) 0.85rem;
            font-size: 0.72rem;
            font-weight: 600;
            font-family: inherit;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            white-space: nowrap;
            transition: color 0.15s, border-color 0.15s;
        }
        .settings-section__btn:hover {
            color: var(--text-primary);
        }
        .settings-section__btn--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }
        .settings-section__content {
            flex: 1;
            overflow-y: auto;
        }
    `,
})
export class SettingsSecurityComponent {
    readonly section = signal<SecuritySection>('overview');
}
