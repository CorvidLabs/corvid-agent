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
            gap: clamp(var(--space-2), 1vw, var(--space-4));
            padding: var(--space-2) clamp(var(--space-3), 2vw, var(--space-5));
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.15);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            margin-bottom: var(--space-5);
        }
        .settings-section__nav::-webkit-scrollbar { display: none; }
        .settings-section__btn {
            padding: var(--space-3) clamp(var(--space-3), 1.5vw, var(--space-6));
            font-size: var(--text-base);
            font-weight: 600;
            font-family: var(--font-body);
            letter-spacing: 0.02em;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            white-space: nowrap;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
            border-radius: var(--radius) var(--radius) 0 0;
            min-height: 44px;
        }
        .settings-section__btn:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
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
