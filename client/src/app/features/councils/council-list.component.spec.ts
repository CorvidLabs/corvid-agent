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
        name: 'Test Council',
        description: 'A test council',
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
    };

    const mockAgentService = {
        agents: signal([]),
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
        const empty = hostEl.querySelector('.empty');
        expect(empty).toBeTruthy();
        expect(empty!.textContent).toContain('No councils configured');
    });

    it('should render a list of councils', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Alpha Council', agentIds: ['a-1'] }),
            createCouncil({ id: 'c-2', name: 'Beta Council', agentIds: ['a-1', 'a-2', 'a-3'] }),
        ]);
        createComponent();

        const items = hostEl.querySelectorAll('.list__item');
        expect(items).toHaveLength(2);
    });

    it('should render council name and agent count', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Alpha Council', agentIds: ['a-1', 'a-2'] }),
        ]);
        createComponent();

        const title = hostEl.querySelector('.list__item-title');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('Alpha Council');

        const meta = hostEl.querySelector('.list__item-meta');
        expect(meta).toBeTruthy();
        expect(meta!.textContent).toContain('2 agents');
    });

    it('should show singular agent text for 1 agent', () => {
        councilsSignal.set([
            createCouncil({ id: 'c-1', name: 'Solo Council', agentIds: ['a-1'] }),
        ]);
        createComponent();

        const meta = hostEl.querySelector('.list__item-meta');
        expect(meta).toBeTruthy();
        expect(meta!.textContent).toContain('1 agent');
        // Should NOT contain "1 agents"
        expect(meta!.textContent).not.toContain('1 agents');
    });

    it('should call loadCouncils on init', () => {
        createComponent();
        expect(mockCouncilService.loadCouncils).toHaveBeenCalled();
    });
});
