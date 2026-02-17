import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('NotificationService', () => {
    let service: NotificationService;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false });

        TestBed.configureTestingModule({});
        service = TestBed.inject(NotificationService);
    });

    afterEach(() => {
        service.dismissAll();
        vi.useRealTimers();
    });

    // ──────────────────────────────────────────────
    // Initial state
    // ──────────────────────────────────────────────
    it('should start with empty notifications', () => {
        expect(service.notifications()).toEqual([]);
        expect(service.hasNotifications()).toBe(false);
    });

    // ──────────────────────────────────────────────
    // Adding notifications
    // ──────────────────────────────────────────────
    it('should add a notification via success()', () => {
        service.success('Operation completed');

        const notifications = service.notifications();
        expect(notifications).toHaveLength(1);
        expect(notifications[0].type).toBe('success');
        expect(notifications[0].message).toBe('Operation completed');
        expect(service.hasNotifications()).toBe(true);
    });

    // ──────────────────────────────────────────────
    // Dismiss single
    // ──────────────────────────────────────────────
    it('should dismiss a single notification by id', () => {
        service.success('First');
        service.error('Second');

        const notifications = service.notifications();
        expect(notifications).toHaveLength(2);

        // Dismiss the first one (newest is first due to prepend)
        const idToDismiss = notifications[0].id;
        service.dismiss(idToDismiss);

        const remaining = service.notifications();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).not.toBe(idToDismiss);
    });

    // ──────────────────────────────────────────────
    // Dismiss all
    // ──────────────────────────────────────────────
    it('should dismiss all notifications via dismissAll()', () => {
        service.success('One');
        service.warning('Two');
        service.info('Three');

        expect(service.notifications()).toHaveLength(3);

        service.dismissAll();

        expect(service.notifications()).toEqual([]);
        expect(service.hasNotifications()).toBe(false);
    });

    // ──────────────────────────────────────────────
    // Max visible cap
    // ──────────────────────────────────────────────
    it('should cap visible notifications at 5', () => {
        service.error('One');
        service.error('Two');
        service.error('Three');
        service.error('Four');
        service.error('Five');
        service.error('Six');

        // Using error type because it has duration=0 (no auto-dismiss)
        const visible = service.notifications();
        expect(visible).toHaveLength(5);
    });
});
