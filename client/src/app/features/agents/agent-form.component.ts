import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import type { CreateAgentInput, ProviderInfo } from '../../core/models/agent.model';
import { PageShellComponent } from '../../shared/components/page-shell.component';
import type { Project } from '../../core/models/project.model';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-agent-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule, PageShellComponent],
    template: `
        <app-page-shell [title]="id() ? 'Edit Agent' : 'New Agent'" icon="agents"
            [breadcrumbs]="[{label: 'Agents', route: '/agents'}, {label: id() ? 'Edit' : 'New'}]">
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form">
                <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput formControlName="name" />
                    @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
                        <mat-error>Agent name is required.</mat-error>
                    }
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <textarea matInput formControlName="description" rows="3"></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Provider</mat-label>
                    <mat-select formControlName="provider" (selectionChange)="onProviderChange()">
                        <mat-option value="">Default (Anthropic)</mat-option>
                        @for (p of providers(); track p.type) {
                            <mat-option [value]="p.type">{{ p.name }}</mat-option>
                        }
                    </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Model</mat-label>
                    <mat-select formControlName="model">
                        <mat-option value="">Default</mat-option>
                        @for (m of models(); track m) {
                            <mat-option [value]="m">{{ m }}</mat-option>
                        }
                    </mat-select>
                    @if (loadingModels()) {
                        <mat-hint>Loading models...</mat-hint>
                    }
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Permission Mode</mat-label>
                    <mat-select formControlName="permissionMode">
                        <mat-option value="default">Default</mat-option>
                        <mat-option value="plan">Plan</mat-option>
                        <mat-option value="auto-edit">Auto Edit</mat-option>
                        <mat-option value="full-auto">Full Auto</mat-option>
                    </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>System Prompt</mat-label>
                    <textarea matInput formControlName="systemPrompt" rows="8"
                              placeholder="Custom system instructions..."></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Append Prompt</mat-label>
                    <textarea matInput formControlName="appendPrompt" rows="6"
                              placeholder="Appended to the system prompt..."></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Allowed Tools (comma-separated)</mat-label>
                    <input matInput formControlName="allowedTools" placeholder="Read, Write, Bash, ..." />
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Disallowed Tools (comma-separated)</mat-label>
                    <input matInput formControlName="disallowedTools" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                    <mat-label>Max Budget (USD)</mat-label>
                    <input matInput formControlName="maxBudgetUsd" type="number" step="0.01"
                           placeholder="Leave empty for unlimited" />
                </mat-form-field>

                <fieldset class="form__fieldset">
                    <legend class="form__legend">Appearance</legend>
                    <div class="form__field">
                        <label class="form__label">Accent Color</label>
                        <div class="color-picker">
                            <input formControlName="displayColor" type="color"
                                   class="color-picker__input"
                                   [value]="form.get('displayColor')?.value || '#00e5ff'" />
                            <mat-form-field appearance="outline" class="color-picker__hex">
                                <input matInput formControlName="displayColor"
                                       placeholder="#00e5ff" maxlength="7"
                                       aria-label="Hex color value" />
                            </mat-form-field>
                            <button mat-stroked-button type="button" (click)="clearColor()"
                                    aria-label="Reset to auto-generated color">Reset</button>
                        </div>
                    </div>
                    <div class="form__field">
                        <label class="form__label">Icon / Emoji</label>
                        <div class="icon-picker">
                            @for (emoji of commonEmoji; track emoji) {
                                <button type="button"
                                        class="icon-picker__option"
                                        [class.icon-picker__option--active]="form.get('displayIcon')?.value === emoji"
                                        (click)="form.get('displayIcon')?.setValue(emoji)"
                                        [attr.aria-label]="'Select ' + emoji + ' as agent icon'"
                                        [attr.aria-pressed]="form.get('displayIcon')?.value === emoji">
                                    {{ emoji }}
                                </button>
                            }
                            <mat-form-field appearance="outline" class="icon-picker__custom">
                                <input matInput formControlName="displayIcon"
                                       placeholder="Custom..." maxlength="32" aria-label="Custom icon or emoji" />
                            </mat-form-field>
                        </div>
                    </div>
                    <mat-form-field appearance="outline">
                        <mat-label>Avatar URL</mat-label>
                        <input matInput formControlName="avatarUrl"
                               placeholder="https://example.com/avatar.png" type="url" />
                    </mat-form-field>
                    @if (form.get('avatarUrl')?.value) {
                        <div class="avatar-preview">
                            <img [src]="form.get('avatarUrl')?.value" alt="Avatar preview"
                                 class="avatar-preview__img" (error)="onAvatarError($event)" />
                        </div>
                    }
                </fieldset>

                <fieldset class="form__fieldset">
                    <legend class="form__legend">AlgoChat</legend>
                    <mat-checkbox formControlName="algochatEnabled">Enable AlgoChat for this agent</mat-checkbox>
                    <mat-checkbox formControlName="algochatAuto">Auto-respond to incoming messages</mat-checkbox>
                </fieldset>

                <mat-form-field appearance="outline">
                    <mat-label>Default Project</mat-label>
                    <mat-select formControlName="defaultProjectId">
                        <mat-option [value]="null">None (use global default)</mat-option>
                        @for (project of projects(); track project.id) {
                            <mat-option [value]="project.id">{{ project.name }}</mat-option>
                        }
                    </mat-select>
                </mat-form-field>

                <div class="form__actions">
                    <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                        {{ saving() ? 'Saving...' : 'Save' }}
                    </button>
                    <button mat-stroked-button type="button" (click)="onCancel()">Cancel</button>
                </div>
            </form>
        </app-page-shell>
    `,
    styles: `
        :host { max-width: 640px; display: block; }
        .form { display: flex; flex-direction: column; gap: 0.25rem; }
        mat-form-field { width: 100%; }
        .form__fieldset { background: var(--bg-surface); padding: 1rem; border: 1px solid var(--border); border-radius: 8px; margin: 0.5rem 0; }
        .form__legend { color: var(--accent-magenta); font-weight: 600; }
        .form__field { margin-bottom: 0.75rem; }
        .form__label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.25rem; }
        mat-checkbox { display: block; margin: 0.25rem 0; }
        .color-picker { display: flex; align-items: center; gap: 0.5rem; }
        .color-picker__input {
            width: 44px; height: 44px; padding: 2px; border: 1px solid var(--border-bright);
            border-radius: var(--radius); background: var(--bg-input); cursor: pointer;
        }
        .color-picker__input::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-picker__input::-webkit-color-swatch { border-radius: var(--radius-sm); border: none; }
        .color-picker__hex { width: 120px; }
        .icon-picker { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
        .icon-picker__option {
            width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
            font-size: 1.3rem; border: 1px solid var(--border); border-radius: var(--radius);
            background: var(--bg-input); cursor: pointer; transition: all 0.15s;
        }
        .icon-picker__option:hover { border-color: var(--border-bright); background: var(--bg-hover); }
        .icon-picker__option--active { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .icon-picker__option:focus-visible { outline: 2px solid var(--accent-cyan); outline-offset: 2px; }
        .icon-picker__custom { width: 120px; }
        .avatar-preview { margin-top: 0.5rem; }
        .avatar-preview__img {
            width: 64px; height: 64px; border-radius: var(--radius);
            border: 1px solid var(--border-bright); object-fit: cover;
        }
        .form__actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
    `,
})
export class AgentFormComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly agentService = inject(AgentService);
    private readonly projectService = inject(ProjectService);
    private readonly apiService = inject(ApiService);
    private readonly router = inject(Router);
    private readonly notify = inject(NotificationService);

    readonly id = input<string | undefined>(undefined);
    protected readonly saving = signal(false);
    protected readonly projects = signal<Project[]>([]);
    protected readonly providers = signal<ProviderInfo[]>([]);
    protected readonly models = signal<string[]>([]);
    protected readonly loadingModels = signal(false);

    protected readonly form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        description: [''],
        provider: [''],
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
        displayColor: [null as string | null],
        displayIcon: [null as string | null],
        avatarUrl: [null as string | null],
    });

    protected readonly commonEmoji = [
        '\u{1F916}', '\u{1F47E}', '\u{1F680}', '\u{2699}\uFE0F', '\u{1F9E0}', '\u{26A1}',
        '\u{1F525}', '\u{1F4A1}', '\u{1F3AF}', '\u{1F6E1}\uFE0F', '\u{1F50D}', '\u{1F4BB}',
        '\u{1F310}', '\u{2728}', '\u{1F9EA}', '\u{1F426}',
    ];

    async ngOnInit(): Promise<void> {
        await this.projectService.loadProjects();
        this.projects.set(this.projectService.projects());

        // Fetch available providers
        try {
            const providerList = await firstValueFrom(this.apiService.get<ProviderInfo[]>('/providers'));
            this.providers.set(providerList);
        } catch {
            // Fallback — providers endpoint may not be available
        }

        const id = this.id();
        if (id) {
            const agent = await this.agentService.getAgent(id);
            this.form.patchValue({
                name: agent.name,
                description: agent.description,
                provider: agent.provider ?? '',
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
                displayColor: agent.displayColor,
                displayIcon: agent.displayIcon,
                avatarUrl: agent.avatarUrl,
            });
            // Load models for the agent's current provider
            await this.loadModelsForProvider(agent.provider ?? '');
        } else {
            // Load models for default provider
            await this.loadModelsForProvider('');
        }
    }

    async onProviderChange(): Promise<void> {
        const provider = this.form.get('provider')?.value ?? '';
        this.form.get('model')?.setValue('');
        await this.loadModelsForProvider(provider);
    }

    private async loadModelsForProvider(providerType: string): Promise<void> {
        if (!providerType) {
            // Default provider — use the first provider's models (Anthropic)
            const allProviders = this.providers();
            const defaultProvider = allProviders.find((p) => p.type === 'anthropic') ?? allProviders[0];
            this.models.set(defaultProvider?.models ?? []);
            return;
        }

        this.loadingModels.set(true);
        try {
            const result = await firstValueFrom(
                this.apiService.get<{ models: string[]; defaultModel: string }>(`/providers/${providerType}/models`),
            );
            this.models.set(result.models);
        } catch {
            // Fallback to static list from provider info
            const provider = this.providers().find((p) => p.type === providerType);
            this.models.set(provider?.models ?? []);
        } finally {
            this.loadingModels.set(false);
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
                this.notify.success('Agent updated');
                this.router.navigate(['/agents', id]);
            } else {
                const agent = await this.agentService.createAgent(value);
                this.notify.success(`Agent '${value.name}' created successfully`);
                this.router.navigate(['/agents', agent.id]);
            }
        } catch (e) {
            this.notify.error('Failed to save agent', String(e));
        } finally {
            this.saving.set(false);
        }
    }

    onCancel(): void {
        this.router.navigate(['/agents']);
    }

    protected clearColor(): void {
        this.form.get('displayColor')?.setValue(null);
    }

    protected onAvatarError(event: Event): void {
        (event.target as HTMLImageElement).style.display = 'none';
    }
}
