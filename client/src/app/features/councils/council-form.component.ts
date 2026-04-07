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
                    <input id="name" formControlName="name" class="form__input"
                           [attr.aria-describedby]="form.get('name')?.invalid && form.get('name')?.touched ? 'name-error' : null" />
                    @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
                        <span id="name-error" class="form__error" role="alert">Council name is required.</span>
                    }
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
                    <label for="onChainMode" class="form__label">Governance Tier</label>
                    <select id="onChainMode" formControlName="onChainMode" class="form__input">
                        <option value="off">Off</option>
                        <option value="attestation">Attestation</option>
                        <option value="full">Full</option>
                    </select>
                    <p class="form__hint">Controls on-chain recording: off (local only), attestation (hash on-chain), or full (all data on-chain).</p>
                </div>

                <div class="form__field">
                    <label for="chairman" class="form__label">Chairman (optional)</label>
                    <select #chairmanSelect id="chairman" class="form__input" (change)="onChairmanChange($event)">
                        <option value="">None</option>
                        @for (agent of selectedAgentsList(); track agent.id) {
                            <option [value]="agent.id" [selected]="agent.id === chairmanId()">{{ agent.name }}</option>
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
        .page { padding: var(--space-6); max-width: 640px; }
        .page h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .form__fieldset { background: var(--bg-surface); }
        .form__legend { color: var(--accent-magenta); }
        .form__checkbox input[type="checkbox"] { accent-color: var(--accent-cyan); }
        .agent-meta { font-size: var(--text-xs); color: var(--text-tertiary); margin-left: 0.25rem; }
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
        discussionRounds: [2, [Validators.min(0), Validators.max(10)]],
        onChainMode: ['full' as 'off' | 'attestation' | 'full'],
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
                onChainMode: council.onChainMode ?? 'full',
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
                    onChainMode: value.onChainMode,
                    agentIds,
                    chairmanAgentId: chairmanAgentId ?? null,
                });
                this.router.navigate(['/sessions/councils', id]);
            } else {
                const council = await this.councilService.createCouncil({
                    name: value.name,
                    description: value.description,
                    discussionRounds: value.discussionRounds,
                    onChainMode: value.onChainMode,
                    agentIds,
                    chairmanAgentId,
                });
                this.router.navigate(['/sessions/councils', council.id]);
            }
        } finally {
            this.saving.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/sessions/councils']);
    }
}
