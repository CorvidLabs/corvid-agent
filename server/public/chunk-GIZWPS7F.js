import { a as K } from './chunk-5EOQQV4Z.js';
import { a as W } from './chunk-A4KCXO2Q.js';
import './chunk-OFKXBWQC.js';
import {
  l as ee,
  c as I,
  s as ie,
  i as J,
  q as ne,
  d as Q,
  b as q,
  m as te,
  g as U,
  j as X,
  e as Y,
  k as Z,
} from './chunk-AF4UDQOX.js';
import { a as M } from './chunk-CSQXEU3M.js';
import { a as P } from './chunk-CZZRTCER.js';
import { a as k } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import { g as L } from './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as G } from './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  zb as _,
  fc as $,
  hc as B,
  mb as b,
  ib as C,
  Na as c,
  Gb as D,
  Mb as F,
  ob as f,
  T as g,
  Hb as H,
  ja as h,
  q as j,
  Bb as l,
  Y as m,
  Fb as N,
  pb as n,
  qb as o,
  Z as p,
  Rb as R,
  Ob as r,
  _a as S,
  Qb as T,
  Pb as u,
  nb as v,
  rb as w,
  vb as x,
  jb as y,
  lb as z,
} from './chunk-LF4EWAJA.js';

var ce = (_i, t) => t.id,
  se = (_i, t) => t.name;
