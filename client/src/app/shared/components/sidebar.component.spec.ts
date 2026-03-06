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

    it('should render navigation links', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBeGreaterThan(0);
        const firstLabel = links[0].querySelector('.sidebar__label');
        expect(firstLabel).toBeTruthy();
        expect(firstLabel!.textContent!.trim()).toBe('Dashboard');
    });

    it('should render all nav items in DOM', () => {
        const links = hostEl.querySelectorAll('.sidebar__link');
        expect(links.length).toBe(25);
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

    it('should render collapsible section toggle buttons', () => {
        const toggles = hostEl.querySelectorAll('.sidebar__section-toggle');
        expect(toggles.length).toBe(6);
    });

    it('should have aria-expanded on collapsible section toggles', () => {
        const toggles = hostEl.querySelectorAll('.sidebar__section-toggle');
        for (const toggle of Array.from(toggles)) {
            expect(toggle.getAttribute('aria-expanded')).toBeTruthy();
        }
    });

    it('should have aria-controls linking to section content', () => {
        const toggles = hostEl.querySelectorAll('.sidebar__section-toggle');
        for (const toggle of Array.from(toggles)) {
            const controlsId = toggle.getAttribute('aria-controls');
            expect(controlsId).toBeTruthy();
            expect(controlsId).toMatch(/^sidebar-section-/);
        }
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

    it('should add collapsed CSS class when section is collapsed', () => {
        const sessionItems = hostEl.querySelector('#sidebar-section-sessions');
        expect(sessionItems).toBeTruthy();
        expect(sessionItems!.classList.contains('sidebar__section-items--collapsed')).toBe(false);
        component.toggleSection('sessions');
        fixture.detectChanges();
        expect(sessionItems!.classList.contains('sidebar__section-items--collapsed')).toBe(true);
    });

    it('should collapse automation and integrations by default', () => {
        expect(component.isSectionCollapsed('automation')).toBe(true);
        expect(component.isSectionCollapsed('integrations')).toBe(true);
        const automationItems = hostEl.querySelector('#sidebar-section-automation');
        const integrationsItems = hostEl.querySelector('#sidebar-section-integrations');
        expect(automationItems!.classList.contains('sidebar__section-items--collapsed')).toBe(true);
        expect(integrationsItems!.classList.contains('sidebar__section-items--collapsed')).toBe(true);
    });

    it('should keep sessions and monitoring open by default', () => {
        expect(component.isSectionCollapsed('sessions')).toBe(false);
        expect(component.isSectionCollapsed('monitoring')).toBe(false);
        const sessionItems = hostEl.querySelector('#sidebar-section-sessions');
        const monitoringItems = hostEl.querySelector('#sidebar-section-monitoring');
        expect(sessionItems!.classList.contains('sidebar__section-items--collapsed')).toBe(false);
        expect(monitoringItems!.classList.contains('sidebar__section-items--collapsed')).toBe(false);
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
            JSON.stringify({ sessions: true, automation: false }),
        );
        const fixture2 = TestBed.createComponent(SidebarComponent);
        const component2 = fixture2.componentInstance;
        fixture2.detectChanges();
        expect(component2.isSectionCollapsed('sessions')).toBe(true);
        expect(component2.isSectionCollapsed('automation')).toBe(false);
        fixture2.destroy();
    });

    it('should update aria-expanded when toggling sections', () => {
        const sessionsToggle = hostEl.querySelector('[aria-controls="sidebar-section-sessions"]');
        expect(sessionsToggle).toBeTruthy();
        expect(sessionsToggle!.getAttribute('aria-expanded')).toBe('true');
        component.toggleSection('sessions');
        fixture.detectChanges();
        expect(sessionsToggle!.getAttribute('aria-expanded')).toBe('false');
    });

    it('should render chevron indicators on collapsible sections', () => {
        const chevrons = hostEl.querySelectorAll('.sidebar__chevron');
        expect(chevrons.length).toBe(6);
    });

    it('should rotate chevron when section is expanded', () => {
        const sessionsToggle = hostEl.querySelector('[aria-controls="sidebar-section-sessions"]');
        const chevron = sessionsToggle!.querySelector('.sidebar__chevron');
        expect(chevron!.classList.contains('sidebar__chevron--open')).toBe(true);
        component.toggleSection('sessions');
        fixture.detectChanges();
        expect(chevron!.classList.contains('sidebar__chevron--open')).toBe(false);
    });

    it('should have role="navigation" on sidebar nav element', () => {
        const nav = hostEl.querySelector('nav');
        expect(nav!.getAttribute('role')).toBe('navigation');
    });

    it('should have role="group" on section items containers', () => {
        const groups = hostEl.querySelectorAll('[role="group"]');
        expect(groups.length).toBe(6);
    });
});
