import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './icon.component';

interface BottomNavItem {
    label: string;
    icon: string;
    route: string;
    exact: boolean;
}

const NAV_ITEMS: BottomNavItem[] = [
    { label: 'Home', icon: 'home', route: '/chat', exact: true },
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', exact: true },
    { label: 'Sessions', icon: 'sessions', route: '/sessions', exact: false },
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
                    <app-icon [name]="item.icon" [size]="20" />
                    <span class="bottom-nav__label">{{ item.label }}</span>
                </a>
            }
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
            background: linear-gradient(180deg, rgba(15, 16, 24, 0.97) 0%, rgba(10, 10, 18, 0.99) 100%);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
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
        }

        .bottom-nav__label {
            font-size: 0.6rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }
    `,
})
export class MobileBottomNavComponent {
    protected readonly items = NAV_ITEMS;
}
