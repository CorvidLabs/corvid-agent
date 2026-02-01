import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';

@Component({
    selector: 'app-session-launcher',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="page">
            <h2>Launch Session</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <div class="form__field">
                    <label for="projectId" class="form__label">Project</label>
                    <select id="projectId" formControlName="projectId" class="form__input">
                        <option value="" disabled>Select a project...</option>
                        @for (project of projectService.projects(); track project.id) {
                            <option [value]="project.id">{{ project.name }}</option>
                        }
                    </select>
                </div>

                <div class="form__field">
                    <label for="agentId" class="form__label">Agent (optional)</label>
                    <select id="agentId" formControlName="agentId" class="form__input">
                        <option value="">No agent (defaults)</option>
                        @for (agent of agentService.agents(); track agent.id) {
                            <option [value]="agent.id">{{ agent.name }}</option>
                        }
                    </select>
                </div>

                <div class="form__field">
                    <label for="name" class="form__label">Session Name</label>
                    <input id="name" formControlName="name" class="form__input"
                           placeholder="Optional label for this session" />
                </div>

                <div class="form__field">
                    <label for="initialPrompt" class="form__label">Initial Prompt</label>
                    <textarea id="initialPrompt" formControlName="initialPrompt" class="form__input form__textarea"
                              rows="6" placeholder="What should Claude do?"></textarea>
                </div>

                <div class="form__actions">
                    <button type="submit" class="btn btn--primary" [disabled]="form.invalid || launching()">
                        {{ launching() ? 'Launching...' : 'Launch' }}
                    </button>
                    <button type="button" class="btn btn--secondary" (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; max-width: 640px; }
        .page h2 { margin: 0 0 1.5rem; }
        .form { display: flex; flex-direction: column; gap: 1rem; }
        .form__field { display: flex; flex-direction: column; gap: 0.25rem; }
        .form__label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .form__input {
            padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px;
            font-size: 0.9rem; font-family: inherit;
        }
        .form__input:focus { outline: 2px solid #3b82f6; outline-offset: -1px; border-color: #3b82f6; }
        .form__textarea { resize: vertical; }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; }
        .btn--primary { background: #3b82f6; color: #fff; }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--secondary { background: #e2e8f0; color: #475569; }
    `,
})
export class SessionLauncherComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    protected readonly projectService = inject(ProjectService);
    protected readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);

    protected readonly launching = signal(false);

    protected readonly form = this.fb.nonNullable.group({
        projectId: ['', Validators.required],
        agentId: [''],
        name: [''],
        initialPrompt: [''],
    });

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.projectService.loadProjects(),
            this.agentService.loadAgents(),
        ]);

        const presetProjectId = this.route.snapshot.queryParamMap.get('projectId');
        if (presetProjectId) {
            this.form.patchValue({ projectId: presetProjectId });
        }
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid) return;
        this.launching.set(true);

        try {
            const value = this.form.getRawValue();
            const session = await this.sessionService.createSession({
                projectId: value.projectId,
                agentId: value.agentId || undefined,
                name: value.name || undefined,
                initialPrompt: value.initialPrompt || undefined,
            });
            this.router.navigate(['/sessions', session.id]);
        } finally {
            this.launching.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/sessions']);
    }
}
