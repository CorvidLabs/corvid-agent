import { a as U } from './chunk-2EJE5M6O.js';
import { a as B } from './chunk-355WLUEG.js';
import { b as $, r as A, f as N, d as z } from './chunk-AF4UDQOX.js';
import { a as Q } from './chunk-FGNIWOFY.js';
import './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as R } from './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  Z as _,
  vb as b,
  hb as C,
  Tb as D,
  Bb as d,
  _a as E,
  Vb as F,
  jb as f,
  zb as g,
  nb as h,
  Rb as I,
  Na as i,
  T as k,
  ob as L,
  q as M,
  Pb as m,
  lb as O,
  qb as o,
  $b as P,
  Y as p,
  pb as r,
  Qb as S,
  Ob as s,
  rb as T,
  ib as u,
  Ub as V,
  ja as v,
  ac as w,
  mb as x,
  Mb as y,
} from './chunk-LF4EWAJA.js';

var q = (_t, n) => `${n.id}-${n.type}`,
  G = (_t, n) => n.id;
function H(t, n) {
  if (t & 1) {
    const e = b();
    r(0, 'button', 12),
      g('click', () => {
        const a = p(e).$implicit,
          c = d(2);
        return _(c.setLogType(a));
      }),
      s(1),
      o();
  }
  if (t & 2) {
    const e = n.$implicit,
      l = d(2);
    y('filter-chip--active', l.logTypeFilter() === e), i(), m(e);
  }
}
function J(t, n) {
  if (t & 1) {
    const e = b();
    r(0, 'button', 13),
      g('click', () => {
        const a = p(e).$implicit,
          c = d(2);
        return _(c.setLogLevel(a));
      }),
      s(1),
      o();
  }
  if (t & 2) {
    const e = n.$implicit,
      l = d(2);
    y('filter-chip--active', l.logLevelFilter() === e), C('data-level', e), i(), m(e);
  }
}
function K(t, _n) {
  t & 1 && T(0, 'app-skeleton', 10), t & 2 && L('count', 5);
}
function X(t, _n) {
  t & 1 && T(0, 'app-empty-state', 11);
}
function Y(t, _n) {
  if ((t & 1 && (r(0, 'p', 22), s(1), o()), t & 2)) {
    const e = d().$implicit;
    i(), m(e.detail);
  }
}
function Z(t, n) {
  if (
    (t & 1 &&
      (r(0, 'div', 15)(1, 'div', 17)(2, 'span', 18),
      s(3),
      o(),
      r(4, 'span', 19),
      s(5),
      o(),
      r(6, 'span', 20),
      s(7),
      P(8, 'relativeTime'),
      o()(),
      r(9, 'p', 21),
      s(10),
      o(),
      u(11, Y, 2, 1, 'p', 22),
      o()),
    t & 2)
  ) {
    const e = n.$implicit;
    C('data-level', e.level),
      i(2),
      C('data-type', e.type),
      i(),
      m(e.type),
      i(),
      C('data-level', e.level),
      i(),
      m(e.level),
      i(2),
      m(w(8, 8, e.timestamp)),
      i(3),
      m(e.message),
      i(),
      f(e.detail ? 11 : -1);
  }
}
function ee(t, _n) {
  if (t & 1) {
    const e = b();
    r(0, 'button', 23),
      g('click', () => {
        p(e);
        const a = d(3);
        return _(a.loadMoreLogs());
      }),
      s(1, 'Load more'),
      o();
  }
}
function te(t, _n) {
  if ((t & 1 && (r(0, 'div', 14), x(1, Z, 12, 10, 'div', 15, q), o(), u(3, ee, 2, 0, 'button', 16)), t & 2)) {
    const e = d(2);
    i(), h(e.logs()), i(2), f(e.logs().length >= 100 ? 3 : -1);
  }
}
function ne(t, _n) {
  if (t & 1) {
    const e = b();
    r(0, 'div', 3)(1, 'input', 4),
      F('ngModelChange', (a) => {
        p(e);
        const c = d();
        return V(c.searchQuery, a) || (c.searchQuery = a), _(a);
      }),
      g('input', () => {
        p(e);
        const a = d();
        return _(a.onSearch());
      }),
      o(),
      r(2, 'button', 5),
      g('click', () => {
        p(e);
        const a = d();
        return _(a.toggleAutoRefresh());
      }),
      s(3),
      o(),
      r(4, 'button', 5),
      g('click', () => {
        p(e);
        const a = d();
        return _(a.onExportLogs());
      }),
      s(5, 'Export'),
      o()(),
      r(6, 'div', 6)(7, 'div', 7),
      x(8, H, 2, 3, 'button', 8, O),
      o(),
      r(10, 'div', 7),
      x(11, J, 2, 4, 'button', 9, O),
      o()(),
      u(13, K, 1, 1, 'app-skeleton', 10)(14, X, 1, 0, 'app-empty-state', 11)(15, te, 4, 1);
  }
  if (t & 2) {
    const e = d();
    i(),
      D('ngModel', e.searchQuery),
      i(),
      y('btn--active', e.autoRefresh()),
      i(),
      S(' Auto-refresh: ', e.autoRefresh() ? 'ON' : 'OFF', ' '),
      i(5),
      h(e.logTypes),
      i(3),
      h(e.logLevels),
      i(2),
      f(e.loadingLogs() ? 13 : e.logs().length === 0 ? 14 : 15);
  }
}
function ie(t, _n) {
  t & 1 && T(0, 'app-skeleton', 10), t & 2 && L('count', 4);
}
function oe(t, _n) {
  t & 1 && T(0, 'app-empty-state', 24);
}
function re(t, n) {
  if (
    (t & 1 &&
      (r(0, 'div', 27)(1, 'span', 28),
      s(2),
      o(),
      r(3, 'span', 29),
      s(4),
      o(),
      r(5, 'span', 30),
      s(6),
      o(),
      r(7, 'span', 31)(8, 'code'),
      s(9),
      o()(),
      r(10, 'span', 32),
      s(11),
      P(12, 'relativeTime'),
      o()()),
    t & 2)
  ) {
    const e = n.$implicit;
    i(),
      C('data-type', e.type),
      i(),
      m(e.type),
      i(),
      y('credit-amount--positive', e.amount > 0)('credit-amount--negative', e.amount < 0),
      i(),
      I(' ', e.amount > 0 ? '+' : '', '', e.amount, ' '),
      i(2),
      m(e.balance_after),
      i(3),
      S('', e.wallet_address.slice(0, 8), '...'),
      i(2),
      m(w(12, 11, e.created_at));
  }
}
function ae(t, _n) {
  if (t & 1) {
    const e = b();
    r(0, 'button', 23),
      g('click', () => {
        p(e);
        const a = d(3);
        return _(a.loadMoreCredits());
      }),
      s(1, 'Load more'),
      o();
  }
}
function le(t, _n) {
  if (
    (t & 1 &&
      (r(0, 'div', 25)(1, 'div', 26)(2, 'span'),
      s(3, 'Type'),
      o(),
      r(4, 'span'),
      s(5, 'Amount'),
      o(),
      r(6, 'span'),
      s(7, 'Balance'),
      o(),
      r(8, 'span'),
      s(9, 'Wallet'),
      o(),
      r(10, 'span'),
      s(11, 'Time'),
      o()(),
      x(12, re, 13, 13, 'div', 27, G),
      o(),
      u(14, ae, 2, 0, 'button', 16)),
    t & 2)
  ) {
    const e = d(2);
    i(12), h(e.creditTxns()), i(2), f(e.creditTxns().length >= 50 ? 14 : -1);
  }
}
function se(t, _n) {
  if ((t & 1 && u(0, ie, 1, 1, 'app-skeleton', 10)(1, oe, 1, 0, 'app-empty-state', 24)(2, le, 15, 1), t & 2)) {
    const e = d();
    f(e.loadingCredits() ? 0 : e.creditTxns().length === 0 ? 1 : 2);
  }
}
var j = class t {
  api = k(R);
  activeTab = v('logs');
  logTypeFilter = v('all');
  logLevelFilter = v('all');
  loadingLogs = v(!0);
  loadingCredits = v(!0);
  logs = v([]);
  creditTxns = v([]);
  autoRefresh = v(!1);
  searchQuery = '';
  logOffset = 0;
  creditOffset = 0;
  refreshTimer = null;
  searchDebounce = null;
  logTypes = ['all', 'council', 'escalation', 'work-task'];
  logLevels = ['all', 'error', 'warn', 'info', 'stage'];
  ngOnInit() {
    this.loadLogs();
  }
  ngOnDestroy() {
    this.refreshTimer && clearInterval(this.refreshTimer), this.searchDebounce && clearTimeout(this.searchDebounce);
  }
  switchTab(n) {
    this.activeTab.set(n), n === 'credits' && this.creditTxns().length === 0 && this.loadCredits();
  }
  setLogType(n) {
    this.logTypeFilter.set(n), (this.logOffset = 0), this.logs.set([]), this.loadLogs();
  }
  setLogLevel(n) {
    this.logLevelFilter.set(n), (this.logOffset = 0), this.logs.set([]), this.loadLogs();
  }
  onSearch() {
    this.searchDebounce && clearTimeout(this.searchDebounce),
      (this.searchDebounce = setTimeout(() => {
        (this.logOffset = 0), this.logs.set([]), this.loadLogs();
      }, 300));
  }
  toggleAutoRefresh() {
    this.autoRefresh.update((n) => !n),
      this.autoRefresh()
        ? (this.refreshTimer = setInterval(() => {
            (this.logOffset = 0), this.loadLogs();
          }, 1e4))
        : this.refreshTimer && (clearInterval(this.refreshTimer), (this.refreshTimer = null));
  }
  onExportLogs() {
    const n = this.logs().map(
        (c) =>
          `[${c.timestamp}] [${c.level.toUpperCase()}] [${c.type}] ${c.message}${
            c.detail
              ? `
  ${c.detail}`
              : ''
          }`,
      ),
      e = new Blob(
        [
          n.join(`
`),
        ],
        { type: 'text/plain' },
      ),
      l = URL.createObjectURL(e),
      a = document.createElement('a');
    (a.href = l),
      (a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.txt`),
      a.click(),
      URL.revokeObjectURL(l);
  }
  loadMoreLogs() {
    (this.logOffset += 100), this.loadLogs(!0);
  }
  loadMoreCredits() {
    (this.creditOffset += 50), this.loadCredits(!0);
  }
  async loadLogs(n = !1) {
    this.loadingLogs.set(!0);
    try {
      let e = this.logTypeFilter(),
        l = this.logLevelFilter(),
        a = `/system-logs?type=${e}&limit=100&offset=${this.logOffset}`;
      l !== 'all' && (a += `&level=${l}`), this.searchQuery && (a += `&search=${encodeURIComponent(this.searchQuery)}`);
      const c = await M(this.api.get(a));
      n ? this.logs.update((W) => [...W, ...c.logs]) : this.logs.set(c.logs);
    } catch {
    } finally {
      this.loadingLogs.set(!1);
    }
  }
  async loadCredits(n = !1) {
    this.loadingCredits.set(!0);
    try {
      const e = await M(this.api.get(`/system-logs/credit-transactions?limit=50&offset=${this.creditOffset}`));
      n ? this.creditTxns.update((l) => [...l, ...e.transactions]) : this.creditTxns.set(e.transactions);
    } catch {
    } finally {
      this.loadingCredits.set(!1);
    }
  }
  static \u0275fac = (e) => new (e || t)();
  static \u0275cmp = E({
    type: t,
    selectors: [['app-system-logs']],
    decls: 10,
    vars: 6,
    consts: [
      [1, 'logs'],
      [1, 'tabs'],
      [1, 'tab-btn', 3, 'click'],
      [1, 'log-toolbar'],
      ['placeholder', 'Search logs...', 1, 'log-search', 3, 'ngModelChange', 'input', 'ngModel'],
      [1, 'btn', 'btn--secondary', 'btn--sm', 3, 'click'],
      [1, 'log-filters'],
      [1, 'filter-group'],
      [1, 'filter-chip', 3, 'filter-chip--active'],
      [1, 'filter-chip', 'filter-chip--level', 3, 'filter-chip--active'],
      ['variant', 'table', 3, 'count'],
      [
        'icon',
        `  [___]
  |   |
  |...|`,
        'title',
        'No system logs.',
        'description',
        'System logs appear here when agents run sessions, handle webhooks, or process scheduled tasks.',
      ],
      [1, 'filter-chip', 3, 'click'],
      [1, 'filter-chip', 'filter-chip--level', 3, 'click'],
      [1, 'log-list'],
      [1, 'log-entry'],
      [1, 'load-more'],
      [1, 'log-entry__header'],
      [1, 'log-type'],
      [1, 'log-level'],
      [1, 'log-time'],
      [1, 'log-message'],
      [1, 'log-detail'],
      [1, 'load-more', 3, 'click'],
      [
        'icon',
        `  [___]
  | 0 |
  |...|`,
        'title',
        'No credit transactions.',
        'description',
        'Credit transactions appear when agents consume API credits during sessions.',
      ],
      [1, 'credit-table'],
      [1, 'credit-header'],
      [1, 'credit-row'],
      [1, 'credit-type'],
      [1, 'credit-amount'],
      [1, 'credit-balance'],
      [1, 'credit-wallet'],
      [1, 'credit-time'],
    ],
    template: (e, l) => {
      e & 1 &&
        (r(0, 'div', 0)(1, 'h2'),
        s(2, 'System Logs'),
        o(),
        r(3, 'div', 1)(4, 'button', 2),
        g('click', () => l.switchTab('logs')),
        s(5, 'Event Logs'),
        o(),
        r(6, 'button', 2),
        g('click', () => l.switchTab('credits')),
        s(7, 'Credit Transactions'),
        o()(),
        u(8, ne, 16, 5),
        u(9, se, 3, 1),
        o()),
        e & 2 &&
          (i(4),
          y('tab-btn--active', l.activeTab() === 'logs'),
          i(2),
          y('tab-btn--active', l.activeTab() === 'credits'),
          i(2),
          f(l.activeTab() === 'logs' ? 8 : -1),
          i(),
          f(l.activeTab() === 'credits' ? 9 : -1));
    },
    dependencies: [A, $, z, N, U, Q, B],
    styles: [
      '.logs[_ngcontent-%COMP%]{padding:1.5rem}.logs[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.loading[_ngcontent-%COMP%]{color:var(--text-secondary)}.empty[_ngcontent-%COMP%]{text-align:center;padding:3rem;color:var(--text-tertiary)}.tabs[_ngcontent-%COMP%]{display:flex;gap:.35rem;margin-bottom:1rem}.tab-btn[_ngcontent-%COMP%]{padding:.45rem 1rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-secondary);font-size:.75rem;font-family:inherit;font-weight:600;cursor:pointer;transition:all .15s}.tab-btn[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-primary)}.tab-btn--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.log-toolbar[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem}.log-search[_ngcontent-%COMP%]{flex:1;padding:.4rem .75rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.8rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary);box-sizing:border-box}.log-search[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);outline:none}.btn--sm[_ngcontent-%COMP%]{padding:.3rem .6rem;font-size:.7rem}.btn--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan)}.log-filters[_ngcontent-%COMP%]{display:flex;gap:.75rem;margin-bottom:1rem}.filter-group[_ngcontent-%COMP%]{display:flex;gap:.35rem}.filter-chip[_ngcontent-%COMP%]{padding:.25rem .55rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:20px;color:var(--text-tertiary);font-size:.65rem;font-family:inherit;cursor:pointer;text-transform:capitalize;transition:all .15s}.filter-chip[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-secondary)}.filter-chip--active[_ngcontent-%COMP%]{border-color:var(--accent-magenta);color:var(--accent-magenta);background:var(--accent-magenta-dim)}.log-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.log-entry[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;transition:border-color .15s}.log-entry[_ngcontent-%COMP%]:hover{border-color:var(--border-bright)}.log-entry[data-level=error][_ngcontent-%COMP%]{border-left:3px solid var(--accent-red)}.log-entry[data-level=warn][_ngcontent-%COMP%]{border-left:3px solid var(--accent-amber)}.log-entry[data-level=info][_ngcontent-%COMP%]{border-left:3px solid var(--accent-cyan)}.log-entry__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem}.log-type[_ngcontent-%COMP%]{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border-radius:var(--radius-sm)}.log-type[data-type=council][_ngcontent-%COMP%]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}.log-type[data-type=escalation][_ngcontent-%COMP%]{color:var(--accent-amber);background:var(--accent-amber-dim)}.log-type[data-type=work-task][_ngcontent-%COMP%]{color:var(--accent-magenta);background:var(--accent-magenta-dim)}.log-level[_ngcontent-%COMP%]{font-size:.55rem;text-transform:uppercase;font-weight:600}.log-level[data-level=error][_ngcontent-%COMP%]{color:var(--accent-red)}.log-level[data-level=warn][_ngcontent-%COMP%]{color:var(--accent-amber)}.log-level[data-level=info][_ngcontent-%COMP%]{color:var(--text-tertiary)}.log-time[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);margin-left:auto}.log-message[_ngcontent-%COMP%]{margin:0;font-size:.75rem;color:var(--text-secondary);line-height:1.4}.log-detail[_ngcontent-%COMP%]{margin:.25rem 0 0;font-size:.65rem;color:var(--text-tertiary);font-family:monospace}.credit-table[_ngcontent-%COMP%]{display:flex;flex-direction:column}.credit-header[_ngcontent-%COMP%], .credit-row[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr 1fr 1.5fr 1fr;gap:.5rem;padding:.45rem .5rem;font-size:.7rem}.credit-header[_ngcontent-%COMP%]{color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;font-weight:700;border-bottom:1px solid var(--border)}.credit-row[_ngcontent-%COMP%]{color:var(--text-secondary);border-bottom:1px solid var(--border)}.credit-row[_ngcontent-%COMP%]:last-child{border-bottom:none}.credit-type[_ngcontent-%COMP%]{text-transform:capitalize;font-weight:600}.credit-type[data-type=purchase][_ngcontent-%COMP%]{color:var(--accent-green)}.credit-type[data-type=consume][_ngcontent-%COMP%]{color:var(--accent-amber)}.credit-type[data-type=reserve][_ngcontent-%COMP%]{color:var(--accent-magenta)}.credit-amount--positive[_ngcontent-%COMP%]{color:var(--accent-green)}.credit-amount--negative[_ngcontent-%COMP%]{color:var(--accent-red)}.credit-balance[_ngcontent-%COMP%]{color:var(--text-primary);font-weight:600}.credit-wallet[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{font-size:.6rem;background:var(--bg-raised);padding:1px 4px;border-radius:var(--radius-sm);color:var(--text-tertiary)}.credit-time[_ngcontent-%COMP%]{color:var(--text-tertiary)}.load-more[_ngcontent-%COMP%]{display:block;margin:1rem auto;padding:.5rem 1.5rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-secondary);font-size:.75rem;font-family:inherit;cursor:pointer;transition:all .15s}.load-more[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan);color:var(--accent-cyan)}',
    ],
    changeDetection: 0,
  });
};

export { j as SystemLogsComponent };
