import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './icon.component';
import { SessionService } from '../../core/services/session.service';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';

interface BottomNavItem {
    label: string;
    icon: string;
    route: string;
    exact: boolean;
    badgeKey?: 'sessions';
}

const NAV_ITEMS: BottomNavItem[] = [
    { label: 'Home', icon: 'chat', route: '/chat', exact: true },
    { label: 'Sessions', icon: 'sessions', route: '/sessions', exact: false, badgeKey: 'sessions' },
    { label: 'Observe', icon: 'eye', route: '/observe', exact: false },
    { label: 'Agents', icon: 'agents', route: '/agents', exact: false },
    { label: 'Settings', icon: 'settings', route: '/settings', exact: false },
];

@Component({
    selector: 'app-mobile-bottom-nav',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [RouterLink, RouterLinkActive, IconComponent, MatButtonModule, MatBadgeModule, MatIconModule],
    template: `
        <nav class="bottom-nav" role="navigation" aria-label="Mobile navigation">
            @for (item of items; track item.route) {
                <a
                    class="bottom-nav__item"
                    [routerLink]="item.route"
                    routerLinkActive="bottom-nav__item--active"
                    [routerLinkActiveOptions]="{ exact: item.exact }"
                    [attr.aria-label]="item.label">
                    <span
                        class="bottom-nav__icon-wrapper"
                        [matBadge]="item.badgeKey === 'sessions' && activeSessionCount() > 0 ? (activeSessionCount() > 9 ? '9+' : activeSessionCount()) : null"
                        matBadgeColor="accent"
                        matBadgeSize="small"
                        [matBadgeHidden]="!(item.badgeKey === 'sessions' && activeSessionCount() > 0)"
                        [attr.aria-label]="item.badgeKey === 'sessions' && activeSessionCount() > 0 ? activeSessionCount() + ' active sessions' : null">
                        <app-icon [name]="item.icon" [size]="20" />
                    </span>
                    <span class="bottom-nav__label">{{ item.label }}</span>
                </a>
            }
            <button
                mat-icon-button
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
            box-shadow: 0 0 8px var(--accent-cyan-glow);
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

        /* Active icon scale */
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

        /* Search button — reset mat-icon-button styles, match nav item appearance */
        button.bottom-nav__item.mat-mdc-icon-button {
            background: none;
            border: none;
            font-family: inherit;
            cursor: pointer;
            padding: 0;
            width: unset;
            height: unset;
            border-radius: 0;
            flex: 1;
        }
        .bottom-nav__item--search {
            color: var(--text-tertiary);
            transition: color 0.15s;
        }
        .bottom-nav__item--search:hover,
        .bottom-nav__item--search:active {
            color: var(--accent-cyan);
        }

        .bottom-nav__icon-wrapper {
            --mat-badge-background-color: var(--accent-cyan);
            --mat-badge-text-color: var(--bg-deep);
            --mat-badge-text-size: 0.55rem;
            --mat-badge-text-weight: 700;
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
