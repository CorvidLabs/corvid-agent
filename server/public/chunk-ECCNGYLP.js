import { a as we } from './chunk-355WLUEG.js';
import { a as U } from './chunk-A4KCXO2Q.js';
import {
  e as _e,
  m as be,
  s as Ce,
  b as ce,
  c as de,
  q as fe,
  i as ge,
  d as le,
  g as me,
  j as pe,
  k as ue,
  l as ve,
} from './chunk-AF4UDQOX.js';
import { a as oe } from './chunk-CSQXEU3M.js';
import { a as q } from './chunk-CZZRTCER.js';
import { a as ke } from './chunk-FGNIWOFY.js';
import { a as xe } from './chunk-N4BOLOM7.js';
import { a as Pe } from './chunk-NZV2JQDS.js';
import { a as se } from './chunk-OFKXBWQC.js';
import { a as Me } from './chunk-OQSRUIML.js';
import { a as ye } from './chunk-TQV7A5TX.js';
import { a as he } from './chunk-UAEJUITU.js';
import { a as Se } from './chunk-VGMNDSCG.js';
import { a as K } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import { b as G } from './chunk-D6WCRQHB.js';
import { g as H, h as re } from './chunk-G7DVZDMF.js';
import { e as ae } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  _a as $,
  ac as A,
  pb as a,
  _b as B,
  Z as b,
  rb as C,
  fc as D,
  q as E,
  O as ee,
  ja as f,
  Pb as g,
  T as h,
  b as I,
  qb as i,
  hc as ie,
  bc as j,
  nb as k,
  Bb as l,
  mb as M,
  ob as m,
  kb as ne,
  a as O,
  ib as p,
  Rb as R,
  Ob as r,
  hb as S,
  Na as s,
  Mb as T,
  Ma as te,
  jb as u,
  lb as V,
  Y as v,
  Qb as w,
  zb as x,
  vb as y,
  $b as z,
} from './chunk-LF4EWAJA.js';

var ze = (_n, t) => t.id,
  We = (_n, t) => t.type;
function Ve(n, t) {
  if ((n & 1 && C(0, 'span', 6), n & 2)) {
    const e = t.$index,
      o = l();
    S('data-active', o.stepIndex() === e)('data-done', o.stepIndex() > e);
  }
}
function Ne(n, _t) {
  n & 1 && (a(0, 'div', 13)(1, 'p'), r(2, 'Checking system status...'), i()());
}
function Le(n, _t) {
  n & 1 &&
    (a(0, 'div', 13)(1, 'p'),
    r(2, 'No AI provider detected. Install '),
    a(3, 'a', 17),
    r(4, 'Claude Code CLI'),
    i(),
    r(5, ' or '),
    a(6, 'a', 18),
    r(7, 'Ollama'),
    i(),
    r(8, ', or set '),
    a(9, 'code'),
    r(10, 'ANTHROPIC_API_KEY'),
    i(),
    r(11, ' in your '),
    a(12, 'code'),
    r(13, '.env'),
    i(),
    r(14, ' file.'),
    i()());
}
function $e(n, t) {
  if (n & 1) {
    const e = y();
    a(0, 'button', 19),
      x('click', () => {
        const c = v(e).$implicit,
          d = l(2);
        return b(d.selectTemplate(c));
      }),
      a(1, 'span', 20),
      r(2),
      i(),
      a(3, 'span', 21),
      r(4),
      i(),
      a(5, 'span', 22),
      r(6),
      i()();
  }
  if (n & 2) {
    let e,
      o = t.$implicit,
      c = l(2);
    S('data-selected', ((e = c.selectedTemplate()) == null ? null : e.id) === o.id),
      s(2),
      g(o.icon),
      s(2),
      g(o.name),
      s(2),
      g(o.description);
  }
}
function Re(n, t) {
  if ((n & 1 && (a(0, 'option', 30), r(1), i()), n & 2)) {
    const e = t.$implicit;
    m('value', e.type), s(), g(e.name);
  }
}
function Be(n, t) {
  if ((n & 1 && (a(0, 'option', 30), r(1), i()), n & 2)) {
    const e = t.$implicit;
    m('value', e), s(), g(e);
  }
}
function je(n, t) {
  if ((n & 1 && (a(0, 'option', 30), r(1), i()), n & 2)) {
    const e = t.$implicit;
    m('value', e.id), s(), g(e.name);
  }
}
function He(n, t) {
  if ((n & 1 && (a(0, 'span', 38), r(1), i()), n & 2)) {
    const e = t.$implicit,
      o = l(4);
    s(), g(o.formatBundleId(e));
  }
}
function Ge(n, _t) {
  if ((n & 1 && (a(0, 'div', 35), M(1, He, 2, 1, 'span', 38, V), i()), n & 2)) {
    const e = l(3);
    s(), k(e.selectedTemplate().skillBundleIds);
  }
}
function qe(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'form', 23),
      x('ngSubmit', () => {
        v(e);
        const c = l(2);
        return b(c.onCreateAgent());
      }),
      a(1, 'div', 24)(2, 'div', 25)(3, 'label', 26),
      r(4, 'Name'),
      i(),
      C(5, 'input', 27),
      i(),
      a(6, 'div', 25)(7, 'label', 28),
      r(8, 'Provider'),
      i(),
      a(9, 'select', 29),
      x('change', () => {
        v(e);
        const c = l(2);
        return b(c.onProviderChange());
      }),
      M(10, Re, 2, 2, 'option', 30, We),
      i()()(),
      a(12, 'div', 24)(13, 'div', 25)(14, 'label', 31),
      r(15, 'Model'),
      i(),
      a(16, 'select', 32),
      M(17, Be, 2, 2, 'option', 30, V),
      i()(),
      a(19, 'div', 25)(20, 'label', 33),
      r(21, 'Project'),
      i(),
      a(22, 'select', 34)(23, 'option', 30),
      r(24, 'None'),
      i(),
      M(25, je, 2, 2, 'option', 30, ze),
      i()()(),
      p(27, Ge, 3, 0, 'div', 35),
      a(28, 'div', 36)(29, 'button', 37),
      r(30),
      i()()();
  }
  if (n & 2) {
    const e = l(2);
    m('formGroup', e.form),
      s(10),
      k(e.providers()),
      s(7),
      k(e.availableModels()),
      s(6),
      m('value', null),
      s(2),
      k(e.projectService.projects()),
      s(2),
      u(e.selectedTemplate().skillBundleIds.length > 0 ? 27 : -1),
      s(2),
      m('disabled', e.form.invalid || e.creating()),
      s(),
      w(' ', e.creating() ? 'Creating...' : 'Create Agent', ' ');
  }
}
function Ke(n, _t) {
  if (
    (n & 1 &&
      (a(0, 'div', 7)(1, 'h2', 11),
      r(2, 'Create Your First Agent'),
      i(),
      a(3, 'p', 12),
      r(4, 'Pick a template, then customize.'),
      i(),
      p(5, Ne, 3, 0, 'div', 13)(6, Le, 15, 0, 'div', 13),
      a(7, 'div', 14),
      M(8, $e, 7, 4, 'button', 15, ze),
      i(),
      p(10, qe, 31, 5, 'form', 16),
      i()),
    n & 2)
  ) {
    let e,
      o = l();
    s(5),
      u(
        o.healthReady()
          ? !((e = o.health()) != null && e.apiKey) && !((e = o.health()) != null && e.llm)
            ? 6
            : -1
          : 5,
      ),
      s(3),
      k(o.TEMPLATES),
      s(2),
      u(o.selectedTemplate() ? 10 : -1);
  }
}
function Ue(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 8)(1, 'div', 39),
      r(2, '\u2713'),
      i(),
      a(3, 'h2', 11),
      r(4),
      i(),
      a(5, 'p', 12),
      r(6, 'Your agent is set up and waiting for instructions.'),
      i(),
      a(7, 'div', 40)(8, 'div', 41)(9, 'span', 42),
      r(10, 'Agent'),
      i(),
      a(11, 'span', 43),
      r(12),
      i()(),
      a(13, 'div', 41)(14, 'span', 42),
      r(15, 'LLM'),
      i(),
      a(16, 'span', 44),
      r(17),
      i()()(),
      a(18, 'div', 45)(19, 'button', 46),
      x('click', () => {
        v(e);
        const c = l();
        return b(c.startChat());
      }),
      r(20, ' Start Chatting '),
      i(),
      a(21, 'button', 47),
      x('click', () => {
        v(e);
        const c = l();
        return b(c.goToDashboard());
      }),
      r(22, ' Go to Dashboard '),
      i()()();
  }
  if (n & 2) {
    let e,
      o,
      c,
      d = l();
    s(4),
      w('', d.createdAgentName(), ' is ready'),
      s(8),
      g(d.createdAgentName()),
      s(4),
      T('done__value--ok', (e = d.health()) == null ? null : e.llm)(
        'done__value--warn',
        !((o = d.health()) != null && o.llm),
      ),
      s(),
      g((c = d.health()) != null && c.llm ? 'Connected' : 'Not configured');
  }
}
var Ye = [
    {
      id: 'full-stack',
      name: 'Full Stack Developer',
      suggestedName: 'Builder',
      description: 'Reads and edits code, manages PRs and issues, creates work tasks. The all-rounder.',
      icon: '{}',
      skillBundleIds: ['preset-full-stack'],
    },
    {
      id: 'code-reviewer',
      name: 'Code Reviewer',
      suggestedName: 'Reviewer',
      description: 'Reviews pull requests, catches bugs, and provides actionable feedback.',
      icon: '?!',
      skillBundleIds: ['preset-code-reviewer', 'preset-github-ops'],
    },
    {
      id: 'researcher',
      name: 'Researcher',
      suggestedName: 'Scout',
      description: 'Deep web research, information gathering, and knowledge management.',
      icon: '>>',
      skillBundleIds: ['preset-researcher', 'preset-memory-manager'],
    },
    {
      id: 'devops',
      name: 'DevOps Engineer',
      suggestedName: 'Ops',
      description: 'CI/CD automation, infrastructure tasks, deployment pipelines, and repo management.',
      icon: '#!',
      skillBundleIds: ['preset-devops', 'preset-github-ops'],
    },
    {
      id: 'custom',
      name: 'Custom Agent',
      suggestedName: '',
      description: 'Start from scratch. Pick your own name, model, and skills.',
      icon: '**',
      skillBundleIds: [],
    },
  ],
  Y = class n {
    fb = h(fe);
    router = h(H);
    agentService = h(q);
    projectService = h(K);
    sessionService = h(U);
    apiService = h(G);
    agentCreated = ie();
    TEMPLATES = Ye;
    steps = ['create', 'done'];
    step = f('create');
    stepIndex = f(0);
    health = f(null);
    healthReady = f(!1);
    providers = f([]);
    availableModels = f([]);
    creating = f(!1);
    createdAgentName = f('');
    selectedTemplate = f(null);
    createdAgentId = '';
    form = this.fb.nonNullable.group({
      name: ['', de.required],
      provider: [''],
      model: [''],
      defaultProjectId: [null],
    });
    async ngOnInit() {
      await Promise.all([this.loadHealth(), this.loadProviders(), this.projectService.loadProjects()]);
    }
    async loadHealth() {
      try {
        const e = (await E(this.apiService.get('/health'))).dependencies;
        this.health.set({
          database: e.database?.status === 'healthy',
          github: e.github?.status === 'healthy',
          algorand: e.algorand?.status === 'healthy',
          llm: e.llm?.status === 'healthy',
          apiKey: e.apiKey?.status === 'healthy',
        });
      } catch {
        this.health.set({ database: !1, github: !1, algorand: !1, llm: !1, apiKey: !1 });
      }
      this.healthReady.set(!0);
    }
    async loadProviders() {
      try {
        const t = await E(this.apiService.get('/providers'));
        this.providers.set(t),
          t.length > 0 &&
            (this.form.patchValue({ provider: t[0].type, model: t[0].defaultModel }),
            this.availableModels.set(t[0].models));
      } catch {}
    }
    selectTemplate(t) {
      this.selectedTemplate.set(t),
        t.suggestedName ? this.form.patchValue({ name: t.suggestedName }) : this.form.patchValue({ name: '' });
    }
    onProviderChange() {
      const t = this.providers().find((e) => e.type === this.form.value.provider);
      t && (this.availableModels.set(t.models), this.form.patchValue({ model: t.defaultModel }));
    }
    async onCreateAgent() {
      if (!this.form.invalid) {
        this.creating.set(!0);
        try {
          const t = this.form.getRawValue(),
            e = await this.agentService.createAgent({
              name: t.name,
              provider: t.provider || void 0,
              model: t.model || void 0,
              defaultProjectId: t.defaultProjectId || void 0,
            });
          (this.createdAgentId = e.id), this.createdAgentName.set(e.name);
          const o = this.selectedTemplate();
          o && (await this.assignSkillBundles(e.id, o.skillBundleIds)),
            this.agentCreated.emit(),
            this.step.set('done'),
            this.stepIndex.set(1);
        } finally {
          this.creating.set(!1);
        }
      }
    }
    async assignSkillBundles(t, e) {
      for (let o = 0; o < e.length; o++)
        try {
          await E(this.apiService.post(`/agents/${t}/skills`, { bundleId: e[o], sortOrder: o }));
        } catch {}
    }
    formatBundleId(t) {
      return t
        .replace('preset-', '')
        .split('-')
        .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
        .join(' ');
    }
    startChat() {
      this.router.navigate(['/chat']);
    }
    goToDashboard() {
      this.agentCreated.emit();
    }
    static \u0275fac = (e) => new (e || n)();
    static \u0275cmp = $({
      type: n,
      selectors: [['app-welcome-wizard']],
      outputs: { agentCreated: 'agentCreated' },
      decls: 17,
      vars: 1,
      consts: [
        [1, 'wizard'],
        [1, 'wizard__header'],
        [1, 'wizard__logo'],
        [1, 'wizard__title'],
        [1, 'wizard__subtitle'],
        [1, 'wizard__progress'],
        [1, 'progress-dot'],
        [1, 'wizard__step', 'wizard__step--wide'],
        [1, 'wizard__step', 'wizard__step--done'],
        [1, 'wizard__footer'],
        ['href', 'https://github.com/CorvidLabs/corvid-agent', 'target', '_blank', 'rel', 'noopener'],
        [1, 'step__title'],
        [1, 'step__desc'],
        [1, 'wizard__warning'],
        [1, 'template-grid'],
        [1, 'template-card'],
        [1, 'wizard__form', 3, 'formGroup'],
        ['href', 'https://claude.com/claude-code', 'target', '_blank'],
        ['href', 'https://ollama.com', 'target', '_blank'],
        [1, 'template-card', 3, 'click'],
        [1, 'template-card__icon'],
        [1, 'template-card__name'],
        [1, 'template-card__desc'],
        [1, 'wizard__form', 3, 'ngSubmit', 'formGroup'],
        [1, 'field-row'],
        [1, 'field'],
        ['for', 'wiz-name', 1, 'field__label'],
        [
          'id',
          'wiz-name',
          'formControlName',
          'name',
          'placeholder',
          'e.g. Corvid, Scout',
          'autocomplete',
          'off',
          1,
          'field__input',
        ],
        ['for', 'wiz-provider', 1, 'field__label'],
        ['id', 'wiz-provider', 'formControlName', 'provider', 1, 'field__input', 3, 'change'],
        [3, 'value'],
        ['for', 'wiz-model', 1, 'field__label'],
        ['id', 'wiz-model', 'formControlName', 'model', 1, 'field__input'],
        ['for', 'wiz-project', 1, 'field__label'],
        ['id', 'wiz-project', 'formControlName', 'defaultProjectId', 1, 'field__input'],
        [1, 'skill-tags'],
        [1, 'wizard__actions'],
        ['type', 'submit', 1, 'wizard__btn', 'wizard__btn--primary', 3, 'disabled'],
        [1, 'skill-tag'],
        [1, 'done__icon'],
        [1, 'done__summary'],
        [1, 'done__row'],
        [1, 'done__label'],
        [1, 'done__value', 'done__value--ok'],
        [1, 'done__value'],
        [1, 'done__actions'],
        [1, 'wizard__btn', 'wizard__btn--primary', 3, 'click'],
        [1, 'wizard__btn', 3, 'click'],
      ],
      template: (e, o) => {
        if (
          (e & 1 &&
            (a(0, 'div', 0)(1, 'div', 1)(2, 'pre', 2),
            r(
              3,
              ` \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557
\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557
\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551
\u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551
\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D
 \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D`,
            ),
            i(),
            a(4, 'h1', 3),
            r(5, 'Welcome to Corvid Agent'),
            i(),
            a(6, 'p', 4),
            r(7, 'Your own AI developer \u2014 tell it what to build, fix, or figure out'),
            i()(),
            a(8, 'div', 5),
            M(9, Ve, 1, 2, 'span', 6, V),
            i(),
            p(11, Ke, 11, 2, 'div', 7)(12, Ue, 23, 7, 'div', 8),
            a(13, 'p', 9)(14, 'a', 10),
            r(15, 'Docs'),
            i(),
            r(16, ' \xB7 Built on Algorand '),
            i()()),
          e & 2)
        ) {
          let c;
          s(9), k(o.steps), s(2), u((c = o.step()) === 'create' ? 11 : c === 'done' ? 12 : -1);
        }
      },
      dependencies: [Ce, me, ve, be, ce, ue, le, _e, pe, ge],
      styles: [
        '.wizard[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:2rem 1.5rem;text-align:center}.wizard__header[_ngcontent-%COMP%]{margin-bottom:1.5rem}.wizard__logo[_ngcontent-%COMP%]{font-size:.35rem;line-height:1.1;color:var(--accent-cyan);margin:0 0 1rem;text-shadow:0 0 8px rgba(0,229,255,.3);overflow-x:auto}.wizard__title[_ngcontent-%COMP%]{margin:0;font-size:1.4rem;color:var(--text-primary)}.wizard__subtitle[_ngcontent-%COMP%]{margin:.35rem 0 0;font-size:.85rem;color:var(--text-tertiary)}.wizard__progress[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1.5rem}.progress-dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;background:var(--border);transition:background .2s,box-shadow .2s}.progress-dot[data-active=true][_ngcontent-%COMP%]{background:var(--accent-cyan);box-shadow:0 0 6px #00e5ff80}.progress-dot[data-done=true][_ngcontent-%COMP%]{background:var(--accent-green)}.wizard__step[_ngcontent-%COMP%]{width:100%;max-width:480px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem}.wizard__step--wide[_ngcontent-%COMP%]{max-width:580px}.wizard__step--done[_ngcontent-%COMP%]{text-align:center}.step__title[_ngcontent-%COMP%]{margin:0 0 .25rem;font-size:1rem;color:var(--text-primary)}.step__desc[_ngcontent-%COMP%]{margin:0 0 1.25rem;font-size:.8rem;color:var(--text-tertiary)}.template-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-bottom:1.25rem;text-align:left}.template-card[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem;padding:.75rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-family:inherit;color:var(--text-primary);transition:border-color .15s,background .15s}.template-card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);background:var(--bg-hover)}.template-card[data-selected=true][_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:#00e5ff0f;box-shadow:var(--glow-cyan)}.template-card[_ngcontent-%COMP%]:last-child:nth-child(odd){grid-column:1 / -1}.template-card__icon[_ngcontent-%COMP%]{font-size:.85rem;font-weight:700;color:var(--accent-cyan);font-family:monospace}.template-card__name[_ngcontent-%COMP%]{font-size:.8rem;font-weight:600}.template-card__desc[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);line-height:1.35}.wizard__form[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem;text-align:left}.field-row[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.field[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.field__label[_ngcontent-%COMP%]{font-size:.7rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em}.field__input[_ngcontent-%COMP%]{padding:.5rem .75rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary)}.field__input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan);box-shadow:var(--glow-cyan)}.skill-tags[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.35rem}.skill-tag[_ngcontent-%COMP%]{padding:.2rem .5rem;background:#00e5ff14;border:1px solid rgba(0,229,255,.2);border-radius:var(--radius);font-size:.7rem;color:var(--accent-cyan);font-weight:600}.wizard__actions[_ngcontent-%COMP%]{display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem}.wizard__btn[_ngcontent-%COMP%]{padding:.55rem 1.2rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid var(--border-bright);background:transparent;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;transition:background .15s,border-color .15s}.wizard__btn[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.wizard__btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:#00e5ff0f}.wizard__btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff24;box-shadow:var(--glow-cyan)}.wizard__btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.wizard__warning[_ngcontent-%COMP%]{background:#ffc10714;border:1px solid rgba(255,193,7,.3);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem}.wizard__warning[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{margin:0;font-size:.8rem;color:var(--accent-amber, #ffc107);text-align:left}.wizard__warning[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{background:var(--bg-raised);padding:.1rem .35rem;border-radius:3px;font-size:.75rem}.done__icon[_ngcontent-%COMP%]{width:48px;height:48px;margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;border-radius:50%;color:var(--accent-green);border:2px solid var(--accent-green);background:#00ff8814}.done__summary[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.4rem;margin-bottom:1.25rem;text-align:left}.done__row[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:.4rem .75rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius)}.done__label[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-secondary)}.done__value[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-primary)}.done__value--ok[_ngcontent-%COMP%]{color:var(--accent-green)}.done__value--warn[_ngcontent-%COMP%]{color:var(--accent-amber, #ffc107)}.done__actions[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;margin-top:1.25rem}.wizard__footer[_ngcontent-%COMP%]{margin-top:2rem;font-size:.7rem;color:var(--text-tertiary)}.wizard__footer[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]{color:var(--accent-cyan);text-decoration:none}.wizard__footer[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]:hover{text-decoration:underline}@media(max-width:767px){.wizard[_ngcontent-%COMP%]{padding:1rem}.wizard__logo[_ngcontent-%COMP%]{font-size:.25rem}.wizard__step[_ngcontent-%COMP%]{padding:1rem}.template-grid[_ngcontent-%COMP%], .field-row[_ngcontent-%COMP%]{grid-template-columns:1fr}}',
      ],
      changeDetection: 0,
    });
  };
