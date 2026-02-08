import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input } from '@angular/core';
import {
    ApprovalDialogComponent,
    ApprovalDecision,
} from './approval-dialog.component';
import type { ApprovalRequestWire } from '../../core/models/ws-message.model';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

/**
 * Test host component that wraps ApprovalDialogComponent,
 * allowing us to set the required `request` input via componentRef.setInput().
 */
@Component({
    selector: 'app-test-host',
    template: `
        <app-approval-dialog
            [request]="request()"
            (decided)="onDecided($event)"
        />
    `,
    imports: [ApprovalDialogComponent],
})
class TestHostComponent {
    readonly request = input.required<ApprovalRequestWire>();
    lastDecision: ApprovalDecision | null = null;

    onDecided(decision: ApprovalDecision): void {
        this.lastDecision = decision;
    }
}

/** Creates a default ApprovalRequestWire with generous timeout. */
function createRequest(
    overrides: Partial<ApprovalRequestWire> = {},
): ApprovalRequestWire {
    return {
        id: 'req-1',
        sessionId: 'sess-1',
        toolName: 'Bash',
        description: 'Execute: rm -rf /tmp/cache',
        createdAt: Date.now(),
        timeoutMs: 30_000,
        ...overrides,
    };
}

describe('ApprovalDialogComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostEl: HTMLElement;

    function createComponent(
        request: ApprovalRequestWire,
    ): ComponentFixture<TestHostComponent> {
        fixture = TestBed.createComponent(TestHostComponent);
        fixture.componentRef.setInput('request', request);
        fixture.componentInstance.lastDecision = null;
        fixture.detectChanges(); // triggers ngOnInit
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false });

        TestBed.configureTestingModule({
            imports: [TestHostComponent, ApprovalDialogComponent],
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    describe('rendering', () => {
        it('should render the dialog title', () => {
            createComponent(createRequest());
            const title = hostEl.querySelector('#approval-title');
            expect(title).toBeTruthy();
            expect(title!.textContent).toContain('Tool Approval Required');
            fixture.destroy();
        });

        it('should display the tool name', () => {
            createComponent(createRequest({ toolName: 'WebFetch' }));
            const tool = hostEl.querySelector('.approval-dialog__tool');
            expect(tool).toBeTruthy();
            expect(tool!.textContent).toContain('WebFetch');
            fixture.destroy();
        });

        it('should display the description', () => {
            createComponent(
                createRequest({ description: 'Fetch https://example.com' }),
            );
            const desc = hostEl.querySelector('.approval-dialog__description');
            expect(desc).toBeTruthy();
            expect(desc!.textContent).toContain('Fetch https://example.com');
            fixture.destroy();
        });

        it('should render Allow and Deny buttons', () => {
            createComponent(createRequest());
            const buttons = hostEl.querySelectorAll('button');
            expect(buttons.length).toBe(2);

            const allowBtn = hostEl.querySelector('.btn--allow');
            const denyBtn = hostEl.querySelector('.btn--deny');
            expect(allowBtn).toBeTruthy();
            expect(denyBtn).toBeTruthy();
            expect(allowBtn!.textContent).toContain('Allow');
            expect(denyBtn!.textContent).toContain('Deny');
            fixture.destroy();
        });

        it('should have the alertdialog ARIA role', () => {
            createComponent(createRequest());
            const overlay = hostEl.querySelector('[role="alertdialog"]');
            expect(overlay).toBeTruthy();
            fixture.destroy();
        });

        it('should display the remaining seconds', () => {
            createComponent(
                createRequest({ timeoutMs: 15_000, createdAt: Date.now() }),
            );
            const timer = hostEl.querySelector('.approval-dialog__timer');
            expect(timer).toBeTruthy();
            expect(timer!.textContent).toContain('15s');
            fixture.destroy();
        });
    });

    // ──────────────────────────────────────────────
    // Actions
    // ──────────────────────────────────────────────
    describe('approve/deny actions', () => {
        it('should emit allow decision when Allow button is clicked', () => {
            createComponent(createRequest({ id: 'req-allow' }));

            const allowBtn =
                hostEl.querySelector<HTMLButtonElement>('.btn--allow')!;
            allowBtn.click();
            fixture.detectChanges();

            const decision = fixture.componentInstance.lastDecision;
            expect(decision).toBeTruthy();
            expect(decision!.requestId).toBe('req-allow');
            expect(decision!.behavior).toBe('allow');
            fixture.destroy();
        });

        it('should emit deny decision when Deny button is clicked', () => {
            createComponent(createRequest({ id: 'req-deny' }));

            const denyBtn =
                hostEl.querySelector<HTMLButtonElement>('.btn--deny')!;
            denyBtn.click();
            fixture.detectChanges();

            const decision = fixture.componentInstance.lastDecision;
            expect(decision).toBeTruthy();
            expect(decision!.requestId).toBe('req-deny');
            expect(decision!.behavior).toBe('deny');
            fixture.destroy();
        });

        it('should stop the timer after Allow is clicked', () => {
            createComponent(
                createRequest({ timeoutMs: 10_000, createdAt: Date.now() }),
            );

            const allowBtn =
                hostEl.querySelector<HTMLButtonElement>('.btn--allow')!;
            allowBtn.click();
            fixture.detectChanges();

            // Advance time past the original timeout — should not emit again
            vi.advanceTimersByTime(15_000);
            fixture.detectChanges();

            // Only one decision should have been emitted (the allow)
            expect(fixture.componentInstance.lastDecision!.behavior).toBe(
                'allow',
            );
            fixture.destroy();
        });

        it('should stop the timer after Deny is clicked', () => {
            createComponent(
                createRequest({ timeoutMs: 10_000, createdAt: Date.now() }),
            );

            const denyBtn =
                hostEl.querySelector<HTMLButtonElement>('.btn--deny')!;
            denyBtn.click();
            fixture.detectChanges();

            // Advance time past the original timeout — should not emit again
            vi.advanceTimersByTime(15_000);
            fixture.detectChanges();

            // Only one decision should have been emitted (the deny)
            expect(fixture.componentInstance.lastDecision!.behavior).toBe(
                'deny',
            );
            fixture.destroy();
        });
    });

    // ──────────────────────────────────────────────
    // Timeout behavior
    // ──────────────────────────────────────────────
    describe('timeout behavior', () => {
        it('should count down the remaining seconds', () => {
            createComponent(
                createRequest({ timeoutMs: 5_000, createdAt: Date.now() }),
            );

            const timer = hostEl.querySelector('.approval-dialog__timer')!;
            expect(timer.textContent).toContain('5s');

            vi.advanceTimersByTime(1000);
            fixture.detectChanges();
            expect(timer.textContent).toContain('4s');

            vi.advanceTimersByTime(1000);
            fixture.detectChanges();
            expect(timer.textContent).toContain('3s');

            fixture.destroy();
        });

        it('should auto-deny when the timer reaches zero', () => {
            createComponent(
                createRequest({
                    id: 'req-timeout',
                    timeoutMs: 3_000,
                    createdAt: Date.now(),
                }),
            );

            // Advance the full timeout
            vi.advanceTimersByTime(3_000);
            fixture.detectChanges();

            const decision = fixture.componentInstance.lastDecision;
            expect(decision).toBeTruthy();
            expect(decision!.requestId).toBe('req-timeout');
            expect(decision!.behavior).toBe('deny');
            fixture.destroy();
        });

        it('should calculate remaining time accounting for elapsed time', () => {
            // Request was created 10 seconds ago with 30s timeout => 20s remaining
            createComponent(
                createRequest({
                    timeoutMs: 30_000,
                    createdAt: Date.now() - 10_000,
                }),
            );

            const timer = hostEl.querySelector('.approval-dialog__timer')!;
            expect(timer.textContent).toContain('20s');
            fixture.destroy();
        });

        it('should auto-deny immediately if timeout has already passed', () => {
            // Request was created 60 seconds ago with 30s timeout => already expired
            createComponent(
                createRequest({
                    id: 'req-expired',
                    timeoutMs: 30_000,
                    createdAt: Date.now() - 60_000,
                }),
            );

            // Should auto-deny on the first interval tick since remaining = 0
            vi.advanceTimersByTime(1_000);
            fixture.detectChanges();

            const decision = fixture.componentInstance.lastDecision;
            expect(decision).toBeTruthy();
            expect(decision!.requestId).toBe('req-expired');
            expect(decision!.behavior).toBe('deny');
            fixture.destroy();
        });

        it('should add urgent CSS class when less than 10 seconds remain', () => {
            createComponent(
                createRequest({ timeoutMs: 12_000, createdAt: Date.now() }),
            );

            let timer = hostEl.querySelector('.approval-dialog__timer')!;
            expect(
                timer.classList.contains('approval-dialog__timer--urgent'),
            ).toBe(false);

            // Tick to 9 seconds remaining
            vi.advanceTimersByTime(3_000);
            fixture.detectChanges();

            timer = hostEl.querySelector('.approval-dialog__timer')!;
            expect(
                timer.classList.contains('approval-dialog__timer--urgent'),
            ).toBe(true);

            fixture.destroy();
        });

        it('should not emit multiple decisions after timeout', () => {
            let decisionCount = 0;
            createComponent(
                createRequest({
                    id: 'req-once',
                    timeoutMs: 2_000,
                    createdAt: Date.now(),
                }),
            );

            const orig = fixture.componentInstance.onDecided.bind(
                fixture.componentInstance,
            );
            fixture.componentInstance.onDecided = (d: ApprovalDecision) => {
                decisionCount++;
                orig(d);
            };

            // Advance past the timeout
            vi.advanceTimersByTime(3_000);
            fixture.detectChanges();

            // Further ticks should not produce more decisions
            vi.advanceTimersByTime(5_000);
            fixture.detectChanges();

            // The timer interval was cleaned up, so at most one decision fires
            expect(decisionCount).toBeLessThanOrEqual(1);
            fixture.destroy();
        });
    });

    // ──────────────────────────────────────────────
    // Lifecycle / cleanup
    // ──────────────────────────────────────────────
    describe('lifecycle cleanup', () => {
        it('should clear the interval on destroy', () => {
            const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

            createComponent(
                createRequest({ timeoutMs: 30_000, createdAt: Date.now() }),
            );

            fixture.destroy();

            // clearInterval should have been called during cleanup
            expect(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
        });

        it('should not throw if destroyed before ngOnInit timer fires', () => {
            createComponent(
                createRequest({ timeoutMs: 30_000, createdAt: Date.now() }),
            );

            // Destroy immediately — should not throw
            expect(() => fixture.destroy()).not.toThrow();
        });
    });
});
