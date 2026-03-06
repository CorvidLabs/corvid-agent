import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-empty-state',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        <div class="empty-state" role="status" [attr.aria-label]="description">
            <pre class="empty-state__icon" aria-hidden="true">{{ icon }}</pre>
            <p class="empty-state__title">{{ title }}</p>
            <p class="empty-state__desc">{{ description }}</p>
            @if (actionRoute) {
                <a
                    class="empty-state__action"
                    [routerLink]="actionRoute"
                    [attr.aria-label]="actionAriaLabel || actionLabel">
                    {{ actionLabel }}
                </a>
            } @else if (actionLabel) {
                <button
                    class="empty-state__action"
                    (click)="onAction()"
                    [attr.aria-label]="actionAriaLabel || actionLabel">
                    {{ actionLabel }}
                </button>
            }
            @if (docsHint) {
                <p class="empty-state__docs">{{ docsHint }}</p>
            }
        </div>
    `,
    styles: `
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 4rem 2rem;
            min-height: 280px;
            position: relative;
            background:
                repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 3px,
                    rgba(30, 32, 53, 0.15) 3px,
                    rgba(30, 32, 53, 0.15) 4px
                );
        }
        .empty-state__icon {
            margin: 0 0 1.25rem;
            font-family: monospace;
            font-size: 0.7rem;
            line-height: 1.4;
            color: var(--text-secondary);
            user-select: none;
        }
        .empty-state__title {
            margin: 0 0 0.5rem;
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .empty-state__desc {
            margin: 0 0 1.5rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            max-width: 360px;
            line-height: 1.6;
        }
        .empty-state__action {
            display: inline-block;
            padding: 0.6rem 1.25rem;
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius);
            background: transparent;
            color: var(--accent-cyan);
            font-size: 0.8rem;
            font-weight: 600;
            font-family: inherit;
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .empty-state__action:hover {
            background: var(--accent-cyan);
            color: var(--bg-deep);
            box-shadow: var(--glow-cyan);
        }
        .empty-state__action:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
            box-shadow: var(--glow-cyan);
        }
        .empty-state__docs {
            margin: 1rem 0 0;
            font-size: 0.65rem;
            color: var(--text-tertiary);
        }
        @media (max-width: 768px) {
            .empty-state {
                padding: 2.5rem 1.5rem;
                min-height: 200px;
            }
        }
    `,
})
export class EmptyStateComponent {
    @Input({ required: true }) icon!: string;
    @Input({ required: true }) title!: string;
    @Input({ required: true }) description!: string;
    @Input() actionLabel?: string;
    @Input() actionRoute?: string;
    @Input() actionAriaLabel?: string;
    @Input() docsHint?: string;
    @Input() actionClick?: () => void;

    onAction(): void {
        this.actionClick?.();
    }
}
