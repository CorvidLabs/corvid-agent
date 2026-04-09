import { b as B } from './chunk-D6WCRQHB.js';
import { a as z } from './chunk-FGNIWOFY.js';
import { e as N } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  jb as _,
  Rb as $,
  T as A,
  q as b,
  ja as C,
  _a as D,
  Pb as d,
  Lb as E,
  qb as e,
  Z as f,
  ob as h,
  vb as I,
  $b as k,
  bc as M,
  Bb as m,
  pb as n,
  rb as O,
  Ob as o,
  fc as P,
  ib as p,
  Na as r,
  zb as S,
  hb as T,
  nb as u,
  mb as v,
  Mb as w,
  Qb as x,
  Y as y,
} from './chunk-LF4EWAJA.js';

var V = (_a, i) => i.status,
  U = (_a, i) => i.date,
  j = (_a, i) => i.agent_id,
  L = (_a, i) => i.source;
function G(a, _i) {
  a & 1 && O(0, 'app-skeleton', 1), a & 2 && h('count', 6);
}
function R(a, i) {
  if ((a & 1 && (n(0, 'div', 13)(1, 'span', 14), o(2), e()()), a & 2)) {
    const t = i.$implicit;
    E('flex', t.count),
      h('title', `${t.status}: ${t.count}`),
      T('data-status', t.status),
      r(2),
      $('', t.status, ' (', t.count, ')');
  }
}
function W(a, _i) {
  if (
    (a & 1 && (n(0, 'div', 10)(1, 'h3'), o(2, 'Work Tasks'), e(), n(3, 'div', 11), v(4, R, 3, 6, 'div', 12, V), e()()),
    a & 2)
  ) {
    const t = m(2);
    r(4), u(t.workTaskEntries());
  }
}
function q(a, i) {
  if (
    (a & 1 &&
      (n(0, 'div', 18)(1, 'span', 20), o(2), e(), n(3, 'div', 21), O(4, 'div', 22), e(), n(5, 'span', 23), o(6), e()()),
    a & 2)
  ) {
    const t = i.$implicit;
    h('title', `${t.date}: $${t.value.toFixed(4)}`),
      r(2),
      d(t.dateShort),
      r(2),
      E('width', t.pct, '%'),
      r(2),
      x('$', t.value.toFixed(4));
  }
}
function H(a, _i) {
  a & 1 && (n(0, 'p', 19), o(1, 'No spending data for this period'), e());
}
function J(a, _i) {
  if (a & 1) {
    const t = I();
    n(0, 'div', 10)(1, 'h3'),
      o(2),
      e(),
      n(3, 'div', 15)(4, 'button', 16),
      S('click', () => {
        y(t);
        const c = m(2);
        return f(c.loadSpending(7));
      }),
      o(5, '7d'),
      e(),
      n(6, 'button', 16),
      S('click', () => {
        y(t);
        const c = m(2);
        return f(c.loadSpending(14));
      }),
      o(7, '14d'),
      e(),
      n(8, 'button', 16),
      S('click', () => {
        y(t);
        const c = m(2);
        return f(c.loadSpending(30));
      }),
      o(9, '30d'),
      e(),
      n(10, 'button', 16),
      S('click', () => {
        y(t);
        const c = m(2);
        return f(c.loadSpending(90));
      }),
      o(11, '90d'),
      e()(),
      n(12, 'div', 17),
      v(13, q, 7, 5, 'div', 18, U),
      p(15, H, 2, 0, 'p', 19),
      e()();
  }
  if (a & 2) {
    const t = m(2);
    r(2),
      x('Daily API Cost (Last ', t.spendingDays(), ' Days)'),
      r(2),
      w('chart-btn--active', t.spendingDays() === 7),
      r(2),
      w('chart-btn--active', t.spendingDays() === 14),
      r(2),
      w('chart-btn--active', t.spendingDays() === 30),
      r(2),
      w('chart-btn--active', t.spendingDays() === 90),
      r(3),
      u(t.spendingBars()),
      r(2),
      _(t.spendingBars().length === 0 ? 15 : -1);
  }
}
function K(a, i) {
  if (
    (a & 1 &&
      (n(0, 'div', 18)(1, 'span', 20), o(2), e(), n(3, 'div', 21), O(4, 'div', 24), e(), n(5, 'span', 25), o(6), e()()),
    a & 2)
  ) {
    const t = i.$implicit;
    h('title', `${t.date}: ${t.value} sessions`), r(2), d(t.dateShort), r(2), E('width', t.pct, '%'), r(2), d(t.value);
  }
}
function Q(a, _i) {
  a & 1 && (n(0, 'p', 19), o(1, 'No session data for this period'), e());
}
function X(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 10)(1, 'h3'),
      o(2),
      e(),
      n(3, 'div', 17),
      v(4, K, 7, 5, 'div', 18, U),
      p(6, Q, 2, 0, 'p', 19),
      e()()),
    a & 2)
  ) {
    const t = m(2);
    r(2),
      x('Sessions Per Day (Last ', t.spendingDays(), ' Days)'),
      r(2),
      u(t.sessionBars()),
      r(2),
      _(t.sessionBars().length === 0 ? 6 : -1);
  }
}
function Y(a, i) {
  if (
    (a & 1 &&
      (n(0, 'div', 28)(1, 'span', 31),
      o(2),
      e(),
      n(3, 'span'),
      o(4),
      e(),
      n(5, 'span'),
      o(6),
      e(),
      n(7, 'span', 32),
      o(8),
      k(9, 'number'),
      e()()),
    a & 2)
  ) {
    const t = i.$implicit;
    r(2),
      d(t.agent_name || 'Unknown'),
      r(2),
      d(t.session_count),
      r(2),
      d(t.total_turns),
      r(2),
      x('$', M(9, 4, t.total_cost, '1.2-4'));
  }
}
function Z(a, _i) {
  a & 1 && (n(0, 'p', 19), o(1, 'No agent session data'), e());
}
function tt(a, i) {
  if ((a & 1 && (n(0, 'div', 30)(1, 'span', 33), o(2), e(), n(3, 'span', 34), o(4), e()()), a & 2)) {
    const t = i.$implicit;
    r(2), d(t.source), r(2), d(t.count);
  }
}
function et(a, i) {
  if ((a & 1 && (n(0, 'div', 30)(1, 'span', 33), o(2), e(), n(3, 'span', 34), o(4), e()()), a & 2)) {
    const t = i.$implicit;
    r(), T('data-status', t.status), r(), d(t.status), r(2), d(t.count);
  }
}
function nt(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 10)(1, 'h3'),
      o(2, 'Usage by Agent'),
      e(),
      n(3, 'div', 26)(4, 'div', 27)(5, 'span'),
      o(6, 'Agent'),
      e(),
      n(7, 'span'),
      o(8, 'Sessions'),
      e(),
      n(9, 'span'),
      o(10, 'Turns'),
      e(),
      n(11, 'span'),
      o(12, 'Cost (USD)'),
      e()(),
      v(13, Y, 10, 7, 'div', 28, j),
      p(15, Z, 2, 0, 'p', 19),
      e()(),
      n(16, 'div', 29)(17, 'div', 10)(18, 'h3'),
      o(19, 'Sessions by Source'),
      e(),
      v(20, tt, 5, 2, 'div', 30, L),
      e(),
      n(22, 'div', 10)(23, 'h3'),
      o(24, 'Sessions by Status'),
      e(),
      v(25, et, 5, 3, 'div', 30, V),
      e()()),
    a & 2)
  ) {
    const t = m(2);
    r(13),
      u(t.sessionStats().byAgent),
      r(2),
      _(t.sessionStats().byAgent.length === 0 ? 15 : -1),
      r(5),
      u(t.sessionStats().bySource),
      r(5),
      u(t.sessionStats().byStatus);
  }
}
function at(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 2)(1, 'div', 3)(2, 'span', 4),
      o(3, 'Total Sessions'),
      e(),
      n(4, 'span', 5),
      o(5),
      e()(),
      n(6, 'div', 3)(7, 'span', 4),
      o(8, 'API Cost (USD)'),
      e(),
      n(9, 'span', 6),
      o(10),
      k(11, 'number'),
      e()(),
      n(12, 'div', 3)(13, 'span', 4),
      o(14, 'ALGO Spent'),
      e(),
      n(15, 'span', 7),
      o(16),
      k(17, 'number'),
      e()(),
      n(18, 'div', 3)(19, 'span', 4),
      o(20, 'Total Turns'),
      e(),
      n(21, 'span', 5),
      o(22),
      e()(),
      n(23, 'div', 3)(24, 'span', 4),
      o(25, 'Active Now'),
      e(),
      n(26, 'span', 8),
      o(27),
      e()(),
      n(28, 'div', 3)(29, 'span', 4),
      o(30, 'Messages'),
      e(),
      n(31, 'span', 5),
      o(32),
      e()(),
      n(33, 'div', 3)(34, 'span', 4),
      o(35, 'Credits Used'),
      e(),
      n(36, 'span', 5),
      o(37),
      e()(),
      n(38, 'div', 9)(39, 'span', 4),
      o(40, "Today's Spend"),
      e(),
      n(41, 'span', 6),
      o(42),
      k(43, 'number'),
      e()()(),
      p(44, W, 6, 0, 'div', 10),
      p(45, J, 16, 10, 'div', 10),
      p(46, X, 7, 2, 'div', 10),
      p(47, nt, 27, 1)),
    a & 2)
  ) {
    const t = m();
    r(5),
      d(t.overview().totalSessions),
      r(5),
      x('$', M(11, 12, t.overview().totalCostUsd, '1.2-4')),
      r(6),
      d(M(17, 15, t.overview().totalAlgoSpent / 1e6, '1.4-4')),
      r(6),
      d(t.overview().totalTurns),
      r(5),
      d(t.overview().activeSessions),
      r(5),
      d(t.overview().agentMessages + t.overview().algochatMessages),
      r(5),
      d(t.overview().totalCreditsConsumed),
      r(5),
      x('$', M(43, 18, t.overview().todaySpending.apiCostUsd, '1.2-4')),
      r(2),
      _(t.workTaskTotal() > 0 ? 44 : -1),
      r(),
      _(t.spending() ? 45 : -1),
      r(),
      _(t.spending() ? 46 : -1),
      r(),
      _(t.sessionStats() ? 47 : -1);
  }
}
var F = class a {
  api = A(B);
  loading = C(!0);
  overview = C(null);
  spending = C(null);
  sessionStats = C(null);
  spendingDays = C(30);
  workTaskTotal = P(() => {
    const i = this.overview()?.workTasks;
    return i ? Object.values(i).reduce((t, l) => t + l, 0) : 0;
  });
  workTaskEntries = P(() => {
    const i = this.overview()?.workTasks;
    return i ? Object.entries(i).map(([t, l]) => ({ status: t, count: l })) : [];
  });
  spendingBars = P(() => {
    const i = this.spending();
    if (!i) return [];
    const t = new Map();
    for (const s of i.spending) t.set(s.date, (t.get(s.date) ?? 0) + s.api_cost_usd);
    for (const s of i.sessionCosts) t.set(s.date, (t.get(s.date) ?? 0) + s.cost_usd);
    const l = Array.from(t.entries())
        .map(([s, g]) => ({ date: s, value: g }))
        .sort((s, g) => s.date.localeCompare(g.date)),
      c = Math.max(...l.map((s) => s.value), 0.001);
    return l.map((s) => ({ date: s.date, dateShort: s.date.slice(5), value: s.value, pct: (s.value / c) * 100 }));
  });
  sessionBars = P(() => {
    const i = this.spending();
    if (!i) return [];
    const t = new Map();
    for (const s of i.sessionCosts) t.set(s.date, (t.get(s.date) ?? 0) + s.session_count);
    const l = Array.from(t.entries())
        .map(([s, g]) => ({ date: s, value: g }))
        .sort((s, g) => s.date.localeCompare(g.date)),
      c = Math.max(...l.map((s) => s.value), 1);
    return l.map((s) => ({ date: s.date, dateShort: s.date.slice(5), value: s.value, pct: (s.value / c) * 100 }));
  });
  ngOnInit() {
    this.loadAll();
  }
  loadSpending(i) {
    this.spendingDays.set(i),
      b(this.api.get(`/analytics/spending?days=${i}`))
        .then((t) => this.spending.set(t))
        .catch(() => {});
  }
  async loadAll() {
    this.loading.set(!0);
    try {
      const [i, t, l] = await Promise.all([
        b(this.api.get('/analytics/overview')),
        b(this.api.get(`/analytics/spending?days=${this.spendingDays()}`)),
        b(this.api.get('/analytics/sessions')),
      ]);
      this.overview.set(i), this.spending.set(t), this.sessionStats.set(l);
    } catch {
    } finally {
      this.loading.set(!1);
    }
  }
  static \u0275fac = (t) => new (t || a)();
  static \u0275cmp = D({
    type: a,
    selectors: [['app-analytics']],
    decls: 5,
    vars: 1,
    consts: [
      [1, 'analytics'],
      ['variant', 'card', 3, 'count'],
      [1, 'analytics__cards', 'stagger-scale'],
      [1, 'stat-card'],
      [1, 'stat-card__label'],
      [1, 'stat-card__value'],
      [1, 'stat-card__value', 'stat-card__value--usd'],
      [1, 'stat-card__value', 'stat-card__value--algo'],
      [1, 'stat-card__value', 'stat-card__value--active'],
      [1, 'stat-card', 'stat-card--today'],
      [1, 'analytics__section'],
      [1, 'work-task-bar'],
      [1, 'work-task-segment', 3, 'flex', 'title'],
      [1, 'work-task-segment', 3, 'title'],
      [1, 'work-task-segment__label'],
      [1, 'chart-controls'],
      [1, 'chart-btn', 3, 'click'],
      [1, 'ascii-chart'],
      [1, 'chart-row', 3, 'title'],
      [1, 'empty-state'],
      [1, 'chart-row__label'],
      [1, 'chart-row__bar-wrapper'],
      [1, 'chart-row__bar'],
      [1, 'chart-row__value'],
      [1, 'chart-row__bar', 'chart-row__bar--sessions'],
      [1, 'chart-row__value', 'chart-row__value--sessions'],
      [1, 'agent-table'],
      [1, 'agent-table__header'],
      [1, 'agent-table__row'],
      [1, 'analytics__grid-2'],
      [1, 'kv-row'],
      [1, 'agent-name'],
      [1, 'cost-cell'],
      [1, 'kv-key'],
      [1, 'kv-val'],
    ],
    template: (t, l) => {
      t & 1 && (n(0, 'div', 0)(1, 'h2'), o(2, 'Analytics'), e(), p(3, G, 1, 1, 'app-skeleton', 1)(4, at, 48, 21), e()),
        t & 2 && (r(3), _(l.loading() ? 3 : l.overview() ? 4 : -1));
    },
    dependencies: [z, N],
    styles: [
      '.analytics[_ngcontent-%COMP%]{padding:1.5rem}.analytics[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0 0 1.5rem;color:var(--text-primary)}.analytics[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem}.loading[_ngcontent-%COMP%]{color:var(--text-secondary)}.analytics__cards[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;margin-bottom:2rem}.stat-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;display:flex;flex-direction:column;gap:.35rem}.stat-card--today[_ngcontent-%COMP%]{border-color:var(--accent-amber);border-style:dashed}.stat-card__label[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em}.stat-card__value[_ngcontent-%COMP%]{font-size:1.5rem;font-weight:700;color:var(--accent-cyan);text-shadow:0 0 10px rgba(0,229,255,.15)}.stat-card__value--usd[_ngcontent-%COMP%]{color:var(--accent-green);text-shadow:0 0 10px rgba(0,255,136,.15)}.stat-card__value--algo[_ngcontent-%COMP%]{color:var(--accent-magenta);text-shadow:0 0 10px rgba(255,0,170,.15)}.stat-card__value--active[_ngcontent-%COMP%]{color:var(--accent-amber);text-shadow:0 0 10px rgba(255,170,0,.15)}.analytics__section[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}.analytics__grid-2[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem}@media(max-width:767px){.analytics__grid-2[_ngcontent-%COMP%]{grid-template-columns:1fr}}.work-task-bar[_ngcontent-%COMP%]{display:flex;height:28px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)}.work-task-segment[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;min-width:40px;transition:flex .3s}.work-task-segment__label[_ngcontent-%COMP%]{font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.work-task-segment[data-status=completed][_ngcontent-%COMP%]{background:var(--accent-green-dim);color:var(--accent-green)}.work-task-segment[data-status=pending][_ngcontent-%COMP%]{background:var(--accent-amber-dim);color:var(--accent-amber)}.work-task-segment[data-status=running][_ngcontent-%COMP%], .work-task-segment[data-status=branching][_ngcontent-%COMP%], .work-task-segment[data-status=validating][_ngcontent-%COMP%]{background:var(--accent-cyan-dim);color:var(--accent-cyan)}.work-task-segment[data-status=failed][_ngcontent-%COMP%]{background:var(--accent-red-dim);color:var(--accent-red)}.chart-controls[_ngcontent-%COMP%]{display:flex;gap:.35rem;margin-bottom:.75rem}.chart-btn[_ngcontent-%COMP%]{padding:.3rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;font-family:inherit;cursor:pointer;transition:border-color .15s,color .15s}.chart-btn[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-primary)}.chart-btn--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.ascii-chart[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:3px}.chart-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.chart-row__label[_ngcontent-%COMP%]{width:48px;flex-shrink:0;font-size:.6rem;color:var(--text-tertiary);text-align:right}.chart-row__bar-wrapper[_ngcontent-%COMP%]{flex:1;height:14px;background:var(--bg-raised);border-radius:2px;overflow:hidden}.chart-row__bar[_ngcontent-%COMP%]{height:100%;background:linear-gradient(90deg,var(--accent-cyan-dim),var(--accent-cyan));border-radius:2px;min-width:1px;transition:width .3s}.chart-row__value[_ngcontent-%COMP%]{width:64px;flex-shrink:0;font-size:.6rem;color:var(--accent-green);text-align:right}.chart-row__bar--sessions[_ngcontent-%COMP%]{background:linear-gradient(90deg,var(--accent-magenta-dim, rgba(255, 0, 170, .15)),var(--accent-magenta))}.chart-row__value--sessions[_ngcontent-%COMP%]{color:var(--accent-magenta)}.agent-table[_ngcontent-%COMP%]{display:flex;flex-direction:column}.agent-table__header[_ngcontent-%COMP%], .agent-table__row[_ngcontent-%COMP%]{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:.5rem;padding:.4rem 0;font-size:.7rem}.agent-table__header[_ngcontent-%COMP%]{color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);font-weight:700}.agent-table__row[_ngcontent-%COMP%]{color:var(--text-secondary);border-bottom:1px solid var(--border)}.agent-table__row[_ngcontent-%COMP%]:last-child{border-bottom:none}.agent-name[_ngcontent-%COMP%]{color:var(--accent-cyan);font-weight:600}.cost-cell[_ngcontent-%COMP%]{color:var(--accent-green)}.kv-row[_ngcontent-%COMP%]{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.75rem}.kv-row[_ngcontent-%COMP%]:last-child{border-bottom:none}.kv-key[_ngcontent-%COMP%]{color:var(--text-secondary);text-transform:capitalize}.kv-key[data-status=running][_ngcontent-%COMP%]{color:var(--accent-cyan)}.kv-key[data-status=stopped][_ngcontent-%COMP%]{color:var(--text-tertiary)}.kv-key[data-status=error][_ngcontent-%COMP%]{color:var(--accent-red)}.kv-val[_ngcontent-%COMP%]{color:var(--text-primary);font-weight:600}.empty-state[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.75rem;text-align:center;padding:1rem}',
    ],
    changeDetection: 0,
  });
};

export { F as AnalyticsComponent };
