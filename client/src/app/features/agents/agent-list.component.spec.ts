import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgentListComponent } from './agent-list.component';
import { AgentService } from '../../core/services/agent.service';
import { SessionService } from '../../core/services/session.service';
import { PersonaService } from '../../core/services/persona.service';
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
    const sessionsSignal = signal<unknown[]>([]);

    const mockAgentService = {
        agents: agentsSignal,
        loading: loadingSignal,
        loadAgents: vi.fn().mockResolvedValue(undefined),
    };

    const mockSessionService = {
        sessions: sessionsSignal,
        loadSessions: vi.fn().mockResolvedValue(undefined),
    };

    const mockPersonaService = {
        checkPersonaExists: vi.fn().mockResolvedValue(false),
    };

    async function createComponent(): Promise<ComponentFixture<AgentListComponent>> {
        fixture = TestBed.createComponent(AgentListComponent);
        // Disable the hide-inactive filter so test agents are always visible
        fixture.componentInstance['hideInactive'].set(false);
        fixture.detectChanges();
        // Wait for the async ngOnInit (loadAgents + loadSessions + buildCards)
        await fixture.componentInstance.ngOnInit();
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        agentsSignal.set([]);
        loadingSignal.set(false);
        sessionsSignal.set([]);

        TestBed.configureTestingModule({
            imports: [AgentListComponent],
            providers: [
                provideRouter([]),
                { provide: AgentService, useValue: mockAgentService },
                { provide: SessionService, useValue: mockSessionService },
                { provide: PersonaService, useValue: mockPersonaService },
            ],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render page header with Agents title', async () => {
        await createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('Agents');
    });

    it('should show empty state when no agents', async () => {
        await createComponent();
        const empty = hostEl.querySelector('.empty-state');
        expect(empty).toBeTruthy();
        expect(empty!.textContent).toContain('No agents yet');
    });

    it('should render agent cards when agents exist', async () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'Alpha' }),
            createAgent({ id: 'a-2', name: 'Beta' }),
        ]);
        await createComponent();

        const items = hostEl.querySelectorAll('.agent-card');
        expect(items).toHaveLength(2);
    });

    it('should display agent name and model', async () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'My Agent', model: 'claude-opus-4-20250514' }),
        ]);
        await createComponent();

        const title = hostEl.querySelector('.agent-card__name');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('My Agent');

        const badge = hostEl.querySelector('.badge--provider');
        expect(badge).toBeTruthy();
        expect(badge!.textContent).toContain('claude-opus-4-20250514');
    });

    it('should display permission mode in meta', async () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'Agent', permissionMode: 'full-auto' }),
        ]);
        await createComponent();

        const perm = hostEl.querySelector('.agent-card__perm');
        expect(perm).toBeTruthy();
        expect(perm!.textContent).toContain('full-auto');
    });

    it('should call loadAgents on init', async () => {
        await createComponent();
        expect(mockAgentService.loadAgents).toHaveBeenCalled();
    });
});
