import { TestBed } from '@angular/core/testing';
import { GuidedTourService } from './guided-tour.service';

describe('GuidedTourService', () => {
    let service: GuidedTourService;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({});
        service = TestBed.inject(GuidedTourService);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('starts inactive', () => {
        expect(service.active()).toBe(false);
    });

    it('has steps defined', () => {
        expect(service.steps().length).toBeGreaterThan(0);
    });

    it('starts at step index 0', () => {
        expect(service.currentStepIndex()).toBe(0);
    });

    it('currentStep returns first step when not active', () => {
        const step = service.currentStep();
        expect(step).toBeTruthy();
        expect(step!.id).toBe('welcome');
    });

    describe('startTour', () => {
        it('sets active to true', () => {
            service.startTour();
            expect(service.active()).toBe(true);
        });

        it('resets step index to 0', () => {
            service.next();
            service.startTour();
            expect(service.currentStepIndex()).toBe(0);
        });
    });

    describe('next', () => {
        it('advances step index', () => {
            service.startTour();
            service.next();
            expect(service.currentStepIndex()).toBe(1);
        });

        it('completes tour on last step', () => {
            service.startTour();
            const stepCount = service.steps().length;
            for (let i = 0; i < stepCount; i++) {
                service.next();
            }
            expect(service.active()).toBe(false);
        });
    });

    describe('prev', () => {
        it('goes back one step', () => {
            service.startTour();
            service.next();
            service.next();
            service.prev();
            expect(service.currentStepIndex()).toBe(1);
        });

        it('does not go below 0', () => {
            service.startTour();
            service.prev();
            expect(service.currentStepIndex()).toBe(0);
        });
    });

    describe('skip', () => {
        it('deactivates tour', () => {
            service.startTour();
            service.skip();
            expect(service.active()).toBe(false);
        });

        it('marks tour as completed in localStorage', () => {
            service.startTour();
            service.skip();
            expect(localStorage.getItem('corvid_tour_completed')).toBe('true');
        });
    });

    describe('complete', () => {
        it('sets active to false and persists', () => {
            service.startTour();
            service.complete();
            expect(service.active()).toBe(false);
            expect(service.isCompleted).toBe(true);
        });
    });

    describe('isCompleted', () => {
        it('returns false by default', () => {
            expect(service.isCompleted).toBe(false);
        });

        it('returns true after completion', () => {
            service.complete();
            expect(service.isCompleted).toBe(true);
        });
    });

    describe('reset', () => {
        it('clears completed state from localStorage', () => {
            service.complete();
            expect(service.isCompleted).toBe(true);
            service.reset();
            expect(service.isCompleted).toBe(false);
        });
    });

    describe('currentStep', () => {
        it('returns null when index is out of bounds', () => {
            service.currentStepIndex.set(999);
            expect(service.currentStep()).toBeNull();
        });

        it('returns correct step for given index', () => {
            service.currentStepIndex.set(1);
            const step = service.currentStep();
            expect(step).toBeTruthy();
            expect(step!.id).toBe('chat-home');
        });
    });
});
