import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-empty-state',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        <div class="empty-state" role="status">
            <span class="empty-state__icon" aria-hidden="true">{{ icon() }}</span>
            <p class="empty-state__title">{{ title() }}</p>
            @if (subtitle()) {
                <p class="empty-state__subtitle">{{ subtitle() }}</p>
            }
            @if (ctaLabel() && ctaRoute()) {
                <a class="empty-state__cta" [routerLink]="ctaRoute()">{{ ctaLabel() }}</a>
            } @else if (ctaLabel()) {
                <button class="empty-state__cta" (click)="ctaClick.emit()">{{ ctaLabel() }}</button>
            }
        </div>
    `,
    styles: `
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 3rem 1.5rem;
            text-align: center;
            border: 1px dashed var(--border-bright);
            border-radius: var(--radius-lg);
            background: var(--bg-surface);
        }
        .empty-state__icon {
            font-size: 2.5rem;
            line-height: 1;
            margin-bottom: 1rem;
            color: var(--accent-cyan);
            text-shadow: var(--glow-cyan);
        }
        .empty-state__title {
            margin: 0 0 0.35rem;
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1.4;
        }
        .empty-state__subtitle {
            margin: 0 0 1rem;
            font-size: 0.75rem;
            color: var(--text-secondary);
            line-height: 1.5;
            max-width: 36ch;
        }
        .empty-state__cta {
            display: inline-block;
            padding: 0.5rem 1.25rem;
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius);
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
            font-size: 0.8rem;
            font-weight: 600;
            font-family: inherit;
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .empty-state__cta:hover {
            background: rgba(0, 229, 255, 0.2);
            box-shadow: var(--glow-cyan);
        }
        .empty-state__cta:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
        }
    `,
})
export class EmptyStateComponent {
    readonly icon = input.required<string>();
    readonly title = input.required<string>();
    readonly subtitle = input<string>('');
    readonly ctaLabel = input<string>('');
    readonly ctaRoute = input<string>('');
    readonly ctaClick = output<void>();
}
