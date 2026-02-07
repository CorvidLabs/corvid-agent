import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, AfterViewChecked, computed, booleanAttribute } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { StreamEvent } from '../../core/models/ws-message.model';
import type { SessionMessage } from '../../core/models/session.model';

interface ParsedEvent {
    kind: 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error' | 'raw' | 'tool_group';
    content: string;
    meta?: string;
    timestamp?: string;
    children?: ParsedEvent[];
}

@Component({
    selector: 'app-session-output',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe],
    template: `
        <div class="terminal" #outputContainer role="log" aria-live="polite" aria-label="Session output">
            @for (msg of messages(); track msg.id) {
                <div class="line" [class]="'line--' + msg.role">
                    <span class="prompt">{{ msg.role === 'user' ? '>' : msg.role === 'assistant' ? '<' : '#' }}</span>
                    <span class="label">{{ msg.role }}</span>
                    <span class="time">{{ msg.timestamp | date:'HH:mm:ss' }}</span>
                    <pre class="text">{{ msg.content }}</pre>
                </div>
            }

            @if (hasHiddenEvents()) {
                <button class="load-more" (click)="showAllEvents()" aria-label="Show earlier events">
                    Show {{ parsedEvents().length - visibleEvents().length }} earlier events
                </button>
            }
            @for (evt of visibleEvents(); track $index) {
                @if (evt.kind === 'tool_group') {
                    <details class="tool-group" [attr.open]="isRunning() ? '' : null">
                        <summary class="tool-group-summary">
                            <span class="prompt tool-group-icon" [class.spinning]="isRunning()">{{ isRunning() ? '⟳' : '⤶' }}</span>
                            <span class="label tool-group-label">tools</span>
                            <span class="meta">{{ evt.meta }} · {{ evt.content }}</span>
                        </summary>
                        <div class="tool-group-children">
                            @for (child of evt.children; track $index) {
                                <div class="line" [class]="'line--' + child.kind">
                                    @switch (child.kind) {
                                        @case ('tool_use') {
                                            <span class="prompt">$</span>
                                            <span class="label tool-label">{{ child.meta }}</span>
                                            <pre class="text text--tool">{{ child.content }}</pre>
                                        }
                                        @case ('tool_result') {
                                            <span class="prompt">=</span>
                                            <span class="label result-label">result</span>
                                            <details class="tool-details">
                                                <summary class="tool-summary">{{ child.meta ?? 'output' }}</summary>
                                                <pre class="text text--result">{{ child.content }}</pre>
                                            </details>
                                        }
                                        @case ('error') {
                                            <span class="prompt">!</span>
                                            <span class="label error-label">error</span>
                                            <pre class="text text--error">{{ child.content }}</pre>
                                        }
                                    }
                                </div>
                            }
                        </div>
                    </details>
                } @else {
                    <div class="line" [class]="'line--' + evt.kind">
                        @switch (evt.kind) {
                            @case ('assistant') {
                                <span class="prompt">&lt;</span>
                                <span class="label">claude</span>
                                <pre class="text">{{ evt.content }}</pre>
                            }
                            @case ('user') {
                                <span class="prompt">&gt;</span>
                                <span class="label">user</span>
                                <pre class="text">{{ evt.content }}</pre>
                            }
                            @case ('tool_use') {
                                <span class="prompt">$</span>
                                <span class="label tool-label">{{ evt.meta }}</span>
                                <pre class="text text--tool">{{ evt.content }}</pre>
                            }
                            @case ('tool_result') {
                                <span class="prompt">=</span>
                                <span class="label result-label">result</span>
                                <details class="tool-details">
                                    <summary class="tool-summary">{{ evt.meta ?? 'output' }}</summary>
                                    <pre class="text text--result">{{ evt.content }}</pre>
                                </details>
                            }
                            @case ('result') {
                                <span class="prompt">&#x2713;</span>
                                <span class="label done-label">done</span>
                                <span class="meta">{{ evt.content }}</span>
                            }
                            @case ('error') {
                                <span class="prompt">!</span>
                                <span class="label error-label">error</span>
                                <pre class="text text--error">{{ evt.content }}</pre>
                            }
                            @case ('system') {
                                <span class="prompt">#</span>
                                <span class="label sys-label">sys</span>
                                <span class="meta">{{ evt.content }}</span>
                            }
                            @default {
                                <span class="prompt">.</span>
                                <span class="meta">{{ evt.content }}</span>
                            }
                        }
                    </div>
                }
            }
        </div>
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .terminal {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 0.75rem 1rem;
            background: var(--bg-deep);
            color: var(--text-primary);
            font-family: 'Dogica Pixel', 'Dogica', monospace;
            font-size: 0.8rem;
            line-height: 1.6;
            background-image: repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0, 229, 255, 0.008) 2px,
                rgba(0, 229, 255, 0.008) 4px
            );
        }

        .line {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 0.2rem 0;
            min-height: 1.4em;
        }

        .line + .line--assistant,
        .line + .line--user {
            margin-top: 0.5rem;
            padding-top: 0.5rem;
            border-top: 1px solid var(--border);
        }

        .prompt {
            flex-shrink: 0;
            width: 1.2em;
            text-align: center;
            font-weight: 700;
            opacity: 0.6;
        }

        .label {
            flex-shrink: 0;
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 1px 6px;
            border-radius: 3px;
            line-height: 1.6;
        }

        .time {
            flex-shrink: 0;
            font-size: 0.6rem;
            color: var(--text-tertiary);
            line-height: 1.8;
        }

        .text {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            flex: 1;
            min-width: 0;
        }

        .meta {
            font-size: 0.75rem;
            color: var(--text-tertiary);
            line-height: 1.6;
        }

        /* Assistant */
        .line--assistant .prompt { color: var(--accent-green); }
        .line--assistant .label { color: var(--accent-green); background: rgba(0, 255, 136, 0.08); }
        .line--assistant .text { color: var(--text-primary); }

        /* User */
        .line--user .prompt { color: var(--accent-cyan); }
        .line--user .label { color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); }
        .line--user .text { color: var(--text-primary); }

        /* Tool use */
        .line--tool_use .prompt { color: var(--accent-magenta); }
        .tool-label { color: var(--accent-magenta); background: rgba(255, 0, 170, 0.08); }
        .text--tool { color: var(--text-secondary); font-size: 0.75rem; }

        /* Tool result */
        .line--tool_result .prompt { color: var(--text-tertiary); }
        .result-label { color: var(--text-tertiary); background: rgba(255, 255, 255, 0.04); }
        .tool-details { flex: 1; min-width: 0; }
        .tool-summary {
            cursor: pointer;
            font-size: 0.7rem;
            color: var(--text-tertiary);
            user-select: none;
            line-height: 1.6;
        }
        .tool-summary:hover { color: var(--text-secondary); }
        .text--result {
            color: var(--text-secondary);
            font-size: 0.7rem;
            margin-top: 0.25rem;
            padding: 0.5rem;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            max-height: 200px;
            overflow-y: auto;
        }

        /* Result / done */
        .line--result .prompt { color: var(--accent-green); opacity: 1; }
        .done-label { color: var(--accent-green); background: rgba(0, 255, 136, 0.08); }

        /* Error */
        .line--error .prompt { color: var(--accent-red); opacity: 1; }
        .error-label { color: var(--accent-red); background: rgba(255, 51, 85, 0.08); }
        .text--error { color: var(--accent-red); }

        /* System */
        .line--system .prompt { color: var(--text-tertiary); }
        .sys-label { color: var(--text-tertiary); background: rgba(255, 255, 255, 0.03); }

        /* Tool group */
        .tool-group {
            margin: 0.25rem 0;
            padding: 0.2rem 0;
        }
        .tool-group + .line--assistant,
        .tool-group + .line--user {
            margin-top: 0.5rem;
            padding-top: 0.5rem;
            border-top: 1px solid var(--border);
        }
        .tool-group-summary {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            user-select: none;
            list-style: none;
        }
        .tool-group-summary::-webkit-details-marker { display: none; }
        .tool-group-summary:hover .meta { color: var(--text-secondary); }
        .tool-group-icon {
            flex-shrink: 0;
            width: 1.2em;
            text-align: center;
            font-weight: 700;
            color: var(--accent-magenta);
            opacity: 0.6;
        }
        .tool-group-icon.spinning { animation: spin 1.5s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .tool-group-label {
            color: var(--accent-magenta);
            background: rgba(255, 0, 170, 0.08);
        }
        .tool-group-children {
            padding-left: 1.5rem;
            border-left: 1px solid var(--border);
            margin-left: 0.55rem;
        }
        .tool-group-children .line {
            padding: 0.1rem 0;
            min-height: 1.2em;
        }

        .load-more {
            display: block;
            width: 100%;
            padding: 0.4rem 0.75rem;
            margin: 0.25rem 0;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--accent-cyan);
            font-family: inherit;
            font-size: 0.7rem;
            cursor: pointer;
            text-align: center;
            transition: background 0.15s;
        }
        .load-more:hover {
            background: var(--bg-hover);
        }
    `,
})
export class SessionOutputComponent implements AfterViewChecked {
    private static readonly RENDER_WINDOW = 200;

