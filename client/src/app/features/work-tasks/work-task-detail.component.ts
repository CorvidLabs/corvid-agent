import { Component, ChangeDetectionStrategy, inject, input, signal, computed, OnInit, OnChanges } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { WorkTask } from '../../core/models/work-task.model';
import type { SessionMessage } from '../../core/models/session.model';
import { firstValueFrom } from 'rxjs';

type LogLevel = 'all' | 'system' | 'user' | 'assistant';

interface DiffHunk {
    header: string;
    lines: DiffLine[];
}

interface DiffLine {
    type: 'add' | 'remove' | 'context' | 'header';
    content: string;
    oldNum: number | null;
    newNum: number | null;
}

interface DiffFile {
    filename: string;
    hunks: DiffHunk[];
    collapsed: boolean;
}

@Component({
    selector: 'app-work-task-detail',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTimePipe, SkeletonComponent],
    template: `
        <div class="detail">
            <!-- Tab bar -->
            <div class="detail__tabs">
                <button
                    class="detail__tab"
                    [class.detail__tab--active]="activeTab() === 'logs'"
                    (click)="activeTab.set('logs')"
                >Session Logs</button>
                @if (task().prUrl) {
                    <button
                        class="detail__tab"
                        [class.detail__tab--active]="activeTab() === 'diff'"
                        (click)="switchToDiff()"
                    >PR Diff</button>
                }
            </div>

            <!-- Log viewer -->
            @if (activeTab() === 'logs') {
                @if (!task().sessionId) {
                    <p class="detail__empty">No session attached to this task.</p>
                } @else if (loadingLogs()) {
                    <app-skeleton variant="table" [count]="4" />
                } @else if (messages().length === 0) {
                    <p class="detail__empty">No log entries found.</p>
                } @else {
                    <div class="log-controls">
                        <div class="log-filters">
                            <button class="log-filter" [class.log-filter--active]="logLevel() === 'all'" (click)="logLevel.set('all')">All ({{ messages().length }})</button>
                            <button class="log-filter" [class.log-filter--active]="logLevel() === 'user'" (click)="logLevel.set('user')">User</button>
                            <button class="log-filter" [class.log-filter--active]="logLevel() === 'assistant'" (click)="logLevel.set('assistant')">Assistant</button>
                            <button class="log-filter" [class.log-filter--active]="logLevel() === 'system'" (click)="logLevel.set('system')">System</button>
                        </div>
                        <input class="log-search" placeholder="Search logs..." (input)="logSearch.set($any($event.target).value)" />
                    </div>
                    <div class="log-list">
                        @for (msg of filteredMessages(); track msg.id) {
                            <div class="log-entry" [attr.data-role]="msg.role">
                                <div class="log-entry__header">
                                    <span class="log-role" [attr.data-role]="msg.role">{{ msg.role }}</span>
                                    @if (msg.costUsd > 0) {
                                        <span class="log-cost">{{ '$' + msg.costUsd.toFixed(4) }}</span>
                                    }
                                    <span class="log-time">{{ msg.timestamp | relativeTime }}</span>
                                </div>
                                <div class="log-content" [innerHTML]="highlightContent(msg.content)"></div>
                            </div>
                        }
                    </div>
                }
            }

            <!-- Diff viewer -->
            @if (activeTab() === 'diff') {
                @if (loadingDiff()) {
                    <app-skeleton variant="table" [count]="6" />
                } @else if (diffError()) {
                    <p class="detail__error">{{ diffError() }}</p>
                } @else if (diffFiles().length === 0) {
                    <p class="detail__empty">No diff data available.</p>
                } @else {
                    <div class="diff-summary">
                        <span class="diff-summary__files">{{ diffFiles().length }} file{{ diffFiles().length !== 1 ? 's' : '' }} changed</span>
                    </div>
                    <div class="diff-files">
                        @for (file of diffFiles(); track file.filename) {
                            <div class="diff-file">
                                <button class="diff-file__header" (click)="toggleDiffFile(file)">
                                    <span class="diff-file__chevron" [class.diff-file__chevron--open]="!file.collapsed">&#x25B6;</span>
                                    <span class="diff-file__name">{{ file.filename }}</span>
                                </button>
                                @if (!file.collapsed) {
                                    <div class="diff-file__content">
                                        @for (hunk of file.hunks; track $index) {
                                            <div class="diff-hunk">
                                                <div class="diff-hunk__header">{{ hunk.header }}</div>
                                                @for (line of hunk.lines; track $index) {
                                                    <div class="diff-line" [attr.data-type]="line.type">
                                                        <span class="diff-line__num diff-line__num--old">{{ line.oldNum ?? '' }}</span>
                                                        <span class="diff-line__num diff-line__num--new">{{ line.newNum ?? '' }}</span>
                                                        <span class="diff-line__content">{{ line.content }}</span>
                                                    </div>
                                                }
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: `
        .detail { padding: 0.75rem 0 0; }

        /* Tabs */
        .detail__tabs { display: flex; gap: 0.25rem; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        .detail__tab {
            padding: 0.3rem 0.6rem; background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
            color: var(--text-tertiary); font-size: 0.65rem; font-weight: 600; font-family: inherit; cursor: pointer;
            text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s;
        }
        .detail__tab:hover { border-color: var(--border-bright); color: var(--text-secondary); }
        .detail__tab--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }

        .detail__empty { color: var(--text-tertiary); font-size: 0.75rem; text-align: center; padding: 1.5rem; }
        .detail__error { color: var(--accent-red); font-size: 0.75rem; text-align: center; padding: 1.5rem; }

        /* Log controls */
        .log-controls { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; }
        .log-filters { display: flex; gap: 0.25rem; }
        .log-filter {
            padding: 0.2rem 0.45rem; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 12px;
            color: var(--text-tertiary); font-size: 0.6rem; font-family: inherit; cursor: pointer; transition: all 0.15s;
        }
        .log-filter:hover { border-color: var(--border-bright); color: var(--text-secondary); }
        .log-filter--active { border-color: var(--accent-cyan); color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .log-search {
            flex: 1; min-width: 120px; padding: 0.25rem 0.5rem; border: 1px solid var(--border-bright); border-radius: var(--radius-sm);
            font-size: 0.7rem; font-family: inherit; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box;
        }
        .log-search:focus { border-color: var(--accent-cyan); outline: none; }

        /* Log list */
        .log-list { display: flex; flex-direction: column; gap: 0.35rem; max-height: 400px; overflow-y: auto; }
        .log-entry {
            background: var(--bg-deep); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem;
            font-size: 0.7rem; transition: border-color 0.15s;
        }
        .log-entry[data-role="user"] { border-left: 2px solid var(--accent-cyan); }
        .log-entry[data-role="assistant"] { border-left: 2px solid var(--accent-green); }
        .log-entry[data-role="system"] { border-left: 2px solid var(--accent-amber); }
        .log-entry__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .log-role {
            font-size: 0.55rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
            padding: 1px 5px; border-radius: var(--radius-sm);
        }
        .log-role[data-role="user"] { color: var(--accent-cyan); background: var(--accent-cyan-dim); }
        .log-role[data-role="assistant"] { color: var(--accent-green); background: var(--accent-green-dim); }
        .log-role[data-role="system"] { color: var(--accent-amber); background: var(--accent-amber-dim); }
        .log-cost { font-size: 0.55rem; color: var(--text-tertiary); font-family: var(--font-mono, monospace); }
        .log-time { font-size: 0.55rem; color: var(--text-tertiary); margin-left: auto; }
        .log-content {
            color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap; word-break: break-word;
            max-height: 200px; overflow-y: auto;
        }

        /* Syntax highlighting in log content */
        :host ::ng-deep .log-code-block {
            display: block; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
            padding: 0.4rem 0.5rem; margin: 0.25rem 0; font-family: var(--font-mono, monospace); font-size: 0.65rem;
            overflow-x: auto; color: var(--text-primary);
        }
        :host ::ng-deep .log-code-inline {
            background: var(--bg-raised); padding: 1px 4px; border-radius: 3px;
            font-family: var(--font-mono, monospace); font-size: 0.9em; color: var(--accent-magenta);
        }

        /* Diff viewer */
        .diff-summary { margin-bottom: 0.5rem; }
        .diff-summary__files { font-size: 0.7rem; color: var(--text-secondary); }
        .diff-files { display: flex; flex-direction: column; gap: 0.5rem; }
        .diff-file { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
        .diff-file__header {
            display: flex; align-items: center; gap: 0.35rem; width: 100%; padding: 0.4rem 0.5rem;
            background: var(--bg-raised); border: none; border-bottom: 1px solid var(--border);
            color: var(--text-primary); font-size: 0.7rem; font-family: var(--font-mono, monospace);
            cursor: pointer; text-align: left;
        }
        .diff-file__header:hover { background: var(--bg-surface); }
        .diff-file__chevron { font-size: 0.55rem; color: var(--text-tertiary); transition: transform 0.15s; display: inline-block; }
        .diff-file__chevron--open { transform: rotate(90deg); }
        .diff-file__name { word-break: break-all; }
        .diff-file__content { overflow-x: auto; }
        .diff-hunk__header {
            padding: 0.2rem 0.5rem; background: var(--accent-cyan-dim); color: var(--accent-cyan);
            font-size: 0.6rem; font-family: var(--font-mono, monospace);
        }
        .diff-line {
            display: grid; grid-template-columns: 3rem 3rem 1fr; font-family: var(--font-mono, monospace);
            font-size: 0.65rem; line-height: 1.5;
        }
        .diff-line[data-type="add"] { background: rgba(0, 200, 83, 0.08); }
        .diff-line[data-type="add"] .diff-line__content { color: var(--accent-green); }
        .diff-line[data-type="remove"] { background: rgba(255, 82, 82, 0.08); }
        .diff-line[data-type="remove"] .diff-line__content { color: var(--accent-red); }
        .diff-line[data-type="context"] .diff-line__content { color: var(--text-tertiary); }
        .diff-line__num {
            padding: 0 0.3rem; text-align: right; color: var(--text-tertiary); user-select: none;
            border-right: 1px solid var(--border);
        }
        .diff-line__content { padding: 0 0.5rem; white-space: pre-wrap; word-break: break-all; }

        @media (max-width: 767px) {
            .log-controls { flex-direction: column; }
            .log-search { min-width: 100%; }
            .diff-line { grid-template-columns: 2.5rem 2.5rem 1fr; }
        }
    `,
})
export class WorkTaskDetailComponent implements OnInit, OnChanges {
    readonly task = input.required<WorkTask>();
    private readonly api = inject(ApiService);

    readonly activeTab = signal<'logs' | 'diff'>('logs');
    readonly loadingLogs = signal(false);
    readonly messages = signal<SessionMessage[]>([]);
    readonly logLevel = signal<LogLevel>('all');
    readonly logSearch = signal('');

    readonly loadingDiff = signal(false);
    readonly diffFiles = signal<DiffFile[]>([]);
    readonly diffError = signal<string | null>(null);
    private diffLoaded = false;

    readonly filteredMessages = computed(() => {
        let msgs = this.messages();
        const level = this.logLevel();
        if (level !== 'all') {
            msgs = msgs.filter(m => m.role === level);
        }
        const search = this.logSearch().toLowerCase().trim();
        if (search) {
            msgs = msgs.filter(m => m.content.toLowerCase().includes(search));
        }
        return msgs;
    });

    async ngOnInit(): Promise<void> {
        await this.loadLogs();
    }

    async ngOnChanges(): Promise<void> {
        this.diffLoaded = false;
        await this.loadLogs();
    }

    protected switchToDiff(): void {
        this.activeTab.set('diff');
        if (!this.diffLoaded) {
            this.loadDiff();
        }
    }

    protected toggleDiffFile(file: DiffFile): void {
        file.collapsed = !file.collapsed;
    }

    protected highlightContent(content: string): string {
        // Sanitize HTML
        let safe = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Highlight fenced code blocks: ```...```
        safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
            return `<span class="log-code-block">${code.trim()}</span>`;
        });

        // Highlight inline code: `...`
        safe = safe.replace(/`([^`]+)`/g, '<span class="log-code-inline">$1</span>');

        // Truncate very long content
        if (safe.length > 5000) {
            safe = safe.slice(0, 5000) + '\n\n... [truncated]';
        }

        return safe;
    }

    private async loadLogs(): Promise<void> {
        const sessionId = this.task().sessionId;
        if (!sessionId) return;
        this.loadingLogs.set(true);
        try {
            const msgs = await firstValueFrom(this.api.get<SessionMessage[]>(`/sessions/${sessionId}/messages`));
            this.messages.set(msgs);
        } catch {
            this.messages.set([]);
        } finally {
            this.loadingLogs.set(false);
        }
    }

    private async loadDiff(): Promise<void> {
        const prUrl = this.task().prUrl;
        if (!prUrl) return;
        this.loadingDiff.set(true);
        this.diffError.set(null);
        try {
            // Extract owner/repo/number from PR URL
            const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
            if (!match) {
                this.diffError.set('Could not parse PR URL');
                return;
            }
            const [, owner, repo, number] = match;
            // Use our API proxy to fetch diff
            const diff = await firstValueFrom(
                this.api.get<string>(`/github/pr-diff?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&number=${number}`)
            );
            this.diffFiles.set(this.parseDiff(typeof diff === 'string' ? diff : ''));
            this.diffLoaded = true;
        } catch {
            this.diffError.set('Failed to load diff. The PR may be in a private repository.');
        } finally {
            this.loadingDiff.set(false);
        }
    }

    private parseDiff(raw: string): DiffFile[] {
        const files: DiffFile[] = [];
        const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

        for (const chunk of fileChunks) {
            const lines = chunk.split('\n');
            const filenameMatch = lines[0].match(/b\/(.+)$/);
            const filename = filenameMatch?.[1] ?? 'unknown';
            const file: DiffFile = { filename, hunks: [], collapsed: false };
            let currentHunk: DiffHunk | null = null;
            let oldLine = 0;
            let newLine = 0;

            for (const line of lines.slice(1)) {
                if (line.startsWith('@@')) {
                    const hunkMatch = line.match(/@@ -(\d+)/);
                    oldLine = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
                    const newMatch = line.match(/\+(\d+)/);
                    newLine = newMatch ? parseInt(newMatch[1], 10) : 1;
                    currentHunk = { header: line, lines: [] };
                    file.hunks.push(currentHunk);
                } else if (currentHunk) {
                    if (line.startsWith('+')) {
                        currentHunk.lines.push({ type: 'add', content: line.slice(1), oldNum: null, newNum: newLine++ });
                    } else if (line.startsWith('-')) {
                        currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldNum: oldLine++, newNum: null });
                    } else if (line.startsWith(' ') || line === '') {
                        currentHunk.lines.push({ type: 'context', content: line.slice(1), oldNum: oldLine++, newNum: newLine++ });
                    }
                }
            }
            files.push(file);
        }
        return files;
    }
}
