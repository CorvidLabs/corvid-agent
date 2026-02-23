import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { PersonaService } from '../../core/services/persona.service';
import { NotificationService } from '../../core/services/notification.service';
import type { Agent } from '../../core/models/agent.model';
import type { AgentPersona, PersonaArchetype } from '../../core/models/persona.model';

@Component({
    selector: 'app-persona-manager',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Persona Manager</h2>
            </div>

            @if (agentService.loading()) {
                <p class="loading">Loading agents...</p>
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
                        <p class="loading">Loading persona...</p>
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
                            <div class="form-field">
                                <label>Archetype</label>
                                <select [(ngModel)]="formArchetype" class="form-select">
                                    <option value="custom">Custom</option>
                                    <option value="professional">Professional</option>
                                    <option value="friendly">Friendly</option>
                                    <option value="technical">Technical</option>
                                    <option value="creative">Creative</option>
                                    <option value="formal">Formal</option>
                                </select>
                            </div>
                            <div class="form-field">
                                <label>Traits (comma-separated)</label>
                                <input
                                    [(ngModel)]="formTraits"
                                    class="form-input"
                                    placeholder="helpful, concise, thorough" />
                            </div>
                            <div class="form-field span-2">
                                <label>Voice Guidelines</label>
                                <textarea
                                    [(ngModel)]="formVoiceGuidelines"
                                    class="form-textarea"
                                    rows="3"
                                    placeholder="How the agent should communicate..."></textarea>
                            </div>
                            <div class="form-field span-2">
                                <label>Background</label>
                                <textarea
                                    [(ngModel)]="formBackground"
                                    class="form-textarea"
                                    rows="3"
                                    placeholder="Agent background context..."></textarea>
                            </div>
                            <div class="form-field span-2">
                                <label>Example Messages (one per line)</label>
                                <textarea
                                    [(ngModel)]="formExampleMessages"
                                    class="form-textarea"
                                    rows="4"
                                    placeholder="Example response 1\nExample response 2"></textarea>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button
                                class="btn btn--primary"
                                [disabled]="saving()"
                                (click)="onSave()">
                                {{ saving() ? 'Saving...' : 'Save Persona' }}
                            </button>
                            @if (personaService.persona()) {
                                <button
                                    class="btn btn--danger"
                                    [disabled]="saving()"
                                    (click)="onDelete()">
                                    Delete Persona
                                </button>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }

        /* Agent picker — horizontal wrapping chips */
        .agent-picker {
            display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem;
            padding: 0.75rem; background: var(--bg-surface); border: 1px solid var(--border);
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
            padding: 1.5rem; min-height: 200px;
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
            padding: 0.75rem 1rem; margin-bottom: 1rem;
        }
        .no-persona-banner p { margin: 0; color: var(--text-secondary); font-size: 0.85rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .form-input, .form-select, .form-textarea {
            width: 100%; padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            box-sizing: border-box;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .form-textarea { resize: vertical; min-height: 4em; line-height: 1.5; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit;
            text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.15s;
        }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover:not(:disabled) { background: var(--accent-red-dim); }
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
        const results = await Promise.all(
            agents.map(async (agent) => {
                const exists = await this.personaService.checkPersonaExists(agent.id);
                return [agent.id, exists ? 'configured' : 'none'] as const;
            }),
        );
        const statusMap: Record<string, string> = {};
        for (const [id, status] of results) {
            statusMap[id] = status;
        }
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