    readonly messages = input<SessionMessage[]>([]);
    readonly events = input<StreamEvent[]>([]);
    readonly isRunning = input(false, { transform: booleanAttribute });

    private readonly outputContainer = viewChild<ElementRef<HTMLDivElement>>('outputContainer');

    protected readonly parsedEvents = computed(() => this.groupToolEvents(this.parseEvents(this.events())));

    private showAll = false;

    protected readonly visibleEvents = computed(() => {
        const all = this.parsedEvents();
        if (this.showAll) return all;
        return all.length > SessionOutputComponent.RENDER_WINDOW
            ? all.slice(all.length - SessionOutputComponent.RENDER_WINDOW)
            : all;
    });

    protected readonly hasHiddenEvents = computed(() =>
        !this.showAll && this.parsedEvents().length > SessionOutputComponent.RENDER_WINDOW,
    );

    private shouldScroll = true;
    private lastEventCount = 0;

    ngAfterViewChecked(): void {
        const currentCount = this.events().length;
        if (currentCount !== this.lastEventCount) {
            this.shouldScroll = true;
            this.lastEventCount = currentCount;
        }
        if (this.shouldScroll) {
            const el = this.outputContainer()?.nativeElement;
            if (el) {
                el.scrollTop = el.scrollHeight;
                this.shouldScroll = false;
            }
        }
    }

