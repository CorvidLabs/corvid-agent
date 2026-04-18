import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SkillBundleService } from '../../core/services/skill-bundle.service';
import { NotificationService } from '../../core/services/notification.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { SkillBundle } from '../../core/models/skill-bundle.model';
import { PageShellComponent } from '../../shared/components/page-shell.component';

@Component({
    selector: 'app-skill-bundle-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, EmptyStateComponent, SkeletonComponent, PageShellComponent],
    template: `
        <app-page-shell title="Skill Bundles" icon="skills">
            <button actions class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                {{ showCreateForm() ? 'Cancel' : '+ New Bundle' }}
            </button>

            <!-- Filter tabs -->
            <div class="filter-tabs">
                <button
                    class="filter-tab"
                    [class.filter-tab--active]="activeFilter() === 'all'"
                    (click)="activeFilter.set('all')">
                    All ({{ bundleService.bundles().length }})
                </button>
                <button
                    class="filter-tab"
                    [class.filter-tab--active]="activeFilter() === 'preset'"
                    (click)="activeFilter.set('preset')">
                    Preset ({{ presetCount() }})
                </button>
                <button
                    class="filter-tab"
                    [class.filter-tab--active]="activeFilter() === 'custom'"
                    (click)="activeFilter.set('custom')">
                    Custom ({{ customCount() }})
                </button>
            </div>

            @if (showCreateForm()) {
                <div class="create-form">
                    <h3>Create Bundle</h3>
                    <div class="form-grid">
                        <mat-form-field appearance="outline" class="form-field">
                            <mat-label>Name</mat-label>
                            <input matInput [(ngModel)]="formName" placeholder="e.g. Code Review Tools" />
                        </mat-form-field>
                        <mat-form-field appearance="outline" class="form-field">
                            <mat-label>Description</mat-label>
                            <input matInput [(ngModel)]="formDescription" placeholder="What this bundle provides..." />
                        </mat-form-field>
                        <mat-form-field appearance="outline" class="form-field span-2">
                            <mat-label>Tools (one per line)</mat-label>
                            <textarea matInput
                                [(ngModel)]="formTools"
                                rows="4"
                                placeholder="Read\nEdit\nBash"></textarea>
                        </mat-form-field>
                        <mat-form-field appearance="outline" class="form-field span-2">
                            <mat-label>Prompt Additions</mat-label>
                            <textarea matInput
                                [(ngModel)]="formPromptAdditions"
                                rows="3"
                                placeholder="Additional instructions for the agent..."></textarea>
                        </mat-form-field>
                    </div>
                    <div class="form-actions">
                        <button
                            mat-flat-button color="primary"
                            [disabled]="creating() || !formName"
                            (click)="onCreate()">
                            {{ creating() ? 'Creating...' : 'Create Bundle' }}
                        </button>
                    </div>
                </div>
            }

            @if (bundleService.loading()) {
                <app-skeleton variant="card" [count]="3" />
            } @else if (filteredBundles().length === 0) {
                <app-empty-state
                    icon="  [###]\n  [###]\n  [###]"
                    title="No skill bundles yet."
                    description="Skill bundles group MCP tools and system prompts into reusable packages for your agents."
                    actionLabel="+ Create a Bundle"
                    actionAriaLabel="Create your first skill bundle" />
            } @else {
                <div class="bundle-list">
                    @for (bundle of filteredBundles(); track bundle.id) {
                        <div
                            class="bundle-card"
                            [class.bundle-card--expanded]="expandedId() === bundle.id">
                            <div class="bundle-card__header" (click)="toggleExpand(bundle.id)">
                                <div class="bundle-card__title">
                                    <span class="bundle-card__name">{{ bundle.name }}</span>
                                    @if (bundle.preset) {
                                        <span class="bundle-card__preset">Preset</span>
                                    }
                                </div>
                                <div class="bundle-card__meta">
                                    <span class="bundle-card__tools">{{ bundle.tools.length }} tools</span>
                                </div>
                            </div>
                            <p class="bundle-card__desc">{{ bundle.description || 'No description' }}</p>

                            @if (expandedId() === bundle.id) {
                                <div class="bundle-card__details">
                                    @if (editingId() === bundle.id) {
                                        <div class="form-grid">
                                            <mat-form-field appearance="outline" class="form-field">
                                                <mat-label>Name</mat-label>
                                                <input matInput [(ngModel)]="editName" />
                                            </mat-form-field>
                                            <mat-form-field appearance="outline" class="form-field">
                                                <mat-label>Description</mat-label>
                                                <input matInput [(ngModel)]="editDescription" />
                                            </mat-form-field>
                                            <mat-form-field appearance="outline" class="form-field span-2">
                                                <mat-label>Tools (one per line)</mat-label>
                                                <textarea matInput [(ngModel)]="editTools" rows="4"></textarea>
                                            </mat-form-field>
                                            <mat-form-field appearance="outline" class="form-field span-2">
                                                <mat-label>Prompt Additions</mat-label>
                                                <textarea matInput [(ngModel)]="editPromptAdditions" rows="3"></textarea>
                                            </mat-form-field>
                                        </div>
                                        <div class="form-actions">
                                            <button mat-flat-button color="primary" (click)="onSaveEdit(bundle.id)">Save</button>
                                            <button mat-stroked-button (click)="editingId.set(null)">Cancel</button>
                                        </div>
                                    } @else {
                                        <div class="bundle-card__tools-list">
                                            <strong>Tools:</strong>
                                            {{ bundle.tools.join(', ') || 'None' }}
                                        </div>
                                        @if (bundle.promptAdditions) {
                                            <div class="bundle-card__prompt">
                                                <strong>Prompt Additions:</strong>
                                                <pre>{{ bundle.promptAdditions }}</pre>
                                            </div>
                                        }
                                        <div class="form-actions">
                                            @if (!bundle.preset) {
                                                <button mat-stroked-button (click)="startEdit(bundle)">Edit</button>
                                                <button mat-stroked-button color="warn" (click)="onDelete(bundle)">Delete</button>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </app-page-shell>
    `,
    styles: `
        .create-btn {
            padding: var(--space-2) var(--space-4); border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .filter-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
        .filter-tab {
            padding: 0.4rem var(--space-3); border: 1px solid var(--border); border-radius: var(--radius);
            background: transparent; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer;
            font-family: inherit; transition: all 0.15s;
        }
        .filter-tab--active { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .create-form {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: var(--space-6); margin-bottom: 1.5rem;
        }
        .create-form h3 { margin: 0 0 1rem; color: var(--text-primary); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .bundle-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .bundle-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: var(--space-3) var(--space-4); transition: border-color 0.15s;
        }
        .bundle-card--expanded { border-color: var(--accent-cyan); }
        .bundle-card__header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .bundle-card__title { display: flex; align-items: center; gap: 0.5rem; }
        .bundle-card__name { font-weight: 600; color: var(--text-primary); }
        .bundle-card__preset {
            font-size: 0.65rem; padding: 1px 6px; border-radius: var(--radius-sm); font-weight: 600;
            text-transform: uppercase; color: var(--accent-green); border: 1px solid var(--accent-green);
        }
        .bundle-card__meta { font-size: 0.75rem; color: var(--text-secondary); }
        .bundle-card__desc { margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--text-secondary); }
        .bundle-card__details { margin-top: 1rem; padding-top: var(--space-4); border-top: 1px solid var(--border); }
        .bundle-card__tools-list { font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.5rem; }
        .bundle-card__prompt pre { font-size: 0.8rem; color: var(--accent-green); white-space: pre-wrap; margin: 0.25rem 0; }
        @media (max-width: 767px) {
            .form-grid { grid-template-columns: 1fr; }
            .span-2 { grid-column: span 1; }
        }
    `,
})
export class SkillBundleListComponent implements OnInit {
    protected readonly bundleService = inject(SkillBundleService);
    private readonly notify = inject(NotificationService);

