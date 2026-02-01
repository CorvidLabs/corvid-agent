import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';

@Component({
    selector: 'app-project-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    template: `
        <div class="page">
            <h2>{{ editId() ? 'Edit Project' : 'New Project' }}</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <div class="form__field">
                    <label for="name" class="form__label">Name</label>
                    <input id="name" formControlName="name" class="form__input" />
                </div>

                <div class="form__field">
                    <label for="workingDir" class="form__label">Working Directory</label>
                    <input id="workingDir" formControlName="workingDir" class="form__input"
                           placeholder="/path/to/project" />
                </div>

                <div class="form__field">
                    <label for="description" class="form__label">Description</label>
                    <textarea id="description" formControlName="description" class="form__input form__textarea"
                              rows="3"></textarea>
                </div>

                <div class="form__field">
                    <label for="claudeMd" class="form__label">CLAUDE.md Content</label>
                    <textarea id="claudeMd" formControlName="claudeMd" class="form__input form__textarea"
                              rows="6" placeholder="Project instructions for Claude..."></textarea>
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
        .page h2 { margin: 0 0 1.5rem; }
        .form { display: flex; flex-direction: column; gap: 1rem; }
        .form__field { display: flex; flex-direction: column; gap: 0.25rem; }
        .form__label { font-size: 0.85rem; font-weight: 600; color: #374151; }
        .form__input {
            padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px;
            font-size: 0.9rem; font-family: inherit;
        }
        .form__input:focus { outline: 2px solid #3b82f6; outline-offset: -1px; border-color: #3b82f6; }
        .form__textarea { resize: vertical; font-family: monospace; }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; }
        .btn--primary { background: #3b82f6; color: #fff; }
        .btn--primary:hover { background: #2563eb; }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--secondary { background: #e2e8f0; color: #475569; }
        .btn--secondary:hover { background: #cbd5e1; }
    `,
})
export class ProjectFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly projectService = inject(ProjectService);
    private readonly router = inject(Router);

    readonly editId = input<string | undefined>(undefined);
    protected readonly saving = signal(false);

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        workingDir: ['', Validators.required],
        description: [''],
        claudeMd: [''],
    });

    async ngOnInit(): Promise<void> {
        const id = this.editId();
        if (id) {
            const project = await this.projectService.getProject(id);
            this.form.patchValue({
                name: project.name,
                workingDir: project.workingDir,
                description: project.description,
                claudeMd: project.claudeMd,
            });
        }
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid) return;
        this.saving.set(true);

        try {
            const value = this.form.getRawValue();
            const id = this.editId();

            if (id) {
                await this.projectService.updateProject(id, value);
                this.router.navigate(['/projects', id]);
            } else {
                const project = await this.projectService.createProject(value);
                this.router.navigate(['/projects', project.id]);
            }
        } finally {
            this.saving.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/projects']);
    }
}
