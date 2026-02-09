import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import type { CreateAgentInput } from '../../core/models/agent.model';
import type { Project } from '../../core/models/project.model';

@Component({
    selector: 'app-agent-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="page">
            <h2>{{ id() ? 'Edit Agent' : 'New Agent' }}</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <div class="form__field">
                    <label for="name" class="form__label">Name</label>
                    <input id="name" formControlName="name" class="form__input" />
                </div>

                <div class="form__field">
                    <label for="description" class="form__label">Description</label>
                    <textarea id="description" formControlName="description" class="form__input form__textarea"
                              rows="3"></textarea>
                </div>

                <div class="form__field">
                    <label for="model" class="form__label">Model</label>
                    <select id="model" formControlName="model" class="form__input">
                        <option value="">Default</option>
                        <option value="claude-sonnet-4-20250514">Sonnet 4</option>
                        <option value="claude-opus-4-20250514">Opus 4</option>
                        <option value="claude-haiku-3-5-20241022">Haiku 3.5</option>
                    </select>
                </div>

                <div class="form__field">
                    <label for="permissionMode" class="form__label">Permission Mode</label>
                    <select id="permissionMode" formControlName="permissionMode" class="form__input">
                        <option value="default">Default</option>
                        <option value="plan">Plan</option>
                        <option value="auto-edit">Auto Edit</option>
                        <option value="full-auto">Full Auto</option>
                    </select>
                </div>

                <div class="form__field">
                    <label for="systemPrompt" class="form__label">System Prompt</label>
                    <textarea id="systemPrompt" formControlName="systemPrompt" class="form__input form__textarea"
                              rows="8" placeholder="Custom system instructions..."></textarea>
                </div>

                <div class="form__field">
                    <label for="appendPrompt" class="form__label">Append Prompt</label>
                    <textarea id="appendPrompt" formControlName="appendPrompt" class="form__input form__textarea"
                              rows="6" placeholder="Appended to the system prompt..."></textarea>
                </div>

                <div class="form__field">
                    <label for="allowedTools" class="form__label">Allowed Tools (comma-separated)</label>
                    <input id="allowedTools" formControlName="allowedTools" class="form__input"
                           placeholder="Read, Write, Bash, ..." />
                </div>

                <div class="form__field">
                    <label for="disallowedTools" class="form__label">Disallowed Tools (comma-separated)</label>
                    <input id="disallowedTools" formControlName="disallowedTools" class="form__input" />
                </div>

                <div class="form__field">
                    <label for="maxBudgetUsd" class="form__label">Max Budget (USD)</label>
                    <input id="maxBudgetUsd" formControlName="maxBudgetUsd" type="number" step="0.01"
                           class="form__input" placeholder="Leave empty for unlimited" />
                </div>

                <fieldset class="form__fieldset">
                    <legend class="form__legend">AlgoChat</legend>
                    <label class="form__checkbox">
                        <input type="checkbox" formControlName="algochatEnabled" />
                        Enable AlgoChat for this agent
                    </label>
                    <label class="form__checkbox">
                        <input type="checkbox" formControlName="algochatAuto" />
                        Auto-respond to incoming messages
                    </label>
                </fieldset>

                <div class="form__field">
                    <label for="defaultProjectId" class="form__label">Default Project</label>
                    <select id="defaultProjectId" formControlName="defaultProjectId" class="form__input">
                        <option [ngValue]="null">None (use global default)</option>
                        @for (project of projects(); track project.id) {
                            <option [ngValue]="project.id">{{ project.name }}</option>
                        }
                    </select>
                </div>

                <div class="form__actions">
                    <button type="submit" class="btn btn--primary" [disabled]="form.invalid || saving()">
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
        .form__textarea { resize: vertical; min-height: 5em; line-height: 1.5; }
        .form__fieldset { border: 1px solid var(--border-bright); border-radius: var(--radius); padding: 1rem; margin: 0; background: var(--bg-surface); }
        .form__legend { font-weight: 600; font-size: 0.8rem; color: var(--accent-magenta); padding: 0 0.25rem; letter-spacing: 0.05em; }
        .form__checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; margin-top: 0.5rem; cursor: pointer; color: var(--text-primary); }
        .form__checkbox input[type="checkbox"] { accent-color: var(--accent-cyan); }
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
export class AgentFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly router = inject(Router);

    readonly id = input<string | undefined>(undefined);
    protected readonly saving = signal(false);
    protected readonly projects = signal<Project[]>([]);

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        description: [''],
        model: [''],
        permissionMode: ['default'],
        systemPrompt: [''],
        appendPrompt: [''],
        allowedTools: [''],
        disallowedTools: [''],
        maxBudgetUsd: [null as number | null],
        algochatEnabled: [false],
        algochatAuto: [false],
        defaultProjectId: [null as string | null],
    });

    async ngOnInit(): Promise<void> {
        await this.projectService.loadProjects();
        this.projects.set(this.projectService.projects());

        const id = this.id();
        if (id) {
            const agent = await this.agentService.getAgent(id);
            this.form.patchValue({
                name: agent.name,
                description: agent.description,
                model: agent.model,
                permissionMode: agent.permissionMode,
                systemPrompt: agent.systemPrompt,
                appendPrompt: agent.appendPrompt,
                allowedTools: agent.allowedTools,
                disallowedTools: agent.disallowedTools,
                maxBudgetUsd: agent.maxBudgetUsd,
                algochatEnabled: agent.algochatEnabled,
                algochatAuto: agent.algochatAuto,
                defaultProjectId: agent.defaultProjectId,
            });
        }
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid) return;
        this.saving.set(true);

        try {
            const value = this.form.getRawValue() as unknown as CreateAgentInput;
            const id = this.id();

            if (id) {
                await this.agentService.updateAgent(id, value);
                this.router.navigate(['/agents', id]);
            } else {
                const agent = await this.agentService.createAgent(value);
                this.router.navigate(['/agents', agent.id]);
            }
        } finally {
            this.saving.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/agents']);
    }
}
