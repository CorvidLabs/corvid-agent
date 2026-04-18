import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { NotificationService } from '../../core/services/notification.service';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
    selector: 'app-session-launcher',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
    template: `
        <div class="page">
            <h2>Launch Session</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <mat-form-field appearance="outline">
                    <mat-label>Project</mat-label>
                    <mat-select formControlName="projectId">
                        @for (project of projectService.projects(); track project.id) {
                            <mat-option [value]="project.id">{{ project.name }}</mat-option>
                        }
                    </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Agent (optional)</mat-label>
                    <mat-select formControlName="agentId">
                        <mat-option value="">No agent (defaults)</mat-option>
                        @for (agent of agentService.agents(); track agent.id) {
                            <mat-option [value]="agent.id">{{ agent.name }}</mat-option>
                        }
                    </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Session Name</mat-label>
                    <input matInput formControlName="name"
                           placeholder="Optional label for this session" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Initial Prompt</mat-label>
                    <textarea matInput formControlName="initialPrompt"
                              rows="6" placeholder="What should Claude do?"></textarea>
                </mat-form-field>

                <div class="form__actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || launching()">
                        {{ launching() ? 'Launching...' : 'Launch' }}
                    </button>
                    <button mat-stroked-button type="button" (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </div>
    `,
    styles: `
        .page { padding: var(--space-6); max-width: 640px; }
        .page h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .form { display: flex; flex-direction: column; gap: 0.5rem; }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
    `,
})
export class SessionLauncherComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    protected readonly projectService = inject(ProjectService);
    protected readonly agentService = inject(AgentService);
    private readonly sessionService = inject(SessionService);
    private readonly notify = inject(NotificationService);

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
            this.notify.success('Session started');
            this.router.navigate(['/sessions', session.id]);
        } catch (e) {
            this.notify.error('Failed to start session', String(e));
        } finally {
            this.launching.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/sessions']);
    }
}
