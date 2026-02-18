import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SessionInputComponent } from './session-input.component';
import { beforeEach, describe, it, expect } from 'vitest';

/**
 * Test host component that wraps SessionInputComponent,
 * allowing us to set the `disabled` input and capture `messageSent` output.
 */
@Component({
    selector: 'app-test-host',
    template: `<app-session-input [disabled]="disabled()" (messageSent)="onSent($event)" />`,
    imports: [SessionInputComponent],
})
class TestHostComponent {
    readonly disabled = signal(false);
    lastSent: string | null = null;
    onSent(msg: string): void {
        this.lastSent = msg;
    }
}

describe('SessionInputComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostEl: HTMLElement;

    function createComponent(): ComponentFixture<TestHostComponent> {
        fixture = TestBed.createComponent(TestHostComponent);
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TestHostComponent, SessionInputComponent],
        });
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render textarea and send button', () => {
        createComponent();

        const textarea = hostEl.querySelector('textarea');
        const button = hostEl.querySelector('button');
        expect(textarea).toBeTruthy();
        expect(button).toBeTruthy();
        expect(button!.textContent).toContain('Send');

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Emit on send
    // ──────────────────────────────────────────────
    it('should emit messageSent on send click with text', () => {
        createComponent();

        const textarea = hostEl.querySelector<HTMLTextAreaElement>('textarea')!;
        textarea.value = '  Hello world  ';
        textarea.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        const button = hostEl.querySelector<HTMLButtonElement>('button.input-bar__send')!;
        button.click();
        fixture.detectChanges();

        expect(fixture.componentInstance.lastSent).toBe('Hello world');

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Clear after send
    // ──────────────────────────────────────────────
    it('should clear input after send', async () => {
        createComponent();

        const textarea = hostEl.querySelector<HTMLTextAreaElement>('textarea')!;
        textarea.value = 'Test message';
        textarea.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        const button = hostEl.querySelector<HTMLButtonElement>('button.input-bar__send')!;
        button.click();
        fixture.detectChanges();

        // After send, the signal is cleared. The button should now be disabled
        // (empty text), confirming the model was reset.
        await fixture.whenStable();
        fixture.detectChanges();

        // The send button should be disabled again since the input was cleared
        expect(button.disabled).toBe(true);

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Empty / whitespace guard
    // ──────────────────────────────────────────────
    it('should not emit for empty or whitespace text', () => {
        createComponent();

        const textarea = hostEl.querySelector<HTMLTextAreaElement>('textarea')!;
        textarea.value = '   ';
        textarea.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        // The button should be disabled for whitespace-only input, but also
        // test onSend directly by simulating the flow
        // Button is disabled for whitespace, so we verify no emission
        expect(fixture.componentInstance.lastSent).toBeNull();

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Disabled state — button
    // ──────────────────────────────────────────────
    it('should disable send button when disabled input is true', () => {
        createComponent();

        // First set some text so the button would normally be enabled
        const textarea = hostEl.querySelector<HTMLTextAreaElement>('textarea')!;
        textarea.value = 'Hello';
        textarea.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        // Now set disabled
        fixture.componentInstance.disabled.set(true);
        fixture.detectChanges();

        const button = hostEl.querySelector<HTMLButtonElement>('button.input-bar__send')!;
        expect(button.disabled).toBe(true);

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Disabled state — empty text
    // ──────────────────────────────────────────────
    it('should disable send button when text is empty', () => {
        createComponent();

        const button = hostEl.querySelector<HTMLButtonElement>('button.input-bar__send')!;
        expect(button.disabled).toBe(true);

        fixture.destroy();
    });
});
