import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    OnInit,
    OnDestroy,
    HostListener,
    ElementRef,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { WebSocketService } from '../../core/services/websocket.service';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import { StatusBadgeComponent } from './status-badge.component';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';
import { firstValueFrom } from 'rxjs';
import type { AlgoChatNetwork } from '../../core/models/session.model';

interface NavTab {
    key: string;
    label: string;
    route: string;
    matchRoutes: string[];
    children: { label: string; route: string }[];
}

const TABS: NavTab[] = [
    {
        key: 'chat',
        label: 'Chat',
        route: '/chat',
        matchRoutes: ['/chat', '/dashboard', '/sessions', '/work-tasks', '/councils', '/council-launches'],
        children: [
            { label: 'Home', route: '/chat' },
            { label: 'Dashboard', route: '/dashboard' },
            { label: 'Conversations', route: '/sessions' },
            { label: 'Work Tasks', route: '/work-tasks' },
            { label: 'Councils', route: '/councils' },
        ],
    },
    {
        key: 'agents',
        label: 'Agents',
        route: '/agents',
        matchRoutes: ['/agents', '/projects', '/models', '/personas', '/skill-bundles', '/flock-directory'],
        children: [
            { label: 'All Agents', route: '/agents' },
            { label: 'Flock Directory', route: '/flock-directory' },
            { label: 'Projects', route: '/projects' },
            { label: 'Models', route: '/models' },
            { label: 'Personas', route: '/personas' },
            { label: 'Skill Bundles', route: '/skill-bundles' },
        ],
    },
    {
        key: 'observe',
        label: 'Observe',
        route: '/feed',
        matchRoutes: ['/feed', '/analytics', '/logs', '/brain-viewer', '/reputation'],
        children: [
            { label: 'Live Feed', route: '/feed' },
            { label: 'Analytics', route: '/analytics' },
            { label: 'Logs', route: '/logs' },
            { label: 'Brain Viewer', route: '/brain-viewer' },
            { label: 'Reputation', route: '/reputation' },
        ],
    },
    {
        key: 'automate',
        label: 'Automate',
        route: '/schedules',
        matchRoutes: ['/schedules', '/workflows', '/webhooks', '/mention-polling', '/mcp-servers'],
        children: [
            { label: 'Schedules', route: '/schedules' },
            { label: 'Workflows', route: '/workflows' },
            { label: 'Webhooks', route: '/webhooks' },
            { label: 'Polling', route: '/mention-polling' },
            { label: 'MCP Servers', route: '/mcp-servers' },
        ],
    },
    {
        key: 'settings',
        label: 'Settings',
        route: '/settings',
        matchRoutes: [
            '/settings', '/security', '/allowlist', '/github-allowlist',
            '/repo-blocklist', '/wallets', '/spending', '/marketplace',
        ],
        children: [
            { label: 'General', route: '/settings' },
            { label: 'Security', route: '/security' },
            { label: 'Wallets', route: '/wallets' },
            { label: 'Spending', route: '/spending' },
            { label: 'Allowlist', route: '/allowlist' },
            { label: 'GH Allowlist', route: '/github-allowlist' },
            { label: 'Repo Blocklist', route: '/repo-blocklist' },
            { label: 'Marketplace', route: '/marketplace' },
        ],
    },
];

