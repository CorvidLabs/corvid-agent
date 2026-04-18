import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AllowlistComponent } from './allowlist.component';
import { GitHubAllowlistComponent } from './github-allowlist.component';
import { RepoBlocklistComponent } from './repo-blocklist.component';

type AccessSection = 'allowlist' | 'github' | 'repos';

@Component({
    selector: 'app-settings-access',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AllowlistComponent, GitHubAllowlistComponent, RepoBlocklistComponent, MatButtonToggleModule],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" aria-label="Access control sections">
                <mat-button-toggle-group [value]="section()" (change)="section.set($event.value)" hideSingleSelectionIndicator>
                    <mat-button-toggle value="allowlist">Allowlist</mat-button-toggle>
                    <mat-button-toggle value="github">GitHub Allowlist</mat-button-toggle>
                    <mat-button-toggle value="repos">Repo Blocklist</mat-button-toggle>
                </mat-button-toggle-group>
            </div>
            <div class="settings-section__content">
                @switch (section()) {
                    @case ('allowlist') { <app-allowlist /> }
                    @case ('github') { <app-github-allowlist /> }
                    @case ('repos') { <app-repo-blocklist /> }
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
export class SettingsAccessComponent {
    readonly section = signal<AccessSection>('allowlist');
}
