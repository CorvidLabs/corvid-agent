import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

/**
 * Reusable progress/tally bar — replaces duplicated bar patterns across
 * governance, agent-detail, models, councils, flock-challenges, etc.
 *
 * Usage:
 *   <app-progress-bar [value]="75" accent="cyan" />
 *   <app-progress-bar [value]="33" [height]="6" accent="green" />
 *   <app-progress-bar [value]="50" accent="amber" [animated]="true" />
 */
@Component({
    selector: 'app-progress-bar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="pb" [style.height.px]="height()" [attr.data-accent]="accent()">
            <div class="pb__fill"
                 [class.pb__fill--animated]="animated()"
                 [style.width.%]="clampedValue()"
                 [attr.data-accent]="accent()">
            </div>
        </div>
    `,
    styles: `
        .pb {
            width: 100%;
            border-radius: 999px;
            overflow: hidden;
            background: var(--bg-raised);
            flex-shrink: 0;
        }

        .pb__fill {
            height: 100%;
            border-radius: 999px;
            transition: width 0.3s ease;
        }
        .pb__fill--animated {
            animation: pbGrow 0.6s ease-out both;
        }

        .pb__fill[data-accent="cyan"] { background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan-glow); }
        .pb__fill[data-accent="green"] { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green-glow); }
        .pb__fill[data-accent="amber"] { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber-glow); }
        .pb__fill[data-accent="magenta"] { background: var(--accent-magenta); box-shadow: 0 0 6px var(--accent-magenta-glow); }
        .pb__fill[data-accent="purple"] { background: var(--accent-purple); }
        .pb__fill[data-accent="red"] { background: var(--accent-red); box-shadow: 0 0 6px var(--accent-red-glow); }
        .pb__fill[data-accent="gold"] { background: var(--accent-gold, #f5a623); }

        @keyframes pbGrow {
            from { width: 0%; }
        }

        @media (prefers-reduced-motion: reduce) {
            .pb__fill { transition: none; }
            .pb__fill--animated { animation: none; }
        }
    `,
})
export class ProgressBarComponent {
    readonly value = input.required<number>();
    readonly height = input<number>(6);
    readonly accent = input<string>('cyan');
    readonly animated = input<boolean>(false);

    readonly clampedValue = computed(() => Math.max(0, Math.min(100, this.value())));
}
