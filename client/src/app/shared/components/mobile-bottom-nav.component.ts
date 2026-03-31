import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './icon.component';
import { SessionService } from '../../core/services/session.service';

interface BottomNavItem {
    label: string;
    icon: string;
    route: string;
    exact: boolean;
    badgeKey?: 'sessions';
}

const NAV_ITEMS: BottomNavItem[] = [
    { label: 'Home', icon: 'home', route: '/chat', exact: true },
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', exact: true },
    { label: 'Sessions', icon: 'sessions', route: '/sessions', exact: false, badgeKey: 'sessions' },
    { label: 'Observe', icon: 'eye', route: '/observe', exact: false },
    { label: 'Agents', icon: 'agents', route: '/agents', exact: false },
];

@Component({
    selector: 'app-mobile-bottom-nav',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterLink, RouterLinkActive, IconComponent],
    template: `
        <nav class="bottom-nav" role="navigation" aria-label="Mobile navigation">
            @for (item of items; track item.route) {
                <a
                    class="bottom-nav__item"
                    [routerLink]="item.route"
                    routerLinkActive="bottom-nav__item--active"
                    [routerLinkActiveOptions]="{ exact: item.exact }"
                    [attr.aria-label]="item.label">
                    <span class="bottom-nav__icon-wrapper">
                        <app-icon [name]="item.icon" [size]="20" />
                        @if (item.badgeKey === 'sessions' && activeSessionCount() > 0) {
                            <span class="bottom-nav__badge" [attr.aria-label]="activeSessionCount() + ' active sessions'">{{ activeSessionCount() > 9 ? '9+' : activeSessionCount() }}</span>
                        }
                    </span>
                    <span class="bottom-nav__label">{{ item.label }}</span>
                </a>
            }
            <button
                class="bottom-nav__item bottom-nav__item--search"
                (click)="openCommandPalette()"
                type="button"
                aria-label="Search and commands">
                <span class="bottom-nav__icon-wrapper">
                    <app-icon name="search" [size]="20" />
                </span>
                <span class="bottom-nav__label">Search</span>
            </button>
        </nav>
    `,
    styles: `
        :host {
            display: none;
        }

        @media (max-width: 767px) {
            :host {
                display: block;
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 100;
            }
        }

        .bottom-nav {
            display: flex;
            align-items: stretch;
            justify-content: space-around;
            height: 56px;
            background: rgba(15, 16, 24, 0.88);
            backdrop-filter: blur(16px) saturate(1.2);
            -webkit-backdrop-filter: blur(16px) saturate(1.2);
            border-top: 1px solid var(--border-faint);
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
            padding-bottom: env(safe-area-inset-bottom, 0);
        }

        .bottom-nav__item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.2rem;
            flex: 1;
            color: var(--text-tertiary);
            text-decoration: none;
            transition: color 0.15s;
            -webkit-tap-highlight-color: transparent;
            position: relative;
        }

        .bottom-nav__item:active {
            color: var(--text-secondary);
        }

        .bottom-nav__item--active {
            color: var(--accent-cyan);
        }

        .bottom-nav__item--active::before {
            content: '';
            position: absolute;
            top: 0;
            left: 25%;
            right: 25%;
            height: 2px;
            background: var(--accent-cyan);
            border-radius: 0 0 2px 2px;
            animation: navIndicator 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
        }
        @keyframes navIndicator {
            from { transform: scaleX(0); }
            to { transform: scaleX(1); }
        }

        .bottom-nav__label {
            font-size: 0.6rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }
        .bottom-nav__icon-wrapper {
            position: relative;
            display: inline-flex;
        }
        .bottom-nav__badge {
            position: absolute;
            top: -4px;
            right: -8px;
            min-width: 16px;
            height: 16px;
            padding: 0 3px;
            border-radius: 8px;
            background: var(--accent-cyan);
            color: var(--bg-deep);
            font-size: 0.6rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
            animation: badgePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes badgePop {
            from { transform: scale(0); }
            to { transform: scale(1); }
        }

        /* Add active icon scale */
        .bottom-nav__item--active .bottom-nav__icon-wrapper {
            transform: scale(1.1);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .bottom-nav__icon-wrapper {
            transition: transform 0.15s;
        }
        .bottom-nav__item:active .bottom-nav__icon-wrapper {
            transform: scale(0.9);
        }

        /* Search button — reset button styles, match nav item appearance */
        button.bottom-nav__item {
            background: none;
            border: none;
            font-family: inherit;
            cursor: pointer;
            padding: 0;
        }
        .bottom-nav__item--search {
            color: var(--text-tertiary);
            transition: color 0.15s;
        }
        .bottom-nav__item--search:hover,
        .bottom-nav__item--search:active {
            color: var(--accent-cyan);
        }
    `,
})
export class MobileBottomNavComponent {
    private readonly sessionService = inject(SessionService);
    protected readonly items = NAV_ITEMS;
    protected readonly activeSessionCount = computed(() =>
        this.sessionService.sessions().filter((s) => s.status === 'running' || s.status === 'thinking' || s.status === 'tool_use').length,
    );

    protected openCommandPalette(): void {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    }
}
