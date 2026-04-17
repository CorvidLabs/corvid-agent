import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { AllowlistComponent } from './allowlist.component';
import { GitHubAllowlistComponent } from './github-allowlist.component';
import { RepoBlocklistComponent } from './repo-blocklist.component';

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
            padding: var(--space-3) clamp(var(--space-3), 1.5vw, var(--space-5));
            font-size: var(--text-sm);
            font-weight: 600;
            font-family: var(--font-body);
            letter-spacing: 0.02em;
            background: transparent;
            border: 1px solid var(--border);
            border-radius: 100px;
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
            background: var(--accent-cyan-dim);
            border-color: rgba(0, 229, 255, 0.3);
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