function le(i, t) {
  if (i & 1) {
    const e = x();
    n(0, 'button', 8),
      _('click', () => {
        const a = m(e).$implicit,
          d = l(2);
        return p(d.pickTemplate(a));
      }),
      n(1, 'span', 9),
      r(2),
      o(),
      n(3, 'span', 10),
      r(4),
      o(),
      n(5, 'span', 11),
      r(6),
      o()();
  }
  if (i & 2) {
    const e = t.$implicit;
    c(2), u(e.icon), c(2), u(e.name), c(2), u(e.description);
  }
}
function de(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'div', 2)(1, 'h1', 3),
      r(2, 'Create your first agent'),
      o(),
      n(3, 'p', 4),
      r(4, 'Pick a template to get started in 60 seconds. You can customize everything later.'),
      o()(),
      n(5, 'div', 5),
      b(6, le, 7, 3, 'button', 6, ce),
      o(),
      n(8, 'button', 7),
      _('click', () => {
        m(e);
        const a = l();
        return p(a.skipOnboarding());
      }),
      r(9, " Skip \u2014 I'll set things up manually "),
      o();
  }
  if (i & 2) {
    const e = l();
    c(6), v(e.templates);
  }
}
function me(i, t) {
  if ((i & 1 && (n(0, 'option', 21), r(1), o()), i & 2)) {
    const e = t.$implicit,
      s = l().$implicit;
    f('value', e), c(), R('', s.name, ': ', e);
  }
}
function pe(i, t) {
  if ((i & 1 && b(0, me, 2, 3, 'option', 21, z), i & 2)) {
    const e = t.$implicit;
    v(e.models);
  }
}
function _e(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'div', 2)(1, 'h1', 3),
      r(2, 'Almost there'),
      o(),
      n(3, 'p', 4),
      r(4, 'Give your agent a name and pick a model.'),
      o()(),
      n(5, 'form', 12),
      _('ngSubmit', () => {
        m(e);
        const a = l();
        return p(a.createAgent());
      }),
      n(6, 'div', 13)(7, 'label', 14),
      r(8, 'Agent name'),
      o(),
      w(9, 'input', 15),
      o(),
      n(10, 'div', 13)(11, 'label', 16),
      r(12, 'Model'),
      o(),
      n(13, 'select', 17),
      b(14, pe, 2, 0, null, null, se),
      o()(),
      n(16, 'div', 18)(17, 'button', 19),
      _('click', () => {
        m(e);
        const a = l();
        return p(a.step.set('pick'));
      }),
      r(18, 'Back'),
      o(),
      n(19, 'button', 20),
      r(20),
      o()()();
  }
  if (i & 2) {
    const e = l();
    c(5),
      f('formGroup', e.form),
      c(9),
      v(e.providers()),
      c(5),
      f('disabled', e.form.invalid || e.creating()),
      c(),
      T(' ', e.creating() ? 'Creating...' : 'Create Agent', ' ');
  }
}
function ge(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'div', 1)(1, 'div', 22),
      r(2, '\u2713'),
      o(),
      n(3, 'h1', 3),
      r(4),
      o(),
      n(5, 'p', 4),
      r(6, 'Start a conversation or explore the platform.'),
      o(),
      n(7, 'div', 23)(8, 'button', 24),
      _('click', () => {
        m(e);
        const a = l();
        return p(a.done.emit());
      }),
      r(9, ' Start chatting '),
      o()()();
  }
  if (i & 2) {
    const e = l();
    c(4), T('', e.createdAgentName(), ' is ready');
  }
}
var he = [
    {
      id: 'full-stack',
      name: 'Full Stack Developer',
      suggestedName: 'Builder',
      description: 'Reads and edits code, manages PRs, creates work tasks. The all-rounder.',
      icon: '<>',
    },
    {
      id: 'code-reviewer',
      name: 'Code Reviewer',
      suggestedName: 'Reviewer',
      description: 'Reviews pull requests, catches bugs, and provides actionable feedback.',
      icon: 'PR',
    },
    {
      id: 'researcher',
      name: 'Researcher',
      suggestedName: 'Scout',
      description: 'Deep research, information gathering, and knowledge management.',
      icon: '??',
    },
    {
      id: 'assistant',
      name: 'General Assistant',
      suggestedName: 'Assistant',
      description: 'Research, writing, analysis, and automation. Your AI helper.',
      icon: 'AI',
    },
    {
      id: 'custom',
      name: 'Custom Agent',
      suggestedName: '',
      description: 'Start from scratch. Choose your own name, model, and tools.',
      icon: '++',
    },
  ],
  O = class i {
    agentService = g(P);
    projectService = g(k);
    apiService = g(G);
    notify = g(M);
    fb = g(ne);
    done = B();
    templates = he;
    step = h('pick');
    creating = h(!1);
    providers = h([]);
    createdAgentName = h('');
    selectedTemplate = null;
    form = this.fb.nonNullable.group({ name: ['', I.required], model: ['claude-sonnet-4-20250514', I.required] });
    async ngOnInit() {
      try {
        const t = await j(this.apiService.get('/providers'));
        this.providers.set(t);
      } catch {}
    }
    pickTemplate(t) {
      (this.selectedTemplate = t),
        t.suggestedName ? this.form.patchValue({ name: t.suggestedName }) : this.form.patchValue({ name: '' }),
        this.step.set('customize');
    }
    skipOnboarding() {
      this.done.emit();
    }
    async createAgent() {
      if (!(this.form.invalid || this.creating())) {
        this.creating.set(!0);
        try {
          const { name: t, model: e } = this.form.getRawValue(),
            s = this.selectedTemplate;
          await this.projectService.loadProjects();
          let a = this.projectService.projects()[0]?.id;
          a ||
            (a = (
              await this.projectService.createProject({
                name: 'Default',
                description: 'Default project',
                workingDir: '.',
              })
            ).id),
            await this.agentService.createAgent({
              name: t,
              model: e,
              provider: this.guessProvider(e),
              defaultProjectId: a,
              description: s?.description || '',
              permissionMode: 'default',
            }),
            this.createdAgentName.set(t),
            this.step.set('done'),
            await this.agentService.loadAgents();
        } catch (t) {
          this.notify.error('Failed to create agent', String(t));
        } finally {
          this.creating.set(!1);
        }
      }
    }
    guessProvider(t) {
      return t.startsWith('claude')
        ? 'anthropic'
        : t.startsWith('gpt') || t.startsWith('o1') || t.startsWith('o3')
          ? 'openai'
          : t.includes(':')
            ? 'ollama'
            : 'anthropic';
    }
    static \u0275fac = (e) => new (e || i)();
    static \u0275cmp = S({
      type: i,
      selectors: [['app-onboarding']],
      outputs: { done: 'done' },
      decls: 4,
      vars: 3,
      consts: [
        [1, 'onboard'],
        [1, 'onboard__done'],
        [1, 'onboard__hero'],
        [1, 'onboard__title'],
        [1, 'onboard__sub'],
        [1, 'onboard__templates'],
        ['type', 'button', 1, 'tpl-card'],
        ['type', 'button', 1, 'onboard__skip', 3, 'click'],
        ['type', 'button', 1, 'tpl-card', 3, 'click'],
        [1, 'tpl-card__icon'],
        [1, 'tpl-card__name'],
        [1, 'tpl-card__desc'],
        [1, 'onboard__form', 3, 'ngSubmit', 'formGroup'],
        [1, 'field'],
        ['for', 'agent-name', 1, 'field__label'],
        [
          'id',
          'agent-name',
          'formControlName',
          'name',
          'placeholder',
          'e.g. Builder, Scout, Helper',
          'autocomplete',
          'off',
          1,
          'field__input',
        ],
        ['for', 'agent-model', 1, 'field__label'],
        ['id', 'agent-model', 'formControlName', 'model', 1, 'field__input'],
        [1, 'onboard__form-actions'],
        ['type', 'button', 1, 'btn', 'btn--ghost', 3, 'click'],
        ['type', 'submit', 1, 'btn', 'btn--primary', 3, 'disabled'],
        [3, 'value'],
        [1, 'onboard__done-icon'],
        [1, 'onboard__done-actions'],
        ['type', 'button', 1, 'btn', 'btn--primary', 'btn--large', 3, 'click'],
      ],
      template: (e, s) => {
        e & 1 && (n(0, 'div', 0), C(1, de, 10, 0), C(2, _e, 21, 3), C(3, ge, 10, 1, 'div', 1), o()),
          e & 2 &&
            (c(),
            y(s.step() === 'pick' ? 1 : -1),
            c(),
            y(s.step() === 'customize' ? 2 : -1),
            c(),
            y(s.step() === 'done' ? 3 : -1));
      },
      dependencies: [ie, U, ee, te, q, Z, Q, Y, X, J],
      styles: [
        '.onboard[_ngcontent-%COMP%]{max-width:640px;margin:0 auto;padding:3rem 1.5rem;text-align:center}.onboard__hero[_ngcontent-%COMP%]{margin-bottom:2rem}.onboard__title[_ngcontent-%COMP%]{font-size:1.4rem;font-weight:700;color:var(--text-primary);margin:0 0 .5rem}.onboard__sub[_ngcontent-%COMP%]{font-size:.82rem;color:var(--text-tertiary);margin:0}.onboard__templates[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem;margin-bottom:1.5rem}.tpl-card[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.25rem 1rem;background:#0f101899;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.05);border-radius:var(--radius-lg, 10px);color:var(--text-secondary);font-family:inherit;cursor:pointer;transition:border-color .25s,background .25s,box-shadow .25s,transform .2s;text-align:center;position:relative}.tpl-card[_ngcontent-%COMP%]:hover{border-color:#00e5ff4d;background:#00e5ff0f;box-shadow:0 8px 32px #0000004d,0 0 20px #00e5ff14;transform:translateY(-2px)}.tpl-card__icon[_ngcontent-%COMP%]{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#00e5ff1f,#ff00aa0f);border:1px solid rgba(0,229,255,.15);border-radius:12px;font-size:.7rem;font-weight:800;color:var(--accent-cyan);letter-spacing:.05em;box-shadow:0 2px 12px #00e5ff14}.tpl-card__name[_ngcontent-%COMP%]{font-size:.82rem;font-weight:700;color:var(--text-primary)}.tpl-card__desc[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);line-height:1.4}.onboard__skip[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-tertiary);font-family:inherit;font-size:.7rem;cursor:pointer;text-decoration:underline;transition:color .15s}.onboard__skip[_ngcontent-%COMP%]:hover{color:var(--text-secondary)}.onboard__form[_ngcontent-%COMP%]{text-align:left;max-width:400px;margin:0 auto}.field[_ngcontent-%COMP%]{margin-bottom:1rem}.field__label[_ngcontent-%COMP%]{display:block;margin-bottom:.35rem;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)}.field__input[_ngcontent-%COMP%]{width:100%;padding:.6rem .75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius, 6px);color:var(--text-primary);font-family:inherit;font-size:.82rem;box-sizing:border-box}.field__input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan);box-shadow:0 0 0 1px #00e5ff33}.onboard__form-actions[_ngcontent-%COMP%]{display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.5rem}.btn[_ngcontent-%COMP%]{padding:.5rem 1.25rem;border-radius:var(--radius, 6px);font-size:.78rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;transition:background .15s,box-shadow .15s}.btn--primary[_ngcontent-%COMP%]{background:linear-gradient(135deg,#00e5ff1f,#00e5ff0f);color:var(--accent-cyan);border-color:#00e5ff4d}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:linear-gradient(135deg,#00e5ff33,#00e5ff1a);box-shadow:0 0 20px #00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.btn--ghost[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--ghost[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.btn--large[_ngcontent-%COMP%]{padding:.75rem 2rem;font-size:.9rem}.onboard__done[_ngcontent-%COMP%]{padding:2rem 0}.onboard__done-icon[_ngcontent-%COMP%]{width:64px;height:64px;margin:0 auto 1.5rem;display:flex;align-items:center;justify-content:center;background:var(--accent-cyan-dim);border:2px solid var(--accent-cyan);border-radius:50%;font-size:1.5rem;color:var(--accent-cyan);box-shadow:0 0 24px #00e5ff33}.onboard__done-actions[_ngcontent-%COMP%]{margin-top:1.5rem}@media(max-width:480px){.onboard[_ngcontent-%COMP%]{padding:1.5rem 1rem}.onboard__templates[_ngcontent-%COMP%]{grid-template-columns:1fr 1fr}}',
      ],
      changeDetection: 0,
    });
  };
