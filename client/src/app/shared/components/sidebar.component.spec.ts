import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('SidebarComponent', () => {
    let fixture: ComponentFixture<SidebarComponent>;
    let component: SidebarComponent;
    let hostEl: HTMLElement;

    /** Minimal localStorage stub for jsdom environments where it may not be available */
    const store = new Map<string, string>();
    const localStorageMock = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (_index: number) => null,
    };

    beforeEach(() => {
        store.clear();

        // Ensure localStorage is available in the test environment
        if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.removeItem !== 'function') {
            Object.defineProperty(globalThis, 'localStorage', {
                value: localStorageMock,
                writable: true,
                configurable: true,
            });
        } else {
            globalThis.localStorage.removeItem('sidebar_collapsed');
        }

        TestBed.configureTestingModule({
            imports: [SidebarComponent],
            providers: [provideRouter([])],
        });

        fixture = TestBed.createComponent(SidebarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
    });

    afterEach(() => {
        fixture.destroy();
        store.clear();
        try {
            globalThis.localStorage.removeItem('sidebar_collapsed');
        } catch {
            // ignore if localStorage is not available
        }
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render navigation links', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBeGreaterThan(0);

        // Check that the first link is Dashboard
        const firstLabel = links[0].querySelector('.sidebar__label');
        expect(firstLabel).toBeTruthy();
        expect(firstLabel!.textContent!.trim()).toBe('Dashboard');
    });

    it('should have correct number of nav items', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBe(10);
    });

    // ──────────────────────────────────────────────
    // Toggle collapse
    // ──────────────────────────────────────────────
    it('should toggle collapsed state on toggleCollapse', () => {
        expect(component.collapsed()).toBe(false);

        component.toggleCollapse();
        fixture.detectChanges();

        expect(component.collapsed()).toBe(true);

        component.toggleCollapse();
        fixture.detectChanges();

        expect(component.collapsed()).toBe(false);
    });

    // ──────────────────────────────────────────────
    // Close sidebar
    // ──────────────────────────────────────────────
    it('should set sidebarOpen to false on closeSidebar', () => {
        // First open the sidebar
        component.sidebarOpen.set(true);
        fixture.detectChanges();
        expect(component.sidebarOpen()).toBe(true);

        // Close it
        component.closeSidebar();
        fixture.detectChanges();

        expect(component.sidebarOpen()).toBe(false);
    });
});