    protected showAllEvents(): void {
        this.showAll = true;
    }

    private parseEvents(events: StreamEvent[]): ParsedEvent[] {
        const parsed: ParsedEvent[] = [];

        for (const event of events) {
            const data = event.data as Record<string, unknown> | undefined;
            if (!data) continue;

            const eventType = (data['type'] as string) ?? event.eventType;
            const subtype = data['subtype'] as string | undefined;

            switch (eventType) {
                case 'assistant': {
                    const message = data['message'] as Record<string, unknown> | undefined;
                    const content = message?.['content'];
                    const parentToolUseId = data['parent_tool_use_id'] as string | undefined;

                    // Skip sub-agent assistant messages (internal agent chatter)
                    if (parentToolUseId) break;

                    const text = this.extractText(content);
                    if (text) {
                        parsed.push({ kind: 'assistant', content: text });
                    }
                    // Check for tool use
                    const toolUses = this.extractToolUses(content);
                    for (const toolUse of toolUses) {
                        parsed.push(toolUse);
                    }
                    break;
                }

                case 'user': {
                    const message = data['message'] as Record<string, unknown> | undefined;
                    const content = message?.['content'];
                    const parentToolUseId = data['parent_tool_use_id'] as string | undefined;

                    // If content is an array, it contains tool results (not human input)
                    if (Array.isArray(content)) {
                        for (const block of content as Record<string, unknown>[]) {
                            if (block['type'] === 'tool_result') {
                                const resultContent = block['content'] as string | undefined;
                                const isError = block['is_error'] as boolean;
                                const truncated = resultContent
                                    ? resultContent.length > 500 ? resultContent.slice(0, 500) + '...' : resultContent
                                    : '(empty)';
                                parsed.push({
                                    kind: isError ? 'error' : 'tool_result',
                                    content: truncated,
                                    meta: isError ? 'error' : `${truncated.split('\n').length} lines`,
                                });
                            }
                        }
                        break;
                    }

                    // Skip internal agent messages (sub-agent prompts, etc.)
                    if (parentToolUseId) break;

                    // Actual human text input
                    const text = this.extractText(content);
                    if (text) {
                        parsed.push({ kind: 'user', content: text });
                    }
                    break;
                }

                case 'result': {
                    const cost = data['total_cost_usd'] as number | undefined;
                    const turns = data['num_turns'] as number | undefined;
                    const duration = data['duration_ms'] as number | undefined;
                    const parts: string[] = [];
                    if (turns !== undefined) parts.push(`${turns} turn${turns !== 1 ? 's' : ''}`);
                    if (duration !== undefined) parts.push(`${(duration / 1000).toFixed(1)}s`);
                    if (cost !== undefined) parts.push(`$${cost.toFixed(4)}`);
                    parsed.push({
                        kind: subtype === 'error_during_execution' ? 'error' : 'result',
                        content: parts.join(' · ') || (subtype ?? 'done'),
                    });
                    break;
                }

                case 'system': {
                    if (subtype === 'init') {
                        const model = data['model'] as string | undefined;
                        const cwd = data['cwd'] as string | undefined;
                        const parts: string[] = ['session initialized'];
                        if (model) parts.push(model);
                        if (cwd) parts.push(cwd);
                        parsed.push({ kind: 'system', content: parts.join(' · ') });
                    }
                    break;
                }

                case 'error': {
                    const error = data['error'] as Record<string, unknown> | undefined;
                    const msg = (error?.['message'] as string) ?? JSON.stringify(data);
                    parsed.push({ kind: 'error', content: msg });
                    break;
                }

                case 'session_started':
                case 'session_stopped':
                case 'session_exited':
                    // Skip — already reflected in session status badge
                    break;

                default: {
                    // Show unknown events compactly
                    const content = typeof data === 'string' ? data : JSON.stringify(data);
                    if (content && content !== '{}') {
                        parsed.push({ kind: 'raw', content: `[${eventType}] ${content}`.slice(0, 200) });
                    }
                    break;
                }
            }
        }

        return parsed;
    }

