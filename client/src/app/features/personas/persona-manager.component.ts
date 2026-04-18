import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AgentService } from '../../core/services/agent.service';
import { PersonaService } from '../../core/services/persona.service';
import { NotificationService } from '../../core/services/notification.service';
import type { Agent } from '../../core/models/agent.model';
import type { AgentPersona, PersonaArchetype } from '../../core/models/persona.model';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

@Component({
    selector: 'app-persona-manager',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, SkeletonComponent, PageShellComponent],
    template: `
        <app-page-shell title="Persona Manager" icon="personas">
            @if (agentService.loading()) {
                <app-skeleton variant="line" [count]="4" />
            } @else if (agentService.agents().length === 0) {
                <p class="empty">No agents found. Create an agent first.</p>
            } @else {
                <!-- Compact agent picker — horizontal wrap, always visible -->
                <div class="agent-picker">
                    @for (agent of agentService.agents(); track agent.id) {
                        <button
                            class="agent-chip"
                            [class.agent-chip--selected]="selectedAgentId() === agent.id"
                            [attr.data-status]="personaStatusMap()[agent.id] ?? 'none'"
                            (click)="selectAgent(agent.id)">
                            {{ agent.name }}
                        </button>
                    }
                </div>

                <!-- Detail panel — always visible below the picker -->
                <div class="detail-panel">
                    @if (!selectedAgentId()) {
                        <div class="detail-empty">
                            <p>Select an agent above to configure its persona</p>
                        </div>
                    } @else if (personaService.loading()) {
                        <app-skeleton variant="line" [count]="4" />
                    } @else {
                        <div class="detail-header">
                            <h3>{{ selectedAgentName() }}</h3>
                            <span
                                class="detail-status"
                                [attr.data-status]="personaService.persona() ? 'configured' : 'none'">
                                {{ personaService.persona() ? 'Configured' : 'Not Configured' }}
                            </span>
                        </div>

                        @if (!personaService.persona()) {
                            <div class="no-persona-banner">
                                <p>No persona configured — create one below</p>
                            </div>
                        }

                        <div class="form-grid">
                            <mat-form-field appearance="outline" class="form-field">
                                <mat-label>Archetype</mat-label>
                                <mat-select [(ngModel)]="formArchetype">
                                    <mat-option value="custom">Custom</mat-option>
                                    <mat-option value="professional">Professional</mat-option>
                                    <mat-option value="friendly">Friendly</mat-option>
                                    <mat-option value="technical">Technical</mat-option>
                                    <mat-option value="creative">Creative</mat-option>
                                    <mat-option value="formal">Formal</mat-option>
                                </mat-select>
                            </mat-form-field>
                            <mat-form-field appearance="outline" class="form-field">
                                <mat-label>Traits (comma-separated)</mat-label>
                                <input matInput
                                    [(ngModel)]="formTraits"
                                    placeholder="helpful, concise, thorough" />
                            </mat-form-field>
                            <mat-form-field appearance="outline" class="form-field span-2">
                                <mat-label>Voice Guidelines</mat-label>
                                <textarea matInput
                                    [(ngModel)]="formVoiceGuidelines"
                                    rows="3"
                                    placeholder="How the agent should communicate..."></textarea>
                            </mat-form-field>
                            <mat-form-field appearance="outline" class="form-field span-2">
                                <mat-label>Background</mat-label>
                                <textarea matInput
                                    [(ngModel)]="formBackground"
                                    rows="3"
                                    placeholder="Agent background context..."></textarea>
                            </mat-form-field>
                            <mat-form-field appearance="outline" class="form-field span-2">
                                <mat-label>Example Messages (one per line)</mat-label>
                                <textarea matInput
                                    [(ngModel)]="formExampleMessages"
                                    rows="4"
                                    placeholder="Example response 1\nExample response 2"></textarea>
                            </mat-form-field>
                        </div>
                        <div class="form-actions">
                            <button
                                mat-flat-button color="primary"
                                [disabled]="saving()"
                                (click)="onSave()">
                                {{ saving() ? 'Saving...' : 'Save Persona' }}
                            </button>
                            @if (personaService.persona()) {
                                <button
                                    mat-stroked-button color="warn"
                                    [disabled]="saving()"
                                    (click)="onDelete()">
                                    Delete Persona
                                </button>
                            }
                        </div>
                    }
                </div>
            }
        </app-page-shell>
    `,
    styles: `
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }

        /* Agent picker — horizontal wrapping chips */
        .agent-picker {
            display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem;
            padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius);
        }
        .agent-chip {
            padding: 0.35rem 0.7rem; border-radius: var(--radius-sm); font-size: 0.75rem;
            font-family: inherit; font-weight: 600; cursor: pointer;
            background: var(--bg-raised); color: var(--text-secondary);
            border: 1px solid var(--border); transition: all 0.15s;
            white-space: nowrap;
        }
        .agent-chip:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .agent-chip--selected {
            background: var(--accent-cyan-dim); color: var(--accent-cyan);
            border-color: var(--accent-cyan); box-shadow: var(--glow-cyan);
        }
        .agent-chip[data-status="configured"]::after {
            content: ' \\2713'; color: var(--accent-green); font-size: 0.65rem;
        }

        /* Detail panel */
        .detail-panel {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: var(--space-6); min-height: 200px;
        }
        .detail-empty {
            display: flex; align-items: center; justify-content: center; min-height: 150px;
        }
        .detail-empty p { color: var(--text-tertiary); font-size: 0.85rem; }
        .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
        .detail-header h3 { margin: 0; color: var(--accent-cyan); }
        .detail-status {
            font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em;
            background: var(--bg-raised); color: var(--text-secondary); border: 1px solid var(--border);
        }
        .detail-status[data-status="configured"] { color: var(--accent-green); border-color: var(--accent-green); }

        .no-persona-banner {
            background: var(--bg-raised); border: 1px dashed var(--border-bright); border-radius: var(--radius);
            padding: var(--space-3) var(--space-4); margin-bottom: 1rem;
        }
        .no-persona-banner p { margin: 0; color: var(--text-secondary); font-size: 0.85rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        @media (max-width: 480px) {
            .form-grid { grid-template-columns: 1fr; }
            .span-2 { grid-column: span 1; }
        }
    `,
})
export class PersonaManagerComponent implements OnInit {
    protected readonly agentService = inject(AgentService);
    protected readonly personaService = inject(PersonaService);
    private readonly notify = inject(NotificationService);

