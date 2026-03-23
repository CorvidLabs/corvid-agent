import {
    Component,
    ChangeDetectionStrategy,
    Input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

export interface Breadcrumb {
    label: string;
    route?: string;
}

/**
 * Shared page layout shell with breadcrumbs, title, and content projection slots.
 *
 * Usage:
 * ```html
 * <app-page-shell title="Conversations" icon="sessions">
 *   <ng-container toolbar>
 *     <input class="search-input" ... />
 *   </ng-container>
 *   <!-- default content slot -->
 *   <div class="my-list">...</div>
 * </app-page-shell>
 * ```
 */
@Component({
    selector: 'app-page-shell',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterLink, IconComponent],
    template: `
        <div class="page-shell">
            @if (breadcrumbs.length > 0) {
                <nav class="page-shell__breadcrumbs" aria-label="Breadcrumb">
                    @for (crumb of breadcrumbs; track crumb.label; let last = $last) {
                        @if (crumb.route && !last) {
                            <a class="page-shell__crumb" [routerLink]="crumb.route">{{ crumb.label }}</a>
                            <span class="page-shell__crumb-sep" aria-hidden="true">/</span>
                        } @else {
                            <span class="page-shell__crumb page-shell__crumb--current" [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
                            @if (!last) {
                                <span class="page-shell__crumb-sep" aria-hidden="true">/</span>
                            }
                        }
                    }
                </nav>
            }
            <header class="page-shell__header">
                <div class="page-shell__title-row">
                    @if (icon) {
                        <app-icon [name]="icon" [size]="20" />
                    }
                    <h2 class="page-shell__title">{{ title }}</h2>
                    @if (subtitle) {
                        <span class="page-shell__subtitle">{{ subtitle }}</span>
                    }
                </div>
                <div class="page-shell__actions">
                    <ng-content select="[actions]" />
                </div>
            </header>
            <div class="page-shell__toolbar">
                <ng-content select="[toolbar]" />
            </div>
            <div class="page-shell__content">
                <ng-content />
            </div>
        </div>
    `,
    styles: `
        .page-shell {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: 0;
        }

        /* Breadcrumbs */
        .page-shell__breadcrumbs {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.6rem 1.5rem 0;
            font-size: 0.7rem;
            letter-spacing: 0.02em;
        }
        .page-shell__crumb {
            color: var(--text-tertiary);
            text-decoration: none;
            transition: color 0.15s;
        }
        a.page-shell__crumb:hover {
            color: var(--accent-cyan);
        }
        .page-shell__crumb--current {
            color: var(--text-secondary);
            font-weight: 600;
        }
        .page-shell__crumb-sep {
            color: var(--text-tertiary);
            opacity: 0.5;
            font-size: 0.6rem;
        }

        /* Header */
        .page-shell__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1.5rem 0.5rem;
            gap: 1rem;
        }
        .page-shell__title-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            min-width: 0;
            color: var(--text-primary);
        }
        .page-shell__title {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 700;
            letter-spacing: 0.02em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .page-shell__subtitle {
            font-size: 0.75rem;
            color: var(--text-tertiary);
            font-weight: 400;
        }
        .page-shell__actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
        }

        /* Toolbar */
        .page-shell__toolbar:empty {
            display: none;
        }
        .page-shell__toolbar {
            padding: 0 1.5rem;
        }

        /* Content */
        .page-shell__content {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 0.75rem 1.5rem 1.5rem;
        }

        @media (max-width: 767px) {
            .page-shell__breadcrumbs {
                padding: 0.5rem 1rem 0;
            }
            .page-shell__header {
                padding: 0.6rem 1rem 0.4rem;
            }
            .page-shell__toolbar {
                padding: 0 1rem;
            }
            .page-shell__content {
                padding: 0.5rem 1rem 1rem;
            }
            .page-shell__title {
                font-size: 1rem;
            }
        }
    `,
})
export class PageShellComponent {
    @Input({ required: true }) title!: string;
    @Input() icon?: string;
    @Input() subtitle?: string;
    @Input() breadcrumbs: Breadcrumb[] = [];
}
