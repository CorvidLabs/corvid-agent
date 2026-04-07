import { Component, ChangeDetectionStrategy, Input, signal } from '@angular/core';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-environment-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Environment
            </h3>
            @if (!collapsed()) {
                <div class="env-grid section-collapse">
                    <div class="env-item">
                        <span class="env-key">ANTHROPIC_API_KEY</span>
                        <span class="env-value env-value--set">Configured</span>
                    </div>
                    <div class="env-item">
                        <span class="env-key">OPENROUTER_API_KEY</span>
                        <span class="env-value" [class.env-value--set]="openrouterStatus?.status === 'available'" [class.env-value--unset]="openrouterStatus?.status !== 'available'">
                            {{ openrouterStatus?.status === 'available' ? 'Configured' : 'Not set' }}
                        </span>
                    </div>
                    <div class="env-item">
                        <span class="env-key">DISCORD_TOKEN</span>
                        <span class="env-value" [class.env-value--set]="!!discordConfig" [class.env-value--unset]="!discordConfig">
                            {{ discordConfig ? 'Configured' : 'Not set' }}
                        </span>
                    </div>
                    <div class="env-item">
                        <span class="env-key">GITHUB_TOKEN</span>
                        <span class="env-value env-value--set">Configured</span>
                    </div>
                </div>
                <p class="env-hint">Environment variables are set in your <code>.env</code> file or system environment. Restart the server after changes.</p>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .env-grid { display: flex; flex-direction: column; gap: 0.35rem; }
        .env-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.45rem 0.65rem; background: var(--bg-raised); border-radius: var(--radius);
        }
        .env-key { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
        .env-value { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .env-value--set { color: var(--accent-green); }
        .env-value--unset { color: var(--text-tertiary); }
        .env-hint { font-size: 0.65rem; color: var(--text-tertiary); margin-top: 0.5rem; }
        .env-hint code { background: var(--bg-raised); padding: 1px 4px; border-radius: 3px; font-size: 0.6rem; border: 1px solid var(--border); }
    `,
})
export class EnvironmentSettingsComponent {
    @Input() openrouterStatus: { status: string } | null = null;
    @Input() discordConfig: Record<string, string> | null = null;

    readonly collapsed = signal(false);

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }
}
