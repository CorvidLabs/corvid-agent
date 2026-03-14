import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CouncilListComponent } from './council-list.component';
import { CouncilService } from '../../core/services/council.service';
import { AgentService } from '../../core/services/agent.service';
import type { Council } from '../../core/models/council.model';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';

/** Creates a mock Council object. */
function createCouncil(overrides: Partial<Council> = {}): Council {
    return {
        id: 'c-1',
        name: 'Real Council',
        description: 'A real council',
        chairmanAgentId: null,
        agentIds: ['a-1', 'a-2'],
        discussionRounds: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('CouncilListComponent', () => {
    let fixture: ComponentFixture<CouncilListComponent>;
    let hostEl: HTMLElement;

    const councilsSignal = signal<Council[]>([]);
    const loadingSignal = signal(false);

    const mockCouncilService = {
        councils: councilsSignal,
        loading: loadingSignal,
        loadCouncils: vi.fn(),
        getCouncilLaunches: vi.fn().mockResolvedValue([]),
    };

    const mockAgentService = {
        agents: signal([{ id: 'a-1', name: 'Agent A' }, { id: 'a-2', name: 'Agent B' }, { id: 'a-3', name: 'Agent C' }]),
        loading: signal(false),
        loadAgents: vi.fn(),
    };

    function createComponent(): ComponentFixture<CouncilListComponent> {
        fixture = TestBed.createComponent(CouncilListComponent);
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        councilsSignal.set([]);
        loadingSignal.set(false);
        vi.clearAllMocks();
        mockCouncilService.getCouncilLaunches.mockResolvedValue([]);

        TestBed.configureTestingModule({
            imports: [CouncilListComponent],
            providers: [
                provideRouter([]),
                { provide: CouncilService, useValue: mockCouncilService },
                { provide: AgentService, useValue: mockAgentService },
            ],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render page header with title', () => {
        createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('Councils');
    });

    it('should show empty state when no councils', () => {
        createComponent();
        const empty = hostEl.querySelector('app-empty-state');
        expect(empty).toBeTruthy();
    });

    it('should render council cards in grid', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Alpha Council', agentIds: ['a-1'] }),
            createCouncil({ id: 'c-2', name: 'Beta Council', agentIds: ['a-1', 'a-2', 'a-3'] }),
        ]);
        createComponent();

        const cards = hostEl.querySelectorAll('.council-card');
        expect(cards).toHaveLength(2);
    });

    it('should render council name and member count', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Alpha Council', agentIds: ['a-1', 'a-2'] }),
        ]);
        createComponent();

        const name = hostEl.querySelector('.council-card__name');
        expect(name).toBeTruthy();
        expect(name!.textContent).toContain('Alpha Council');

        const meta = hostEl.querySelector('.council-card__meta');
        expect(meta).toBeTruthy();
        expect(meta!.textContent).toContain('2');
    });

    it('should show idle badge when council has never launched', () => {
        councilsSignal.set([createCouncil()]);
        createComponent();

        const badge = hostEl.querySelector('.stage-badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent?.trim()).toBe('idle');
        expect(badge!.getAttribute('data-stage')).toBe('idle');
    });

    it('should call loadCouncils on init', () => {
        createComponent();
        expect(mockCouncilService.loadCouncils).toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────
    // Test data filtering
    // ──────────────────────────────────────────────
    it('should hide test councils by default when test data exists', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Production Council' }),
            createCouncil({ id: 'c-2', name: 'Test Council' }),
            createCouncil({ id: 'c-3', name: 'E2E Integration' }),
        ]);
        createComponent();

        const cards = hostEl.querySelectorAll('.council-card');
        expect(cards).toHaveLength(1);
        expect(cards[0].textContent).toContain('Production Council');
    });

    it('should show filter toggle when test councils exist', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Real Council' }),
            createCouncil({ id: 'c-2', name: 'Test Council' }),
        ]);
        createComponent();

        const toggle = hostEl.querySelector('.btn--ghost');
        expect(toggle).toBeTruthy();
        expect(toggle!.textContent).toContain('Show all');
    });

    it('should not show filter toggle when no test councils exist', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Real Council' }),
        ]);
        createComponent();

        const toggle = hostEl.querySelector('.btn--ghost');
        expect(toggle).toBeFalsy();
    });

    it('should show all councils after toggling filter off', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Production Council' }),
            createCouncil({ id: 'c-2', name: 'Test Council' }),
        ]);
        createComponent();

        // Initially only 1 card shown
        expect(hostEl.querySelectorAll('.council-card')).toHaveLength(1);

        // Click toggle
        const toggle = hostEl.querySelector('.btn--ghost') as HTMLButtonElement;
        toggle.click();
        fixture.detectChanges();

        // Now both shown
        expect(hostEl.querySelectorAll('.council-card')).toHaveLength(2);
    });

    it('should show empty-filtered message when all councils are test data', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Test Council' }),
            createCouncil({ id: 'c-2', name: 'E2E Flow' }),
        ]);
        createComponent();

        const msg = hostEl.querySelector('.empty-filtered');
        expect(msg).toBeTruthy();
        expect(msg!.textContent).toContain('No councils match');
    });

    it('should render member chips with chairman highlighted', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Chairman Council', agentIds: ['a-1', 'a-2'], chairmanAgentId: 'a-1' }),
        ]);
        createComponent();

        const chips = hostEl.querySelectorAll('.member-chip');
        expect(chips.length).toBeGreaterThanOrEqual(2);
        const chairmanChip = hostEl.querySelector('.member-chip--chairman');
        expect(chairmanChip).toBeTruthy();
        expect(chairmanChip!.textContent).toContain('Agent A');
    });
});
