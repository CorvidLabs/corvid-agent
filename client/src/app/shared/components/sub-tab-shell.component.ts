import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';

export interface SubTab {
    label: string;
    path: string;
    exact?: boolean;
}

@Component({
    selector: 'app-sub-tab-shell',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive, RouterOutlet],
    template: `
        <div class="tab-shell">
            <nav class="tab-shell__tabs" role="tablist" [attr.aria-label]="groupLabel()">
                @for (tab of tabs(); track tab.path) {
                    <a
                        class="tab-shell__tab"
                        [routerLink]="tab.path"
                        routerLinkActive="tab-shell__tab--active"
                        [routerLinkActiveOptions]="{ exact: tab.exact ?? false }"
                        role="tab">
                        {{ tab.label }}
                    </a>
                }
            </nav>
            <div class="tab-shell__content">
                <router-outlet />
            </div>
        </div>
    `,
    styles: `
        .tab-shell {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .tab-shell__tabs {
            display: flex;
            align-items: center;
            gap: 0;
            padding: 0 1.25rem;
            background: rgba(12, 13, 20, 0.5);
            border-bottom: 1px solid var(--border-subtle);
            overflow-x: auto;
            flex-shrink: 0;
            scrollbar-width: none;
        }
        .tab-shell__tabs::-webkit-scrollbar {
            display: none;
        }
        .tab-shell__tab {
            display: flex;
            align-items: center;
            padding: 0.65rem 1rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            white-space: nowrap;
            border-bottom: 2px solid transparent;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .tab-shell__tab:hover {
            color: var(--text-primary);
            background: var(--border-subtle);
        }
        .tab-shell__tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
            text-shadow: 0 0 8px var(--accent-cyan-border);
        }
        .tab-shell__content {
            flex: 1;
            overflow-y: auto;
        }

        @media (max-width: 767px) {
            .tab-shell__tabs {
                padding: 0 0.75rem;
            }
            .tab-shell__tab {
                padding: 0.55rem 0.75rem;
                font-size: 0.72rem;
            }
        }
    `,
})
export class SubTabShellComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private routerSub: Subscription | null = null;

    protected readonly groupLabel = signal('');
    protected readonly tabs = signal<SubTab[]>([]);

    ngOnInit(): void {
        this.loadFromRouteData();
        // Reload on route data changes (e.g., lazy child activation)
        this.routerSub = this.router.events
            .pipe(filter((e) => e instanceof NavigationEnd))
            .subscribe(() => this.loadFromRouteData());
    }

    ngOnDestroy(): void {
        this.routerSub?.unsubscribe();
    }

    private loadFromRouteData(): void {
        const data = this.route.snapshot.data;
        if (data['tabs']) {
            this.tabs.set(data['tabs'] as SubTab[]);
        }
        if (data['groupLabel']) {
            this.groupLabel.set(data['groupLabel'] as string);
        }
    }
}
