import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import type { NotificationType } from '../../core/models/notification.model';

interface SnackData {
    type: NotificationType;
    message: string;
    detail?: string;
}

@Component({
    selector: 'app-notification-snack',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="notif-snack" [attr.data-type]="data.type" role="alert"
             [attr.aria-label]="data.type + ': ' + data.message">
            <span class="notif-snack__icon" aria-hidden="true">{{ icon }}</span>
            <div class="notif-snack__body">
                <span class="notif-snack__message">{{ data.message }}</span>
                @if (data.detail) {
                    <span class="notif-snack__detail">{{ data.detail }}</span>
                }
            </div>
            <button
                class="notif-snack__close"
                (click)="snackRef.dismiss()"
                aria-label="Dismiss notification"
                type="button">&times;</button>
        </div>
    `,
    styles: `
        .notif-snack {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            font-size: 0.8rem;
            min-width: 260px;
            max-width: 400px;
        }
        .notif-snack__icon {
            flex-shrink: 0;
            font-size: 1rem;
            line-height: 1;
            margin-top: 1px;
        }
        .notif-snack__body {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .notif-snack__message {
            font-weight: 600;
            line-height: 1.3;
        }
        .notif-snack__detail {
            font-size: 0.75rem;
            opacity: 0.8;
            line-height: 1.4;
            word-break: break-word;
        }
        .notif-snack__close {
            flex-shrink: 0;
            background: none;
            border: none;
            color: inherit;
            font-size: 1.1rem;
            cursor: pointer;
            padding: 0 0.25rem;
            min-width: 24px;
            line-height: 1;
            opacity: 0.6;
            transition: opacity 0.15s;
        }
        .notif-snack__close:hover { opacity: 1; }
        .notif-snack__close:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 2px;
            border-radius: 2px;
        }
    `,
})
export class NotificationSnackComponent {
    protected readonly data = inject<SnackData>(MAT_SNACK_BAR_DATA);
    protected readonly snackRef = inject(MatSnackBarRef<NotificationSnackComponent>);

    protected get icon(): string {
        switch (this.data.type) {
            case 'success': return '✓';
            case 'error': return '✕';
            case 'warning': return '⚠';
            case 'info': return 'ℹ';
        }
    }
}
