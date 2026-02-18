import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgentListComponent } from './agent-list.component';
import { AgentService } from '../../core/services/agent.service';
import type { Agent } from '../../core/models/agent.model';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';

/** Creates a mock Agent object. */
function createAgent(overrides: Partial<Agent> = {}): Agent {
    return {
        id: 'a-1',
        name: 'Agent Alpha',
        description: 'Test agent',
        systemPrompt: '',
        appendPrompt: '',
        model: 'claude-sonnet-4-20250514',
        allowedTools: '',
        disallowedTools: '',
        permissionMode: 'default',
        maxBudgetUsd: null,
        algochatEnabled: false,
        algochatAuto: false,
        customFlags: {},
        defaultProjectId: null,
        walletAddress: null,
        walletFundedAlgo: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('AgentListComponent', () => {
    let fixture: ComponentFixture<AgentListComponent>;
    let hostEl: HTMLElement;

    const agentsSignal = signal<Agent[]>([]);
    const loadingSignal = signal(false);

    const mockAgentService = {
        agents: agentsSignal,
        loading: loadingSignal,
        loadAgents: vi.fn(),
    };

    function createComponent(): ComponentFixture<AgentListComponent> {
        fixture = TestBed.createComponent(AgentListComponent);
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        agentsSignal.set([]);
        loadingSignal.set(false);

        TestBed.configureTestingModule({
            imports: [AgentListComponent],
            providers: [
                provideRouter([]),
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
    it('should render page header with Agents title', () => {
        createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('Agents');
    });

    it('should show empty state when no agents', () => {
        createComponent();
        const empty = hostEl.querySelector('.empty');
        expect(empty).toBeTruthy();
        expect(empty!.textContent).toContain('No agents configured');
    });

    it('should render agent cards when agents exist', () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'Alpha' }),
            createAgent({ id: 'a-2', name: 'Beta' }),
        ]);
        createComponent();

        const items = hostEl.querySelectorAll('.list__item');
        expect(items).toHaveLength(2);
    });

    it('should display agent name and model', () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'My Agent', model: 'claude-opus-4-20250514' }),
        ]);
        createComponent();

        const title = hostEl.querySelector('.list__item-title');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('My Agent');

        const meta = hostEl.querySelector('.list__item-meta');
        expect(meta).toBeTruthy();
        expect(meta!.textContent).toContain('claude-opus-4-20250514');
    });

    it('should display permission mode in meta', () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'Agent', permissionMode: 'full-auto' }),
        ]);
        createComponent();

        const meta = hostEl.querySelector('.list__item-meta');
        expect(meta).toBeTruthy();
        expect(meta!.textContent).toContain('full-auto');
    });

    it('should call loadAgents on init', () => {
        createComponent();
        expect(mockAgentService.loadAgents).toHaveBeenCalled();
    });
});
