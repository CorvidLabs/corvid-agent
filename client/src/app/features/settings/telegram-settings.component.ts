import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
    imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
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
                            <mat-form-field appearance="outline" class="field">
                                <mat-label>Bridge Mode</mat-label>
                                <mat-select
                                    [ngModel]="telegramValues()['mode'] ?? telegramConfig()?.mode ?? 'chat'"
                                    (selectionChange)="setTelegramValue('mode', $event.value)">
                                    <mat-option value="chat">Chat</mat-option>
                                    <mat-option value="work_intake">Work Intake</mat-option>
                                </mat-select>
                            </mat-form-field>
                            <span class="tg-desc">Chat: interactive sessions. Work Intake: creates work tasks.</span>
                        </div>

                        <!-- Allowed Users -->
                        <div class="tg-field tg-field--wide">
                            <mat-form-field appearance="outline" class="field">
                                <mat-label>Allowed User IDs</mat-label>
                                <input matInput
                                    [ngModel]="telegramValues()['allowed_user_ids'] ?? telegramConfig()?.allowed_user_ids ?? ''"
                                    (ngModelChange)="setTelegramValue('allowed_user_ids', $event)"
                                    placeholder="Telegram user IDs, comma-separated (empty = allow all)" />
                            </mat-form-field>
                            <span class="tg-desc">Comma-separated Telegram user IDs allowed to interact. Leave empty to allow all users.</span>
                        </div>
                    </div>
                    <div class="tg-actions">
                        <button mat-flat-button color="primary"
                            [disabled]="savingTelegram() || !telegramDirty()"
                            (click)="saveTelegramConfig()"
                        >{{ savingTelegram() ? 'Saving...' : 'Save Telegram Config' }}</button>
                        @if (telegramDirty()) {
                            <button mat-stroked-button (click)="resetTelegramChanges()">Discard Changes</button>
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
        .tg-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .tg-field--wide { grid-column: 1 / -1; }
        .field { width: 100%; }
        .tg-desc { font-size: 0.78rem; color: var(--text-tertiary); margin-top: -0.5rem; }
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
