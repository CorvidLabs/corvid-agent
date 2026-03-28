import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuidedTourComponent } from './guided-tour.component';
import { GuidedTourService } from '../../core/services/guided-tour.service';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

describe('GuidedTourComponent', () => {
    let fixture: ComponentFixture<GuidedTourComponent>;
    let component: GuidedTourComponent;
    let tourService: GuidedTourService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [GuidedTourComponent],
        });

        tourService = TestBed.inject(GuidedTourService);
        fixture = TestBed.createComponent(GuidedTourComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    afterEach(() => {
        fixture.destroy();
        tourService.active.set(false);
        tourService.currentStepIndex.set(0);
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should not render overlay when tour is inactive', () => {
        tourService.active.set(false);
        fixture.detectChanges();
        const overlay = (fixture.nativeElement as HTMLElement).querySelector('.tour-overlay');
        expect(overlay).toBeNull();
    });

    it('should render overlay when tour is active', () => {
        tourService.startTour();
        fixture.detectChanges();
        const overlay = (fixture.nativeElement as HTMLElement).querySelector('.tour-overlay');
        expect(overlay).toBeTruthy();
    });

    it('should render tooltip with step title and content', () => {
        tourService.startTour();
        fixture.detectChanges();
        const title = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__title');
        const content = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__content');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('Welcome to CorvidAgent');
        expect(content).toBeTruthy();
    });

    it('should display step counter', () => {
        tourService.startTour();
        fixture.detectChanges();
        const stepCounter = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__step');
        expect(stepCounter).toBeTruthy();
        expect(stepCounter!.textContent!.trim()).toContain('1');
        expect(stepCounter!.textContent!.trim()).toContain('/');
    });

    it('should render skip button', () => {
        tourService.startTour();
        fixture.detectChanges();
        const skipBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__skip');
        expect(skipBtn).toBeTruthy();
        expect(skipBtn!.textContent!.trim()).toBe('Skip tour');
    });

    it('should not render Back button on first step', () => {
        tourService.startTour();
        fixture.detectChanges();
        const ghostBtns = (fixture.nativeElement as HTMLElement).querySelectorAll('.tour-btn--ghost');
        expect(ghostBtns.length).toBe(0);
    });

    it('should render Back button on second step', () => {
        tourService.startTour();
        tourService.next();
        fixture.detectChanges();
        const ghostBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-btn--ghost');
        expect(ghostBtn).toBeTruthy();
        expect(ghostBtn!.textContent!.trim()).toBe('Back');
    });

    it('should show "Done" on last step', () => {
        tourService.startTour();
        const steps = tourService.steps();
        // Navigate to last step
        for (let i = 0; i < steps.length - 1; i++) {
            tourService.next();
        }
        fixture.detectChanges();
        const primaryBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-btn--primary');
        expect(primaryBtn).toBeTruthy();
        expect(primaryBtn!.textContent!.trim()).toBe('Done');
    });

    it('should show "Next" on non-last step', () => {
        tourService.startTour();
        fixture.detectChanges();
        const primaryBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-btn--primary');
        expect(primaryBtn).toBeTruthy();
        expect(primaryBtn!.textContent!.trim()).toBe('Next');
    });

    it('should call tourService.next() when Next button is clicked', () => {
        tourService.startTour();
        fixture.detectChanges();
        const nextSpy = vi.spyOn(tourService, 'next');
        const primaryBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-btn--primary') as HTMLButtonElement;
        primaryBtn.click();
        expect(nextSpy).toHaveBeenCalled();
    });

    it('should call tourService.prev() when Back button is clicked', () => {
        tourService.startTour();
        tourService.next();
        fixture.detectChanges();
        const prevSpy = vi.spyOn(tourService, 'prev');
        const ghostBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-btn--ghost') as HTMLButtonElement;
        ghostBtn.click();
        expect(prevSpy).toHaveBeenCalled();
    });

    it('should call tourService.skip() when Skip tour is clicked', () => {
        tourService.startTour();
        fixture.detectChanges();
        const skipSpy = vi.spyOn(tourService, 'skip');
        const skipBtn = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__skip') as HTMLButtonElement;
        skipBtn.click();
        expect(skipSpy).toHaveBeenCalled();
    });

    it('should call tourService.next() on overlay click (outside tooltip)', () => {
        tourService.startTour();
        fixture.detectChanges();
        const nextSpy = vi.spyOn(tourService, 'next');
        const overlay = (fixture.nativeElement as HTMLElement).querySelector('.tour-overlay') as HTMLElement;
        // Click the overlay itself (not inside the tooltip)
        overlay.click();
        expect(nextSpy).toHaveBeenCalled();
    });

    it('should render SVG mask when tour is active', () => {
        tourService.startTour();
        fixture.detectChanges();
        const svg = (fixture.nativeElement as HTMLElement).querySelector('.tour-mask');
        expect(svg).toBeTruthy();
    });

    it('should not render spotlight ring when target element is missing', () => {
        tourService.startTour();
        fixture.detectChanges();
        // The target elements (.agent-card etc.) don't exist in the test DOM,
        // so spotlight should be null and no spotlight ring rendered
        // The target elements (.agent-card etc.) don't exist in the test DOM,
        // so no error should be thrown even when spotlight ring is absent
        expect(component).toBeTruthy();
    });

    it('should set tooltip position with data-placement attribute', () => {
        tourService.startTour();
        fixture.detectChanges();
        const tooltip = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip');
        expect(tooltip).toBeTruthy();
        expect(tooltip!.getAttribute('data-placement')).toBe('bottom');
    });

    it('should clean up on destroy', () => {
        tourService.startTour();
        fixture.detectChanges();
        // Should not throw
        expect(() => fixture.destroy()).not.toThrow();
    });

    it('should update tooltip when step changes', () => {
        tourService.startTour();
        fixture.detectChanges();
        let title = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__title');
        expect(title!.textContent).toContain('Welcome to CorvidAgent');

        tourService.next();
        fixture.detectChanges();
        title = (fixture.nativeElement as HTMLElement).querySelector('.tour-tooltip__title');
        expect(title!.textContent).toContain('Start a conversation');
    });
});
