import { h as v } from './chunk-G7DVZDMF.js';
import {
  jb as _,
  Na as a,
  mb as b,
  hb as C,
  ib as c,
  Db as d,
  nb as f,
  ob as g,
  pb as i,
  qb as o,
  Cb as P,
  Bb as p,
  Ob as r,
  Pb as s,
  _a as u,
  rb as x,
} from './chunk-LF4EWAJA.js';
import { a as S } from './chunk-NZV2JQDS.js';

var M = [[['', 'actions', '']], [['', 'toolbar', '']], '*'],
  O = ['[actions]', '[toolbar]', '*'],
  w = (_e, n) => n.label;
function $(e, _n) {
  if ((e & 1 && (i(0, 'a', 10), r(1), o(), i(2, 'span', 11), r(3, '/'), o()), e & 2)) {
    const t = p().$implicit;
    g('routerLink', t.route), a(), s(t.label);
  }
}
function E(e, _n) {
  e & 1 && (i(0, 'span', 11), r(1, '/'), o());
}
function T(e, _n) {
  if ((e & 1 && (i(0, 'span', 12), r(1), o(), c(2, E, 2, 0, 'span', 11)), e & 2)) {
    const t = p(),
      l = t.$implicit,
      m = t.$index,
      h = t.$count;
    C('aria-current', m === h - 1 ? 'page' : null), a(), s(l.label), a(), _(m !== h - 1 ? 2 : -1);
  }
}
function z(e, n) {
  if ((e & 1 && c(0, $, 4, 2)(1, T, 3, 3), e & 2)) {
    const t = n.$implicit,
      l = n.$index,
      m = n.$count;
    _(t.route && l !== m - 1 ? 0 : 1);
  }
}
function I(e, _n) {
  if ((e & 1 && (i(0, 'nav', 1), b(1, z, 2, 1, null, null, w), o()), e & 2)) {
    const t = p();
    a(), f(t.breadcrumbs);
  }
}
function D(e, _n) {
  if ((e & 1 && x(0, 'app-icon', 4), e & 2)) {
    const t = p();
    g('name', t.icon)('size', 20);
  }
}
function j(e, _n) {
  if ((e & 1 && (i(0, 'span', 6), r(1), o()), e & 2)) {
    const t = p();
    a(), s(t.subtitle);
  }
}
var y = class e {
  title;
  icon;
  subtitle;
  breadcrumbs = [];
  static \u0275fac = (t) => new (t || e)();
  static \u0275cmp = u({
    type: e,
    selectors: [['app-page-shell']],
    inputs: { title: 'title', icon: 'icon', subtitle: 'subtitle', breadcrumbs: 'breadcrumbs' },
    ngContentSelectors: O,
    decls: 14,
    vars: 4,
    consts: [
      [1, 'page-shell'],
      ['aria-label', 'Breadcrumb', 1, 'page-shell__breadcrumbs'],
      [1, 'page-shell__header'],
      [1, 'page-shell__title-row'],
      [3, 'name', 'size'],
      [1, 'page-shell__title'],
      [1, 'page-shell__subtitle'],
      [1, 'page-shell__actions'],
      [1, 'page-shell__toolbar'],
      [1, 'page-shell__content'],
      [1, 'page-shell__crumb', 3, 'routerLink'],
      ['aria-hidden', 'true', 1, 'page-shell__crumb-sep'],
      [1, 'page-shell__crumb', 'page-shell__crumb--current'],
    ],
    template: (t, l) => {
      t & 1 &&
        (P(M),
        i(0, 'div', 0),
        c(1, I, 3, 0, 'nav', 1),
        i(2, 'header', 2)(3, 'div', 3),
        c(4, D, 1, 2, 'app-icon', 4),
        i(5, 'h2', 5),
        r(6),
        o(),
        c(7, j, 2, 1, 'span', 6),
        o(),
        i(8, 'div', 7),
        d(9),
        o()(),
        i(10, 'div', 8),
        d(11, 1),
        o(),
        i(12, 'div', 9),
        d(13, 2),
        o()()),
        t & 2 &&
          (a(),
          _(l.breadcrumbs.length > 0 ? 1 : -1),
          a(3),
          _(l.icon ? 4 : -1),
          a(2),
          s(l.title),
          a(),
          _(l.subtitle ? 7 : -1));
    },
    dependencies: [v, S],
    styles: [
      '.page-shell[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100%;padding:0}.page-shell__breadcrumbs[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.35rem;padding:.6rem 1.5rem 0;font-size:.7rem;letter-spacing:.02em}.page-shell__crumb[_ngcontent-%COMP%]{color:var(--text-tertiary);text-decoration:none;transition:color .15s}a.page-shell__crumb[_ngcontent-%COMP%]:hover{color:var(--accent-cyan)}.page-shell__crumb--current[_ngcontent-%COMP%]{color:var(--text-secondary);font-weight:600}.page-shell__crumb-sep[_ngcontent-%COMP%]{color:var(--text-tertiary);opacity:.5;font-size:.6rem}.page-shell__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1.5rem .25rem;gap:1rem}.page-shell__title-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;min-width:0;color:var(--text-primary)}.page-shell__title[_ngcontent-%COMP%]{margin:0;font-size:1.2rem;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.page-shell__subtitle[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary);font-weight:400}.page-shell__actions[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;flex-shrink:0}.page-shell__toolbar[_ngcontent-%COMP%]:empty{display:none}.page-shell__toolbar[_ngcontent-%COMP%]{padding:0 1.5rem}.page-shell__content[_ngcontent-%COMP%]{flex:1;min-height:0;overflow-y:auto;padding:1rem 2rem 2rem}@media(max-width:767px){.page-shell__breadcrumbs[_ngcontent-%COMP%]{padding:.5rem 1rem 0}.page-shell__header[_ngcontent-%COMP%]{padding:.6rem 1rem .4rem}.page-shell__toolbar[_ngcontent-%COMP%]{padding:0 1rem}.page-shell__content[_ngcontent-%COMP%]{padding:.75rem 1.25rem 1.25rem}.page-shell__title[_ngcontent-%COMP%]{font-size:1rem}}',
    ],
    changeDetection: 0,
  });
};

export { y as a };
