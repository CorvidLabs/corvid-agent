import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed, ElementRef } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
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

interface PSKContact {
    id: string;
    nickname: string;
    network: string;
    mobileAddress: string | null;
    active: boolean;
    createdAt: string;
    uri?: string;
}

@Component({
    selector: 'app-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, TitleCasePipe],
    template: `
        <div class="settings">
            <h2>Settings</h2>

            @if (loading()) {
                <p class="loading">Loading settings...</p>
            } @else {
                <!-- System Info -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('system')">
                        <span class="section-chevron">{{ collapsedSections().has('system') ? '\u25B6' : '\u25BC' }}</span>
                        System Info
                    </h3>
                    @if (!collapsedSections().has('system')) {
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
                    }
                </div>

                <!-- System Health -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('health')">
                        <span class="section-chevron">{{ collapsedSections().has('health') ? '\u25B6' : '\u25BC' }}</span>
                        System Health
                    </h3>
                    @if (!collapsedSections().has('health')) {
                        <div class="health-grid">
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="algochatStatus() ? 'ok' : 'off'"></span>
                                <span class="health-name">AlgoChat</span>
                                <span class="health-status">{{ algochatStatus()?.enabled ? 'Connected' : 'Disconnected' }}</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="operationalMode() === 'normal' ? 'ok' : operationalMode() === 'paused' ? 'off' : 'warn'"></span>
                                <span class="health-name">Operations</span>
                                <span class="health-status">{{ operationalMode() | titlecase }}</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="(settings()?.system?.sessionCount ?? 0) > 0 ? 'ok' : 'off'"></span>
                                <span class="health-name">Sessions</span>
                                <span class="health-status">{{ settings()?.system?.sessionCount }} total</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="pskContacts().length > 0 ? 'ok' : 'off'"></span>
                                <span class="health-name">Mobile Contacts</span>
                                <span class="health-status">{{ pskContacts().length }} configured</span>
                            </div>
                        </div>
                    }
                </div>

                <!-- AlgoChat Status -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('algochat')">
                        <span class="section-chevron">{{ collapsedSections().has('algochat') ? '\u25B6' : '\u25BC' }}</span>
                        AlgoChat
                    </h3>
                    @if (!collapsedSections().has('algochat')) {
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
                    }
                </div>

                <!-- Connect Mobile — Multi-Contact PSK -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('mobile')">
                        <span class="section-chevron">{{ collapsedSections().has('mobile') ? '\u25B6' : '\u25BC' }}</span>
                        Connect Mobile
                        @if (pskContacts().length > 0) {
                            <span class="section-badge">{{ pskContacts().length }}</span>
                        }
                    </h3>
                    @if (!collapsedSections().has('mobile')) {
                        <p class="connect-desc">
                            Share your agent with friends. Each contact gets their own encrypted PSK channel.
                        </p>

                        <!-- Contact list -->
                        @if (pskContacts().length > 0) {
                            <div class="contact-list">
                                @for (contact of pskContacts(); track contact.id) {
                                    <div class="contact-card">
                                        <div class="contact-header">
                                            @if (editingContactId() === contact.id) {
                                                <input
                                                    class="contact-nickname-input"
                                                    [value]="editingNickname()"
                                                    (input)="editingNickname.set(asInputValue($event))"
                                                    (keydown.enter)="saveNickname(contact.id)"
                                                    (keydown.escape)="cancelEditNickname()"
                                                />
                                                <button class="icon-btn" (click)="saveNickname(contact.id)" title="Save">&#10003;</button>
                                                <button class="icon-btn" (click)="cancelEditNickname()" title="Cancel">&#10005;</button>
                                            } @else {
                                                <span class="contact-nickname" (dblclick)="startEditNickname(contact)">{{ contact.nickname }}</span>
                                                <button class="icon-btn" (click)="startEditNickname(contact)" title="Rename">&#9998;</button>
                                            }
                                            <span class="contact-status" [class.contact-status--active]="contact.mobileAddress"
                                                  [class.contact-status--waiting]="!contact.mobileAddress">
                                                {{ contact.mobileAddress ? 'Connected' : 'Waiting' }}
                                            </span>
                                        </div>
                                        @if (contact.mobileAddress) {
                                            <code class="contact-address">{{ contact.mobileAddress }}</code>
                                        }
                                        <div class="contact-actions">
                                            <button class="save-btn save-btn--sm" (click)="toggleQR(contact)">
                                                {{ expandedContactId() === contact.id ? 'Hide QR' : 'Show QR' }}
                                            </button>
                                            <button class="save-btn save-btn--sm" (click)="copyContactUri(contact)">Copy URI</button>
                                            <button class="cancel-btn cancel-btn--sm" (click)="cancelContact(contact)">Delete</button>
                                        </div>
                                        @if (expandedContactId() === contact.id && contact.uri) {
                                            <div class="qr-container">
                                                <canvas class="qr-canvas"></canvas>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        } @else {
                            <p class="muted">No contacts yet. Add one to get started.</p>
                        }

                        <!-- Add contact -->
                        <div class="add-contact">
                            @if (addingContact()) {
                                <div class="add-contact-form">
                                    <input
                                        class="contact-nickname-input"
                                        placeholder="Nickname (e.g. Alice)"
                                        [value]="newContactNickname()"
                                        (input)="newContactNickname.set(asInputValue($event))"
                                        (keydown.enter)="createContact()"
                                        (keydown.escape)="addingContact.set(false)"
                                    />
                                    <button class="save-btn save-btn--sm" [disabled]="creatingContact()" (click)="createContact()">
                                        {{ creatingContact() ? 'Creating...' : 'Create' }}
                                    </button>
                                    <button class="icon-btn" (click)="addingContact.set(false)">&#10005;</button>
                                </div>
                            } @else {
                                <button class="save-btn" (click)="addingContact.set(true)">+ Add Contact</button>
                            }
                        </div>
                    }
                </div>

                <!-- Operational Mode -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('mode')">
                        <span class="section-chevron">{{ collapsedSections().has('mode') ? '\u25B6' : '\u25BC' }}</span>
                        Operational Mode
                        <span class="section-badge section-badge--mode" [attr.data-mode]="operationalMode()">{{ operationalMode() }}</span>
                    </h3>
                    @if (!collapsedSections().has('mode')) {
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
                    }
                </div>

                <!-- Credit Configuration -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('credits')">
                        <span class="section-chevron">{{ collapsedSections().has('credits') ? '\u25B6' : '\u25BC' }}</span>
                        Credit Configuration
                        @if (isDirty()) {
                            <span class="dirty-badge">Unsaved changes</span>
                        }
                    </h3>
                    @if (!collapsedSections().has('credits')) {
                        <div class="credit-grid">
                            @for (field of creditFields; track field.key) {
                                <div class="credit-field">
                                    <label class="credit-label" [for]="'credit_' + field.key">{{ field.label }}</label>
                                    <input
                                        class="credit-input"
                                        [class.credit-input--dirty]="isCreditDirty(field.key)"
                                        type="number"
                                        [id]="'credit_' + field.key"
                                        [ngModel]="getCreditValue(field.key)"
                                        (ngModelChange)="setCreditValue(field.key, $event)"
                                    />
                                    <span class="credit-desc">{{ field.description }}</span>
                                </div>
                            }
                        </div>
                        <div class="credit-actions">
                            <button
                                class="save-btn"
                                [disabled]="saving() || !isDirty()"
                                (click)="saveCreditConfig()"
                            >{{ saving() ? 'Saving...' : 'Save Credit Config' }}</button>
                            @if (isDirty()) {
                                <button class="cancel-btn cancel-btn--sm" (click)="resetCreditChanges()">Discard Changes</button>
                            }
                        </div>
                    }
                </div>

                <!-- Database Backup -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('database')">
                        <span class="section-chevron">{{ collapsedSections().has('database') ? '\u25B6' : '\u25BC' }}</span>
                        Database
                    </h3>
                    @if (!collapsedSections().has('database')) {
                        <button
                            class="backup-btn"
                            [disabled]="backingUp()"
                            (click)="runBackup()"
                        >{{ backingUp() ? 'Backing up...' : 'Create Backup' }}</button>
                        @if (backupResult()) {
                            <p class="backup-result">{{ backupResult() }}</p>
                        }
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

        /* Collapsible sections */
        .section-toggle {
            cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
            user-select: none; transition: color 0.15s;
        }
        .section-toggle:hover { color: var(--accent-cyan); }
        .section-chevron { font-size: 0.55rem; color: var(--text-tertiary); width: 0.75rem; }
        .section-badge {
            font-size: 0.55rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid var(--accent-cyan);
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .section-badge--mode[data-mode="normal"] { color: var(--accent-green); border-color: var(--accent-green); background: var(--accent-green-dim); }
        .section-badge--mode[data-mode="queued"] { color: var(--accent-amber); border-color: var(--accent-amber); background: var(--accent-amber-dim); }
        .section-badge--mode[data-mode="paused"] { color: var(--accent-red); border-color: var(--accent-red); background: var(--accent-red-dim); }
        .dirty-badge {
            font-size: 0.55rem; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--accent-amber-dim); color: var(--accent-amber); border: 1px solid var(--accent-amber);
            margin-left: auto;
        }

        /* Health grid */
        .health-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        .health-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; background: var(--bg-raised); border-radius: var(--radius); }
        .health-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .health-dot[data-status="ok"] { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green); }
        .health-dot[data-status="warn"] { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber); }
        .health-dot[data-status="off"] { background: var(--text-tertiary); }
        .health-name { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); min-width: 120px; }
        .health-status { font-size: 0.7rem; color: var(--text-secondary); }

        /* Credit dirty input */
        .credit-input--dirty { border-color: var(--accent-amber) !important; }
        .credit-actions { display: flex; gap: 0.5rem; align-items: center; }

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

        /* Connect Mobile — Contact List */
        .connect-desc {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-bottom: 1rem;
        }
        .contact-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-bottom: 1rem;
            max-height: 500px;
            overflow-y: auto;
        }
        .contact-card {
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
        }
        .contact-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.35rem;
        }
        .contact-nickname {
            font-weight: 700;
            font-size: 0.85rem;
            color: var(--text-primary);
            cursor: pointer;
        }
        .contact-nickname-input {
            padding: 0.25rem 0.4rem;
            background: var(--bg-input);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-size: 0.8rem;
            font-family: inherit;
            font-weight: 600;
            outline: none;
            width: 140px;
        }
        .contact-status {
            font-size: 0.65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-left: auto;
        }
        .contact-status--active { color: var(--accent-green); }
        .contact-status--waiting { color: var(--accent-yellow, #f5a623); }
        .contact-address {
            display: block;
            font-size: 0.6rem;
            color: var(--accent-magenta);
            background: var(--bg-surface);
            padding: 2px 4px;
            border-radius: var(--radius-sm);
            margin-bottom: 0.4rem;
            word-break: break-all;
        }
        .contact-actions {
            display: flex;
            gap: 0.4rem;
            flex-wrap: wrap;
        }
        .icon-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 0.85rem;
            padding: 0.1rem 0.3rem;
            border-radius: var(--radius-sm);
        }
        .icon-btn:hover { color: var(--text-primary); background: var(--bg-surface); }
        .qr-container {
            display: flex;
            justify-content: center;
            margin-top: 0.75rem;
        }
        .qr-canvas {
            border-radius: var(--radius);
            border: 2px solid var(--accent-cyan);
            box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
        }
        .add-contact {
            margin-top: 0.5rem;
        }
        .add-contact-form {
            display: flex;
            align-items: center;
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
        .save-btn, .backup-btn, .cancel-btn {
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
        .save-btn--sm, .cancel-btn--sm {
            padding: 0.3rem 0.7rem;
            font-size: 0.65rem;
        }
        .backup-btn {
            background: var(--accent-magenta-dim);
            color: var(--accent-magenta);
            border: 1px solid var(--accent-magenta);
        }
        .backup-btn:hover:not(:disabled) { background: rgba(255, 0, 170, 0.2); }
        .backup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cancel-btn {
            background: transparent;
            color: var(--accent-red, #ff4d4f);
            border: 1px solid var(--accent-red, #ff4d4f);
        }
        .cancel-btn:hover { background: rgba(255, 77, 79, 0.1); }
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
    private readonly elRef = inject(ElementRef);

    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly backingUp = signal(false);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');
    readonly backupResult = signal<string | null>(null);
    readonly algochatStatus = this.sessionService.algochatStatus;

    // Multi-contact PSK state
    readonly pskContacts = signal<PSKContact[]>([]);
    readonly expandedContactId = signal<string | null>(null);
    readonly addingContact = signal(false);
    readonly newContactNickname = signal('');
    readonly creatingContact = signal(false);
    readonly editingContactId = signal<string | null>(null);
    readonly editingNickname = signal('');

    // Collapsible sections
    readonly collapsedSections = signal<Set<string>>(new Set());

    // Mutable copy for credit config editing
    private creditValues: Record<string, string> = {};
    readonly dirtyKeys = signal<Set<string>>(new Set());
    readonly isDirty = computed(() => this.dirtyKeys().size > 0);

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

    /** Helper for template input events. */
    asInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    toggleSection(section: string): void {
        this.collapsedSections.update((set) => {
            const next = new Set(set);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    }

    getCreditValue(key: string): string {
        return this.creditValues[key] ?? this.settings()?.creditConfig?.[key] ?? '';
    }

    setCreditValue(key: string, value: string): void {
        this.creditValues[key] = value;
        const original = this.settings()?.creditConfig?.[key] ?? '';
        this.dirtyKeys.update((set) => {
            const next = new Set(set);
            if (value === original) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    isCreditDirty(key: string): boolean {
        return this.dirtyKeys().has(key);
    }

    resetCreditChanges(): void {
        this.creditValues = {};
        this.dirtyKeys.set(new Set());
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
        if (!this.isDirty()) return;
        this.saving.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/credits', this.creditValues));
            this.notifications.success('Credit configuration saved');
            this.creditValues = {};
            this.dirtyKeys.set(new Set());
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

    // ── Multi-contact PSK methods ────────────────────────────────────

    async createContact(): Promise<void> {
        const nickname = this.newContactNickname().trim();
        if (!nickname) {
            this.notifications.error('Please enter a nickname');
            return;
        }
        this.creatingContact.set(true);
        try {
            const result = await firstValueFrom(
                this.api.post<{ id: string; uri: string; nickname: string }>('/algochat/psk-contacts', { nickname })
            );
            // Reload contacts list and auto-expand the new one
            await this.loadPSKContacts();
            this.newContactNickname.set('');
            this.addingContact.set(false);
            this.notifications.success(`Contact "${result.nickname}" created`);
            // Auto-expand QR for the new contact
            this.toggleQR({ ...result, network: '', mobileAddress: null, active: true, createdAt: '', uri: result.uri });
        } catch {
            this.notifications.error('Failed to create contact');
        } finally {
            this.creatingContact.set(false);
        }
    }

    async toggleQR(contact: PSKContact): Promise<void> {
        if (this.expandedContactId() === contact.id) {
            this.expandedContactId.set(null);
            return;
        }

        // Load URI if not cached
        if (!contact.uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                contact.uri = result.uri;
                // Update in the contacts array
                this.pskContacts.update((list) => list.map((c) => c.id === contact.id ? { ...c, uri: result.uri } : c));
            } catch {
                this.notifications.error('Failed to load QR code');
                return;
            }
        }

        this.expandedContactId.set(contact.id);
        this.renderQRWhenReady(contact.uri!);
    }

    async copyContactUri(contact: PSKContact): Promise<void> {
        let uri = contact.uri;
        if (!uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                uri = result.uri;
            } catch {
                this.notifications.error('Failed to get URI');
                return;
            }
        }
        await navigator.clipboard.writeText(uri);
        this.notifications.success('URI copied to clipboard');
    }

    async cancelContact(contact: PSKContact): Promise<void> {
        if (!confirm(`Delete contact "${contact.nickname}"? They will no longer be able to message your agent.`)) {
            return;
        }
        try {
            await firstValueFrom(this.api.delete(`/algochat/psk-contacts/${contact.id}`));
            this.notifications.success(`Contact "${contact.nickname}" deleted`);
            if (this.expandedContactId() === contact.id) {
                this.expandedContactId.set(null);
            }
            await this.loadPSKContacts();
        } catch {
            this.notifications.error('Failed to delete contact');
        }
    }

    startEditNickname(contact: PSKContact): void {
        this.editingContactId.set(contact.id);
        this.editingNickname.set(contact.nickname);
    }

    cancelEditNickname(): void {
        this.editingContactId.set(null);
        this.editingNickname.set('');
    }

    async saveNickname(contactId: string): Promise<void> {
        const nickname = this.editingNickname().trim();
        if (!nickname) return;
        try {
            await firstValueFrom(
                this.api.patch(`/algochat/psk-contacts/${contactId}`, { nickname })
            );
            this.pskContacts.update((list) => list.map((c) => c.id === contactId ? { ...c, nickname } : c));
            this.editingContactId.set(null);
            this.notifications.success('Contact renamed');
        } catch {
            this.notifications.error('Failed to rename contact');
        }
    }

    // ── Private ──────────────────────────────────────────────────────

    /** Retry rendering until the canvas element is available in the DOM. */
    private renderQRWhenReady(uri: string, attempt = 0): void {
        if (attempt > 20) return;
        const canvas = this.elRef.nativeElement.querySelector('.qr-canvas') as HTMLCanvasElement | null;
        if (canvas) {
            QRCode.toCanvas(canvas, uri, {
                width: 280,
                margin: 2,
                color: {
                    dark: '#0a0a12',
                    light: '#e0f7fa',
                },
            });
        } else {
            setTimeout(() => this.renderQRWhenReady(uri, attempt + 1), 50);
        }
    }

    private async loadPSKContacts(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ contacts: PSKContact[] }>('/algochat/psk-contacts')
            );
            this.pskContacts.set(result.contacts);
        } catch {
            // Non-critical
        }
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

            // Load PSK contacts
            await this.loadPSKContacts();
        } catch {
            // Non-critical
        } finally {
            this.loading.set(false);
        }
    }
}
