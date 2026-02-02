import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
    selector: 'app-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive],
    template: `
        <nav class="sidebar" role="navigation" aria-label="Main navigation">
            <ul class="sidebar__list">
                <li>
                    <a
                        class="sidebar__link"
                        routerLink="/dashboard"
                        routerLinkActive="sidebar__link--active"
                        aria-current="page">
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
                        routerLink="/feed"
                        routerLinkActive="sidebar__link--active">
                        Live Feed
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
            </ul>
        </nav>
    `,
    styles: `
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
        .sidebar__link:hover {
            background: var(--bg-hover);
            color: var(--accent-cyan);
        }
        .sidebar__link--active {
            color: var(--accent-cyan);
            background: var(--bg-raised);
            border-left: 3px solid var(--accent-cyan);
            text-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
        }
    `,
})
export class SidebarComponent {}
