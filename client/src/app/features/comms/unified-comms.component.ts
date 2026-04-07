import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { LiveFeedComponent } from '../feed/live-feed.component';
import { AgentCommsComponent } from '../agent-comms/agent-comms.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

type CommsView = 'feed' | 'network';

const STORAGE_KEY = 'comms_view_mode';

@Component({
    selector: 'app-unified-comms',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [LiveFeedComponent, AgentCommsComponent, PageShellComponent],
    template: `
        <app-page-shell title="Comms" icon="comms">
            <div actions class="mode-toggle" role="tablist" aria-label="Comms view mode">
                <button
                    class="mode-toggle__btn"
                    [class.mode-toggle__btn--active]="view() === 'feed'"
                    (click)="setView('feed')"
                    role="tab"
                    [attr.aria-selected]="view() === 'feed'">
                    Feed
                </button>
                <button
                    class="mode-toggle__btn"
                    [class.mode-toggle__btn--active]="view() === 'network'"
                    (click)="setView('network')"
                    role="tab"
                    [attr.aria-selected]="view() === 'network'">
                    Network
                </button>
            </div>

            @switch (view()) {
                @case ('feed') {
                    <app-live-feed />
                }
                @case ('network') {
                    <app-agent-comms />
                }
            }
        </app-page-shell>
    `,
    styles: `
        .mode-toggle {
            display: flex;
            gap: 0;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius);
            overflow: hidden;
        }
        .mode-toggle__btn {
            padding: 0.35rem 0.85rem;
            font-size: 0.72rem;
            font-weight: 600;
            font-family: inherit;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
        }
        .mode-toggle__btn:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .mode-toggle__btn--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-subtle);
            text-shadow: 0 0 8px var(--accent-cyan-border);
        }

        @media (max-width: 767px) {
            .mode-toggle__btn {
                padding: 0.3rem 0.65rem;
                font-size: 0.68rem;
            }
        }
    `,
})
export class UnifiedCommsComponent {
    readonly view = signal<CommsView>(this.loadView());

    setView(mode: CommsView): void {
        this.view.set(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, mode);
        }
    }

    private loadView(): CommsView {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'feed' || stored === 'network') return stored;
        }
        return 'feed';
    }
}
