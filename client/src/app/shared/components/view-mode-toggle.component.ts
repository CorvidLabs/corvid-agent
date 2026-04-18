import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

export type ViewMode = 'basic' | '3d';

@Component({
    selector: 'app-view-mode-toggle',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonToggleModule],
    template: `
        <mat-button-toggle-group [value]="mode()" (change)="modeChange.emit($event.value)" hideSingleSelectionIndicator [attr.aria-label]="ariaLabel()">
            <mat-button-toggle value="basic" title="Stats view — lightweight, accessible">
                <svg class="view-toggle__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                </svg>
                <span class="view-toggle__label">Basic</span>
            </mat-button-toggle>
            <mat-button-toggle value="3d" title="3D experience — interactive Three.js scene">
                <svg class="view-toggle__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M8 1L14.5 4.75V11.25L8 15L1.5 11.25V4.75L8 1Z" />
                    <path d="M8 1V8M8 8L14.5 4.75M8 8L1.5 4.75M8 8V15" opacity="0.5" />
                </svg>
                <span class="view-toggle__label">3D</span>
            </mat-button-toggle>
        </mat-button-toggle-group>
    `,
    styles: `
        .view-toggle__icon {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .view-toggle__label {
            white-space: nowrap;
        }

        @media (max-width: 480px) {
            .view-toggle__label { display: none; }
        }
    `,
})
export class ViewModeToggleComponent {
    readonly mode = input.required<ViewMode>();
    readonly ariaLabel = input('View mode');
    readonly modeChange = output<ViewMode>();
}