    protected readonly selectedAgentId = signal<string | null>(null);
    protected readonly saving = signal(false);
    protected readonly personaStatusMap = signal<Record<string, string>>({});

    protected formArchetype: PersonaArchetype = 'custom';
    protected formTraits = '';
    protected formVoiceGuidelines = '';
    protected formBackground = '';
    protected formExampleMessages = '';

    protected readonly selectedAgentName = computed(() => {
        const id = this.selectedAgentId();
        if (!id) return '';
        return this.agentService.agents().find((a) => a.id === id)?.name ?? '';
    });

    async ngOnInit(): Promise<void> {
        await this.agentService.loadAgents();
        // Check persona status for all agents in parallel without touching shared signals
        const agents = this.agentService.agents();
        const results = await Promise.allSettled(
            agents.map((agent) => this.personaService.checkPersonaExists(agent.id)),
        );
        const statusMap: Record<string, string> = {};
        results.forEach((result, index) => {
            const agentId = agents[index].id;
            if (result.status === 'fulfilled') {
                statusMap[agentId] = result.value ? 'configured' : 'none';
            } else {
                statusMap[agentId] = 'none';
            }
        });
        this.personaStatusMap.set(statusMap);
    }

    async selectAgent(agentId: string): Promise<void> {
        this.selectedAgentId.set(agentId);
        const persona = await this.personaService.loadPersona(agentId);
        if (persona) {
            this.formArchetype = persona.archetype;
            this.formTraits = persona.traits.join(', ');
            this.formVoiceGuidelines = persona.voiceGuidelines;
            this.formBackground = persona.background;
            this.formExampleMessages = persona.exampleMessages.join('\n');
        } else {
            this.formArchetype = 'custom';
            this.formTraits = '';
            this.formVoiceGuidelines = '';
            this.formBackground = '';
            this.formExampleMessages = '';
        }
    }

    async onSave(): Promise<void> {
        const agentId = this.selectedAgentId();
        if (!agentId) return;

        this.saving.set(true);
        try {
            await this.personaService.savePersona(agentId, {
                archetype: this.formArchetype,
                traits: this.formTraits.split(',').map((t) => t.trim()).filter(Boolean),
                voiceGuidelines: this.formVoiceGuidelines,
                background: this.formBackground,
                exampleMessages: this.formExampleMessages.split('\n').filter(Boolean),
            });
            this.personaStatusMap.update((m) => ({ ...m, [agentId]: 'configured' }));
            this.notify.success('Persona saved successfully');
        } catch {
            this.notify.error('Failed to save persona');
        } finally {
            this.saving.set(false);
        }
    }

    async onDelete(): Promise<void> {
        const agentId = this.selectedAgentId();
        if (!agentId) return;

        this.saving.set(true);
        try {
            await this.personaService.deletePersona(agentId);
            this.formArchetype = 'custom';
            this.formTraits = '';
            this.formVoiceGuidelines = '';
            this.formBackground = '';
            this.formExampleMessages = '';
            this.personaStatusMap.update((m) => ({ ...m, [agentId]: 'none' }));
            this.notify.success('Persona deleted');
        } catch {
            this.notify.error('Failed to delete persona');
        } finally {
            this.saving.set(false);
        }
    }
}
