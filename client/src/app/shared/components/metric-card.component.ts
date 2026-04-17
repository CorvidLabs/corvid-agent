import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

/**
 * Reusable metric/stat card — replaces duplicated .metric-card / .stat-card patterns
 * across dashboard, analytics, reputation, memory, etc.
 *
 * Usage:
 *   <app-metric-card label="Total Agents" value="42" icon="agents" accent="cyan" link="/agents" linkText="View all" />
 *   <app-metric-card label="Likes" value="18" emoji="&#128077;" accent="green" />
 *   <app-metric-card label="API Cost" value="$12.34" accent="green" [highlight]="true" />
 */
@Component({
    selector: 'app-metric-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, IconComponent],
    template: `
        <div class="mc" [class.mc--highlight]="highlight()" [attr.data-accent]="accent()">
            @if (icon() || emoji()) {
                <div class="mc__icon" [attr.data-accent]="accent()">
                    @if (icon()) {
                        <app-icon [name]="icon()!" [size]="14" />
                    } @else {
                        <span class="mc__emoji">{{ emoji() }}</span>
                    }
                </div>
            }
            <span class="mc__label">{{ label() }}</span>
            <span class="mc__value" [attr.data-accent]="accent()">
                <ng-content />
            </span>
            @if (link()) {
                <a class="mc__link" [routerLink]="link()">{{ linkText() || 'View all' }}</a>
            }
            @if (sub()) {
                <span class="mc__sub">{{ sub() }}</span>
            }
        </div>
    `,
    styles: `
        :host { display: block; height: 100%; }
        .mc {
            padding: var(--space-4) var(--space-5);
            display: flex;
            flex-direction: column;
            gap: 0.3rem;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            min-width: 0;
            height: 100%;
            box-sizing: border-box;
            transition: border-color 0.2s, box-shadow 0.3s, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .mc:hover {
            border-color: var(--accent-cyan-border);
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 8px 24px var(--shadow-deep), 0 0 20px var(--accent-cyan-subtle), inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .mc--highlight {
            border-color: var(--accent-amber);
            border-style: dashed;
        }

        .mc__icon {
            width: 22px; height: 22px;
            border-radius: var(--radius-sm);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        }
        .mc__icon[data-accent="cyan"] { background: var(--accent-cyan-subtle); color: var(--accent-cyan); }
        .mc__icon[data-accent="green"] { background: var(--accent-green-subtle); color: var(--accent-green); }
        .mc__icon[data-accent="amber"] { background: var(--accent-amber-subtle); color: var(--accent-amber); }
        .mc__icon[data-accent="magenta"] { background: var(--accent-magenta-subtle); color: var(--accent-magenta); }
        .mc__icon[data-accent="purple"] { background: var(--accent-purple-subtle); color: var(--accent-purple); }
        .mc__icon[data-accent="red"] { background: var(--accent-red-subtle); color: var(--accent-red); }

        .mc__emoji { font-size: 1.2rem; }

        .mc__label {
            font-size: 0.75rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 600;
            line-height: 1.3;
        }

        .mc__value {
            font-size: clamp(0.95rem, 2.5vw, 1.75rem);
            font-weight: 700;
            color: var(--accent-cyan);
            animation: mcCountUp 0.4s ease-out both;
            min-width: 0;
            word-break: keep-all;
        }
        .mc__value[data-accent="cyan"] { color: var(--accent-cyan); }
        .mc__value[data-accent="green"] { color: var(--accent-green); }
        .mc__value[data-accent="amber"] { color: var(--accent-amber); }
        .mc__value[data-accent="magenta"] { color: var(--accent-magenta); }
        .mc__value[data-accent="purple"] { color: var(--accent-purple); }
        .mc__value[data-accent="red"] { color: var(--accent-red); }

        @keyframes mcCountUp {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .mc__link {
            font-size: 0.75rem;
            color: var(--accent-cyan);
            text-decoration: none;
            opacity: 0.7;
        }
        .mc__link:hover { opacity: 1; text-decoration: underline; }

        .mc__sub {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
        }

        @media (max-width: 480px) {
            .mc { padding: var(--space-3) var(--space-4); }
            .mc__value { font-size: 1.2rem; }
        }

        @media (prefers-reduced-motion: reduce) {
            .mc:hover { transform: none; }
            .mc__value { animation: none; }
        }
    `,
})
export class MetricCardComponent {
    readonly label = input.required<string>();
    readonly icon = input<string>();
    readonly emoji = input<string>();
    readonly accent = input<string>('cyan');
    readonly link = input<string>();
    readonly linkText = input<string>();
    readonly sub = input<string>();
    readonly highlight = input<boolean>(false);
}
