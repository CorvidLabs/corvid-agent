import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';
import type { NotificationType } from '../../core/models/notification.model';

@Component({
    selector: 'app-toast-container',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div
            class="toast-container"
            role="status"
            aria-live="polite"
            aria-relevant="additions removals">
            @for (n of notifications(); track n.id) {
                <div
                    class="toast"
                    [class]="'toast toast--' + n.type"
                    role="alert"
                    [attr.aria-label]="n.type + ': ' + n.message">
                    <span class="toast__icon" aria-hidden="true">{{ icon(n.type) }}</span>
                    <div class="toast__body">
                        <p class="toast__message">{{ n.message }}</p>
                        @if (n.detail) {
                            <p class="toast__detail">{{ n.detail }}</p>
                        }
                    </div>
                    <button
                        class="toast__close"
                        (click)="dismiss(n.id)"
                        aria-label="Dismiss notification"
                        type="button">
                        &times;
                    </button>
                </div>
            }
        </div>
    `,
    styles: `
        .toast-container {
            position: fixed;
            top: 1rem;
            right: 1rem;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            max-width: 420px;
            width: calc(100vw - 2rem);
            pointer-events: none;
        }

        .toast {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-radius: var(--radius);
            border: 1px solid;
            font-size: 0.8rem;
            pointer-events: auto;
            animation: toast-in 0.25s ease-out;
            backdrop-filter: blur(8px);
        }

        @keyframes toast-in {
            from {
                opacity: 0;
                transform: translateX(1rem);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        /* Type variants */
        .toast--success {
            background: rgba(0, 255, 136, 0.1);
            border-color: rgba(0, 255, 136, 0.3);
            color: var(--accent-green);
        }

        .toast--error {
            background: rgba(255, 51, 85, 0.12);
            border-color: rgba(255, 51, 85, 0.35);
            color: var(--accent-red);
        }

        .toast--warning {
            background: rgba(255, 170, 0, 0.1);
            border-color: rgba(255, 170, 0, 0.3);
            color: var(--accent-amber);
        }

        .toast--info {
            background: rgba(0, 229, 255, 0.1);
            border-color: rgba(0, 229, 255, 0.3);
            color: var(--accent-cyan);
        }

        .toast__icon {
            flex-shrink: 0;
            font-size: 1rem;
            line-height: 1;
            margin-top: 1px;
        }

        .toast__body {
            flex: 1;
            min-width: 0;
        }

        .toast__message {
            margin: 0;
            font-weight: 600;
            line-height: 1.3;
            color: inherit;
        }

        .toast__detail {
            margin: 0.25rem 0 0;
            font-size: 0.75rem;
            color: var(--text-secondary);
            line-height: 1.4;
            word-break: break-word;
        }

        .toast__close {
            flex-shrink: 0;
            background: none;
            border: none;
            color: inherit;
            font-size: 1.1rem;
            cursor: pointer;
            padding: 0 0.125rem;
            line-height: 1;
            opacity: 0.6;
            transition: opacity 0.15s;
        }

        .toast__close:hover {
            opacity: 1;
        }

        .toast__close:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 2px;
            border-radius: 2px;
        }

        /* Mobile: full-width bottom positioning */
        @media (max-width: 640px) {
            .toast-container {
                top: auto;
                bottom: 1rem;
                right: 0.5rem;
                left: 0.5rem;
                max-width: none;
                width: auto;
            }

            .toast {
                animation-name: toast-in-mobile;
            }

            @keyframes toast-in-mobile {
                from {
                    opacity: 0;
                    transform: translateY(0.5rem);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        }
    `,
})
export class ToastContainerComponent {
    private readonly notificationService = inject(NotificationService);

    readonly notifications = this.notificationService.notifications;

    icon(type: NotificationType): string {
        switch (type) {
            case 'success': return '✓';
            case 'error': return '✕';
            case 'warning': return '⚠';
            case 'info': return 'ℹ';
        }
    }

    dismiss(id: string): void {
        this.notificationService.dismiss(id);
    }
}
