import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { SessionService } from '../../core/services/session.service';
import { firstValueFrom } from 'rxjs';
import { SystemInfoSettingsComponent } from './system-info-settings.component';
import type { SettingsData } from './system-info-settings.component';
import { SystemHealthSettingsComponent } from './system-health-settings.component';
import { DiscordSettingsComponent } from './discord-settings.component';
import { TelegramSettingsComponent } from './telegram-settings.component';
import { AlgochatSettingsComponent } from './algochat-settings.component';
import { MobileSettingsComponent } from './mobile-settings.component';
import { OperationalModeSettingsComponent } from './operational-mode-settings.component';
import { OpenrouterSettingsComponent } from './openrouter-settings.component';
import { CreditsSettingsComponent } from './credits-settings.component';
import { NotificationsSettingsComponent } from './notifications-settings.component';
import { EnvironmentSettingsComponent } from './environment-settings.component';
import { DatabaseSettingsComponent } from './database-settings.component';

interface OperationalMode {
    mode: string;
}

type SettingsTab = 'general' | 'channels' | 'advanced';

@Component({
    selector: 'app-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        SkeletonComponent,
        SystemInfoSettingsComponent,
        SystemHealthSettingsComponent,
        DiscordSettingsComponent,
        TelegramSettingsComponent,
        AlgochatSettingsComponent,
        MobileSettingsComponent,
        OperationalModeSettingsComponent,
        OpenrouterSettingsComponent,
        CreditsSettingsComponent,
        NotificationsSettingsComponent,
        EnvironmentSettingsComponent,
        DatabaseSettingsComponent,
    ],
    template: `
        <div class="settings-section">
            <div class="settings-section__nav" role="tablist" aria-label="Settings sections">
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="tab() === 'general'"
                    (click)="tab.set('general')"
                    role="tab">
                    General
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="tab() === 'channels'"
                    (click)="tab.set('channels')"
                    role="tab">
                    Channels
                </button>
                <button
                    class="settings-section__btn"
                    [class.settings-section__btn--active]="tab() === 'advanced'"
                    (click)="tab.set('advanced')"
                    role="tab">
                    Advanced
                </button>
            </div>
            <div class="settings-section__content">
                @if (loading()) {
                    <div class="settings-section__loading">
                        <app-skeleton variant="line" [count]="6" />
                    </div>
                } @else {
                    @switch (tab()) {
                        @case ('general') {
                            <div class="settings-tab">
                                <app-system-info-settings [settings]="settings()" />
                                <app-system-health-settings [settings]="settings()" [operationalMode]="operationalMode()" />
                                <app-operational-mode-settings [initialMode]="operationalMode()" (modeChanged)="operationalMode.set($event)" />
                            </div>
                        }
                        @case ('channels') {
                            <div class="settings-tab">
                                <app-discord-settings />
                                <app-telegram-settings />
                                <app-algochat-settings />
                                <app-mobile-settings />
                            </div>
                        }
                        @case ('advanced') {
                            <div class="settings-tab">
                                <app-openrouter-settings />
                                <app-credits-settings [creditConfig]="settings()?.creditConfig ?? {}" />
                                <app-notifications-settings />
                                <app-environment-settings />
                                <app-database-settings />
                            </div>
                        }
                    }
                }
            </div>
        </div>
    `,
    styles: `
        .settings-section {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .settings-section__nav {
            display: flex;
            gap: 0;
            padding: 0 var(--space-4);
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.2);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings-section__nav::-webkit-scrollbar { display: none; }
        .settings-section__btn {
            padding: var(--space-2) 0.85rem;
            font-size: 0.72rem;
            font-weight: 600;
            font-family: inherit;
            letter-spacing: 0.03em;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            white-space: nowrap;
            transition: color 0.15s, border-color 0.15s;
        }
        .settings-section__btn:hover { color: var(--text-primary); }
        .settings-section__btn--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }
        .settings-section__content {
            flex: 1;
            overflow-y: auto;
        }
        .settings-section__loading { padding: 1.5rem; }
        .settings-tab { padding: 1.5rem; max-width: 900px; }
        @media (max-width: 600px) { .settings-tab { padding: 1rem; } }
    `,
})
export class SettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly sessionService = inject(SessionService);

    readonly loading = signal(true);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');
    readonly tab = signal<SettingsTab>('general');

    ngOnInit(): void {
        this.loadAll();
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
        } catch {
            // Non-critical
        } finally {
            this.loading.set(false);
        }
    }

}