var De = 'corvid_widget_layout',
  Je = new Set(['spending-chart', 'session-chart', 'agent-usage-chart']),
  J = [
    { id: 'metrics', label: 'Metrics', visible: !0 },
    { id: 'agents', label: 'Agent Activity', visible: !0 },
    { id: 'active-sessions', label: 'Active Sessions', visible: !0 },
    { id: 'activity', label: 'Recent Activity', visible: !0 },
    { id: 'quick-actions', label: 'Quick Actions', visible: !0 },
    { id: 'system-status', label: 'System Status', visible: !0 },
  ],
  Qe = new Set(J.map((n) => n.id)),
  Q = class n {
    widgets = f(this.load());
    visibleWidgets = D(() => this.widgets().filter((t) => t.visible));
    customizing = f(!1);
    moveWidget(t, e) {
      const o = [...this.widgets()],
        [c] = o.splice(t, 1);
      o.splice(e, 0, c), this.widgets.set(o), this.save(o);
    }
    toggleWidget(t) {
      const e = this.widgets().map((o) => (o.id === t ? I(O({}, o), { visible: !o.visible }) : o));
      this.widgets.set(e), this.save(e);
    }
    resetToDefaults() {
      const t = J.map((e) => O({}, e));
      this.widgets.set(t), this.save(t);
    }
    load() {
      const t = this.loadStored();
      return t || J.map((e) => O({}, e));
    }
    loadStored() {
      if (typeof localStorage > 'u') return null;
      try {
        const t = localStorage.getItem(De);
        if (!t) return null;
        const e = JSON.parse(t);
        if (
          !Array.isArray(e) ||
          e.length === 0 ||
          !e.every((c) => typeof c === 'object' && c !== null && 'id' in c && 'label' in c && 'visible' in c)
        )
          return null;
        const o = e.filter((c) => Qe.has(c.id) && !Je.has(c.id));
        for (const c of J) o.some((d) => d.id === c.id) || o.push(O({}, c));
        return o.length > 0 ? o : null;
      } catch {
        return null;
      }
    }
    save(t) {
      typeof localStorage > 'u' || localStorage.setItem(De, JSON.stringify(t));
    }
    static \u0275fac = (e) => new (e || n)();
    static \u0275prov = ee({ token: n, factory: n.\u0275fac, providedIn: 'root' });
  };
var Xe = (n) => ['/agents', n],
  Ze = (n) => ['/sessions', n],
  et = (n) => ['/sessions/council-launches', n],
  X = (_n, t) => t.id,
  tt = (_n, t) => t.message,
  nt = (_n, t) => t.agent.id;
