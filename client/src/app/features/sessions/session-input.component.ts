import { Component, ChangeDetectionStrategy, output, signal, input, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-session-input',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        <div class="input-bar">
            <label for="messageInput" class="sr-only">Send message to session</label>
            <textarea
                #inputEl
                id="messageInput"
                class="input-bar__field"
                [(ngModel)]="messageText"
                [disabled]="disabled()"
                placeholder="Type a message..."
                rows="1"
                (keydown.enter)="onEnter($event)"
                aria-label="Message input">
            </textarea>
            <button
                class="input-bar__send"
                (click)="onSend()"
                [disabled]="disabled() || messageText().trim().length === 0"
                aria-label="Send message">
                Send
            </button>
        </div>
    `,
    styles: `
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
        .input-bar {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            background: var(--bg-surface);
            border-top: 1px solid var(--border);
        }
        .input-bar__field {
            flex: 1;
            padding: 0.5rem 0.75rem;
            background: var(--bg-input);
            color: var(--text-primary);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-family: inherit;
            font-size: 0.85rem;
            resize: none;
        }
        .input-bar__field:focus { outline: none; border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); }
        .input-bar__field:disabled { opacity: 0.4; }
        .input-bar__send {
            padding: 0.5rem 1rem;
            background: transparent;
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius);
            font-weight: 600;
            cursor: pointer;
            font-size: 0.8rem;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .input-bar__send:hover:not(:disabled) { background: var(--accent-cyan-dim); box-shadow: var(--glow-cyan); }
        .input-bar__send:disabled { opacity: 0.3; cursor: not-allowed; }
    `,
})
export class SessionInputComponent {
    readonly disabled = input(false);
    readonly messageSent = output<string>();

    protected readonly messageText = signal('');
    private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('inputEl');

    protected onSend(): void {
        const text = this.messageText().trim();
        if (!text) return;
        this.messageSent.emit(text);
        this.messageText.set('');
        this.inputEl()?.nativeElement.focus();
    }

    protected onEnter(event: Event): void {
        const keyEvent = event as KeyboardEvent;
        if (!keyEvent.shiftKey) {
            keyEvent.preventDefault();
            this.onSend();
        }
    }
}
