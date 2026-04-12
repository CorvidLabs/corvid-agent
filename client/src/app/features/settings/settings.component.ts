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
        <div class="settings">
            <h2>Settings</h2>
            @if (loading()) {
                <app-skeleton variant="line" [count]="6" />
            } @else {
                <app-system-info-settings [settings]="settings()" />
                <app-system-health-settings [settings]="settings()" [operationalMode]="operationalMode()" />
                <app-discord-settings />
                <app-telegram-settings />
                <app-algochat-settings />
                <app-mobile-settings />
                <app-operational-mode-settings [initialMode]="operationalMode()" (modeChanged)="operationalMode.set($event)" />
                <app-openrouter-settings />
                <app-credits-settings [creditConfig]="settings()?.creditConfig ?? {}" />
                <app-notifications-settings />
                <app-environment-settings [openrouterStatus]="openrouterStatusForEnv()" [discordConfig]="discordConfigForEnv()" />
                <app-database-settings />
            }
        </div>
    `,
    styles: `
        .settings { padding: 1.5rem; max-width: 900px; }
        .settings h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        @media (max-width: 600px) { .settings { padding: 1rem; } }
    `,
})
export class SettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly sessionService = inject(SessionService);

    readonly loading = signal(true);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');
    readonly openrouterStatusForEnv = signal<{ status: string } | null>(null);
    readonly discordConfigForEnv = signal<Record<string, string> | null>(null);

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

            // Load openrouter status and discord config for environment panel
            await Promise.all([
                this.loadOpenrouterStatusForEnv(),
                this.loadDiscordConfigForEnv(),
            ]);
        } catch {
            // Non-critical
        } finally {
            this.loading.set(false);
        }
    }

    private async loadOpenrouterStatusForEnv(): Promise<void> {
        try {
            const status = await firstValueFrom(this.api.get<{ status: string }>('/openrouter/status'));
            this.openrouterStatusForEnv.set(status);
        } catch {
            this.openrouterStatusForEnv.set({ status: 'unavailable' });
        }
    }

    private async loadDiscordConfigForEnv(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ discordConfig: Record<string, string> | null }>('/settings/discord')
            );
            this.discordConfigForEnv.set(result.discordConfig);
        } catch {
            // Non-critical
        }
    }
}
