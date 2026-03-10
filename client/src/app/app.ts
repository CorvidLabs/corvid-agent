import {
    Component,
    ChangeDetectionStrategy,
    inject,
    OnInit,
    OnDestroy,
    signal,
    viewChild,
    AfterViewInit,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shared/components/header.component';
import { SidebarComponent } from './shared/components/sidebar.component';
import { BreadcrumbComponent } from './shared/components/breadcrumb.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { KeyboardShortcutsOverlayComponent } from './shared/components/keyboard-shortcuts-overlay.component';
import { WebSocketService } from './core/services/websocket.service';
import { SessionService } from './core/services/session.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, HeaderComponent, SidebarComponent, BreadcrumbComponent, ToastContainerComponent, KeyboardShortcutsOverlayComponent],
    template: `
        <a class="skip-link" href="#main-content">Skip to main content</a>
        <div class="app-layout">
            <app-header
                [sidebarOpen]="sidebarOpen()"
                (hamburgerClick)="toggleSidebar()" />
            @if (!wsService.connected()) {
                <div class="app-layout__banner" role="alert" aria-live="assertive">
                    Connection lost — reconnecting...
                </div>
            }
            <div class="app-layout__body">
                <app-sidebar [(sidebarOpen)]="sidebarOpen" />
                <main class="app-layout__content" id="main-content" role="main" aria-label="Main content">
                    <app-breadcrumb />
                    <div class="app-layout__page page-enter">
                        <router-outlet />
                    </div>
                </main>
            </div>
        </div>
        <app-keyboard-shortcuts-overlay />
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
            position: relative;
            background: var(--bg-deep);
            display: flex;
            flex-direction: column;
        }
        .app-layout__page {
            flex: 1;
            overflow-y: auto;
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
    `,
})
export class App implements OnInit, OnDestroy, AfterViewInit {
    protected readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);
    // Inject to ensure service is instantiated and listening for keyboard events
    private readonly _shortcuts = inject(KeyboardShortcutsService);

    protected readonly sidebarOpen = signal(false);

    private readonly sidebarComponent = viewChild(SidebarComponent);

    ngOnInit(): void {
        this.wsService.connect();
        this.sessionService.init();
    }

    ngAfterViewInit(): void {
        // Supply the hamburger button ref to sidebar for focus management
        setTimeout(() => {
            const btn = document.querySelector('.header__hamburger') as HTMLElement;
            if (btn) {
                this.sidebarComponent()?.setHamburgerRef(btn);
            }
        });
    }

    ngOnDestroy(): void {
        this.sessionService.destroy();
        this.wsService.disconnect();
    }

    protected toggleSidebar(): void {
        const sidebar = this.sidebarComponent();
        if (!sidebar) return;

        if (this.sidebarOpen()) {
            sidebar.closeSidebar();
        } else {
            sidebar.openSidebar();
        }
    }
}
