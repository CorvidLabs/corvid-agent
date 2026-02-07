import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit, output } from '@angular/core';
import { WebSocketService } from '../../core/services/websocket.service';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import { StatusBadgeComponent } from './status-badge.component';
import { firstValueFrom } from 'rxjs';
import type { AlgoChatNetwork } from '../../core/models/session.model';

@Component({
    selector: 'app-header',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent],
    template: `
        <header class="header" role="banner">
            <div class="header__brand">
                <button
                    class="header__hamburger"
                    (click)="hamburgerClick.emit()"
                    [attr.aria-expanded]="sidebarOpen()"
                    aria-label="Toggle navigation"
                    #hamburgerBtn>
                    <span class="header__hamburger-icon" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                </button>
                <h1 class="header__title">CorvidAgent</h1>
            </div>
            <div class="header__controls">
                <div class="header__network" role="group" aria-label="Network selector">
                    <button
                        class="network-btn"
                        [class.network-btn--active]="currentNetwork() === 'testnet'"
                        [class.network-btn--testnet]="currentNetwork() === 'testnet'"
                        [disabled]="switching()"
                        (click)="switchNetwork('testnet')"
                        aria-label="Switch to testnet"
                    >TESTNET</button>
                    <button
                        class="network-btn"
                        [class.network-btn--active]="currentNetwork() === 'mainnet'"
                        [class.network-btn--mainnet]="currentNetwork() === 'mainnet'"
                        [disabled]="switching()"
                        (click)="switchNetwork('mainnet')"
                        aria-label="Switch to mainnet"
                    >MAINNET</button>
                </div>
                <div class="header__status">
                    <span class="header__label">WS:</span>
                    <app-status-badge [status]="wsService.connectionStatus()" />
                </div>
            </div>
        </header>
    `,
    styles: `
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.5rem;
            height: 56px;
            background: var(--bg-surface);
            color: var(--text-primary);
            border-bottom: 1px solid var(--border);
        }
        .header__brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .header__title {
            font-family: 'Dogica Pixel', 'Dogica', monospace;
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0;
            color: var(--accent-cyan);
            text-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
            letter-spacing: 0.08em;
        }
        .header__controls {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .header__network {
            display: flex;
            gap: 0;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            overflow: hidden;
        }
        .network-btn {
            padding: 0.3rem 0.6rem;
            font-family: inherit;
            font-size: 0.6rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            border: none;
            background: transparent;
            color: var(--text-tertiary);
            cursor: pointer;
            transition: background 0.15s, color 0.15s, box-shadow 0.15s;
            text-transform: uppercase;
        }
        .network-btn:hover:not(:disabled):not(.network-btn--active) {
            background: var(--bg-hover);
            color: var(--text-secondary);
        }
        .network-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .network-btn--active.network-btn--testnet {
            background: rgba(74, 144, 217, 0.15);
            color: #4a90d9;
            box-shadow: inset 0 0 8px rgba(74, 144, 217, 0.2);
        }
        .network-btn--active.network-btn--mainnet {
            background: rgba(80, 227, 194, 0.15);
            color: #50e3c2;
            box-shadow: inset 0 0 8px rgba(80, 227, 194, 0.2);
        }
        .header__status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .header__label {
            font-size: 0.65rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* ── Hamburger button ── */
        .header__hamburger {
            display: none;
            background: none;
            border: 1px solid var(--border);
            border-radius: var(--radius, 4px);
            padding: 0.4rem;
            cursor: pointer;
            width: 36px;
            height: 36px;
            align-items: center;
            justify-content: center;
        }
        .header__hamburger:focus-visible {
            outline: 2px solid var(--accent-cyan);
            outline-offset: 2px;
        }
        .header__hamburger-icon {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 18px;
        }
        .header__hamburger-icon span {
            display: block;
            height: 2px;
            width: 100%;
            background: var(--text-secondary);
            border-radius: 1px;
            transition: background 0.15s;
        }

        /* Show hamburger only on mobile */
        @media (max-width: 767px) {
            .header__hamburger {
                display: flex;
            }
            .header {
                padding: 0 1rem;
            }
            .header__title {
                font-size: 1rem;
            }
            .header__label {
                display: none;
            }
        }
    `,
})
export class HeaderComponent implements OnInit {
    protected readonly wsService = inject(WebSocketService);
    private readonly sessionService = inject(SessionService);
    private readonly apiService = inject(ApiService);

    /** Receives sidebar open state from parent for aria-expanded binding */
    readonly sidebarOpen = input(false);

    /** Emits when hamburger is clicked */
    readonly hamburgerClick = output<void>();


    protected readonly currentNetwork = signal<AlgoChatNetwork>('testnet');
    protected readonly switching = signal(false);

    ngOnInit(): void {
        this.loadNetwork();
    }

    private async loadNetwork(): Promise<void> {
        try {
            await this.sessionService.loadAlgoChatStatus();
            const status = this.sessionService.algochatStatus();
            if (status?.network) {
                this.currentNetwork.set(status.network);
            }
        } catch {
            // Ignore — will show default
        }
    }

    protected async switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
        if (network === this.currentNetwork() || this.switching()) return;

        this.switching.set(true);
        try {
            await firstValueFrom(
                this.apiService.post<{ ok: boolean; network: string }>('/algochat/network', { network }),
            );
            this.currentNetwork.set(network);
            // Reload status to reflect new state
            await this.sessionService.loadAlgoChatStatus();
        } catch (err) {
            // Revert on failure — network didn't actually change
            console.error('Failed to switch network:', err);
        } finally {
            this.switching.set(false);
        }
    }
}
