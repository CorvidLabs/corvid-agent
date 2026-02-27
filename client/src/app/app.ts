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
import { environment } from '../environments/environment';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, HeaderComponent, SidebarComponent, ToastContainerComponent],
    template: `
        @if (!isAuthenticated) {
            <div class="auth-overlay" role="dialog" aria-modal="true" aria-label="Authentication required">
                <div class="auth-card">
                    <div class="auth-header">
                        <div class="auth-logo">🐦‍⬛</div>
                        <h1>corvid-agent</h1>
                        <p class="auth-subtitle">Authentication required</p>
                    </div>
                    <div class="auth-body">
                        <p class="auth-description">
                            Access is protected by an API key. Append <code>?apiKey=</code> to the URL,
                            or enter your key below.
                        </p>
                        <div class="auth-url-example">
                            <span class="auth-url-base">{{ origin }}/?apiKey=</span><span class="auth-url-key">YOUR_API_KEY</span>
                        </div>
                        <div class="auth-form">
                            <input
                                class="auth-input"
                                type="password"
                                placeholder="Enter API key…"
                                autocomplete="current-password"
                                [value]="apiKeyInput()"
                                (input)="apiKeyInput.set($any($event.target).value)"
                                (keydown.enter)="submitApiKey()"
                            />
                            <button
                                class="auth-btn"
                                [disabled]="!apiKeyInput().trim()"
                                (click)="submitApiKey()"
                            >
                                Authenticate
                            </button>
                        </div>
                        <div class="auth-hint">
                            <strong>Where is my API key?</strong><br>
                            Set <code>API_KEY</code> in <code>deploy/.env</code> before starting
                            the container. Generate one with:
                            <code>openssl rand -base64 32</code>
                        </div>
                    </div>
                </div>
            </div>
        }

        <div class="app-layout" [attr.inert]="isAuthenticated ? null : ''">
            <app-header
                [sidebarOpen]="sidebarOpen()"
                (hamburgerClick)="toggleSidebar()" />
            @if (!wsService.connected()) {
                <div class="app-layout__banner" role="alert">
                    Connection lost — reconnecting...
                </div>
            }
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
        /* ── Auth overlay ── */
        .auth-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(6px);
            padding: 1.5rem;
        }

        .auth-card {
            width: 100%;
            max-width: 460px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
        }

        .auth-header {
            padding: 2rem 2rem 1.5rem;
            text-align: center;
            border-bottom: 1px solid var(--border);
        }

        .auth-logo {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        .auth-header h1 {
            margin: 0 0 0.25rem;
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .auth-subtitle {
            margin: 0;
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        .auth-body {
            padding: 1.75rem 2rem 2rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
        }

        .auth-description {
            margin: 0;
            font-size: 0.875rem;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .auth-url-example {
            padding: 0.75rem 1rem;
            background: var(--bg-deep);
            border: 1px solid var(--border);
            border-radius: 6px;
            font-family: monospace;
            font-size: 0.8rem;
            word-break: break-all;
            color: var(--text-secondary);
        }

        .auth-url-key {
            color: var(--accent-cyan);
            font-weight: 600;
        }

        .auth-form {
            display: flex;
            gap: 0.5rem;
        }

        .auth-input {
            flex: 1;
            padding: 0.625rem 0.875rem;
            background: var(--bg-deep);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.875rem;
            font-family: inherit;
            outline: none;
            transition: border-color 0.15s;
        }

        .auth-input:focus {
            border-color: var(--accent-cyan);
        }

        .auth-btn {
            padding: 0.625rem 1.25rem;
            background: var(--accent-cyan, #00e5ff);
            color: #000;
            border: none;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity 0.15s;
        }

        .auth-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        .auth-btn:not(:disabled):hover {
            opacity: 0.8;
        }

        .auth-hint {
            padding: 0.875rem 1rem;
            background: var(--bg-deep);
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            line-height: 1.6;
        }

        code {
            font-family: monospace;
            background: rgba(0, 229, 255, 0.08);
            color: var(--accent-cyan);
            padding: 0.1em 0.35em;
            border-radius: 3px;
            font-size: 0.85em;
        }

        /* ── App layout ── */
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

    protected readonly isAuthenticated = !!environment.apiKey;
    protected readonly origin = typeof window !== 'undefined' ? window.location.origin : '';
    protected readonly apiKeyInput = signal('');
    protected readonly sidebarOpen = signal(false);

    private readonly sidebarComponent = viewChild(SidebarComponent);

    ngOnInit(): void {
        // Skip all background connections when unauthenticated — prevents 401 toast spam
        if (!this.isAuthenticated) return;
        this.wsService.connect();
        this.sessionService.init();
    }

    ngAfterViewInit(): void {
        if (!this.isAuthenticated) return;
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

    protected submitApiKey(): void {
        const key = this.apiKeyInput().trim();
        if (!key) return;
        window.location.href = `/?apiKey=${encodeURIComponent(key)}`;
    }
}
