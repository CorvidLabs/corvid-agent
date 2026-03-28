import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { McpServerListComponent } from '../mcp-servers/mcp-server-list.component';
import { ContactListComponent } from '../contacts/contact-list.component';
import { MarketplaceComponent } from '../marketplace/marketplace.component';

type IntegrationsSection = 'mcp' | 'contacts' | 'marketplace';

@Component({
    selector: 'app-settings-integrations',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [McpServerListComponent, ContactListComponent, MarketplaceComponent],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" role="tablist" aria-label="Integrations sections">
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'mcp'"
                    (click)="section.set('mcp')"
                    role="tab">
                    MCP Servers
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'contacts'"
                    (click)="section.set('contacts')"
                    role="tab">
                    Contacts
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'marketplace'"
                    (click)="section.set('marketplace')"
                    role="tab">
                    Marketplace
                </button>
            </div>
            <div class="settings-section__content">
                @switch (section()) {
                    @case ('mcp') { <app-mcp-server-list /> }
                    @case ('contacts') { <app-contact-list /> }
                    @case ('marketplace') { <app-marketplace /> }
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
            padding: 0 1rem;
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.2);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings-section__nav::-webkit-scrollbar { display: none; }
        .settings-section__btn {
            padding: 0.5rem 0.85rem;
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
export class SettingsIntegrationsComponent {
    readonly section = signal<IntegrationsSection>('mcp');
}
