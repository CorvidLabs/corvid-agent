import { Component, ChangeDetectionStrategy, output, signal, input, ElementRef, viewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
    selector: 'app-session-input',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, MatInputModule, MatButtonModule, MatFormFieldModule],
    template: `
        <div class="input-bar" [class.input-bar--focused]="focused()">
            <div class="input-bar__wrapper">
                <mat-form-field appearance="outline" class="input-bar__form-field" subscriptSizing="dynamic">
                    <textarea
                        matInput
                        #inputEl
                        id="messageInput"
                        [(ngModel)]="messageText"
                        [disabled]="disabled()"
                        [placeholder]="placeholder()"
                        rows="1"
                        (keydown.enter)="onEnter($event)"
                        (input)="autoResize()"
                        (focus)="focused.set(true)"
                        (blur)="focused.set(false)"
                        aria-label="Send message to session"
                        class="input-bar__field">
                    </textarea>
                </mat-form-field>
                <div class="input-bar__hints">
                    @if (messageText().trim().length > 0) {
                        <span class="input-bar__char-count" [class.input-bar__char-count--warn]="messageText().length > 8000">{{ messageText().length | number }}</span>
                    }
                    <kbd class="input-bar__kbd">Shift+Enter</kbd>
                    <span class="input-bar__kbd-label">new line</span>
                </div>
            </div>
            <button
                mat-stroked-button
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
        .input-bar {
            display: flex;
            gap: 0.5rem;
            padding: var(--space-3) var(--space-4);
            background: var(--bg-surface);
            border-top: 1px solid var(--border);
            transition: border-color 0.2s;
            align-items: flex-end;
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
        .input-bar__form-field {
            width: 100%;
        }
        .input-bar__form-field .mdc-notched-outline__leading,
        .input-bar__form-field .mdc-notched-outline__notch,
        .input-bar__form-field .mdc-notched-outline__trailing {
            border-color: var(--border-bright) !important;
        }
        .input-bar__form-field:focus-within .mdc-notched-outline__leading,
        .input-bar__form-field:focus-within .mdc-notched-outline__notch,
        .input-bar__form-field:focus-within .mdc-notched-outline__trailing {
            border-color: var(--accent-cyan) !important;
        }
        .input-bar__field {
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.85rem;
            resize: none;
            max-height: 150px;
            overflow-y: auto;
        }
        .input-bar__field::placeholder { color: var(--text-tertiary); }
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
            font-size: var(--text-xxs);
            color: var(--text-tertiary);
            font-variant-numeric: tabular-nums;
            margin-right: auto;
        }
        .input-bar__char-count--warn {
            color: var(--accent-amber);
        }
        .input-bar__kbd {
            font-size: var(--text-micro);
            padding: 1px 4px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-raised);
            color: var(--text-tertiary);
            font-family: inherit;
        }
        .input-bar__kbd-label {
            font-size: var(--text-micro);
            color: var(--text-tertiary);
        }
        .input-bar__send.mat-mdc-button-base {
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
            font-weight: 600;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            align-self: flex-end;
            margin-bottom: 1px;
            flex-shrink: 0;
        }
        .input-bar__send.mat-mdc-button-base:hover:not(:disabled) {
            background: var(--accent-cyan-dim);
            box-shadow: var(--glow-cyan);
        }
        .input-bar__send.mat-mdc-button-base:active:not(:disabled) { transform: scale(0.97); }
        .input-bar__send.mat-mdc-button-base:disabled { opacity: 0.3; }
        .input-bar__send-icon { font-size: var(--text-xxs); }

        /* Mobile: tighter input bar */
        @media (max-width: 767px) {
            .input-bar {
                padding: var(--space-2);
                gap: 0.375rem;
            }
            .input-bar__field {
                padding: 0.375rem var(--space-2);
                font-size: 0.8rem;
            }
            .input-bar__send {
                padding: 0.375rem var(--space-3);
                font-size: 0.7rem;
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
