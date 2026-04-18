import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { SettingsSecurityComponent } from '../settings-security/settings-security.component';
import { SettingsAccessComponent } from '../settings-access/settings-access.component';
import { SettingsIntegrationsComponent } from '../settings-integrations/settings-integrations.component';

type SettingsTab = 'general' | 'channels' | 'ai' | 'notifications' | 'security' | 'access' | 'integrations';

interface OperationalMode {
    mode: string;
}

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
        SettingsSecurityComponent,
        SettingsAccessComponent,
        SettingsIntegrationsComponent,
        MatButtonToggleModule,
    ],
    template: `
        <div class="settings">
            <nav class="settings__tabs" aria-label="Settings sections">
                <mat-button-toggle-group [value]="activeTab()" (change)="setTab($event.value)" hideSingleSelectionIndicator>
                    @for (tab of tabs; track tab.id) {
                        <mat-button-toggle [value]="tab.id">{{ tab.label }}</mat-button-toggle>
                    }
                </mat-button-toggle-group>
            </nav>
            <div class="settings__body">
                @if (loading() && (activeTab() === 'general' || activeTab() === 'channels' || activeTab() === 'ai')) {
                    <app-skeleton variant="line" [count]="6" />
                } @else {
                    @switch (activeTab()) {
                        @case ('general') {
                            <app-system-info-settings [settings]="settings()" />
                            <app-system-health-settings [settings]="settings()" [operationalMode]="operationalMode()" />
                            <app-operational-mode-settings [initialMode]="operationalMode()" (modeChanged)="operationalMode.set($event)" />
                            <app-environment-settings />
                            <app-database-settings />
                        }
                        @case ('channels') {
                            <app-discord-settings />
                            <app-telegram-settings />
                            <app-algochat-settings />
                            <app-mobile-settings />
                        }
                        @case ('ai') {
                            <app-openrouter-settings />
                            <app-credits-settings [creditConfig]="settings()?.creditConfig ?? {}" />
                        }
                        @case ('notifications') {
                            <app-notifications-settings />
                        }
                        @case ('security') {
                            <app-settings-security />
                        }
                        @case ('access') {
                            <app-settings-access />
                        }
                        @case ('integrations') {
                            <app-settings-integrations />
                        }
                    }
                }
            </div>
        </div>
    `,
    styles: `
        .settings {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .settings__tabs {
            padding: var(--space-2) clamp(var(--space-3), 3vw, var(--space-8));
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.3);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings__tabs::-webkit-scrollbar { display: none; }
        .settings__body {
            flex: 1;
            overflow-y: auto;
            padding: clamp(var(--space-4), 3vw, var(--space-8)) clamp(var(--space-4), 4vw, var(--space-10));
            max-width: 1200px;
            width: 100%;
        }
        @media (max-width: 600px) {
            .settings__tabs { padding: var(--space-2) var(--space-3) 0; }
            .settings__body { padding: var(--space-4) var(--space-3); }
        }
    `,
})
export class SettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly sessionService = inject(SessionService);

    readonly tabs: { id: SettingsTab; label: string }[] = [
        { id: 'general', label: 'General' },
        { id: 'channels', label: 'Channels' },
        { id: 'ai', label: 'AI' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'security', label: 'Security' },
        { id: 'access', label: 'Access' },
        { id: 'integrations', label: 'Integrations' },
    ];

    readonly activeTab = signal<SettingsTab>('general');
    readonly loading = signal(true);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');

    setTab(tab: SettingsTab): void {
        this.activeTab.set(tab);
    }

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
