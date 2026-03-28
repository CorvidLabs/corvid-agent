import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
    selector: 'app-skeleton',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    template: `
        <div class="skeleton" [attr.data-variant]="variant()" role="status" aria-label="Loading">
            <span class="sr-only">Loading...</span>
            @for (item of items; track $index) {
                <div class="skeleton__item"></div>
            }
        </div>
    `,
    styles: `
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            border: 0;
        }

        .skeleton { display: flex; flex-direction: column; gap: 0.5rem; }

        .skeleton__item {
            height: 1rem;
            border-radius: var(--radius-sm);
            background: linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-hover) 50%, var(--bg-raised) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
        }

        .skeleton[data-variant="table"] .skeleton__item { height: 2.5rem; border-radius: var(--radius); }
        .skeleton[data-variant="card"] .skeleton__item { height: 4rem; border-radius: var(--radius-lg); }
        .skeleton[data-variant="line"] .skeleton__item { height: 1rem; width: 80%; }
        .skeleton[data-variant="line"] .skeleton__item:nth-child(even) { width: 60%; }

        /* Stagger wave (pairs with global skeletonWave on .skeleton__item) */
        .skeleton[data-variant="table"] .skeleton__item:nth-child(1) { animation-delay: 0ms; }
        .skeleton[data-variant="table"] .skeleton__item:nth-child(2) { animation-delay: 45ms; }
        .skeleton[data-variant="table"] .skeleton__item:nth-child(3) { animation-delay: 90ms; }
        .skeleton[data-variant="table"] .skeleton__item:nth-child(4) { animation-delay: 135ms; }
        .skeleton[data-variant="table"] .skeleton__item:nth-child(5) { animation-delay: 180ms; }
        .skeleton[data-variant="table"] .skeleton__item:nth-child(n + 6) { animation-delay: 220ms; }
        .skeleton[data-variant="card"] .skeleton__item:nth-child(1) { animation-delay: 0ms; }
        .skeleton[data-variant="card"] .skeleton__item:nth-child(2) { animation-delay: 55ms; }
        .skeleton[data-variant="card"] .skeleton__item:nth-child(3) { animation-delay: 110ms; }
        .skeleton[data-variant="card"] .skeleton__item:nth-child(4) { animation-delay: 165ms; }
        .skeleton[data-variant="card"] .skeleton__item:nth-child(n + 5) { animation-delay: 220ms; }
        .skeleton[data-variant="line"] .skeleton__item:nth-child(odd) { animation-delay: 0ms; }
        .skeleton[data-variant="line"] .skeleton__item:nth-child(even) { animation-delay: 55ms; }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    `,
})
export class SkeletonComponent {
    readonly variant = input<'table' | 'card' | 'line'>('line');
    readonly count = input(3);

    get items(): number[] {
        return Array.from({ length: this.count() }, (_, i) => i);
    }
}
