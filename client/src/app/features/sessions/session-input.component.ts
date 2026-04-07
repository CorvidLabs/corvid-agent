import { Component, ChangeDetectionStrategy, output, signal, input, ElementRef, viewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

@Component({
    selector: 'app-session-input',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe],
    template: `
        <div class="input-bar" [class.input-bar--focused]="focused()">
            <label for="messageInput" class="sr-only">Send message to session</label>
            <div class="input-bar__wrapper">
                <textarea
                    #inputEl
                    id="messageInput"
                    class="input-bar__field"
                    [(ngModel)]="messageText"
                    [disabled]="disabled()"
                    [placeholder]="placeholder()"
                    rows="1"
                    (keydown.enter)="onEnter($event)"
                    (input)="autoResize()"
                    (focus)="focused.set(true)"
                    (blur)="focused.set(false)"
                    aria-label="Message input">
                </textarea>
                <div class="input-bar__hints">
                    @if (messageText().trim().length > 0) {
                        <span class="input-bar__char-count" [class.input-bar__char-count--warn]="messageText().length > 8000">{{ messageText().length | number }}</span>
                    }
                    <kbd class="input-bar__kbd">Shift+Enter</kbd>
                    <span class="input-bar__kbd-label">new line</span>
                </div>
            </div>
            <button
                class="input-bar__send"
                (click)="onSend()"
                [disabled]="disabled() || messageText().trim().length === 0"
                aria-label="Send message">
                <span class="input-bar__send-icon" aria-hidden="true">&#9654;</span>
                Send
            </button>
        </div>
    `,
    styles: `
        :host {
            display: block;
            flex-shrink: 0;
        }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
        .input-bar {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            background: var(--bg-surface);
            border-top: 1px solid var(--border);
            transition: border-color 0.2s;
        }
        .input-bar--focused {
            border-top-color: var(--accent-cyan-border);
        }
        .input-bar__wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        .input-bar__field {
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: var(--bg-input);
            color: var(--text-primary);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-family: inherit;
            font-size: var(--text-sm);
            resize: none;
            max-height: 150px;
            overflow-y: auto;
            transition: height 0.1s ease, border-color 0.15s;
            box-sizing: border-box;
        }
        .input-bar__field:focus { outline: none; border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); }
        .input-bar__field:disabled { opacity: 0.4; }
        .input-bar__hints {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            opacity: 0;
            transition: opacity 0.15s;
            pointer-events: none;
        }
        .input-bar--focused .input-bar__hints,
        .input-bar:hover .input-bar__hints {
            opacity: 1;
        }
        .input-bar__char-count {
            font-size: var(--text-3xs);
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
            margin-right: auto;
        }
        .input-bar__char-count--warn {
            color: var(--accent-amber);
        }
        .input-bar__kbd {
            font-size: var(--text-4xs);
            padding: 1px 4px;
            border: 1px solid var(--border);
            border-radius: 3px;
            background: var(--bg-raised);
            color: var(--text-tertiary);
            font-family: inherit;
        }
        .input-bar__kbd-label {
            font-size: var(--text-4xs);
            color: var(--text-tertiary);
        }
        .input-bar__send {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.5rem 1rem;
            background: transparent;
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius);
            font-weight: 600;
            cursor: pointer;
            font-size: var(--text-caption);
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
            align-self: flex-end;
        }
        .input-bar__send:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .input-bar__send:active:not(:disabled) { transform: scale(0.97); }
        .input-bar__send:disabled { opacity: 0.3; cursor: not-allowed; }
        .input-bar__send-icon { font-size: var(--text-2xs); }

        /* Mobile: tighter input bar */
        @media (max-width: 767px) {
            .input-bar {
                padding: 0.5rem;
                gap: 0.375rem;
            }
            .input-bar__field {
                padding: 0.375rem 0.5rem;
                font-size: var(--text-caption);
            }
            .input-bar__send {
                padding: 0.375rem 0.75rem;
                font-size: var(--text-xxs);
            }
            .input-bar__hints { display: none; }
        }
    `,
})
export class SessionInputComponent implements AfterViewInit {
    readonly disabled = input(false);
    readonly placeholder = input('Type a message...');
    readonly messageSent = output<string>();

    protected readonly messageText = signal('');
    protected readonly focused = signal(false);
    private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');

    ngAfterViewInit(): void {
        this.autoResize();
    }

    protected autoResize(): void {
        const el = this.inputEl()?.nativeElement;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }

    protected onSend(): void {
        const text = this.messageText().trim();
        if (!text) return;
        this.messageSent.emit(text);
        this.messageText.set('');
        this.inputEl()?.nativeElement.focus();
        // Reset height after clearing
        requestAnimationFrame(() => this.autoResize());
    }

    protected onEnter(event: Event): void {
        const keyEvent = event as KeyboardEvent;
        if (!keyEvent.shiftKey) {
            keyEvent.preventDefault();
            this.onSend();
        }
    }
}
