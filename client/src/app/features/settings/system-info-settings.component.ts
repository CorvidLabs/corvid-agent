import { Component, ChangeDetectionStrategy, Input, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GuidedTourService } from '../../core/services/guided-tour.service';
import { SECTION_STYLES } from './settings-shared.styles';
import { MatButtonModule } from '@angular/material/button';

export interface SettingsData {
    creditConfig: Record<string, string>;
    system: {
        schemaVersion: number;
        agentCount: number;
        projectCount: number;
        sessionCount: number;
    };
}

@Component({
    selector: 'app-system-info-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule],
    template: `
        <!-- System Info -->
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                System Info
            </h3>
            @if (!collapsed()) {
                <div class="info-grid section-collapse">
                    <div class="info-item">
                        <span class="info-label">Schema Version</span>
                        <span class="info-value">{{ settings?.system?.schemaVersion }}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Agents</span>
                        <span class="info-value">{{ settings?.system?.agentCount }}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Projects</span>
                        <span class="info-value">{{ settings?.system?.projectCount }}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Sessions</span>
                        <span class="info-value">{{ settings?.system?.sessionCount }}</span>
                    </div>
                </div>
            }
        </div>

        <!-- Help -->
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleHelp()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsedHelp()">&#9654;</span>
                Help
            </h3>
            @if (!collapsedHelp()) {
                <div class="info-grid section-collapse">
                    <div class="info-item info-item--action">
                        <span class="info-label">Guided Tour</span>
                        <button mat-flat-button color="primary" (click)="replayTour()">Replay Tour</button>
                    </div>
                    <div class="info-item info-item--action">
                        <span class="info-label">Keyboard Shortcuts</span>
                        <span class="info-value">Press <kbd>?</kbd> to view</span>
                    </div>
                </div>
            }
        </div>
    `,
    styles: SECTION_STYLES,
})
export class SystemInfoSettingsComponent {
    @Input() settings: SettingsData | null = null;

    private readonly tourService = inject(GuidedTourService);
    private readonly router = inject(Router);

    readonly collapsed = signal(false);
    readonly collapsedHelp = signal(false);

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    toggleHelp(): void {
        this.collapsedHelp.update(v => !v);
    }

    replayTour(): void {
        this.tourService.reset();
        this.router.navigate(['/dashboard']).then(() => {
            setTimeout(() => this.tourService.startTour(), 400);
        });
    }
}
