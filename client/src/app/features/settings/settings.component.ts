import { Component, ChangeDetectionStrategy, inject, OnInit, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { SessionService } from '../../core/services/session.service';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';

interface SettingsData {
    creditConfig: Record<string, string>;
    system: {
        schemaVersion: number;
        agentCount: number;
        projectCount: number;
        sessionCount: number;
    };
}

interface OperationalMode {
    mode: string;
}

interface PSKExchange {
    uri: string;
    address: string;
    network: string;
    label: string;
}

@Component({
    selector: 'app-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe],
    template: `
        <div class="settings">
            <h2>Settings</h2>

            @if (loading()) {
                <p class="loading">Loading settings...</p>
            } @else {
                <!-- System Info -->
                <div class="settings__section">
                    <h3>System Info</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Schema Version</span>
                            <span class="info-value">{{ settings()?.system?.schemaVersion }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Agents</span>
                            <span class="info-value">{{ settings()?.system?.agentCount }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Projects</span>
                            <span class="info-value">{{ settings()?.system?.projectCount }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Sessions</span>
                            <span class="info-value">{{ settings()?.system?.sessionCount }}</span>
                        </div>
                    </div>
                </div>

                <!-- AlgoChat Status -->
                <div class="settings__section">
                    <h3>AlgoChat</h3>
                    @if (algochatStatus(); as status) {
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Status</span>
                                <span class="info-value" [class.info-value--active]="status.enabled" [class.info-value--inactive]="!status.enabled">
                                    {{ status.enabled ? 'Connected' : 'Disconnected' }}
                                </span>
                            </div>
                            @if (status.address && status.address !== 'local') {
                                <div class="info-item">
                                    <span class="info-label">Address</span>
                                    <code class="info-code">{{ status.address }}</code>
                                </div>
                            }
                            <div class="info-item">
                                <span class="info-label">Network</span>
                                <span class="info-value network-badge" [attr.data-network]="status.network">{{ status.network }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Server Balance</span>
                                <span class="info-value" [class.algo-balance--low]="status.balance < 1000000">
                                    {{ status.balance / 1000000 | number:'1.2-4' }} ALGO
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Active Chats</span>
                                <span class="info-value">{{ status.activeConversations }}</span>
                            </div>
                        </div>
                    } @else {
                        <p class="muted">AlgoChat not configured</p>
                    }
                </div>

                <!-- Connect Mobile -->
                <div class="settings__section">
                    <h3>Connect Mobile</h3>
                    <p class="connect-desc">
                        Scan this QR code with the CorvidChat app to connect your phone to this agent via AlgoChat.
                    </p>
                    @if (pskExchange()) {
                        <div class="qr-container">
                            <canvas #qrCanvas class="qr-canvas"></canvas>
                        </div>
                        <div class="connect-info">
                            <div class="info-item">
                                <span class="info-label">Network</span>
                                <span class="info-value network-badge" [attr.data-network]="pskExchange()?.network">
                                    {{ pskExchange()?.network }}
                                </span>
                            </div>
                        </div>
                        <div class="connect-actions">
                            <button class="save-btn" (click)="copyPSKUri()">Copy URI</button>
                            <button class="backup-btn" (click)="regeneratePSK()">
                                {{ generatingPSK() ? 'Generating...' : 'Regenerate' }}
                            </button>
                        </div>
                    } @else {
                        <button
                            class="save-btn"
                            [disabled]="generatingPSK()"
                            (click)="generatePSK()"
                        >{{ generatingPSK() ? 'Generating...' : 'Generate QR Code' }}</button>
                    }
                </div>

                <!-- Operational Mode -->
                <div class="settings__section">
                    <h3>Operational Mode</h3>
                    <div class="mode-selector">
                        @for (mode of modes; track mode) {
                            <button
                                class="mode-btn"
                                [class.mode-btn--active]="operationalMode() === mode"
                                (click)="setMode(mode)"
                            >{{ mode }}</button>
                        }
                    </div>
                    <p class="mode-desc">
                        @switch (operationalMode()) {
                            @case ('normal') { Agents execute tools immediately without approval. }
                            @case ('queued') { Tool calls are queued for manual approval before execution. }
                            @case ('paused') { All sessions are paused. No tool execution. }
                        }
                    </p>
                </div>

                <!-- Credit Configuration -->
                <div class="settings__section">
                    <h3>Credit Configuration</h3>
                    <div class="credit-grid">
                        @for (field of creditFields; track field.key) {
                            <div class="credit-field">
                                <label class="credit-label" [for]="'credit_' + field.key">{{ field.label }}</label>
                                <input
                                    class="credit-input"
                                    type="number"
                                    [id]="'credit_' + field.key"
                                    [ngModel]="getCreditValue(field.key)"
                                    (ngModelChange)="setCreditValue(field.key, $event)"
                                />
                                <span class="credit-desc">{{ field.description }}</span>
                            </div>
                        }
                    </div>
                    <button
                        class="save-btn"
                        [disabled]="saving()"
                        (click)="saveCreditConfig()"
                    >{{ saving() ? 'Saving...' : 'Save Credit Config' }}</button>
                </div>

                <!-- Database Backup -->
                <div class="settings__section">
                    <h3>Database</h3>
                    <button
                        class="backup-btn"
                        [disabled]="backingUp()"
                        (click)="runBackup()"
                    >{{ backingUp() ? 'Backing up...' : 'Create Backup' }}</button>
                    @if (backupResult()) {
                        <p class="backup-result">{{ backupResult() }}</p>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .settings { padding: 1.5rem; max-width: 900px; }
        .settings h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .settings h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .loading, .muted { color: var(--text-secondary); font-size: 0.8rem; }

        .settings__section {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1.25rem;
            margin-bottom: 1.25rem;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 0.75rem;
        }
        .info-item {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .info-label {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .info-value {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .info-value--active { color: var(--accent-green); }
        .info-value--inactive { color: var(--accent-red); }
        .info-code {
            background: var(--bg-raised);
            color: var(--accent-magenta);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            font-size: 0.7rem;
            border: 1px solid var(--border);
            word-break: break-all;
        }
        .network-badge {
            text-transform: uppercase;
            font-size: 0.75rem;
        }
        .network-badge[data-network="testnet"] { color: #4a90d9; }
        .network-badge[data-network="mainnet"] { color: #50e3c2; }
        .network-badge[data-network="localnet"] { color: #f5a623; }
        .algo-balance--low { color: var(--accent-red, #ff4d4f) !important; }

        /* Connect Mobile */
        .connect-desc {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-bottom: 1rem;
        }
        .qr-container {
            display: flex;
            justify-content: center;
            margin-bottom: 1rem;
        }
        .qr-canvas {
            border-radius: var(--radius);
            border: 2px solid var(--accent-cyan);
            box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
        }
        .connect-info {
            margin-bottom: 0.75rem;
        }
        .connect-actions {
            display: flex;
            gap: 0.5rem;
        }

        /* Operational mode */
        .mode-selector {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .mode-btn {
            padding: 0.45rem 0.85rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-family: inherit;
            font-weight: 600;
            cursor: pointer;
            text-transform: capitalize;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .mode-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .mode-btn--active {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
            background: var(--accent-cyan-dim);
        }
        .mode-desc {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            margin: 0;
        }

        /* Credit fields */
        .credit-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .credit-field {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .credit-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
            font-weight: 600;
        }
        .credit-input {
            padding: 0.45rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-family: inherit;
            width: 100%;
        }
        .credit-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .credit-desc {
            font-size: 0.6rem;
            color: var(--text-tertiary);
        }

        /* Buttons */
        .save-btn, .backup-btn {
            padding: 0.5rem 1.25rem;
            border-radius: var(--radius);
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s;
        }
        .save-btn {
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
        }
        .save-btn:hover:not(:disabled) { background: rgba(0, 229, 255, 0.2); }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .backup-btn {
            background: var(--accent-magenta-dim);
            color: var(--accent-magenta);
            border: 1px solid var(--accent-magenta);
        }
        .backup-btn:hover:not(:disabled) { background: rgba(255, 0, 170, 0.2); }
        .backup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .backup-result {
            font-size: 0.7rem;
            color: var(--accent-green);
            margin-top: 0.5rem;
        }
    `,
})
export class SettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);
    private readonly sessionService = inject(SessionService);

    @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly backingUp = signal(false);
    readonly generatingPSK = signal(false);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');
    readonly backupResult = signal<string | null>(null);
    readonly algochatStatus = this.sessionService.algochatStatus;
    readonly pskExchange = signal<PSKExchange | null>(null);

    // Mutable copy for credit config editing
    private creditValues: Record<string, string> = {};

    readonly modes = ['normal', 'queued', 'paused'];

    readonly creditFields = [
        { key: 'credits_per_algo', label: 'Credits per ALGO', description: 'How many credits 1 ALGO buys' },
        { key: 'credits_per_turn', label: 'Credits per Turn', description: 'Credits consumed per agent turn' },
        { key: 'credits_per_agent_message', label: 'Credits per Agent Message', description: 'Credits for agent-to-agent messages' },
        { key: 'low_credit_threshold', label: 'Low Credit Warning', description: 'Threshold for low-balance warnings' },
        { key: 'free_credits_on_first_message', label: 'Free Credits (First Message)', description: 'Credits given on first contact' },
        { key: 'reserve_per_group_message', label: 'Reserve per Group Message', description: 'Credits reserved for group chats' },
    ];

    ngOnInit(): void {
        this.loadAll();
    }

    getCreditValue(key: string): string {
        return this.creditValues[key] ?? this.settings()?.creditConfig?.[key] ?? '';
    }

    setCreditValue(key: string, value: string): void {
        this.creditValues[key] = value;
    }

    async setMode(mode: string): Promise<void> {
        try {
            await firstValueFrom(this.api.post<{ ok: boolean }>('/operational-mode', { mode }));
            this.operationalMode.set(mode);
            this.notifications.success(`Operational mode set to ${mode}`);
        } catch {
            this.notifications.error('Failed to update operational mode');
        }
    }

    async saveCreditConfig(): Promise<void> {
        if (Object.keys(this.creditValues).length === 0) {
            this.notifications.error('No changes to save');
            return;
        }
        this.saving.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/credits', this.creditValues));
            this.notifications.success('Credit configuration saved');
            this.creditValues = {};
        } catch {
            this.notifications.error('Failed to save credit configuration');
        } finally {
            this.saving.set(false);
        }
    }

    async runBackup(): Promise<void> {
        this.backingUp.set(true);
        this.backupResult.set(null);
        try {
            const result = await firstValueFrom(this.api.post<{ path: string }>('/backup'));
            this.backupResult.set(`Backup created: ${result.path}`);
            this.notifications.success('Database backup created');
        } catch {
            this.notifications.error('Backup failed');
        } finally {
            this.backingUp.set(false);
        }
    }

    async generatePSK(): Promise<void> {
        this.generatingPSK.set(true);
        try {
            const result = await firstValueFrom(this.api.post<PSKExchange>('/algochat/psk-exchange'));
            this.pskExchange.set(result);
            this.notifications.success('PSK QR code generated');
            // Wait for DOM update, then render QR
            setTimeout(() => this.renderQRCode(result.uri), 50);
        } catch {
            this.notifications.error('Failed to generate PSK');
        } finally {
            this.generatingPSK.set(false);
        }
    }

    async regeneratePSK(): Promise<void> {
        if (!confirm('Regenerating the PSK will disconnect any mobile clients currently connected. Continue?')) {
            return;
        }
        await this.generatePSK();
    }

    copyPSKUri(): void {
        const uri = this.pskExchange()?.uri;
        if (uri) {
            navigator.clipboard.writeText(uri).then(() => {
                this.notifications.success('PSK URI copied to clipboard');
            });
        }
    }

    private renderQRCode(uri: string): void {
        if (!this.qrCanvas?.nativeElement) return;
        QRCode.toCanvas(this.qrCanvas.nativeElement, uri, {
            width: 280,
            margin: 2,
            color: {
                dark: '#00e5ff',
                light: '#0a0a12',
            },
        });
    }

    private async loadAll(): Promise<void> {
        this.loading.set(true);
        try {
            const [settings, mode] = await Promise.all([
                firstValueFrom(this.api.get<SettingsData>('/settings')),
                firstValueFrom(this.api.get<OperationalMode>('/operational-mode')),
            ]);
            this.settings.set(settings);
            this.operationalMode.set(mode.mode);
            this.sessionService.loadAlgoChatStatus();

            // Load existing PSK exchange URI
            try {
                const psk = await firstValueFrom(this.api.get<PSKExchange | null>('/algochat/psk-exchange'));
                if (psk?.uri) {
                    this.pskExchange.set(psk);
                    setTimeout(() => this.renderQRCode(psk.uri), 50);
                }
            } catch {
                // PSK not configured yet, that's fine
            }
        } catch {
            // Non-critical
        } finally {
            this.loading.set(false);
        }
    }
}