    protected readonly showCreateForm = signal(false);
    protected readonly creating = signal(false);
    protected readonly expandedId = signal<string | null>(null);
    protected readonly editingId = signal<string | null>(null);
    protected readonly activeFilter = signal<'all' | 'preset' | 'custom'>('all');

    protected formName = '';
    protected formDescription = '';
    protected formTools = '';
    protected formPromptAdditions = '';

    protected editName = '';
    protected editDescription = '';
    protected editTools = '';
    protected editPromptAdditions = '';

    protected readonly presetCount = computed(() =>
        this.bundleService.bundles().filter((b) => b.preset).length,
    );

    protected readonly customCount = computed(() =>
        this.bundleService.bundles().filter((b) => !b.preset).length,
    );

    protected readonly filteredBundles = computed(() => {
        const filter = this.activeFilter();
        const bundles = this.bundleService.bundles();
        if (filter === 'preset') return bundles.filter((b) => b.preset);
        if (filter === 'custom') return bundles.filter((b) => !b.preset);
        return bundles;
    });

    async ngOnInit(): Promise<void> {
        await this.bundleService.loadBundles();
    }

    toggleExpand(id: string): void {
        this.expandedId.set(this.expandedId() === id ? null : id);
        this.editingId.set(null);
    }

    startEdit(bundle: SkillBundle): void {
        this.editingId.set(bundle.id);
        this.editName = bundle.name;
        this.editDescription = bundle.description;
        this.editTools = bundle.tools.join('\n');
        this.editPromptAdditions = bundle.promptAdditions;
    }

    async onCreate(): Promise<void> {
        if (!this.formName) return;
        this.creating.set(true);
        try {
            await this.bundleService.createBundle({
                name: this.formName,
                description: this.formDescription,
                tools: this.formTools.split('\n').map((t) => t.trim()).filter(Boolean),
                promptAdditions: this.formPromptAdditions,
            });
            this.formName = '';
            this.formDescription = '';
            this.formTools = '';
            this.formPromptAdditions = '';
            this.showCreateForm.set(false);
            this.notify.success('Bundle created');
        } catch {
            this.notify.error('Failed to create bundle');
        } finally {
            this.creating.set(false);
        }
    }

    async onSaveEdit(id: string): Promise<void> {
        try {
            await this.bundleService.updateBundle(id, {
                name: this.editName,
                description: this.editDescription,
                tools: this.editTools.split('\n').map((t) => t.trim()).filter(Boolean),
                promptAdditions: this.editPromptAdditions,
            });
            this.editingId.set(null);
            this.notify.success('Bundle updated');
        } catch {
            this.notify.error('Failed to update bundle');
        }
    }

    async onDelete(bundle: SkillBundle): Promise<void> {
        if (bundle.preset) {
            this.notify.error('Cannot delete preset bundles');
            return;
        }
        if (!confirm(`Delete skill bundle "${bundle.name}"?`)) return;
        try {
            await this.bundleService.deleteBundle(bundle.id);
            this.expandedId.set(null);
            this.notify.success('Bundle deleted');
        } catch {
            this.notify.error('Failed to delete bundle');
        }
    }
}
