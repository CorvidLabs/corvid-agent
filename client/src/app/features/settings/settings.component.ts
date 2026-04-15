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
    ],
    template: `
        <div class="settings">
            <nav class="settings__tabs" role="tablist" aria-label="Settings sections">
                @for (tab of tabs; track tab.id) {
                    <button
                        class="settings__tab"
                        [class.settings__tab--active]="activeTab() === tab.id"
                        (click)="setTab(tab.id)"
                        role="tab"
                        [attr.aria-selected]="activeTab() === tab.id">
                        {{ tab.label }}
                    </button>
                }
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
            display: flex;
            gap: 0;
            padding: 0 var(--space-4);
            border-bottom: 1px solid var(--border-subtle);
            background: rgba(12, 13, 20, 0.2);
            overflow-x: auto;
            scrollbar-width: none;
            flex-shrink: 0;
        }
        .settings__tabs::-webkit-scrollbar { display: none; }
        .settings__tab {
            padding: var(--space-3) 0.9rem;
            font-size: 0.75rem;
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
        .settings__tab:hover {
            color: var(--text-primary);
        }
        .settings__tab--active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
        }
        .settings__body {
            flex: 1;
            overflow-y: auto;
            padding: 1.5rem;
            max-width: 900px;
            width: 100%;
        }
        @media (max-width: 600px) {
            .settings__body { padding: 1rem; }
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
