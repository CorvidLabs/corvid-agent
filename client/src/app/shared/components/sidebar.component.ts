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
            background: #0f172a;
            min-height: 100%;
            padding: 1rem 0;
        }
        .sidebar__list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .sidebar__link {
            display: block;
            padding: 0.75rem 1.5rem;
            color: #94a3b8;
            text-decoration: none;
            font-size: 0.9rem;
            transition: background 0.15s, color 0.15s;
        }
        .sidebar__link:hover {
            background: #1e293b;
            color: #e2e8f0;
        }
        .sidebar__link--active {
            color: #f8fafc;
            background: #1e293b;
            border-left: 3px solid #3b82f6;
        }
    `,
})
export class SidebarComponent {}
