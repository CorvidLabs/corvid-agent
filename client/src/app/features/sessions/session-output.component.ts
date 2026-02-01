import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, AfterViewChecked } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { StreamEvent } from '../../core/models/ws-message.model';
import type { SessionMessage } from '../../core/models/session.model';

@Component({
    selector: 'app-session-output',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe],
    template: `
        <div class="output" #outputContainer role="log" aria-live="polite" aria-label="Session output">
            @for (msg of messages(); track msg.id) {
                <div class="output__message" [class]="'output__message--' + msg.role">
                    <span class="output__role">{{ msg.role }}</span>
                    <pre class="output__content">{{ msg.content }}</pre>
                    <span class="output__time">{{ msg.timestamp | date:'HH:mm:ss' }}</span>
                </div>
            }

            @for (event of events(); track $index) {
                <div class="output__event">
                    <span class="output__event-type">{{ event.eventType }}</span>
                    <pre class="output__event-data">{{ formatEventData(event.data) }}</pre>
                </div>
            }
        </div>
    `,
    styles: `
        .output {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            background: var(--bg-deep);
            color: var(--text-primary);
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.8rem;
            line-height: 1.6;
            background-image: repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0, 229, 255, 0.01) 2px,
                rgba(0, 229, 255, 0.01) 4px
            );
        }
        .output__message { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
        .output__message--user .output__role { color: var(--accent-cyan); }
        .output__message--assistant .output__role { color: var(--accent-green); }
        .output__message--system .output__role { color: var(--accent-amber); }
        .output__role { font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
        .output__content { margin: 0.25rem 0 0; white-space: pre-wrap; word-break: break-word; }
        .output__time { font-size: 0.65rem; color: var(--text-tertiary); }
        .output__event { padding: 0.25rem 0; }
        .output__event-type { color: var(--text-secondary); font-size: 0.65rem; letter-spacing: 0.05em; }
        .output__event-data { margin: 0; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
    `,
})
export class SessionOutputComponent implements AfterViewChecked {
    readonly messages = input<SessionMessage[]>([]);
    readonly events = input<StreamEvent[]>([]);

    private readonly outputContainer = viewChild<ElementRef<HTMLDivElement>>('outputContainer');

    ngAfterViewChecked(): void {
        const el = this.outputContainer()?.nativeElement;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }

    protected formatEventData(data: unknown): string {
        if (typeof data === 'string') return data;
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }
}
