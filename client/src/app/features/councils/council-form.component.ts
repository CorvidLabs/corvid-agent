import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import type { Agent } from '../../core/models/agent.model';

@Component({
    selector: 'app-council-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="page">
            <h2>{{ editId() ? 'Edit Council' : 'New Council' }}</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <div class="form__field">
                    <label for="name" class="form__label">Name</label>
                    <input id="name" formControlName="name" class="form__input" />
                </div>

                <div class="form__field">
                    <label for="description" class="form__label">Description</label>
                    <textarea id="description" formControlName="description" class="form__input form__textarea"
                              rows="2"></textarea>
                </div>

                <fieldset class="form__fieldset">
                    <legend class="form__legend">Members</legend>
                    <p class="form__hint">Select agents to include in this council.</p>
                    @for (agent of allAgents(); track agent.id) {
                        <label class="form__checkbox">
                            <input
                                type="checkbox"
                                [checked]="selectedAgentIds().has(agent.id)"
                                (change)="toggleAgent(agent.id, $event)"
                            />
                            {{ agent.name }}
                            <span class="agent-meta">{{ agent.model || 'default' }} / {{ agent.permissionMode }}</span>
                        </label>
                    }
                    @if (allAgents().length === 0) {
                        <p class="form__hint">No agents available. Create agents first.</p>
                    }
                </fieldset>

                <div class="form__field">
                    <label for="discussionRounds" class="form__label">Discussion Rounds</label>
                    <input
                        id="discussionRounds"
                        type="number"
                        formControlName="discussionRounds"
                        class="form__input"
                        min="0"
                        max="10"
                    />
                    <p class="form__hint">Number of agent-to-agent discussion rounds between responding and reviewing. Set to 0 to skip.</p>
                </div>

                <div class="form__field">
                    <label for="chairman" class="form__label">Chairman (optional)</label>
                    <select id="chairman" class="form__input" [value]="chairmanId()" (change)="onChairmanChange($event)">
                        <option value="">None</option>
                        @for (agent of selectedAgentsList(); track agent.id) {
                            <option [value]="agent.id">{{ agent.name }}</option>
                        }
                    </select>
                    <p class="form__hint">The chairman produces the final synthesized answer.</p>
                </div>

                <div class="form__actions">
                    <button type="submit" class="btn btn--primary" [disabled]="form.invalid || selectedAgentIds().size === 0 || saving()">
                        {{ saving() ? 'Saving...' : 'Save' }}
                    </button>
                    <button type="button" class="btn btn--secondary" (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; max-width: 640px; }
        .page h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .form { display: flex; flex-direction: column; gap: 1rem; }
        .form__field { display: flex; flex-direction: column; gap: 0.25rem; }
        .form__label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .form__input {
            padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
        }
        .form__input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); }
        .form__textarea { resize: vertical; }
        .form__fieldset { border: 1px solid var(--border-bright); border-radius: var(--radius); padding: 1rem; margin: 0; background: var(--bg-surface); }
        .form__legend { font-weight: 600; font-size: 0.8rem; color: var(--accent-magenta); padding: 0 0.25rem; letter-spacing: 0.05em; }
        .form__checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; margin-top: 0.5rem; cursor: pointer; color: var(--text-primary); }
        .form__checkbox input[type="checkbox"] { accent-color: var(--accent-cyan); }
        .form__hint { margin: 0.25rem 0; font-size: 0.75rem; color: var(--text-tertiary); }
        .agent-meta { font-size: 0.7rem; color: var(--text-tertiary); margin-left: 0.25rem; }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); }
    `,
})
export class CouncilFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly councilService = inject(CouncilService);
    private readonly agentService = inject(AgentService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    protected readonly editId = signal<string | undefined>(undefined);
    protected readonly saving = signal(false);
    protected readonly allAgents = signal<Agent[]>([]);
    protected readonly selectedAgentIds = signal<Set<string>>(new Set());
    protected readonly chairmanId = signal('');

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        description: [''],
        discussionRounds: [2],
    });

    protected get selectedAgentsList(): () => Agent[] {
        return () => this.allAgents().filter((a) => this.selectedAgentIds().has(a.id));
    }

    async ngOnInit(): Promise<void> {
        const routeId = this.route.snapshot.paramMap.get('id');
        if (routeId) {
            this.editId.set(routeId);
        }

        await this.agentService.loadAgents();
        this.allAgents.set(this.agentService.agents());

        const id = this.editId();
        if (id) {
            const council = await this.councilService.getCouncil(id);
            this.form.patchValue({
                name: council.name,
                description: council.description,
                discussionRounds: council.discussionRounds ?? 2,
            });
            this.selectedAgentIds.set(new Set(council.agentIds));
            this.chairmanId.set(council.chairmanAgentId ?? '');
        }
    }

    protected toggleAgent(agentId: string, event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        const current = new Set(this.selectedAgentIds());
        if (checked) {
            current.add(agentId);
        } else {
            current.delete(agentId);
            if (this.chairmanId() === agentId) {
                this.chairmanId.set('');
            }
        }
        this.selectedAgentIds.set(current);
    }

    protected onChairmanChange(event: Event): void {
        this.chairmanId.set((event.target as HTMLSelectElement).value);
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid || this.selectedAgentIds().size === 0) return;
        this.saving.set(true);

        try {
            const value = this.form.getRawValue();
            const agentIds = [...this.selectedAgentIds()];
            const chairmanAgentId = this.chairmanId() || undefined;
            const id = this.editId();

            if (id) {
                await this.councilService.updateCouncil(id, {
                    name: value.name,
                    description: value.description,
                    discussionRounds: value.discussionRounds,
                    agentIds,
                    chairmanAgentId: chairmanAgentId ?? null,
                });
                this.router.navigate(['/councils', id]);
            } else {
                const council = await this.councilService.createCouncil({
                    name: value.name,
                    description: value.description,
                    discussionRounds: value.discussionRounds,
                    agentIds,
                    chairmanAgentId,
                });
                this.router.navigate(['/councils', council.id]);
            }
        } finally {
            this.saving.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/councils']);
    }
}
