import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router, NavigationEnd, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

interface Breadcrumb {
    label: string;
    url: string;
}

const ROUTE_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    agents: 'Agents',
    models: 'Models',
    councils: 'Councils',
    'council-launches': 'Council Launches',
    allowlist: 'Allowlist',
    'github-allowlist': 'GH Allowlist',
    'repo-blocklist': 'Repo Blocklist',
    wallets: 'Wallets',
    feed: 'Feed',
    sessions: 'Conversations',
    'work-tasks': 'Work Tasks',
    schedules: 'Schedules',
    workflows: 'Workflows',
    webhooks: 'Webhooks',
    'mention-polling': 'Polling',
    analytics: 'Analytics',
    logs: 'Logs',
    settings: 'Settings',
    personas: 'Personas',
    'skill-bundles': 'Skill Bundles',
    reputation: 'Reputation',
    marketplace: 'Marketplace',
    'mcp-servers': 'MCP Servers',
    spending: 'Spending',
    new: 'New',
    edit: 'Edit',
};

@Component({
    selector: 'app-breadcrumb',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterLink],
    template: `
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <ol class="breadcrumb__list">
                @for (crumb of breadcrumbs(); track crumb.url; let last = $last) {
                    <li class="breadcrumb__item">
                        @if (!last) {
                            <a class="breadcrumb__link" [routerLink]="crumb.url">{{ crumb.label }}</a>
                            <span class="breadcrumb__sep" aria-hidden="true">&gt;</span>
                        } @else {
                            <span class="breadcrumb__current" aria-current="page">{{ crumb.label }}</span>
                        }
                    </li>
                }
            </ol>
        </nav>
    `,
    styles: `
        .breadcrumb {
            padding: var(--space-2) var(--space-6);
            border-bottom: 1px solid var(--border);
            background: var(--bg-surface);
        }
        .breadcrumb__list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            flex-wrap: wrap;
        }
        .breadcrumb__item {
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .breadcrumb__link {
            color: var(--accent-cyan);
            text-decoration: none;
            font-size: 0.7rem;
            letter-spacing: 0.03em;
            transition: color 0.15s ease;
            position: relative;
        }
        .breadcrumb__link::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0;
            right: 0;
            height: 1px;
            background: var(--text-primary);
            transform: scaleX(0);
            transform-origin: left;
            transition: transform 0.2s ease;
        }
        .breadcrumb__link:hover {
            color: var(--text-primary);
        }
        .breadcrumb__link:hover::after {
            transform: scaleX(1);
        }
        .breadcrumb__sep {
            color: var(--text-tertiary);
            font-size: 0.7rem;
        }
        .breadcrumb__current {
            color: var(--text-secondary);
            font-size: 0.7rem;
        }

        @media (max-width: 767px) {
            .breadcrumb { padding: 0.4rem var(--space-4); }
        }
    `,
})
export class BreadcrumbComponent {
    private readonly router = inject(Router);

    private readonly url = toSignal(
        this.router.events.pipe(
            filter((e) => e instanceof NavigationEnd),
            map((e) => (e as NavigationEnd).urlAfterRedirects),
        ),
        { initialValue: this.router.url },
    );

    protected readonly breadcrumbs = computed<Breadcrumb[]>(() => {
        const url = this.url();
        const segments = url.split('/').filter(Boolean);
        if (segments.length === 0) return [];

        const crumbs: Breadcrumb[] = [{ label: 'Dashboard', url: '/dashboard' }];

        if (segments.length === 1 && segments[0] === 'dashboard') {
            return crumbs;
        }

        let path = '';
        for (const segment of segments) {
            if (segment === 'dashboard') continue;
            path += `/${segment}`;
            crumbs.push({ label: this.getLabel(segment), url: path });
        }

        return crumbs;
    });

    private getLabel(segment: string): string {
        if (ROUTE_LABELS[segment]) return ROUTE_LABELS[segment];
        if (/^[0-9a-f-]{8,}$/i.test(segment)) return `#${segment.slice(0, 8)}`;
        if (/^\d+$/.test(segment)) return `#${segment}`;
        return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
