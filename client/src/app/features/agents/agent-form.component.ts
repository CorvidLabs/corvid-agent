import { Component, ChangeDetectionStrategy, inject, signal, input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import type { CreateAgentInput, ProviderInfo } from '../../core/models/agent.model';
import type { Project } from '../../core/models/project.model';
import { firstValueFrom } from 'rxjs';

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
                    <input id="name" formControlName="name" class="form__input"
                           [attr.aria-describedby]="form.get('name')?.invalid && form.get('name')?.touched ? 'name-error' : null" />
                    @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
                        <span id="name-error" class="form__error" role="alert">Agent name is required.</span>
                    }
                </div>

                <div class="form__field">
                    <label for="description" class="form__label">Description</label>
                    <textarea id="description" formControlName="description" class="form__input form__textarea"
                              rows="3"></textarea>
                </div>

                <div class="form__field">
                    <label for="provider" class="form__label">Provider</label>
                    <select id="provider" formControlName="provider" class="form__input" (change)="onProviderChange()">
                        <option value="">Default (Anthropic)</option>
                        @for (p of providers(); track p.type) {
                            <option [value]="p.type">{{ p.name }}</option>
                        }
                    </select>
                </div>

                <div class="form__field">
                    <label for="model" class="form__label">Model</label>
                    <select id="model" formControlName="model" class="form__input">
                        <option value="">Default</option>
                        @for (m of models(); track m) {
                            <option [value]="m">{{ m }}</option>
                        }
                    </select>
                    @if (loadingModels()) {
                        <span class="form__hint">Loading models...</span>
                    }
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
                    <legend class="form__legend">Appearance</legend>
                    <div class="form__field">
                        <label for="displayColor" class="form__label">Accent Color</label>
                        <div class="color-picker">
                            <input id="displayColor" formControlName="displayColor" type="color"
                                   class="color-picker__input"
                                   [value]="form.get('displayColor')?.value || '#00e5ff'" />
                            <input formControlName="displayColor" class="form__input color-picker__hex"
                                   placeholder="#00e5ff" maxlength="7"
                                   aria-label="Hex color value" />
                            <button type="button" class="btn btn--secondary btn--sm" (click)="clearColor()"
                                    aria-label="Reset to auto-generated color">Reset</button>
                        </div>
                    </div>
                    <div class="form__field">
                        <label for="displayIcon" class="form__label">Icon / Emoji</label>
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
                            <input id="displayIcon" formControlName="displayIcon" class="form__input icon-picker__custom"
                                   placeholder="Custom..." maxlength="32" aria-label="Custom icon or emoji" />
                        </div>
                    </div>
                    <div class="form__field">
                        <label for="avatarUrl" class="form__label">Avatar URL</label>
                        <input id="avatarUrl" formControlName="avatarUrl" class="form__input"
                               placeholder="https://example.com/avatar.png" type="url" />
                        @if (form.get('avatarUrl')?.value) {
                            <div class="avatar-preview">
                                <img [src]="form.get('avatarUrl')?.value" alt="Avatar preview"
                                     class="avatar-preview__img" (error)="onAvatarError($event)" />
                            </div>
                        }
                    </div>
                </fieldset>

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
        .form__textarea { min-height: 5em; line-height: 1.5; }
        .form__hint { font-style: italic; }
        .form__fieldset { background: var(--bg-surface); }
        .form__legend { color: var(--accent-magenta); }
        .form__checkbox input[type="checkbox"] { accent-color: var(--accent-cyan); }
        .color-picker { display: flex; align-items: center; gap: 0.5rem; }
        .color-picker__input {
            width: 44px; height: 44px; padding: 2px; border: 1px solid var(--border-bright);
            border-radius: var(--radius); background: var(--bg-input); cursor: pointer;
        }
        .color-picker__input::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-picker__input::-webkit-color-swatch { border-radius: 3px; border: none; }
        .color-picker__hex { width: 100px; font-family: 'Courier New', monospace; }
        .icon-picker { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
        .icon-picker__option {
            width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
            font-size: 1.3rem; border: 1px solid var(--border); border-radius: var(--radius);
            background: var(--bg-input); cursor: pointer; transition: all 0.15s;
        }
        .icon-picker__option:hover { border-color: var(--border-bright); background: var(--bg-hover); }
        .icon-picker__option--active { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .icon-picker__option:focus-visible { outline: 2px solid var(--accent-cyan); outline-offset: 2px; }
        .icon-picker__custom { width: 100px; }
        .avatar-preview { margin-top: 0.5rem; }
        .avatar-preview__img {
            width: 64px; height: 64px; border-radius: var(--radius);
            border: 1px solid var(--border-bright); object-fit: cover;
        }
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
