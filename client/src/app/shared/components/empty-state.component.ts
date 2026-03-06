import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-empty-state',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterLink],
    template: `
        <div class="empty-state">
            @if (icon()) {
                <pre class="empty-state__icon" aria-hidden="true">{{ icon() }}</pre>
            }
            <h3 class="empty-state__title">{{ title() }}</h3>
            @if (description()) {
                <p class="empty-state__desc">{{ description() }}</p>
            }
            @if (actionRoute()) {
                <a
                    class="empty-state__action"
                    [routerLink]="actionRoute()"
                    [attr.aria-label]="actionAriaLabel() || actionLabel()"
                >{{ actionLabel() }}</a>
            }
        </div>
    `,
    styles: `
        .empty-state {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);
        }
        .empty-state__icon {
            font-size: 0.85rem; line-height: 1.3; margin: 0 0 1rem; color: var(--text-tertiary);
            font-family: var(--font-mono, monospace);
        }
        .empty-state__title { margin: 0 0 0.5rem; font-size: 1rem; color: var(--text-primary); font-weight: 600; }
        .empty-state__desc { margin: 0 0 1.25rem; font-size: 0.8rem; max-width: 32rem; line-height: 1.5; }
        .empty-state__action {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none;
            font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
            background: transparent; color: var(--accent-cyan); border: 1px solid var(--accent-cyan);
            transition: background 0.15s, box-shadow 0.15s;
        }
        .empty-state__action:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
    `,
})
export class EmptyStateComponent {
    readonly icon = input<string>();
    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly actionLabel = input<string>();
    readonly actionRoute = input<string>();
    readonly actionAriaLabel = input<string>();
}
