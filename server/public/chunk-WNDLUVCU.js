import { a as T } from './chunk-2EJE5M6O.js';
import { a as A } from './chunk-355WLUEG.js';
import { a as S } from './chunk-FGNIWOFY.js';
import { a as j } from './chunk-NMIECMLM.js';
import './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as D } from './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  ib as _,
  Wb as $,
  pb as a,
  Nb as B,
  Y as b,
  rb as C,
  Bb as c,
  Ob as d,
  $b as E,
  Pb as f,
  ob as g,
  _a as h,
  Qb as k,
  mb as M,
  zb as m,
  ac as O,
  qb as o,
  nb as P,
  ja as p,
  O as R,
  Na as r,
  jb as u,
  Mb as V,
  Z as v,
  q as w,
  vb as x,
  T as y,
} from './chunk-LF4EWAJA.js';

var q = (_n, t) => t.address;
function J(n, _t) {
  if ((n & 1 && (a(0, 'span', 3), d(1), o()), n & 2)) {
    const e = c();
    r(), k('(', e.allowlistService.entries().length, ')');
  }
}
function K(n, _t) {
  if ((n & 1 && (a(0, 'p', 8), d(1), o()), n & 2)) {
    const e = c();
    r(), f(e.error());
  }
}
function Q(n, _t) {
  n & 1 && C(0, 'app-skeleton', 9), n & 2 && g('count', 4);
}
function W(n, _t) {
  n & 1 && C(0, 'app-empty-state', 10);
}
function X(n, _t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 15)(1, 'input', 19),
      m('input', (l) => {
        b(e);
        const s = c(3);
        return v(s.editLabel.set(s.toInputValue(l)));
      })('keyup.enter', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.saveLabel(l.address));
      }),
      o(),
      a(2, 'button', 20),
      m('click', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.saveLabel(l.address));
      }),
      d(3, 'Save'),
      o(),
      a(4, 'button', 21),
      m('click', () => {
        b(e);
        const l = c(3);
        return v(l.editingAddress.set(null));
      }),
      d(5, 'Cancel'),
      o()();
  }
  if (n & 2) {
    const e = c(3);
    r(), g('value', e.editLabel());
  }
}
function Y(n, _t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 16)(1, 'span', 22),
      m('click', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.startEdit(l));
      }),
      d(2),
      o()();
  }
  if (n & 2) {
    const e = c().$implicit;
    r(2), k(' ', e.label || 'No label', ' ');
  }
}
function Z(n, t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 12)(1, 'div', 13)(2, 'div', 14),
      d(3),
      o(),
      _(4, X, 6, 1, 'div', 15)(5, Y, 3, 1, 'div', 16),
      o(),
      a(6, 'div', 17)(7, 'span'),
      d(8),
      E(9, 'relativeTime'),
      o(),
      a(10, 'button', 18),
      m('click', () => {
        const l = b(e).$implicit,
          s = c(2);
        return v(s.remove(l.address));
      }),
      d(11, 'Remove'),
      o()()();
  }
  if (n & 2) {
    const e = t.$implicit,
      i = c(2);
    r(3), f(e.address), r(), u(i.editingAddress() === e.address ? 4 : 5), r(4), f(O(9, 3, e.createdAt));
  }
}
function ee(n, _t) {
  if ((n & 1 && (a(0, 'div', 11), M(1, Z, 12, 5, 'div', 12, q), o()), n & 2)) {
    const e = c();
    r(), P(e.allowlistService.entries());
  }
}
var H = class n {
  allowlistService = y(j);
  newAddress = p('');
  newLabel = p('');
  editingAddress = p(null);
  editLabel = p('');
  error = p(null);
  ngOnInit() {
    this.allowlistService.loadEntries();
  }
  toInputValue(t) {
    return t.target.value;
  }
  async add() {
    const t = this.newAddress().trim();
    if (t) {
      this.error.set(null);
      try {
        await this.allowlistService.addEntry(t, this.newLabel().trim() || void 0),
          this.newAddress.set(''),
          this.newLabel.set('');
      } catch (e) {
        const i = e instanceof Error ? e.message : 'Failed to add address';
        this.error.set(i);
      }
    }
  }
  startEdit(t) {
    this.editingAddress.set(t.address), this.editLabel.set(t.label);
  }
  async saveLabel(t) {
    this.error.set(null);
    try {
      await this.allowlistService.updateEntry(t, this.editLabel()), this.editingAddress.set(null);
    } catch {
      this.error.set('Failed to update label'), await this.allowlistService.loadEntries();
    }
  }
  async remove(t) {
    if (confirm(`Remove ${t} from the allowlist?`)) {
      this.error.set(null);
      try {
        await this.allowlistService.removeEntry(t);
      } catch {
        this.error.set('Failed to remove address'), await this.allowlistService.loadEntries();
      }
    }
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = h({
    type: n,
    selectors: [['app-allowlist']],
    decls: 14,
    vars: 6,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page-title'],
      [1, 'count'],
      [1, 'add-form'],
      ['type', 'text', 'placeholder', 'Algorand address', 1, 'input', 3, 'input', 'value'],
      ['type', 'text', 'placeholder', 'Label (optional)', 1, 'input', 'input--label', 3, 'input', 'value'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'error'],
      ['variant', 'line', 3, 'count'],
      [
        'icon',
        '[*]',
        'title',
        'No Allowlist',
        'description',
        'No addresses in allowlist. All addresses are currently allowed.',
      ],
      ['role', 'list', 1, 'list'],
      ['role', 'listitem', 1, 'list__item'],
      [1, 'list__item-main'],
      [1, 'list__item-address'],
      [1, 'edit-row'],
      [1, 'label-row'],
      [1, 'list__item-meta'],
      [1, 'btn', 'btn--danger', 'btn--small', 3, 'click'],
      ['type', 'text', 1, 'input', 'input--inline', 3, 'input', 'keyup.enter', 'value'],
      [1, 'btn', 'btn--small', 3, 'click'],
      [1, 'btn', 'btn--small', 'btn--ghost', 3, 'click'],
      [1, 'list__item-label', 3, 'click'],
    ],
    template: (e, i) => {
      e & 1 &&
        (a(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
        d(3, ' Allowlist '),
        _(4, J, 2, 1, 'span', 3),
        o()(),
        a(5, 'div', 4)(6, 'input', 5),
        m('input', (s) => i.newAddress.set(i.toInputValue(s))),
        o(),
        a(7, 'input', 6),
        m('input', (s) => i.newLabel.set(i.toInputValue(s))),
        o(),
        a(8, 'button', 7),
        m('click', () => i.add()),
        d(9, 'Add'),
        o()(),
        _(10, K, 2, 1, 'p', 8),
        _(11, Q, 1, 1, 'app-skeleton', 9)(12, W, 1, 0, 'app-empty-state', 10)(13, ee, 3, 0, 'div', 11),
        o()),
        e & 2 &&
          (r(4),
          u(i.allowlistService.entries().length > 0 ? 4 : -1),
          r(2),
          g('value', i.newAddress()),
          r(),
          g('value', i.newLabel()),
          r(),
          g('disabled', !i.newAddress().trim()),
          r(2),
          u(i.error() ? 10 : -1),
          r(),
          u(i.allowlistService.loading() ? 11 : i.allowlistService.entries().length === 0 ? 12 : 13));
    },
    dependencies: [S, T, A],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.count[_ngcontent-%COMP%]{color:var(--text-tertiary);font-weight:400;font-size:.85rem}.add-form[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1.5rem}.input[_ngcontent-%COMP%]{flex:1;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-family:inherit;font-size:.85rem}.input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.input--label[_ngcontent-%COMP%]{max-width:200px}.input--inline[_ngcontent-%COMP%]{flex:1;padding:.3rem .5rem;font-size:.8rem}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s;background:transparent}.btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:default}.btn--primary[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--danger[_ngcontent-%COMP%]{color:var(--accent-red, #f44);border-color:var(--accent-red, #f44)}.btn--danger[_ngcontent-%COMP%]:hover{background:#ff44441a}.btn--small[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem}.btn--ghost[_ngcontent-%COMP%]{border-color:var(--border);color:var(--text-secondary)}.error[_ngcontent-%COMP%]{color:var(--accent-red, #f44);font-size:.85rem;margin-bottom:1rem}.list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.list__item[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg)}.list__item-main[_ngcontent-%COMP%]{flex:1;min-width:0}.list__item-address[_ngcontent-%COMP%]{font-family:monospace;font-size:.8rem;color:var(--text-primary);word-break:break-all}.list__item-label[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary);cursor:pointer}.list__item-label[_ngcontent-%COMP%]:hover{color:var(--text-primary)}.label-row[_ngcontent-%COMP%]{margin-top:.25rem}.edit-row[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.25rem;align-items:center}.list__item-meta[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;font-size:.75rem;color:var(--text-tertiary);margin-left:1rem}',
    ],
    changeDetection: 0,
  });
};
var F = class n {
  api = y(D);
  entries = p([]);
  loading = p(!1);
  async loadEntries() {
    this.loading.set(!0);
    try {
      const t = await w(this.api.get('/github-allowlist'));
      this.entries.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async addEntry(t, e) {
    const i = await w(this.api.post('/github-allowlist', { username: t, label: e }));
    return this.entries.update((l) => [i, ...l]), i;
  }
  async updateEntry(t, e) {
    const i = await w(this.api.put(`/github-allowlist/${encodeURIComponent(t)}`, { label: e }));
    return this.entries.update((l) => l.map((s) => (s.username === t ? i : s))), i;
  }
  async removeEntry(t) {
    await w(this.api.delete(`/github-allowlist/${encodeURIComponent(t)}`)),
      this.entries.update((e) => e.filter((i) => i.username !== t));
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275prov = R({ token: n, factory: n.\u0275fac, providedIn: 'root' });
};
var te = (_n, t) => t.username;
function ne(n, _t) {
  if ((n & 1 && (a(0, 'span', 3), d(1), o()), n & 2)) {
    const e = c();
    r(), k('(', e.service.entries().length, ')');
  }
}
function ie(n, _t) {
  if ((n & 1 && (a(0, 'p', 8), d(1), o()), n & 2)) {
    const e = c();
    r(), f(e.error());
  }
}
function oe(n, _t) {
  n & 1 && C(0, 'app-skeleton', 9), n & 2 && g('count', 4);
}
function re(n, _t) {
  n & 1 && C(0, 'app-empty-state', 10);
}
function ae(n, _t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 15)(1, 'input', 19),
      m('input', (l) => {
        b(e);
        const s = c(3);
        return v(s.editLabel.set(s.toInputValue(l)));
      })('keyup.enter', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.saveLabel(l.username));
      }),
      o(),
      a(2, 'button', 20),
      m('click', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.saveLabel(l.username));
      }),
      d(3, 'Save'),
      o(),
      a(4, 'button', 21),
      m('click', () => {
        b(e);
        const l = c(3);
        return v(l.editingUsername.set(null));
      }),
      d(5, 'Cancel'),
      o()();
  }
  if (n & 2) {
    const e = c(3);
    r(), g('value', e.editLabel());
  }
}
function le(n, _t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 16)(1, 'span', 22),
      m('click', () => {
        b(e);
        const l = c().$implicit,
          s = c(2);
        return v(s.startEdit(l));
      }),
      d(2),
      o()();
  }
  if (n & 2) {
    const e = c().$implicit;
    r(2), k(' ', e.label || 'No label', ' ');
  }
}
function se(n, t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 12)(1, 'div', 13)(2, 'div', 14),
      d(3),
      o(),
      _(4, ae, 6, 1, 'div', 15)(5, le, 3, 1, 'div', 16),
      o(),
      a(6, 'div', 17)(7, 'span'),
      d(8),
      E(9, 'relativeTime'),
      o(),
      a(10, 'button', 18),
      m('click', () => {
        const l = b(e).$implicit,
          s = c(2);
        return v(s.remove(l.username));
      }),
      d(11, 'Remove'),
      o()()();
  }
  if (n & 2) {
    const e = t.$implicit,
      i = c(2);
    r(3), f(e.username), r(), u(i.editingUsername() === e.username ? 4 : 5), r(4), f(O(9, 3, e.createdAt));
  }
}
function ce(n, _t) {
  if ((n & 1 && (a(0, 'div', 11), M(1, se, 12, 5, 'div', 12, te), o()), n & 2)) {
    const e = c();
    r(), P(e.service.entries());
  }
}
var G = class n {
  service = y(F);
  newUsername = p('');
  newLabel = p('');
  editingUsername = p(null);
  editLabel = p('');
  error = p(null);
  ngOnInit() {
    this.service.loadEntries();
  }
  toInputValue(t) {
    return t.target.value;
  }
  async add() {
    const t = this.newUsername().trim();
    if (t) {
      this.error.set(null);
      try {
        await this.service.addEntry(t, this.newLabel().trim() || void 0),
          this.newUsername.set(''),
          this.newLabel.set('');
      } catch (e) {
        const i = e instanceof Error ? e.message : 'Failed to add username';
        this.error.set(i);
      }
    }
  }
  startEdit(t) {
    this.editingUsername.set(t.username), this.editLabel.set(t.label);
  }
  async saveLabel(t) {
    this.error.set(null);
    try {
      await this.service.updateEntry(t, this.editLabel()), this.editingUsername.set(null);
    } catch {
      this.error.set('Failed to update label'), await this.service.loadEntries();
    }
  }
  async remove(t) {
    if (confirm(`Remove ${t} from the GitHub allowlist?`)) {
      this.error.set(null);
      try {
        await this.service.removeEntry(t);
      } catch {
        this.error.set('Failed to remove username'), await this.service.loadEntries();
      }
    }
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = h({
    type: n,
    selectors: [['app-github-allowlist']],
    decls: 14,
    vars: 6,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page-title'],
      [1, 'count'],
      [1, 'add-form'],
      ['type', 'text', 'placeholder', 'GitHub username', 1, 'input', 3, 'input', 'value'],
      ['type', 'text', 'placeholder', 'Label (optional)', 1, 'input', 'input--label', 3, 'input', 'value'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'error'],
      ['variant', 'line', 3, 'count'],
      [
        'icon',
        '[*]',
        'title',
        'No GitHub Allowlist',
        'description',
        'No GitHub users in allowlist. All GitHub users are currently allowed.',
      ],
      ['role', 'list', 1, 'list'],
      ['role', 'listitem', 1, 'list__item'],
      [1, 'list__item-main'],
      [1, 'list__item-username'],
      [1, 'edit-row'],
      [1, 'label-row'],
      [1, 'list__item-meta'],
      [1, 'btn', 'btn--danger', 'btn--small', 3, 'click'],
      ['type', 'text', 1, 'input', 'input--inline', 3, 'input', 'keyup.enter', 'value'],
      [1, 'btn', 'btn--small', 3, 'click'],
      [1, 'btn', 'btn--small', 'btn--ghost', 3, 'click'],
      [1, 'list__item-label', 3, 'click'],
    ],
    template: (e, i) => {
      e & 1 &&
        (a(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
        d(3, ' GitHub Allowlist '),
        _(4, ne, 2, 1, 'span', 3),
        o()(),
        a(5, 'div', 4)(6, 'input', 5),
        m('input', (s) => i.newUsername.set(i.toInputValue(s))),
        o(),
        a(7, 'input', 6),
        m('input', (s) => i.newLabel.set(i.toInputValue(s))),
        o(),
        a(8, 'button', 7),
        m('click', () => i.add()),
        d(9, 'Add'),
        o()(),
        _(10, ie, 2, 1, 'p', 8),
        _(11, oe, 1, 1, 'app-skeleton', 9)(12, re, 1, 0, 'app-empty-state', 10)(13, ce, 3, 0, 'div', 11),
        o()),
        e & 2 &&
          (r(4),
          u(i.service.entries().length > 0 ? 4 : -1),
          r(2),
          g('value', i.newUsername()),
          r(),
          g('value', i.newLabel()),
          r(),
          g('disabled', !i.newUsername().trim()),
          r(2),
          u(i.error() ? 10 : -1),
          r(),
          u(i.service.loading() ? 11 : i.service.entries().length === 0 ? 12 : 13));
    },
    dependencies: [S, T, A],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.count[_ngcontent-%COMP%]{color:var(--text-tertiary);font-weight:400;font-size:.85rem}.add-form[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1.5rem}.input[_ngcontent-%COMP%]{flex:1;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-family:inherit;font-size:.85rem}.input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.input--label[_ngcontent-%COMP%]{max-width:200px}.input--inline[_ngcontent-%COMP%]{flex:1;padding:.3rem .5rem;font-size:.8rem}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s;background:transparent}.btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:default}.btn--primary[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--danger[_ngcontent-%COMP%]{color:var(--accent-red, #f44);border-color:var(--accent-red, #f44)}.btn--danger[_ngcontent-%COMP%]:hover{background:#ff44441a}.btn--small[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem}.btn--ghost[_ngcontent-%COMP%]{border-color:var(--border);color:var(--text-secondary)}.error[_ngcontent-%COMP%]{color:var(--accent-red, #f44);font-size:.85rem;margin-bottom:1rem}.list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.list__item[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg)}.list__item-main[_ngcontent-%COMP%]{flex:1;min-width:0}.list__item-username[_ngcontent-%COMP%]{font-family:monospace;font-size:.85rem;color:var(--text-primary)}.list__item-label[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary);cursor:pointer}.list__item-label[_ngcontent-%COMP%]:hover{color:var(--text-primary)}.label-row[_ngcontent-%COMP%]{margin-top:.25rem}.edit-row[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.25rem;align-items:center}.list__item-meta[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;font-size:.75rem;color:var(--text-tertiary);margin-left:1rem}',
    ],
    changeDetection: 0,
  });
};
var L = class n {
  api = y(D);
  entries = p([]);
  loading = p(!1);
  async loadEntries() {
    this.loading.set(!0);
    try {
      const t = await w(this.api.get('/repo-blocklist'));
      this.entries.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async addEntry(t, e) {
    const i = await w(this.api.post('/repo-blocklist', { repo: t, reason: e, source: 'manual' }));
    return this.entries.update((l) => [i, ...l]), i;
  }
  async removeEntry(t) {
    await w(this.api.delete(`/repo-blocklist/${encodeURIComponent(t)}`)),
      this.entries.update((e) => e.filter((i) => i.repo !== t));
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275prov = R({ token: n, factory: n.\u0275fac, providedIn: 'root' });
};
var de = (_n, t) => t.repo;
function me(n, _t) {
  if ((n & 1 && (a(0, 'span', 3), d(1), o()), n & 2)) {
    const e = c();
    r(), k('(', e.service.entries().length, ')');
  }
}
function pe(n, _t) {
  if ((n & 1 && (a(0, 'p', 8), d(1), o()), n & 2)) {
    const e = c();
    r(), f(e.error());
  }
}
function _e(n, _t) {
  n & 1 && C(0, 'app-skeleton', 9), n & 2 && g('count', 4);
}
function ue(n, _t) {
  n & 1 && C(0, 'app-empty-state', 10);
}
function ge(n, _t) {
  if ((n & 1 && (a(0, 'span', 16), d(1), o()), n & 2)) {
    const e = c().$implicit;
    r(), f(e.reason);
  }
}
function be(n, t) {
  if (n & 1) {
    const e = x();
    a(0, 'div', 12)(1, 'div', 13)(2, 'div', 14),
      d(3),
      o(),
      a(4, 'div', 15)(5, 'span'),
      d(6),
      o(),
      _(7, ge, 2, 1, 'span', 16),
      o()(),
      a(8, 'div', 17)(9, 'span'),
      d(10),
      E(11, 'relativeTime'),
      o(),
      a(12, 'button', 18),
      m('click', () => {
        const l = b(e).$implicit,
          s = c(2);
        return v(s.remove(l.repo));
      }),
      d(13, 'Remove'),
      o()()();
  }
  if (n & 2) {
    const e = t.$implicit;
    r(3),
      f(e.repo),
      r(2),
      B($('badge badge--', e.source)),
      r(),
      f(e.source),
      r(),
      u(e.reason ? 7 : -1),
      r(3),
      f(O(11, 7, e.createdAt));
  }
}
function ve(n, _t) {
  if ((n & 1 && (a(0, 'div', 11), M(1, be, 14, 9, 'div', 12, de), o()), n & 2)) {
    const e = c();
    r(), P(e.service.entries());
  }
}
var N = class n {
  service = y(L);
  newRepo = p('');
  newReason = p('');
  error = p(null);
  ngOnInit() {
    this.service.loadEntries();
  }
  toInputValue(t) {
    return t.target.value;
  }
  async add() {
    const t = this.newRepo().trim();
    if (t) {
      this.error.set(null);
      try {
        await this.service.addEntry(t, this.newReason().trim() || void 0), this.newRepo.set(''), this.newReason.set('');
      } catch (e) {
        const i = e instanceof Error ? e.message : 'Failed to add repo';
        this.error.set(i);
      }
    }
  }
  async remove(t) {
    if (confirm(`Remove ${t} from the repo blocklist?`)) {
      this.error.set(null);
      try {
        await this.service.removeEntry(t);
      } catch {
        this.error.set('Failed to remove repo'), await this.service.loadEntries();
      }
    }
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = h({
    type: n,
    selectors: [['app-repo-blocklist']],
    decls: 14,
    vars: 6,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page-title'],
      [1, 'count'],
      [1, 'add-form'],
      ['type', 'text', 'placeholder', 'owner/repo or owner/*', 1, 'input', 3, 'input', 'value'],
      ['type', 'text', 'placeholder', 'Reason (optional)', 1, 'input', 'input--reason', 3, 'input', 'value'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'error'],
      ['variant', 'line', 3, 'count'],
      ['icon', '[x]', 'title', 'No Blocklist', 'description', 'No repos blocklisted. All repos are currently allowed.'],
      ['role', 'list', 1, 'list'],
      ['role', 'listitem', 1, 'list__item'],
      [1, 'list__item-main'],
      [1, 'list__item-repo'],
      [1, 'list__item-detail'],
      [1, 'list__item-reason'],
      [1, 'list__item-meta'],
      [1, 'btn', 'btn--danger', 'btn--small', 3, 'click'],
    ],
    template: (e, i) => {
      e & 1 &&
        (a(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
        d(3, ' Repo Blocklist '),
        _(4, me, 2, 1, 'span', 3),
        o()(),
        a(5, 'div', 4)(6, 'input', 5),
        m('input', (s) => i.newRepo.set(i.toInputValue(s))),
        o(),
        a(7, 'input', 6),
        m('input', (s) => i.newReason.set(i.toInputValue(s))),
        o(),
        a(8, 'button', 7),
        m('click', () => i.add()),
        d(9, 'Block'),
        o()(),
        _(10, pe, 2, 1, 'p', 8),
        _(11, _e, 1, 1, 'app-skeleton', 9)(12, ue, 1, 0, 'app-empty-state', 10)(13, ve, 3, 0, 'div', 11),
        o()),
        e & 2 &&
          (r(4),
          u(i.service.entries().length > 0 ? 4 : -1),
          r(2),
          g('value', i.newRepo()),
          r(),
          g('value', i.newReason()),
          r(),
          g('disabled', !i.newRepo().trim()),
          r(2),
          u(i.error() ? 10 : -1),
          r(),
          u(i.service.loading() ? 11 : i.service.entries().length === 0 ? 12 : 13));
    },
    dependencies: [S, T, A],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.count[_ngcontent-%COMP%]{color:var(--text-tertiary);font-weight:400;font-size:.85rem}.add-form[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1.5rem}.input[_ngcontent-%COMP%]{flex:1;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-family:inherit;font-size:.85rem}.input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.input--reason[_ngcontent-%COMP%]{max-width:250px}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s;background:transparent}.btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:default}.btn--primary[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--danger[_ngcontent-%COMP%]{color:var(--accent-red, #f44);border-color:var(--accent-red, #f44)}.btn--danger[_ngcontent-%COMP%]:hover{background:#ff44441a}.btn--small[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem}.error[_ngcontent-%COMP%]{color:var(--accent-red, #f44);font-size:.85rem;margin-bottom:1rem}.list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.list__item[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg)}.list__item-main[_ngcontent-%COMP%]{flex:1;min-width:0}.list__item-repo[_ngcontent-%COMP%]{font-family:monospace;font-size:.85rem;color:var(--text-primary)}.list__item-detail[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-top:.25rem}.list__item-reason[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary)}.badge[_ngcontent-%COMP%]{font-size:.65rem;padding:.15rem .4rem;border-radius:3px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}.badge--manual[_ngcontent-%COMP%]{color:var(--accent-cyan);border:1px solid var(--accent-cyan)}.badge--pr_rejection[_ngcontent-%COMP%]{color:var(--accent-red, #f44);border:1px solid var(--accent-red, #f44)}.badge--daily_review[_ngcontent-%COMP%]{color:var(--accent-yellow, #fa0);border:1px solid var(--accent-yellow, #fa0)}.list__item-meta[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;font-size:.75rem;color:var(--text-tertiary);margin-left:1rem}',
    ],
    changeDetection: 0,
  });
};
function fe(n, _t) {
  n & 1 && C(0, 'app-allowlist');
}
function Ce(n, _t) {
  n & 1 && C(0, 'app-github-allowlist');
}
function ye(n, _t) {
  n & 1 && C(0, 'app-repo-blocklist');
}
var U = class n {
  section = p('allowlist');
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = h({
    type: n,
    selectors: [['app-settings-access']],
    decls: 12,
    vars: 7,
    consts: [
      [1, 'settings-section'],
      ['role', 'tablist', 'aria-label', 'Access control sections', 1, 'settings-section__nav'],
      ['role', 'tab', 1, 'settings-section__btn', 3, 'click'],
      [1, 'settings-section__content'],
    ],
    template: (e, i) => {
      if (
        (e & 1 &&
          (a(0, 'div', 0)(1, 'div', 1)(2, 'button', 2),
          m('click', () => i.section.set('allowlist')),
          d(3, ' Allowlist '),
          o(),
          a(4, 'button', 2),
          m('click', () => i.section.set('github')),
          d(5, ' GitHub Allowlist '),
          o(),
          a(6, 'button', 2),
          m('click', () => i.section.set('repos')),
          d(7, ' Repo Blocklist '),
          o()(),
          a(8, 'div', 3),
          _(9, fe, 1, 0, 'app-allowlist')(10, Ce, 1, 0, 'app-github-allowlist')(11, ye, 1, 0, 'app-repo-blocklist'),
          o()()),
        e & 2)
      ) {
        let l;
        r(2),
          V('settings-section__btn--active', i.section() === 'allowlist'),
          r(2),
          V('settings-section__btn--active', i.section() === 'github'),
          r(2),
          V('settings-section__btn--active', i.section() === 'repos'),
          r(3),
          u((l = i.section()) === 'allowlist' ? 9 : l === 'github' ? 10 : l === 'repos' ? 11 : -1);
      }
    },
    dependencies: [H, G, N],
    styles: [
      '.settings-section[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100%}.settings-section__nav[_ngcontent-%COMP%]{display:flex;gap:0;padding:0 1rem;border-bottom:1px solid var(--border-subtle);background:#0c0d1433;overflow-x:auto;scrollbar-width:none;flex-shrink:0}.settings-section__nav[_ngcontent-%COMP%]::-webkit-scrollbar{display:none}.settings-section__btn[_ngcontent-%COMP%]{padding:.5rem .85rem;font-size:.72rem;font-weight:600;font-family:inherit;letter-spacing:.03em;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s}.settings-section__btn[_ngcontent-%COMP%]:hover{color:var(--text-primary)}.settings-section__btn--active[_ngcontent-%COMP%]{color:var(--accent-cyan);border-bottom-color:var(--accent-cyan)}.settings-section__content[_ngcontent-%COMP%]{flex:1;overflow-y:auto}',
    ],
    changeDetection: 0,
  });
};

export { U as SettingsAccessComponent };
