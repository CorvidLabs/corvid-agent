import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    OnInit,
    OnDestroy,
    computed,
} from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { NotificationService } from '../../core/services/notification.service';
import type { ServerWsMessage } from '../../core/models/ws-message.model';
import { firstValueFrom } from 'rxjs';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface OllamaStatus {
    available: boolean;
    host: string;
    modelCount: number;
    models: string[];
    activePulls: number;
    pullStatuses: PullStatus[];
    error?: string;
}

interface ModelDetail {
    name: string;
    size: number;
    sizeHuman: string;
    modifiedAt: string;
    family: string;
    capabilities?: {
        supportsTools: boolean;
        supportsVision: boolean;
        contextWindow: number;
    };
    loaded?: boolean;
}

interface PullStatus {
    model: string;
    status: string;
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    currentLayer: string;
    error?: string;
    startedAt?: string;
}

interface LibraryModel {
    name: string;
    description: string;
    category: string;
    parameterSize: string;
    capabilities: string[];
    pullCommand: string;
    installed: boolean;
}

interface LibraryResponse {
    models: LibraryModel[];
    categories: string[];
    total: number;
}

// ── Component ───────────────────────────────────────────────────────────────

@Component({
    selector: 'app-models',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DecimalPipe, SlicePipe],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>Models</h2>
                <div class="header__actions">
                    <button class="btn btn--secondary" (click)="refresh()" [disabled]="loading()">
                        Refresh
                    </button>
                </div>
            </div>

            <!-- Status Banner -->
            <div class="status-banner" [class.status-banner--offline]="!ollamaAvailable()">
                <span class="status-dot" [class.status-dot--online]="ollamaAvailable()"></span>
                @if (ollamaAvailable()) {
                    <span>Ollama running at <code>{{ ollamaHost() }}</code> &mdash; {{ installedModels().length }} model{{ installedModels().length === 1 ? '' : 's' }} installed</span>
                } @else {
                    <span>Ollama not reachable. Start it with <code>ollama serve</code></span>
                }
            </div>

            <!-- Active Downloads -->
            @if (activePulls().length > 0) {
                <section class="section">
                    <h3 class="section__title">Downloading</h3>
                    <div class="pull-list">
                        @for (pull of activePulls(); track pull.model) {
                            <div class="pull-card">
                                <div class="pull-card__header">
                                    <span class="pull-card__model">{{ pull.model }}</span>
                                    <span class="pull-card__status" [class.pull-card__status--error]="pull.status === 'error'">
                                        {{ pull.status }}
                                    </span>
                                </div>
                                @if (pull.status === 'pulling') {
                                    <div class="progress-bar">
                                        <div class="progress-bar__fill" [style.width.%]="pull.progress"></div>
                                    </div>
                                    <div class="pull-card__detail">
                                        <span>{{ formatBytes(pull.downloadedBytes) }} / {{ formatBytes(pull.totalBytes) }}</span>
                                        <span>{{ pull.progress | number:'1.0-0' }}%</span>
                                    </div>
                                    @if (pull.currentLayer) {
                                        <div class="pull-card__layer">Layer: {{ pull.currentLayer | slice:0:20 }}...</div>
                                    }
                                } @else if (pull.status === 'completed') {
                                    <div class="progress-bar">
                                        <div class="progress-bar__fill progress-bar__fill--done" style="width: 100%"></div>
                                    </div>
                                    <div class="pull-card__detail"><span>Download complete</span></div>
                                } @else if (pull.error) {
                                    <div class="pull-card__error">{{ pull.error }}</div>
                                }
                            </div>
                        }
                    </div>
                </section>
            }

            <!-- Tabs -->
            <div class="tabs">
                <button class="tab" [class.tab--active]="activeTab() === 'installed'" (click)="activeTab.set('installed')">
                    Installed ({{ installedModels().length }})
                </button>
                <button class="tab" [class.tab--active]="activeTab() === 'library'" (click)="switchToLibrary()">
                    Library
                </button>
            </div>

            <!-- Installed Models Tab -->
            @if (activeTab() === 'installed') {
                @if (loading()) {
                    <p class="hint">Loading models...</p>
                } @else if (installedModels().length === 0) {
                    <div class="empty-state">
                        <p>No models installed yet.</p>
                        <p class="hint">Switch to the <strong>Library</strong> tab to download one.</p>
                    </div>
                } @else {
                    <div class="model-grid">
                        @for (model of installedModels(); track model.name) {
                            <div class="model-card">
                                <div class="model-card__header">
                                    <h4 class="model-card__name">{{ model.name }}</h4>
                                    @if (model.loaded) {
                                        <span class="badge badge--running">Loaded</span>
                                    }
                                </div>
                                <div class="model-card__info">
                                    <span class="model-card__meta">{{ model.sizeHuman }}</span>
                                    <span class="model-card__meta">{{ model.family }}</span>
                                    @if (model.capabilities?.supportsTools) {
                                        <span class="badge badge--tools">Tools</span>
                                    }
                                    @if (model.capabilities?.supportsVision) {
                                        <span class="badge badge--vision">Vision</span>
                                    }
                                    @if (model.capabilities?.contextWindow; as ctx) {
                                        <span class="model-card__meta">{{ formatContextWindow(ctx) }} ctx</span>
                                    }
                                </div>
                                <div class="model-card__actions">
                                    <button
                                        class="btn btn--danger btn--sm"
                                        (click)="deleteModel(model.name)"
                                        [disabled]="deletingModel() === model.name">
                                        {{ deletingModel() === model.name ? 'Deleting...' : 'Delete' }}
                                    </button>
                                </div>
                            </div>
                        }
                    </div>
                }
            }

            <!-- Library Tab -->
            @if (activeTab() === 'library') {
                <div class="library-controls">
                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search models..."
                        [value]="libraryQuery()"
                        (input)="onSearchInput($event)" />
                    <div class="category-filters">
                        @for (cat of libraryCategories(); track cat) {
                            <button
                                class="filter-chip"
                                [class.filter-chip--active]="libraryCategory() === cat"
                                (click)="filterCategory(cat)">
                                {{ cat }}
                            </button>
                        }
                    </div>
                </div>

                @if (loadingLibrary()) {
                    <p class="hint">Loading library...</p>
                } @else if (libraryModels().length === 0) {
                    <p class="hint">No models found.</p>
                } @else {
                    <div class="model-grid">
                        @for (model of libraryModels(); track model.name) {
                            <div class="model-card" [class.model-card--installed]="model.installed">
                                <div class="model-card__header">
                                    <h4 class="model-card__name">{{ model.name }}</h4>
                                    <span class="badge badge--size">{{ model.parameterSize }}</span>
                                </div>
                                <p class="model-card__desc">{{ model.description }}</p>
                                <div class="model-card__info">
                                    @for (cap of model.capabilities; track cap) {
                                        <span class="badge badge--cap">{{ cap }}</span>
                                    }
                                </div>
                                <div class="model-card__actions">
                                    @if (model.installed) {
                                        <span class="installed-label">Installed</span>
                                    } @else if (isPulling(model.pullCommand)) {
                                        <span class="pulling-label">Downloading...</span>
                                    } @else {
                                        <button
                                            class="btn btn--primary btn--sm"
                                            (click)="pullModel(model.pullCommand)"
                                            [disabled]="!ollamaAvailable()">
                                            Download
                                        </button>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                }
            }

            <!-- Manual Pull -->
            <section class="section manual-pull">
                <h3 class="section__title">Pull Custom Model</h3>
                <div class="manual-pull__form">
                    <input
                        type="text"
                        class="search-input"
                        placeholder="e.g. qwen3:8b, llama3.1:70b"
                        #customModelInput />
                    <button
                        class="btn btn--primary"
                        (click)="pullModel(customModelInput.value); customModelInput.value = ''"
                        [disabled]="!ollamaAvailable()">
                        Pull
                    </button>
                </div>
            </section>
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; max-width: 960px; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .header__actions { display: flex; gap: 0.5rem; }

        /* Status Banner */
        .status-banner {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.75rem 1rem; border-radius: var(--radius-lg);
            background: var(--bg-surface); border: 1px solid var(--border);
            font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1.25rem;
        }
        .status-banner--offline { border-color: rgba(255, 80, 80, 0.3); }
        .status-banner code { background: var(--bg-raised); padding: 1px 6px; border-radius: var(--radius-sm); font-size: 0.75rem; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff5050; flex-shrink: 0; }
        .status-dot--online { background: #00e676; box-shadow: 0 0 6px rgba(0, 230, 118, 0.4); }

        /* Tabs */
        .tabs { display: flex; gap: 0; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border); }
        .tab {
            padding: 0.6rem 1.25rem; background: none; border: none; border-bottom: 2px solid transparent;
            color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; cursor: pointer;
            font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: color 0.15s, border-color 0.15s;
        }
        .tab:hover { color: var(--text-primary); }
        .tab--active { color: var(--accent-cyan); border-bottom-color: var(--accent-cyan); }

        /* Section */
        .section { margin-bottom: 1.5rem; }
        .section__title { font-size: 0.8rem; font-weight: 600; color: var(--accent-magenta); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.75rem; }

        /* Model Grid */
        .model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }

        /* Model Card */
        .model-card {
            padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border);
            border-radius: var(--radius-lg); transition: border-color 0.2s;
        }
        .model-card:hover { border-color: var(--accent-cyan); }
        .model-card--installed { opacity: 0.7; }
        .model-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .model-card__name { margin: 0; font-size: 0.9rem; color: var(--text-primary); font-weight: 600; }
        .model-card__desc { margin: 0 0 0.5rem; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; }
        .model-card__info { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
        .model-card__meta { font-size: 0.72rem; color: var(--text-tertiary); background: var(--bg-raised); padding: 2px 8px; border-radius: var(--radius-sm); }
        .model-card__actions { display: flex; gap: 0.5rem; align-items: center; }

        /* Pull Card */
        .pull-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .pull-card {
            padding: 0.75rem 1rem; background: var(--bg-surface); border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-lg); box-shadow: 0 0 8px rgba(0, 229, 255, 0.05);
        }
        .pull-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
        .pull-card__model { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
        .pull-card__status { font-size: 0.72rem; text-transform: uppercase; color: var(--accent-cyan); font-weight: 600; letter-spacing: 0.05em; }
        .pull-card__status--error { color: #ff5050; }
        .pull-card__detail { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-tertiary); margin-top: 0.35rem; }
        .pull-card__layer { font-size: 0.68rem; color: var(--text-tertiary); margin-top: 0.25rem; font-family: monospace; }
        .pull-card__error { font-size: 0.78rem; color: #ff5050; margin-top: 0.35rem; }

        /* Progress Bar */
        .progress-bar {
            height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden;
        }
        .progress-bar__fill {
            height: 100%; background: var(--accent-cyan); border-radius: 3px;
            transition: width 0.3s ease; box-shadow: 0 0 6px rgba(0, 229, 255, 0.3);
        }
        .progress-bar__fill--done { background: #00e676; box-shadow: 0 0 6px rgba(0, 230, 118, 0.3); }

        /* Badges */
        .badge {
            font-size: 0.62rem; padding: 1px 6px; border-radius: var(--radius-sm);
            font-weight: 600; border: 1px solid; letter-spacing: 0.05em; text-transform: uppercase;
        }
        .badge--running { background: rgba(0, 230, 118, 0.1); color: #00e676; border-color: rgba(0, 230, 118, 0.3); }
        .badge--tools { background: var(--accent-cyan-dim); color: var(--accent-cyan); border-color: rgba(0, 229, 255, 0.3); }
        .badge--vision { background: rgba(255, 170, 0, 0.1); color: #ffaa00; border-color: rgba(255, 170, 0, 0.3); }
        .badge--size { background: var(--bg-raised); color: var(--text-secondary); border-color: var(--border); }
        .badge--cap { background: var(--bg-raised); color: var(--text-secondary); border-color: var(--border); font-size: 0.62rem; }

        /* Library Controls */
        .library-controls { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .search-input {
            padding: 0.5rem 0.75rem; border: 1px solid var(--border-bright); border-radius: var(--radius);
            font-size: 0.85rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary);
            width: 100%;
        }
        .search-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); }
        .category-filters { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .filter-chip {
            padding: 0.3rem 0.75rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
            border: 1px solid var(--border-bright); background: transparent; color: var(--text-secondary);
            cursor: pointer; font-family: inherit; text-transform: capitalize;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .filter-chip:hover { border-color: var(--accent-cyan); color: var(--text-primary); }
        .filter-chip--active { background: var(--accent-cyan-dim); border-color: var(--accent-cyan); color: var(--accent-cyan); }

        /* Labels */
        .installed-label { font-size: 0.72rem; color: #00e676; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .pulling-label { font-size: 0.72rem; color: var(--accent-cyan); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

        /* Manual Pull */
        .manual-pull { margin-top: 1.5rem; }
        .manual-pull__form { display: flex; gap: 0.5rem; }
        .manual-pull__form .search-input { flex: 1; }

        /* Buttons */
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase;
            letter-spacing: 0.05em; transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); }
        .btn--secondary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--danger { background: transparent; color: #ff5050; border-color: rgba(255, 80, 80, 0.4); }
        .btn--danger:hover { background: rgba(255, 80, 80, 0.08); box-shadow: 0 0 8px rgba(255, 80, 80, 0.15); }
        .btn--danger:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn--sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }

        .hint { color: var(--text-tertiary); font-size: 0.82rem; }
        .empty-state { text-align: center; padding: 2rem 1rem; color: var(--text-secondary); }
        .empty-state strong { color: var(--accent-cyan); }
    `,
})
export class ModelsComponent implements OnInit, OnDestroy {
    private readonly api = inject(ApiService);
    private readonly ws = inject(WebSocketService);
    private readonly notifications = inject(NotificationService);

    // State
    readonly loading = signal(false);
    readonly ollamaAvailable = signal(false);
    readonly ollamaHost = signal('http://localhost:11434');
    readonly installedModels = signal<ModelDetail[]>([]);
    readonly activePulls = signal<PullStatus[]>([]);
    readonly deletingModel = signal<string | null>(null);

    // Tabs
    readonly activeTab = signal<'installed' | 'library'>('installed');

    // Library
    readonly loadingLibrary = signal(false);
    readonly libraryModels = signal<LibraryModel[]>([]);
    readonly libraryCategories = signal<string[]>(['all', 'recommended', 'coding', 'small', 'large', 'vision']);
    readonly libraryCategory = signal('all');
    readonly libraryQuery = signal('');

    // Computed: set of models being pulled (for library "Downloading..." label)
    readonly pullingSet = computed(() => new Set(this.activePulls().filter(p => p.status === 'pulling').map(p => p.model)));

    private wsUnsub: (() => void) | null = null;
    private searchDebounce: ReturnType<typeof setTimeout> | null = null;

    ngOnInit(): void {
        this.refresh();
        // Subscribe to Ollama WS events
        this.ws.subscribeOllama();
        this.wsUnsub = this.ws.onMessage((msg: ServerWsMessage) => {
            if (msg.type === 'ollama_pull_progress') {
                this.handlePullProgress(msg);
            }
        });
    }

    ngOnDestroy(): void {
        this.ws.unsubscribeOllama();
        this.wsUnsub?.();
        if (this.searchDebounce) clearTimeout(this.searchDebounce);
    }

    async refresh(): Promise<void> {
        this.loading.set(true);
        try {
            // Fetch status + models in parallel
            const [status, modelResp] = await Promise.all([
                firstValueFrom(this.api.get<OllamaStatus>('/ollama/status')).catch(() => null),
                firstValueFrom(this.api.get<{ models: ModelDetail[]; total: number }>('/ollama/models')).catch(() => null),
            ]);

            if (status) {
                this.ollamaAvailable.set(status.available);
                this.ollamaHost.set(status.host);
                this.activePulls.set(status.pullStatuses ?? []);
            } else {
                this.ollamaAvailable.set(false);
            }

            if (modelResp) {
                this.installedModels.set(modelResp.models);
            }
        } finally {
            this.loading.set(false);
        }
    }

    async pullModel(model: string): Promise<void> {
        if (!model.trim()) return;
        try {
            await firstValueFrom(
                this.api.post<{ message: string; status: PullStatus }>('/ollama/models/pull', { model: model.trim() }),
            );
            this.notifications.success(`Started downloading ${model}`);
            // Optimistically add to active pulls
            this.activePulls.update(pulls => {
                if (pulls.some(p => p.model === model)) return pulls;
                return [...pulls, { model: model.trim(), status: 'pulling', progress: 0, downloadedBytes: 0, totalBytes: 0, currentLayer: '' }];
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Pull request failed';
            this.notifications.error(message);
        }
    }

    async deleteModel(model: string): Promise<void> {
        this.deletingModel.set(model);
        try {
            await firstValueFrom(
                this.api.deleteWithBody<{ ok: boolean }>('/ollama/models', { model }),
            );
            this.notifications.success(`Deleted ${model}`);
            this.installedModels.update(models => models.filter(m => m.name !== model));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Delete failed';
            this.notifications.error(message);
        } finally {
            this.deletingModel.set(null);
        }
    }

    switchToLibrary(): void {
        this.activeTab.set('library');
        if (this.libraryModels().length === 0) {
            this.loadLibrary();
        }
    }

    async loadLibrary(): Promise<void> {
        this.loadingLibrary.set(true);
        try {
            const params = new URLSearchParams();
            if (this.libraryCategory() !== 'all') params.set('category', this.libraryCategory());
            if (this.libraryQuery()) params.set('q', this.libraryQuery());
            const qs = params.toString();
            const url = `/ollama/library${qs ? '?' + qs : ''}`;
            const resp = await firstValueFrom(this.api.get<LibraryResponse>(url));
            this.libraryModels.set(resp.models);
            if (resp.categories?.length) this.libraryCategories.set(resp.categories);
        } catch {
            this.notifications.error('Failed to load model library');
        } finally {
            this.loadingLibrary.set(false);
        }
    }

    filterCategory(cat: string): void {
        this.libraryCategory.set(cat);
        this.loadLibrary();
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.libraryQuery.set(value);
        if (this.searchDebounce) clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => this.loadLibrary(), 300);
    }

    isPulling(model: string): boolean {
        return this.pullingSet().has(model);
    }

    formatBytes(bytes: number): string {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let idx = 0;
        let size = bytes;
        while (size >= 1024 && idx < units.length - 1) {
            size /= 1024;
            idx++;
        }
        return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
    }

    formatContextWindow(ctx: number): string {
        if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
        return `${ctx}`;
    }

    private handlePullProgress(msg: Extract<ServerWsMessage, { type: 'ollama_pull_progress' }>): void {
        const pull: PullStatus = {
            model: msg.model,
            status: msg.status,
            progress: msg.progress,
            downloadedBytes: msg.downloadedBytes,
            totalBytes: msg.totalBytes,
            currentLayer: msg.currentLayer,
            error: msg.error,
        };

        this.activePulls.update(pulls => {
            const idx = pulls.findIndex(p => p.model === msg.model);
            if (idx >= 0) {
                const updated = [...pulls];
                updated[idx] = pull;
                return updated;
            }
            return [...pulls, pull];
        });

        // If completed, refresh models list
        if (msg.status === 'completed') {
            this.notifications.success(`Model ${msg.model} downloaded successfully`);
            // Refresh models after a brief delay to let Ollama register
            setTimeout(() => this.refresh(), 1500);
        } else if (msg.status === 'error') {
            this.notifications.error(`Failed to download ${msg.model}: ${msg.error || 'unknown error'}`);
        }
    }
}
