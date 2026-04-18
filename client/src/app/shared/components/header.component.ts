import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { WebSocketService } from '../../core/services/websocket.service';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import { StatusBadgeComponent } from './status-badge.component';
import { firstValueFrom } from 'rxjs';
import type { AlgoChatNetwork } from '../../core/models/session.model';

@Component({
    selector: 'app-header',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StatusBadgeComponent, MatButtonToggleModule],
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
                <mat-button-toggle-group
                    [value]="currentNetwork()"
                    (change)="switchNetwork($event.value)"
                    [disabled]="switching()"
                    hideSingleSelectionIndicator
                    class="header__network"
                    aria-label="Network selector">
                    <mat-button-toggle value="testnet" [class.network--testnet]="currentNetwork() === 'testnet'">TESTNET</mat-button-toggle>
                    <mat-button-toggle value="mainnet" [class.network--mainnet]="currentNetwork() === 'mainnet'">MAINNET</mat-button-toggle>
                </mat-button-toggle-group>
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
            padding: 0 var(--space-6);
            height: 56px;
            background: rgba(15, 16, 24, 0.85);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: var(--text-primary);
            border-bottom: 1px solid var(--border);
        }
        .header__brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .header__title {
            font-family: var(--font-display);
            font-size: 1rem;
            font-weight: 700;
            margin: 0;
            color: var(--accent-cyan);
            text-shadow: 0 0 10px var(--accent-cyan-glow);
            letter-spacing: 0.08em;
        }
        .header__controls {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .header__network {
            font-size: 0.6rem;
        }
        .network--testnet {
            --mat-button-toggle-selected-state-background-color: color-mix(in srgb, var(--network-testnet) 15%, transparent);
            --mat-button-toggle-selected-state-text-color: var(--network-testnet);
        }
        .network--mainnet {
            --mat-button-toggle-selected-state-background-color: color-mix(in srgb, var(--network-mainnet) 15%, transparent);
            --mat-button-toggle-selected-state-text-color: var(--network-mainnet);
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
            border-radius: var(--radius);
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
            transition: transform 0.25s ease, opacity 0.2s, background 0.15s;
            transform-origin: center;
        }
        :host-context(.sidebar-open) .header__hamburger-icon span:nth-child(1) {
            transform: translateY(6px) rotate(45deg);
        }
        :host-context(.sidebar-open) .header__hamburger-icon span:nth-child(2) {
            opacity: 0; transform: scaleX(0);
        }
        :host-context(.sidebar-open) .header__hamburger-icon span:nth-child(3) {
            transform: translateY(-6px) rotate(-45deg);
        }

        /* Show hamburger only on mobile */
        @media (max-width: 767px) {
            .header__hamburger {
                display: flex;
            }
            .header {
                padding: 0 var(--space-4);
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
