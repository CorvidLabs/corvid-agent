import { Injectable, signal } from '@angular/core';

export interface TourStep {
    id: string;
    title: string;
    content: string;
    /** CSS selector for the element to spotlight */
    selector: string;
    /** Where to place the tooltip relative to the target */
    placement: 'top' | 'bottom' | 'left' | 'right';
}

const DASHBOARD_TOUR: TourStep[] = [
    {
        id: 'agent-card',
        title: 'Meet your agent',
        content: 'This is your AI developer. It can write code, review PRs, research topics, and more. Click it to see details and manage skills.',
        selector: '.agent-card',
        placement: 'bottom',
    },
    {
        id: 'start-session',
        title: 'Start a conversation',
        content: 'Click the Chat tab to open a conversation. Type what you want built, fixed, or figured out — your agent takes it from there.',
        selector: '.topnav__tab-wrapper:first-child',
        placement: 'bottom',
    },
    {
        id: 'metrics',
        title: 'Track your usage',
        content: 'These cards show sessions, costs, and work tasks at a glance. Everything updates in real time.',
        selector: '[data-widget="metrics"]',
        placement: 'bottom',
    },
    {
        id: 'command-palette',
        title: 'Quick actions',
        content: 'Press Cmd+K (or Ctrl+K) to open the command palette. Jump to any page, start sessions, or search — all from the keyboard.',
        selector: '.topnav__search-btn',
        placement: 'bottom',
    },
    {
        id: 'try-prompts',
        title: 'Try these prompts',
        content: '"Fix the failing tests in my repo"\n"Review PR #42 and leave comments"\n"Add dark mode to the settings page"\n"Research best practices for rate limiting"',
        selector: '.simple-hero__btn, .agent-card__actions',
        placement: 'top',
    },
];

const STORAGE_KEY = 'corvid_tour_completed';

@Injectable({ providedIn: 'root' })
export class GuidedTourService {
    readonly active = signal(false);
    readonly currentStepIndex = signal(0);
    readonly steps = signal<TourStep[]>(DASHBOARD_TOUR);

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
    }

    next(): void {
        const idx = this.currentStepIndex();
        if (idx < this.steps().length - 1) {
            this.currentStepIndex.set(idx + 1);
        } else {
            this.complete();
        }
    }

    prev(): void {
        const idx = this.currentStepIndex();
        if (idx > 0) {
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
}
