import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Component, input } from '@angular/core';
import { AgentFormComponent } from './agent-form.component';
import { AgentService } from '../../core/services/agent.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { of } from 'rxjs';

/**
 * Test host component that wraps AgentFormComponent,
 * allowing us to set the optional `id` input.
 */
@Component({
    selector: 'app-test-host',
    template: `<app-agent-form [id]="id()" />`,
    imports: [AgentFormComponent],
})
class TestHostComponent {
    readonly id = input<string | undefined>(undefined);
}

describe('AgentFormComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostEl: HTMLElement;

    const mockAgentService = {
        agents: signal([]),
        loading: signal(false),
        loadAgents: vi.fn(async () => {}),
        getAgent: vi.fn(),
        createAgent: vi.fn(async (input: Record<string, unknown>) => ({
            id: 'a-new',
            ...input,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })),
        updateAgent: vi.fn(),
    };

    const mockProjectService = {
        projects: signal([]),
        loading: signal(false),
        loadProjects: vi.fn(async () => {}),
    };

    const mockApiService = {
        get: vi.fn(() => of([])),
        post: vi.fn(() => of({})),
    };

    function createComponent(): ComponentFixture<TestHostComponent> {
        fixture = TestBed.createComponent(TestHostComponent);
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TestHostComponent, AgentFormComponent],
            providers: [
                provideRouter([]),
                { provide: AgentService, useValue: mockAgentService },
                { provide: ProjectService, useValue: mockProjectService },
                { provide: ApiService, useValue: mockApiService },
            ],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render form with New Agent title', () => {
        createComponent();
        const h2 = hostEl.querySelector('h2');
        expect(h2).toBeTruthy();
        expect(h2!.textContent).toContain('New Agent');
    });

    it('should render name input', () => {
        createComponent();
        const nameInput = hostEl.querySelector<HTMLInputElement>('#name');
        expect(nameInput).toBeTruthy();
    });

    it('should render description textarea', () => {
        createComponent();
        const desc = hostEl.querySelector<HTMLTextAreaElement>('#description');
        expect(desc).toBeTruthy();
    });

    it('should render permission mode select', () => {
        createComponent();
        const select = hostEl.querySelector<HTMLSelectElement>('#permissionMode');
        expect(select).toBeTruthy();
        const options = select!.querySelectorAll('option');
        expect(options.length).toBeGreaterThanOrEqual(4);
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
});