function it(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'app-welcome-wizard', 1),
      x('agentCreated', () => {
        v(e);
        const c = l();
        return b(c.onWizardComplete());
      }),
      i();
  }
}
function at(n, _t) {
  n & 1 && (a(0, 'div', 0), C(1, 'app-skeleton', 2), i()), n & 2 && (s(), m('count', 8));
}
function rt(n, _t) {
  n & 1 &&
    (a(0, 'div', 3)(1, 'span', 18),
    r(2, '\u{1F4E6}'),
    i(),
    a(3, 'span', 19)(4, 'strong'),
    r(5, 'Sandbox Mode'),
    i(),
    r(6, " \u2014 data won't persist. Restart "),
    a(7, 'code'),
    r(8, 'bun run try'),
    i(),
    r(9, ' to reset.'),
    i()());
}
function ot(n, _t) {
  n & 1 && r(0, ' \u26A0 ');
}
function st(n, _t) {
  n & 1 && r(0, ' \u26A0 ');
}
function ct(n, _t) {
  n & 1 && r(0, ' \u2139 ');
}
function dt(n, _t) {
  if ((n & 1 && (a(0, 'a', 24), r(1, 'Fix \u2192'), i()), n & 2)) {
    const e = l().$implicit;
    m('routerLink', e.link);
  }
}
function lt(n, t) {
  if (
    (n & 1 &&
      (a(0, 'div', 20)(1, 'span', 22),
      p(2, ot, 1, 0)(3, st, 1, 0)(4, ct, 1, 0),
      i(),
      a(5, 'span', 23),
      r(6),
      i(),
      p(7, dt, 2, 1, 'a', 24),
      i()),
    n & 2)
  ) {
    const e = t.$implicit;
    S('data-level', e.level),
      s(2),
      u(e.level === 'error' ? 2 : e.level === 'warn' ? 3 : 4),
      s(4),
      g(e.message),
      s(),
      u(e.link ? 7 : -1);
  }
}
function _t(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 4),
      M(1, lt, 8, 4, 'div', 20, tt),
      a(3, 'button', 21),
      x('click', () => {
        v(e);
        const c = l(2);
        return b(c.alertsDismissed.set(!0));
      }),
      r(4, 'Dismiss'),
      i()();
  }
  if (n & 2) {
    const e = l(2);
    s(), k(e.systemAlerts());
  }
}
function mt(n, _t) {
  if ((n & 1 && (a(0, 'span', 12), r(1), z(2, 'relativeTime'), i()), n & 2)) {
    const e = l(2);
    s(), w('Updated ', A(2, 1, e.lastRefresh()));
  }
}
function gt(n, t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 31),
      x('dragstart', (c) => {
        const d = v(e).$index,
          _ = l(3);
        return b(_.onCustomizeDragStart(c, d));
      })('dragover', (c) => {
        const d = v(e).$index,
          _ = l(3);
        return b(_.onCustomizeDragOver(c, d));
      })('drop', (c) => {
        const d = v(e).$index,
          _ = l(3);
        return b(_.onCustomizeDrop(c, d));
      })('dragend', () => {
        v(e);
        const c = l(3);
        return b(c.dragIndex.set(-1));
      }),
      a(1, 'span', 32),
      r(2, '\u2630'),
      i(),
      a(3, 'span', 33),
      r(4),
      i(),
      a(5, 'button', 34),
      x('click', () => {
        const c = v(e).$implicit,
          d = l(3);
        return b(d.layoutService.toggleWidget(c.id));
      }),
      r(6),
      i()();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = t.$index,
      c = l(3);
    T('customize-item--dragging', c.dragIndex() === o)('customize-item--hidden', !e.visible),
      s(4),
      g(e.label),
      s(),
      S('data-visible', e.visible),
      s(),
      w(' ', e.visible ? 'ON' : 'OFF', ' ');
  }
}
function pt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 15)(1, 'div', 25)(2, 'span', 26),
      r(3, 'Dashboard Widgets'),
      i(),
      a(4, 'button', 27),
      x('click', () => {
        v(e);
        const c = l(2);
        return b(c.layoutService.resetToDefaults());
      }),
      r(5, 'Reset to defaults'),
      i()(),
      a(6, 'p', 28),
      r(7, 'Drag to reorder. Toggle visibility.'),
      i(),
      a(8, 'div', 29),
      M(9, gt, 7, 7, 'div', 30, X),
      i()();
  }
  if (n & 2) {
    const e = l(2);
    s(9), k(e.layoutService.widgets());
  }
}
function ut(n, _t) {
  if ((n & 1 && (a(0, 'div', 36), C(1, 'app-skeleton', 40), i()), n & 2)) {
    const e = l().$implicit;
    s(), m('variant', e.id === 'metrics' ? 'card' : 'line')('count', 3);
  }
}
function vt(n, _t) {
  if (
    (n & 1 &&
      (a(0, 'div', 41)(1, 'div', 42)(2, 'span', 65),
      C(3, 'app-icon', 66),
      i(),
      a(4, 'span', 45),
      r(5, 'ALGO Balance'),
      i()(),
      a(6, 'span', 67),
      r(7),
      z(8, 'number'),
      i(),
      a(9, 'span', 68),
      r(10),
      i()()),
    n & 2)
  ) {
    const e = l();
    s(3), m('size', 14), s(4), g(j(8, 3, e.balance / 1e6, '1.2-4')), s(3), g(e.network);
  }
}
function bt(n, t) {
  if ((n & 1 && p(0, vt, 11, 6, 'div', 41), n & 2)) {
    const e = t;
    u(e.enabled && e.address !== 'local' ? 0 : -1);
  }
}
function ft(n, _t) {
  if (
    (n & 1 &&
      (a(0, 'div', 37)(1, 'div', 41)(2, 'div', 42)(3, 'span', 43),
      C(4, 'app-icon', 44),
      i(),
      a(5, 'span', 45),
      r(6, 'Total Agents'),
      i()(),
      a(7, 'span', 46),
      r(8),
      i(),
      a(9, 'a', 47),
      r(10, 'View all'),
      i()(),
      a(11, 'div', 41)(12, 'div', 42)(13, 'span', 48),
      C(14, 'app-icon', 49),
      i(),
      a(15, 'span', 45),
      r(16, 'Active Sessions'),
      i()(),
      a(17, 'span', 50),
      r(18),
      i(),
      a(19, 'a', 51),
      r(20, 'View all'),
      i()(),
      a(21, 'div', 41)(22, 'div', 42)(23, 'span', 52),
      C(24, 'app-icon', 53),
      i(),
      a(25, 'span', 45),
      r(26, 'Total Projects'),
      i()(),
      a(27, 'span', 46),
      r(28),
      i(),
      a(29, 'a', 54),
      r(30, 'View all'),
      i()(),
      a(31, 'div', 55)(32, 'div', 42)(33, 'span', 56),
      C(34, 'app-icon', 57),
      i(),
      a(35, 'span', 45),
      r(36, 'API Cost (Today)'),
      i()(),
      a(37, 'span', 58),
      r(38),
      z(39, 'number'),
      i(),
      a(40, 'a', 59),
      r(41, 'Analytics'),
      i()(),
      p(42, bt, 1, 1),
      a(43, 'div', 41)(44, 'div', 42)(45, 'span', 43),
      C(46, 'app-icon', 60),
      i(),
      a(47, 'span', 45),
      r(48, 'Credits Used'),
      i()(),
      a(49, 'span', 46),
      r(50),
      i()(),
      a(51, 'div', 41)(52, 'div', 42)(53, 'span', 48),
      C(54, 'app-icon', 61),
      i(),
      a(55, 'span', 45),
      r(56, 'Work Tasks'),
      i()(),
      a(57, 'span', 62),
      r(58),
      i(),
      a(59, 'a', 63),
      r(60, 'View all'),
      i()(),
      a(61, 'div', 41)(62, 'div', 42)(63, 'span', 43),
      C(64, 'app-icon', 64),
      i(),
      a(65, 'span', 45),
      r(66, 'Total Sessions'),
      i()(),
      a(67, 'span', 46),
      r(68),
      i()()()),
    n & 2)
  ) {
    let e,
      o,
      c,
      d,
      _ = l(3);
    s(4),
      m('size', 14),
      s(4),
      g(_.agentService.agents().length),
      s(6),
      m('size', 14),
      s(4),
      g(_.runningSessions().length),
      s(6),
      m('size', 14),
      s(4),
      g(_.projectService.projects().length),
      s(6),
      m('size', 14),
      s(4),
      w(
        '$',
        j(
          39,
          15,
          ((e = _.overview()) == null || e.todaySpending == null ? null : e.todaySpending.apiCostUsd) ?? 0,
          '1.2-4',
        ),
      ),
      s(4),
      u((o = _.algochatStatus()) ? 42 : -1, o),
      s(4),
      m('size', 14),
      s(4),
      g(((c = _.overview()) == null ? null : c.totalCreditsConsumed) ?? 0),
      s(4),
      m('size', 14),
      s(4),
      g(_.activeWorkTaskCount()),
      s(6),
      m('size', 14),
      s(4),
      g(((d = _.overview()) == null ? null : d.totalSessions) ?? _.sessionService.sessions().length);
  }
}
function Ct(n, _t) {
  if ((n & 1 && (a(0, 'div', 83)(1, 'span', 94), r(2), i(), a(3, 'span', 95), r(4, 'Rep'), i()()), n & 2)) {
    const e = l().$implicit;
    s(),
      S('data-level', e.reputationScore >= 70 ? 'high' : e.reputationScore >= 30 ? 'mid' : 'low'),
      s(),
      w(' ', e.reputationScore, ' ');
  }
}
function xt(n, t) {
  if ((n & 1 && (a(0, 'span', 96), r(1), i()), n & 2)) {
    const e = t.$implicit;
    s(), g(e);
  }
}
function ht(n, _t) {
  if ((n & 1 && (a(0, 'span', 97), r(1), i()), n & 2)) {
    const e = l(2).$implicit;
    s(), w('+', e.capabilities.length - 3);
  }
}
function yt(n, _t) {
  if ((n & 1 && (a(0, 'div', 84), M(1, xt, 2, 1, 'span', 96, V), p(3, ht, 2, 1, 'span', 97), i()), n & 2)) {
    const e = l().$implicit;
    s(), k(e.capabilities.slice(0, 3)), s(2), u(e.capabilities.length > 3 ? 3 : -1);
  }
}
function wt(n, t) {
  if (n & 1) {
    const e = y();
    a(0, 'a', 75)(1, 'div', 76)(2, 'div', 77)(3, 'div', 78)(4, 'span', 79),
      C(5, 'span', 80),
      r(6),
      i(),
      a(7, 'span', 81),
      r(8),
      i()(),
      a(9, 'span', 82),
      r(10),
      i(),
      p(11, Ct, 5, 2, 'div', 83),
      p(12, yt, 4, 1, 'div', 84),
      i(),
      a(13, 'span', 85),
      r(14),
      i()(),
      a(15, 'div', 86)(16, 'div', 87)(17, 'span', 88),
      r(18),
      i(),
      a(19, 'span', 89),
      r(20, 'Running'),
      i()(),
      a(21, 'div', 87)(22, 'span', 90),
      r(23),
      z(24, 'number'),
      i(),
      a(25, 'span', 89),
      r(26, 'ALGO'),
      i()(),
      a(27, 'div', 87)(28, 'span', 91),
      z(29, 'absoluteTime'),
      r(30),
      z(31, 'relativeTime'),
      i(),
      a(32, 'span', 89),
      r(33, 'Last Active'),
      i()()(),
      a(34, 'div', 92)(35, 'button', 93),
      x('click', (c) => {
        const d = v(e).$implicit,
          _ = l(5);
        return b(_.startChat(d.agent.id, c));
      }),
      r(36, 'Chat'),
      i(),
      a(37, 'button', 93),
      x('click', (c) => {
        const d = v(e).$implicit,
          _ = l(5);
        return b(_.startWorkTask(d.agent.id, c));
      }),
      r(38, 'Work Task'),
      i()()();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = l(5);
    m('routerLink', B(22, Xe, e.agent.id)),
      s(4),
      S('data-health', o.getAgentHealth(e)),
      s(2),
      w(' ', o.getAgentHealthLabel(e), ' '),
      s(2),
      g(e.agent.name),
      s(),
      S('data-provider', e.agent.provider || 'anthropic'),
      s(),
      R(' ', e.agent.provider || 'anthropic', '', e.agent.model ? ` / ${e.agent.model}` : '', ' '),
      s(),
      u(e.reputationScore !== null ? 11 : -1),
      s(),
      u(e.capabilities.length > 0 ? 12 : -1),
      s(),
      S('data-status', e.runningSessions > 0 ? 'busy' : 'idle'),
      s(),
      w(' ', e.runningSessions > 0 ? 'Busy' : 'Idle', ' '),
      s(4),
      g(e.runningSessions),
      s(5),
      g(j(24, 15, e.balance / 1e6, '1.2-4')),
      s(5),
      m('title', A(29, 18, e.lastActive)),
      s(2),
      g(A(31, 20, e.lastActive));
  }
}
function St(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 38)(1, 'div', 70)(2, 'h3'),
      C(3, 'app-icon', 44),
      r(4, ' Agent Activity'),
      i(),
      a(5, 'div', 71)(6, 'a', 72),
      r(7, 'View all agents'),
      i(),
      a(8, 'button', 73),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.refreshWidget('agents'));
      }),
      r(9, '\u21BB'),
      i()()(),
      a(10, 'div', 74),
      M(11, wt, 39, 24, 'a', 75, nt),
      i()();
  }
  if (n & 2) {
    const e = l(4);
    s(3),
      m('size', 14),
      s(5),
      T('section__refresh--spinning', e.widgetRefreshing().agents),
      s(3),
      k(e.agentSummaries());
  }
}
function Mt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 69)(1, 'h2', 98),
      r(2, 'What do you want to build?'),
      i(),
      a(3, 'p', 99),
      r(4, 'Pick an agent and start a conversation.'),
      i(),
      a(5, 'button', 100),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.navigateTo('/sessions/new'));
      }),
      r(6, '+ Start a Conversation'),
      i()();
  }
}
function kt(n, _t) {
  if ((n & 1 && p(0, St, 13, 3, 'div', 38)(1, Mt, 7, 0, 'div', 69), n & 2)) {
    const e = l(3);
    u(e.agentSummaries().length > 0 ? 0 : 1);
  }
}
function Pt(n, _t) {
  n & 1 &&
    (a(0, 'div', 102)(1, 'p', 104),
    r(2, 'No active sessions'),
    i(),
    a(3, 'p', 105),
    r(4, 'Start a conversation or work task to see live sessions here.'),
    i(),
    a(5, 'div', 106)(6, 'a', 107),
    r(7, 'New conversation'),
    i(),
    a(8, 'a', 108),
    r(9, 'Create work task'),
    i()()());
}
function Ot(n, t) {
  if (
    (n & 1 &&
      (a(0, 'a', 109),
      C(1, 'span', 111),
      a(2, 'div', 112)(3, 'span', 113),
      r(4),
      i(),
      a(5, 'span', 114),
      r(6),
      i()(),
      a(7, 'span', 115),
      z(8, 'absoluteTime'),
      r(9),
      z(10, 'relativeTime'),
      i()()),
    n & 2)
  ) {
    const e = t.$implicit,
      o = l(5);
    m('routerLink', B(11, Ze, e.id)),
      s(4),
      R(
        '',
        e.name || (e.initialPrompt == null ? null : e.initialPrompt.slice(0, 60)) || 'Session',
        '',
        !e.name && ((e.initialPrompt == null ? null : e.initialPrompt.length) ?? 0) > 60 ? '...' : '',
      ),
      s(2),
      R('', o.getAgentName(e.agentId), ' \xB7 ', e.source),
      s(),
      m('title', A(8, 7, e.createdAt)),
      s(2),
      g(A(10, 9, e.createdAt));
  }
}
function zt(n, _t) {
  if ((n & 1 && (a(0, 'a', 110), r(1), i()), n & 2)) {
    const e = l(5);
    s(), w('+ ', e.runningSessions().length - 8, ' more');
  }
}
function Dt(n, _t) {
  if ((n & 1 && (a(0, 'div', 103), M(1, Ot, 11, 13, 'a', 109, X), p(3, zt, 2, 1, 'a', 110), i()), n & 2)) {
    const e = l(4);
    s(), k(e.runningSessions().slice(0, 8)), s(2), u(e.runningSessions().length > 8 ? 3 : -1);
  }
}
function Et(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 38)(1, 'div', 70)(2, 'h3'),
      C(3, 'app-icon', 49),
      r(4, ' Active Sessions'),
      i(),
      a(5, 'div', 71)(6, 'a', 101),
      r(7, 'View all sessions'),
      i(),
      a(8, 'button', 73),
      x('click', () => {
        v(e);
        const c = l(3);
        return b(c.refreshWidget('active-sessions'));
      }),
      r(9, '\u21BB'),
      i()()(),
      p(10, Pt, 10, 0, 'div', 102)(11, Dt, 4, 1, 'div', 103),
      i();
  }
  if (n & 2) {
    const e = l(3);
    s(3),
      m('size', 14),
      s(5),
      T('section__refresh--spinning', e.widgetRefreshing()['active-sessions']),
      s(2),
      u(e.runningSessions().length === 0 ? 10 : 11);
  }
}
function Tt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 116)(1, 'span', 118),
      r(2, '!'),
      i(),
      a(3, 'span', 119),
      r(4),
      i(),
      a(5, 'button', 120),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.refreshWidget('activity'));
      }),
      r(6, 'Retry'),
      i()();
  }
  if (n & 2) {
    const e = l(4);
    s(4), g(e.widgetErrors().activity);
  }
}
function At(n, _t) {
  n & 1 &&
    (a(0, 'div', 102)(1, 'p', 104),
    r(2, 'No recent activity'),
    i(),
    a(3, 'p', 105),
    r(4, 'Start a conversation, create a work task, or launch a council to see activity here.'),
    i(),
    a(5, 'div', 106)(6, 'a', 107),
    r(7, 'New conversation'),
    i(),
    a(8, 'a', 108),
    r(9, 'Create work task'),
    i()()());
}
function It(n, _t) {
  n & 1 && C(0, 'app-icon', 126), n & 2 && m('size', 12);
}
function Ft(n, _t) {
  n & 1 && C(0, 'app-icon', 127), n & 2 && m('size', 12);
}
function Wt(n, _t) {
  n & 1 && C(0, 'app-icon', 128), n & 2 && m('size', 12);
}
function Vt(n, _t) {
  n & 1 && C(0, 'app-icon', 61), n & 2 && m('size', 12);
}
function Nt(n, _t) {
  n & 1 && C(0, 'app-icon', 129), n & 2 && m('size', 12);
}
function Lt(n, _t) {
  n & 1 && C(0, 'app-icon', 130), n & 2 && m('size', 12);
}
function $t(n, t) {
  if (
    (n & 1 &&
      (a(0, 'a', 124)(1, 'span', 125),
      p(2, It, 1, 1, 'app-icon', 126)(3, Ft, 1, 1, 'app-icon', 127)(4, Wt, 1, 1, 'app-icon', 128)(
        5,
        Vt,
        1,
        1,
        'app-icon',
        61,
      )(6, Nt, 1, 1, 'app-icon', 129)(7, Lt, 1, 1, 'app-icon', 130),
      i(),
      a(8, 'div', 131)(9, 'span', 132),
      r(10),
      i(),
      a(11, 'span', 133),
      r(12),
      i()(),
      a(13, 'span', 134),
      z(14, 'absoluteTime'),
      r(15),
      z(16, 'relativeTime'),
      i()()),
    n & 2)
  ) {
    let e,
      o = t.$implicit;
    m('routerLink', o.link),
      s(),
      S('data-type', o.type),
      s(),
      u(
        (e = o.type) === 'session_started'
          ? 2
          : e === 'session_completed'
            ? 3
            : e === 'session_error'
              ? 4
              : e === 'work_task'
                ? 5
                : e === 'council'
                  ? 6
                  : e === 'agent_message'
                    ? 7
                    : -1,
      ),
      s(8),
      g(o.label),
      s(2),
      g(o.detail),
      s(),
      m('title', A(14, 7, o.timestamp)),
      s(2),
      g(A(16, 9, o.timestamp));
  }
}
function Rt(n, _t) {
  if ((n & 1 && (a(0, 'div', 123), M(1, $t, 17, 11, 'a', 124, ne), i()), n & 2)) {
    const e = l(5);
    s(), k(e.activityFeed());
  }
}
function Bt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 117)(1, 'div', 70)(2, 'h3'),
      C(3, 'app-icon', 121),
      r(4, ' Recent Activity'),
      i(),
      a(5, 'div', 71)(6, 'a', 122),
      r(7, 'View Analytics'),
      i(),
      a(8, 'button', 73),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.refreshWidget('activity'));
      }),
      r(9, '\u21BB'),
      i()()(),
      p(10, At, 10, 0, 'div', 102)(11, Rt, 3, 0, 'div', 123),
      i();
  }
  if (n & 2) {
    const e = l(4);
    s(3),
      m('size', 14),
      s(5),
      T('section__refresh--spinning', e.widgetRefreshing().activity),
      s(2),
      u(e.activityFeed().length === 0 ? 10 : 11);
  }
}
function jt(n, _t) {
  if ((n & 1 && p(0, Tt, 7, 1, 'div', 116)(1, Bt, 12, 4, 'div', 117), n & 2)) {
    const e = l(3);
    u(e.widgetErrors().activity ? 0 : 1);
  }
}
function Ht(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 39)(1, 'h3'),
      C(2, 'app-icon', 60),
      r(3, ' Quick Actions'),
      i(),
      a(4, 'div', 135)(5, 'button', 136),
      x('click', () => {
        v(e);
        const c = l(3);
        return b(c.navigateTo('/sessions/new'));
      }),
      r(6, '+ New Conversation'),
      i(),
      a(7, 'button', 136),
      x('click', () => {
        v(e);
        const c = l(3);
        return b(c.navigateTo('/sessions/councils'));
      }),
      r(8, 'Launch Council'),
      i(),
      a(9, 'button', 136),
      x('click', () => {
        v(e);
        const c = l(3);
        return b(c.navigateTo('/sessions/work-tasks'));
      }),
      r(10, 'Create Work Task'),
      i(),
      a(11, 'button', 137),
      x('click', () => {
        v(e);
        const c = l(3);
        return b(c.runSelfTest());
      }),
      r(12),
      i()()();
  }
  if (n & 2) {
    const e = l(3);
    s(2),
      m('size', 14),
      s(9),
      m('disabled', e.selfTestRunning()),
      s(),
      w(' ', e.selfTestRunning() ? 'Running...' : 'Run Self-Test', ' ');
  }
}
function Gt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 116)(1, 'span', 118),
      r(2, '!'),
      i(),
      a(3, 'span', 119),
      r(4),
      i(),
      a(5, 'button', 120),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.refreshWidget('system-status'));
      }),
      r(6, 'Retry'),
      i()();
  }
  if (n & 2) {
    const e = l(4);
    s(4), g(e.widgetErrors()['system-status']);
  }
}
function qt(n, t) {
  if ((n & 1 && (a(0, 'span', 143), r(1), i()), n & 2)) {
    const e = t;
    S('data-ok', e.enabled),
      s(),
      w(' ', e.enabled ? (e.address === 'local' ? 'Local Mode' : e.network) : 'Disabled', ' ');
  }
}
function Kt(n, _t) {
  n & 1 && (a(0, 'span', 144), r(1, 'Loading...'), i());
}
function Ut(n, _t) {
  if ((n & 1 && (a(0, 'div', 141)(1, 'span', 142), r(2, 'Version'), i(), a(3, 'span', 147), r(4), i()()), n & 2)) {
    const e = l(5);
    s(4), w('v', e.serverVersion());
  }
}
function Yt(n, t) {
  if ((n & 1 && (a(0, 'div', 148)(1, 'a', 149), r(2), i(), a(3, 'span', 150), r(4), i()()), n & 2)) {
    const e = t.$implicit;
    s(),
      m('routerLink', B(4, et, e.id)),
      s(),
      g(e.prompt.length > 50 ? `${e.prompt.slice(0, 50)}...` : e.prompt),
      s(),
      S('data-stage', e.stage),
      s(),
      g(e.stage);
  }
}
function Jt(n, _t) {
  if ((n & 1 && (a(0, 'div', 146)(1, 'h4'), r(2), i(), M(3, Yt, 5, 6, 'div', 148, X), i()), n & 2)) {
    const e = l(5);
    s(2), w('Active Councils (', e.activeCouncilLaunches().length, ')'), s(), k(e.activeCouncilLaunches().slice(0, 10));
  }
}
function Qt(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 138)(1, 'div', 70)(2, 'h3'),
      C(3, 'app-icon', 139),
      r(4, ' System Status'),
      i(),
      a(5, 'button', 73),
      x('click', () => {
        v(e);
        const c = l(4);
        return b(c.refreshWidget('system-status'));
      }),
      r(6, '\u21BB'),
      i()(),
      a(7, 'div', 140)(8, 'div', 141)(9, 'span', 142),
      r(10, 'WebSocket'),
      i(),
      a(11, 'span', 143),
      r(12),
      i()(),
      a(13, 'div', 141)(14, 'span', 142),
      r(15, 'AlgoChat'),
      i(),
      p(16, qt, 2, 2, 'span', 143)(17, Kt, 2, 0, 'span', 144),
      i(),
      a(18, 'div', 141)(19, 'span', 142),
      r(20, 'Active Schedules'),
      i(),
      a(21, 'span', 145),
      r(22),
      i()(),
      a(23, 'div', 141)(24, 'span', 142),
      r(25, 'Active Councils'),
      i(),
      a(26, 'span', 145),
      r(27),
      i()(),
      p(28, Ut, 5, 1, 'div', 141),
      i(),
      p(29, Jt, 5, 1, 'div', 146),
      i();
  }
  if (n & 2) {
    let e,
      o = l(4);
    s(3),
      m('size', 14),
      s(2),
      T('section__refresh--spinning', o.widgetRefreshing()['system-status']),
      s(6),
      S('data-ok', o.wsService.connected()),
      s(),
      w(' ', o.wsService.connected() ? 'Connected' : 'Disconnected', ' '),
      s(4),
      u((e = o.algochatStatus()) ? 16 : 17, e),
      s(6),
      g(o.activeScheduleCount()),
      s(5),
      g(o.activeCouncilLaunches().length),
      s(),
      u(o.serverVersion() ? 28 : -1),
      s(),
      u(o.activeCouncilLaunches().length > 0 ? 29 : -1);
  }
}
function Xt(n, _t) {
  if ((n & 1 && p(0, Gt, 7, 1, 'div', 116)(1, Qt, 30, 10, 'div', 138), n & 2)) {
    const e = l(3);
    u(e.widgetErrors()['system-status'] ? 0 : 1);
  }
}
function Zt(n, t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 35),
      x('dragstart', (c) => {
        const d = v(e).$index,
          _ = l(2);
        return b(_.onWidgetDragStart(c, d));
      })('dragover', (c) => {
        const d = v(e).$index,
          _ = l(2);
        return b(_.onWidgetDragOver(c, d));
      })('drop', (c) => {
        const d = v(e).$index,
          _ = l(2);
        return b(_.onWidgetDrop(c, d));
      })('dragend', () => {
        v(e);
        const c = l(2);
        return b(c.widgetDragIndex.set(-1));
      }),
      p(1, ut, 2, 2, 'div', 36),
      p(2, ft, 69, 18, 'div', 37),
      p(3, kt, 2, 1),
      p(4, Et, 12, 4, 'div', 38),
      p(5, jt, 2, 1),
      p(6, Ht, 13, 3, 'div', 39),
      p(7, Xt, 2, 1),
      i();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = t.$index,
      c = l(2);
    T('widget--full', c.isFullWidth(e.id))('widget--drag-over', c.widgetDragOver() === o && c.widgetDragIndex() !== o),
      S('data-widget', e.id),
      s(),
      u(c.widgetRefreshing()[e.id] ? 1 : -1),
      s(),
      u(e.id === 'metrics' ? 2 : -1),
      s(),
      u(e.id === 'agents' ? 3 : -1),
      s(),
      u(e.id === 'active-sessions' ? 4 : -1),
      s(),
      u(e.id === 'activity' ? 5 : -1),
      s(),
      u(e.id === 'quick-actions' ? 6 : -1),
      s(),
      u(e.id === 'system-status' ? 7 : -1);
  }
}
function en(n, _t) {
  if (n & 1) {
    const e = y();
    a(0, 'div', 0),
      p(1, rt, 10, 0, 'div', 3),
      p(2, _t, 5, 0, 'div', 4),
      a(3, 'div', 5)(4, 'div', 6)(5, 'span', 7),
      C(6, 'app-icon', 8),
      r(7, ' Dashboard'),
      i(),
      a(8, 'span', 9),
      C(9, 'span', 10),
      a(10, 'span', 11),
      r(11),
      i()(),
      p(12, mt, 3, 3, 'span', 12),
      i(),
      a(13, 'div', 13)(14, 'button', 14),
      x('click', () => {
        v(e);
        const c = l();
        return b(c.layoutService.customizing.set(!c.layoutService.customizing()));
      }),
      r(15),
      i()()(),
      p(16, pt, 11, 0, 'div', 15),
      a(17, 'div', 16),
      M(18, Zt, 8, 12, 'div', 17, X),
      i()();
  }
  if (n & 2) {
    const e = l();
    s(),
      u(e.tryMode() ? 1 : -1),
      s(),
      u(e.systemAlerts().length > 0 && !e.alertsDismissed() ? 2 : -1),
      s(4),
      m('size', 16),
      s(2),
      S('data-status', e.connectionState()),
      s(3),
      g(e.connectionLabel()),
      s(),
      u(e.lastRefresh() ? 12 : -1),
      s(3),
      w(' ', e.layoutService.customizing() ? 'Done' : 'Customize', ' '),
      s(),
      u(e.layoutService.customizing() ? 16 : -1),
      s(2),
      k(e.layoutService.visibleWidgets());
  }
}
var Ee = class n {
  projectService = h(K);
  agentService = h(q);
  sessionService = h(U);
  councilService = h(xe);
  workTaskService = h(he);
  scheduleService = h(ye);
  wsService = h(se);
  apiService = h(G);
  router = h(H);
  notify = h(oe);
  tourService = h(Me);
  layoutService = h(Q);
  algochatStatus = this.sessionService.algochatStatus;
  showWelcome = D(() => this.agentService.agents().length === 0 && !this.wizardDismissed());
  wizardDismissed = f(!1);
  alertsDismissed = f(!1);
  runningSessions = D(() => this.sessionService.sessions().filter((t) => t.status === 'running'));
  activeCouncilLaunches = f([]);
  overview = f(null);
  agentSummaries = f([]);
  selfTestRunning = f(!1);
  loading = f(!0);
  serverVersion = f(null);
  tryMode = f(!1);
  agentMessages = f([]);
  widgetErrors = f({});
  widgetRefreshing = f({});
  lastRefresh = f(null);
  dragIndex = f(-1);
  widgetDragIndex = f(-1);
  widgetDragOver = f(-1);
  promptSuggestions = [
    'Build me a portfolio website',
    'Create a REST API for my project',
    'Help me debug my application',
    'Set up a CI/CD pipeline',
  ];
  connectionState = D(() =>
    this.wsService.serverRestarting() ? 'reconnecting' : this.wsService.connected() ? 'connected' : 'disconnected',
  );
  connectionLabel = D(() => {
    switch (this.connectionState()) {
      case 'connected':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting\u2026';
      case 'disconnected':
        return 'Offline';
    }
  });
  activeWorkTaskCount = D(() => {
    const t = this.overview()?.workTasks;
    return t ? (t.pending ?? 0) + (t.running ?? 0) + (t.branching ?? 0) + (t.validating ?? 0) : 0;
  });
  activeScheduleCount = D(() => this.scheduleService.schedules().filter((t) => t.status === 'active').length);
  systemAlerts = D(() => {
    const t = [],
      e = this.algochatStatus();
    e &&
      !e.enabled &&
      t.push({
        level: 'warn',
        message: 'AlgoChat disconnected \u2014 on-chain messaging unavailable',
        link: '/settings',
      }),
      e &&
        e.balance < 5e5 &&
        e.address !== 'local' &&
        t.push({
          level: 'warn',
          message: `Low ALGO balance (${(e.balance / 1e6).toFixed(2)} ALGO)`,
          link: '/settings/wallets',
        });
    const o = this.sessionService.sessions().filter((c) => c.status === 'error');
    return (
      o.length > 0 &&
        t.push({
          level: 'error',
          message: `${o.length} session${o.length > 1 ? 's' : ''} in error state`,
          link: '/sessions',
        }),
      this.wsService.connected() ||
        t.push({ level: 'error', message: 'WebSocket disconnected \u2014 real-time updates unavailable' }),
      t
    );
  });
  activityFeed = D(() => {
    const t = this.sessionService.sessions(),
      e = this.agentService.agents(),
      o = new Map(e.map((d) => [d.id, d.name])),
      c = [];
    for (const d of t.slice(0, 30)) {
      const _ = o.get(d.agentId ?? '') ?? 'Unknown';
      d.status === 'running'
        ? c.push({
            type: 'session_started',
            label: 'Session started',
            detail: `${_} \u2014 ${d.name || d.initialPrompt?.slice(0, 40) || d.id.slice(0, 8)}`,
            timestamp: d.updatedAt || d.createdAt,
            link: `/sessions/${d.id}`,
            status: d.status,
          })
        : d.status === 'stopped' || d.status === 'idle'
          ? c.push({
              type: 'session_completed',
              label: 'Session completed',
              detail: `${_} \u2014 ${d.name || d.id.slice(0, 8)}`,
              timestamp: d.updatedAt || d.createdAt,
              link: `/sessions/${d.id}`,
              status: d.status,
            })
          : d.status === 'error' &&
            c.push({
              type: 'session_error',
              label: 'Session error',
              detail: `${_} \u2014 ${d.name || d.id.slice(0, 8)}`,
              timestamp: d.updatedAt || d.createdAt,
              link: `/sessions/${d.id}`,
              status: d.status,
            });
    }
    for (const d of this.workTaskService.tasks().slice(0, 10)) {
      const _ = o.get(d.agentId) ?? 'Unknown';
      c.push({
        type: 'work_task',
        label: `Work task: ${d.status}`,
        detail: `${_} \u2014 ${d.description.slice(0, 50)}`,
        timestamp: d.completedAt || d.createdAt,
        link: '/work-tasks',
        status: d.status,
      });
    }
    for (const d of this.agentMessages().slice(0, 10)) {
      const _ = o.get(d.fromAgentId) ?? d.fromAgentId.slice(0, 8),
        F = o.get(d.toAgentId) ?? d.toAgentId.slice(0, 8);
      c.push({
        type: 'agent_message',
        label: `Message: ${d.status}`,
        detail: `${_} \u2192 ${F}`,
        timestamp: d.completedAt || d.createdAt,
        link: `/agents/${d.toAgentId}`,
        status: d.status,
      });
    }
    return c.sort((d, _) => new Date(_.timestamp).getTime() - new Date(d.timestamp).getTime()).slice(0, 15);
  });
  unsubscribeWs = null;
  isFullWidth(t) {
    return t === 'metrics' || t === 'agents' || t === 'active-sessions';
  }
  getAgentHealth(t) {
    const e = t.recentTasksCompleted + t.recentTasksFailed;
    if (e >= 3 && t.recentTasksFailed / e > 0.5) return 'red';
    if (t.runningSessions > 0) return 'green';
    if (!t.lastActive) return 'grey';
    const o = (Date.now() - new Date(t.lastActive).getTime()) / (1e3 * 60 * 60);
    return o < 1 ? 'green' : o < 24 ? 'yellow' : 'red';
  }
  getAgentHealthLabel(t) {
    switch (this.getAgentHealth(t)) {
      case 'green':
        return t.runningSessions > 0 ? 'Active' : 'Healthy';
      case 'yellow':
        return 'Idle';
      case 'red': {
        const o = t.recentTasksCompleted + t.recentTasksFailed;
        return o >= 3 && t.recentTasksFailed / o > 0.5 ? 'Degraded' : 'Offline';
      }
      case 'grey':
        return 'No Data';
      default:
        return '';
    }
  }
  handleKeyboard(t) {
    const e = t.target?.tagName;
    e === 'INPUT' ||
      e === 'TEXTAREA' ||
      e === 'SELECT' ||
      (t.key.toLowerCase() === 'r' && !t.ctrlKey && !t.metaKey && (t.preventDefault(), this.refreshAll()));
  }
  async refreshAll() {
    this.notify.info('Refreshing dashboard...');
    const t = [
      this.loadOverview(),
      this.agentService.loadAgents().then(() => this.loadAgentSummaries()),
      this.sessionService.loadSessions(),
      this.sessionService.loadAlgoChatStatus(),
      this.loadActiveCouncilLaunches(),
      this.loadServerVersion(),
      this.loadAgentMessages(),
    ];
    await Promise.allSettled(t), this.lastRefresh.set(new Date().toISOString());
  }
  ngOnInit() {
    const t = [
      this.projectService.loadProjects(),
      this.agentService.loadAgents().then(() => this.loadAgentSummaries()),
      this.sessionService.loadSessions(),
      this.sessionService.loadAlgoChatStatus(),
      this.councilService.loadCouncils(),
      this.scheduleService.loadSchedules(),
      this.workTaskService.loadTasks(),
      this.loadActiveCouncilLaunches(),
      this.loadOverview(),
      this.loadServerVersion(),
      this.agentService.loadAgents().then(() => this.loadAgentMessages()),
    ];
    Promise.allSettled(t).then(() => {
      this.loading.set(!1),
        this.lastRefresh.set(new Date().toISOString()),
        !this.tourService.isCompleted &&
          this.agentService.agents().length > 0 &&
          !this.showWelcome() &&
          setTimeout(() => this.tourService.startTour(), 800);
    }),
      (this.unsubscribeWs = this.wsService.onMessage((e) => {
        if (
          (e.type === 'agent_balance' &&
            this.agentSummaries.update((o) =>
              o.map((c) => (c.agent.id === e.agentId ? I(O({}, c), { balance: e.balance }) : c)),
            ),
          e.type === 'agent_message_update' && this.loadAgentMessages(),
          e.type === 'session_status')
        ) {
          const o = e.status;
          (o === 'idle' || o === 'error' || o === 'stopped' || o === 'running') && this.sessionService.loadSessions();
        }
      }));
  }
  ngOnDestroy() {
    this.unsubscribeWs?.();
  }
  onWizardComplete() {
    this.wizardDismissed.set(!0),
      this.agentService.loadAgents().then(() => {
        this.loadAgentSummaries(), this.tourService.isCompleted || setTimeout(() => this.tourService.startTour(), 600);
      }),
      this.loadOverview();
  }
  getAgentName(t) {
    return t ? (this.agentService.agents().find((o) => o.id === t)?.name ?? 'Agent') : 'Agent';
  }
  navigateTo(t) {
    this.router.navigate([t]);
  }
  startChatWithPrompt(t) {
    const e = this.agentSummaries()[0]?.agent;
    e
      ? this.router.navigate(['/sessions/new'], { queryParams: { agentId: e.id, prompt: t } })
      : this.router.navigate(['/sessions/new'], { queryParams: { prompt: t } });
  }
  startChat(t, e) {
    e.preventDefault(), e.stopPropagation(), this.router.navigate(['/sessions/new'], { queryParams: { agentId: t } });
  }
  startWorkTask(t, e) {
    e.preventDefault(),
      e.stopPropagation(),
      this.router.navigate(['/sessions/work-tasks'], { queryParams: { agentId: t } });
  }
  async runSelfTest() {
    this.selfTestRunning.set(!0), this.notify.info('Self-test running...');
    try {
      const t = await E(this.apiService.post('/selftest/run', { testType: 'all' }));
      t.sessionId && this.router.navigate(['/sessions', t.sessionId]);
    } catch {
    } finally {
      this.selfTestRunning.set(!1);
    }
  }
  onCustomizeDragStart(t, e) {
    this.dragIndex.set(e), t.dataTransfer?.setData('text/plain', String(e));
  }
  onCustomizeDragOver(t, _e) {
    t.preventDefault();
  }
  onCustomizeDrop(t, e) {
    t.preventDefault();
    const o = this.dragIndex();
    o >= 0 && o !== e && this.layoutService.moveWidget(o, e), this.dragIndex.set(-1);
  }
  onWidgetDragStart(t, e) {
    this.widgetDragIndex.set(e), t.dataTransfer?.setData('text/plain', String(e));
  }
  onWidgetDragOver(t, e) {
    t.preventDefault(), this.widgetDragOver.set(e);
  }
  onWidgetDrop(t, e) {
    t.preventDefault();
    const o = this.widgetDragIndex();
    if (o >= 0 && o !== e) {
      const c = this.layoutService.visibleWidgets(),
        d = this.layoutService.widgets(),
        _ = c[o]?.id,
        F = c[e]?.id,
        N = d.findIndex((W) => W.id === _),
        L = d.findIndex((W) => W.id === F);
      N >= 0 && L >= 0 && this.layoutService.moveWidget(N, L);
    }
    this.widgetDragIndex.set(-1), this.widgetDragOver.set(-1);
  }
  async refreshWidget(t) {
    this.widgetRefreshing.update((e) => I(O({}, e), { [t]: !0 })),
      this.widgetErrors.update((e) => {
        const o = O({}, e);
        return delete o[t], o;
      });
    try {
      switch (t) {
        case 'metrics':
          await this.loadOverview();
          break;
        case 'agents':
          await this.agentService.loadAgents().then(() => this.loadAgentSummaries());
          break;
        case 'active-sessions':
          await this.sessionService.loadSessions();
          break;
        case 'activity':
          await Promise.all([
            this.sessionService.loadSessions(),
            this.workTaskService.loadTasks(),
            this.loadAgentMessages(),
          ]);
          break;
        case 'system-status':
          await Promise.all([this.loadServerVersion(), this.loadActiveCouncilLaunches()]);
          break;
      }
    } catch {
      this.widgetErrors.update((o) => I(O({}, o), { [t]: 'Failed to load data' }));
    } finally {
      this.widgetRefreshing.update((e) => I(O({}, e), { [t]: !1 }));
    }
  }
  async loadOverview() {
    try {
      const t = await E(this.apiService.get('/analytics/overview'));
      this.overview.set(t);
    } catch {}
  }
  async loadAgentSummaries() {
    const t = this.agentService.agents();
    if (t.length === 0) return;
    const e = this.sessionService.sessions(),
      o = new Map();
    try {
      const d = await E(this.apiService.get('/flock-directory/agents'));
      for (const _ of d.agents) o.set(_.name.toLowerCase(), _);
    } catch {}
    const c = await Promise.all(
      t.map(async (d) => {
        let _ = 0;
        try {
          _ = (await this.agentService.getBalance(d.id)).balance;
        } catch {}
        const F = e.filter((P) => P.agentId === d.id),
          N = F.filter((P) => P.status === 'running').length,
          L = F.sort((P, Ie) => new Date(Ie.updatedAt).getTime() - new Date(P.updatedAt).getTime())[0],
          W = o.get(d.name.toLowerCase()),
          Z = this.workTaskService.tasks().filter((P) => P.agentId === d.id),
          Te = Z.filter((P) => P.status === 'completed').length,
          Ae = Z.filter((P) => P.status === 'failed').length;
        return {
          agent: d,
          balance: _,
          runningSessions: N,
          lastActive: L?.updatedAt ?? null,
          reputationScore: W?.reputationScore ?? null,
          capabilities: W?.capabilities ?? [],
          recentTasksCompleted: Te,
          recentTasksFailed: Ae,
        };
      }),
    );
    this.agentSummaries.set(c);
  }
  async loadServerVersion() {
    try {
      const t = await E(this.apiService.get('/health'));
      t.version && this.serverVersion.set(t.version), t.tryMode && this.tryMode.set(!0);
    } catch {}
  }
  async loadActiveCouncilLaunches() {
    try {
      const t = await this.councilService.getAllLaunches();
      this.activeCouncilLaunches.set(t.filter((e) => e.stage !== 'complete'));
    } catch {}
  }
  async loadAgentMessages() {
    try {
      const t = this.agentService.agents(),
        e = [];
      for (const c of t.slice(0, 5)) {
        const d = await this.agentService.getMessages(c.id);
        e.push(...d);
      }
      const o = [...new Map(e.map((c) => [c.id, c])).values()];
      this.agentMessages.set(
        o.sort((c, d) => new Date(d.createdAt).getTime() - new Date(c.createdAt).getTime()).slice(0, 20),
      );
    } catch {}
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = $({
    type: n,
    selectors: [['app-dashboard']],
    hostBindings: (e, o) => {
      e & 1 && x('keydown', (d) => o.handleKeyboard(d), te);
    },
    decls: 3,
    vars: 1,
    consts: [
      [1, 'dashboard'],
      [3, 'agentCreated'],
      ['variant', 'card', 3, 'count'],
      [1, 'sandbox-banner'],
      [1, 'system-alerts'],
      [1, 'dash-toolbar'],
      [1, 'dash-toolbar__left'],
      [1, 'dash-toolbar__title'],
      ['name', 'dashboard', 3, 'size'],
      [1, 'connection-badge'],
      [1, 'connection-badge__dot'],
      [1, 'connection-badge__label'],
      [1, 'dash-toolbar__updated'],
      [1, 'dash-toolbar__right'],
      [1, 'customize-btn', 3, 'click'],
      [1, 'customize-panel'],
      [1, 'widget-grid', 'stagger-children'],
      ['draggable', 'true', 1, 'widget', 3, 'widget--full', 'widget--drag-over'],
      [1, 'sandbox-banner__icon'],
      [1, 'sandbox-banner__text'],
      [1, 'system-alert'],
      [1, 'system-alerts__dismiss', 3, 'click'],
      ['aria-hidden', 'true', 1, 'system-alert__icon'],
      [1, 'system-alert__msg'],
      [1, 'system-alert__link', 3, 'routerLink'],
      [1, 'customize-panel__header'],
      [1, 'customize-panel__title'],
      [1, 'customize-panel__reset', 3, 'click'],
      [1, 'customize-panel__hint'],
      [1, 'customize-list'],
      ['draggable', 'true', 1, 'customize-item', 3, 'customize-item--dragging', 'customize-item--hidden'],
      ['draggable', 'true', 1, 'customize-item', 3, 'dragstart', 'dragover', 'drop', 'dragend'],
      [1, 'customize-item__handle'],
      [1, 'customize-item__label'],
      [1, 'customize-item__toggle', 3, 'click'],
      ['draggable', 'true', 1, 'widget', 3, 'dragstart', 'dragover', 'drop', 'dragend'],
      [1, 'widget-refreshing'],
      [1, 'metrics-row', 'stagger-scale'],
      [1, 'section'],
      [1, 'section', 'section--actions'],
      [3, 'variant', 'count'],
      [1, 'metric-card'],
      [1, 'metric-card__header'],
      [1, 'metric-card__icon', 'metric-card__icon--cyan'],
      ['name', 'agents', 3, 'size'],
      [1, 'metric-card__label'],
      [1, 'metric-card__value'],
      ['routerLink', '/agents', 1, 'metric-card__link'],
      [1, 'metric-card__icon', 'metric-card__icon--amber'],
      ['name', 'activity', 3, 'size'],
      [1, 'metric-card__value', 'metric-card__value--active'],
      ['routerLink', '/sessions', 1, 'metric-card__link'],
      [1, 'metric-card__icon', 'metric-card__icon--purple'],
      ['name', 'code', 3, 'size'],
      ['routerLink', '/agents/projects', 1, 'metric-card__link'],
      [1, 'metric-card', 'metric-card--highlight'],
      [1, 'metric-card__icon', 'metric-card__icon--green'],
      ['name', 'bar-chart', 3, 'size'],
      [1, 'metric-card__value', 'metric-card__value--usd'],
      ['routerLink', '/observe/analytics', 1, 'metric-card__link'],
      ['name', 'zap', 3, 'size'],
      ['name', 'terminal', 3, 'size'],
      [1, 'metric-card__value', 'metric-card__value--work'],
      ['routerLink', '/sessions/work-tasks', 1, 'metric-card__link'],
      ['name', 'sessions', 3, 'size'],
      [1, 'metric-card__icon', 'metric-card__icon--magenta'],
      ['name', 'wallet', 3, 'size'],
      [1, 'metric-card__value', 'metric-card__value--algo'],
      [1, 'metric-card__sub'],
      [1, 'simple-hero'],
      [1, 'section__header'],
      [1, 'section__header-actions'],
      ['routerLink', '/agents', 1, 'section__link'],
      ['title', 'Refresh', 1, 'section__refresh', 3, 'click'],
      [1, 'agent-grid'],
      [1, 'agent-card', 3, 'routerLink'],
      [1, 'agent-card__top'],
      [1, 'agent-card__info'],
      [1, 'agent-card__name-row'],
      [1, 'agent-card__health-badge'],
      [1, 'agent-card__health-dot'],
      [1, 'agent-card__name'],
      [1, 'agent-card__provider-badge'],
      [1, 'agent-card__reputation'],
      [1, 'agent-card__capabilities'],
      [1, 'agent-card__status'],
      [1, 'agent-card__stats'],
      [1, 'agent-card__stat'],
      [1, 'agent-card__stat-value'],
      [1, 'agent-card__stat-label'],
      [1, 'agent-card__stat-value', 'agent-card__stat-value--algo'],
      [1, 'agent-card__stat-value--time', 3, 'title'],
      [1, 'agent-card__actions'],
      [1, 'agent-card__btn', 3, 'click'],
      [1, 'agent-card__rep-score'],
      [1, 'agent-card__rep-label'],
      [1, 'agent-card__cap-pill'],
      [1, 'agent-card__cap-more'],
      [1, 'simple-hero__title'],
      [1, 'simple-hero__desc'],
      [1, 'simple-hero__btn', 3, 'click'],
      ['routerLink', '/sessions', 1, 'section__link'],
      [1, 'empty-state'],
      [1, 'session-list'],
      [1, 'empty-state__title'],
      [1, 'empty-state__hint'],
      [1, 'empty-state__actions'],
      ['routerLink', '/sessions/new', 1, 'empty-state__link'],
      ['routerLink', '/work-tasks', 1, 'empty-state__link'],
      [1, 'session-item', 3, 'routerLink'],
      ['routerLink', '/sessions', 1, 'session-list__more'],
      [1, 'session-item__dot'],
      [1, 'session-item__body'],
      [1, 'session-item__label'],
      [1, 'session-item__detail'],
      [1, 'session-item__time', 3, 'title'],
      [1, 'widget-error'],
      [1, 'section', 'section--feed'],
      [1, 'widget-error__icon'],
      [1, 'widget-error__msg'],
      [1, 'widget-error__retry', 3, 'click'],
      ['name', 'clock', 3, 'size'],
      ['routerLink', '/observe/analytics', 1, 'section__link'],
      [1, 'activity-feed'],
      [1, 'activity-item', 3, 'routerLink'],
      [1, 'activity-item__icon'],
      ['name', 'play', 3, 'size'],
      ['name', 'check', 3, 'size'],
      ['name', 'alert', 3, 'size'],
      ['name', 'users', 3, 'size'],
      ['name', 'chat', 3, 'size'],
      [1, 'activity-item__body'],
      [1, 'activity-item__label'],
      [1, 'activity-item__detail'],
      [1, 'activity-item__time', 3, 'title'],
      [1, 'quick-actions'],
      [1, 'action-btn', 3, 'click'],
      [1, 'action-btn', 'action-btn--selftest', 3, 'click', 'disabled'],
      [1, 'section', 'section--status'],
      ['name', 'server', 3, 'size'],
      [1, 'status-list'],
      [1, 'status-row'],
      [1, 'status-row__label'],
      [1, 'status-row__indicator'],
      ['data-ok', 'false', 1, 'status-row__indicator'],
      [1, 'status-row__value'],
      [1, 'councils-sub'],
      [1, 'status-row__value', 'status-row__value--version'],
      [1, 'running-item'],
      [3, 'routerLink'],
      [1, 'stage-badge'],
    ],
    template: (e, o) => {
      e & 1 && p(0, it, 1, 0, 'app-welcome-wizard')(1, at, 2, 1, 'div', 0)(2, en, 20, 8, 'div', 0),
        e & 2 && u(o.showWelcome() ? 0 : o.loading() ? 1 : 2);
    },
    dependencies: [re, Y, ke, Pe, ae, we, Se],
    styles: [
      '.dashboard[_ngcontent-%COMP%]{padding:1.25rem;overflow-y:auto;height:100%;animation:_ngcontent-%COMP%_dashEnter .3s ease-out}@keyframes _ngcontent-%COMP%_dashEnter{0%{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.sandbox-banner[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.6rem;background:var(--accent-amber-subtle, rgba(245,158,11,.12));border:1px solid var(--accent-amber, #f59e0b);border-radius:6px;padding:.5rem .9rem;margin-bottom:.75rem;font-size:.8rem;color:var(--text-primary)}.sandbox-banner__icon[_ngcontent-%COMP%]{font-size:1rem;flex-shrink:0}.sandbox-banner__text[_ngcontent-%COMP%]{line-height:1.4}.sandbox-banner__text[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{font-family:var(--font-mono, monospace);background:var(--bg-elevated, rgba(255,255,255,.05));border-radius:3px;padding:0 4px;font-size:.75rem}.system-alerts[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.75rem;animation:slideUp .3s ease-out}.system-alert[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.45rem .75rem;border-radius:var(--radius);font-size:.75rem;border:1px solid}.system-alert[data-level=error][_ngcontent-%COMP%]{background:var(--accent-red-subtle);border-color:var(--accent-red-border);color:var(--accent-red)}.system-alert[data-level=warn][_ngcontent-%COMP%]{background:var(--accent-amber-subtle);border-color:var(--accent-amber-border);color:var(--accent-amber)}.system-alert[data-level=info][_ngcontent-%COMP%]{background:var(--accent-cyan-subtle);border-color:var(--accent-cyan-border);color:var(--accent-cyan)}.system-alert__icon[_ngcontent-%COMP%]{flex-shrink:0;font-size:.85rem}.system-alert__msg[_ngcontent-%COMP%]{flex:1;color:var(--text-primary)}.system-alert__link[_ngcontent-%COMP%]{font-size:.65rem;font-weight:600;text-decoration:none;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;opacity:.8;transition:opacity .15s}.system-alert__link[_ngcontent-%COMP%]:hover{opacity:1;text-decoration:underline}.system-alert[data-level=error][_ngcontent-%COMP%]   .system-alert__link[_ngcontent-%COMP%]{color:var(--accent-red)}.system-alert[data-level=warn][_ngcontent-%COMP%]   .system-alert__link[_ngcontent-%COMP%]{color:var(--accent-amber)}.system-alerts__dismiss[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-tertiary);font-size:.6rem;font-family:inherit;cursor:pointer;padding:.15rem .5rem;align-self:flex-end;text-transform:uppercase;letter-spacing:.04em;transition:color .15s}.system-alerts__dismiss[_ngcontent-%COMP%]:hover{color:var(--text-secondary)}.dash-toolbar[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:.5rem;flex-wrap:wrap;position:sticky;top:0;z-index:20;background:var(--bg-base);padding:.5rem 0;border-bottom:1px solid var(--border)}.dash-toolbar__left[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.dash-toolbar__title[_ngcontent-%COMP%]{font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:0;display:flex;align-items:center;gap:.4rem}.dash-toolbar__updated[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary)}.connection-badge[_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:10px;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border:1px solid transparent;transition:all .2s}.connection-badge__dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;flex-shrink:0}.connection-badge[data-status=connected][_ngcontent-%COMP%]{color:var(--accent-green);background:var(--accent-green-subtle);border-color:var(--accent-green-border)}.connection-badge[data-status=connected][_ngcontent-%COMP%]   .connection-badge__dot[_ngcontent-%COMP%]{background:var(--accent-green);box-shadow:0 0 4px var(--accent-green-glow)}.connection-badge[data-status=disconnected][_ngcontent-%COMP%]{color:var(--accent-red);background:var(--accent-red-subtle);border-color:var(--accent-red-border)}.connection-badge[data-status=disconnected][_ngcontent-%COMP%]   .connection-badge__dot[_ngcontent-%COMP%]{background:var(--accent-red);box-shadow:0 0 4px var(--accent-red-glow);animation:_ngcontent-%COMP%_pulse-dot 1s infinite}.connection-badge[data-status=reconnecting][_ngcontent-%COMP%]{color:var(--accent-amber);background:var(--accent-amber-subtle);border-color:var(--accent-amber-border)}.connection-badge[data-status=reconnecting][_ngcontent-%COMP%]   .connection-badge__dot[_ngcontent-%COMP%]{background:var(--accent-amber);box-shadow:0 0 4px var(--accent-amber-glow);animation:_ngcontent-%COMP%_pulse-dot .6s infinite}@keyframes _ngcontent-%COMP%_pulse-dot{0%,to{opacity:1}50%{opacity:.3}}.dash-toolbar__right[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center}.customize-btn[_ngcontent-%COMP%]{padding:.35rem .85rem;border-radius:var(--radius);font-size:.7rem;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid var(--accent-magenta);color:var(--accent-magenta);background:var(--accent-magenta-subtle);text-transform:uppercase;letter-spacing:.05em;transition:all .15s}.customize-btn[_ngcontent-%COMP%]:hover{background:var(--accent-magenta-dim)}.customize-panel[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--accent-magenta);border-radius:var(--radius-lg);padding:1rem 1.25rem;margin-bottom:1.25rem}.customize-panel__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem}.customize-panel__title[_ngcontent-%COMP%]{font-size:.85rem;font-weight:700;color:var(--text-primary)}.customize-panel__reset[_ngcontent-%COMP%]{font-size:.65rem;font-family:inherit;background:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:.2rem .5rem;color:var(--text-secondary);cursor:pointer;transition:all .15s}.customize-panel__reset[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan);color:var(--accent-cyan)}.customize-panel__hint[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);margin:0 0 .75rem}.customize-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.customize-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-raised);cursor:grab;transition:all .15s}.customize-item[_ngcontent-%COMP%]:active{cursor:grabbing}.customize-item--dragging[_ngcontent-%COMP%]{opacity:.4;border-color:var(--accent-cyan)}.customize-item--hidden[_ngcontent-%COMP%]{opacity:.5}.customize-item__handle[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary);-webkit-user-select:none;user-select:none}.customize-item__label[_ngcontent-%COMP%]{flex:1;font-size:.75rem;color:var(--text-primary);font-weight:600}.customize-item__toggle[_ngcontent-%COMP%]{padding:.15rem .45rem;font-size:.6rem;font-weight:700;font-family:inherit;border-radius:var(--radius-sm);cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}.customize-item__toggle[data-visible=true][_ngcontent-%COMP%]{background:var(--accent-green-dim);border:1px solid var(--accent-green);color:var(--accent-green)}.customize-item__toggle[data-visible=false][_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);color:var(--text-tertiary)}.widget-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;align-items:start;align-content:start}.widget--full[_ngcontent-%COMP%]{grid-column:1 / -1}.widget[_ngcontent-%COMP%]{transition:outline .15s,transform .2s ease,box-shadow .25s ease;border-radius:var(--radius-lg)}.widget--drag-over[_ngcontent-%COMP%]{outline:2px dashed var(--accent-cyan);outline-offset:4px}.widget[draggable=true][_ngcontent-%COMP%]{cursor:grab}.widget[draggable=true][_ngcontent-%COMP%]:active{cursor:grabbing}@container (max-width: 700px){.widget-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}}@container (min-width: 1400px){.widget-grid[_ngcontent-%COMP%]{grid-template-columns:1fr 1fr 1fr}.widget--full[_ngcontent-%COMP%]{grid-column:1 / -1}}.metrics-row[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.75rem}.metric-card[_ngcontent-%COMP%]{padding:.75rem 1rem;display:flex;flex-direction:column;gap:.2rem;transition:border-color .2s,box-shadow .25s,transform .2s;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg)}.metric-card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);transform:translateY(-1px);box-shadow:0 4px 16px var(--shadow-deep),0 0 12px var(--accent-cyan-subtle)}.metric-card--highlight[_ngcontent-%COMP%]{border-color:var(--accent-amber);border-style:dashed}.metric-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.35rem}.metric-card__icon[_ngcontent-%COMP%]{width:22px;height:22px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0}.metric-card__icon--cyan[_ngcontent-%COMP%]{background:var(--accent-cyan-subtle);color:var(--accent-cyan)}.metric-card__icon--green[_ngcontent-%COMP%]{background:var(--accent-green-subtle);color:var(--accent-green)}.metric-card__icon--amber[_ngcontent-%COMP%]{background:var(--accent-amber-subtle);color:var(--accent-amber)}.metric-card__icon--magenta[_ngcontent-%COMP%]{background:var(--accent-magenta-subtle);color:var(--accent-magenta)}.metric-card__icon--purple[_ngcontent-%COMP%]{background:var(--accent-purple-subtle);color:var(--accent-purple)}.metric-card__label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;font-weight:600}.metric-card__value[_ngcontent-%COMP%]{font-size:1.5rem;font-weight:700;color:var(--accent-cyan)}.metric-card__value--usd[_ngcontent-%COMP%]{color:var(--accent-green)}.metric-card__value--algo[_ngcontent-%COMP%]{color:var(--accent-magenta)}.metric-card__value--active[_ngcontent-%COMP%], .metric-card__value--work[_ngcontent-%COMP%]{color:var(--accent-amber)}.metric-card__link[_ngcontent-%COMP%]{font-size:.65rem;color:var(--accent-cyan);text-decoration:none;opacity:.7}.metric-card__link[_ngcontent-%COMP%]:hover{opacity:1;text-decoration:underline}.metric-card__sub[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase}.section[_ngcontent-%COMP%], .simple-hero[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem 1.25rem}.section[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem;display:flex;align-items:center;gap:.4rem}.section__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}.section__header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0}.section__link[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-cyan);text-decoration:none}.section__link[_ngcontent-%COMP%]:hover{text-decoration:underline}.simple-hero[_ngcontent-%COMP%]{text-align:center;padding:2rem}.simple-hero__title[_ngcontent-%COMP%]{margin:0 0 .5rem;font-size:1.2rem;font-weight:700;color:var(--text-primary)}.simple-hero__desc[_ngcontent-%COMP%]{margin:0 0 1.25rem;font-size:.8rem;color:var(--text-tertiary);max-width:400px;margin-left:auto;margin-right:auto}.simple-hero__btn[_ngcontent-%COMP%]{padding:.6rem 1.5rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;font-family:inherit;border:1px solid var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-subtle);cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s}.simple-hero__btn[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim);box-shadow:0 0 16px var(--accent-cyan-dim)}.agent-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem}.agent-card[_ngcontent-%COMP%]{display:block;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;text-decoration:none;color:inherit;cursor:pointer;transition:border-color .15s,box-shadow .15s}.agent-card[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan);box-shadow:0 0 12px var(--accent-cyan-subtle)}.agent-card__top[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}.agent-card__info[_ngcontent-%COMP%], .agent-card__stat[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.1rem}.agent-card__name-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.35rem}.agent-card__health-badge[_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:.3rem;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:12px;border:1px solid;flex-shrink:0}.agent-card__health-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;flex-shrink:0}.agent-card__health-badge[data-health=green][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green);background:var(--accent-green-dim)}.agent-card__health-badge[data-health=green][_ngcontent-%COMP%]   .agent-card__health-dot[_ngcontent-%COMP%]{background:var(--accent-green);box-shadow:0 0 6px var(--accent-green-glow)}.agent-card__health-badge[data-health=yellow][_ngcontent-%COMP%]{color:var(--accent-amber);border-color:var(--accent-amber);background:var(--accent-amber-dim)}.agent-card__health-badge[data-health=yellow][_ngcontent-%COMP%]   .agent-card__health-dot[_ngcontent-%COMP%]{background:var(--accent-amber);box-shadow:0 0 6px var(--accent-amber-glow)}.agent-card__health-badge[data-health=red][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red);background:var(--accent-red-dim)}.agent-card__health-badge[data-health=red][_ngcontent-%COMP%]   .agent-card__health-dot[_ngcontent-%COMP%]{background:var(--accent-red);box-shadow:0 0 6px var(--accent-red-glow)}.agent-card__health-badge[data-health=grey][_ngcontent-%COMP%]{color:var(--text-tertiary);border-color:var(--border);background:var(--bg-raised)}.agent-card__health-badge[data-health=grey][_ngcontent-%COMP%]   .agent-card__health-dot[_ngcontent-%COMP%]{background:var(--text-tertiary)}.agent-card__name[_ngcontent-%COMP%]{font-weight:700;font-size:.85rem;color:var(--text-primary)}.agent-card__provider-badge[_ngcontent-%COMP%]{font-size:.55rem;font-family:var(--font-mono,monospace);font-weight:600;padding:1px 6px;border-radius:var(--radius-sm);border:1px solid;text-transform:uppercase;letter-spacing:.05em}.agent-card__provider-badge[data-provider=anthropic][_ngcontent-%COMP%]{color:#d4a574;border-color:#d4a57466}.agent-card__provider-badge[data-provider=openai][_ngcontent-%COMP%]{color:#74d4a5;border-color:#74d4a566}.agent-card__provider-badge[data-provider=ollama][_ngcontent-%COMP%]{color:#a5a5ff;border-color:#a5a5ff66}.agent-card__status[_ngcontent-%COMP%]{font-size:.6rem;font-weight:700;padding:2px 8px;border-radius:var(--radius-sm);text-transform:uppercase;letter-spacing:.06em;border:1px solid}[data-status=busy][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green);background:var(--accent-green-subtle)}[data-status=idle][_ngcontent-%COMP%]{color:var(--text-tertiary);border-color:var(--border);background:var(--bg-surface)}.agent-card__stats[_ngcontent-%COMP%]{display:flex;gap:1rem;margin-bottom:.5rem}.agent-card__stat-value[_ngcontent-%COMP%], .agent-card__stat-value--algo[_ngcontent-%COMP%]{font-weight:700}.agent-card__stat-value[_ngcontent-%COMP%]{font-size:.95rem;color:var(--accent-cyan)}.agent-card__stat-value--algo[_ngcontent-%COMP%]{font-size:.85rem;color:var(--accent-green)}.agent-card__stat-value--time[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.agent-card__stat-label[_ngcontent-%COMP%]{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em}.agent-card__actions[_ngcontent-%COMP%]{display:flex;gap:.35rem}.agent-card__btn[_ngcontent-%COMP%]{padding:.25rem .6rem;font-size:.65rem;font-weight:600;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;background:transparent;border:1px solid var(--border-bright);border-radius:var(--radius-sm);color:var(--text-secondary);transition:all .15s}.agent-card__btn[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.agent-card__reputation[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.25rem;margin-top:.15rem}.agent-card__rep-score[_ngcontent-%COMP%]{font-size:.75rem;font-weight:700;font-family:var(--font-mono,monospace);padding:1px 5px;border-radius:var(--radius-sm);border:1px solid}[data-level=high][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}[data-level=mid][_ngcontent-%COMP%]{color:var(--accent-amber);border-color:var(--accent-amber)}[data-level=low][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.agent-card__rep-label[_ngcontent-%COMP%]{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase}.agent-card__capabilities[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.35rem}.agent-card__cap-pill[_ngcontent-%COMP%]{font-size:.55rem;padding:1px 6px;border-radius:9999px;text-transform:lowercase;font-weight:500;background:var(--accent-cyan-subtle);border:1px solid var(--accent-cyan-border);color:var(--accent-cyan)}.agent-card__cap-more[_ngcontent-%COMP%]{font-size:.55rem;padding:1px 6px;color:var(--text-tertiary);font-weight:500}.session-list[_ngcontent-%COMP%]{display:flex;flex-direction:column}.session-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.55rem 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit;transition:background .1s}.session-item[_ngcontent-%COMP%]:last-child{border-bottom:none}.session-item[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.session-item__dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:var(--accent-cyan);box-shadow:0 0 6px var(--accent-cyan-glow);animation:_ngcontent-%COMP%_pulse-dot 2s infinite}.session-item__body[_ngcontent-%COMP%]{flex:1;min-width:0;display:flex;flex-direction:column;gap:.1rem}.session-item__label[_ngcontent-%COMP%]{font-size:.8rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.session-item__detail[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);text-transform:capitalize}.session-item__time[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);flex-shrink:0}.session-list__more[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-cyan);text-decoration:none;padding:.4rem 0;text-align:center;display:block}.session-list__more[_ngcontent-%COMP%]:hover{text-decoration:underline}.activity-feed[_ngcontent-%COMP%]{display:flex;flex-direction:column}.activity-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit;transition:background .1s}.activity-item[_ngcontent-%COMP%]:last-child{border-bottom:none}.activity-item[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.activity-item__icon[_ngcontent-%COMP%]{width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;border-radius:50%;flex-shrink:0;background:var(--bg-raised);border:1px solid var(--border);color:var(--text-secondary)}.activity-item__icon[data-type=session_started][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.activity-item__icon[data-type=session_completed][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.activity-item__icon[data-type=session_error][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.activity-item__icon[data-type=work_task][_ngcontent-%COMP%], .activity-item__icon[data-type=agent_message][_ngcontent-%COMP%]{color:var(--accent-magenta);border-color:var(--accent-magenta)}.activity-item__icon[data-type=council][_ngcontent-%COMP%]{color:var(--accent-amber);border-color:var(--accent-amber)}.activity-item__body[_ngcontent-%COMP%]{flex:1;min-width:0;display:flex;flex-direction:column;gap:.1rem;max-width:100%}.activity-item__label[_ngcontent-%COMP%], .activity-item__detail[_ngcontent-%COMP%]{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.activity-item__label[_ngcontent-%COMP%]{font-size:.8rem;font-weight:600;color:var(--text-primary)}.activity-item__detail[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary)}.activity-item__time[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);flex-shrink:0}.quick-actions[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.action-btn[_ngcontent-%COMP%]{padding:.5rem .85rem;border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid var(--accent-cyan);background:var(--accent-cyan-subtle);color:var(--accent-cyan);font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s;text-align:left}.action-btn[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim)}.action-btn--selftest[_ngcontent-%COMP%]{border-color:var(--accent-magenta);color:var(--accent-magenta);background:var(--accent-magenta-subtle)}.action-btn--selftest[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-magenta-dim)}.action-btn[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.section--status[_ngcontent-%COMP%]{background:var(--bg-raised);border-color:var(--border-bright, #2a2d4a)}.status-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.status-row[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.8rem}.status-row[_ngcontent-%COMP%]:last-child{border-bottom:none}.status-row__label[_ngcontent-%COMP%]{color:var(--text-secondary)}.status-row__indicator[_ngcontent-%COMP%]{font-weight:600;font-size:.75rem}.status-row__indicator[data-ok=true][_ngcontent-%COMP%]{color:var(--accent-green)}.status-row__indicator[data-ok=false][_ngcontent-%COMP%]{color:var(--accent-red)}.status-row__value[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.status-row__value--version[_ngcontent-%COMP%]{font-family:var(--font-mono,monospace);font-size:.75rem;color:var(--text-tertiary)}.councils-sub[_ngcontent-%COMP%]{margin-top:.75rem;border-top:1px solid var(--border);padding-top:.5rem;max-height:200px;overflow-y:auto}.councils-sub[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:0 0 .5rem;font-size:.75rem;color:var(--text-primary)}.running-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.4rem 0;border-bottom:1px solid var(--border)}.running-item[_ngcontent-%COMP%]:last-child{border-bottom:none}.running-item[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]{color:var(--accent-cyan);text-decoration:none;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.running-item[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]:hover{text-decoration:underline}.stage-badge[_ngcontent-%COMP%]{font-size:.6rem;padding:2px 8px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;border:1px solid;background:var(--bg-raised);color:var(--text-secondary);flex-shrink:0}.stage-badge[data-stage=responding][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.stage-badge[data-stage=reviewing][_ngcontent-%COMP%]{color:var(--accent-magenta);border-color:var(--accent-magenta)}.stage-badge[data-stage=synthesizing][_ngcontent-%COMP%]{color:var(--accent-gold);border-color:var(--accent-gold)}.stage-badge[data-stage=complete][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.section__header-actions[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.section__refresh[_ngcontent-%COMP%]{width:24px;height:24px;padding:0;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-tertiary);font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}.section__refresh[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan);color:var(--accent-cyan)}.section__refresh--spinning[_ngcontent-%COMP%]{animation:_ngcontent-%COMP%_spin .8s linear infinite}@keyframes _ngcontent-%COMP%_spin{to{transform:rotate(360deg)}}.widget-refreshing[_ngcontent-%COMP%]{padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);position:relative;overflow:hidden}.widget-refreshing[_ngcontent-%COMP%]:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,var(--accent-cyan-subtle) 40%,var(--accent-cyan-subtle) 50%,var(--accent-cyan-subtle) 60%,transparent 100%);animation:_ngcontent-%COMP%_shimmer 1.5s infinite}@keyframes _ngcontent-%COMP%_shimmer{0%{transform:translate(-100%)}to{transform:translate(100%)}}.widget-error[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--accent-red);border-radius:var(--radius-lg);padding:1.5rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.5rem}.widget-error__icon[_ngcontent-%COMP%]{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;background:var(--accent-red-subtle);border:1px solid var(--accent-red);color:var(--accent-red);font-size:.85rem}.widget-error__msg[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.widget-error__retry[_ngcontent-%COMP%]{padding:.3rem .75rem;font-size:.65rem;font-weight:600;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;background:transparent;border:1px solid var(--accent-cyan);border-radius:var(--radius-sm);color:var(--accent-cyan);transition:all .15s}.widget-error__retry[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim)}.empty-state[_ngcontent-%COMP%]{text-align:center;padding:1.5rem 1rem}.empty-state__title[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem;font-weight:600;margin:0 0 .35rem}.empty-state__hint[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.75rem;margin:0 0 .75rem;line-height:1.5}.empty-state__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;justify-content:center}.empty-state__link[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-cyan);text-decoration:none;padding:.3rem .65rem;border:1px solid var(--accent-cyan-border);border-radius:var(--radius-sm);transition:all .15s}.empty-state__link[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-subtle);border-color:var(--accent-cyan)}@media(max-width:768px){.dashboard[_ngcontent-%COMP%]{padding:1rem}.widget-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.metrics-row[_ngcontent-%COMP%]{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.agent-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.quick-actions[_ngcontent-%COMP%]{flex-direction:row;flex-wrap:wrap}.action-btn[_ngcontent-%COMP%]{flex:1 1 calc(50% - .25rem);min-width:0;text-align:center}}@media(max-width:480px){.dashboard[_ngcontent-%COMP%]{padding:.75rem}.metrics-row[_ngcontent-%COMP%]{grid-template-columns:repeat(2,1fr);gap:.5rem}.metric-card[_ngcontent-%COMP%]{padding:.5rem .75rem}.metric-card__value[_ngcontent-%COMP%]{font-size:1.2rem}.section[_ngcontent-%COMP%]{padding:.75rem}}',
    ],
    changeDetection: 0,
  });
};

export { Ee as DashboardComponent };
