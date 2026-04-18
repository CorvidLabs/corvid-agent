import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('SidebarComponent', () => {
    let fixture: ComponentFixture<SidebarComponent>;
    let component: SidebarComponent;
    let hostEl: HTMLElement;

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

        if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.removeItem !== 'function') {
            Object.defineProperty(globalThis, 'localStorage', {
                value: localStorageMock,
                writable: true,
                configurable: true,
            });
        } else {
            globalThis.localStorage.removeItem('sidebar_collapsed');
            globalThis.localStorage.removeItem('sidebar_sections_collapsed');
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
            globalThis.localStorage.removeItem('sidebar_sections_collapsed');
        } catch {
            // ignore
        }
    });

    it('should render navigation links using Material nav list', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBeGreaterThan(0);
    });

    it('should render core nav items', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBe(5);
    });

    it('should have mat-nav-list in the DOM', () => {
        const navList = hostEl.querySelector('mat-nav-list');
        expect(navList).toBeTruthy();
    });

    it('should toggle collapsed state on toggleCollapse', () => {
        expect(component.collapsed()).toBe(false);
        component.toggleCollapse();
        fixture.detectChanges();
        expect(component.collapsed()).toBe(true);
        component.toggleCollapse();
        fixture.detectChanges();
        expect(component.collapsed()).toBe(false);
    });

    it('should set sidebarOpen to false on closeSidebar', () => {
        component.sidebarOpen.set(true);
        fixture.detectChanges();
        expect(component.sidebarOpen()).toBe(true);
        component.closeSidebar();
        fixture.detectChanges();
        expect(component.sidebarOpen()).toBe(false);
    });

    it('should toggle section collapsed state', () => {
        expect(component.isSectionCollapsed('sessions')).toBe(false);
        component.toggleSection('sessions');
        fixture.detectChanges();
        expect(component.isSectionCollapsed('sessions')).toBe(true);
        component.toggleSection('sessions');
        fixture.detectChanges();
        expect(component.isSectionCollapsed('sessions')).toBe(false);
    });

    it('should persist section states in localStorage', () => {
        component.toggleSection('sessions');
        fixture.detectChanges();
        const stored = globalThis.localStorage.getItem('sidebar_sections_collapsed');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed.sessions).toBe(true);
    });

    it('should restore section states from localStorage', () => {
        globalThis.localStorage.setItem(
            'sidebar_sections_collapsed',
            JSON.stringify({ sessions: true, config: false }),
        );
        const fixture2 = TestBed.createComponent(SidebarComponent);
        const component2 = fixture2.componentInstance;
        fixture2.detectChanges();
        expect(component2.isSectionCollapsed('sessions')).toBe(true);
        expect(component2.isSectionCollapsed('config')).toBe(false);
        fixture2.destroy();
    });

    it('should have role="navigation" on sidebar nav element', () => {
        const nav = hostEl.querySelector('nav');
        expect(nav!.getAttribute('role')).toBe('navigation');
    });

    it('should render section labels', () => {
        const sectionLabels = hostEl.querySelectorAll('.sidebar__section-label');
        expect(sectionLabels.length).toBeGreaterThan(0);
    });

    it('should apply sidebar--collapsed class when collapsed', () => {
        component.toggleCollapse();
        fixture.detectChanges();
        const nav = hostEl.querySelector('nav');
        expect(nav!.classList.contains('sidebar--collapsed')).toBe(true);
    });

    it('should apply sidebar--open class when sidebarOpen is true', () => {
        component.sidebarOpen.set(true);
        fixture.detectChanges();
        const nav = hostEl.querySelector('nav');
        expect(nav!.classList.contains('sidebar--open')).toBe(true);
    });
});
