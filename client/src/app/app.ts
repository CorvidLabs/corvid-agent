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
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { WebSocketService } from './core/services/websocket.service';
import { SessionService } from './core/services/session.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, HeaderComponent, SidebarComponent, ToastContainerComponent],
    template: `
        <div class="app-layout">
            <app-header
                [sidebarOpen]="sidebarOpen()"
                (hamburgerClick)="toggleSidebar()" />
            <div class="app-layout__body">
                <app-sidebar [(sidebarOpen)]="sidebarOpen" />
                <main class="app-layout__content" role="main">
                    <router-outlet />
                </main>
            </div>
        </div>
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
            overflow-y: auto;
            min-height: 0;
            position: relative;
            background: var(--bg-deep);
        }
    `,
})
export class App implements OnInit, OnDestroy, AfterViewInit {
    private readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);

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
