import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

interface EnvStatus {
    set: boolean;
    masked?: string;
    value?: string;
}

type EnvStatusMap = Record<string, EnvStatus>;

interface EnvGroup {
    label: string;
    keys: string[];
}

const ENV_GROUPS: EnvGroup[] = [
    {
        label: 'AI Providers',
        keys: ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
    },
    {
        label: 'Search',
        keys: ['BRAVE_SEARCH_API_KEY'],
    },
    {
        label: 'Integrations',
        keys: ['GH_TOKEN', 'DISCORD_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN', 'SLACK_BOT_TOKEN'],
    },
    {
        label: 'Runtime',
        keys: ['ALGORAND_NETWORK', 'LOG_LEVEL', 'OLLAMA_HOST'],
    },
];

@Component({
    selector: 'app-environment-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Environment
                <button class="refresh-btn" (click)="refresh($event)" [disabled]="loading()" title="Refresh">&#8635;</button>
            </h3>
            @if (!collapsed()) {
                @if (loading()) {
                    <p class="env-hint">Loading...</p>
                } @else if (error()) {
                    <p class="env-hint env-hint--error">{{ error() }}</p>
                } @else {
                    @for (group of groups; track group.label) {
                        <div class="env-group">
                            <span class="env-group-label">{{ group.label }}</span>
                            <div class="env-grid">
                                @for (key of group.keys; track key) {
                                    <div class="env-item">
                                        <span class="env-key">{{ key }}</span>
                                        @if (statusFor(key)?.value !== undefined) {
                                            <span class="env-value" [class.env-value--set]="statusFor(key)?.set" [class.env-value--unset]="!statusFor(key)?.set">
                                                {{ statusFor(key)?.value }}
                                            </span>
                                        } @else if (statusFor(key)?.masked) {
                                            <span class="env-value env-value--set" title="{{ statusFor(key)?.masked }}">
                                                {{ statusFor(key)?.masked }}
                                            </span>
                                        } @else {
                                            <span class="env-value" [class.env-value--set]="statusFor(key)?.set" [class.env-value--unset]="!(statusFor(key)?.set)">
                                                {{ statusFor(key)?.set ? 'Set' : 'Not set' }}
                                            </span>
                                        }
                                    </div>
                                }
                            </div>
                        </div>
                    }
                }
                <p class="env-hint">Environment variables are set in your <code>.env</code> file or system environment. Restart the server after changes to static settings.</p>
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .refresh-btn {
            margin-left: auto; background: none; border: none; color: var(--text-tertiary);
            cursor: pointer; font-size: 1rem; padding: 0 0.25rem; line-height: 1;
        }
        .refresh-btn:hover:not(:disabled) { color: var(--accent-cyan); }
        .refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .env-group { margin-bottom: 0.75rem; }
        .env-group-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); display: block; margin-bottom: 0.3rem; }
        .env-grid { display: flex; flex-direction: column; gap: 0.3rem; }
        .env-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.4rem 0.65rem; background: var(--bg-raised); border-radius: var(--radius);
        }
        .env-key { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
        .env-value { font-size: 0.7rem; font-weight: 600; font-family: var(--font-mono); letter-spacing: 0.02em; }
        .env-value--set { color: var(--accent-green); }
        .env-value--unset { color: var(--text-tertiary); }
        .env-hint { font-size: 0.65rem; color: var(--text-tertiary); margin-top: 0.5rem; }
        .env-hint--error { color: var(--accent-red); }
        .env-hint code { background: var(--bg-raised); padding: 1px 4px; border-radius: 3px; font-size: 0.6rem; border: 1px solid var(--border); }
    `,
})
export class EnvironmentSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);

    readonly collapsed = signal(false);
    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    readonly envStatus = signal<EnvStatusMap>({});

    readonly groups = ENV_GROUPS;

    ngOnInit(): void {
        this.load();
    }

    statusFor(key: string): EnvStatus | undefined {
        return this.envStatus()[key];
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    refresh(event: Event): void {
        event.stopPropagation();
        this.load();
    }

    private async load(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const data = await firstValueFrom(this.api.get<EnvStatusMap>('/settings/env-status'));
            this.envStatus.set(data);
        } catch {
            this.error.set('Failed to load environment status.');
        } finally {
            this.loading.set(false);
        }
    }
}
