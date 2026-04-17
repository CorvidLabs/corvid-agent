import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { LiveFeedComponent } from './live-feed.component';
import { AgentCommsComponent } from './agent-comms.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

type CommsView = 'feed' | 'network';

const STORAGE_KEY = 'comms_view_mode';

@Component({
    selector: 'app-unified-comms',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [LiveFeedComponent, AgentCommsComponent, PageShellComponent],
    template: `
        <app-page-shell title="Comms" icon="comms">
            <div actions class="unified-comms__modes" role="tablist" aria-label="Comms view mode">
                <button
                    class="unified-comms__mode-btn"
                    [class.unified-comms__mode-btn--active]="view() === 'feed'"
                    (click)="setView('feed')"
                    role="tab"
                    [attr.aria-selected]="view() === 'feed'">
                    Feed
                </button>
                <button
                    class="unified-comms__mode-btn"
                    [class.unified-comms__mode-btn--active]="view() === 'network'"
                    (click)="setView('network')"
                    role="tab"
                    [attr.aria-selected]="view() === 'network'">
                    Network
                </button>
            </div>
            <div class="unified-comms__content">
                @switch (view()) {
                    @case ('feed') {
                        <app-live-feed />
                    }
                    @case ('network') {
                        <app-agent-comms />
                    }
                }
            </div>
        </app-page-shell>
    `,
    styles: `
        .unified-comms__modes {
            display: flex;
            gap: 0;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius);
            overflow: hidden;
        }
        .unified-comms__mode-btn {
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
        .unified-comms__mode-btn:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .unified-comms__mode-btn--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-subtle);
            text-shadow: 0 0 8px var(--accent-cyan-border);
        }
        .unified-comms__content {
            flex: 1;
            overflow-y: auto;
        }

        @media (max-width: 767px) {
            .unified-comms__mode-btn {
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
