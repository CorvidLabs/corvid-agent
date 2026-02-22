import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SkillBundleService } from '../../core/services/skill-bundle.service';
import { NotificationService } from '../../core/services/notification.service';
import type { SkillBundle } from '../../core/models/skill-bundle.model';

@Component({
    selector: 'app-skill-bundle-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Skill Bundles</h2>
                <button class="create-btn" (click)="showCreateForm.set(!showCreateForm())">
                    {{ showCreateForm() ? 'Cancel' : '+ New Bundle' }}
                </button>
            </div>

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
                        <div class="form-field">
                            <label>Name</label>
                            <input [(ngModel)]="formName" class="form-input" placeholder="e.g. Code Review Tools" />
                        </div>
                        <div class="form-field">
                            <label>Description</label>
                            <input [(ngModel)]="formDescription" class="form-input" placeholder="What this bundle provides..." />
                        </div>
                        <div class="form-field span-2">
                            <label>Tools (one per line)</label>
                            <textarea
                                [(ngModel)]="formTools"
                                class="form-textarea"
                                rows="4"
                                placeholder="Read\nEdit\nBash"></textarea>
                        </div>
                        <div class="form-field span-2">
                            <label>Prompt Additions</label>
                            <textarea
                                [(ngModel)]="formPromptAdditions"
                                class="form-textarea"
                                rows="3"
                                placeholder="Additional instructions for the agent..."></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button
                            class="btn btn--primary"
                            [disabled]="creating() || !formName"
                            (click)="onCreate()">
                            {{ creating() ? 'Creating...' : 'Create Bundle' }}
                        </button>
                    </div>
                </div>
            }

            @if (bundleService.loading()) {
                <p class="loading">Loading bundles...</p>
            } @else if (filteredBundles().length === 0) {
                <p class="empty">No bundles found.</p>
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
                                            <div class="form-field">
                                                <label>Name</label>
                                                <input [(ngModel)]="editName" class="form-input" />
                                            </div>
                                            <div class="form-field">
                                                <label>Description</label>
                                                <input [(ngModel)]="editDescription" class="form-input" />
                                            </div>
                                            <div class="form-field span-2">
                                                <label>Tools (one per line)</label>
                                                <textarea [(ngModel)]="editTools" class="form-textarea" rows="4"></textarea>
                                            </div>
                                            <div class="form-field span-2">
                                                <label>Prompt Additions</label>
                                                <textarea [(ngModel)]="editPromptAdditions" class="form-textarea" rows="3"></textarea>
                                            </div>
                                        </div>
                                        <div class="form-actions">
                                            <button class="btn btn--primary" (click)="onSaveEdit(bundle.id)">Save</button>
                                            <button class="btn btn--secondary" (click)="editingId.set(null)">Cancel</button>
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
                                                <button class="btn btn--secondary" (click)="startEdit(bundle)">Edit</button>
                                                <button class="btn btn--danger" (click)="onDelete(bundle)">Delete</button>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .create-btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid var(--accent-cyan); background: var(--accent-cyan-dim);
            color: var(--accent-cyan); font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .filter-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
        .filter-tab {
            padding: 0.4rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius);
            background: transparent; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer;
            font-family: inherit; transition: all 0.15s;
        }
        .filter-tab--active { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .loading, .empty { color: var(--text-secondary); font-size: 0.85rem; }
        .create-form {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 1.5rem; margin-bottom: 1.5rem;
        }
        .create-form h3 { margin: 0 0 1rem; color: var(--text-primary); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .form-input, .form-select, .form-textarea {
            width: 100%; padding: 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            box-sizing: border-box;
        }
        .form-input:focus, .form-textarea:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .form-textarea { resize: vertical; min-height: 4em; line-height: 1.5; }
        .span-2 { grid-column: span 2; }
        .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .btn--primary { border-color: var(--accent-cyan); background: var(--accent-cyan-dim); color: var(--accent-cyan); }
        .btn--primary:hover:not(:disabled) { background: rgba(0, 229, 255, 0.15); }
        .btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--danger { background: transparent; color: var(--accent-red); border-color: var(--accent-red); }
        .btn--danger:hover { background: var(--accent-red-dim); }
        .bundle-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .bundle-card {
            background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius);
            padding: 0.75rem 1rem; transition: border-color 0.15s;
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
        .bundle-card__details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
        .bundle-card__tools-list { font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.5rem; }
        .bundle-card__prompt pre { font-size: 0.8rem; color: var(--accent-green); white-space: pre-wrap; margin: 0.25rem 0; }
        @media (max-width: 768px) {
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
        try {
            await this.bundleService.deleteBundle(bundle.id);
            this.expandedId.set(null);
            this.notify.success('Bundle deleted');
        } catch {
            this.notify.error('Failed to delete bundle');
        }
    }
}
