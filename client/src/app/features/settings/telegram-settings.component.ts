import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

interface TelegramConfig {
    allowed_user_ids?: string;
    mode?: string;
}

@Component({
    selector: 'app-telegram-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        @if (telegramEnabled()) {
            <div class="settings__section">
                <h3 class="section-toggle" (click)="toggleSection()">
                    <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                    Telegram
                    @if (telegramDirty()) {
                        <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                    }
                </h3>
                @if (!collapsed()) {
                    <div class="tg-grid section-collapse">
                        <!-- Mode -->
                        <div class="tg-field">
                            <label class="tg-label" for="tg_mode">Bridge Mode</label>
                            <select class="tg-select" id="tg_mode"
                                [ngModel]="telegramValues()['mode'] ?? telegramConfig()?.mode ?? 'chat'"
                                (ngModelChange)="setTelegramValue('mode', $event)">
                                <option value="chat">Chat</option>
                                <option value="work_intake">Work Intake</option>
                            </select>
                            <span class="tg-desc">Chat: interactive sessions. Work Intake: creates work tasks.</span>
                        </div>

                        <!-- Allowed Users -->
                        <div class="tg-field tg-field--wide">
                            <label class="tg-label" for="tg_users">Allowed User IDs</label>
                            <input class="tg-input" id="tg_users"
                                [ngModel]="telegramValues()['allowed_user_ids'] ?? telegramConfig()?.allowed_user_ids ?? ''"
                                (ngModelChange)="setTelegramValue('allowed_user_ids', $event)"
                                placeholder="Telegram user IDs, comma-separated (empty = allow all)" />
                            <span class="tg-desc">Comma-separated Telegram user IDs allowed to interact. Leave empty to allow all users.</span>
                        </div>
                    </div>
                    <div class="tg-actions">
                        <button
                            class="save-btn"
                            [disabled]="savingTelegram() || !telegramDirty()"
                            (click)="saveTelegramConfig()"
                        >{{ savingTelegram() ? 'Saving...' : 'Save Telegram Config' }}</button>
                        @if (telegramDirty()) {
                            <button class="cancel-btn cancel-btn--sm" (click)="resetTelegramChanges()">Discard Changes</button>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        ${SECTION_STYLES}
        .tg-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .tg-field { display: flex; flex-direction: column; gap: 0.2rem; }
        .tg-field--wide { grid-column: 1 / -1; }
        .tg-label { font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; }
        .tg-input, .tg-select {
            padding: 0.45rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-family: inherit;
            width: 100%;
        }
        .tg-select { cursor: pointer; }
        .tg-input:focus, .tg-select:focus {
            border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none;
        }
        .tg-desc { font-size: 0.6rem; color: var(--text-tertiary); }
        .tg-actions { display: flex; gap: 0.5rem; align-items: center; }
        @media (max-width: 600px) { .tg-grid { grid-template-columns: 1fr; } }
    `,
})
export class TelegramSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly telegramEnabled = signal(false);
    readonly telegramConfig = signal<TelegramConfig | null>(null);
    readonly telegramValues = signal<Record<string, string>>({});
    readonly savingTelegram = signal(false);
    readonly telegramDirty = computed(() => Object.keys(this.telegramValues()).length > 0);

    ngOnInit(): void {
        this.checkTelegramEnabled();
        this.loadTelegramConfig();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    setTelegramValue(key: string, value: string): void {
        const original = this.telegramConfig()?.[key as keyof TelegramConfig] ?? '';
        this.telegramValues.update(vals => {
            const next = { ...vals };
            if (value === original) {
                delete next[key];
            } else {
                next[key] = value;
            }
            return next;
        });
    }

    resetTelegramChanges(): void {
        this.telegramValues.set({});
    }

    async saveTelegramConfig(): Promise<void> {
        const updates = this.telegramValues();
        if (Object.keys(updates).length === 0) return;
        this.savingTelegram.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/telegram', updates));
            this.telegramConfig.update(cfg => cfg ? { ...cfg, ...updates } : cfg);
            this.telegramValues.set({});
            this.notifications.success('Telegram configuration saved');
        } catch {
            this.notifications.error('Failed to save Telegram configuration');
        } finally {
            this.savingTelegram.set(false);
        }
    }

    private async checkTelegramEnabled(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ system?: { telegramEnabled?: boolean } }>('/settings')
            );
            // Show if system indicates telegram is enabled, or if we can load the config
            this.telegramEnabled.set(result.system?.telegramEnabled ?? true);
        } catch {
            this.telegramEnabled.set(true);
        }
    }

    private async loadTelegramConfig(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ telegramConfig: TelegramConfig }>('/settings/telegram')
            );
            this.telegramConfig.set(result.telegramConfig);
            this.telegramEnabled.set(true);
        } catch {
            // Non-critical — hide section if endpoint unavailable
            this.telegramEnabled.set(false);
        }
    }
}
