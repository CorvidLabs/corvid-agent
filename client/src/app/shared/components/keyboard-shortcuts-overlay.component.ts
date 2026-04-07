import {
    Component,
    ChangeDetectionStrategy,
    inject,
} from '@angular/core';
import { KeyboardShortcutsService, ShortcutEntry } from '../../core/services/keyboard-shortcuts.service';

@Component({
    selector: 'app-keyboard-shortcuts-overlay',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (shortcuts.overlayOpen()) {
            <div
                class="shortcuts-overlay"
                role="dialog"
                aria-labelledby="shortcuts-title"
                aria-modal="true"
                (click)="onBackdropClick($event)"
                (keydown.escape)="shortcuts.closeOverlay()">
                <div class="shortcuts-panel">
                    <div class="shortcuts-panel__header">
                        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
                        <button
                            class="shortcuts-panel__close"
                            (click)="shortcuts.closeOverlay()"
                            aria-label="Close shortcuts"
                            type="button">
                            ESC
                        </button>
                    </div>
                    <div class="shortcuts-panel__body">
                        @for (category of categories; track category) {
                            <div class="shortcuts-panel__category">
                                <h3 class="shortcuts-panel__category-label">{{ category }}</h3>
                                <dl class="shortcuts-panel__list">
                                    @for (shortcut of byCategory(category); track shortcut.keys) {
                                        <div class="shortcuts-panel__entry">
                                            <dt class="shortcuts-panel__keys">
                                                @for (key of splitKeys(shortcut.keys); track key; let last = $last) {
                                                    <kbd>{{ key }}</kbd>
                                                    @if (!last) {
                                                        <span class="shortcuts-panel__then">then</span>
                                                    }
                                                }
                                            </dt>
                                            <dd class="shortcuts-panel__desc">{{ shortcut.description }}</dd>
                                        </div>
                                    }
                                </dl>
                            </div>
                        }
                    </div>
                    <div class="shortcuts-panel__footer">
                        <span class="shortcuts-panel__version">CorvidAgent</span>
                    </div>
                </div>
            </div>
        }
    `,
    styles: `
        .shortcuts-overlay {
            position: fixed;
            inset: 0;
            background: var(--overlay-heavy);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }
        .shortcuts-panel {
            background: var(--bg-surface);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-lg);
            padding: 1.5rem;
            max-width: 520px;
            width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow:
                0 0 24px var(--accent-cyan-dim),
                0 0 60px var(--accent-cyan-subtle);
        }
        .shortcuts-panel__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.25rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--border);
        }
        .shortcuts-panel__header h2 {
            margin: 0;
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--accent-cyan);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .shortcuts-panel__close {
            padding: 0.25rem 0.5rem;
            background: transparent;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius-sm);
            color: var(--text-tertiary);
            font-size: 0.65rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            transition: color var(--transition-fast), border-color var(--transition-fast);
        }
        .shortcuts-panel__close:hover {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
        }
        .shortcuts-panel__close:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
        }
        .shortcuts-panel__body {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .shortcuts-panel__category-label {
            margin: 0 0 0.5rem;
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-tertiary);
            font-weight: 600;
        }
        .shortcuts-panel__list {
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }
        .shortcuts-panel__entry {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.375rem 0.5rem;
            border-radius: var(--radius-sm);
            transition: background var(--transition-fast);
        }
        .shortcuts-panel__entry:hover {
            background: var(--bg-hover);
        }
        .shortcuts-panel__keys {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }
        kbd {
            display: inline-block;
            padding: 0.15rem 0.4rem;
            background: var(--bg-raised);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius-sm);
            font-size: 0.7rem;
            font-family: inherit;
            color: var(--text-primary);
            font-weight: 600;
            min-width: 1.5em;
            text-align: center;
            box-shadow: 0 1px 0 var(--border);
        }
        .shortcuts-panel__then {
            font-size: 0.55rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .shortcuts-panel__desc {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin: 0;
        }
        .shortcuts-panel__footer {
            margin-top: 1rem;
            padding-top: 0.75rem;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .shortcuts-panel__version {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        /* Mobile: hide shortcuts overlay */
        @media (max-width: 767px) {
            .shortcuts-overlay {
                display: none;
            }
        }
    `,
})
export class KeyboardShortcutsOverlayComponent {
    protected readonly shortcuts = inject(KeyboardShortcutsService);

    protected readonly categories = ['General', 'Navigation'];

    protected byCategory(category: string): ShortcutEntry[] {
        return this.shortcuts.shortcuts.filter((s) => s.category === category);
    }

    protected splitKeys(keys: string): string[] {
        return keys.split(' ');
    }

    protected onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('shortcuts-overlay')) {
            this.shortcuts.closeOverlay();
        }
    }
}
