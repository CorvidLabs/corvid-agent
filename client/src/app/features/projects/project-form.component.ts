import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProjectService } from '../../core/services/project.service';
import { DirBrowserComponent } from '../../shared/components/dir-browser.component';
import { PageShellComponent } from '../../shared/components/page-shell.component';

@Component({
    selector: 'app-project-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, DirBrowserComponent, PageShellComponent],
    template: `
        <app-page-shell [title]="id() ? 'Edit Project' : 'New Project'" icon="projects"
            [breadcrumbs]="[{label: 'Projects', route: '/agents/projects'}, {label: id() ? 'Edit' : 'New'}]">
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <mat-form-field appearance="outline" class="form__field">
                    <mat-label>Name</mat-label>
                    <input matInput id="name" formControlName="name"
                           [attr.aria-describedby]="form.get('name')?.invalid && form.get('name')?.touched ? 'name-error' : null" />
                    @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
                        <mat-error id="name-error">Project name is required.</mat-error>
                    }
                </mat-form-field>

                <div class="form__field">
                    <div class="form__row">
                        <mat-form-field appearance="outline" class="form__row-field">
                            <mat-label>Working Directory</mat-label>
                            <input matInput id="workingDir" formControlName="workingDir"
                                   placeholder="/path/to/project"
                                   [attr.aria-describedby]="form.get('workingDir')?.invalid && form.get('workingDir')?.touched ? 'workingDir-error' : null" />
                            @if (form.get('workingDir')?.hasError('required') && form.get('workingDir')?.touched) {
                                <mat-error id="workingDir-error">Working directory is required.</mat-error>
                            }
                        </mat-form-field>
                        <button type="button" mat-stroked-button (click)="showBrowser.set(true)">Browse</button>
                    </div>
                </div>

                @if (showBrowser()) {
                    <app-dir-browser
                        [initialPath]="form.controls.workingDir.value"
                        (selected)="onDirSelected($event)"
                        (cancelled)="showBrowser.set(false)" />
                }

                <mat-form-field appearance="outline" class="form__field">
                    <mat-label>Description</mat-label>
                    <textarea matInput id="description" formControlName="description"
                              rows="3"></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline" class="form__field">
                    <mat-label>CLAUDE.md Content</mat-label>
                    <textarea matInput id="claudeMd" formControlName="claudeMd"
                              rows="6" placeholder="Project instructions for Claude..."></textarea>
                </mat-form-field>

                <div class="form__actions">
                    <button type="submit" mat-flat-button color="primary" [disabled]="form.invalid || saving()">
                        {{ saving() ? 'Saving...' : 'Save' }}
                    </button>
                    <button type="button" mat-stroked-button (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </app-page-shell>
    `,
    styles: `
        :host { max-width: 640px; display: block; }
        .form__field { width: 100%; margin-bottom: 0.5rem; }
        .form__row { display: flex; gap: 0.5rem; align-items: flex-start; }
        .form__row-field { flex: 1; }
        .form__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
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
