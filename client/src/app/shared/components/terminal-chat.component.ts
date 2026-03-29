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
    effect,
} from '@angular/core';
import type { CommandDef } from '../../../../../shared/command-defs';

export interface TerminalMessage {
    content: string;
    direction: 'inbound' | 'outbound' | 'status';
    timestamp: Date;
    /** Optional delivery status shown as a subtle icon after the message. */
    status?: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface ToolEvent {
    toolName: string;
    input: string;
    timestamp: Date;
}

/** Item shown in the autocomplete dropdown. */
interface AutocompleteItem {
    label: string;
    description: string;
    /** The text to insert when selected. */
    insertText: string;
    kind: 'command' | 'agent';
}

@Component({
    selector: 'app-terminal-chat',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="terminal">
            <div class="terminal__output" #outputEl role="log" aria-label="Chat messages"
                 (click)="onOutputClick($event)">
                @for (msg of messages(); track msg.timestamp; let i = $index) {
                    @if (shouldShowDateSeparator(i)) {
                        <div class="terminal__date-sep" role="separator" aria-hidden="true">
                            <span>{{ formatDate(msg.timestamp) }}</span>
                        </div>
                    }
                    <div class="terminal__line"
                         [class.terminal__line--inbound]="msg.direction === 'inbound'"
                         [class.terminal__line--outbound]="msg.direction === 'outbound'"
                         [class.terminal__line--status]="msg.direction === 'status'">
                        <span class="terminal__prompt">{{ promptFor(msg.direction) }}</span>
                        <span class="terminal__text" [innerHTML]="renderMarkdown(msg.content)"></span>
                        <span class="terminal__line-actions">
                            @if (msg.status) {
                                <span class="terminal__status"
                                      [attr.data-status]="msg.status"
                                      [title]="msg.status">{{ statusIcon(msg.status) }}</span>
                            }
                            <button class="terminal__copy"
                                    (click)="copyMessage(msg.content)"
                                    aria-label="Copy message">cp</button>
                        </span>
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
                    <div class="terminal__thinking" aria-live="polite">
                        <span class="terminal__typing-dot"></span>
                        <span class="terminal__typing-dot"></span>
                        <span class="terminal__typing-dot"></span>
                        <span>thinking...</span>
                    </div>
                }
                @if (messages().length === 0 && !thinking() && streamBuffer().length === 0) {
                    <p class="terminal__empty">No messages yet. Type <code>/help</code> for commands or send a message.</p>
                }
            </div>
            <div class="terminal__input-area">
                <span class="terminal__input-prompt">> </span>
                <div class="terminal__input-wrapper">
                    @if (showAutocomplete() && autocompleteItems().length > 0) {
                        <div class="autocomplete" role="listbox" aria-label="Autocomplete suggestions">
                            @for (item of autocompleteItems(); track item.label; let i = $index) {
                                <div
                                    class="autocomplete__item"
                                    [class.autocomplete__item--active]="i === autocompleteIndex()"
                                    [attr.data-kind]="item.kind"
                                    role="option"
                                    [attr.aria-selected]="i === autocompleteIndex()"
                                    (mousedown)="selectAutocomplete(item, $event)"
                                    (mouseenter)="autocompleteIndex.set(i)"
                                >
                                    <span class="autocomplete__label">{{ item.label }}</span>
                                    <span class="autocomplete__desc">{{ item.description }}</span>
                                </div>
                            }
                        </div>
                    }
                    <textarea
                        class="terminal__input"
                        [placeholder]="inputDisabled() ? 'Select an agent...' : 'Type / for commands, @ for agents...'"
                        [disabled]="inputDisabled()"
                        [value]="inputValue()"
                        (input)="onInput($event)"
                        (keydown)="onKeydown($event)"
                        (blur)="onBlur()"
                        [rows]="inputRows()"
                        aria-label="Chat message input"
                        #inputEl
                    ></textarea>
                </div>
                <button
                    class="terminal__help-btn"
                    (click)="toggleHelp()"
                    aria-label="Show command help"
                    title="Show available commands"
                >?</button>
            </div>
        </div>
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        }
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
            flex: 1;
            min-height: 0;
        }
        .terminal__output {
            flex: 1;
            padding: 1rem;
            min-height: 0;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
        }

