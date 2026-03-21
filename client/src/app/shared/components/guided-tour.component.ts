import {
    Component,
    ChangeDetectionStrategy,
    inject,
    effect,
    signal,
    OnDestroy,
} from '@angular/core';
import { GuidedTourService, type TourStep } from '../../core/services/guided-tour.service';

interface SpotlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface TooltipPos {
    top: string;
    left: string;
}

@Component({
    selector: 'app-guided-tour',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (tourService.active()) {
            <div class="tour-overlay" (click)="onOverlayClick($event)">
                <!-- SVG mask: full-screen dark overlay with a cutout for the spotlight -->
                <svg class="tour-mask" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <mask id="tour-spotlight-mask">
                            <rect width="100%" height="100%" fill="white" />
                            @if (spotlight()) {
                                <rect
                                    [attr.x]="spotlight()!.left - 6"
                                    [attr.y]="spotlight()!.top - 6"
                                    [attr.width]="spotlight()!.width + 12"
                                    [attr.height]="spotlight()!.height + 12"
                                    rx="8" ry="8"
                                    fill="black" />
                            }
                        </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-spotlight-mask)" />
                </svg>

                <!-- Spotlight border glow -->
                @if (spotlight()) {
                    <div class="tour-spotlight-ring"
                         [style.top.px]="spotlight()!.top - 6"
                         [style.left.px]="spotlight()!.left - 6"
                         [style.width.px]="spotlight()!.width + 12"
                         [style.height.px]="spotlight()!.height + 12">
                    </div>
                }

                <!-- Tooltip -->
                @if (tourService.currentStep(); as step) {
                    <div class="tour-tooltip"
                         [style.top]="tooltipPos().top"
                         [style.left]="tooltipPos().left"
                         [attr.data-placement]="step.placement"
                         (click)="$event.stopPropagation()">
                        <div class="tour-tooltip__header">
                            <span class="tour-tooltip__step">{{ tourService.currentStepIndex() + 1 }} / {{ tourService.steps().length }}</span>
                            <button class="tour-tooltip__skip" (click)="tourService.skip()">Skip tour</button>
                        </div>
                        <h3 class="tour-tooltip__title">{{ step.title }}</h3>
                        <p class="tour-tooltip__content">{{ step.content }}</p>
                        <div class="tour-tooltip__actions">
                            @if (tourService.currentStepIndex() > 0) {
                                <button class="tour-btn tour-btn--ghost" (click)="tourService.prev()">Back</button>
                            }
                            <button class="tour-btn tour-btn--primary" (click)="tourService.next()">
                                {{ tourService.currentStepIndex() === tourService.steps().length - 1 ? 'Done' : 'Next' }}
                            </button>
                        </div>
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .tour-overlay {
            position: fixed;
            inset: 0;
            z-index: 10000;
            pointer-events: auto;
        }

        .tour-mask {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }

        .tour-spotlight-ring {
            position: absolute;
            border: 2px solid var(--accent-cyan, #00e5ff);
            border-radius: 8px;
            box-shadow: 0 0 16px rgba(0, 229, 255, 0.4), inset 0 0 16px rgba(0, 229, 255, 0.05);
            pointer-events: none;
            transition: top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease;
        }

        .tour-tooltip {
            position: absolute;
            width: 340px;
            max-width: calc(100vw - 2rem);
            background: var(--bg-surface, #1a1a2e);
            border: 1px solid var(--border-bright, #3a3a5c);
            border-radius: var(--radius-lg, 12px);
            padding: 1rem 1.25rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 229, 255, 0.1);
            z-index: 10001;
            transition: top 0.3s ease, left 0.3s ease;
            animation: tour-fadein 0.25s ease;
        }

        @keyframes tour-fadein {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .tour-tooltip__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .tour-tooltip__step {
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--accent-cyan, #00e5ff);
            letter-spacing: 0.05em;
        }

        .tour-tooltip__skip {
            background: none;
            border: none;
            color: var(--text-tertiary, #666);
            font-size: 0.7rem;
            font-family: inherit;
            cursor: pointer;
            padding: 0.2rem 0.4rem;
            border-radius: var(--radius, 6px);
        }
        .tour-tooltip__skip:hover {
            color: var(--text-secondary, #999);
            background: var(--bg-hover, rgba(255,255,255,0.05));
        }

        .tour-tooltip__title {
            margin: 0 0 0.4rem;
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--text-primary, #e0e0e0);
        }

        .tour-tooltip__content {
            margin: 0 0 1rem;
            font-size: 0.8rem;
            line-height: 1.5;
            color: var(--text-secondary, #aaa);
            white-space: pre-line;
        }

        .tour-tooltip__actions {
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
        }

        .tour-btn {
            padding: 0.4rem 1rem;
            border-radius: var(--radius, 6px);
            font-size: 0.8rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            border: 1px solid transparent;
            transition: background 0.15s, border-color 0.15s;
        }

        .tour-btn--primary {
            background: rgba(0, 229, 255, 0.12);
            border-color: var(--accent-cyan, #00e5ff);
            color: var(--accent-cyan, #00e5ff);
        }
        .tour-btn--primary:hover {
            background: rgba(0, 229, 255, 0.22);
            box-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
        }

        .tour-btn--ghost {
            background: transparent;
            border-color: var(--border, #333);
            color: var(--text-secondary, #999);
        }
        .tour-btn--ghost:hover {
            background: var(--bg-hover, rgba(255,255,255,0.05));
        }
    `,
})
export class GuidedTourComponent implements OnDestroy {
    protected readonly tourService = inject(GuidedTourService);

    protected readonly spotlight = signal<SpotlightRect | null>(null);
    protected readonly tooltipPos = signal<TooltipPos>({ top: '50%', left: '50%' });

    private resizeObserver: ResizeObserver | null = null;

    constructor() {
        // Recalculate position whenever step changes
        effect(() => {
            const step = this.tourService.currentStep();
            const active = this.tourService.active();
            if (active && step) {
                // Small delay to let DOM settle after navigation
                requestAnimationFrame(() => this.positionForStep(step));
            }
        });
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    protected onOverlayClick(event: MouseEvent): void {
        // Click on the dark overlay area advances the tour
        const target = event.target as HTMLElement;
        if (target.closest('.tour-tooltip')) return;
        this.tourService.next();
    }

    private positionForStep(step: TourStep): void {
        const el = document.querySelector(step.selector);
        if (!el) {
            // Element not found — show tooltip centered, no spotlight
            this.spotlight.set(null);
            this.tooltipPos.set({ top: '40%', left: 'calc(50% - 170px)' });
            return;
        }

        const rect = el.getBoundingClientRect();
        this.spotlight.set({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
        });

        // Position tooltip relative to the spotlight
        const padding = 16;
        let top: number;
        let left: number;

        switch (step.placement) {
            case 'bottom':
                top = rect.bottom + padding;
                left = rect.left + rect.width / 2 - 170;
                break;
            case 'top':
                top = rect.top - padding - 200; // estimate tooltip height
                left = rect.left + rect.width / 2 - 170;
                break;
            case 'right':
                top = rect.top + rect.height / 2 - 100;
                left = rect.right + padding;
                break;
            case 'left':
                top = rect.top + rect.height / 2 - 100;
                left = rect.left - padding - 340;
                break;
        }

        // Clamp to viewport
        left = Math.max(16, Math.min(left, window.innerWidth - 360));
        top = Math.max(16, Math.min(top, window.innerHeight - 240));

        this.tooltipPos.set({ top: `${top}px`, left: `${left}px` });
    }
}
