import {
    Component,
    ChangeDetectionStrategy,
    signal,
} from '@angular/core';
import { BrainViewerComponent } from '../brain-viewer/brain-viewer.component';
import { MemoryBrowserComponent } from '../memory-browser/memory-browser.component';

type MemoryView = 'overview' | 'browse';

const STORAGE_KEY = 'memory_view_mode';

@Component({
    selector: 'app-unified-memory',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="unified-memory">
            <header class="unified-memory__header">
                <h2 class="unified-memory__title">Memory</h2>
                <div class="unified-memory__modes" role="tablist" aria-label="Memory view mode">
                    <button
                        class="unified-memory__mode-btn"
                        [class.unified-memory__mode-btn--active]="view() === 'overview'"
                        (click)="setView('overview')"
                        role="tab"
                        [attr.aria-selected]="view() === 'overview'">
                        Overview
                    </button>
                    <button
                        class="unified-memory__mode-btn"
                        [class.unified-memory__mode-btn--active]="view() === 'browse'"
                        (click)="setView('browse')"
                        role="tab"
                        [attr.aria-selected]="view() === 'browse'">
                        Browse
                    </button>
                </div>
            </header>
            <div class="unified-memory__content">
                @switch (view()) {
                    @case ('overview') {
                        <app-brain-viewer />
                    }
                    @case ('browse') {
                        <app-memory-browser />
                    }
                }
            </div>
        </div>
    `,
    styles: `
        .unified-memory {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .unified-memory__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1.25rem;
            background: rgba(12, 13, 20, 0.3);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .unified-memory__title {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
        }
        .unified-memory__modes {
            display: flex;
            gap: 0;
            background: var(--glass-bg-solid);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            overflow: hidden;
        }
        .unified-memory__mode-btn {
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
        .unified-memory__mode-btn:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .unified-memory__mode-btn--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-subtle);
            text-shadow: 0 0 8px var(--accent-cyan-border);
        }
        .unified-memory__content {
            flex: 1;
            overflow-y: auto;
        }

        @media (max-width: 767px) {
            .unified-memory__header {
                padding: 0.5rem 0.75rem;
            }
            .unified-memory__mode-btn {
                padding: 0.3rem 0.65rem;
                font-size: 0.68rem;
            }
        }
    `,
    imports: [BrainViewerComponent, MemoryBrowserComponent],
})
export class UnifiedMemoryComponent {
    readonly view = signal<MemoryView>(this.loadView());

    setView(mode: MemoryView): void {
        this.view.set(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, mode);
        }
    }

    private loadView(): MemoryView {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'overview' || stored === 'browse') return stored;
        }
        return 'overview';
    }
}
