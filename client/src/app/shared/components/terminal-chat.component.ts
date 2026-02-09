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
            <div class="terminal__output" #outputEl role="log" aria-label="Chat messages">
                @for (msg of messages(); track msg.timestamp) {
                    <div class="terminal__line" [class.terminal__line--inbound]="msg.direction === 'inbound'"
                         [class.terminal__line--outbound]="msg.direction === 'outbound'"
                         [class.terminal__line--status]="msg.direction === 'status'">
                        <span class="terminal__prompt">{{ msg.direction === 'inbound' ? '> ' : msg.direction === 'status' ? '... ' : 'assistant> ' }}</span>
                        <span class="terminal__text" [innerHTML]="renderMarkdown(msg.content)"></span>
                        <button class="terminal__copy" (click)="copyMessage(msg.content)" aria-label="Copy message">cp</button>
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
        .terminal__empty :global(code) {
            background: #161b22;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 0.78rem;
            color: #f0883e;
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
            width: 22px;
            height: 22px;
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

        /* Autocomplete overlay */
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
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
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
                this.autocompleteIndex.set((idx + 1) % items.length);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.autocompleteIndex.set((idx - 1 + items.length) % items.length);
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

/**
 * Lightweight markdown renderer for terminal chat.
 * Handles: bold, inline code, code blocks, line breaks.
 */
function renderLightMarkdown(text: string): string {
    // Escape HTML
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**...**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}