var ue = ['promptInput'],
  A = (_i, t) => t.id,
  fe = (_i, t) => t.label;
function xe(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'app-onboarding', 2),
      _('done', () => {
        m(e);
        const a = l();
        return p(a.onboardingSkipped.set(!0));
      }),
      o();
  }
}
function be(i, t) {
  if ((i & 1 && (n(0, 'option', 18), r(1), o()), i & 2)) {
    const e = t.$implicit;
    f('value', e.id), c(), u(e.name);
  }
}
function ve(i, t) {
  if ((i & 1 && (n(0, 'option', 18), r(1), o()), i & 2)) {
    const e = t.$implicit;
    f('value', e.id), c(), u(e.name);
  }
}
function Ce(i, _t) {
  i & 1 && (w(0, 'span', 25), r(1, ' Starting... '));
}
function ye(i, _t) {
  i & 1 && (r(0, ' Send '), n(1, 'span', 26), r(2, '\u2192'), o());
}
function we(i, t) {
  if (i & 1) {
    const e = x();
    n(0, 'button', 27),
      _('click', () => {
        const a = m(e).$implicit,
          d = l(2);
        return p(d.useHint(a.prompt));
      }),
      n(1, 'span', 28),
      r(2),
      o(),
      n(3, 'span', 29)(4, 'span', 30),
      r(5),
      o(),
      n(6, 'span', 31),
      r(7),
      o()()();
  }
  if (i & 2) {
    const e = t.$implicit;
    c(2), u(e.icon), c(3), u(e.label), c(2), u(e.desc);
  }
}
function Se(i, t) {
  if (i & 1) {
    const e = x();
    n(0, 'button', 37),
      _('click', () => {
        const a = m(e).$implicit,
          d = l(3);
        return p(d.openSession(a));
      }),
      w(1, 'span', 38),
      n(2, 'span', 39),
      r(3),
      o(),
      n(4, 'span', 40),
      r(5),
      o()();
  }
  if (i & 2) {
    const e = t.$implicit,
      s = l(3);
    c(),
      F('chat-home__recent-status--running', e.status === 'running')(
        'chat-home__recent-status--error',
        e.status === 'error',
      )('chat-home__recent-status--stopped', e.status === 'stopped'),
      c(2),
      u(e.name || e.initialPrompt || 'Untitled'),
      c(2),
      u(s.formatTime(e.updatedAt));
  }
}
function Pe(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'div', 24)(1, 'div', 32)(2, 'h2', 33),
      r(3, 'Recent conversations'),
      o(),
      n(4, 'button', 34),
      _('click', () => {
        m(e);
        const a = l(2);
        return p(a.viewAllSessions());
      }),
      r(5, ' View all \u2192 '),
      o()(),
      n(6, 'div', 35),
      b(7, Se, 6, 8, 'button', 36, A),
      o()();
  }
  if (i & 2) {
    const e = l(2);
    c(7), v(e.recentSessions());
  }
}
function ke(i, _t) {
  if (i & 1) {
    const e = x();
    n(0, 'div', 1),
      w(1, 'div', 3),
      n(2, 'div', 4)(3, 'div', 5)(4, 'div', 6),
      r(5, 'C'),
      o(),
      n(6, 'h1', 7),
      r(7, 'CorvidAgent'),
      o(),
      n(8, 'p', 8),
      r(9, 'What would you like to work on?'),
      o(),
      n(10, 'p', 9)(11, 'kbd'),
      r(12, 'Ctrl'),
      o(),
      r(13, '+'),
      n(14, 'kbd'),
      r(15, 'K'),
      o(),
      r(16, ' command palette '),
      o(),
      n(17, 'div', 10)(18, 'textarea', 11, 0),
      _('input', (a) => {
        m(e);
        const d = l();
        return p(d.onPromptInput(a));
      })('keydown', (a) => {
        m(e);
        const d = l();
        return p(d.onKeydown(a));
      }),
      o(),
      n(20, 'div', 12)(21, 'div', 13)(22, 'div', 14)(23, 'label', 15),
      r(24, 'Agent'),
      o(),
      n(25, 'select', 16),
      _('change', (a) => {
        m(e);
        const d = l();
        return p(d.onAgentChange(a));
      }),
      n(26, 'option', 17),
      r(27, 'Default'),
      o(),
      b(28, be, 2, 2, 'option', 18, A),
      o()(),
      n(30, 'div', 14)(31, 'label', 19),
      r(32, 'Project'),
      o(),
      n(33, 'select', 20),
      _('change', (a) => {
        m(e);
        const d = l();
        return p(d.onProjectChange(a));
      }),
      n(34, 'option', 17),
      r(35, 'Sandbox'),
      o(),
      b(36, ve, 2, 2, 'option', 18, A),
      o()()(),
      n(38, 'button', 21),
      _('click', () => {
        m(e);
        const a = l();
        return p(a.onSend());
      }),
      C(39, Ce, 2, 0)(40, ye, 3, 0),
      o()()(),
      n(41, 'div', 22),
      b(42, we, 8, 3, 'button', 23, fe),
      o(),
      C(44, Pe, 9, 0, 'div', 24),
      o()()();
  }
  if (i & 2) {
    const e = l();
    c(18),
      f('value', e.prompt())('disabled', e.launching()),
      c(7),
      f('value', e.selectedAgentId()),
      c(3),
      v(e.agents()),
      c(5),
      f('value', e.selectedProjectId()),
      c(3),
      v(e.projects()),
      c(2),
      f('disabled', !e.prompt().trim() || e.launching()),
      c(),
      y(e.launching() ? 39 : 40),
      c(3),
      v(e.templates),
      c(2),
      y(e.recentSessions().length > 0 ? 44 : -1);
  }
}
var oe = class i {
  router = g(L);
  agentService = g(P);
  projectService = g(k);
  sessionService = g(W);
  notify = g(M);
  chatTabs = g(K);
  promptInput;
  onboardingSkipped = h(!1);
  showOnboarding = $(() => this.agentService.agents().length === 0 && !this.onboardingSkipped());
  agents = h([]);
  projects = this.projectService.projects;
  prompt = h('');
  selectedAgentId = h('');
  selectedProjectId = h('');
  launching = h(!1);
  recentSessions = h([]);
  templates = [
    {
      icon: '\u{1F50D}',
      label: 'Review a PR',
      desc: 'Analyze code changes and suggest improvements',
      prompt: 'Review my latest PR and suggest improvements',
    },
    {
      icon: '\u{1F527}',
      label: 'Fix tests',
      desc: 'Debug and fix failing test suites',
      prompt: 'Fix the failing tests',
    },
    {
      icon: '\u{1F4DA}',
      label: 'Explain code',
      desc: 'Walk through how a module works',
      prompt: 'Explain this codebase',
    },
    {
      icon: '\u2728',
      label: 'Build a feature',
      desc: 'Implement something new end-to-end',
      prompt: 'Build a new feature',
    },
    {
      icon: '\u{1F6E1}',
      label: 'Security audit',
      desc: 'Scan for vulnerabilities and bad patterns',
      prompt: 'Run a security audit on this codebase and flag any issues',
    },
    {
      icon: '\u{1F4CA}',
      label: 'Refactor',
      desc: 'Clean up code and improve structure',
      prompt: 'Identify areas that need refactoring and improve them',
    },
  ];
  async ngOnInit() {
    await Promise.all([this.agentService.loadAgents(), this.projectService.loadProjects(), this.loadRecentSessions()]),
      this.agents.set(this.agentService.agents());
  }
  ngAfterViewInit() {
    setTimeout(() => this.promptInput?.nativeElement.focus());
  }
  onPromptInput(t) {
    const e = t.target;
    this.prompt.set(e.value), (e.style.height = 'auto'), (e.style.height = `${Math.min(e.scrollHeight, 200)}px`);
  }
  onAgentChange(t) {
    this.selectedAgentId.set(t.target.value);
  }
  onProjectChange(t) {
    this.selectedProjectId.set(t.target.value);
  }
  onKeydown(t) {
    t.key === 'Enter' && !t.shiftKey && (t.preventDefault(), this.onSend());
  }
  useHint(t) {
    this.prompt.set(t), this.promptInput?.nativeElement.focus();
  }
  openSession(t) {
    this.chatTabs.openTab(t.id, (t.name || t.initialPrompt || 'Untitled').slice(0, 40), t.status),
      this.router.navigate(['/sessions', t.id]);
  }
  viewAllSessions() {
    this.router.navigate(['/sessions']);
  }
  formatTime(t) {
    const e = new Date(t),
      a = Date.now() - e.getTime(),
      d = Math.floor(a / 6e4);
    if (d < 1) return 'just now';
    if (d < 60) return `${d}m ago`;
    const E = Math.floor(d / 60);
    if (E < 24) return `${E}h ago`;
    const V = Math.floor(E / 24);
    return V < 7 ? `${V}d ago` : e.toLocaleDateString(void 0, { month: 'short', day: 'numeric' });
  }
  async onSend() {
    const t = this.prompt().trim();
    if (!(!t || this.launching())) {
      this.launching.set(!0);
      try {
        let e = this.selectedProjectId() || void 0;
        if (!e) {
          const a = this.projects().find((d) => d.name.toLowerCase() === 'sandbox');
          a
            ? (e = a.id)
            : (e = (
                await this.projectService.createProject({
                  name: 'Sandbox',
                  description: 'Temporary sandbox workspace',
                  workingDir: '/tmp/corvid-sandbox',
                })
              ).id);
        }
        const s = await this.sessionService.createSession({
          projectId: e,
          agentId: this.selectedAgentId() || void 0,
          initialPrompt: t,
          name: t.slice(0, 60),
        });
        this.chatTabs.openTab(s.id, t.slice(0, 40), 'running'), this.router.navigate(['/sessions', s.id]);
      } catch (e) {
        this.notify.error('Failed to start session', String(e));
      } finally {
        this.launching.set(!1);
      }
    }
  }
  async loadRecentSessions() {
    try {
      await this.sessionService.loadSessions();
      const t = this.sessionService.sessions();
      this.recentSessions.set(t.slice(0, 5));
    } catch {}
  }
  static \u0275fac = (e) => new (e || i)();
  static \u0275cmp = S({
    type: i,
    selectors: [['app-chat-home']],
    viewQuery: (e, s) => {
      if ((e & 1 && N(ue, 5), e & 2)) {
        let a;
        D((a = H())) && (s.promptInput = a.first);
      }
    },
    decls: 2,
    vars: 1,
    consts: [
      ['promptInput', ''],
      [1, 'chat-home'],
      [3, 'done'],
      ['aria-hidden', 'true', 1, 'chat-home__bg-glow'],
      [1, 'chat-home__scroll'],
      [1, 'chat-home__center'],
      ['aria-hidden', 'true', 1, 'chat-home__logo-mark'],
      [1, 'chat-home__title'],
      [1, 'chat-home__subtitle'],
      [1, 'chat-home__shortcut-hint'],
      [1, 'chat-home__input-card'],
      [
        'placeholder',
        'Ask anything...',
        'rows',
        '2',
        'aria-label',
        'Chat prompt',
        1,
        'chat-home__textarea',
        3,
        'input',
        'keydown',
        'value',
        'disabled',
      ],
      [1, 'chat-home__actions'],
      [1, 'chat-home__pickers'],
      [1, 'chat-home__agent-picker'],
      ['for', 'agentSelect', 1, 'chat-home__picker-label'],
      ['id', 'agentSelect', 1, 'chat-home__select', 3, 'change', 'value'],
      ['value', ''],
      [3, 'value'],
      ['for', 'projectSelect', 1, 'chat-home__picker-label'],
      ['id', 'projectSelect', 1, 'chat-home__select', 3, 'change', 'value'],
      [1, 'chat-home__send', 3, 'click', 'disabled'],
      [1, 'chat-home__templates'],
      [1, 'chat-home__template'],
      [1, 'chat-home__recent'],
      [1, 'chat-home__send-spinner'],
      [1, 'chat-home__send-arrow'],
      [1, 'chat-home__template', 3, 'click'],
      [1, 'chat-home__template-icon'],
      [1, 'chat-home__template-text'],
      [1, 'chat-home__template-label'],
      [1, 'chat-home__template-desc'],
      [1, 'chat-home__recent-header'],
      [1, 'chat-home__recent-title'],
      [1, 'chat-home__recent-all', 3, 'click'],
      [1, 'chat-home__recent-list'],
      [1, 'chat-home__recent-item'],
      [1, 'chat-home__recent-item', 3, 'click'],
      [1, 'chat-home__recent-status'],
      [1, 'chat-home__recent-name'],
      [1, 'chat-home__recent-meta'],
    ],
    template: (e, s) => {
      e & 1 && C(0, xe, 1, 0, 'app-onboarding')(1, ke, 45, 7, 'div', 1), e & 2 && y(s.showOnboarding() ? 0 : 1);
    },
    dependencies: [O],
    styles: [
      '[_nghost-%COMP%]{display:flex;flex:1;min-height:0}.chat-home[_ngcontent-%COMP%]{display:flex;flex:1;background:var(--bg-deep);position:relative;overflow:hidden}.chat-home__bg-glow[_ngcontent-%COMP%]{position:absolute;top:-30%;left:50%;transform:translate(-50%);width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,255,.08) 0%,rgba(255,0,170,.04) 35%,transparent 65%);pointer-events:none;filter:blur(40px);animation:subtlePulse 8s ease-in-out infinite}.chat-home__scroll[_ngcontent-%COMP%]{flex:1;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:4rem 2rem 3rem}.chat-home__center[_ngcontent-%COMP%]{width:100%;max-width:640px;display:flex;flex-direction:column;align-items:center;position:relative;z-index:1}.chat-home__logo-mark[_ngcontent-%COMP%]{width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-xl, 16px);background:linear-gradient(135deg,#00e5ff1f,#ff00aa14);border:1px solid rgba(0,229,255,.2);font-size:1.5rem;font-weight:800;color:var(--accent-cyan);text-shadow:0 0 16px rgba(0,229,255,.5);margin-bottom:1rem;box-shadow:0 4px 24px #00e5ff1a}.chat-home__title[_ngcontent-%COMP%]{font-size:2rem;font-weight:700;margin:0 0 .4rem;letter-spacing:.03em;background:linear-gradient(135deg,var(--accent-cyan),var(--accent-magenta));background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradientShift 6s ease infinite}.chat-home__subtitle[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.9rem;margin:0 0 .75rem}.chat-home__shortcut-hint[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.25rem;font-size:.65rem;color:var(--text-tertiary);margin:0 0 1.5rem;opacity:.7}.chat-home__shortcut-hint[_ngcontent-%COMP%]   kbd[_ngcontent-%COMP%]{padding:1px 5px;border:1px solid var(--border);border-radius:3px;background:var(--bg-raised);font-family:inherit;font-size:.6rem}.chat-home__input-card[_ngcontent-%COMP%]{width:100%;background:#0f1018b3;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--glass-border, rgba(255, 255, 255, .06));border-radius:var(--radius-xl, 16px);overflow:hidden;transition:border-color .25s,box-shadow .25s;box-shadow:0 4px 24px #0000004d}.chat-home__input-card[_ngcontent-%COMP%]:focus-within{border-color:#00e5ff66;box-shadow:0 4px 24px #0000004d,0 0 0 1px #00e5ff26,0 0 30px #00e5ff0f}.chat-home__textarea[_ngcontent-%COMP%]{width:100%;padding:1.25rem 1.25rem .5rem;border:none;background:transparent;color:var(--text-primary);font-family:inherit;font-size:.9rem;line-height:1.6;resize:none;outline:none;max-height:200px;overflow-y:auto}.chat-home__textarea[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.chat-home__textarea[_ngcontent-%COMP%]:disabled{opacity:.5}.chat-home__actions[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1.25rem .85rem;gap:.75rem}.chat-home__pickers[_ngcontent-%COMP%]{display:flex;align-items:center;gap:1rem}.chat-home__agent-picker[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.chat-home__picker-label[_ngcontent-%COMP%]{font-size:.7rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}.chat-home__select[_ngcontent-%COMP%]{padding:.35rem .6rem;border:1px solid var(--border);border-radius:var(--radius, 6px);background:var(--bg-input, var(--bg-deep));color:var(--text-primary);font-family:inherit;font-size:.8rem;cursor:pointer;transition:border-color .15s}.chat-home__select[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.chat-home__send[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.35rem;padding:.5rem 1.4rem;border:none;border-radius:var(--radius-lg, 10px);background:linear-gradient(135deg,#00e5ff26,#00e5ff14);color:var(--accent-cyan);font-family:inherit;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:background .2s,box-shadow .2s,transform .1s}.chat-home__send[_ngcontent-%COMP%]:hover:not(:disabled){background:linear-gradient(135deg,#00e5ff40,#00e5ff1f);box-shadow:0 0 20px #00e5ff26}.chat-home__send[_ngcontent-%COMP%]:active:not(:disabled){transform:scale(.97)}.chat-home__send[_ngcontent-%COMP%]:disabled{opacity:.3;cursor:not-allowed}.chat-home__send-arrow[_ngcontent-%COMP%]{font-size:1rem;line-height:1;transition:transform .15s}.chat-home__send[_ngcontent-%COMP%]:hover:not(:disabled)   .chat-home__send-arrow[_ngcontent-%COMP%]{transform:translate(2px)}.chat-home__send-spinner[_ngcontent-%COMP%]{width:12px;height:12px;border:2px solid rgba(0,229,255,.2);border-top-color:var(--accent-cyan);border-radius:50%;animation:_ngcontent-%COMP%_spin .6s linear infinite}@keyframes _ngcontent-%COMP%_spin{to{transform:rotate(360deg)}}.chat-home__templates[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:1.5rem;width:100%}@media(min-width:580px){.chat-home__templates[_ngcontent-%COMP%]{grid-template-columns:repeat(3,1fr)}}.chat-home__template[_ngcontent-%COMP%]{display:flex;align-items:flex-start;gap:.6rem;padding:.75rem .85rem;border:1px solid rgba(255,255,255,.06);border-radius:var(--radius-lg, 10px);background:#0f101880;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:var(--text-secondary);font-family:inherit;font-size:.75rem;cursor:pointer;transition:border-color .2s,background .2s,transform .15s;text-align:left}.chat-home__template[_ngcontent-%COMP%]:hover{border-color:#00e5ff4d;background:#00e5ff0d;transform:translateY(-1px)}.chat-home__template-icon[_ngcontent-%COMP%]{font-size:1.1rem;line-height:1;flex-shrink:0;margin-top:.1rem}.chat-home__template-text[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.15rem}.chat-home__template-label[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary);font-size:.78rem}.chat-home__template-desc[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.7rem;line-height:1.3}.chat-home__recent[_ngcontent-%COMP%]{width:100%;margin-top:2.5rem}.chat-home__recent-header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem}.chat-home__recent-title[_ngcontent-%COMP%]{font-size:.78rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin:0}.chat-home__recent-all[_ngcontent-%COMP%]{font-size:.72rem;color:var(--text-tertiary);background:none;border:none;cursor:pointer;font-family:inherit;padding:.2rem .4rem;border-radius:var(--radius, 6px);transition:color .15s}.chat-home__recent-all[_ngcontent-%COMP%]:hover{color:var(--accent-cyan)}.chat-home__recent-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:2px}.chat-home__recent-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.6rem;padding:.6rem .75rem;border:none;border-radius:var(--radius, 6px);background:transparent;color:var(--text-primary);font-family:inherit;font-size:.8rem;cursor:pointer;transition:background .15s;text-align:left;width:100%}.chat-home__recent-item[_ngcontent-%COMP%]:hover{background:#ffffff0a}.chat-home__recent-status[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:var(--text-tertiary)}.chat-home__recent-status--running[_ngcontent-%COMP%]{background:var(--accent-cyan);box-shadow:0 0 6px #00e5ff66;animation:_ngcontent-%COMP%_pulse 2s ease-in-out infinite}.chat-home__recent-status--error[_ngcontent-%COMP%]{background:var(--accent-red, #ff3355)}.chat-home__recent-status--stopped[_ngcontent-%COMP%]{background:var(--text-tertiary)}@keyframes _ngcontent-%COMP%_pulse{0%,to{opacity:1}50%{opacity:.4}}.chat-home__recent-name[_ngcontent-%COMP%]{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-home__recent-meta[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);flex-shrink:0}@media(max-width:480px){.chat-home__scroll[_ngcontent-%COMP%]{padding:2rem 1rem}.chat-home__title[_ngcontent-%COMP%]{font-size:1.5rem}.chat-home__logo-mark[_ngcontent-%COMP%]{width:44px;height:44px;font-size:1.2rem}.chat-home__actions[_ngcontent-%COMP%]{flex-direction:column;align-items:stretch}.chat-home__pickers[_ngcontent-%COMP%]{flex-wrap:wrap}.chat-home__agent-picker[_ngcontent-%COMP%]{justify-content:space-between}.chat-home__bg-glow[_ngcontent-%COMP%]{width:300px;height:300px}.chat-home__templates[_ngcontent-%COMP%]{grid-template-columns:1fr}.chat-home__shortcut-hint[_ngcontent-%COMP%]{display:none}}',
    ],
    changeDetection: 0,
  });
};

export { oe as ChatHomeComponent };
