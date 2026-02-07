import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    OnInit,
    OnDestroy,
    ElementRef,
    viewChild,
} from '@angular/core';
import type { ApprovalRequestWire } from '../../core/models/ws-message.model';

export interface ApprovalDecision {
    requestId: string;
    behavior: 'allow' | 'deny';
}

@Component({
    selector: 'app-approval-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="approval-overlay" role="alertdialog" aria-labelledby="approval-title" aria-describedby="approval-desc">
            <div class="approval-dialog" #dialogEl>
                <div class="approval-dialog__header">
                    <h3 id="approval-title">Tool Approval Required</h3>
                    <span class="approval-dialog__timer" [class.approval-dialog__timer--urgent]="remainingSeconds() < 10">
                        {{ remainingSeconds() }}s
                    </span>
                </div>
                <div class="approval-dialog__body" id="approval-desc">
                    <div class="approval-dialog__tool">{{ request().toolName }}</div>
                    <div class="approval-dialog__description">{{ request().description }}</div>
                </div>
                <div class="approval-dialog__actions">
                    <button
                        class="btn btn--allow"
                        (click)="onAllow()"
                        #allowBtn>
                        Allow
                    </button>
                    <button
                        class="btn btn--deny"
                        (click)="onDeny()">
                        Deny
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: `
        .approval-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(2px);
        }
        .approval-dialog {
            background: var(--bg-surface, #1a1a2e);
            border: 1px solid var(--accent-cyan, #00d4ff);
            border-radius: var(--radius, 8px);
            padding: 1.25rem;
            max-width: 480px;
            width: 90vw;
            box-shadow: 0 0 24px rgba(0, 212, 255, 0.15);
        }
        .approval-dialog__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.75rem;
        }
        .approval-dialog__header h3 {
            margin: 0;
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--accent-cyan, #00d4ff);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .approval-dialog__timer {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-secondary, #999);
            font-variant-numeric: tabular-nums;
        }
        .approval-dialog__timer--urgent {
            color: var(--accent-red, #ff3355);
        }
        .approval-dialog__body {
            margin-bottom: 1rem;
        }
        .approval-dialog__tool {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-secondary, #999);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 0.375rem;
        }
        .approval-dialog__description {
            font-size: 0.85rem;
            color: var(--text-primary, #eee);
            word-break: break-word;
            white-space: pre-wrap;
            font-family: 'Dogica Pixel', 'Dogica', monospace;
            background: var(--bg-inset, #0d0d1a);
            padding: 0.625rem;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        .approval-dialog__actions {
            display: flex;
            gap: 0.75rem;
        }
        .btn {
            flex: 1;
            padding: 0.5rem 1rem;
            border-radius: var(--radius, 6px);
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            border: 1px solid;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--allow {
            background: transparent;
            color: var(--accent-green, #22cc88);
            border-color: var(--accent-green, #22cc88);
        }
        .btn--allow:hover {
            background: rgba(34, 204, 136, 0.12);
            box-shadow: 0 0 12px rgba(34, 204, 136, 0.25);
        }
        .btn--allow:focus-visible {
            outline: 2px solid var(--accent-green, #22cc88);
            outline-offset: 2px;
        }
        .btn--deny {
            background: transparent;
            color: var(--accent-red, #ff3355);
            border-color: var(--accent-red, #ff3355);
        }
        .btn--deny:hover {
            background: rgba(255, 51, 85, 0.12);
            box-shadow: 0 0 12px rgba(255, 51, 85, 0.25);
        }
        .btn--deny:focus-visible {
            outline: 2px solid var(--accent-red, #ff3355);
            outline-offset: 2px;
        }
    `,
})
export class ApprovalDialogComponent implements OnInit, OnDestroy {
    readonly request = input.required<ApprovalRequestWire>();
    readonly decided = output<ApprovalDecision>();

    private allowBtn = viewChild<ElementRef<HTMLButtonElement>>('allowBtn');
    private timer: ReturnType<typeof setInterval> | null = null;
    protected readonly remainingSeconds = signal(0);

    ngOnInit(): void {
        const req = this.request();
        const elapsed = Date.now() - req.createdAt;
        const remaining = Math.max(0, req.timeoutMs - elapsed);
        this.remainingSeconds.set(Math.ceil(remaining / 1000));

        this.timer = setInterval(() => {
            const next = this.remainingSeconds() - 1;
            if (next <= 0) {
                this.cleanup();
                // Auto-deny emitted on timeout — the server handles this already,
                // so just dismiss the dialog.
                this.decided.emit({ requestId: req.id, behavior: 'deny' });
            } else {
                this.remainingSeconds.set(next);
            }
        }, 1000);

        // Focus the Allow button for keyboard accessibility
        setTimeout(() => {
            this.allowBtn()?.nativeElement.focus();
        });
    }

    ngOnDestroy(): void {
        this.cleanup();
    }

    protected onAllow(): void {
        this.cleanup();
        this.decided.emit({ requestId: this.request().id, behavior: 'allow' });
    }

    protected onDeny(): void {
        this.cleanup();
        this.decided.emit({ requestId: this.request().id, behavior: 'deny' });
    }

    private cleanup(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
