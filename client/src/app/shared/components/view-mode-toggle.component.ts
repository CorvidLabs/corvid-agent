import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

export type ViewMode = 'basic' | '3d';

@Component({
    selector: 'app-view-mode-toggle',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="view-toggle" role="tablist" [attr.aria-label]="ariaLabel()">
            <button
                class="view-toggle__btn"
                [class.view-toggle__btn--active]="mode() === 'basic'"
                (click)="modeChange.emit('basic')"
                role="tab"
                [attr.aria-selected]="mode() === 'basic'"
                title="Stats view — lightweight, accessible">
                <svg class="view-toggle__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                </svg>
                <span class="view-toggle__label">Basic</span>
            </button>
            <button
                class="view-toggle__btn"
                [class.view-toggle__btn--active]="mode() === '3d'"
                (click)="modeChange.emit('3d')"
                role="tab"
                [attr.aria-selected]="mode() === '3d'"
                title="3D experience — interactive Three.js scene">
                <svg class="view-toggle__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M8 1L14.5 4.75V11.25L8 15L1.5 11.25V4.75L8 1Z" />
                    <path d="M8 1V8M8 8L14.5 4.75M8 8L1.5 4.75M8 8V15" opacity="0.5" />
                </svg>
                <span class="view-toggle__label">3D</span>
            </button>
        </div>
    `,
    styles: `
        .view-toggle {
            display: inline-flex;
            gap: 0;
            background: var(--glass-bg-solid, rgba(20, 21, 30, 0.9));
            border: 1px solid var(--border-subtle, #1a1a2e);
            border-radius: 6px;
            overflow: hidden;
        }
        .view-toggle__btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0.3rem 0.7rem;
            font-size: 0.75rem;
            font-weight: 600;
            font-family: inherit;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            background: transparent;
            border: none;
            color: var(--text-secondary, #888);
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
        }
        .view-toggle__btn:hover {
            color: var(--text-primary, #e0e0e0);
            background: var(--bg-hover, rgba(255, 255, 255, 0.04));
        }
        .view-toggle__btn--active {
            color: var(--accent-cyan, #00e5ff);
            background: var(--accent-cyan-subtle, rgba(0, 229, 255, 0.08));
            text-shadow: 0 0 8px var(--accent-cyan-border, rgba(0, 229, 255, 0.3));
        }
        .view-toggle__icon {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .view-toggle__label {
            white-space: nowrap;
        }

        @media (max-width: 480px) {
            .view-toggle__label { display: none; }
            .view-toggle__btn { padding: 0.3rem 0.5rem; }
        }
    `,
})
export class ViewModeToggleComponent {
    readonly mode = input.required<ViewMode>();
    readonly ariaLabel = input('View mode');
    readonly modeChange = output<ViewMode>();
}
