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
            background: #0f172a;
            color: #e2e8f0;
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 0.8rem;
            line-height: 1.5;
        }
        .output__message { padding: 0.5rem 0; border-bottom: 1px solid #1e293b; }
        .output__message--user .output__role { color: #60a5fa; }
        .output__message--assistant .output__role { color: #34d399; }
        .output__message--system .output__role { color: #fbbf24; }
        .output__role { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
        .output__content { margin: 0.25rem 0 0; white-space: pre-wrap; word-break: break-word; }
        .output__time { font-size: 0.7rem; color: #64748b; }
        .output__event { padding: 0.25rem 0; }
        .output__event-type { color: #94a3b8; font-size: 0.7rem; }
        .output__event-data { margin: 0; color: #cbd5e1; white-space: pre-wrap; word-break: break-word; }
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
