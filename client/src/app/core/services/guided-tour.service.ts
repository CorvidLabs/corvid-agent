import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface TourStep {
    id: string;
    title: string;
    content: string;
    /** CSS selector for the element to spotlight */
    selector: string;
    /** Where to place the tooltip relative to the target */
    placement: 'top' | 'bottom' | 'left' | 'right';
    /** Route to navigate to before showing this step */
    route?: string;
}

const ONBOARDING_TOUR: TourStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to CorvidAgent',
        content:
            'This is a 60-second tour of the platform. Three tabs: Chat, Agents, Settings — that is all you need. You can replay this anytime via the command palette (Cmd+K).',
        selector: '.topnav__logo',
        placement: 'bottom',
    },
    {
        id: 'chat-home',
        title: 'Start a conversation',
        content:
            'Chat is your home screen. Type what you want built, fixed, or researched. Pick an agent and project, then hit send. Your agent takes it from there.',
        selector: '.chat-home__input-card',
        placement: 'bottom',
        route: '/chat',
    },
    {
        id: 'chat-templates',
        title: 'Quick-start templates',
        content:
            'Not sure where to begin? These templates give you ready-made prompts — just click one to start.',
        selector: '.chat-home__templates',
        placement: 'top',
        route: '/chat',
    },
    {
        id: 'agents-tab',
        title: 'Manage your agents',
        content:
            'The Agents tab is where you create, configure, and manage your AI developers. Each agent has a model, skills, and persona.',
        selector: '.topnav__tabs',
        placement: 'bottom',
    },
    {
        id: 'sessions',
        title: 'Find your results',
        content:
            'Every conversation, work task, and council lives under Chat. See real-time output, file changes, and tool calls. Completed work shows up with PRs linked.',
        selector: '.tab-shell__tabs',
        placement: 'bottom',
        route: '/sessions',
    },
    {
        id: 'activity-rail',
        title: 'Live activity',
        content:
            'The right panel shows active sessions and system status at a glance. It updates in real time via WebSocket.',
        selector: '.rail',
        placement: 'left',
    },
    {
        id: 'command-palette',
        title: 'Navigate with Cmd+K',
        content:
            'Press Cmd+K (or Ctrl+K) to open the command palette. Jump to any page, start sessions, or search — all from the keyboard. You can also use Cmd+T for new tabs and Cmd+1-9 to switch between them.',
        selector: '.topnav__search-btn',
        placement: 'bottom',
    },
    {
        id: 'try-prompts',
        title: 'Try these prompts',
        content:
            '"Fix the failing tests in my repo"\n"Review PR #42 and leave comments"\n"Write tests for the auth module"\n"Research best practices for rate limiting"',
        selector: '.chat-home__input-card',
        placement: 'bottom',
        route: '/chat',
    },
];

const STORAGE_KEY = 'corvid_tour_completed';

@Injectable({ providedIn: 'root' })
export class GuidedTourService {
    private readonly router = inject(Router);

    readonly active = signal(false);
    readonly currentStepIndex = signal(0);
    readonly steps = signal<TourStep[]>(ONBOARDING_TOUR);

    readonly currentStep = () => {
        const idx = this.currentStepIndex();
        const s = this.steps();
        return idx >= 0 && idx < s.length ? s[idx] : null;
    };

    get isCompleted(): boolean {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    }

    startTour(): void {
        this.currentStepIndex.set(0);
        this.active.set(true);
        this.navigateToStep(this.steps()[0]);
    }

    async next(): Promise<void> {
        const idx = this.currentStepIndex();
        if (idx < this.steps().length - 1) {
            const nextStep = this.steps()[idx + 1];
            await this.navigateToStep(nextStep);
            this.currentStepIndex.set(idx + 1);
        } else {
            this.complete();
        }
    }

    async prev(): Promise<void> {
        const idx = this.currentStepIndex();
        if (idx > 0) {
            const prevStep = this.steps()[idx - 1];
            await this.navigateToStep(prevStep);
            this.currentStepIndex.set(idx - 1);
        }
    }

    skip(): void {
        this.complete();
    }

    complete(): void {
        this.active.set(false);
        localStorage.setItem(STORAGE_KEY, 'true');
    }

    /** Reset so tour can be replayed */
    reset(): void {
        localStorage.removeItem(STORAGE_KEY);
    }

    private async navigateToStep(step: TourStep): Promise<void> {
        if (step.route && this.router.url !== step.route) {
            await this.router.navigateByUrl(step.route);
        }
    }
}
