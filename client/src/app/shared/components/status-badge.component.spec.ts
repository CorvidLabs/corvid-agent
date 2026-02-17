import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input } from '@angular/core';
import { StatusBadgeComponent } from './status-badge.component';
import { vi, beforeEach, describe, it, expect } from 'vitest';

/**
 * Test host component that wraps StatusBadgeComponent,
 * allowing us to set the required `status` input via componentRef.setInput().
 */
@Component({
    selector: 'app-test-host',
    template: `<app-status-badge [status]="status()" />`,
    imports: [StatusBadgeComponent],
})
class TestHostComponent {
    readonly status = input.required<string>();
}

describe('StatusBadgeComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostEl: HTMLElement;

    function createComponent(status: string): ComponentFixture<TestHostComponent> {
        fixture = TestBed.createComponent(TestHostComponent);
        fixture.componentRef.setInput('status', status);
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TestHostComponent, StatusBadgeComponent],
        });
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render the status text', () => {
        createComponent('running');

        const badge = hostEl.querySelector('.status-badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent!.trim()).toBe('running');

        fixture.destroy();
    });

    it('should apply correct CSS class for running', () => {
        createComponent('running');

        const badge = hostEl.querySelector('.status-badge')!;
        expect(badge.classList.contains('status-badge--running')).toBe(true);

        fixture.destroy();
    });

    it('should apply correct CSS class for error', () => {
        createComponent('error');

        const badge = hostEl.querySelector('.status-badge')!;
        expect(badge.classList.contains('status-badge--error')).toBe(true);

        fixture.destroy();
    });

    it('should have correct aria-label', () => {
        createComponent('paused');

        const badge = hostEl.querySelector('.status-badge')!;
        expect(badge.getAttribute('aria-label')).toBe('Status: paused');

        fixture.destroy();
    });
});
