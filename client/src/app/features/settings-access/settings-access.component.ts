import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { AllowlistComponent } from '../allowlist/allowlist.component';
import { GitHubAllowlistComponent } from '../github-allowlist/github-allowlist.component';
import { RepoBlocklistComponent } from '../repo-blocklist/repo-blocklist.component';

type AccessSection = 'allowlist' | 'github' | 'repos';

@Component({
    selector: 'app-settings-access',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AllowlistComponent, GitHubAllowlistComponent, RepoBlocklistComponent],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" role="tablist" aria-label="Access control sections">
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'allowlist'"
                    (click)="section.set('allowlist')"
                    role="tab">
                    Allowlist
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'github'"
                    (click)="section.set('github')"
                    role="tab">
                    GitHub Allowlist
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="section() === 'repos'"
                    (click)="section.set('repos')"
                    role="tab">
                    Repo Blocklist
                </button>
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
export class SettingsAccessComponent {
    readonly section = signal<AccessSection>('allowlist');
}
