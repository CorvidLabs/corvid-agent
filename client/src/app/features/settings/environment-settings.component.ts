import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

interface RuntimeConfig {
    agent: {
        name: string;
        description: string | null;
        defaultModel: string;
        defaultProvider: string;
    };
    server: {
        port: number;
        bindHost: string;
        logLevel: string;
        logFormat: string;
        apiKeyConfigured: boolean;
        adminApiKeyConfigured: boolean;
        allowedOrigins: string | null;
        publicUrl: string | null;
    };
    database: {
        path: string;
    };
    providers: {
        enabled: string[];
        anthropicConfigured: boolean;
        ollamaHost: string;
        openrouterConfigured: boolean;
        councilModel: string | null;
    };
    integrations: {
        discord: { enabled: boolean; tokenConfigured: boolean; channelConfigured: boolean };
        telegram: { enabled: boolean; tokenConfigured: boolean; chatIdConfigured: boolean };
        algochat: { enabled: boolean; mnemonicConfigured: boolean; network: string };
        github: { tokenConfigured: boolean; owner: string | null; repo: string | null };
        slack: { enabled: boolean; tokenConfigured: boolean };
    };
    configurableKeys?: string[];
}

interface EditField {
    key: string;
    label: string;
    value: string;
    type: 'text' | 'password' | 'select';
    options?: string[];
    masked?: boolean;
}

type EditSection = {
    title: string;
    fields: EditField[];
};

