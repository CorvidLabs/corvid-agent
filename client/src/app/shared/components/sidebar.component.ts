import {
    Component,
    ChangeDetectionStrategy,
    model,
    inject,
    ElementRef,
    viewChild,
    AfterViewInit,
    OnDestroy,
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
                        #firstLink>
                        Dashboard
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/projects"
                        routerLinkActive="sidebar__link--active">
                        Projects
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/agents"
                        routerLinkActive="sidebar__link--active">
                        Agents
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/councils"
                        routerLinkActive="sidebar__link--active">
                        Councils
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/wallets"
                        routerLinkActive="sidebar__link--active">
                        Wallets
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/feed"
                        routerLinkActive="sidebar__link--active">
                        Feed
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/sessions"
                        routerLinkActive="sidebar__link--active">
                        Sessions
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/work-tasks"
                        routerLinkActive="sidebar__link--active">
                        Work Tasks
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/schedules"
                        routerLinkActive="sidebar__link--active">
                        Schedules
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/analytics"
                        routerLinkActive="sidebar__link--active">
                        Analytics
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/logs"
                        routerLinkActive="sidebar__link--active">
                        Logs
                    </a>
                </li>
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/settings"
                        routerLinkActive="sidebar__link--active">
                        Settings
                    </a>
                </li>

            </ul>
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
        }
    `,
    host: {
        '(document:keydown.escape)': 'onEscape()',
    },
})
export class SidebarComponent implements AfterViewInit, OnDestroy {
    /** Two-way binding with parent for open/close state */
    readonly sidebarOpen = model(false);

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

    protected onEscape(): void {
        this.closeSidebar();
    }
}
