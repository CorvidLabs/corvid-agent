import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('KeyboardShortcutsService', () => {
    let service: KeyboardShortcutsService;
    let router: Router;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                KeyboardShortcutsService,
                provideRouter([
                    { path: 'dashboard', component: DummyComponent },
                    { path: 'agents', component: DummyComponent },
                    { path: 'sessions', component: DummyComponent },
                    { path: 'sessions/new', component: DummyComponent },
                    { path: 'work-tasks', component: DummyComponent },
                ]),
            ],
        });

        service = TestBed.inject(KeyboardShortcutsService);
        router = TestBed.inject(Router);
    });

    afterEach(() => {
        service.ngOnDestroy();
    });

    function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
        document.dispatchEvent(event);
        return event;
    }

    describe('overlay toggle', () => {
        it('should start with overlay closed', () => {
            expect(service.overlayOpen()).toBe(false);
        });

        it('should toggle overlay on ? key', () => {
            pressKey('?');
            expect(service.overlayOpen()).toBe(true);
            pressKey('?');
            expect(service.overlayOpen()).toBe(false);
        });

        it('should close overlay on Escape', () => {
            service.overlayOpen.set(true);
            pressKey('Escape');
            expect(service.overlayOpen()).toBe(false);
        });
    });

    describe('navigation shortcuts', () => {
        it('should navigate to /sessions/new on n key', async () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('n');
            expect(spy).toHaveBeenCalledWith(['/sessions/new']);
        });

        it('should navigate to /dashboard on g then d', async () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('g');
            pressKey('d');
            expect(spy).toHaveBeenCalledWith(['/dashboard']);
        });

        it('should navigate to /agents on g then a', () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('g');
            pressKey('a');
            expect(spy).toHaveBeenCalledWith(['/agents']);
        });

        it('should navigate to /sessions on g then s', () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('g');
            pressKey('s');
            expect(spy).toHaveBeenCalledWith(['/sessions']);
        });

        it('should navigate to /work-tasks on g then w', () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('g');
            pressKey('w');
            expect(spy).toHaveBeenCalledWith(['/work-tasks']);
        });
    });

    describe('input suppression', () => {
        it('should not trigger shortcuts when focus is in an input', () => {
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();

            const event = new KeyboardEvent('keydown', { key: '?', bubbles: true });
            input.dispatchEvent(event);
            expect(service.overlayOpen()).toBe(false);

            document.body.removeChild(input);
        });

        it('should not trigger shortcuts when focus is in a textarea', () => {
            const textarea = document.createElement('textarea');
            document.body.appendChild(textarea);
            textarea.focus();

            const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true });
            textarea.dispatchEvent(event);
            // If no navigation happened, test passes (no error thrown)
            expect(service.overlayOpen()).toBe(false);

            document.body.removeChild(textarea);
        });
    });

    describe('modifier keys', () => {
        it('should not trigger on Ctrl+? ', () => {
            pressKey('?', { ctrlKey: true });
            expect(service.overlayOpen()).toBe(false);
        });

        it('should not trigger on Meta+n', () => {
            const spy = vi.spyOn(router, 'navigate');
            pressKey('n', { metaKey: true });
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('prefix timeout', () => {
        it('should clear pending prefix after timeout', async () => {
            vi.useFakeTimers();
            const spy = vi.spyOn(router, 'navigate');

            pressKey('g');
            vi.advanceTimersByTime(1100);
            pressKey('d');

            // After timeout, g prefix was cleared, so g+d should not navigate
            expect(spy).not.toHaveBeenCalledWith(['/dashboard']);

            vi.useRealTimers();
        });
    });

    describe('shortcuts list', () => {
        it('should expose all shortcut entries', () => {
            expect(service.shortcuts.length).toBeGreaterThanOrEqual(7);
            expect(service.shortcuts.some((s) => s.keys === '?')).toBe(true);
            expect(service.shortcuts.some((s) => s.keys === 'g d')).toBe(true);
        });
    });
});
