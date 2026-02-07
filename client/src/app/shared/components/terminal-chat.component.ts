import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    computed,
    ElementRef,
    ViewChild,
    AfterViewChecked,
} from '@angular/core';
import { renderMarkdown } from '../utils/markdown';

export interface TerminalMessage {
    content: string;
    direction: 'inbound' | 'outbound' | 'status';
    timestamp: Date;
}

export interface ToolEvent {
    toolName: string;
    input: string;
    timestamp: Date;
}

@Component({
    selector: 'app-terminal-chat',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="terminal">
            <div class="terminal__output" #outputEl role="log" aria-label="Chat messages">
                @for (msg of messages(); track msg.timestamp) {
                    <div class="terminal__line" [class.terminal__line--inbound]="msg.direction === 'inbound'"
                         [class.terminal__line--outbound]="msg.direction === 'outbound'"
                         [class.terminal__line--status]="msg.direction === 'status'">
                        <span class="terminal__prompt">{{ msg.direction === 'inbound' ? '> ' : msg.direction === 'status' ? '... ' : 'assistant> ' }}</span>
                        <span class="terminal__text" [innerHTML]="renderMarkdown(msg.content)"></span>
                        <button class="terminal__copy" (click)="copyMessage(msg.content, $index)" aria-label="Copy message">
                            {{ copiedIdx() === $index ? '✓' : 'cp' }}
                        </button>
                    </div>
                }
                @for (tool of toolEvents(); track tool.timestamp) {
                    <details class="terminal__tool">
                        <summary class="terminal__tool-name">tool: {{ tool.toolName }}</summary>
                        <pre class="terminal__tool-input">{{ tool.input }}</pre>
                    </details>
                }
                @if (streamBuffer().length > 0) {
                    <div class="terminal__line terminal__line--outbound terminal__line--streaming">
                        <span class="terminal__prompt">assistant> </span>
                        <span class="terminal__text" [innerHTML]="renderMarkdown(streamBuffer())"></span>
                        @if (!streamDone()) {
                            <span class="terminal__cursor" aria-hidden="true"></span>
                        }
                    </div>
                }
                @if (thinking()) {
                    <div class="terminal__thinking" aria-label="Agent is thinking">
                        <span class="terminal__thinking-dot"></span>
                        <span>thinking...</span>
                    </div>
                }
                @if (messages().length === 0 && !thinking() && streamBuffer().length === 0) {
                    <p class="terminal__empty">No messages yet. Select an agent and send a message.</p>
                }
            </div>
            <div class="terminal__input-area">
                <span class="terminal__input-prompt">> </span>
                <textarea
                    class="terminal__input"
                    [placeholder]="inputDisabled() ? 'Select an agent...' : 'Type a message...'"
                    [disabled]="inputDisabled()"
                    [value]="inputValue()"
                    (input)="onInput($event)"
                    (keydown)="onKeydown($event)"
                    [rows]="inputRows()"
                    aria-label="Chat message input"
                    #inputEl
                ></textarea>
            </div>
        </div>
    `,
    styles: `
        .terminal {
            display: flex;
            flex-direction: column;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            background: #0d1117;
            font-family: 'Dogica Pixel', 'Dogica', monospace;
            font-size: 0.8rem;
            line-height: 1.6;
            overflow: hidden;
            height: 100%;
        }
        .terminal__output {
            flex: 1;
            padding: 1rem;
            min-height: 0;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
        }
        .terminal__line {
            margin-bottom: 0.5rem;
            word-break: break-word;
            white-space: pre-wrap;
            position: relative;
            padding-right: 2rem;
        }
        .terminal__line--inbound .terminal__prompt { color: var(--accent-cyan); }
        .terminal__line--outbound .terminal__prompt { color: #7ee787; }
        .terminal__line--status .terminal__prompt { color: var(--accent-amber, #ffaa00); }
        .terminal__line--status { opacity: 0.7; font-style: italic; }
        .terminal__line--streaming { opacity: 0.9; }
        .terminal__prompt { font-weight: 700; user-select: none; }
        .terminal__text { color: #c9d1d9; }
        .terminal__text :global(code) {
            background: #161b22;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 0.78rem;
            color: #f0883e;
        }
        .terminal__text :global(pre) {
            background: #161b22;
            padding: 0.75rem;
            border-radius: var(--radius);
            border: 1px solid #30363d;
            overflow-x: auto;
            margin: 0.5rem 0;
        }
        .terminal__text :global(pre code) {
            background: none;
            padding: 0;
            color: #c9d1d9;
        }
        .terminal__text :global(strong) { color: #f0f6fc; font-weight: 600; }
        .terminal__text :global(em) { font-style: italic; }
        .terminal__text :global(del) { text-decoration: line-through; opacity: 0.6; }
        .terminal__text :global(.md-h) { font-weight: 700; color: #f0f6fc; margin: 0.4em 0 0.2em; }
        .terminal__text :global(.md-h1) { font-size: 1.1em; }
        .terminal__text :global(.md-h2) { font-size: 1em; }
        .terminal__text :global(.md-h3) { font-size: 0.95em; color: var(--accent-cyan, #58a6ff); }
        .terminal__text :global(.md-link) { color: var(--accent-cyan, #58a6ff); text-decoration: underline; }
        .terminal__text :global(.md-link:hover) { color: #f0f6fc; }
        .terminal__text :global(.md-blockquote) {
            border-left: 3px solid var(--accent-cyan, #58a6ff);
            padding: 0.2rem 0.6rem;
            margin: 0.4rem 0;
            color: #8b949e;
            font-style: italic;
        }
        .terminal__text :global(.md-hr) { border: none; border-top: 1px solid #30363d; margin: 0.5rem 0; }
        .terminal__text :global(.md-list) { margin: 0.25rem 0; padding-left: 1.5rem; }
        .terminal__text :global(.md-list li) { margin: 0.1rem 0; }
        .terminal__text :global(.md-codeblock) {
            background: #161b22;
            padding: 0.75rem;
            border-radius: var(--radius, 6px);
            border: 1px solid #30363d;
            overflow-x: auto;
            margin: 0.5rem 0;
        }
        .terminal__text :global(.md-codeblock code) { background: none; padding: 0; color: #c9d1d9; }
        .terminal__text :global(.md-table) { border-collapse: collapse; margin: 0.4rem 0; font-size: 0.9em; }
        .terminal__text :global(.md-table th),
        .terminal__text :global(.md-table td) { border: 1px solid #30363d; padding: 0.25rem 0.5rem; }
        .terminal__text :global(.md-table th) { background: #161b22; font-weight: 700; color: #f0f6fc; }
        .terminal__text :global(.md-table td) { color: #c9d1d9; }
        .terminal__copy {
            position: absolute;
            top: 0;
            right: 0;
            background: transparent;
            border: 1px solid #30363d;
            color: #484f58;
            font-family: inherit;
            font-size: 0.65rem;
            padding: 1px 4px;
            border-radius: 3px;
            cursor: pointer;
            transition: opacity 0.15s;
        }
        /* Hover devices: hidden until line hover (existing behavior) */
        @media (hover: hover) {
            .terminal__copy { opacity: 0; }
            .terminal__line:hover .terminal__copy { opacity: 1; }
            .terminal__copy:hover { color: #c9d1d9; border-color: #484f58; }
        }
        /* Touch devices: always subtly visible, full opacity on tap */
        @media (hover: none) {
            .terminal__copy { opacity: 0.4; }
            .terminal__copy:active { opacity: 1; }
        }
        .terminal__cursor {
            display: inline-block;
            width: 7px;
            height: 1em;
            background: #7ee787;
            animation: blink 1s step-end infinite;
            vertical-align: text-bottom;
            margin-left: 1px;
        }
        @keyframes blink {
            50% { opacity: 0; }
        }
        .terminal__tool {
            margin: 0.25rem 0;
            color: #8b949e;
        }
        .terminal__tool-name {
            cursor: pointer;
            font-size: 0.75rem;
            color: #f0883e;
            user-select: none;
        }
        .terminal__tool-name:hover { color: #f0f6fc; }
        .terminal__tool-input {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: var(--radius);
            padding: 0.5rem;
            font-size: 0.75rem;
            color: #8b949e;
            overflow-x: auto;
            margin: 0.25rem 0 0;
        }
        .terminal__thinking {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #8b949e;
            font-size: 0.75rem;
            padding: 0.25rem 0;
        }
        .terminal__thinking-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #f0883e;
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
        }
        .terminal__empty {
            color: #484f58;
            margin: 0;
            font-style: italic;
        }
        .terminal__input-area {
            display: flex;
            align-items: flex-start;
            border-top: 1px solid #30363d;
            padding: 0.75rem 1rem;
            background: #0d1117;
        }
        .terminal__input-prompt {
            color: var(--accent-cyan);
            font-weight: 700;
            padding-top: 2px;
            user-select: none;
        }
        .terminal__input {
            flex: 1;
            background: transparent;
            border: none;
            color: #c9d1d9;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            resize: none;
            outline: none;
            padding: 0 0 0 0.25rem;
            min-height: 1.6em;
        }
        .terminal__input::placeholder { color: #484f58; }
        .terminal__input:disabled { opacity: 0.3; }
    `,
})
export class TerminalChatComponent implements AfterViewChecked {
    readonly messages = input<TerminalMessage[]>([]);
    readonly streamBuffer = input('');
    readonly streamDone = input(false);
    readonly thinking = input(false);
    readonly toolEvents = input<ToolEvent[]>([]);
    readonly inputDisabled = input(false);

    readonly messageSent = output<string>();
    readonly rewardSent = output<number>();

    @ViewChild('outputEl') private outputEl?: ElementRef<HTMLElement>;
    @ViewChild('inputEl') private inputEl?: ElementRef<HTMLTextAreaElement>;

    protected readonly inputValue = signal('');
    protected readonly inputRows = computed(() => {
        const lines = this.inputValue().split('\n').length;
        return Math.min(Math.max(lines, 1), 6);
    });

    private shouldScroll = true;

    ngAfterViewChecked(): void {
        if (this.shouldScroll && this.outputEl) {
            const el = this.outputEl.nativeElement;
            el.scrollTop = el.scrollHeight;
            this.shouldScroll = false;
        }
    }

    protected onInput(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.inputValue.set(textarea.value);
    }

    protected onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.send();
        }
    }

    protected readonly copiedIdx = signal<number | null>(null);

    protected copyMessage(content: string, idx: number): void {
        navigator.clipboard.writeText(content).then(() => {
            this.copiedIdx.set(idx);
            setTimeout(() => this.copiedIdx.set(null), 1500);
        });
    }

    protected renderMarkdown(text: string): string {
        return renderMarkdown(text);
    }

    private send(): void {
        const content = this.inputValue().trim();
        if (!content) return;

        this.inputValue.set('');
        if (this.inputEl) {
            this.inputEl.nativeElement.value = '';
        }
        this.shouldScroll = true;
        this.messageSent.emit(content);
    }
}

