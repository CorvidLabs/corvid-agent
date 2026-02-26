import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { CouncilFormComponent } from './council-form.component';
import { CouncilService } from '../../core/services/council.service';
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

describe('CouncilFormComponent', () => {
    let fixture: ComponentFixture<CouncilFormComponent>;
    let component: CouncilFormComponent;
    let hostEl: HTMLElement;

    const agentsSignal = signal<Agent[]>([]);

    const mockAgentService = {
        agents: agentsSignal,
        loading: signal(false),
        loadAgents: vi.fn(async () => {}),
    };

    const mockCouncilService = {
        createCouncil: vi.fn(async (input: Record<string, unknown>) => ({
            id: 'c-new',
            name: input.name,
            description: input.description ?? '',
            chairmanAgentId: input.chairmanAgentId ?? null,
            agentIds: input.agentIds,
            discussionRounds: input.discussionRounds ?? 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })),
        updateCouncil: vi.fn(),
        getCouncil: vi.fn(),
    };

    const mockActivatedRoute = {
        snapshot: {
            paramMap: {
                get: vi.fn(() => null),
            },
        },
    };

    function createComponent(): ComponentFixture<CouncilFormComponent> {
        fixture = TestBed.createComponent(CouncilFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        agentsSignal.set([]);
        mockActivatedRoute.snapshot.paramMap.get.mockReturnValue(null);

        TestBed.configureTestingModule({
            imports: [CouncilFormComponent],
            providers: [
                provideRouter([]),
                { provide: CouncilService, useValue: mockCouncilService },
                { provide: AgentService, useValue: mockAgentService },
                { provide: ActivatedRoute, useValue: mockActivatedRoute },
            ],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render the form with title New Council', () => {
        createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('New Council');
    });

    it('should render name input field', () => {
        createComponent();
        const nameInput = hostEl.querySelector<HTMLInputElement>('#name');
        expect(nameInput).toBeTruthy();
    });

    it('should render description textarea', () => {
        createComponent();
        const desc = hostEl.querySelector<HTMLTextAreaElement>('#description');
        expect(desc).toBeTruthy();
    });

    it('should render Save and Cancel buttons', () => {
        createComponent();
        const buttons = hostEl.querySelectorAll('button');
        const texts = Array.from(buttons).map((b) => b.textContent!.trim());
        expect(texts).toContain('Save');
        expect(texts).toContain('Cancel');
    });

    // ──────────────────────────────────────────────
    // Validation
    // ──────────────────────────────────────────────
    it('should disable Save button when name is empty', () => {
        createComponent();
        const saveBtn = hostEl.querySelector<HTMLButtonElement>('.btn--primary');
        expect(saveBtn).toBeTruthy();
        expect(saveBtn!.disabled).toBe(true);
    });

    it('should disable Save button when name is set but no agents selected', () => {
        createComponent();
        // Set name
        component['form'].controls.name.setValue('My Council');
        fixture.detectChanges();

        const saveBtn = hostEl.querySelector<HTMLButtonElement>('.btn--primary');
        expect(saveBtn!.disabled).toBe(true);
    });

    // ──────────────────────────────────────────────
    // Agent selection
    // ──────────────────────────────────────────────
    it('should render agent checkboxes when agents are available', async () => {
        agentsSignal.set([
            createAgent({ id: 'a-1', name: 'Agent Alpha' }),
            createAgent({ id: 'a-2', name: 'Agent Beta' }),
        ]);
        createComponent();
        await fixture.whenStable();
        fixture.detectChanges();

        const checkboxes = hostEl.querySelectorAll('.form__checkbox');
        expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    });

    it('should show empty agents message when no agents exist', async () => {
        agentsSignal.set([]);
        createComponent();
        await fixture.whenStable();
        fixture.detectChanges();

        const hint = hostEl.querySelector('.form__hint');
        expect(hint).toBeTruthy();
    });

    // ──────────────────────────────────────────────
    // Cancel
    // ──────────────────────────────────────────────
    it('should have a working cancel button', () => {
        createComponent();
        const cancelBtn = hostEl.querySelector<HTMLButtonElement>('.btn--secondary');
        expect(cancelBtn).toBeTruthy();
        // We just verify it does not throw when clicked (router.navigate is handled)
        expect(() => cancelBtn!.click()).not.toThrow();
    });
});
