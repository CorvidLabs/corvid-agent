import { a as I } from './chunk-2EJE5M6O.js';
import { d as F, b as L, f as N, r as V } from './chunk-AF4UDQOX.js';
import { a as T } from './chunk-CSQXEU3M.js';
import { a as D } from './chunk-FGNIWOFY.js';
import { a as W } from './chunk-HUVUOGY7.js';
import './chunk-ZSTU6MUH.js';
import './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  Z as _,
  _a as B,
  jb as b,
  Vb as C,
  Ob as c,
  Na as d,
  mb as E,
  ib as f,
  Ub as g,
  vb as h,
  T as k,
  fc as M,
  Y as m,
  qb as n,
  nb as O,
  pb as o,
  rb as P,
  zb as p,
  Pb as S,
  Bb as s,
  Tb as u,
  ja as v,
  ob as w,
  Qb as x,
  Mb as y,
} from './chunk-LF4EWAJA.js';

var z = (_l, i) => i.id;
function j(l, _i) {
  if (l & 1) {
    const e = h();
    o(0, 'div', 5)(1, 'h3'),
      c(2, 'Create Bundle'),
      n(),
      o(3, 'div', 9)(4, 'div', 10)(5, 'label'),
      c(6, 'Name'),
      n(),
      o(7, 'input', 11),
      C('ngModelChange', (t) => {
        m(e);
        const a = s();
        return g(a.formName, t) || (a.formName = t), _(t);
      }),
      n()(),
      o(8, 'div', 10)(9, 'label'),
      c(10, 'Description'),
      n(),
      o(11, 'input', 12),
      C('ngModelChange', (t) => {
        m(e);
        const a = s();
        return g(a.formDescription, t) || (a.formDescription = t), _(t);
      }),
      n()(),
      o(12, 'div', 13)(13, 'label'),
      c(14, 'Tools (one per line)'),
      n(),
      o(15, 'textarea', 14),
      C('ngModelChange', (t) => {
        m(e);
        const a = s();
        return g(a.formTools, t) || (a.formTools = t), _(t);
      }),
      n()(),
      o(16, 'div', 13)(17, 'label'),
      c(18, 'Prompt Additions'),
      n(),
      o(19, 'textarea', 15),
      C('ngModelChange', (t) => {
        m(e);
        const a = s();
        return g(a.formPromptAdditions, t) || (a.formPromptAdditions = t), _(t);
      }),
      n()()(),
      o(20, 'div', 16)(21, 'button', 17),
      p('click', () => {
        m(e);
        const t = s();
        return _(t.onCreate());
      }),
      c(22),
      n()()();
  }
  if (l & 2) {
    const e = s();
    d(7),
      u('ngModel', e.formName),
      d(4),
      u('ngModel', e.formDescription),
      d(4),
      u('ngModel', e.formTools),
      d(4),
      u('ngModel', e.formPromptAdditions),
      d(2),
      w('disabled', e.creating() || !e.formName),
      d(),
      x(' ', e.creating() ? 'Creating...' : 'Create Bundle', ' ');
  }
}
function R(l, _i) {
  l & 1 && P(0, 'app-skeleton', 6), l & 2 && w('count', 3);
}
function q(l, _i) {
  l & 1 && P(0, 'app-empty-state', 7);
}
function G(l, _i) {
  l & 1 && (o(0, 'span', 23), c(1, 'Preset'), n());
}
function H(l, _i) {
  if (l & 1) {
    const e = h();
    o(0, 'div', 9)(1, 'div', 10)(2, 'label'),
      c(3, 'Name'),
      n(),
      o(4, 'input', 28),
      C('ngModelChange', (t) => {
        m(e);
        const a = s(4);
        return g(a.editName, t) || (a.editName = t), _(t);
      }),
      n()(),
      o(5, 'div', 10)(6, 'label'),
      c(7, 'Description'),
      n(),
      o(8, 'input', 28),
      C('ngModelChange', (t) => {
        m(e);
        const a = s(4);
        return g(a.editDescription, t) || (a.editDescription = t), _(t);
      }),
      n()(),
      o(9, 'div', 13)(10, 'label'),
      c(11, 'Tools (one per line)'),
      n(),
      o(12, 'textarea', 29),
      C('ngModelChange', (t) => {
        m(e);
        const a = s(4);
        return g(a.editTools, t) || (a.editTools = t), _(t);
      }),
      n()(),
      o(13, 'div', 13)(14, 'label'),
      c(15, 'Prompt Additions'),
      n(),
      o(16, 'textarea', 30),
      C('ngModelChange', (t) => {
        m(e);
        const a = s(4);
        return g(a.editPromptAdditions, t) || (a.editPromptAdditions = t), _(t);
      }),
      n()()(),
      o(17, 'div', 16)(18, 'button', 31),
      p('click', () => {
        m(e);
        const t = s(2).$implicit,
          a = s(2);
        return _(a.onSaveEdit(t.id));
      }),
      c(19, 'Save'),
      n(),
      o(20, 'button', 32),
      p('click', () => {
        m(e);
        const t = s(4);
        return _(t.editingId.set(null));
      }),
      c(21, 'Cancel'),
      n()();
  }
  if (l & 2) {
    const e = s(4);
    d(4),
      u('ngModel', e.editName),
      d(4),
      u('ngModel', e.editDescription),
      d(4),
      u('ngModel', e.editTools),
      d(4),
      u('ngModel', e.editPromptAdditions);
  }
}
function J(l, _i) {
  if ((l & 1 && (o(0, 'div', 34)(1, 'strong'), c(2, 'Prompt Additions:'), n(), o(3, 'pre'), c(4), n()()), l & 2)) {
    const e = s(3).$implicit;
    d(4), S(e.promptAdditions);
  }
}
function K(l, _i) {
  if (l & 1) {
    const e = h();
    o(0, 'button', 32),
      p('click', () => {
        m(e);
        const t = s(3).$implicit,
          a = s(2);
        return _(a.startEdit(t));
      }),
      c(1, 'Edit'),
      n(),
      o(2, 'button', 35),
      p('click', () => {
        m(e);
        const t = s(3).$implicit,
          a = s(2);
        return _(a.onDelete(t));
      }),
      c(3, 'Delete'),
      n();
  }
}
function Q(l, _i) {
  if (
    (l & 1 &&
      (o(0, 'div', 33)(1, 'strong'),
      c(2, 'Tools:'),
      n(),
      c(3),
      n(),
      f(4, J, 5, 1, 'div', 34),
      o(5, 'div', 16),
      f(6, K, 4, 0),
      n()),
    l & 2)
  ) {
    const e = s(2).$implicit;
    d(3), x(' ', e.tools.join(', ') || 'None', ' '), d(), b(e.promptAdditions ? 4 : -1), d(2), b(e.preset ? -1 : 6);
  }
}
function U(l, _i) {
  if ((l & 1 && (o(0, 'div', 27), f(1, H, 22, 4)(2, Q, 7, 3), n()), l & 2)) {
    const e = s().$implicit,
      r = s(2);
    d(), b(r.editingId() === e.id ? 1 : 2);
  }
}
function X(l, i) {
  if (l & 1) {
    const e = h();
    o(0, 'div', 19)(1, 'div', 20),
      p('click', () => {
        const t = m(e).$implicit,
          a = s(2);
        return _(a.toggleExpand(t.id));
      }),
      o(2, 'div', 21)(3, 'span', 22),
      c(4),
      n(),
      f(5, G, 2, 0, 'span', 23),
      n(),
      o(6, 'div', 24)(7, 'span', 25),
      c(8),
      n()()(),
      o(9, 'p', 26),
      c(10),
      n(),
      f(11, U, 3, 1, 'div', 27),
      n();
  }
  if (l & 2) {
    const e = i.$implicit,
      r = s(2);
    y('bundle-card--expanded', r.expandedId() === e.id),
      d(4),
      S(e.name),
      d(),
      b(e.preset ? 5 : -1),
      d(3),
      x('', e.tools.length, ' tools'),
      d(2),
      S(e.description || 'No description'),
      d(),
      b(r.expandedId() === e.id ? 11 : -1);
  }
}
function Y(l, _i) {
  if ((l & 1 && (o(0, 'div', 8), E(1, X, 12, 7, 'div', 18, z), n()), l & 2)) {
    const e = s();
    d(), O(e.filteredBundles());
  }
}
var A = class l {
  bundleService = k(W);
  notify = k(T);
  showCreateForm = v(!1);
  creating = v(!1);
  expandedId = v(null);
  editingId = v(null);
  activeFilter = v('all');
  formName = '';
  formDescription = '';
  formTools = '';
  formPromptAdditions = '';
  editName = '';
  editDescription = '';
  editTools = '';
  editPromptAdditions = '';
  presetCount = M(() => this.bundleService.bundles().filter((i) => i.preset).length);
  customCount = M(() => this.bundleService.bundles().filter((i) => !i.preset).length);
  filteredBundles = M(() => {
    const i = this.activeFilter(),
      e = this.bundleService.bundles();
    return i === 'preset' ? e.filter((r) => r.preset) : i === 'custom' ? e.filter((r) => !r.preset) : e;
  });
  async ngOnInit() {
    await this.bundleService.loadBundles();
  }
  toggleExpand(i) {
    this.expandedId.set(this.expandedId() === i ? null : i), this.editingId.set(null);
  }
  startEdit(i) {
    this.editingId.set(i.id),
      (this.editName = i.name),
      (this.editDescription = i.description),
      (this.editTools = i.tools.join(`
`)),
      (this.editPromptAdditions = i.promptAdditions);
  }
  async onCreate() {
    if (this.formName) {
      this.creating.set(!0);
      try {
        await this.bundleService.createBundle({
          name: this.formName,
          description: this.formDescription,
          tools: this.formTools
            .split(`
`)
            .map((i) => i.trim())
            .filter(Boolean),
          promptAdditions: this.formPromptAdditions,
        }),
          (this.formName = ''),
          (this.formDescription = ''),
          (this.formTools = ''),
          (this.formPromptAdditions = ''),
          this.showCreateForm.set(!1),
          this.notify.success('Bundle created');
      } catch {
        this.notify.error('Failed to create bundle');
      } finally {
        this.creating.set(!1);
      }
    }
  }
  async onSaveEdit(i) {
    try {
      await this.bundleService.updateBundle(i, {
        name: this.editName,
        description: this.editDescription,
        tools: this.editTools
          .split(`
`)
          .map((e) => e.trim())
          .filter(Boolean),
        promptAdditions: this.editPromptAdditions,
      }),
        this.editingId.set(null),
        this.notify.success('Bundle updated');
    } catch {
      this.notify.error('Failed to update bundle');
    }
  }
  async onDelete(i) {
    if (i.preset) {
      this.notify.error('Cannot delete preset bundles');
      return;
    }
    if (confirm(`Delete skill bundle "${i.name}"?`))
      try {
        await this.bundleService.deleteBundle(i.id), this.expandedId.set(null), this.notify.success('Bundle deleted');
      } catch {
        this.notify.error('Failed to delete bundle');
      }
  }
  static \u0275fac = (e) => new (e || l)();
  static \u0275cmp = B({
    type: l,
    selectors: [['app-skill-bundle-list']],
    decls: 17,
    vars: 12,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'create-btn', 3, 'click'],
      [1, 'filter-tabs'],
      [1, 'filter-tab', 3, 'click'],
      [1, 'create-form'],
      ['variant', 'card', 3, 'count'],
      [
        'icon',
        `  [###]
  [###]
  [###]`,
        'title',
        'No skill bundles yet.',
        'description',
        'Skill bundles group MCP tools and system prompts into reusable packages for your agents.',
        'actionLabel',
        '+ Create a Bundle',
        'actionAriaLabel',
        'Create your first skill bundle',
      ],
      [1, 'bundle-list'],
      [1, 'form-grid'],
      [1, 'form-field'],
      ['placeholder', 'e.g. Code Review Tools', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      ['placeholder', 'What this bundle provides...', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'form-field', 'span-2'],
      [
        'rows',
        '4',
        'placeholder',
        `Read
Edit
Bash`,
        1,
        'form-textarea',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [
        'rows',
        '3',
        'placeholder',
        'Additional instructions for the agent...',
        1,
        'form-textarea',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [1, 'form-actions'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'bundle-card', 3, 'bundle-card--expanded'],
      [1, 'bundle-card'],
      [1, 'bundle-card__header', 3, 'click'],
      [1, 'bundle-card__title'],
      [1, 'bundle-card__name'],
      [1, 'bundle-card__preset'],
      [1, 'bundle-card__meta'],
      [1, 'bundle-card__tools'],
      [1, 'bundle-card__desc'],
      [1, 'bundle-card__details'],
      [1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      ['rows', '4', 1, 'form-textarea', 3, 'ngModelChange', 'ngModel'],
      ['rows', '3', 1, 'form-textarea', 3, 'ngModelChange', 'ngModel'],
      [1, 'btn', 'btn--primary', 3, 'click'],
      [1, 'btn', 'btn--secondary', 3, 'click'],
      [1, 'bundle-card__tools-list'],
      [1, 'bundle-card__prompt'],
      [1, 'btn', 'btn--danger', 3, 'click'],
    ],
    template: (e, r) => {
      e & 1 &&
        (o(0, 'div', 0)(1, 'div', 1)(2, 'h2'),
        c(3, 'Skill Bundles'),
        n(),
        o(4, 'button', 2),
        p('click', () => r.showCreateForm.set(!r.showCreateForm())),
        c(5),
        n()(),
        o(6, 'div', 3)(7, 'button', 4),
        p('click', () => r.activeFilter.set('all')),
        c(8),
        n(),
        o(9, 'button', 4),
        p('click', () => r.activeFilter.set('preset')),
        c(10),
        n(),
        o(11, 'button', 4),
        p('click', () => r.activeFilter.set('custom')),
        c(12),
        n()(),
        f(13, j, 23, 6, 'div', 5),
        f(14, R, 1, 1, 'app-skeleton', 6)(15, q, 1, 0, 'app-empty-state', 7)(16, Y, 3, 0, 'div', 8),
        n()),
        e & 2 &&
          (d(5),
          x(' ', r.showCreateForm() ? 'Cancel' : '+ New Bundle', ' '),
          d(2),
          y('filter-tab--active', r.activeFilter() === 'all'),
          d(),
          x(' All (', r.bundleService.bundles().length, ') '),
          d(),
          y('filter-tab--active', r.activeFilter() === 'preset'),
          d(),
          x(' Preset (', r.presetCount(), ') '),
          d(),
          y('filter-tab--active', r.activeFilter() === 'custom'),
          d(),
          x(' Custom (', r.customCount(), ') '),
          d(),
          b(r.showCreateForm() ? 13 : -1),
          d(),
          b(r.bundleService.loading() ? 14 : r.filteredBundles().length === 0 ? 15 : 16));
    },
    dependencies: [V, L, F, N, I, D],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.create-btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan);font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.filter-tabs[_ngcontent-%COMP%]{display:flex;gap:.25rem;margin-bottom:1rem}.filter-tab[_ngcontent-%COMP%]{padding:.4rem .75rem;border:1px solid var(--border);border-radius:var(--radius);background:transparent;color:var(--text-secondary);font-size:.75rem;cursor:pointer;font-family:inherit;transition:all .15s}.filter-tab--active[_ngcontent-%COMP%]{background:var(--accent-cyan-dim);color:var(--accent-cyan);border-color:var(--accent-cyan)}.loading[_ngcontent-%COMP%], .empty[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem}.create-form[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.5rem}.create-form[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.form-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.form-field[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{display:block;font-size:.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}.form-input[_ngcontent-%COMP%], .form-select[_ngcontent-%COMP%], .form-textarea[_ngcontent-%COMP%]{width:100%;padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary);box-sizing:border-box}.form-input[_ngcontent-%COMP%]:focus, .form-textarea[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.form-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:4em;line-height:1.5}.span-2[_ngcontent-%COMP%]{grid-column:span 2}.form-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:1rem}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red);border-color:var(--accent-red)}.btn--danger[_ngcontent-%COMP%]:hover{background:var(--accent-red-dim)}.bundle-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.bundle-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem;transition:border-color .15s}.bundle-card--expanded[_ngcontent-%COMP%]{border-color:var(--accent-cyan)}.bundle-card__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;cursor:pointer}.bundle-card__title[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.bundle-card__name[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.bundle-card__preset[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;color:var(--accent-green);border:1px solid var(--accent-green)}.bundle-card__meta[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.bundle-card__desc[_ngcontent-%COMP%]{margin:.25rem 0 0;font-size:.8rem;color:var(--text-secondary)}.bundle-card__details[_ngcontent-%COMP%]{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)}.bundle-card__tools-list[_ngcontent-%COMP%]{font-size:.85rem;color:var(--text-primary);margin-bottom:.5rem}.bundle-card__prompt[_ngcontent-%COMP%]   pre[_ngcontent-%COMP%]{font-size:.8rem;color:var(--accent-green);white-space:pre-wrap;margin:.25rem 0}@media(max-width:767px){.form-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.span-2[_ngcontent-%COMP%]{grid-column:span 1}}',
    ],
    changeDetection: 0,
  });
};

export { A as SkillBundleListComponent };
