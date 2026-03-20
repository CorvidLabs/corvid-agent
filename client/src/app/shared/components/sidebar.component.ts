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
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';

/** Section definition with routes for auto-expand */
interface SidebarSection {
    key: string;
    label: string;
    collapsible: boolean;
    defaultCollapsed: boolean;
    routes: string[];
}

const SECTIONS: SidebarSection[] = [
    { key: 'core', label: 'Core', collapsible: false, defaultCollapsed: false, routes: ['/chat', '/dashboard', '/agents', '/projects', '/models', '/personas', '/skill-bundles'] },
    { key: 'sessions', label: 'Sessions', collapsible: true, defaultCollapsed: false, routes: ['/sessions', '/work-tasks', '/councils'] },
    { key: 'observe', label: 'Observe', collapsible: true, defaultCollapsed: false, routes: ['/feed', '/analytics', '/logs', '/brain-viewer', '/reputation'] },
    { key: 'automate', label: 'Automate', collapsible: true, defaultCollapsed: true, routes: ['/schedules', '/workflows', '/webhooks', '/mention-polling', '/mcp-servers'] },
    { key: 'config', label: 'Settings', collapsible: true, defaultCollapsed: true, routes: ['/settings', '/security', '/allowlist', '/github-allowlist', '/repo-blocklist', '/wallets', '/spending', '/marketplace'] },
];

const STORAGE_KEY = 'sidebar_sections_collapsed';

