import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, it, expect } from 'vitest';
import { KeyboardShortcutsOverlayComponent } from './keyboard-shortcuts-overlay.component';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';

describe('KeyboardShortcutsOverlayComponent', () => {
    let fixture: ComponentFixture<KeyboardShortcutsOverlayComponent>;
    let component: KeyboardShortcutsOverlayComponent;
    let service: KeyboardShortcutsService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [KeyboardShortcutsOverlayComponent],
            providers: [provideRouter([])],
        });

        service = TestBed.inject(KeyboardShortcutsService);
        fixture = TestBed.createComponent(KeyboardShortcutsOverlayComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should not render overlay when closed', () => {
        const overlay = fixture.nativeElement.querySelector('.shortcuts-overlay');
        expect(overlay).toBeNull();
    });

    it('should render overlay when open', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const overlay = fixture.nativeElement.querySelector('.shortcuts-overlay');
        expect(overlay).toBeTruthy();
    });

    it('should display shortcut entries', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const entries = fixture.nativeElement.querySelectorAll('.shortcuts-panel__entry');
        expect(entries.length).toBeGreaterThanOrEqual(7);
    });

    it('should display kbd elements for keys', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const kbds = fixture.nativeElement.querySelectorAll('kbd');
        expect(kbds.length).toBeGreaterThan(0);
    });

    it('should have proper dialog role', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const overlay = fixture.nativeElement.querySelector('.shortcuts-overlay');
        expect(overlay.getAttribute('role')).toBe('dialog');
        expect(overlay.getAttribute('aria-modal')).toBe('true');
    });

    it('should close on backdrop click', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const overlay = fixture.nativeElement.querySelector('.shortcuts-overlay');
        overlay.click();
        expect(service.overlayOpen()).toBe(false);
    });

    it('should not close when clicking panel content', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const panel = fixture.nativeElement.querySelector('.shortcuts-panel');
        panel.click();
        expect(service.overlayOpen()).toBe(true);
    });

    it('should show category headers', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const labels = fixture.nativeElement.querySelectorAll('.shortcuts-panel__category-label');
        const texts = Array.from(labels).map((el: any) => el.textContent.trim());
        expect(texts).toContain('General');
        expect(texts).toContain('Navigation');
    });

    it('should display "then" between multi-key shortcuts', () => {
        service.overlayOpen.set(true);
        fixture.detectChanges();

        const thenSpans = fixture.nativeElement.querySelectorAll('.shortcuts-panel__then');
        expect(thenSpans.length).toBeGreaterThan(0);
    });
});
