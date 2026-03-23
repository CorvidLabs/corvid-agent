import {
    Component,
    ChangeDetectionStrategy,
    inject,
    OnInit,
    OnDestroy,
    signal,
    computed,
    viewChild,
    ElementRef,
    AfterViewInit,
} from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { TopNavComponent } from './shared/components/top-nav.component';
import { ChatTabBarComponent } from './shared/components/chat-tab-bar.component';
import { ActivityRailComponent } from './shared/components/activity-rail.component';
import { CommandPaletteComponent } from './shared/components/command-palette.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { KeyboardShortcutsOverlayComponent } from './shared/components/keyboard-shortcuts-overlay.component';
import { GuidedTourComponent } from './shared/components/guided-tour.component';
import { MobileBottomNavComponent } from './shared/components/mobile-bottom-nav.component';
import { SidebarComponent } from './shared/components/sidebar.component';
import { WebSocketService } from './core/services/websocket.service';
import { SessionService } from './core/services/session.service';
import { ChatTabsService } from './core/services/chat-tabs.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, TopNavComponent, ChatTabBarComponent, ActivityRailComponent, CommandPaletteComponent, ToastContainerComponent, KeyboardShortcutsOverlayComponent, GuidedTourComponent, MobileBottomNavComponent, SidebarComponent],
    template: `
        <div class="app-layout" [class.app-layout--session]="isSessionView()">
            <app-top-nav />
            @if (chatTabs.tabs().length > 0) {
                <app-chat-tab-bar />
            }
            @if (wsService.serverRestarting()) {
                <div class="app-layout__banner app-layout__banner--restart" role="alert">
                    Server is restarting — reconnecting automatically...
                </div>
            } @else if (!wsService.connected()) {
                <div class="app-layout__banner" role="alert">
                    Connection lost — reconnecting...
                </div>
            }
            <div class="app-layout__body">
                <app-sidebar class="app-layout__sidebar" [(sidebarOpen)]="sidebarOpen" />
                <main class="app-layout__content" role="main" id="main-content" #mainContent (scroll)="onScroll($event)">
                    <router-outlet />
                </main>
                <app-activity-rail />
            </div>
        </div>
        <button
            class="scroll-to-top"
            [class.scroll-to-top--visible]="showScrollTop()"
            (click)="scrollToTop()"
            aria-label="Scroll to top"
            title="Scroll to top">&#x25B2;</button>
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
        .app-layout__banner {
            padding: 0.375rem 1rem;
            background: var(--accent-red-dim, rgba(255, 51, 85, 0.1));
            border-bottom: 1px solid var(--accent-red, #f33);
            color: var(--accent-red, #f33);
            font-size: 0.75rem;
            font-weight: 600;
            text-align: center;
            letter-spacing: 0.03em;
        }
        .app-layout__banner--restart {
            background: var(--accent-yellow-dim, rgba(255, 204, 0, 0.1));
            border-bottom-color: var(--accent-yellow, #fc0);
            color: var(--accent-yellow, #fc0);
        }

        /* Sidebar: hidden on mobile (top-nav handles mobile nav) */
        .app-layout__sidebar {
            display: none;
        }
        @media (min-width: 768px) {
            .app-layout__sidebar {
                display: flex;
            }
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

        /* Hide chat tab bar on mobile — bottom nav handles navigation */
        @media (max-width: 767px) {
            :host ::ng-deep app-chat-tab-bar {
                display: none;
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

    protected readonly sidebarOpen = signal(false);
    protected readonly showScrollTop = signal(false);
    protected readonly isSessionView = signal(false);
    private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
    private routerSub: Subscription | null = null;

    ngOnInit(): void {
        this.wsService.connect();
        this.sessionService.init();

        // Track whether we're viewing a session (hides bottom nav on mobile)
        this.isSessionView.set(this.router.url.startsWith('/sessions/'));
        this.routerSub = this.router.events
            .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe((e) => this.isSessionView.set(e.urlAfterRedirects.startsWith('/sessions/')));
    }

    ngOnDestroy(): void {
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
}
