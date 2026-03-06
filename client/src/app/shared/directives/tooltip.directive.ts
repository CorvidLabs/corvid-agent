import {
    Directive,
    ElementRef,
    inject,
    input,
    OnDestroy,
    Renderer2,
    AfterViewInit,
} from '@angular/core';

/**
 * Shows a styled tooltip on hover/focus. Auto-detects truncated text
 * when no explicit tooltip text is provided.
 *
 * Usage:
 *   <span appTooltip="Full text here">Truncated...</span>
 *   <span appTooltip>Auto-detect truncation</span>
 */
@Directive({
    selector: '[appTooltip]',
    standalone: true,
})
export class TooltipDirective implements AfterViewInit, OnDestroy {
    readonly appTooltip = input<string>('');

    private readonly el = inject(ElementRef<HTMLElement>);
    private readonly renderer = inject(Renderer2);

    private tooltipEl: HTMLElement | null = null;
    private showTimeout: ReturnType<typeof setTimeout> | null = null;
    private listeners: (() => void)[] = [];

    ngAfterViewInit(): void {
        const host = this.el.nativeElement;
        this.listeners.push(
            this.renderer.listen(host, 'mouseenter', () => this.onEnter()),
            this.renderer.listen(host, 'mouseleave', () => this.onLeave()),
            this.renderer.listen(host, 'focus', () => this.onEnter()),
            this.renderer.listen(host, 'blur', () => this.onLeave()),
        );
    }

    ngOnDestroy(): void {
        this.onLeave();
        this.listeners.forEach((unsub) => unsub());
    }

    private getTooltipText(): string {
        const explicit = this.appTooltip();
        if (explicit) return explicit;

        const el = this.el.nativeElement;
        if (el.scrollWidth > el.clientWidth) {
            return el.textContent?.trim() ?? '';
        }
        return '';
    }

    private onEnter(): void {
        const text = this.getTooltipText();
        if (!text) return;

        this.showTimeout = setTimeout(() => {
            this.createTooltip(text);
        }, 400);
    }

    private onLeave(): void {
        if (this.showTimeout) {
            clearTimeout(this.showTimeout);
            this.showTimeout = null;
        }
        this.removeTooltip();
    }

    private createTooltip(text: string): void {
        this.removeTooltip();

        const tooltip = this.renderer.createElement('div') as HTMLElement;
        tooltip.textContent = text;
        tooltip.setAttribute('role', 'tooltip');
        tooltip.style.cssText = `
            position: fixed;
            z-index: 10000;
            max-width: 320px;
            padding: 6px 10px;
            background: var(--bg-raised, #161822);
            color: var(--text-primary, #e0e0ec);
            border: 1px solid var(--border-bright, #2a2d48);
            border-radius: var(--radius-sm, 3px);
            font-size: 0.75rem;
            font-family: inherit;
            line-height: 1.6;
            pointer-events: none;
            white-space: pre-wrap;
            word-break: break-word;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            opacity: 0;
            transition: opacity 0.12s ease;
        `;

        document.body.appendChild(tooltip);
        this.tooltipEl = tooltip;

        const rect = this.el.nativeElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = rect.top - tooltipRect.height - 6;
        let left = rect.left + (rect.width - tooltipRect.width) / 2;

        if (top < 4) {
            top = rect.bottom + 6;
        }

        left = Math.max(4, Math.min(left, window.innerWidth - tooltipRect.width - 4));

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        requestAnimationFrame(() => {
            if (this.tooltipEl) {
                this.tooltipEl.style.opacity = '1';
            }
        });
    }

    private removeTooltip(): void {
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }
}
