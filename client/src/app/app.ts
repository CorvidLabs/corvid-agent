import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
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
            <app-header />
            <div class="app-layout__body">
                <app-sidebar />
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
            background: var(--bg-deep);
        }
    `,
})
export class App implements OnInit, OnDestroy {
    private readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);

    ngOnInit(): void {
        this.wsService.connect();
        this.sessionService.init();
    }

    ngOnDestroy(): void {
        this.sessionService.destroy();
        this.wsService.disconnect();
    }
}
