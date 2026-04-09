import { g as i } from './chunk-G7DVZDMF.js';
import { O as n, ja as o, T as r } from './chunk-LF4EWAJA.js';

var l = [
    {
      id: 'welcome',
      title: 'Welcome to CorvidAgent',
      content:
        'This is a 60-second tour of the platform. Three tabs: Chat, Agents, Settings \u2014 that is all you need. You can replay this anytime via the command palette (Cmd+K).',
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
      content: 'Not sure where to begin? These templates give you ready-made prompts \u2014 just click one to start.',
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
        'Press Cmd+K (or Ctrl+K) to open the command palette. Jump to any page, start sessions, or search \u2014 all from the keyboard. You can also use Cmd+T for new tabs and Cmd+1-9 to switch between them.',
      selector: '.topnav__search-btn',
      placement: 'bottom',
    },
    {
      id: 'try-prompts',
      title: 'Try these prompts',
      content: `"Fix the failing tests in my repo"
"Review PR #42 and leave comments"
"Write tests for the auth module"
"Research best practices for rate limiting"`,
      selector: '.chat-home__input-card',
      placement: 'bottom',
      route: '/chat',
    },
  ],
  s = 'corvid_tour_completed',
  c = class a {
    router = r(i);
    active = o(!1);
    currentStepIndex = o(0);
    steps = o(l);
    currentStep = () => {
      const t = this.currentStepIndex(),
        e = this.steps();
      return t >= 0 && t < e.length ? e[t] : null;
    };
    get isCompleted() {
      return localStorage.getItem(s) === 'true';
    }
    startTour() {
      this.currentStepIndex.set(0), this.active.set(!0), this.navigateToStep(this.steps()[0]);
    }
    async next() {
      const t = this.currentStepIndex();
      if (t < this.steps().length - 1) {
        const e = this.steps()[t + 1];
        await this.navigateToStep(e), this.currentStepIndex.set(t + 1);
      } else this.complete();
    }
    async prev() {
      const t = this.currentStepIndex();
      if (t > 0) {
        const e = this.steps()[t - 1];
        await this.navigateToStep(e), this.currentStepIndex.set(t - 1);
      }
    }
    skip() {
      this.complete();
    }
    complete() {
      this.active.set(!1), localStorage.setItem(s, 'true');
    }
    reset() {
      localStorage.removeItem(s);
    }
    async navigateToStep(t) {
      t.route && this.router.url !== t.route && (await this.router.navigateByUrl(t.route));
    }
    static \u0275fac = (e) => new (e || a)();
    static \u0275prov = n({ token: a, factory: a.\u0275fac, providedIn: 'root' });
  };

export { c as a };
