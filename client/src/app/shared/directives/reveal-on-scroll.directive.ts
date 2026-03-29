import { Directive, ElementRef, Input, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Reveals an element with a fade+slide animation when it enters the viewport.
 * Usage: `<div appRevealOnScroll>` or `<div appRevealOnScroll="slideRight">`
 * Variants: slideUp (default), slideRight, scaleIn, fadeOnly
 */
@Directive({ selector: '[appRevealOnScroll]' })
export class RevealOnScrollDirective implements OnInit, OnDestroy {
    @Input('appRevealOnScroll') variant: '' | 'slideUp' | 'slideRight' | 'scaleIn' | 'fadeOnly' = '';
    @Input() revealDelay = 0;
    @Input() revealThreshold = 0.15;

    private readonly el = inject(ElementRef);
    private readonly platformId = inject(PLATFORM_ID);
    private observer: IntersectionObserver | null = null;

    ngOnInit(): void {
        if (!isPlatformBrowser(this.platformId)) return;

        // Check reduced motion preference
        if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.el.nativeElement.style.opacity = '1';
            return;
        }

        const element = this.el.nativeElement as HTMLElement;
        element.style.opacity = '0';
        element.style.willChange = 'opacity, transform';

        this.observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        this.reveal(entry.target as HTMLElement);
                        this.observer?.unobserve(entry.target);
                    }
                }
            },
            { threshold: this.revealThreshold, rootMargin: '0px 0px -40px 0px' },
        );
        this.observer.observe(element);
    }

    ngOnDestroy(): void {
        this.observer?.disconnect();
    }

    private reveal(el: HTMLElement): void {
        const v = this.variant || 'slideUp';
        const delay = this.revealDelay;

        const keyframes: Keyframe[] = (() => {
            switch (v) {
                case 'slideRight':
                    return [
                        { opacity: 0, transform: 'translateX(-16px)' },
                        { opacity: 1, transform: 'translateX(0)' },
                    ];
                case 'scaleIn':
                    return [
                        { opacity: 0, transform: 'scale(0.92)' },
                        { opacity: 1, transform: 'scale(1)' },
                    ];
                case 'fadeOnly':
                    return [
                        { opacity: 0 },
                        { opacity: 1 },
                    ];
                default: // slideUp
                    return [
                        { opacity: 0, transform: 'translateY(16px)' },
                        { opacity: 1, transform: 'translateY(0)' },
                    ];
            }
        })();

        el.animate(keyframes, {
            duration: 400,
            delay,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'forwards',
        });
    }
}
