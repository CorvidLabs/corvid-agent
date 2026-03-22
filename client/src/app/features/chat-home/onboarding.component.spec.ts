import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

describe('OnboardingComponent', () => {
    let fixture: ComponentFixture<OnboardingComponent>;
    let component: OnboardingComponent;
    let el: HTMLElement;

    const mockAgentService = {
        agents: signal([]),
        loading: signal(false),
        loadAgents: vi.fn(async () => {}),
        createAgent: vi.fn(async (input: Record<string, unknown>) => ({
            id: 'agent-1',
            name: input['name'] ?? 'Agent',
            ...input,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })),
    };

    const mockProjectService = {
        projects: signal([{ id: 'proj-1', name: 'Existing Project' }]),
        loading: signal(false),
        loadProjects: vi.fn(async () => {}),
        createProject: vi.fn(async (input: Record<string, unknown>) => ({
            id: 'proj-new',
            ...input,
        })),
    };

    const mockProviders = [
        { type: 'anthropic', name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
        { type: 'ollama', name: 'Ollama', defaultModel: 'llama3', models: ['llama3', 'codellama'] },
    ];

    const mockApiService = {
        get: vi.fn((url: string) => {
            if (url === '/providers') return of(mockProviders);
            return of([]);
        }),
        post: vi.fn(() => of({})),
    };

    const mockNotify = {
        error: vi.fn(),
        success: vi.fn(),
    };

    function createComponent(): ComponentFixture<OnboardingComponent> {
        fixture = TestBed.createComponent(OnboardingComponent);
        component = fixture.componentInstance;
        el = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
        return fixture;
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        // Re-assign default implementations after restoreAllMocks
        mockAgentService.createAgent = vi.fn(async (input: Record<string, unknown>) => ({
            id: 'agent-1',
            name: input['name'] ?? 'Agent',
            ...input,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }));
        mockAgentService.loadAgents = vi.fn(async () => {});
        mockApiService.get = vi.fn((url: string) => {
            if (url === '/providers') return of(mockProviders);
            return of([]);
        });
        mockApiService.post = vi.fn(() => of({}));
        mockProjectService.loadProjects = vi.fn(async () => {});
        mockProjectService.createProject = vi.fn(async (input: Record<string, unknown>) => ({
            id: 'proj-new',
            ...input,
        }));
        mockNotify.error = vi.fn();
        mockNotify.success = vi.fn();
        // Reset projects to have one existing project
        mockProjectService.projects = signal([{ id: 'proj-1', name: 'Existing Project' }]);
        TestBed.configureTestingModule({
            imports: [OnboardingComponent],
            providers: [
                { provide: AgentService, useValue: mockAgentService },
                { provide: ProjectService, useValue: mockProjectService },
                { provide: ApiService, useValue: mockApiService },
                { provide: NotificationService, useValue: mockNotify },
            ],
        });
    });

    afterEach(() => {
        fixture?.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering — pick step
    // ──────────────────────────────────────────────
    it('should render with pick step initially', () => {
        createComponent();
        expect(el.querySelector('.onboard__title')?.textContent).toContain('Create your first agent');
    });

    it('should render all 5 template cards', () => {
        createComponent();
        const cards = el.querySelectorAll('.tpl-card');
        expect(cards.length).toBe(5);
    });

    it('should show template names', () => {
        createComponent();
        const names = Array.from(el.querySelectorAll('.tpl-card__name')).map(
            (n) => n.textContent?.trim(),
        );
        expect(names).toContain('Full Stack Developer');
        expect(names).toContain('Code Reviewer');
        expect(names).toContain('Researcher');
        expect(names).toContain('General Assistant');
        expect(names).toContain('Custom Agent');
    });

    it('should show skip button', () => {
        createComponent();
        const skip = el.querySelector('.onboard__skip');
        expect(skip).toBeTruthy();
        expect(skip?.textContent).toContain('Skip');
    });

    // ──────────────────────────────────────────────
    // Template selection → customize step
    // ──────────────────────────────────────────────
    it('should advance to customize step when template is picked', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(el.querySelector('.onboard__title')?.textContent).toContain('Almost there');
    });

    it('should set suggested name from template', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click(); // Full Stack → "Builder"
        fixture.detectChanges();

        const nameInput = el.querySelector('#agent-name') as HTMLInputElement;
        expect(nameInput.value).toBe('Builder');
    });

    it('should clear name for custom template', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // First pick one with a name
        let cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Go back and pick custom
        const backBtn = el.querySelector('.btn--ghost') as HTMLButtonElement;
        backBtn.click();
        fixture.detectChanges();

        // Re-query cards after step change
        cards = el.querySelectorAll('.tpl-card');
        (cards[4] as HTMLButtonElement).click();
        fixture.detectChanges();

        const nameInput = el.querySelector('#agent-name') as HTMLInputElement;
        expect(nameInput.value).toBe('');
    });

    // ──────────────────────────────────────────────
    // Providers
    // ──────────────────────────────────────────────
    it('should load providers on init', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        expect(mockApiService.get).toHaveBeenCalledWith('/providers');
    });

    it('should handle provider loading failure gracefully', async () => {
        mockApiService.get.mockReturnValue(throwError(() => new Error('network error')));

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        expect(component).toBeTruthy();
    });

    it('should show model select in customize step', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const modelSelect = el.querySelector('#agent-model') as HTMLSelectElement;
        expect(modelSelect).toBeTruthy();
    });

    // ──────────────────────────────────────────────
    // Skip onboarding
    // ──────────────────────────────────────────────
    it('should emit done when skip is clicked', () => {
        createComponent();
        const emitSpy = vi.spyOn(component.done, 'emit');

        const skipBtn = el.querySelector('.onboard__skip') as HTMLButtonElement;
        skipBtn.click();

        expect(emitSpy).toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────
    // Back button
    // ──────────────────────────────────────────────
    it('should go back to pick step when Back is clicked', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Pick template
        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(el.querySelector('.onboard__title')?.textContent).toContain('Almost there');

        // Click back
        const backBtn = el.querySelector('.btn--ghost') as HTMLButtonElement;
        backBtn.click();
        fixture.detectChanges();

        expect(el.querySelector('.onboard__title')?.textContent).toContain('Create your first agent');
    });

    // ──────────────────────────────────────────────
    // Agent creation
    // ──────────────────────────────────────────────
    it('should create agent with correct params', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.createAgent).toHaveBeenCalled());

        expect(mockAgentService.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Builder',
                provider: 'anthropic',
                defaultProjectId: 'proj-1',
            }),
        );
    });

    it('should advance to done step after creation', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.createAgent).toHaveBeenCalled());
        fixture.detectChanges();

        expect(el.querySelector('.onboard__done-icon')).toBeTruthy();
        expect(el.querySelector('.onboard__title')?.textContent).toContain('Builder is ready');
    });

    it('should reload agents after creation', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.loadAgents).toHaveBeenCalled());
    });

    it('should disable submit while creating', async () => {
        mockAgentService.createAgent.mockImplementation(() => new Promise(() => {}));

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        fixture.detectChanges();

        expect(submitBtn.disabled).toBe(true);
        expect(submitBtn.textContent?.trim()).toBe('Creating...');
    });

    it('should not submit if form is invalid', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Pick custom (empty name)
        const cards = el.querySelectorAll('.tpl-card');
        (cards[4] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        expect(submitBtn.disabled).toBe(true);
    });

    it('should show error notification on creation failure', async () => {
        mockAgentService.createAgent.mockRejectedValue(new Error('API error'));

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockNotify.error).toHaveBeenCalled());

        expect(mockNotify.error).toHaveBeenCalledWith(
            'Failed to create agent',
            expect.stringContaining('Error'),
        );
    });

    it('should reset creating flag after failure', async () => {
        mockAgentService.createAgent.mockRejectedValue(new Error('API error'));

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockNotify.error).toHaveBeenCalled());
        fixture.detectChanges();

        expect(submitBtn.disabled).toBe(false);
    });

    // ──────────────────────────────────────────────
    // Project handling
    // ──────────────────────────────────────────────
    it('should use existing project if available', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.createAgent).toHaveBeenCalled());

        expect(mockProjectService.createProject).not.toHaveBeenCalled();
        expect(mockAgentService.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({ defaultProjectId: 'proj-1' }),
        );
    });

    it('should create default project if none exist', async () => {
        mockProjectService.projects = signal([]);

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockProjectService.createProject).toHaveBeenCalled());

        expect(mockProjectService.createProject).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Default' }),
        );
    });

    // ──────────────────────────────────────────────
    // guessProvider
    // ──────────────────────────────────────────────
    it('should infer anthropic provider for claude models', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Default model starts with "claude"
        const submitBtn = el.querySelector('.btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.createAgent).toHaveBeenCalled());

        expect(mockAgentService.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'anthropic' }),
        );
    });

    // ──────────────────────────────────────────────
    // Done step
    // ──────────────────────────────────────────────
    it('should emit done when Start chatting is clicked', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const emitSpy = vi.spyOn(component.done, 'emit');

        const cards = el.querySelectorAll('.tpl-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Call createAgent directly to await the full async chain
        await component.createAgent();
        fixture.detectChanges();

        const startBtn = el.querySelector('.onboard__done-actions .btn--primary') as HTMLButtonElement;
        expect(startBtn).toBeTruthy();
        startBtn.click();

        expect(emitSpy).toHaveBeenCalled();
    });
});
