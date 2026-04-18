import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SecurityOverviewComponent } from './security-overview.component';
import { WalletViewerComponent } from './wallet-viewer.component';
import { SpendingComponent } from './spending.component';

type SecuritySection = 'overview' | 'wallets' | 'spending';

@Component({
    selector: 'app-settings-security',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SecurityOverviewComponent, WalletViewerComponent, SpendingComponent, MatButtonToggleModule],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" aria-label="Security sections">
                <mat-button-toggle-group [value]="section()" (change)="section.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle value="overview">Security</mat-button-toggle>
                    <mat-button-toggle value="wallets">Wallets</mat-button-toggle>
                    <mat-button-toggle value="spending">Spending</mat-button-toggle>
                </mat-button-toggle-group>
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
        .settings-section__content {
            flex: 1;
            overflow-y: auto;
        }
    `,
})
export class SettingsSecurityComponent {
    readonly section = signal<SecuritySection>('overview');
}