@Component({
    selector: 'app-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive],
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
                        aria-current="page"
                        title="Chat"
                        #firstLink>
                        <span class="sidebar__label">Chat</span>
                        <span class="sidebar__abbr">Ch</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/dashboard" routerLinkActive="sidebar__link--active" title="Dashboard">
                        <span class="sidebar__label">Dashboard</span>
                        <span class="sidebar__abbr">D</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/agents" routerLinkActive="sidebar__link--active" title="Agents">
                        <span class="sidebar__label">Agents</span>
                        <span class="sidebar__abbr">A</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/projects" routerLinkActive="sidebar__link--active" title="Projects">
                        <span class="sidebar__label">Projects</span>
                        <span class="sidebar__abbr">P</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/models" routerLinkActive="sidebar__link--active" title="Models">
                        <span class="sidebar__label">Models</span>
                        <span class="sidebar__abbr">M</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/personas" routerLinkActive="sidebar__link--active" title="Personas">
                        <span class="sidebar__label">Personas</span>
                        <span class="sidebar__abbr">Ps</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/skill-bundles" routerLinkActive="sidebar__link--active" title="Skill Bundles">
                        <span class="sidebar__label">Skill Bundles</span>
                        <span class="sidebar__abbr">Sk</span>
                    </a>
                </li>

                <!-- Sessions (collapsible) -->
                <li class="sidebar__section sidebar__section--collapsible">
                    <button
                        class="sidebar__section-toggle"
                        (click)="toggleSection('sessions')"
                        (keydown.space)="$event.preventDefault(); toggleSection('sessions')"
                        [attr.aria-expanded]="!isSectionCollapsed('sessions')"
                        aria-controls="sidebar-section-sessions"
                        type="button">
                        <span class="sidebar__chevron" [class.sidebar__chevron--open]="!isSectionCollapsed('sessions')">&#x25B8;</span>
                        <span class="sidebar__section-label">Sessions</span>
                    </button>
                </li>
                <li class="sidebar__section-items"
                    [class.sidebar__section-items--collapsed]="isSectionCollapsed('sessions')"
                    id="sidebar-section-sessions"
                    role="group"
                    aria-label="Sessions navigation">
                    <ul class="sidebar__section-list">
                        <li>
                            <a class="sidebar__link" routerLink="/sessions" routerLinkActive="sidebar__link--active" title="Conversations">
                                <span class="sidebar__label">Conversations</span>
                                <span class="sidebar__abbr">Ch</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/work-tasks" routerLinkActive="sidebar__link--active" title="Work Tasks">
                                <span class="sidebar__label">Work Tasks</span>
                                <span class="sidebar__abbr">Wt</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/councils" routerLinkActive="sidebar__link--active" title="Councils">
                                <span class="sidebar__label">Councils</span>
                                <span class="sidebar__abbr">Co</span>
                            </a>
                        </li>
                    </ul>
                </li>

                <!-- Observe (collapsible) -->
                <li class="sidebar__section sidebar__section--collapsible">
                    <button
                        class="sidebar__section-toggle"
                        (click)="toggleSection('observe')"
                        (keydown.space)="$event.preventDefault(); toggleSection('observe')"
                        [attr.aria-expanded]="!isSectionCollapsed('observe')"
                        aria-controls="sidebar-section-observe"
                        type="button">
                        <span class="sidebar__chevron" [class.sidebar__chevron--open]="!isSectionCollapsed('observe')">&#x25B8;</span>
                        <span class="sidebar__section-label">Observe</span>
                    </button>
                </li>
                <li class="sidebar__section-items"
                    [class.sidebar__section-items--collapsed]="isSectionCollapsed('observe')"
                    id="sidebar-section-observe"
                    role="group"
                    aria-label="Observe navigation">
                    <ul class="sidebar__section-list">
                        <li>
                            <a class="sidebar__link" routerLink="/feed" routerLinkActive="sidebar__link--active" title="Live Feed">
                                <span class="sidebar__label">Live Feed</span>
                                <span class="sidebar__abbr">F</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/analytics" routerLinkActive="sidebar__link--active" title="Analytics">
                                <span class="sidebar__label">Analytics</span>
                                <span class="sidebar__abbr">An</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/logs" routerLinkActive="sidebar__link--active" title="Logs">
                                <span class="sidebar__label">Logs</span>
                                <span class="sidebar__abbr">L</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/brain-viewer" routerLinkActive="sidebar__link--active" title="Brain Viewer">
                                <span class="sidebar__label">Brain Viewer</span>
                                <span class="sidebar__abbr">Br</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/reputation" routerLinkActive="sidebar__link--active" title="Reputation">
                                <span class="sidebar__label">Reputation</span>
                                <span class="sidebar__abbr">R</span>
                            </a>
                        </li>
                    </ul>
                </li>

                <!-- Automate (collapsible, collapsed by default) -->
                <li class="sidebar__section sidebar__section--collapsible">
                    <button
                        class="sidebar__section-toggle"
                        (click)="toggleSection('automate')"
                        (keydown.space)="$event.preventDefault(); toggleSection('automate')"
                        [attr.aria-expanded]="!isSectionCollapsed('automate')"
                        aria-controls="sidebar-section-automate"
                        type="button">
                        <span class="sidebar__chevron" [class.sidebar__chevron--open]="!isSectionCollapsed('automate')">&#x25B8;</span>
                        <span class="sidebar__section-label">Automate</span>
                    </button>
                </li>
                <li class="sidebar__section-items"
                    [class.sidebar__section-items--collapsed]="isSectionCollapsed('automate')"
                    id="sidebar-section-automate"
                    role="group"
                    aria-label="Automate navigation">
                    <ul class="sidebar__section-list">
                        <li>
                            <a class="sidebar__link" routerLink="/schedules" routerLinkActive="sidebar__link--active" title="Schedules">
                                <span class="sidebar__label">Schedules</span>
                                <span class="sidebar__abbr">Sc</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/workflows" routerLinkActive="sidebar__link--active" title="Workflows">
                                <span class="sidebar__label">Workflows</span>
                                <span class="sidebar__abbr">Wf</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/webhooks" routerLinkActive="sidebar__link--active" title="Webhooks">
                                <span class="sidebar__label">Webhooks</span>
                                <span class="sidebar__abbr">Wh</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/mention-polling" routerLinkActive="sidebar__link--active" title="Mention Polling">
                                <span class="sidebar__label">Polling</span>
                                <span class="sidebar__abbr">Mp</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/mcp-servers" routerLinkActive="sidebar__link--active" title="MCP Servers">
                                <span class="sidebar__label">MCP Servers</span>
                                <span class="sidebar__abbr">Mc</span>
                            </a>
                        </li>
                    </ul>
                </li>

                <!-- Settings (collapsible, collapsed by default) -->
                <li class="sidebar__section sidebar__section--collapsible">
                    <button
                        class="sidebar__section-toggle"
                        (click)="toggleSection('config')"
                        (keydown.space)="$event.preventDefault(); toggleSection('config')"
                        [attr.aria-expanded]="!isSectionCollapsed('config')"
                        aria-controls="sidebar-section-config"
                        type="button">
                        <span class="sidebar__chevron" [class.sidebar__chevron--open]="!isSectionCollapsed('config')">&#x25B8;</span>
                        <span class="sidebar__section-label">Settings</span>
                    </button>
                </li>
                <li class="sidebar__section-items"
                    [class.sidebar__section-items--collapsed]="isSectionCollapsed('config')"
                    id="sidebar-section-config"
                    role="group"
                    aria-label="Settings navigation">
                    <ul class="sidebar__section-list">
                        <li>
                            <a class="sidebar__link" routerLink="/settings" routerLinkActive="sidebar__link--active" title="General">
                                <span class="sidebar__label">General</span>
                                <span class="sidebar__abbr">S</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/security" routerLinkActive="sidebar__link--active" title="Security">
                                <span class="sidebar__label">Security</span>
                                <span class="sidebar__abbr">Se</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/wallets" routerLinkActive="sidebar__link--active" title="Wallets">
                                <span class="sidebar__label">Wallets</span>
                                <span class="sidebar__abbr">W</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/spending" routerLinkActive="sidebar__link--active" title="Spending">
                                <span class="sidebar__label">Spending</span>
                                <span class="sidebar__abbr">$</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/allowlist" routerLinkActive="sidebar__link--active" title="AlgoChat Allowlist">
                                <span class="sidebar__label">Allowlist</span>
                                <span class="sidebar__abbr">Al</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/github-allowlist" routerLinkActive="sidebar__link--active" title="GitHub Allowlist">
                                <span class="sidebar__label">GH Allowlist</span>
                                <span class="sidebar__abbr">Gh</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/repo-blocklist" routerLinkActive="sidebar__link--active" title="Repo Blocklist">
                                <span class="sidebar__label">Repo Blocklist</span>
                                <span class="sidebar__abbr">Bl</span>
                            </a>
                        </li>
                        <li>
                            <a class="sidebar__link" routerLink="/marketplace" routerLinkActive="sidebar__link--active" title="Marketplace">
                                <span class="sidebar__label">Marketplace</span>
                                <span class="sidebar__abbr">Mk</span>
                            </a>
                        </li>
                    </ul>
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
    `,
    styles: `
        /* Desktop (default) */
        .sidebar-backdrop {
            display: none;
        }
        .sidebar {
            width: 200px;
            background: linear-gradient(180deg, rgba(15, 16, 24, 0.95) 0%, rgba(10, 10, 18, 0.98) 100%);
            min-height: 100%;
            padding: 1rem 0;
            border-right: 1px solid rgba(255, 255, 255, 0.04);
            display: flex;
            flex-direction: column;
            transition: width 0.2s ease;
            overflow-y: auto;
        }
        .sidebar__list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .sidebar__link {
            display: block;
            padding: 0.75rem 1.5rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.85rem;
            letter-spacing: 0.03em;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            border-left: 3px solid transparent;
        }
        @media (hover: hover) {
            .sidebar__link:hover {
                background: var(--bg-hover);
                color: var(--accent-cyan);
            }
        }
        .sidebar__link--active {
            color: var(--accent-cyan);
            background: linear-gradient(90deg, rgba(0, 229, 255, 0.08) 0%, transparent 100%);
            border-left: 3px solid var(--accent-cyan);
            text-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
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
            padding: 0.5rem 1.5rem 0.2rem;
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
            border-radius: 3px;
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
            transition: max-height 150ms ease, opacity 150ms ease;
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
            padding: 0.6rem 1.5rem;
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
            width: 48px;
        }
        .sidebar--collapsed .sidebar__label {
            display: none;
        }
        .sidebar--collapsed .sidebar__abbr {
            display: inline;
        }
        .sidebar--collapsed .sidebar__link {
            padding: 0.75rem 0;
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
                background: rgba(0, 0, 0, 0.6);
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
                padding: 0.75rem 1.5rem;
                text-align: left;
                border-left-width: 3px;
            }
            .sidebar--collapsed .sidebar__section {
                padding: 0.5rem 1.5rem 0.2rem;
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

    /** Section collapsed states — persisted in localStorage */
    readonly sectionStates = signal<Record<string, boolean>>(this.loadSectionStates());

    private readonly router = inject(Router);
    private readonly shortcutsService = inject(KeyboardShortcutsService);
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
