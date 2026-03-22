import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WelcomeWizardComponent } from './welcome-wizard.component';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { SessionService } from '../../core/services/session.service';
import { ApiService } from '../../core/services/api.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';

describe('WelcomeWizardComponent', () => {
    let fixture: ComponentFixture<WelcomeWizardComponent>;
    let component: WelcomeWizardComponent;
    let el: HTMLElement;
    let router: Router;

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
        projects: signal([]),
        loading: signal(false),
        loadProjects: vi.fn(async () => {}),
    };

    const mockSessionService = {
        sessions: signal([]),
        loading: signal(false),
    };

    const healthyResponse = {
        dependencies: {
            database: { status: 'healthy' },
            github: { status: 'healthy' },
            algorand: { status: 'healthy' },
            llm: { status: 'healthy' },
            apiKey: { status: 'healthy' },
        },
    };

    const mockProviders = [
        { type: 'anthropic', name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
        { type: 'ollama', name: 'Ollama', defaultModel: 'llama3', models: ['llama3', 'codellama'] },
    ];

    const mockApiService = {
        get: vi.fn((url: string) => {
            if (url === '/health') return of(healthyResponse);
            if (url === '/providers') return of(mockProviders);
            return of([]);
        }),
        post: vi.fn(() => of({})),
    };

    function createComponent(): ComponentFixture<WelcomeWizardComponent> {
        fixture = TestBed.createComponent(WelcomeWizardComponent);
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
            if (url === '/health') return of(healthyResponse);
            if (url === '/providers') return of(mockProviders);
            return of([]);
        });
        mockApiService.post = vi.fn(() => of({}));
        mockProjectService.loadProjects = vi.fn(async () => {});
        TestBed.configureTestingModule({
            imports: [WelcomeWizardComponent],
            providers: [
                provideRouter([]),
                { provide: AgentService, useValue: mockAgentService },
                { provide: ProjectService, useValue: mockProjectService },
                { provide: SessionService, useValue: mockSessionService },
                { provide: ApiService, useValue: mockApiService },
            ],
        });
        router = TestBed.inject(Router);
    });

    afterEach(() => {
        fixture?.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render the wizard with welcome title', () => {
        createComponent();
        expect(el.querySelector('.wizard__title')?.textContent).toContain('Welcome to Corvid Agent');
    });

    it('should show the create step initially', () => {
        createComponent();
        expect(el.querySelector('.step__title')?.textContent).toContain('Create Your First Agent');
    });

    it('should render all 5 template cards', () => {
        createComponent();
        const cards = el.querySelectorAll('.template-card');
        expect(cards.length).toBe(5);
    });

    it('should show progress dots', () => {
        createComponent();
        const dots = el.querySelectorAll('.progress-dot');
        expect(dots.length).toBe(2);
    });

    it('should not show form before template selection', () => {
        createComponent();
        expect(el.querySelector('.wizard__form')).toBeNull();
    });

    // ──────────────────────────────────────────────
    // Template selection
    // ──────────────────────────────────────────────
    it('should show form after selecting a template', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(el.querySelector('.wizard__form')).toBeTruthy();
    });

    it('should set suggested name when selecting a template with one', async () => {
        createComponent();
        await component.ngOnInit();

        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click(); // Full Stack → "Builder"
        fixture.detectChanges();

        const nameInput = el.querySelector('#wiz-name') as HTMLInputElement;
        expect(nameInput.value).toBe('Builder');
    });

    it('should clear name when selecting custom template', async () => {
        createComponent();
        await component.ngOnInit();

        // First select a template with a name
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Then select custom (last card)
        (cards[4] as HTMLButtonElement).click();
        fixture.detectChanges();

        const nameInput = el.querySelector('#wiz-name') as HTMLInputElement;
        expect(nameInput.value).toBe('');
    });

    it('should mark selected template with data-selected attribute', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.template-card');
        (cards[1] as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(cards[1].getAttribute('data-selected')).toBe('true');
        expect(cards[0].getAttribute('data-selected')).not.toBe('true');
    });

    // ──────────────────────────────────────────────
    // Provider / model handling
    // ──────────────────────────────────────────────
    it('should load providers on init', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        expect(mockApiService.get).toHaveBeenCalledWith('/providers');
    });

    it('should load health status on init', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        expect(mockApiService.get).toHaveBeenCalledWith('/health');
    });

    it('should set default provider and model from first provider', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select a template to see the form
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const providerSelect = el.querySelector('#wiz-provider') as HTMLSelectElement;
        expect(providerSelect.value).toBe('anthropic');
    });

    // ──────────────────────────────────────────────
    // Health status
    // ──────────────────────────────────────────────
    it('should not show warning when LLM provider is healthy', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        expect(el.querySelector('.wizard__warning')).toBeNull();
    });

    it('should show warning when no AI provider detected', async () => {
        mockApiService.get.mockImplementation((url: string) => {
            if (url === '/health') return of({
                dependencies: {
                    database: { status: 'healthy' },
                    github: { status: 'unhealthy' },
                    algorand: { status: 'unhealthy' },
                    llm: { status: 'unhealthy' },
                    apiKey: { status: 'unhealthy' },
                },
            });
            if (url === '/providers') return of(mockProviders);
            return of([]);
        });

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const warning = el.querySelector('.wizard__warning');
        expect(warning).toBeTruthy();
        expect(warning?.textContent).toContain('No AI provider detected');
    });

    it('should handle health check failure gracefully', async () => {
        mockApiService.get.mockImplementation((url: string) => {
            if (url === '/health') return throwError(() => new Error('network error'));
            if (url === '/providers') return of(mockProviders);
            return of([]);
        });

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Should not throw — component handles the error
        expect(component).toBeTruthy();
    });

    // ──────────────────────────────────────────────
    // Agent creation
    // ──────────────────────────────────────────────
    it('should create agent when form is submitted', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select template and fill form
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.wizard__btn--primary') as HTMLButtonElement;
        submitBtn.click();
        await vi.waitFor(() => expect(mockAgentService.createAgent).toHaveBeenCalled());

        expect(mockAgentService.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Builder' }),
        );
    });

    it('should advance to done step after creation', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Call directly to await the full async chain
        await (component as any).onCreateAgent();
        fixture.detectChanges();

        expect(el.querySelector('.done__icon')).toBeTruthy();
        expect(el.querySelector('.step__title')?.textContent).toContain('is ready');
    });

    it('should disable submit button while creating', async () => {
        // Make createAgent slow so we can check the button state
        mockAgentService.createAgent.mockImplementation(() => new Promise(() => {}));

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.wizard__btn--primary') as HTMLButtonElement;
        submitBtn.click();
        fixture.detectChanges();

        expect(submitBtn.disabled).toBe(true);
        expect(submitBtn.textContent?.trim()).toBe('Creating...');
    });

    it('should not submit if form is invalid (empty name)', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select custom template (no suggested name)
        const cards = el.querySelectorAll('.template-card');
        (cards[4] as HTMLButtonElement).click();
        fixture.detectChanges();

        const submitBtn = el.querySelector('.wizard__btn--primary') as HTMLButtonElement;
        expect(submitBtn.disabled).toBe(true);
    });

    // ──────────────────────────────────────────────
    // Skill bundles
    // ──────────────────────────────────────────────
    it('should display skill tags for templates with bundles', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select code reviewer (has 2 bundles)
        const cards = el.querySelectorAll('.template-card');
        (cards[1] as HTMLButtonElement).click();
        fixture.detectChanges();

        const tags = el.querySelectorAll('.skill-tag');
        expect(tags.length).toBe(2);
    });

    it('should not display skill tags for custom template', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const cards = el.querySelectorAll('.template-card');
        (cards[4] as HTMLButtonElement).click();
        fixture.detectChanges();

        const tags = el.querySelectorAll('.skill-tag');
        expect(tags.length).toBe(0);
    });

    it('should assign skill bundles after creating agent', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select Full Stack (1 bundle)
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Call directly to await the full async chain including skill assignment
        await (component as any).onCreateAgent();

        expect(mockAgentService.createAgent).toHaveBeenCalled();
        expect(mockApiService.post).toHaveBeenCalledWith(
            '/agents/agent-1/skills',
            expect.objectContaining({ bundleId: 'preset-full-stack' }),
        );
    });

    // ──────────────────────────────────────────────
    // formatBundleId
    // ──────────────────────────────────────────────
    it('should format bundle IDs correctly', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Select code reviewer to see bundles
        const cards = el.querySelectorAll('.template-card');
        (cards[1] as HTMLButtonElement).click();
        fixture.detectChanges();

        const tags = el.querySelectorAll('.skill-tag');
        const texts = Array.from(tags).map((t) => t.textContent?.trim());
        expect(texts).toContain('Code Reviewer');
        expect(texts).toContain('Github Ops');
    });

    // ──────────────────────────────────────────────
    // Navigation (done step)
    // ──────────────────────────────────────────────
    it('should navigate to /chat when Start Chatting is clicked', async () => {
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        // Create an agent to get to done step
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Call onCreateAgent directly to ensure we await the full async chain
        await (component as any).onCreateAgent();
        fixture.detectChanges();

        const startChatBtn = el.querySelector('.done__actions .wizard__btn--primary') as HTMLButtonElement;
        expect(startChatBtn).toBeTruthy();
        startChatBtn.click();

        expect(navigateSpy).toHaveBeenCalledWith(['/chat']);
    });

    it('should emit agentCreated when Go to Dashboard is clicked', async () => {
        createComponent();
        await component.ngOnInit();
        fixture.detectChanges();

        const emitSpy = vi.spyOn(component.agentCreated, 'emit');

        // Create agent
        const cards = el.querySelectorAll('.template-card');
        (cards[0] as HTMLButtonElement).click();
        fixture.detectChanges();

        // Call onCreateAgent directly to await the full async chain
        await (component as any).onCreateAgent();
        fixture.detectChanges();

        // Find Go to Dashboard button (non-primary button in done actions)
        const buttons = el.querySelectorAll('.done__actions .wizard__btn');
        const dashboardBtn = Array.from(buttons).find(
            (b) => !b.classList.contains('wizard__btn--primary'),
        ) as HTMLButtonElement;
        expect(dashboardBtn).toBeTruthy();
        dashboardBtn.click();

        expect(emitSpy).toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────
    // Footer
    // ──────────────────────────────────────────────
    it('should render docs link in footer', () => {
        createComponent();
        const footer = el.querySelector('.wizard__footer');
        expect(footer?.textContent).toContain('Docs');
        expect(footer?.textContent).toContain('Algorand');
    });
});
