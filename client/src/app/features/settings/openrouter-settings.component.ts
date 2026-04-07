import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

@Component({
    selector: 'app-openrouter-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
        <div class="settings__section">
            <h3 class="section-toggle" (click)="toggleSection()">
                <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                OpenRouter
                @if (openrouterStatus()?.status === 'available') {
                    <span class="status-badge status-badge--ok">Connected</span>
                }
            </h3>
            @if (!collapsed()) {
                <div class="info-grid section-collapse">
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="info-value">{{ openrouterStatus()?.status ?? 'Not configured' }}</span>
                    </div>
                    @if (openrouterStatus()?.configuredModels) {
                        <div class="info-item">
                            <span class="info-label">Configured Models</span>
                            <span class="info-value">{{ openrouterStatus()?.configuredModels }}</span>
                        </div>
                    }
                </div>
                <p class="muted" style="margin-top: 0.5rem;">
                    Set <code>OPENROUTER_API_KEY</code> in your environment to enable.
                    Models are routed via <code>https://openrouter.ai</code>.
                </p>
                @if (openrouterModels().length > 0) {
                    <div class="openrouter-models">
                        <h4>Available Models</h4>
                        <div class="model-list">
                            @for (model of openrouterModels(); track model.model) {
                                <div class="model-item">
                                    <span class="model-name">{{ model.displayName }}</span>
                                    <span class="model-price">
                                        \${{ model.inputPricePerMillion }}/\${{ model.outputPricePerMillion }} per M tokens
                                    </span>
                                </div>
                            }
                        </div>
                    </div>
                }
            }
        </div>
    `,
    styles: `
        ${SECTION_STYLES}
        .status-badge { font-size: 0.55rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.04em; }
        .status-badge--ok { background: var(--accent-green-dim); color: var(--accent-green); border: 1px solid var(--accent-green); }
        .openrouter-models { margin-top: 0.75rem; }
        .openrouter-models h4 { font-size: 0.75rem; color: var(--text-secondary); margin: 0 0 0.5rem; }
        .model-list { display: flex; flex-direction: column; gap: 0.3rem; }
        .model-item { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.5rem; background: var(--bg-raised); border-radius: var(--radius-sm); }
        .model-name { font-size: 0.75rem; color: var(--text-primary); font-weight: 600; }
        .model-price { font-size: 0.65rem; color: var(--text-tertiary); font-family: var(--font-mono); }
    `,
})
export class OpenrouterSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);

    readonly collapsed = signal(false);
    readonly openrouterStatus = signal<{ status: string; configuredModels?: number } | null>(null);
    readonly openrouterModels = signal<Array<{ model: string; displayName: string; inputPricePerMillion: number; outputPricePerMillion: number }>>([]);

    ngOnInit(): void {
        this.loadOpenRouterStatus();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    private async loadOpenRouterStatus(): Promise<void> {
        try {
            const status = await firstValueFrom(this.api.get<{ status: string; configuredModels?: number }>('/openrouter/status'));
            this.openrouterStatus.set(status);

            if (status.status === 'available') {
                const configured = await firstValueFrom(this.api.get<{ models: Array<{ model: string; displayName: string; inputPricePerMillion: number; outputPricePerMillion: number }> }>('/openrouter/models/configured'));
                this.openrouterModels.set(configured.models ?? []);
            }
        } catch {
            this.openrouterStatus.set({ status: 'unavailable' });
        }
    }
}
