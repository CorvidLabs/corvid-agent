import {
    Component,
    ChangeDetectionStrategy,
    model,
    inject,
    ElementRef,
    viewChild,
    AfterViewInit,
    OnDestroy,
    signal,
    computed,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';
import { WidgetLayoutService } from '../../core/services/widget-layout.service';
import { ResizeHandleComponent } from './resize-handle.component';

/** Section definition with routes for auto-expand */
interface SidebarSection {
    key: string;
    label: string;
    collapsible: boolean;
    defaultCollapsed: boolean;
    routes: string[];
}

const SECTIONS: SidebarSection[] = [
    { key: 'core', label: 'Core', collapsible: false, defaultCollapsed: false, routes: ['/chat', '/agents', '/observe'] },
    { key: 'sessions', label: 'Sessions', collapsible: true, defaultCollapsed: false, routes: ['/sessions'] },
    { key: 'config', label: 'Settings', collapsible: true, defaultCollapsed: false, routes: ['/settings'] },
];

const STORAGE_KEY = 'sidebar_sections_collapsed';

@Component({
    selector: 'app-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive, ResizeHandleComponent],
    template: `
        @if (sidebarOpen()) {
            <div
                class="sidebar-backdrop"
                aria-hidden="true"
                (click)="closeSidebar()">
            </div>
        }
        <nav
            class="sidebar"
            [class.sidebar--open]="sidebarOpen()"
            [class.sidebar--collapsed]="collapsed()"
            [style.width.px]="effectiveWidth()"
            role="navigation"
            aria-label="Main navigation"
            #sidebarEl>
            <ul class="sidebar__list">
                <!-- Core -->
                <li class="sidebar__section">
                    <span class="sidebar__section-label">Core</span>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/chat"
                        routerLinkActive="sidebar__link--active"
                        [routerLinkActiveOptions]="{exact: true}"
                        aria-current="page"
                        title="Chat"
                        #firstLink>
                        <span class="sidebar__label">Chat</span>
                        <span class="sidebar__abbr">Ch</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/sessions" routerLinkActive="sidebar__link--active" title="Sessions">
                        <span class="sidebar__label">Sessions</span>
                        <span class="sidebar__abbr">S</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/agents" routerLinkActive="sidebar__link--active" title="Agents">
                        <span class="sidebar__label">Agents</span>
                        <span class="sidebar__abbr">A</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/observe" routerLinkActive="sidebar__link--active" title="Observe">
                        <span class="sidebar__label">Observe</span>
                        <span class="sidebar__abbr">O</span>
                    </a>
                </li>

                <!-- Settings -->
                <li class="sidebar__section">
                    <span class="sidebar__section-label">Config</span>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/settings" routerLinkActive="sidebar__link--active" title="Settings">
                        <span class="sidebar__label">Settings</span>
                        <span class="sidebar__abbr">Se</span>
                    </a>
                </li>
            </ul>
            <button
                class="sidebar__help-btn"
                (click)="openHelp()"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
                type="button">
                <span class="sidebar__label">Help</span>
                <span class="sidebar__abbr">?</span>
            </button>
            <button
                class="sidebar__collapse-btn"
                (click)="toggleCollapse()"
                [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
                [attr.title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
                {{ collapsed() ? '\u00BB' : '\u00AB' }}
            </button>
        </nav>
        @if (!collapsed()) {
            <app-resize-handle position="right" (resized)="onResize($event)" (resizeEnd)="onResizeEnd()" />
        }
    `,
    styles: `
        :host {
            display: flex;
            flex-shrink: 0;
        }

        /* Desktop (default) */
        .sidebar-backdrop {
            display: none;
        }
        .sidebar {
            width: 100%;
            background: var(--glass-bg-solid);
            min-height: 100%;
            padding: var(--space-4) 0;
            border-right: 1px solid var(--border-subtle);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .sidebar__list {
            list-style: none;
            margin: 0;
            padding: 0;
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--border-bright) transparent;
        }
        .sidebar__link {
            display: flex;
            align-items: center;
            padding: var(--space-3) var(--space-6);
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.85rem;
            letter-spacing: 0.03em;
            transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, text-shadow 0.2s ease, padding-left 0.15s ease;
            border-left: 3px solid transparent;
            position: relative;
        }
        /* Hover glow line indicator */
        .sidebar__link::before {
            content: '';
            position: absolute;
            left: 0;
            top: 25%;
            bottom: 25%;
            width: 3px;
            background: var(--accent-cyan);
            transform: scaleY(0);
            transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
            border-radius: 0 2px 2px 0;
        }
        @media (hover: hover) {
            .sidebar__link:hover {
                background: var(--bg-hover);
                color: var(--accent-cyan);
                padding-left: 1.65rem;
            }
            .sidebar__link:hover::before {
                transform: scaleY(1);
            }
        }
        .sidebar__link--active {
            color: var(--accent-cyan);
            background: linear-gradient(90deg, var(--accent-cyan-subtle) 0%, transparent 100%);
            border-left: 3px solid var(--accent-cyan);
            text-shadow: 0 0 8px var(--accent-cyan-border);
            animation: sidebarActiveGlow 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes sidebarActiveGlow {
            from {
                background: transparent;
                border-left-color: transparent;
                padding-left: var(--space-4);
            }
            to {
                padding-left: var(--space-6);
            }
        }
        .sidebar__link--active::before {
            display: none;
        }
        .sidebar__divider {
            height: 1px;
            background: var(--border);
            margin: 0.5rem 1.5rem;
            list-style: none;
        }

        /* Section headers */
        .sidebar__section {
            list-style: none;
            padding: var(--space-2) var(--space-6) 0.2rem;
            margin-top: 0.4rem;
            border-top: 1px solid var(--border);
        }
        .sidebar__section:first-of-type {
            margin-top: 0;
            border-top: none;
        }
        .sidebar__section-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-tertiary);
            font-weight: 600;
        }

        /* Collapsible section toggle button */
        .sidebar__section-toggle {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            width: 100%;
            padding: 0;
            margin: 0;
            background: none;
            border: none;
            cursor: pointer;
            font-family: inherit;
            color: inherit;
            border-radius: var(--radius-sm);
        }
        .sidebar__section-toggle:hover .sidebar__section-label {
            color: var(--text-secondary);
        }
        .sidebar__section-toggle:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
        }

        /* Chevron indicator */
        .sidebar__chevron {
            font-size: 0.55rem;
            color: var(--text-tertiary);
            transition: transform 150ms ease;
            display: inline-block;
            line-height: 1;
        }
        .sidebar__chevron--open {
            transform: rotate(90deg);
        }

        /* Section items container (CSS-animated collapse) */
        .sidebar__section-items {
            list-style: none;
            padding: 0;
            margin: 0;
            overflow: hidden;
            max-height: 500px;
            opacity: 1;
            transition:
                max-height var(--motion-collapse-duration) var(--motion-ease-out),
                opacity calc(var(--motion-collapse-duration) * 0.85) var(--motion-ease-out);
        }
        .sidebar__section-items--collapsed {
            max-height: 0;
            opacity: 0;
        }
        .sidebar__section-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        /* Abbreviation labels (hidden by default) */
        .sidebar__abbr {
            display: none;
        }

        /* Help button */
        .sidebar__help-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: auto;
            padding: 0.6rem var(--space-6);
            background: transparent;
            border: none;
            border-top: 1px solid var(--border);
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 0.75rem;
            font-family: inherit;
            font-weight: 600;
            letter-spacing: 0.04em;
            transition: color 0.15s, background 0.15s;
        }
        .sidebar__help-btn:hover {
            color: var(--accent-cyan);
            background: var(--bg-hover);
        }
        .sidebar__help-btn:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: -2px;
        }

        /* Collapse toggle button */
        .sidebar__collapse-btn {
            padding: 0.6rem;
            background: transparent;
            border: none;
            border-top: 1px solid var(--border);
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 0.9rem;
            font-family: inherit;
            transition: color 0.15s, background 0.15s;
        }
        .sidebar__collapse-btn:hover {
            color: var(--accent-cyan);
            background: var(--bg-hover);
        }

        /* Collapsed state (desktop) */
        .sidebar--collapsed {
            width: 48px !important;
        }
        .sidebar--collapsed .sidebar__label {
            display: none;
        }
        .sidebar--collapsed .sidebar__abbr {
            display: inline;
        }
        .sidebar--collapsed .sidebar__link {
            padding: var(--space-3) 0;
            text-align: center;
            border-left-width: 2px;
        }
        .sidebar--collapsed .sidebar__link--active {
            border-left-width: 2px;
        }
        .sidebar--collapsed .sidebar__section {
            padding: 0.3rem 0;
        }
        .sidebar--collapsed .sidebar__section-label {
            display: none;
        }
        .sidebar--collapsed .sidebar__chevron {
            display: none;
        }
        .sidebar--collapsed .sidebar__section-toggle {
            justify-content: center;
        }

        /* Touch: ensure 44px minimum tap targets */
        @media (pointer: coarse) {
            .sidebar__link { min-height: 44px; display: flex; align-items: center; }
            .sidebar__section-toggle { min-height: 44px; }
            .sidebar__help-btn { min-height: 44px; }
            .sidebar__collapse-btn { min-height: 44px; }
        }
        /* Mobile (<768px): slide-out overlay */
        @media (max-width: 767px) {
            .sidebar-backdrop {
                display: block;
                position: fixed;
                inset: 0;
                background: var(--overlay);
                backdrop-filter: blur(2px);
                z-index: 999;
            }
            .sidebar {
                position: fixed;
                top: 0;
                left: 0;
                bottom: 0;
                width: 280px;
                z-index: 1000;
                transform: translateX(-100%);
                transition: transform 0.25s ease;
                min-height: auto;
                height: 100%;
                overflow-y: auto;
            }
            .sidebar--open {
                transform: translateX(0);
            }
            .sidebar--collapsed {
                width: 280px;
            }
            .sidebar--collapsed .sidebar__label {
                display: inline;
            }
            .sidebar--collapsed .sidebar__abbr {
                display: none;
            }
            .sidebar--collapsed .sidebar__link {
                padding: var(--space-3) var(--space-6);
                text-align: left;
                border-left-width: 3px;
            }
            .sidebar--collapsed .sidebar__section {
                padding: var(--space-2) var(--space-6) 0.2rem;
            }
            .sidebar--collapsed .sidebar__section-label {
                display: inline;
            }
            .sidebar--collapsed .sidebar__chevron {
                display: inline-block;
            }
            .sidebar__collapse-btn {
                display: none;
            }
        }
    `,
    host: {
        '(document:keydown.escape)': 'onEscape()',
        '(document:keydown.tab)': 'onTab($event)',
    },
})
export class SidebarComponent implements AfterViewInit, OnDestroy {
    /** Two-way binding with parent for open/close state */
    readonly sidebarOpen = model(false);

    /** Collapsed state — persisted in localStorage; auto-collapse for normal audience */
    readonly collapsed = signal(this.loadCollapsed());

    /** Custom width — persisted in localStorage */
    readonly customWidth = signal(this.loadWidth());

    /** Effective width considering collapsed state */
    readonly effectiveWidth = computed(() => this.collapsed() ? 48 : this.customWidth());

    /** Section collapsed states — persisted in localStorage */
    readonly sectionStates = signal<Record<string, boolean>>(this.loadSectionStates());

    private readonly router = inject(Router);
    private readonly shortcutsService = inject(KeyboardShortcutsService);
    private readonly widgetLayout = inject(WidgetLayoutService);
    private readonly firstLink = viewChild<ElementRef<HTMLAnchorElement>>('firstLink');
    private readonly sidebarEl = viewChild<ElementRef<HTMLElement>>('sidebarEl');
    private routerSub: Subscription | null = null;

    /** Reference to the hamburger button for focus return — set by parent */
    private hamburgerRef: HTMLElement | null = null;

    ngAfterViewInit(): void {
        // Close sidebar on navigation (route change) + auto-expand active section
        this.routerSub = this.router.events
            .pipe(filter((e) => e instanceof NavigationEnd))
            .subscribe((e) => {
                this.closeSidebar();
                this.autoExpandActiveSection((e as NavigationEnd).urlAfterRedirects);
            });

        // Auto-expand for current route on init
        this.autoExpandActiveSection(this.router.url);
    }

    ngOnDestroy(): void {
        this.routerSub?.unsubscribe();
    }

    /** Called by parent to supply hamburger element ref for focus return */
    setHamburgerRef(el: HTMLElement): void {
        this.hamburgerRef = el;
    }

    closeSidebar(): void {
        if (this.sidebarOpen()) {
            this.sidebarOpen.set(false);
            this.hamburgerRef?.focus();
        }
    }

    openSidebar(): void {
        this.sidebarOpen.set(true);
        setTimeout(() => {
            this.firstLink()?.nativeElement.focus();
        });
    }

    toggleCollapse(): void {
        const next = !this.collapsed();
        this.collapsed.set(next);
        localStorage.setItem('sidebar_collapsed', String(next));
    }

    /** Toggle a collapsible section */
    toggleSection(sectionKey: string): void {
        const current = this.sectionStates();
        const next = { ...current, [sectionKey]: !current[sectionKey] };
        this.sectionStates.set(next);
        this.saveSectionStates(next);
    }

    /** Check if a section is collapsed */
    isSectionCollapsed(sectionKey: string): boolean {
        return this.sectionStates()[sectionKey] ?? false;
    }

    onResize(delta: number): void {
        const current = this.customWidth();
        const next = Math.max(140, Math.min(400, current + delta));
        this.customWidth.set(next);
    }

    onResizeEnd(): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('sidebar_width', String(this.customWidth()));
        }
    }

    openHelp(): void {
        this.closeSidebar();
        this.shortcutsService.overlayOpen.set(true);
    }

    protected onEscape(): void {
        this.closeSidebar();
    }

    /** Focus trap: keep Tab cycling within the sidebar overlay on mobile */
    protected onTab(event: Event): void {
        if (!this.sidebarOpen()) return;
        // Only trap focus when sidebar is an overlay (mobile <768px)
        if (typeof window !== 'undefined' && window.innerWidth >= 768) return;

        const nav = this.sidebarEl()?.nativeElement;
        if (!nav) return;

        const focusable = nav.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const kbEvent = event as KeyboardEvent;

        if (kbEvent.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!kbEvent.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    private loadWidth(): number {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('sidebar_width');
            if (stored) {
                const val = parseInt(stored, 10);
                if (!isNaN(val) && val >= 140 && val <= 400) return val;
            }
        }
        return 200;
    }

    private loadCollapsed(): boolean {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('sidebar_collapsed');
            if (stored !== null) return stored === 'true';
        }
        return false;
    }

    /** Load section states from localStorage, falling back to defaults */
    private loadSectionStates(): Record<string, boolean> {
        const defaults: Record<string, boolean> = {};
        for (const section of SECTIONS) {
            if (section.collapsible) {
                defaults[section.key] = section.defaultCollapsed;
            }
        }

        if (typeof localStorage === 'undefined') return defaults;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, boolean>;
                return { ...defaults, ...parsed };
            }
        } catch {
            // Ignore malformed JSON
        }

        return defaults;
    }

    /** Save section states to localStorage */
    private saveSectionStates(states: Record<string, boolean>): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
        }
    }

    /** Auto-expand the section containing the active route */
    private autoExpandActiveSection(url: string): void {
        for (const section of SECTIONS) {
            if (!section.collapsible) continue;
            if (section.routes.some((route) => url.startsWith(route))) {
                if (this.isSectionCollapsed(section.key)) {
                    const current = this.sectionStates();
                    const next = { ...current, [section.key]: false };
                    this.sectionStates.set(next);
                    this.saveSectionStates(next);
                }
                break;
            }
        }
    }
}
