import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
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
}

@Component({
    selector: 'app-environment-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Runtime Configuration
            </h3>
            @if (!collapsed()) {
                @if (loading()) {
                    <p class="muted">Loading configuration...</p>
                } @else if (!config()) {
                    <p class="muted">Unable to load runtime configuration.</p>
                } @else {
                    <!-- Agent Identity -->
                    <div class="config-group">
                        <div class="config-group-title">Agent</div>
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

                    <p class="env-hint">To change these settings, edit your <code>.env</code> file or <code>corvid-agent.config.ts</code> and restart the server.</p>
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .config-group { margin-bottom: 0.75rem; }
        .config-group:last-of-type { margin-bottom: 0; }
        .config-group-title {
            font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
            color: var(--text-tertiary); margin-bottom: 0.35rem;
        }
        .config-grid { display: flex; flex-direction: column; gap: 0.2rem; }
        .config-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.35rem 0.65rem; background: var(--bg-raised); border-radius: var(--radius);
        }
        .config-key { font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); }
        .config-value { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); text-align: right; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .config-value--mono { font-family: var(--font-mono); font-size: 0.65rem; }
        .config-value--set { color: var(--accent-green); }
        .config-value--unset { color: var(--text-tertiary); }
        .env-hint { font-size: 0.65rem; color: var(--text-tertiary); margin-top: 0.5rem; }
        .env-hint code { background: var(--bg-raised); padding: 1px 4px; border-radius: 3px; font-size: 0.6rem; border: 1px solid var(--border); }
        .muted { font-size: 0.7rem; color: var(--text-tertiary); margin: 0; }
    `,
})
export class EnvironmentSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);

    readonly collapsed = signal(false);
    readonly loading = signal(true);
    readonly config = signal<RuntimeConfig | null>(null);

    ngOnInit(): void {
        this.loadRuntimeConfig();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
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