@Component({
    selector: 'app-top-nav',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, RouterLinkActive, StatusBadgeComponent],
    template: `
        <nav class="topnav" role="navigation" aria-label="Main navigation">
            <div class="topnav__left">
                <a class="topnav__logo" routerLink="/chat">
                    <span class="topnav__logo-text">CorvidAgent</span>
                </a>
                <div class="topnav__tabs">
                    @for (tab of tabs; track tab.key) {
                        <div class="topnav__tab-wrapper">
                            <button
                                class="topnav__tab"
                                [class.topnav__tab--active]="isTabActive(tab)"
                                (click)="onTabClick(tab, $event)"
                                type="button">
                                {{ tab.label }}
                                @if (tab.children.length > 1) {
                                    <span class="topnav__tab-chevron" [class.topnav__tab-chevron--open]="openDropdown() === tab.key">&#x25BE;</span>
                                }
                            </button>
                            @if (openDropdown() === tab.key && tab.children.length > 1) {
                                <div class="topnav__dropdown">
                                    @for (child of tab.children; track child.route) {
                                        <a
                                            class="topnav__dropdown-item"
                                            [routerLink]="child.route"
                                            routerLinkActive="topnav__dropdown-item--active"
                                            [routerLinkActiveOptions]="{ exact: child.route === '/chat' }"
                                            (click)="closeDropdown()">
                                            {{ child.label }}
                                        </a>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
            <div class="topnav__right">
                <div class="topnav__network" role="group" aria-label="Network selector">
                    <button
                        class="network-btn"
                        [class.network-btn--active]="currentNetwork() === 'testnet'"
                        [class.network-btn--testnet]="currentNetwork() === 'testnet'"
                        [disabled]="switching()"
                        (click)="switchNetwork('testnet')"
                        aria-label="Switch to testnet"
                    >TEST</button>
                    <button
                        class="network-btn"
                        [class.network-btn--active]="currentNetwork() === 'mainnet'"
                        [class.network-btn--mainnet]="currentNetwork() === 'mainnet'"
                        [disabled]="switching()"
                        (click)="switchNetwork('mainnet')"
                        aria-label="Switch to mainnet"
                    >MAIN</button>
                </div>
                <button
                    class="topnav__search-btn"
                    (click)="openCommandPalette()"
                    title="Command palette (Cmd+K)"
                    type="button">
                    <span class="topnav__search-label">Search...</span>
                    <kbd class="topnav__search-kbd">⌘K</kbd>
                </button>
                <div class="topnav__status">
                    <app-status-badge [status]="wsService.connectionStatus()" />
                </div>
                <button
                    class="topnav__help"
                    (click)="openHelp()"
                    title="Keyboard shortcuts (?)"
                    type="button">?</button>
            </div>

            <!-- Mobile hamburger -->
            <button
                class="topnav__hamburger"
                (click)="mobileOpen.set(!mobileOpen())"
                [attr.aria-expanded]="mobileOpen()"
                aria-label="Toggle navigation"
                type="button">
                <span class="topnav__hamburger-icon">
                    <span></span><span></span><span></span>
                </span>
            </button>
        </nav>

        <!-- Mobile menu -->
        @if (mobileOpen()) {
            <div class="topnav-mobile-backdrop" (click)="mobileOpen.set(false)"></div>
            <div class="topnav-mobile">
                @for (tab of tabs; track tab.key) {
                    <div class="topnav-mobile__section">
                        <span class="topnav-mobile__section-label">{{ tab.label }}</span>
                        @for (child of tab.children; track child.route) {
                            <a
                                class="topnav-mobile__link"
                                [routerLink]="child.route"
                                routerLinkActive="topnav-mobile__link--active"
                                (click)="mobileOpen.set(false)">
                                {{ child.label }}
                            </a>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .topnav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 48px;
            padding: 0 1.25rem;
            background: linear-gradient(180deg, rgba(15, 16, 24, 0.95) 0%, rgba(10, 10, 18, 0.98) 100%);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            position: relative;
            z-index: 100;
        }
        .topnav__left {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }
        .topnav__logo {
            text-decoration: none;
            display: flex;
            align-items: center;
        }
        .topnav__logo-text {
            font-family: 'Dogica Pixel', 'Dogica', monospace;
            font-size: 1rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-magenta));
            background-size: 200% 200%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: gradientShift 8s ease infinite;
            letter-spacing: 0.06em;
        }
        .topnav__tabs {
            display: flex;
            align-items: center;
            gap: 0;
        }
        .topnav__tab-wrapper {
            position: relative;
        }
        .topnav__tab {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.5rem 0.9rem;
            background: none;
            border: none;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            cursor: pointer;
            transition: color 0.15s, background 0.15s;
            border-bottom: 2px solid transparent;
            height: 48px;
            text-transform: uppercase;
        }
        .topnav__tab:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .topnav__tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
            text-shadow: 0 0 8px rgba(0, 229, 255, 0.25);
            background: linear-gradient(180deg, transparent 0%, rgba(0, 229, 255, 0.04) 100%);
        }
        .topnav__tab-chevron {
            font-size: 0.6rem;
            transition: transform 150ms ease;
        }
        .topnav__tab-chevron--open {
            transform: rotate(180deg);
        }

        /* Dropdown */
        .topnav__dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 190px;
            background: rgba(22, 24, 34, 0.92);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--radius-lg, 10px);
            padding: 0.4rem 0;
            z-index: 200;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 229, 255, 0.04);
            animation: dropdownIn 0.15s ease-out;
        }
        @keyframes dropdownIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .topnav__dropdown-item {
            display: block;
            padding: 0.5rem 1rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.75rem;
            letter-spacing: 0.03em;
            transition: background 0.1s, color 0.1s;
        }
        .topnav__dropdown-item:hover {
            background: var(--bg-hover);
            color: var(--accent-cyan);
        }
        .topnav__dropdown-item--active {
            color: var(--accent-cyan);
            background: var(--accent-cyan-dim);
        }

        /* Right side */
        .topnav__right {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .topnav__network {
            display: flex;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius, 6px);
            overflow: hidden;
        }
        .network-btn {
            padding: 0.25rem 0.5rem;
            font-family: inherit;
            font-size: 0.55rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            border: none;
            background: transparent;
            color: var(--text-tertiary);
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
            text-transform: uppercase;
        }
        .network-btn:hover:not(:disabled):not(.network-btn--active) {
            background: var(--bg-hover);
            color: var(--text-secondary);
        }
        .network-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .network-btn--active.network-btn--testnet {
            background: rgba(74, 144, 217, 0.15);
            color: #4a90d9;
        }
        .network-btn--active.network-btn--mainnet {
            background: rgba(80, 227, 194, 0.15);
            color: #50e3c2;
        }
        .topnav__status {
            display: flex;
            align-items: center;
        }
        .topnav__help {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius, 6px);
            color: var(--text-tertiary);
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 700;
            cursor: pointer;
            transition: color 0.15s, border-color 0.15s;
        }
        .topnav__help:hover {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
        }
        .topnav__search-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.3rem 0.7rem;
            background: rgba(12, 13, 20, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: var(--radius-lg, 10px);
            color: var(--text-tertiary);
            font-family: inherit;
            font-size: 0.7rem;
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
            min-width: 160px;
        }
        .topnav__search-btn:hover {
            border-color: rgba(0, 229, 255, 0.3);
            color: var(--text-secondary);
            box-shadow: 0 0 12px rgba(0, 229, 255, 0.06);
        }
        .topnav__search-label {
            flex: 1;
            text-align: left;
        }
        .topnav__search-kbd {
            padding: 0.08rem 0.3rem;
            background: var(--bg-raised, #222);
            border: 1px solid var(--border, #333);
            border-radius: 3px;
            font-family: inherit;
            font-size: 0.55rem;
            color: var(--text-tertiary);
        }

        /* Mobile hamburger */
        .topnav__hamburger {
            display: none;
            background: none;
            border: 1px solid var(--border);
            border-radius: var(--radius, 4px);
            padding: 0.35rem;
            cursor: pointer;
            width: 34px;
            height: 34px;
            align-items: center;
            justify-content: center;
        }
        .topnav__hamburger-icon {
            display: flex;
            flex-direction: column;
            gap: 3px;
            width: 16px;
        }
        .topnav__hamburger-icon span {
            display: block;
            height: 2px;
            width: 100%;
            background: var(--text-secondary);
            border-radius: 1px;
        }

        /* Mobile menu */
        .topnav-mobile-backdrop {
            display: none;
        }
        .topnav-mobile {
            display: none;
        }

        @media (max-width: 767px) {
            .topnav__tabs, .topnav__right { display: none; }
            .topnav__hamburger { display: flex; }

            .topnav-mobile-backdrop {
                display: block;
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(2px);
                z-index: 998;
            }
            .topnav-mobile {
                display: flex;
                flex-direction: column;
                position: fixed;
                top: 48px;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--bg-surface);
                z-index: 999;
                overflow-y: auto;
                padding: 1rem 0;
            }
            .topnav-mobile__section {
                padding: 0.5rem 0;
                border-bottom: 1px solid var(--border);
            }
            .topnav-mobile__section-label {
                display: block;
                padding: 0.4rem 1.5rem;
                font-size: 0.6rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: var(--text-tertiary);
                font-weight: 700;
            }
            .topnav-mobile__link {
                display: block;
                padding: 0.75rem 1.5rem;
                color: var(--text-secondary);
                text-decoration: none;
                font-size: 0.85rem;
                transition: background 0.1s, color 0.1s;
            }
            .topnav-mobile__link:hover {
                background: var(--bg-hover);
                color: var(--accent-cyan);
            }
            .topnav-mobile__link--active {
                color: var(--accent-cyan);
                background: var(--accent-cyan-dim);
            }
        }
    `,
})
export class TopNavComponent implements OnInit, OnDestroy {
    protected readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);
    private readonly apiService = inject(ApiService);
    private readonly router = inject(Router);
    private readonly shortcutsService = inject(KeyboardShortcutsService);
    private readonly elRef = inject(ElementRef);

    protected readonly tabs = TABS;
    protected readonly openDropdown = signal<string | null>(null);
    protected readonly mobileOpen = signal(false);
    protected readonly currentNetwork = signal<AlgoChatNetwork>('testnet');
    protected readonly switching = signal(false);

    private currentUrl = '';
    private routerSub: Subscription | null = null;

    ngOnInit(): void {
        this.currentUrl = this.router.url;
        this.routerSub = this.router.events
            .pipe(filter((e) => e instanceof NavigationEnd))
            .subscribe((e) => {
                this.currentUrl = (e as NavigationEnd).urlAfterRedirects;
                this.closeDropdown();
            });
        this.loadNetwork();
    }

    ngOnDestroy(): void {
        this.routerSub?.unsubscribe();
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event): void {
        if (!this.elRef.nativeElement.contains(event.target)) {
            this.closeDropdown();
        }
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        this.closeDropdown();
        this.mobileOpen.set(false);
    }

    protected isTabActive(tab: NavTab): boolean {
        return tab.matchRoutes.some((r) => this.currentUrl.startsWith(r));
    }

    protected onTabClick(tab: NavTab, event: Event): void {
        event.stopPropagation();
        if (this.openDropdown() === tab.key) {
            this.closeDropdown();
        } else if (tab.children.length > 1) {
            this.openDropdown.set(tab.key);
        } else {
            this.router.navigate([tab.route]);
        }
    }

    protected closeDropdown(): void {
        this.openDropdown.set(null);
    }

    protected openCommandPalette(): void {
        // Simulate Cmd+K to open the palette
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    }

    protected openHelp(): void {
        this.shortcutsService.overlayOpen.set(true);
    }

    private async loadNetwork(): Promise<void> {
        try {
            await this.sessionService.loadAlgoChatStatus();
            const status = this.sessionService.algochatStatus();
            if (status?.network) {
                this.currentNetwork.set(status.network);
            }
        } catch { /* ignore */ }
    }

    protected async switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
        if (network === this.currentNetwork() || this.switching()) return;
        this.switching.set(true);
        try {
            await firstValueFrom(
                this.apiService.post<{ ok: boolean; network: string }>('/algochat/network', { network }),
            );
            this.currentNetwork.set(network);
            await this.sessionService.loadAlgoChatStatus();
        } catch (err) {
            console.error('Failed to switch network:', err);
        } finally {
            this.switching.set(false);
        }
    }
}
