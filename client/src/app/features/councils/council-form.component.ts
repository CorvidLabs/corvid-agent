import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import type { Agent } from '../../core/models/agent.model';

@Component({
    selector: 'app-council-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
    template: `
        <div class="page">
            <h2>{{ editId() ? 'Edit Council' : 'New Council' }}</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput formControlName="name" />
                    @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
                        <mat-error>Council name is required.</mat-error>
                    }
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <textarea matInput formControlName="description" rows="2"></textarea>
                </mat-form-field>

                <fieldset class="form__fieldset">
                    <legend class="form__legend">Members</legend>
                    <p class="form__hint">Select agents to include in this council.</p>
                    @for (agent of allAgents(); track agent.id) {
                        <mat-checkbox
                            [checked]="selectedAgentIds().has(agent.id)"
                            (change)="toggleAgentMat(agent.id, $event.checked)">
                            {{ agent.name }}
                            <span class="agent-meta">{{ agent.model || 'default' }} / {{ agent.permissionMode }}</span>
                        </mat-checkbox>
                    }
                    @if (allAgents().length === 0) {
                        <p class="form__hint">No agents available. Create agents first.</p>
                    }
                </fieldset>

                <mat-form-field appearance="outline">
                    <mat-label>Discussion Rounds</mat-label>
                    <input matInput type="number" formControlName="discussionRounds" min="0" max="10" />
                    <mat-hint>Number of agent-to-agent discussion rounds. Set to 0 to skip.</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Governance Tier</mat-label>
                    <mat-select formControlName="onChainMode">
                        <mat-option value="off">Off</mat-option>
                        <mat-option value="attestation">Attestation</mat-option>
                        <mat-option value="full">Full</mat-option>
                    </mat-select>
                    <mat-hint>Controls on-chain recording: off, attestation (hash), or full (all data).</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Chairman (optional)</mat-label>
                    <mat-select [value]="chairmanId()" (selectionChange)="chairmanId.set($event.value)">
                        <mat-option value="">None</mat-option>
                        @for (agent of selectedAgentsList(); track agent.id) {
                            <mat-option [value]="agent.id">{{ agent.name }}</mat-option>
                        }
                    </mat-select>
                    <mat-hint>The chairman produces the final synthesized answer.</mat-hint>
                </mat-form-field>

                <div class="form__actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || selectedAgentIds().size === 0 || saving()">
                        {{ saving() ? 'Saving...' : 'Save' }}
                    </button>
                    <button mat-stroked-button type="button" (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </div>
    `,
    styles: `
        .page { padding: var(--space-6); max-width: 640px; }
        .page h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .form { display: flex; flex-direction: column; gap: 0.25rem; }
        mat-form-field { width: 100%; }
        .form__fieldset { background: var(--bg-surface); padding: 1rem; border: 1px solid var(--border); border-radius: 8px; margin: 0.5rem 0; }
        .form__legend { color: var(--accent-magenta); font-weight: 600; }
        .form__hint { font-size: 0.8rem; color: var(--text-secondary); margin: 0.25rem 0; }
        mat-checkbox { display: block; margin: 0.25rem 0; }
        .agent-meta { font-size: var(--text-xs); color: var(--text-tertiary); margin-left: 0.25rem; }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
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
        this.toggleAgentMat(agentId, checked);
    }

    protected toggleAgentMat(agentId: string, checked: boolean): void {
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
