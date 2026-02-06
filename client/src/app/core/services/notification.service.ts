import { Injectable, signal, computed } from '@angular/core';
import type { Notification, NotificationType } from '../models/notification.model';

/** Maximum notifications visible at once */
const MAX_VISIBLE = 5;

/** Default auto-dismiss durations by type (ms) */
const DEFAULT_DURATION: Record<NotificationType, number> = {
    success: 5000,
    info: 5000,
    warning: 8000,
    error: 0, // persistent — user must dismiss
};

let nextId = 0;

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly _notifications = signal<Notification[]>([]);
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

    /** All active notifications (newest first, capped) */
    readonly notifications = computed(() =>
        this._notifications().slice(0, MAX_VISIBLE),
    );

    /** True when at least one notification is showing */
    readonly hasNotifications = computed(() => this._notifications().length > 0);

    // ── Public API ──────────────────────────────────────────────

    success(message: string, detail?: string): void {
        this.add('success', message, detail);
    }

    error(message: string, detail?: string): void {
        this.add('error', message, detail);
    }

    warning(message: string, detail?: string): void {
        this.add('warning', message, detail);
    }

    info(message: string, detail?: string): void {
        this.add('info', message, detail);
    }

    /** Dismiss a single notification by id */
    dismiss(id: string): void {
        this.clearTimer(id);
        this._notifications.update((list) => list.filter((n) => n.id !== id));
    }

    /** Dismiss all notifications */
    dismissAll(): void {
        for (const id of this.timers.keys()) {
            this.clearTimer(id);
        }
        this._notifications.set([]);
    }

    // ── Internals ───────────────────────────────────────────────

    private add(type: NotificationType, message: string, detail?: string, durationOverride?: number): void {
        const id = `notif-${++nextId}`;
        const duration = durationOverride ?? DEFAULT_DURATION[type];

        const notification: Notification = {
            id,
            type,
            message,
            detail,
            duration,
            createdAt: Date.now(),
        };

        // Prepend so newest shows on top
        this._notifications.update((list) => [notification, ...list]);

        // Schedule auto-dismiss
        if (duration > 0) {
            const timer = setTimeout(() => this.dismiss(id), duration);
            this.timers.set(id, timer);
        }
    }

    private clearTimer(id: string): void {
        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
    }
}