        /* ── Date separator ─────────────────────────────── */
        .terminal__date-sep {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin: 0.75rem 0 0.5rem;
            color: #484f58;
            font-size: 0.65rem;
        }
        .terminal__date-sep::before,
        .terminal__date-sep::after {
            content: '';
            flex: 1;
            height: 1px;
            background: #21262d;
        }

        /* ── Message lines ──────────────────────────────── */
        .terminal__line {
            margin-bottom: 0.5rem;
            word-break: break-word;
            white-space: pre-wrap;
            position: relative;
            display: flex;
            flex-wrap: wrap;
            align-items: flex-start;
            gap: 0;
            animation: msg-enter 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes msg-enter {
            from {
                opacity: 0;
                transform: translateY(5px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .terminal__line--inbound .terminal__prompt { color: var(--accent-cyan); }
        .terminal__line--outbound .terminal__prompt { color: #7ee787; }
        .terminal__line--status .terminal__prompt { color: var(--accent-amber, #ffaa00); }
        .terminal__line--status { opacity: 0.7; font-style: italic; }
        .terminal__line--streaming { opacity: 0.9; }
        .terminal__prompt { font-weight: 700; user-select: none; flex-shrink: 0; }
        .terminal__text {
            color: #c9d1d9;
            flex: 1;
            min-width: 0;
        }

        /* ── Inline code + pre blocks ───────────────────── */
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
            white-space: pre;
        }
        .terminal__text :global(pre code) {
            background: none;
            padding: 0;
            color: #c9d1d9;
        }
        .terminal__text :global(strong) { color: #f0f6fc; font-weight: 600; }
        .terminal__text :global(em) { color: #a8b5c8; font-style: italic; }
        .terminal__text :global(h1),
        .terminal__text :global(h2),
        .terminal__text :global(h3) {
            color: #f0f6fc;
            font-size: 0.85rem;
            font-weight: 700;
            margin: 0.5rem 0 0.25rem;
            border-bottom: 1px solid #21262d;
            padding-bottom: 0.2rem;
        }
        .terminal__text :global(ul),
        .terminal__text :global(ol) {
            padding-left: 1.25rem;
            margin: 0.25rem 0;
        }
        .terminal__text :global(li) { margin: 0.1rem 0; }
        .terminal__text :global(blockquote) {
            border-left: 3px solid #30363d;
            padding-left: 0.75rem;
            color: #8b949e;
            margin: 0.25rem 0;
        }
        .terminal__text :global(hr) {
            border: none;
            border-top: 1px solid #21262d;
            margin: 0.5rem 0;
        }
        .terminal__text :global(a) {
            color: #58a6ff;
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        /* ── Code blocks with syntax highlight + copy btn ─ */
        .terminal__text :global(.code-block) {
            margin: 0.5rem 0;
            border-radius: var(--radius);
            border: 1px solid #30363d;
            overflow: hidden;
        }
        .terminal__text :global(.code-block__bar) {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #161b22;
            padding: 0.3rem 0.75rem;
            border-bottom: 1px solid #30363d;
        }
        .terminal__text :global(.code-block__lang) {
            color: #8b949e;
            font-size: 0.68rem;
            text-transform: lowercase;
        }
        .terminal__text :global(.code-block__copy-btn) {
            background: transparent;
            border: 1px solid #30363d;
            color: #484f58;
            font-family: inherit;
            font-size: 0.65rem;
            padding: 2px 8px;
            border-radius: 3px;
            cursor: pointer;
            transition: color 0.1s, border-color 0.1s;
            min-height: 24px;
        }
        .terminal__text :global(.code-block__copy-btn:hover) {
            color: #c9d1d9;
            border-color: #484f58;
        }
        .terminal__text :global(.code-block pre) {
            background: #0d1117;
            padding: 0.75rem;
            margin: 0;
            border-radius: 0;
            border: none;
            overflow-x: auto;
        }
        .terminal__text :global(.code-block pre code) {
            background: none;
            padding: 0;
            font-size: 0.75rem;
        }

        /* ── Syntax highlight tokens (GitHub dark palette) ─ */
        .terminal__text :global(.hl-cmt) { color: #8b949e; font-style: italic; }
        .terminal__text :global(.hl-str) { color: #a5d6ff; }
        .terminal__text :global(.hl-kw)  { color: #ff7b72; }
        .terminal__text :global(.hl-num) { color: #79c0ff; }
        .terminal__text :global(.hl-fn)  { color: #d2a8ff; }
        .terminal__text :global(.hl-prop){ color: #7ee787; }

        /* ── Message actions (status + copy) ────────────── */
        .terminal__line-actions {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            flex-shrink: 0;
            margin-left: 0.25rem;
        }
        .terminal__status {
            font-size: 0.6rem;
            color: #484f58;
            user-select: none;
        }
        .terminal__status[data-status="read"] { color: var(--accent-cyan, #00e5ff); }
        .terminal__status[data-status="delivered"] { color: #7ee787; }
        .terminal__status[data-status="sent"] { color: #8b949e; }
        .terminal__copy {
            background: transparent;
            border: 1px solid #30363d;
            color: #484f58;
            font-family: inherit;
            font-size: 0.65rem;
            padding: 2px 6px;
            min-width: 32px;
            min-height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            cursor: pointer;
            transition: opacity 0.15s;
        }
        /* Hover devices: hidden until line hover */
        @media (hover: hover) {
            .terminal__copy { opacity: 0; }
            .terminal__line:hover .terminal__copy { opacity: 1; }
            .terminal__copy:hover { color: #c9d1d9; border-color: #484f58; }
        }
        /* Touch devices: always subtly visible */
        @media (hover: none) {
            .terminal__copy { opacity: 0.4; }
            .terminal__copy:active { opacity: 1; }
        }
        /* Mobile */
        @media (max-width: 480px) {
            .terminal__output { padding: 0.5rem; }
            .terminal__input-area { padding: 0.5rem 0.75rem; }
        }

        /* ── Blinking cursor ────────────────────────────── */
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

        /* ── Tool events ────────────────────────────────── */
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

        /* ── Typing indicator (3 bouncing dots) ─────────── */
        .terminal__thinking {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #8b949e;
            font-size: 0.75rem;
            padding: 0.25rem 0;
            margin-bottom: 0.5rem;
        }
        .terminal__typing-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #7ee787;
            animation: typing-bounce 1.2s ease-in-out infinite;
            flex-shrink: 0;
        }
        .terminal__typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .terminal__typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing-bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
            30% { transform: translateY(-5px); opacity: 1; }
        }

        /* ── Empty state ────────────────────────────────── */
        .terminal__empty {
            color: #484f58;
            margin: 0;
            font-style: italic;
        }
        .terminal__empty :global(code) {
            background: #161b22;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 0.78rem;
            color: #f0883e;
        }

        /* ── Input area ─────────────────────────────────── */
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
        .terminal__input-wrapper {
            flex: 1;
            position: relative;
        }
        .terminal__input {
            width: 100%;
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
        .terminal__help-btn {
            background: transparent;
            border: 1px solid #30363d;
            color: #484f58;
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 700;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 0.5rem;
            margin-top: 1px;
            transition: color 0.15s, border-color 0.15s;
            flex-shrink: 0;
        }
        .terminal__help-btn:hover {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
        }

        /* ── Autocomplete overlay ───────────────────────── */
        .autocomplete {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            max-height: 220px;
            overflow-y: auto;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: var(--radius, 6px);
            box-shadow: 0 4px 16px var(--shadow-deep);
            z-index: 10;
            margin-bottom: 4px;
            scrollbar-width: thin;
            scrollbar-color: #30363d transparent;
        }
        .autocomplete__item {
            display: flex;
            align-items: baseline;
            gap: 0.75rem;
            padding: 0.4rem 0.75rem;
            cursor: pointer;
            transition: background 0.1s;
        }
        .autocomplete__item:hover,
        .autocomplete__item--active {
            background: #1c2128;
        }
        .autocomplete__item--active {
            border-left: 2px solid var(--accent-cyan, #00e5ff);
        }
        .autocomplete__label {
            color: #f0f6fc;
            font-weight: 600;
            font-size: 0.78rem;
            white-space: nowrap;
        }
        .autocomplete__item[data-kind="command"] .autocomplete__label {
            color: var(--accent-cyan, #00e5ff);
        }
        .autocomplete__item[data-kind="agent"] .autocomplete__label {
            color: var(--accent-magenta, #ff00aa);
        }
        .autocomplete__desc {
            color: #8b949e;
            font-size: 0.7rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ── Reduced motion ─────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
            .terminal__line { animation: none; }
            .terminal__typing-dot { animation: none; opacity: 0.8; }
            .terminal__cursor { animation: none; }
        }
    `,
})
export class TerminalChatComponent implements AfterViewChecked {
    readonly messages = input<TerminalMessage[]>([]);
    readonly streamBuffer = input('');
    readonly streamDone = input(false);
    readonly thinking = input(false);
    readonly toolEvents = input<ToolEvent[]>([]);
    readonly inputDisabled = input(false);

    /** Command definitions for autocomplete (passed from parent). */
    readonly commandDefs = input<CommandDef[]>([]);
    /** Agent names for @mention autocomplete (passed from parent). */
    readonly agentNames = input<string[]>([]);

    readonly messageSent = output<string>();
    readonly rewardSent = output<number>();

    @ViewChild('outputEl') private outputEl?: ElementRef<HTMLElement>;
    @ViewChild('inputEl') private inputEl?: ElementRef<HTMLTextAreaElement>;

    protected readonly inputValue = signal('');
    protected readonly inputRows = computed(() => {
        const lines = this.inputValue().split('\n').length;
        return Math.min(Math.max(lines, 1), 6);
    });

    // Autocomplete state
    protected readonly showAutocomplete = signal(false);
    protected readonly autocompleteIndex = signal(0);
    protected readonly autocompleteItems = signal<AutocompleteItem[]>([]);

    private shouldScroll = true;
    /** Track the autocomplete trigger: 'command' for /, 'agent' for @ */
    private autocompleteTrigger: 'command' | 'agent' | null = null;

    constructor() {
        // React to input changes for autocomplete
        effect(() => {
            const value = this.inputValue();
            this.updateAutocomplete(value);
        });
    }

    ngAfterViewChecked(): void {
        if (this.shouldScroll && this.outputEl) {
            const el = this.outputEl.nativeElement;
            el.scrollTop = el.scrollHeight;
            this.shouldScroll = false;
        }
    }

    protected promptFor(direction: 'inbound' | 'outbound' | 'status'): string {
        if (direction === 'inbound') return '> ';
        if (direction === 'status') return '... ';
        return 'assistant> ';
    }

    protected statusIcon(status: string): string {
        switch (status) {
            case 'sending':
                return '○';
            case 'sent':
                return '✓';
            case 'delivered':
                return '✓✓';
            case 'read':
                return '✓✓';
            default:
                return '';
        }
    }

    /** Returns true when a date separator should appear above message at [index]. */
    protected shouldShowDateSeparator(index: number): boolean {
        if (index === 0) return false;
        const msgs = this.messages();
        const curr = msgs[index];
        const prev = msgs[index - 1];
        if (!curr || !prev) return false;
        return !isSameDay(curr.timestamp, prev.timestamp);
    }

    protected formatDate(date: Date): string {
        const now = new Date();
        if (isSameDay(date, now)) return 'Today';
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (isSameDay(date, yesterday)) return 'Yesterday';
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    /** Event delegation handler for copy buttons inside code blocks. */
    protected onOutputClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const btn = target.closest('[data-copy-code]') as HTMLElement | null;
        if (!btn) return;
        const encoded = btn.getAttribute('data-copy-code');
        if (!encoded) return;
        try {
            const code = decodeURIComponent(atob(encoded));
            navigator.clipboard.writeText(code);
            btn.textContent = 'copied!';
            setTimeout(() => {
                if (btn.isConnected) btn.textContent = 'copy';
            }, 1500);
        } catch {
            // clipboard or decode failure — ignore
        }
    }

    protected onInput(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.inputValue.set(textarea.value);
    }

    protected onKeydown(event: KeyboardEvent): void {
        // Handle autocomplete navigation
        if (this.showAutocomplete() && this.autocompleteItems().length > 0) {
            const items = this.autocompleteItems();
            const idx = this.autocompleteIndex();

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                const nextIdx = (idx + 1) % items.length;
                this.autocompleteIndex.set(nextIdx);
                this.scrollAutocompleteIntoView(nextIdx);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                const prevIdx = (idx - 1 + items.length) % items.length;
                this.autocompleteIndex.set(prevIdx);
                this.scrollAutocompleteIntoView(prevIdx);
                return;
            }
            if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                event.preventDefault();
                this.applyAutocomplete(items[idx]);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                this.dismissAutocomplete();
                return;
            }
        }

        // Normal send
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.send();
        }
    }

    protected onBlur(): void {
        // Delay dismiss so mousedown on autocomplete items can fire first
        setTimeout(() => this.dismissAutocomplete(), 150);
    }

    protected selectAutocomplete(item: AutocompleteItem, event: MouseEvent): void {
        event.preventDefault();
        this.applyAutocomplete(item);
        // Re-focus input after selection
        this.inputEl?.nativeElement.focus();
    }

    protected toggleHelp(): void {
        if (this.showAutocomplete()) {
            this.dismissAutocomplete();
        } else {
            // Show all commands
            const items = this.buildCommandItems('');
            this.autocompleteItems.set(items);
            this.autocompleteIndex.set(0);
            this.showAutocomplete.set(items.length > 0);
            this.autocompleteTrigger = 'command';
        }
    }

    protected copyMessage(content: string): void {
        navigator.clipboard.writeText(content);
    }

    protected renderMarkdown(text: string): string {
        return renderLightMarkdown(text);
    }

    // ── Autocomplete logic ──────────────────────────────────────────────

    private updateAutocomplete(value: string): void {
        // Command autocomplete: triggered when input starts with /
        if (value.startsWith('/')) {
            const search = value.split(/\s/)[0].toLowerCase(); // first word (the command)
            // Only show autocomplete while typing the command name (no space yet)
            if (!value.includes(' ')) {
                const items = this.buildCommandItems(search);
                this.autocompleteItems.set(items);
                this.autocompleteIndex.set(0);
                this.showAutocomplete.set(items.length > 0);
                this.autocompleteTrigger = 'command';
                return;
            }
        }

        // Agent mention autocomplete: triggered by @ in /council context or standalone @
        const atMatch = value.match(/@(\w*)$/);
        if (atMatch) {
            const search = atMatch[1].toLowerCase();
            const items = this.buildAgentItems(search);
            this.autocompleteItems.set(items);
            this.autocompleteIndex.set(0);
            this.showAutocomplete.set(items.length > 0);
            this.autocompleteTrigger = 'agent';
            return;
        }

        // No trigger — dismiss
        this.dismissAutocomplete();
    }

    private buildCommandItems(search: string): AutocompleteItem[] {
        const defs = this.commandDefs();
        return defs
            .filter((d) => d.name.toLowerCase().startsWith(search || '/'))
            .map((d) => ({
                label: d.name,
                description: d.description,
                insertText: d.name + ' ',
                kind: 'command' as const,
            }));
    }

    private buildAgentItems(search: string): AutocompleteItem[] {
        const names = this.agentNames();
        return names
            .filter((n) => n.toLowerCase().startsWith(search))
            .map((n) => ({
                label: `@${n}`,
                description: 'Agent',
                insertText: `@${n} `,
                kind: 'agent' as const,
            }));
    }

    private applyAutocomplete(item: AutocompleteItem): void {
        const value = this.inputValue();

        if (this.autocompleteTrigger === 'command') {
            // Replace the typed command with the selected one
            const rest = value.includes(' ') ? value.slice(value.indexOf(' ')) : '';
            const newValue = item.insertText + rest.trimStart();
            this.setInput(newValue);
        } else if (this.autocompleteTrigger === 'agent') {
            // Replace the @partial at the end with the full @name
            const atIdx = value.lastIndexOf('@');
            const newValue = value.slice(0, atIdx) + item.insertText;
            this.setInput(newValue);
        }

        this.dismissAutocomplete();
    }

    private scrollAutocompleteIntoView(index: number): void {
        // Defer to next frame so the DOM reflects the new active state
        requestAnimationFrame(() => {
            const container = this.inputEl?.nativeElement.parentElement?.querySelector('.autocomplete');
            const active = container?.querySelectorAll('.autocomplete__item')[index] as
                | HTMLElement
                | undefined;
            active?.scrollIntoView({ block: 'nearest' });
        });
    }

    private dismissAutocomplete(): void {
        this.showAutocomplete.set(false);
        this.autocompleteItems.set([]);
        this.autocompleteIndex.set(0);
        this.autocompleteTrigger = null;
    }

    private setInput(value: string): void {
        this.inputValue.set(value);
        if (this.inputEl) {
            this.inputEl.nativeElement.value = value;
            // Move cursor to end
            const len = value.length;
            this.inputEl.nativeElement.setSelectionRange(len, len);
        }
    }

    private send(): void {
        const content = this.inputValue().trim();
        if (!content) return;

        this.inputValue.set('');
        if (this.inputEl) {
            this.inputEl.nativeElement.value = '';
        }
        this.dismissAutocomplete();
        this.shouldScroll = true;
        this.messageSent.emit(content);
    }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function escHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Syntax highlighter ───────────────────────────────────────────────────────

const JS_KEYWORDS = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'do', 'break', 'continue', 'switch', 'case', 'default', 'class', 'extends',
    'new', 'this', 'super', 'import', 'export', 'from', 'as', 'async', 'await',
    'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of',
    'void', 'delete', 'null', 'undefined', 'true', 'false', 'type', 'interface',
    'enum', 'implements', 'abstract', 'static', 'readonly', 'override',
    'public', 'private', 'protected', 'namespace', 'module', 'declare',
];

const PYTHON_KEYWORDS = [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
    'continue', 'pass', 'import', 'from', 'as', 'try', 'except', 'finally',
    'raise', 'with', 'yield', 'lambda', 'and', 'or', 'not', 'in', 'is',
    'None', 'True', 'False', 'async', 'await', 'global', 'nonlocal', 'del',
];

const BASH_KEYWORDS = [
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
    'case', 'esac', 'function', 'return', 'exit', 'echo', 'export',
    'local', 'readonly', 'unset', 'shift', 'source', 'alias',
];

function getKeywordsForLang(lang: string): string[] | null {
    const l = lang.toLowerCase();
    if (['js', 'ts', 'javascript', 'typescript', 'jsx', 'tsx', ''].includes(l)) {
        return JS_KEYWORDS;
    }
    if (['python', 'py'].includes(l)) return PYTHON_KEYWORDS;
    if (['bash', 'sh', 'shell', 'zsh'].includes(l)) return BASH_KEYWORDS;
    return null;
}

/**
 * Tokenizes `code` into spans with CSS classes for syntax highlighting.
 * Uses a combined regex (alternation) to respect token priority.
 */
function highlightCode(code: string, lang: string): string {
    const l = lang.toLowerCase();
    const isJsonLike = l === 'json';
    const hasPyHashComment = ['python', 'py', 'bash', 'sh', 'shell', 'zsh', 'yaml', 'yml', 'toml', 'ini'].includes(l);
    const keywords = getKeywordsForLang(l);

    // Patterns in priority order: earlier = higher priority
    const patterns: Array<[string, RegExp]> = [];

    // Block comment (C-style)
    if (!hasPyHashComment) {
        patterns.push(['cmt', /\/\*[\s\S]*?\*\//]);
    }
    // Line comment
    if (!hasPyHashComment && !isJsonLike) {
        patterns.push(['cmt', /\/\/[^\n]*/]);
    }
    // Hash comment
    if (hasPyHashComment) {
        patterns.push(['cmt', /#[^\n]*/]);
    }

    // Strings (triple-quoted Python first, then regular)
    patterns.push(['str', /"""[\s\S]*?"""/]);
    patterns.push(['str', /'''[\s\S]*?'''/]);
    patterns.push(['str', /"(?:\\.|[^"\\])*"/]);
    patterns.push(['str', /'(?:\\.|[^'\\])*'/]);
    patterns.push(['str', /`(?:\\.|[^`\\])*`/]);

    // Keywords
    if (keywords) {
        patterns.push(['kw', new RegExp(`\\b(${keywords.join('|')})\\b`)]);
    }

    // JSON keys
    if (isJsonLike) {
        patterns.push(['prop', /"(?:[^"\\]|\\.)*"(?=\s*:)/]);
    }

    // Numbers (int, float, hex, binary)
    patterns.push(['num', /\b0[xX][0-9a-fA-F]+\b/]);
    patterns.push(['num', /\b0[bB][01]+\b/]);
    patterns.push(['num', /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/]);

    // Build combined regex
    const combined = new RegExp(
        patterns.map(([, re]) => `(${re.source})`).join('|'),
        'gm',
    );

    const parts: string[] = [];
    let lastIndex = 0;

    for (const match of code.matchAll(combined)) {
        const idx = match.index ?? 0;
        if (idx > lastIndex) {
            parts.push(escHtml(code.slice(lastIndex, idx)));
        }
        const groupIdx = match.slice(1).findIndex((g) => g !== undefined);
        if (groupIdx >= 0) {
            const [type] = patterns[groupIdx];
            parts.push(`<span class="hl-${type}">${escHtml(match[0])}</span>`);
        }
        lastIndex = idx + match[0].length;
    }

    if (lastIndex < code.length) {
        parts.push(escHtml(code.slice(lastIndex)));
    }

    return parts.join('');
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

/**
 * Improved lightweight markdown renderer for terminal chat.
 *
 * Supports: bold, italic, inline code, fenced code blocks (with syntax
 * highlighting + copy button), headers (##), unordered/ordered lists,
 * blockquotes, horizontal rules, and links.
 */
function renderLightMarkdown(text: string): string {
    // ── Fenced code blocks (must go first, before any other substitution) ──
    // Capture the raw code before escaping so the highlighter works correctly.
    const codeBlocks: string[] = [];
    let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
        const trimmed = code.trim();
        const highlighted = highlightCode(trimmed, lang || '');
        const encoded = btoa(encodeURIComponent(trimmed));
        const langLabel = lang || 'code';
        const block = `<div class="code-block"><div class="code-block__bar"><span class="code-block__lang">${escHtml(langLabel)}</span><button class="code-block__copy-btn" data-copy-code="${encoded}" type="button">copy</button></div><pre><code>${highlighted}</code></pre></div>`;
        const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
        codeBlocks.push(block);
        return placeholder;
    });

    // ── Escape HTML in remaining text ──
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // ── Inline code (before bold/italic to avoid misinterpreting `*`) ──
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // ── Horizontal rule ──
    html = html.replace(/^---+$/gm, '<hr>');

    // ── Headers (## Heading, ### Heading) ──
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // ── Blockquote ──
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // ── Unordered list items ──
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');

    // ── Ordered list items ──
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // ── Wrap consecutive <li> in <ul> ──
    html = html.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, (block) => {
        return `<ul>${block}</ul>`;
    });

    // ── Bold (**...**) ──
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

    // ── Italic (*...* or _..._) — avoid matching bold residuals ──
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // ── Links ([text](url)) — only allow http/https/mailto ──
    html = html.replace(
        /\[([^\]]+)\]\(((?:https?|mailto):[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

    // ── Line breaks (preserve \n not inside block elements) ──
    // Replace remaining newlines with <br>, but not after block-level tags
    html = html.replace(/\n(?!<\/?(ul|li|h[123]|blockquote|hr|div))/g, '<br>');

    // ── Restore code blocks ──
    html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);

    return html;
}
