import { a as O } from './chunk-2EJE5M6O.js';
import { a as P } from './chunk-355WLUEG.js';
import { a as h } from './chunk-FGNIWOFY.js';
import { a as b } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import { h as j } from './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  ib as _,
  Ob as a,
  $b as C,
  Pb as c,
  _a as d,
  mb as f,
  jb as g,
  T as m,
  qb as n,
  pb as o,
  ob as p,
  Na as r,
  rb as s,
  _b as u,
  nb as v,
  Bb as x,
  ac as y,
} from './chunk-LF4EWAJA.js';

var S = (e) => ['/agents/projects', e],
  k = (_e, i) => i.id;
function w(e, _i) {
  e & 1 && s(0, 'app-skeleton', 4), e & 2 && p('count', 5);
}
function L(e, _i) {
  e & 1 && s(0, 'app-empty-state', 5);
}
function E(e, i) {
  if (
    (e & 1 &&
      (o(0, 'a', 7)(1, 'div', 8)(2, 'h3', 9),
      a(3),
      n(),
      o(4, 'p', 10),
      a(5),
      n()(),
      o(6, 'div', 11)(7, 'span', 12),
      a(8),
      n(),
      o(9, 'span', 13),
      a(10),
      C(11, 'relativeTime'),
      n()()()),
    e & 2)
  ) {
    const t = i.$implicit;
    p('routerLink', u(7, S, t.id)),
      r(3),
      c(t.name),
      r(2),
      c(t.description),
      r(3),
      c(t.workingDir),
      r(2),
      c(y(11, 5, t.updatedAt));
  }
}
function T(e, _i) {
  if ((e & 1 && (o(0, 'div', 6), f(1, E, 12, 9, 'a', 7, k), n()), e & 2)) {
    const t = x();
    r(), v(t.projectService.projects());
  }
}
var M = class e {
  projectService = m(b);
  ngOnInit() {
    this.projectService.loadProjects();
  }
  static \u0275fac = (t) => new (t || e)();
  static \u0275cmp = d({
    type: e,
    selectors: [['app-project-list']],
    decls: 9,
    vars: 1,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page-title'],
      ['routerLink', '/agents/projects/new', 1, 'btn', 'btn--primary'],
      ['variant', 'table', 3, 'count'],
      [
        'icon',
        `  [===]
  |   |
  [===]`,
        'title',
        'No projects yet.',
        'description',
        'Projects define working directories and CLAUDE.md configs for your agents.',
        'actionLabel',
        '+ Create a project',
        'actionRoute',
        '/agents/projects/new',
        'actionAriaLabel',
        'Create your first project',
      ],
      ['role', 'list', 1, 'list'],
      ['role', 'listitem', 1, 'list__item', 3, 'routerLink'],
      [1, 'list__item-main'],
      [1, 'list__item-title'],
      [1, 'list__item-desc'],
      [1, 'list__item-meta'],
      [1, 'list__item-path'],
      [1, 'list__item-time'],
    ],
    template: (t, l) => {
      t & 1 &&
        (o(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
        a(3, 'Projects'),
        n(),
        o(4, 'a', 3),
        a(5, 'New Project'),
        n()(),
        _(6, w, 1, 1, 'app-skeleton', 4)(7, L, 1, 0, 'app-empty-state', 5)(8, T, 3, 0, 'div', 6),
        n()),
        t & 2 && (r(6), g(l.projectService.loading() ? 6 : l.projectService.projects().length === 0 ? 7 : 8));
    },
    dependencies: [j, O, h, P],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);text-decoration:none;font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s}.btn--primary[_ngcontent-%COMP%]{background:transparent;color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.empty[_ngcontent-%COMP%]{color:var(--text-tertiary)}.list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.list__item[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);text-decoration:none;color:inherit;transition:border-color .2s,box-shadow .2s}.list__item[_ngcontent-%COMP%]:hover{border-color:var(--accent-green);box-shadow:0 0 12px #00ff8814}.list__item-title[_ngcontent-%COMP%]{margin:0 0 .25rem;font-size:.95rem;color:var(--text-primary)}.list__item-desc[_ngcontent-%COMP%]{margin:0;color:var(--text-secondary);font-size:.8rem}.list__item-meta[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;font-size:.75rem;color:var(--text-tertiary)}.list__item-path[_ngcontent-%COMP%]{color:var(--accent-green);opacity:.7}',
    ],
    changeDetection: 0,
  });
};

export { M as ProjectListComponent };
