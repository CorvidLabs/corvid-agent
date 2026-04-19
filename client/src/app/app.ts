import {
    Component,
    ChangeDetectionStrategy,
    inject,
    OnInit,
    OnDestroy,
    signal,
    viewChild,
    ElementRef,
} from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { pageRouteAnimation } from './animations/route-transitions';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TopNavComponent } from './shared/components/top-nav.component';
import { ChatTabBarComponent } from './shared/components/chat-tab-bar.component';
import { ActivityRailComponent } from './shared/components/activity-rail.component';
import { CommandPaletteComponent } from './shared/components/command-palette.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { KeyboardShortcutsOverlayComponent } from './shared/components/keyboard-shortcuts-overlay.component';
import { GuidedTourComponent } from './shared/components/guided-tour.component';
import { MobileBottomNavComponent } from './shared/components/mobile-bottom-nav.component';
import { WebSocketService } from './core/services/websocket.service';
import { SessionService } from './core/services/session.service';
import { ChatTabsService } from './core/services/chat-tabs.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [pageRouteAnimation],
    imports: [RouterOutlet, TopNavComponent, ChatTabBarComponent, ActivityRailComponent, CommandPaletteComponent, ToastContainerComponent, KeyboardShortcutsOverlayComponent, GuidedTourComponent, MobileBottomNavComponent, MatButtonModule, MatIconModule],
    template: `
        <div class="app-layout" [class.app-layout--session]="isSessionView()">
            <app-top-nav />
            @if (chatTabs.tabs().length > 0) {
                <app-chat-tab-bar />
            }
            @if (wsService.serverRestarting()) {
                <div class="app-layout__banner app-layout__banner--restart" role="alert">
                    <span class="app-layout__banner-dot"></span>
                    Server is restarting — reconnecting automatically...
                </div>
            } @else if (!wsService.connected()) {
                <div class="app-layout__banner" role="alert">
                    <span class="app-layout__banner-dot"></span>
                    Connection lost — reconnecting...
                    <button mat-stroked-button (click)="retryConnection()" type="button" class="app-layout__banner-retry">Retry now</button>
                </div>
            }
            <div class="app-layout__body">
                <main class="app-layout__content" role="main" id="main-content" #mainContent (scroll)="onScroll($event)">
                    <div
                        class="router-outlet-host"
                        [@.disabled]="reduceMotion()"
                        [@pageRoute]="routeAnimationKey()">
                        <router-outlet />
                    </div>
                </main>
                <app-activity-rail />
            </div>
        </div>
        <button mat-fab
            class="scroll-to-top"
            [class.scroll-to-top--visible]="showScrollTop()"
            (click)="scrollToTop()"
            aria-label="Scroll to top"
            title="Scroll to top">
            <mat-icon>arrow_upward</mat-icon>
        </button>
        @if (!isSessionView()) {
            <app-mobile-bottom-nav />
        }
        <app-command-palette />
        <app-keyboard-shortcuts-overlay />
        <app-guided-tour />
        <app-toast-container />
    `,
    styles: `
        .app-layout {
            display: flex;
            flex-direction: column;
            height: 100vh;
            height: 100dvh;
            overflow: hidden;
        }
        .app-layout__body {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        .app-layout__content {
            flex: 1;
            min-height: 0;
            min-width: 0;
            position: relative;
            background: var(--bg-deep);
            overflow-y: auto;
            scroll-behavior: smooth;
            container-type: inline-size;
        }
        .router-outlet-host {
            display: block;
            min-height: 100%;
            min-width: 0;
            position: relative;
        }
        .app-layout__banner {
            padding: 0.375rem var(--space-4);
            background: var(--accent-red-dim, rgba(255, 51, 85, 0.1));
            border-bottom: 1px solid var(--accent-red, #f33);
            color: var(--accent-red, #f33);
            font-size: 0.75rem;
            font-weight: 600;
            text-align: center;
            letter-spacing: 0.03em;
        }
        .app-layout__banner-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            margin-right: 0.5rem;
            animation: bannerPulse 1.5s ease-in-out infinite;
        }
        @keyframes bannerPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .app-layout__banner-retry {
            margin-left: 0.75rem;
        }
        .app-layout__banner--restart {
            background: var(--accent-yellow-dim, rgba(255, 204, 0, 0.1));
            border-bottom-color: var(--accent-yellow, #fc0);
            color: var(--accent-yellow, #fc0);
        }

        /* Mobile: reserve space for bottom nav (not in session view) */
        @media (max-width: 767px) {
            .app-layout__content {
                padding-bottom: 56px;
            }
            .app-layout--session .app-layout__content {
                padding-bottom: 0;
            }
        }

    `,
})
export class App implements OnInit, OnDestroy {
    protected readonly wsService = inject(WebSocketService);
    protected readonly chatTabs = inject(ChatTabsService);
    private readonly sessionService = inject(SessionService);
    private readonly _shortcuts = inject(KeyboardShortcutsService);
    private readonly router = inject(Router);

    protected readonly showScrollTop = signal(false);
    protected readonly isSessionView = signal(false);
    /** Drives route enter animation; updates on each navigation. */
    protected readonly routeAnimationKey = signal(this.router.url);
    /** Disables route transition when prefers-reduced-motion is set. */
    protected readonly reduceMotion = signal(false);
    private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
    private routerSub: Subscription | null = null;
    private motionQuery: MediaQueryList | null = null;
    private onMotionChange: ((e: MediaQueryListEvent) => void) | null = null;

    ngOnInit(): void {
        this.wsService.connect();
        this.sessionService.init();

        if (typeof globalThis.matchMedia !== 'undefined') {
            this.motionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
            this.reduceMotion.set(this.motionQuery.matches);
            this.onMotionChange = (e: MediaQueryListEvent) => this.reduceMotion.set(e.matches);
            this.motionQuery.addEventListener('change', this.onMotionChange);
        }

        // Track whether we're viewing a session (hides bottom nav on mobile)
        this.isSessionView.set(this.router.url.startsWith('/sessions/'));
        this.routerSub = this.router.events
            .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe((e) => {
                this.isSessionView.set(e.urlAfterRedirects.startsWith('/sessions/'));
                this.routeAnimationKey.set(e.urlAfterRedirects);
            });
    }

    ngOnDestroy(): void {
        if (this.motionQuery && this.onMotionChange) {
            this.motionQuery.removeEventListener('change', this.onMotionChange);
        }
        this.sessionService.destroy();
        this.wsService.disconnect();
        this.routerSub?.unsubscribe();
    }

    protected onScroll(event: Event): void {
        const el = event.target as HTMLElement;
        this.showScrollTop.set(el.scrollTop > 300);
    }

    protected scrollToTop(): void {
        this.mainContent()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    }

    protected retryConnection(): void {
        this.wsService.disconnect();
        this.wsService.connect();
    }
}
