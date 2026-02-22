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
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/dashboard"
                        routerLinkActive="sidebar__link--active"
                        aria-current="page"
                        title="Dashboard"
                        #firstLink>
                        <span class="sidebar__label">Dashboard</span>
                        <span class="sidebar__abbr">D</span>
                    </a>
                </li>

                <li class="sidebar__section"><span class="sidebar__section-label">Core</span></li>
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

                <li class="sidebar__section"><span class="sidebar__section-label">Sessions</span></li>
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

                <li class="sidebar__section"><span class="sidebar__section-label">Automation</span></li>
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

                <li class="sidebar__section"><span class="sidebar__section-label">Integrations</span></li>
                <li>
                    <a class="sidebar__link" routerLink="/mcp-servers" routerLinkActive="sidebar__link--active" title="MCP Servers">
                        <span class="sidebar__label">MCP Servers</span>
                        <span class="sidebar__abbr">Mc</span>
                    </a>
                </li>

                <li class="sidebar__section"><span class="sidebar__section-label">Monitoring</span></li>
                <li>
                    <a class="sidebar__link" routerLink="/feed" routerLinkActive="sidebar__link--active" title="Feed">
                        <span class="sidebar__label">Feed</span>
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

                <li class="sidebar__section"><span class="sidebar__section-label">Community</span></li>
                <li>
                    <a class="sidebar__link" routerLink="/reputation" routerLinkActive="sidebar__link--active" title="Reputation">
                        <span class="sidebar__label">Reputation</span>
                        <span class="sidebar__abbr">R</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/marketplace" routerLinkActive="sidebar__link--active" title="Marketplace">
                        <span class="sidebar__label">Marketplace</span>
                        <span class="sidebar__abbr">Mk</span>
                    </a>
                </li>

                <li class="sidebar__section"><span class="sidebar__section-label">Config</span></li>
                <li>
                    <a class="sidebar__link" routerLink="/wallets" routerLinkActive="sidebar__link--active" title="Wallets">
                        <span class="sidebar__label">Wallets</span>
                        <span class="sidebar__abbr">W</span>
                    </a>
                </li>
                <li>
                    <a class="sidebar__link" routerLink="/settings" routerLinkActive="sidebar__link--active" title="Settings">
                        <span class="sidebar__label">Settings</span>
                        <span class="sidebar__abbr">S</span>
                    </a>
                </li>
            </ul>
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
        /* ── Desktop (default) ── */
        .sidebar-backdrop {
            display: none;
        }
        .sidebar {
            width: 200px;
            background: var(--bg-surface);
            min-height: 100%;
            padding: 1rem 0;
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            transition: width 0.2s ease;
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
        /* Guard hover effects for pointer devices only */
        @media (hover: hover) {
            .sidebar__link:hover {
                background: var(--bg-hover);
                color: var(--accent-cyan);
            }
        }
        .sidebar__link--active {
            color: var(--accent-cyan);
            background: var(--bg-raised);
            border-left: 3px solid var(--accent-cyan);
            text-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
        }
        .sidebar__divider {
            height: 1px;
            background: var(--border);
            margin: 0.5rem 1.5rem;
            list-style: none;
        }

        /* ── Section headers ── */
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

        /* ── Abbreviation labels (hidden by default) ── */
        .sidebar__abbr {
            display: none;
        }

        /* ── Collapse toggle button ── */
        .sidebar__collapse-btn {
            margin-top: auto;
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

        /* ── Collapsed state (desktop) ── */
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

        /* ── Mobile (<768px): slide-out overlay ── */
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
            /* Ignore collapsed state on mobile — full overlay always */
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
            .sidebar__collapse-btn {
                display: none;
            }
        }
    `,
    host: {
        '(document:keydown.escape)': 'onEscape()',
    },
})
export class SidebarComponent implements AfterViewInit, OnDestroy {
    /** Two-way binding with parent for open/close state */
    readonly sidebarOpen = model(false);

    /** Collapsed state — persisted in localStorage */
    readonly collapsed = signal(
        typeof localStorage !== 'undefined' && localStorage.getItem('sidebar_collapsed') === 'true',
    );

    private readonly router = inject(Router);
    private readonly firstLink = viewChild<ElementRef<HTMLAnchorElement>>('firstLink');
    private routerSub: Subscription | null = null;

    /** Reference to the hamburger button for focus return — set by parent */
    private hamburgerRef: HTMLElement | null = null;

    ngAfterViewInit(): void {
        // Close sidebar on navigation (route change)
        this.routerSub = this.router.events
            .pipe(filter((e) => e instanceof NavigationEnd))
            .subscribe(() => {
                this.closeSidebar();
            });
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
            // Return focus to hamburger button
            this.hamburgerRef?.focus();
        }
    }

    openSidebar(): void {
        this.sidebarOpen.set(true);
        // Focus first nav link when sidebar opens
        setTimeout(() => {
            this.firstLink()?.nativeElement.focus();
        });
    }

    toggleCollapse(): void {
        const next = !this.collapsed();
        this.collapsed.set(next);
        localStorage.setItem('sidebar_collapsed', String(next));
    }

    protected onEscape(): void {
        this.closeSidebar();
    }
}