    private groupToolEvents(parsed: ParsedEvent[]): ParsedEvent[] {
        const grouped: ParsedEvent[] = [];
        let currentGroup: ParsedEvent | null = null;

        const flushGroup = (): void => {
            if (!currentGroup) return;
            const children = currentGroup.children ?? [];
            const toolUses = children.filter(c => c.kind === 'tool_use');
            const toolNames = [...new Set(toolUses.map(c => c.meta).filter(Boolean))];
            currentGroup.content = `${toolUses.length} call${toolUses.length !== 1 ? 's' : ''}`;
            currentGroup.meta = toolNames.join(', ');
            grouped.push(currentGroup);
            currentGroup = null;
        };

        for (const evt of parsed) {
            if (evt.kind === 'tool_use' || evt.kind === 'tool_result' || evt.kind === 'error') {
                if (!currentGroup) {
                    currentGroup = { kind: 'tool_group', content: '', children: [] };
                }
                currentGroup.children?.push(evt);
            } else {
                flushGroup();
                grouped.push(evt);
            }
        }

        flushGroup();
        return grouped;
    }

    private extractText(content: unknown): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .filter((b: Record<string, unknown>) => b['type'] === 'text' && b['text'])
                .map((b: Record<string, unknown>) => b['text'] as string)
                .join('');
        }
        return '';
    }

    private extractToolUses(content: unknown): ParsedEvent[] {
        if (!Array.isArray(content)) return [];
        const results: ParsedEvent[] = [];
        for (const block of content) {
            if (block['type'] === 'tool_use') {
                const name = block['name'] as string;
                const input = block['input'] as Record<string, unknown> | undefined;
                let summary = '';
                if (input) {
                    if (input['command']) {
                        summary = String(input['command']);
                    } else if (input['pattern']) {
                        summary = `pattern: ${input['pattern']}`;
                    } else if (input['file_path']) {
                        summary = String(input['file_path']);
                    } else if (input['query']) {
                        summary = String(input['query']);
                    } else if (input['url']) {
                        summary = String(input['url']);
                    } else if (input['prompt']) {
                        summary = String(input['prompt']).slice(0, 80);
                    } else {
                        const keys = Object.keys(input);
                        summary = keys.length <= 3
                            ? keys.map(k => `${k}: ${String(input[k]).slice(0, 40)}`).join(', ')
                            : `${keys.length} params`;
                    }
                }
                results.push({ kind: 'tool_use', content: summary, meta: name });
            }
        }
        return results;
    }

}
