import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { DirBrowserComponent } from '../../shared/components/dir-browser.component';

@Component({
    selector: 'app-project-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, DirBrowserComponent],
    template: `
        <div class="page">
            <h2>{{ id() ? 'Edit Project' : 'New Project' }}</h2>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <div class="form__field">
                    <label for="name" class="form__label">Name</label>
                    <input id="name" formControlName="name" class="form__input" />
                </div>

                <div class="form__field">
                    <label for="workingDir" class="form__label">Working Directory</label>
                    <div class="form__row">
                        <input id="workingDir" formControlName="workingDir" class="form__input"
                               placeholder="/path/to/project" />
                        <button type="button" class="btn btn--secondary" (click)="showBrowser.set(true)">Browse</button>
                    </div>
                </div>

                @if (showBrowser()) {
                    <app-dir-browser
                        [initialPath]="form.controls.workingDir.value"
                        (selected)="onDirSelected($event)"
                        (cancelled)="showBrowser.set(false)" />
                }

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
        .page h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
    `,
})
export class ProjectFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly projectService = inject(ProjectService);
    private readonly router = inject(Router);

    readonly id = input<string | undefined>(undefined);
    protected readonly saving = signal(false);
    protected readonly showBrowser = signal(false);

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        workingDir: ['', Validators.required],
        description: [''],
        claudeMd: [''],
    });

    async ngOnInit(): Promise<void> {
        const id = this.id();
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
            const id = this.id();

            if (id) {
                await this.projectService.updateProject(id, value);
                this.router.navigate(['/agents/projects', id]);
            } else {
                const project = await this.projectService.createProject(value);
                this.router.navigate(['/agents/projects', project.id]);
            }
        } finally {
            this.saving.set(false);
        }
    }

    protected onDirSelected(path: string): void {
        this.form.controls.workingDir.setValue(path);
        this.showBrowser.set(false);
    }

    onCancel(): void {
        this.router.navigate(['/agents/projects']);
    }
}
