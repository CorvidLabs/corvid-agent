import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    OnInit,
    ElementRef,
    inject,
} from '@angular/core';

@Component({
    selector: 'app-dir-browser',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="overlay" (click)="onBackdropClick($event)" (keydown.escape)="onCancel()">
            <div class="browser" role="dialog" aria-label="Browse directories">
                <div class="browser__header">
                    <span class="browser__path" [title]="currentPath()">{{ currentPath() }}</span>
                    <button
                        class="browser__up btn btn--icon"
                        (click)="navigateUp()"
                        [disabled]="!parentPath()"
                        aria-label="Go to parent directory">
                        ↑ Up
                    </button>
                </div>

                @if (loading()) {
                    <div class="browser__loading">Loading…</div>
                }

                @if (error()) {
                    <div class="browser__error">{{ error() }}</div>
                }

                @if (!loading() && !error()) {
                    <ul class="browser__list" role="listbox" aria-label="Directories">
                        @for (dir of dirs(); track dir) {
                            <li class="browser__item" role="option" tabindex="0"
                                (click)="navigateInto(dir)"
                                (keydown.enter)="navigateInto(dir)">
                                <span class="browser__icon">📁</span>
                                {{ dir }}
                            </li>
                        }
                        @if (dirs().length === 0) {
                            <li class="browser__empty">No subdirectories</li>
                        }
                    </ul>
                }

                <div class="browser__actions">
                    <label class="browser__toggle">
                        <input type="checkbox" [checked]="showHidden()" (change)="toggleHidden()" />
                        Show hidden
                    </label>
                    <div class="browser__buttons">
                        <button class="btn btn--primary" (click)="onSelect()">Select</button>
                        <button class="btn btn--secondary" (click)="onCancel()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: `
        .overlay {
            position: fixed; inset: 0; z-index: 1000;
            background: rgba(0, 0, 0, 0.7);
            display: flex; align-items: center; justify-content: center;
        }
        .browser {
            width: 540px; max-height: 70vh;
            background: var(--bg-surface); border: 1px solid var(--border-bright);
            border-radius: var(--radius-lg);
            display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .browser__header {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
        }
        .browser__path {
            flex: 1; font-size: 0.8rem; color: var(--accent-cyan);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            direction: rtl; text-align: left;
        }
        .btn--icon {
            padding: 0.25rem 0.5rem; font-size: 0.75rem;
            background: transparent; color: var(--text-secondary);
            border: 1px solid var(--border-bright); border-radius: var(--radius);
            cursor: pointer; font-family: inherit;
        }
        .btn--icon:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .btn--icon:disabled { opacity: 0.3; cursor: not-allowed; }
        .browser__list {
            list-style: none; margin: 0; padding: 0;
            overflow-y: auto; flex: 1; min-height: 200px; max-height: 400px;
        }
        .browser__item {
            padding: 0.4rem 1rem; font-size: 0.8rem; color: var(--text-primary);
            cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
        }
        .browser__item:hover { background: var(--bg-hover); }
        .browser__item:focus-visible { background: var(--accent-cyan-dim); outline: none; }
        .browser__icon { font-size: 0.9rem; }
        .browser__empty {
            padding: 1.5rem 1rem; text-align: center;
            color: var(--text-tertiary); font-size: 0.8rem;
        }
        .browser__loading, .browser__error {
            padding: 1.5rem 1rem; text-align: center; font-size: 0.8rem;
        }
        .browser__loading { color: var(--text-secondary); }
        .browser__error { color: var(--accent-red); }
        .browser__actions {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.75rem 1rem;
            border-top: 1px solid var(--border);
        }
        .browser__toggle {
            font-size: 0.75rem; color: var(--text-secondary);
            display: flex; align-items: center; gap: 0.35rem; cursor: pointer;
        }
        .browser__toggle input { accent-color: var(--accent-cyan); }
        .browser__buttons { display: flex; gap: 0.5rem; }
        .btn {
            padding: 0.4rem 0.75rem; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--primary { background: transparent; color: var(--accent-cyan); border-color: var(--accent-cyan); }
        .btn--primary:hover { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); }
    `,
})
export class DirBrowserComponent implements OnInit {
    readonly initialPath = input<string>('');

    readonly selected = output<string>();
    readonly cancelled = output<void>();

    protected readonly currentPath = signal('');
    protected readonly parentPath = signal<string | null>(null);
    protected readonly dirs = signal<string[]>([]);
    protected readonly loading = signal(false);
    protected readonly error = signal('');
    protected readonly showHidden = signal(false);

    private readonly elRef = inject(ElementRef);

    ngOnInit(): void {
        this.loadDir(this.initialPath() || '');
    }

    protected async loadDir(path: string): Promise<void> {
        this.loading.set(true);
        this.error.set('');

        try {
            const params = new URLSearchParams();
            if (path) params.set('path', path);
            if (this.showHidden()) params.set('showHidden', '1');

            const res = await fetch(`/api/browse-dirs?${params}`);
            if (!res.ok) {
                const body = await res.json();
                this.error.set(body.error ?? 'Failed to load directory');
                return;
            }

            const data: { current: string; parent: string | null; dirs: string[] } = await res.json();
            this.currentPath.set(data.current);
            this.parentPath.set(data.parent);
            this.dirs.set(data.dirs);
        } catch {
            this.error.set('Could not reach server');
        } finally {
            this.loading.set(false);
        }
    }

    protected navigateInto(dir: string): void {
        const path = this.currentPath();
        const next = path.endsWith('/') ? path + dir : path + '/' + dir;
        this.loadDir(next);
    }

    protected navigateUp(): void {
        const parent = this.parentPath();
        if (parent) this.loadDir(parent);
    }

    protected toggleHidden(): void {
        this.showHidden.update((v) => !v);
        this.loadDir(this.currentPath());
    }

    protected onSelect(): void {
        this.selected.emit(this.currentPath());
    }

    protected onCancel(): void {
        this.cancelled.emit();
    }

    protected onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.onCancel();
        }
    }
}
