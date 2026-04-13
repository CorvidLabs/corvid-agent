import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

interface RuntimeConfig {
    log_level?: string;
    work_max_iterations?: string;
    work_max_per_day?: string;
    agent_timeout_ms?: string;
    ollama_host?: string;
}

@Component({
    selector: 'app-runtime-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                Runtime Config
                @if (dirty()) {
                    <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                }
            </h3>
            @if (!collapsed()) {
                @if (loading()) {
                    <p class="rt-hint">Loading...</p>
                } @else {
                    <div class="rt-grid">
                        <!-- Log Level -->
                        <div class="rt-field">
                            <label class="rt-label" for="rt_log_level">Log Level</label>
                            <select class="rt-select" id="rt_log_level"
                                [ngModel]="values()['log_level'] ?? config()?.log_level ?? 'info'"
                                (ngModelChange)="setValue('log_level', $event)">
                                <option value="debug">debug</option>
                                <option value="info">info</option>
                                <option value="warn">warn</option>
                                <option value="error">error</option>
                            </select>
                            <span class="rt-desc">Verbosity of server logs. Takes effect immediately for new log output.</span>
                        </div>

                        <!-- Work Max Iterations -->
                        <div class="rt-field">
                            <label class="rt-label" for="rt_work_max_iter">Work Max Iterations</label>
                            <input class="rt-input" id="rt_work_max_iter" type="number" min="1" max="50"
                                [ngModel]="values()['work_max_iterations'] ?? config()?.work_max_iterations ?? '3'"
                                (ngModelChange)="setValue('work_max_iterations', $event)" />
                            <span class="rt-desc">Max agent iterations per work task (default: 3).</span>
                        </div>

                        <!-- Work Max Per Day -->
                        <div class="rt-field">
                            <label class="rt-label" for="rt_work_max_day">Work Tasks Per Day</label>
                            <input class="rt-input" id="rt_work_max_day" type="number" min="1" max="1000"
                                [ngModel]="values()['work_max_per_day'] ?? config()?.work_max_per_day ?? '100'"
                                (ngModelChange)="setValue('work_max_per_day', $event)" />
                            <span class="rt-desc">Max work tasks that can run in a 24-hour window (default: 100).</span>
                        </div>

                        <!-- Agent Timeout -->
                        <div class="rt-field">
                            <label class="rt-label" for="rt_agent_timeout">Agent Timeout (ms)</label>
                            <input class="rt-input" id="rt_agent_timeout" type="number" min="30000"
                                [ngModel]="values()['agent_timeout_ms'] ?? config()?.agent_timeout_ms ?? '1800000'"
                                (ngModelChange)="setValue('agent_timeout_ms', $event)" />
                            <span class="rt-desc">Inactivity timeout for agent sessions in milliseconds (default: 1800000).</span>
                        </div>

                        <!-- Ollama Host -->
                        <div class="rt-field rt-field--wide">
                            <label class="rt-label" for="rt_ollama_host">Ollama Host</label>
                            <input class="rt-input" id="rt_ollama_host" type="text"
                                [ngModel]="values()['ollama_host'] ?? config()?.ollama_host ?? ''"
                                (ngModelChange)="setValue('ollama_host', $event)"
                                placeholder="http://localhost:11434" />
                            <span class="rt-desc">Ollama API base URL override. Leave empty to use OLLAMA_HOST env var.</span>
                        </div>
                    </div>

                    <p class="rt-note">Changes take effect immediately for new sessions. Restart required for: bind host, database path.</p>

                    <div class="rt-actions">
                        <button class="save-btn save-btn--sm" (click)="save()" [disabled]="saving() || !dirty()">
                            {{ saving() ? 'Saving…' : 'Save' }}
                        </button>
                        @if (dirty()) {
                            <button class="cancel-btn cancel-btn--sm" (click)="reset()">Discard</button>
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .rt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
        .rt-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .rt-field--wide { grid-column: 1 / -1; }
        .rt-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); }
        .rt-input, .rt-select {
            background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius);
            color: var(--text-primary); padding: 0.4rem 0.6rem; font-size: 0.75rem; font-family: inherit;
            width: 100%;
        }
        .rt-input:focus, .rt-select:focus { outline: none; border-color: var(--accent-cyan); }
        .rt-desc { font-size: 0.6rem; color: var(--text-tertiary); }
        .rt-note { font-size: 0.65rem; color: var(--text-tertiary); margin-bottom: 0.75rem; }
        .rt-hint { font-size: 0.7rem; color: var(--text-tertiary); }
        .rt-actions { display: flex; gap: 0.5rem; }
    `,
})
export class RuntimeSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly config = signal<RuntimeConfig | null>(null);
    readonly values = signal<Record<string, string>>({});

    readonly dirty = computed(() => Object.keys(this.values()).length > 0);

    ngOnInit(): void {
        this.load();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    setValue(key: string, value: string): void {
        this.values.update(v => ({ ...v, [key]: value }));
    }

    reset(): void {
        this.values.set({});
    }

    async save(): Promise<void> {
        if (!this.dirty()) return;
        this.saving.set(true);
        try {
            await firstValueFrom(this.api.put('/settings/runtime', this.values()));
            // Merge saved values into config
            this.config.update(c => ({ ...(c ?? {}), ...this.values() }));
            this.values.set({});
            this.notifications.success('Runtime config saved.');
        } catch {
            this.notifications.error('Failed to save runtime config.');
        } finally {
            this.saving.set(false);
        }
    }

    private async load(): Promise<void> {
        this.loading.set(true);
        try {
            const data = await firstValueFrom(this.api.get<RuntimeConfig>('/settings/runtime'));
            this.config.set(data);
        } catch {
            // Non-critical — table may not exist yet
        } finally {
            this.loading.set(false);
        }
    }
}
