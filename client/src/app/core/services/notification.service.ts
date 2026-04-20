import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationSnackComponent } from '../../shared/components/notification-snack.component';
import type { NotificationType } from '../models/notification.model';

/** Default auto-dismiss durations by type (ms) */
const DEFAULT_DURATION: Record<NotificationType, number> = {
    success: 4000,
    info: 4000,
    warning: 8000,
    error: 8000,
};

/** Panel CSS class per notification type */
const PANEL_CLASS: Record<NotificationType, string> = {
    success: 'notif-snack-panel--success',
    error: 'notif-snack-panel--error',
    warning: 'notif-snack-panel--warning',
    info: 'notif-snack-panel--info',
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly snackBar = inject(MatSnackBar);

    // ── Public API ──────────────────────────────────────────────

    success(message: string, detail?: string): void {
        this.show('success', message, detail);
    }

    error(message: string, detail?: string): void {
        this.show('error', message, detail);
    }

    warning(message: string, detail?: string): void {
        this.show('warning', message, detail);
    }

    info(message: string, detail?: string): void {
        this.show('info', message, detail);
    }

    /** Dismiss the current notification */
    dismiss(): void {
        this.snackBar.dismiss();
    }

    /** Dismiss all notifications (same as dismiss for MatSnackBar) */
    dismissAll(): void {
        this.snackBar.dismiss();
    }

    // ── Internals ───────────────────────────────────────────────

    private show(type: NotificationType, message: string, detail?: string): void {
        this.snackBar.openFromComponent(NotificationSnackComponent, {
            data: { type, message, detail },
            duration: DEFAULT_DURATION[type],
            panelClass: ['notif-snack-panel', PANEL_CLASS[type]],
            verticalPosition: 'bottom',
            horizontalPosition: 'right',
        });
    }
}