@Component({
    selector: 'app-environment-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Runtime Configuration
                @if (editMode()) {
                    <span class="section-badge">Editing</span>
                }
                @if (restartRequired()) {
                    <span class="dirty-badge dirty-badge-pulse">Restart Required</span>
                }
            </h3>
            @if (!collapsed()) {
                @if (loading()) {
                    <p class="muted">Loading configuration...</p>
                } @else if (!config()) {
                    <p class="muted">Unable to load runtime configuration.</p>
                } @else {
                    @if (restartRequired()) {
                        <div class="restart-banner">
                            Settings saved. Restart the server for changes to take effect.
                        </div>
                    }

                    @if (!editMode()) {
                        <!-- READ-ONLY VIEW -->

                        <!-- Agent Identity -->
                        <div class="config-group">
                            <div class="config-group-header">
                                <div class="config-group-title">Agent</div>
                            </div>
                            <div class="config-grid">
                                <div class="config-item">
                                    <span class="config-key">Name</span>
                                    <span class="config-value">{{ config()!.agent.name }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Default Model</span>
                                    <span class="config-value config-value--mono">{{ config()!.agent.defaultModel }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Default Provider</span>
                                    <span class="config-value config-value--mono">{{ config()!.agent.defaultProvider }}</span>
                                </div>
                                @if (config()!.providers.councilModel) {
                                    <div class="config-item">
                                        <span class="config-key">Council Model</span>
                                        <span class="config-value config-value--mono">{{ config()!.providers.councilModel }}</span>
                                    </div>
                                }
                            </div>
                        </div>

                        <!-- Server -->
                        <div class="config-group">
                            <div class="config-group-title">Server</div>
                            <div class="config-grid">
                                <div class="config-item">
                                    <span class="config-key">Port</span>
                                    <span class="config-value config-value--mono">{{ config()!.server.port }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Bind Host</span>
                                    <span class="config-value config-value--mono">{{ config()!.server.bindHost }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Log Level</span>
                                    <span class="config-value config-value--mono">{{ config()!.server.logLevel }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Log Format</span>
                                    <span class="config-value config-value--mono">{{ config()!.server.logFormat }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">API Key</span>
                                    <span class="config-value" [class.config-value--set]="config()!.server.apiKeyConfigured" [class.config-value--unset]="!config()!.server.apiKeyConfigured">
                                        {{ config()!.server.apiKeyConfigured ? 'Configured' : 'Not set (localhost only)' }}
                                    </span>
                                </div>
                                @if (config()!.server.publicUrl) {
                                    <div class="config-item">
                                        <span class="config-key">Public URL</span>
                                        <span class="config-value config-value--mono">{{ config()!.server.publicUrl }}</span>
                                    </div>
                                }
                            </div>
                        </div>

                        <!-- Providers -->
                        <div class="config-group">
                            <div class="config-group-title">LLM Providers</div>
                            <div class="config-grid">
                                <div class="config-item">
                                    <span class="config-key">Enabled</span>
                                    <span class="config-value config-value--mono">{{ config()!.providers.enabled.join(', ') }}</span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Anthropic API Key</span>
                                    <span class="config-value" [class.config-value--set]="config()!.providers.anthropicConfigured" [class.config-value--unset]="!config()!.providers.anthropicConfigured">
                                        {{ config()!.providers.anthropicConfigured ? 'Configured' : 'Not set' }}
                                    </span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">OpenRouter API Key</span>
                                    <span class="config-value" [class.config-value--set]="config()!.providers.openrouterConfigured" [class.config-value--unset]="!config()!.providers.openrouterConfigured">
                                        {{ config()!.providers.openrouterConfigured ? 'Configured' : 'Not set' }}
                                    </span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Ollama Host</span>
                                    <span class="config-value config-value--mono">{{ config()!.providers.ollamaHost }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Integrations -->
                        <div class="config-group">
                            <div class="config-group-title">Integrations</div>
                            <div class="config-grid">
                                <div class="config-item">
                                    <span class="config-key">GitHub Token</span>
                                    <span class="config-value" [class.config-value--set]="config()!.integrations.github.tokenConfigured" [class.config-value--unset]="!config()!.integrations.github.tokenConfigured">
                                        {{ config()!.integrations.github.tokenConfigured ? 'Configured' : 'Not set' }}
                                    </span>
                                </div>
                                @if (config()!.integrations.github.owner) {
                                    <div class="config-item">
                                        <span class="config-key">GitHub Repo</span>
                                        <span class="config-value config-value--mono">{{ config()!.integrations.github.owner }}/{{ config()!.integrations.github.repo }}</span>
                                    </div>
                                }
                                <div class="config-item">
                                    <span class="config-key">Discord</span>
                                    <span class="config-value" [class.config-value--set]="config()!.integrations.discord.enabled" [class.config-value--unset]="!config()!.integrations.discord.enabled">
                                        {{ config()!.integrations.discord.enabled ? 'Enabled' : 'Not configured' }}
                                    </span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Telegram</span>
                                    <span class="config-value" [class.config-value--set]="config()!.integrations.telegram.enabled" [class.config-value--unset]="!config()!.integrations.telegram.enabled">
                                        {{ config()!.integrations.telegram.enabled ? 'Enabled' : 'Not configured' }}
                                    </span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">AlgoChat</span>
                                    <span class="config-value" [class.config-value--set]="config()!.integrations.algochat.enabled" [class.config-value--unset]="!config()!.integrations.algochat.enabled">
                                        {{ config()!.integrations.algochat.enabled ? 'Enabled (' + config()!.integrations.algochat.network + ')' : 'Not configured' }}
                                    </span>
                                </div>
                                <div class="config-item">
                                    <span class="config-key">Slack</span>
                                    <span class="config-value" [class.config-value--set]="config()!.integrations.slack.enabled" [class.config-value--unset]="!config()!.integrations.slack.enabled">
                                        {{ config()!.integrations.slack.enabled ? 'Enabled' : 'Not configured' }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Database -->
                        <div class="config-group">
                            <div class="config-group-title">Database</div>
                            <div class="config-grid">
                                <div class="config-item">
                                    <span class="config-key">Path</span>
                                    <span class="config-value config-value--mono">{{ config()!.database.path }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="edit-row">
                            <button class="save-btn save-btn--sm" (click)="enterEditMode()">Edit Settings</button>
                        </div>
                    } @else {
                        <!-- EDIT MODE -->
                        @for (section of editSections(); track section.title) {
                            <div class="config-group">
                                <div class="config-group-title">{{ section.title }}</div>
                                <div class="edit-fields">
                                    @for (field of section.fields; track field.key) {
                                        <div class="edit-field">
                                            <label class="edit-label" [for]="'env_' + field.key">{{ field.label }}</label>
                                            @if (field.type === 'select') {
                                                <select class="edit-input" [id]="'env_' + field.key"
                                                    [ngModel]="editValues()[field.key] ?? ''"
                                                    (ngModelChange)="setEditValue(field.key, $event)">
                                                    <option value="">-- unchanged --</option>
                                                    @for (opt of field.options; track opt) {
                                                        <option [value]="opt">{{ opt }}</option>
                                                    }
                                                </select>
                                            } @else {
                                                <div class="edit-input-row">
                                                    <input
                                                        [id]="'env_' + field.key"
                                                        class="edit-input"
                                                        [type]="field.masked && !showFields()[field.key] ? 'password' : 'text'"
                                                        [placeholder]="field.masked ? maskPlaceholder(field.key) : ''"
                                                        [ngModel]="editValues()[field.key] ?? ''"
                                                        (ngModelChange)="setEditValue(field.key, $event)"
                                                    />
                                                    @if (field.masked) {
                                                        <button class="show-btn" type="button" (click)="toggleShow(field.key)">
                                                            {{ showFields()[field.key] ? 'Hide' : 'Show' }}
                                                        </button>
                                                    }
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            </div>
                        }

                        <div class="edit-actions">
                            <button class="save-btn save-btn--sm" [disabled]="saving()" (click)="saveEnvVars()">
                                {{ saving() ? 'Saving...' : 'Save' }}
                            </button>
                            <button class="cancel-btn cancel-btn--sm" (click)="cancelEdit()">Cancel</button>
                        </div>
                    }
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .config-group { margin-bottom: 0.85rem; }
        .config-group:last-of-type { margin-bottom: 0; }
        .config-group-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; }
        .config-group-title {
            font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
            color: var(--text-tertiary); margin-bottom: 0.4rem;
        }
        .config-grid { display: flex; flex-direction: column; gap: 0.3rem; }
        .config-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.55rem 0.75rem; background: var(--bg-raised); border-radius: var(--radius);
            min-height: 40px;
        }
        .config-key { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
        .config-value { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); text-align: right; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .config-value--mono { font-family: var(--font-mono); font-size: 0.82rem; }
        .config-value--set { color: var(--accent-green); }
        .config-value--unset { color: var(--text-tertiary); }
        .muted { font-size: 0.8rem; color: var(--text-tertiary); margin: 0; }
        .edit-row { display: flex; justify-content: flex-end; margin-top: 0.75rem; }
        .edit-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }
        .edit-fields { display: flex; flex-direction: column; gap: 0.4rem; }
        .edit-field { display: flex; flex-direction: column; gap: 0.2rem; }
        .edit-label { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
        .edit-input-row { display: flex; gap: 0.4rem; align-items: center; }
        .edit-input {
            flex: 1; padding: 0.45rem 0.6rem; background: var(--bg-raised);
            border: 1px solid var(--border); border-radius: var(--radius);
            color: var(--text-primary); font-size: 0.8rem; font-family: inherit;
        }
        .edit-input:focus { outline: none; border-color: var(--accent-cyan); }
        .show-btn {
            font-size: 0.7rem; font-weight: 600; padding: 0.3rem 0.5rem;
            background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); color: var(--text-secondary); cursor: pointer;
            white-space: nowrap;
        }
        .show-btn:hover { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .restart-banner {
            background: var(--accent-amber-dim); border: 1px solid var(--accent-amber);
            border-radius: var(--radius); padding: 0.5rem 0.75rem;
            font-size: 0.8rem; color: var(--accent-amber); margin-bottom: 0.75rem;
        }
    `,
})
export class EnvironmentSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly loading = signal(true);
    readonly config = signal<RuntimeConfig | null>(null);
    readonly editMode = signal(false);
    readonly saving = signal(false);
    readonly restartRequired = signal(false);
    readonly editValues = signal<Record<string, string>>({});
    readonly showFields = signal<Record<string, boolean>>({});

    readonly editSections = signal<EditSection[]>([]);

    ngOnInit(): void {
        this.loadRuntimeConfig();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    enterEditMode(): void {
        this.editMode.set(true);
        this.editValues.set({});
        this.showFields.set({});
        this.buildEditSections();
    }

    cancelEdit(): void {
        this.editMode.set(false);
        this.editValues.set({});
        this.showFields.set({});
    }

    setEditValue(key: string, value: string): void {
        this.editValues.update(v => ({ ...v, [key]: value }));
    }

    toggleShow(key: string): void {
        this.showFields.update(v => ({ ...v, [key]: !v[key] }));
    }

    maskPlaceholder(key: string): string {
        const cfg = this.config();
        if (!cfg) return 'Enter new value';
        // Show masked version of current configured state
        if (key === 'ANTHROPIC_API_KEY') return cfg.providers.anthropicConfigured ? '****configured' : 'Not set';
        if (key === 'OPENROUTER_API_KEY') return cfg.providers.openrouterConfigured ? '****configured' : 'Not set';
        if (key === 'OPENAI_API_KEY') return '****configured or Not set';
        if (key === 'GH_TOKEN') return cfg.integrations.github.tokenConfigured ? '****configured' : 'Not set';
        if (key === 'BRAVE_SEARCH_API_KEY') return 'Enter new value';
        return 'Enter new value';
    }

    async saveEnvVars(): Promise<void> {
        const values = this.editValues();
        const updates = Object.entries(values)
            .filter(([, v]) => v !== '')
            .map(([key, value]) => ({ key, value }));

        if (updates.length === 0) {
            this.editMode.set(false);
            return;
        }

        this.saving.set(true);
        try {
            await firstValueFrom(
                this.api.put<{ success: boolean; requiresRestart: boolean; updated: string[] }>(
                    '/settings/env-vars',
                    { updates },
                )
            );
            this.restartRequired.set(true);
            this.editMode.set(false);
            this.notifications.success('Settings saved. Restart the server to apply changes.');
            await this.loadRuntimeConfig();
        } catch {
            this.notifications.error('Failed to save settings.');
        } finally {
            this.saving.set(false);
        }
    }

    private buildEditSections(): void {
        const cfg = this.config();
        const sections: EditSection[] = [
            {
                title: 'AI Providers',
                fields: [
                    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', value: '', type: 'password', masked: true },
                    { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', value: '', type: 'password', masked: true },
                    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', value: '', type: 'password', masked: true },
                    { key: 'ENABLED_PROVIDERS', label: 'Enabled Providers (comma-separated)', value: cfg?.providers.enabled.join(',') ?? '', type: 'text' },
                    { key: 'COUNCIL_MODEL', label: 'Council Model', value: cfg?.providers.councilModel ?? '', type: 'text' },
                ],
            },
            {
                title: 'GitHub',
                fields: [
                    { key: 'GH_TOKEN', label: 'GitHub Token', value: '', type: 'password', masked: true },
                    { key: 'GITHUB_OWNER', label: 'GitHub Owner', value: cfg?.integrations.github.owner ?? '', type: 'text' },
                    { key: 'GITHUB_REPO', label: 'GitHub Repo', value: cfg?.integrations.github.repo ?? '', type: 'text' },
                ],
            },
            {
                title: 'Ollama',
                fields: [
                    { key: 'OLLAMA_HOST', label: 'Ollama Host', value: cfg?.providers.ollamaHost ?? '', type: 'text' },
                    { key: 'OLLAMA_DEFAULT_MODEL', label: 'Ollama Default Model', value: '', type: 'text' },
                ],
            },
            {
                title: 'Web Search',
                fields: [
                    { key: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search API Key', value: '', type: 'password', masked: true },
                ],
            },
            {
                title: 'Agent',
                fields: [
                    { key: 'AGENT_NAME', label: 'Agent Name', value: cfg?.agent.name ?? '', type: 'text' },
                    { key: 'AGENT_DESCRIPTION', label: 'Agent Description', value: cfg?.agent.description ?? '', type: 'text' },
                ],
            },
            {
                title: 'Work Tasks',
                fields: [
                    { key: 'WORK_MAX_ITERATIONS', label: 'Max Iterations', value: '', type: 'text' },
                    { key: 'WORK_TASK_MAX_PER_DAY', label: 'Max Tasks Per Day', value: '', type: 'text' },
                ],
            },
            {
                title: 'Logging',
                fields: [
                    { key: 'LOG_LEVEL', label: 'Log Level', value: cfg?.server.logLevel ?? 'info', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
                    { key: 'LOG_FORMAT', label: 'Log Format', value: cfg?.server.logFormat ?? 'text', type: 'select', options: ['json', 'pretty', 'text'] },
                ],
            },
            {
                title: 'Server',
                fields: [
                    { key: 'PUBLIC_URL', label: 'Public URL', value: cfg?.server.publicUrl ?? '', type: 'text' },
                ],
            },
        ];
        this.editSections.set(sections);
    }

    private async loadRuntimeConfig(): Promise<void> {
        try {
            const data = await firstValueFrom(this.api.get<RuntimeConfig>('/settings/runtime'));
            this.config.set(data);
        } catch {
            this.config.set(null);
        } finally {
            this.loading.set(false);
        }
    }
}
