import {
    Component,
    ChangeDetectionStrategy,
    output,
    input,
    ElementRef,
    inject,
    OnDestroy,
} from '@angular/core';

/**
 * A draggable resize handle that emits pixel deltas on drag.
 * Place between two panels. Supports horizontal (default) and vertical orientation.
 *
 * Usage:
 *   <app-resize-handle position="right" (resized)="onResize($event)" />
 *
 * The `resized` event emits the pixel delta (positive = grow in the handle's direction).
 */
@Component({
    selector: 'app-resize-handle',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    template: `
        <div
            class="resize-handle"
            [class.resize-handle--horizontal]="position() === 'left' || position() === 'right'"
            [class.resize-handle--vertical]="position() === 'top' || position() === 'bottom'"
            [class.resize-handle--dragging]="dragging"
            (mousedown)="onMouseDown($event)"
            (touchstart)="onTouchStart($event)"
            role="separator"
            [attr.aria-orientation]="(position() === 'left' || position() === 'right') ? 'vertical' : 'horizontal'"
            aria-label="Resize handle"
            tabindex="0"
            (keydown)="onKeyDown($event)">
            <div class="resize-handle__indicator"></div>
        </div>
    `,
    styles: `
        .resize-handle {
            position: relative;
            z-index: 10;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s ease;
        }

        .resize-handle--horizontal {
            width: 6px;
            cursor: col-resize;
            margin: 0 -2px;
        }

        .resize-handle--vertical {
            height: 6px;
            cursor: row-resize;
            margin: -2px 0;
        }

        .resize-handle:hover,
        .resize-handle--dragging {
            background: var(--accent-cyan-subtle);
        }

        .resize-handle__indicator {
            border-radius: 2px;
            background: var(--border-bright);
            transition: background 0.15s ease, box-shadow 0.15s ease;
        }

        .resize-handle--horizontal .resize-handle__indicator {
            width: 2px;
            height: 24px;
        }

        .resize-handle--vertical .resize-handle__indicator {
            width: 24px;
            height: 2px;
        }

        .resize-handle:hover .resize-handle__indicator,
        .resize-handle--dragging .resize-handle__indicator {
            background: var(--accent-cyan);
            box-shadow: 0 0 6px var(--accent-cyan-glow);
        }

        @media (max-width: 767px) {
            .resize-handle { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
            .resize-handle,
            .resize-handle__indicator {
                transition: none !important;
            }
        }
    `,
})
export class ResizeHandleComponent implements OnDestroy {
    /** Which edge of the parent this handle sits on */
    readonly position = input<'left' | 'right' | 'top' | 'bottom'>('right');

    /** Emits pixel delta during drag (positive = growing in the handle direction) */
    readonly resized = output<number>();

    /** Emits when drag ends */
    readonly resizeEnd = output<void>();

    dragging = false;
    private startX = 0;
    private startY = 0;
    private readonly el = inject(ElementRef);

    private readonly boundMouseMove = this.onMouseMove.bind(this);
    private readonly boundMouseUp = this.onMouseUp.bind(this);
    private readonly boundTouchMove = this.onTouchMove.bind(this);
    private readonly boundTouchEnd = this.onTouchEnd.bind(this);

    onMouseDown(e: MouseEvent): void {
        e.preventDefault();
        this.startDrag(e.clientX, e.clientY);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    onTouchStart(e: TouchEvent): void {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
        document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
        document.addEventListener('touchend', this.boundTouchEnd);
    }

    onKeyDown(e: KeyboardEvent): void {
        const step = e.shiftKey ? 20 : 4;
        const pos = this.position();
        const isHorizontal = pos === 'left' || pos === 'right';

        if (isHorizontal && e.key === 'ArrowLeft') {
            e.preventDefault();
            this.resized.emit(pos === 'left' ? step : -step);
        } else if (isHorizontal && e.key === 'ArrowRight') {
            e.preventDefault();
            this.resized.emit(pos === 'left' ? -step : step);
        } else if (!isHorizontal && e.key === 'ArrowUp') {
            e.preventDefault();
            this.resized.emit(pos === 'top' ? step : -step);
        } else if (!isHorizontal && e.key === 'ArrowDown') {
            e.preventDefault();
            this.resized.emit(pos === 'top' ? -step : step);
        }
    }

    ngOnDestroy(): void {
        this.cleanupListeners();
    }

    private startDrag(x: number, y: number): void {
        this.dragging = true;
        this.startX = x;
        this.startY = y;
        document.body.style.cursor =
            this.position() === 'left' || this.position() === 'right' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }

    private onMouseMove(e: MouseEvent): void {
        this.emitDelta(e.clientX, e.clientY);
    }

    private onTouchMove(e: TouchEvent): void {
        e.preventDefault();
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this.emitDelta(touch.clientX, touch.clientY);
    }

    private emitDelta(x: number, y: number): void {
        const pos = this.position();
        let delta: number;

        if (pos === 'right') {
            delta = this.startX - x; // dragging left = grow
        } else if (pos === 'left') {
            delta = x - this.startX; // dragging right = grow
        } else if (pos === 'bottom') {
            delta = this.startY - y;
        } else {
            delta = y - this.startY;
        }

        this.startX = x;
        this.startY = y;
        this.resized.emit(delta);
    }

    private onMouseUp(): void {
        this.endDrag();
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }

    private onTouchEnd(): void {
        this.endDrag();
        document.removeEventListener('touchmove', this.boundTouchMove);
        document.removeEventListener('touchend', this.boundTouchEnd);
    }

    private endDrag(): void {
        this.dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.resizeEnd.emit();
    }

    private cleanupListeners(): void {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
        document.removeEventListener('touchmove', this.boundTouchMove);
        document.removeEventListener('touchend', this.boundTouchEnd);
    }
}
