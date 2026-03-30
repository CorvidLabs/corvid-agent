import { a as V } from './chunk-2EJE5M6O.js';
import { a as z } from './chunk-FGNIWOFY.js';
import { g as I } from './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as A } from './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  jb as _,
  mb as b,
  hb as C,
  Rb as D,
  Bb as d,
  Lb as E,
  _a as F,
  ja as g,
  nb as h,
  qb as i,
  Z as k,
  q as M,
  zb as m,
  pb as n,
  rb as O,
  Na as o,
  vb as P,
  ib as p,
  Ob as r,
  T as S,
  Pb as s,
  Sb as T,
  Qb as u,
  ob as v,
  Mb as w,
  Y as x,
  lb as y,
} from './chunk-LF4EWAJA.js';

var R = (_a, t) => t.id;
function $(a, _t) {
  if ((a & 1 && (n(0, 'div', 30)(1, 'span', 26), r(2, 'On-Chain'), i(), n(3, 'span', 27), r(4), i()()), a & 2)) {
    const e = d(2);
    o(4), u('App ', e.stats().onChainAppId);
  }
}
function U(a, _t) {
  if (
    (a & 1 &&
      (n(0, 'div', 4)(1, 'div', 25)(2, 'span', 26),
      r(3),
      i(),
      n(4, 'span', 27),
      r(5, 'Total'),
      i()(),
      n(6, 'div', 28)(7, 'span', 26),
      r(8),
      i(),
      n(9, 'span', 27),
      r(10, 'Active'),
      i()(),
      n(11, 'div', 29)(12, 'span', 26),
      r(13),
      i(),
      n(14, 'span', 27),
      r(15, 'Offline'),
      i()(),
      p(16, $, 5, 1, 'div', 30),
      i()),
    a & 2)
  ) {
    const e = d();
    o(3),
      s(e.stats().total),
      o(5),
      s(e.stats().active),
      o(5),
      s(e.stats().inactive),
      o(3),
      _(e.stats().onChainAppId ? 16 : -1);
  }
}
function B(a, t) {
  if ((a & 1 && (n(0, 'option', 15), r(1), i()), a & 2)) {
    const e = t.$implicit;
    v('value', e), o(), s(e);
  }
}
function L(a, t) {
  if (a & 1) {
    const e = P();
    n(0, 'button', 32),
      m('click', () => {
        const c = x(e).$implicit,
          f = d(2);
        return k(f.toggleCapability(c));
      }),
      r(1),
      i();
  }
  if (a & 2) {
    const e = t.$implicit,
      l = d(2);
    w('flock-cap-pill--active', l.capabilityFilter() === e), o(), u(' ', e, ' ');
  }
}
function j(a, _t) {
  if ((a & 1 && (n(0, 'div', 22), b(1, L, 2, 3, 'button', 31, y), i()), a & 2)) {
    const e = d();
    o(), h(e.allCapabilities());
  }
}
function H(a, _t) {
  a & 1 && (n(0, 'div', 23), O(1, 'app-skeleton', 33), i()), a & 2 && (o(), v('count', 6));
}
function Q(a, _t) {
  if ((a & 1 && O(0, 'app-empty-state', 34), a & 2)) {
    const e = d(2);
    v('title', e.searchQuery() || e.statusFilter() || e.capabilityFilter() ? 'No matches' : 'No agents found')(
      'description',
      e.searchQuery() || e.statusFilter() || e.capabilityFilter()
        ? 'Try adjusting your search or filters.'
        : 'No agents registered in the directory yet.',
    );
  }
}
function Y(a, _t) {
  if ((a & 1 && (n(0, 'p', 45), r(1), i()), a & 2)) {
    const e = d().$implicit,
      l = d(3);
    o(), s(l.truncate(e.description, 100));
  }
}
function q(a, t) {
  if ((a & 1 && (n(0, 'span', 51), r(1), i()), a & 2)) {
    const e = t.$implicit;
    o(), s(e);
  }
}
function G(a, _t) {
  if ((a & 1 && (n(0, 'span', 52), r(1), i()), a & 2)) {
    const e = d(2).$implicit;
    o(), u('+', e.capabilities.length - 3);
  }
}
function J(a, _t) {
  if ((a & 1 && (n(0, 'div', 46), b(1, q, 2, 1, 'span', 51, y), p(3, G, 2, 1, 'span', 52), i()), a & 2)) {
    const e = d().$implicit;
    o(), h(e.capabilities.slice(0, 3)), o(2), _(e.capabilities.length > 3 ? 3 : -1);
  }
}
function K(a, t) {
  if (a & 1) {
    const e = P();
    n(0, 'button', 38),
      m('click', () => {
        const c = x(e).$implicit,
          f = d(3);
        return k(f.selectAgent(c));
      }),
      n(1, 'div', 39)(2, 'div', 40),
      r(3),
      i(),
      n(4, 'div', 41)(5, 'span', 42),
      r(6),
      i(),
      n(7, 'span', 43),
      r(8),
      i()(),
      n(9, 'div', 44),
      r(10),
      i()(),
      p(11, Y, 2, 1, 'p', 45),
      p(12, J, 4, 1, 'div', 46),
      n(13, 'div', 47)(14, 'span', 48),
      r(15),
      i(),
      n(16, 'span', 49),
      r(17),
      i(),
      n(18, 'span', 50),
      r(19),
      i()()();
  }
  if (a & 2) {
    let e,
      l = t.$implicit,
      c = d(3);
    w('flock-card--selected', ((e = c.selectedAgent()) == null ? null : e.id) === l.id),
      o(2),
      C('data-status', l.status),
      o(),
      u(' ', l.name.charAt(0).toUpperCase(), ' '),
      o(3),
      s(l.name),
      o(),
      C('data-status', l.status),
      o(),
      s(l.status),
      o(),
      C('data-level', c.getRepLevel(l.reputationScore)),
      o(),
      u(' ', l.reputationScore, ' '),
      o(),
      _(l.description ? 11 : -1),
      o(),
      _(l.capabilities.length > 0 ? 12 : -1),
      o(3),
      u('\u2191 ', l.uptimePct.toFixed(0), '%'),
      o(2),
      u('\u2713 ', l.attestationCount),
      o(2),
      u('\u25CE ', l.councilParticipations);
  }
}
function W(a, _t) {
  if (a & 1) {
    const e = P();
    n(0, 'div', 37)(1, 'button', 53),
      m('click', () => {
        x(e);
        const c = d(3);
        return k(c.prevPage());
      }),
      r(2, '\u2190 Prev'),
      i(),
      n(3, 'span', 54),
      r(4),
      i(),
      n(5, 'button', 53),
      m('click', () => {
        x(e);
        const c = d(3);
        return k(c.nextPage());
      }),
      r(6, 'Next \u2192'),
      i()();
  }
  if (a & 2) {
    const e = d(3);
    o(),
      v('disabled', e.currentPage() === 0),
      o(3),
      T(
        ' ',
        e.currentPage() * e.pageSize + 1,
        '\u2013',
        e.min((e.currentPage() + 1) * e.pageSize, e.totalAgents()),
        ' of ',
        e.totalAgents(),
        ' ',
      ),
      o(),
      v('disabled', (e.currentPage() + 1) * e.pageSize >= e.totalAgents());
  }
}
function X(a, _t) {
  if ((a & 1 && (n(0, 'div', 35), b(1, K, 20, 14, 'button', 36, R), i(), p(3, W, 7, 5, 'div', 37)), a & 2)) {
    const e = d(2);
    o(), h(e.agents()), o(2), _(e.totalAgents() > e.pageSize ? 3 : -1);
  }
}
function Z(a, _t) {
  if ((a & 1 && p(0, Q, 1, 2, 'app-empty-state', 34)(1, X, 4, 1), a & 2)) {
    const e = d();
    _(e.agents().length === 0 ? 0 : 1);
  }
}
function ee(a, _t) {
  if ((a & 1 && (n(0, 'p', 62), r(1), i()), a & 2)) {
    const e = d();
    o(), s(e.description);
  }
}
function te(a, t) {
  if ((a & 1 && (n(0, 'span', 81), r(1), i()), a & 2)) {
    const e = t.$implicit;
    o(), s(e);
  }
}
function ne(a, _t) {
  if (
    (a & 1 &&
      (n(0, 'div', 63)(1, 'h3', 64), r(2, 'Capabilities'), i(), n(3, 'div', 80), b(4, te, 2, 1, 'span', 81, y), i()()),
    a & 2)
  ) {
    const e = d();
    o(4), h(e.capabilities);
  }
}
function ie(a, _t) {
  if ((a & 1 && (n(0, 'div', 74)(1, 'span', 75), r(2, 'Instance'), i(), n(3, 'span', 76), r(4), i()()), a & 2)) {
    const e = d();
    o(4), s(e.instanceUrl);
  }
}
function ae(a, _t) {
  if ((a & 1 && (n(0, 'div', 74)(1, 'span', 75), r(2, 'Last Heartbeat'), i(), n(3, 'span', 77), r(4), i()()), a & 2)) {
    const e = d(),
      l = d();
    o(4), s(l.formatRelative(e.lastHeartbeat));
  }
}
function oe(a, t) {
  if (a & 1) {
    const e = P();
    n(0, 'div', 55),
      m('click', () => {
        x(e);
        const c = d();
        return k(c.selectedAgent.set(null));
      }),
      n(1, 'div', 56),
      m('click', (c) => (x(e), k(c.stopPropagation()))),
      n(2, 'div', 57)(3, 'div', 58),
      r(4),
      i(),
      n(5, 'div')(6, 'h2', 59),
      r(7),
      i(),
      n(8, 'span', 60),
      r(9),
      i()(),
      n(10, 'button', 61),
      m('click', () => {
        x(e);
        const c = d();
        return k(c.selectedAgent.set(null));
      }),
      r(11, '\xD7'),
      i()(),
      p(12, ee, 2, 1, 'p', 62),
      n(13, 'div', 63)(14, 'h3', 64),
      r(15, 'Reputation'),
      i(),
      n(16, 'div', 65)(17, 'div', 66),
      O(18, 'div', 67),
      i(),
      n(19, 'span', 68),
      r(20),
      i()()(),
      n(21, 'div', 63)(22, 'h3', 64),
      r(23, 'Metrics'),
      i(),
      n(24, 'div', 69)(25, 'div', 70)(26, 'span', 71),
      r(27),
      i(),
      n(28, 'span', 72),
      r(29, 'Uptime'),
      i()(),
      n(30, 'div', 70)(31, 'span', 71),
      r(32),
      i(),
      n(33, 'span', 72),
      r(34, 'Attestations'),
      i()(),
      n(35, 'div', 70)(36, 'span', 71),
      r(37),
      i(),
      n(38, 'span', 72),
      r(39, 'Councils'),
      i()()()(),
      p(40, ne, 6, 0, 'div', 63),
      n(41, 'div', 63)(42, 'h3', 64),
      r(43, 'Details'),
      i(),
      n(44, 'div', 73)(45, 'div', 74)(46, 'span', 75),
      r(47, 'Address'),
      i(),
      n(48, 'span', 76),
      r(49),
      i()(),
      p(50, ie, 5, 1, 'div', 74),
      n(51, 'div', 74)(52, 'span', 75),
      r(53, 'Registered'),
      i(),
      n(54, 'span', 77),
      r(55),
      i()(),
      p(56, ae, 5, 1, 'div', 74),
      i()(),
      n(57, 'div', 78)(58, 'button', 79),
      m('click', () => {
        const c = x(e),
          f = d();
        return k(f.messageAgent(c));
      }),
      r(59, 'Message Agent'),
      i()()()();
  }
  if (a & 2) {
    const e = t,
      l = d();
    o(3),
      C('data-status', e.status),
      o(),
      u(' ', e.name.charAt(0).toUpperCase(), ' '),
      o(3),
      s(e.name),
      o(),
      C('data-status', e.status),
      o(),
      s(e.status),
      o(3),
      _(e.description ? 12 : -1),
      o(6),
      E('width', e.reputationScore, '%'),
      C('data-level', l.getRepLevel(e.reputationScore)),
      o(),
      C('data-level', l.getRepLevel(e.reputationScore)),
      o(),
      u('', e.reputationScore, '/100'),
      o(7),
      u('', e.uptimePct.toFixed(1), '%'),
      o(5),
      s(e.attestationCount),
      o(5),
      s(e.councilParticipations),
      o(3),
      _(e.capabilities.length > 0 ? 40 : -1),
      o(9),
      D('', e.address.slice(0, 8), '...', e.address.slice(-6)),
      o(),
      _(e.instanceUrl ? 50 : -1),
      o(5),
      s(l.formatDate(e.registeredAt)),
      o(),
      _(e.lastHeartbeat ? 56 : -1);
  }
}
var N = class a {
  api = S(A);
  router = S(I);
  pageSize = 24;
  loading = g(!0);
  agents = g([]);
  totalAgents = g(0);
  stats = g(null);
  allCapabilities = g([]);
  selectedAgent = g(null);
  searchQuery = g('');
  statusFilter = g('');
  capabilityFilter = g('');
  sortBy = g('reputation');
  sortOrder = g('desc');
  currentPage = g(0);
  searchDebounce = null;
  ngOnInit() {
    this.loadStats(), this.loadCapabilities(), this.search();
  }
  onSearchInput(t) {
    this.searchQuery.set(t.target.value), this.currentPage.set(0), this.debounceSearch();
  }
  onStatusChange(t) {
    this.statusFilter.set(t.target.value), this.currentPage.set(0), this.search();
  }
  onCapabilityChange(t) {
    this.capabilityFilter.set(t.target.value), this.currentPage.set(0), this.search();
  }
  onSortByChange(t) {
    this.sortBy.set(t.target.value), this.search();
  }
  toggleSortOrder() {
    this.sortOrder.update((t) => (t === 'desc' ? 'asc' : 'desc')), this.search();
  }
  toggleCapability(t) {
    this.capabilityFilter.update((e) => (e === t ? '' : t)), this.currentPage.set(0), this.search();
  }
  prevPage() {
    this.currentPage.update((t) => Math.max(0, t - 1)), this.search();
  }
  nextPage() {
    this.currentPage.update((t) => t + 1), this.search();
  }
  selectAgent(t) {
    this.selectedAgent.set(t);
  }
  messageAgent(t) {
    this.selectedAgent.set(null), this.router.navigate(['/sessions/new'], { queryParams: { agent: t.name } });
  }
  getRepLevel(t) {
    return t >= 70 ? 'high' : t >= 30 ? 'mid' : 'low';
  }
  truncate(t, e) {
    return t.length > e ? `${t.slice(0, e)}...` : t;
  }
  min(t, e) {
    return Math.min(t, e);
  }
  formatDate(t) {
    return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  formatRelative(t) {
    const e = Date.now() - new Date(t).getTime(),
      l = Math.floor(e / 6e4);
    if (l < 1) return 'just now';
    if (l < 60) return `${l}m ago`;
    const c = Math.floor(l / 60);
    return c < 24 ? `${c}h ago` : `${Math.floor(c / 24)}d ago`;
  }
  debounceSearch() {
    this.searchDebounce && clearTimeout(this.searchDebounce),
      (this.searchDebounce = setTimeout(() => this.search(), 250));
  }
  async search() {
    this.loading.set(!0);
    try {
      const t = new URLSearchParams(),
        e = this.searchQuery().trim();
      e && t.set('q', e),
        this.statusFilter() && t.set('status', this.statusFilter()),
        this.capabilityFilter() && t.set('capability', this.capabilityFilter()),
        t.set('sortBy', this.sortBy()),
        t.set('sortOrder', this.sortOrder()),
        t.set('limit', String(this.pageSize)),
        t.set('offset', String(this.currentPage() * this.pageSize));
      const l = await M(this.api.get(`/flock-directory/search?${t.toString()}`));
      this.agents.set(l.agents), this.totalAgents.set(l.total);
    } catch {
      this.agents.set([]), this.totalAgents.set(0);
    } finally {
      this.loading.set(!1);
    }
  }
  async loadStats() {
    try {
      const t = await M(this.api.get('/flock-directory/stats'));
      this.stats.set(t);
    } catch {}
  }
  async loadCapabilities() {
    try {
      const t = await M(this.api.get('/flock-directory/search?limit=200')),
        e = new Set();
      for (const l of t.agents) for (const c of l.capabilities) e.add(c);
      this.allCapabilities.set([...e].sort());
    } catch {}
  }
  static \u0275fac = (e) => new (e || a)();
  static \u0275cmp = F({
    type: a,
    selectors: [['app-flock-directory']],
    decls: 43,
    vars: 11,
    consts: [
      [1, 'flock-page'],
      [1, 'flock-header'],
      [1, 'flock-header__title-row'],
      [1, 'flock-header__title'],
      [1, 'flock-header__stats'],
      [1, 'flock-header__subtitle'],
      [1, 'flock-controls'],
      [1, 'flock-search'],
      [1, 'flock-search__icon'],
      [
        'type',
        'text',
        'placeholder',
        'Search agents...',
        'autocomplete',
        'off',
        'spellcheck',
        'false',
        1,
        'flock-search__input',
        3,
        'input',
        'value',
      ],
      [1, 'flock-filters'],
      [1, 'flock-filter', 3, 'change', 'value'],
      ['value', ''],
      ['value', 'active'],
      ['value', 'inactive'],
      [3, 'value'],
      ['value', 'reputation'],
      ['value', 'name'],
      ['value', 'uptime'],
      ['value', 'registered'],
      ['value', 'attestations'],
      [1, 'flock-sort-toggle', 3, 'click', 'title'],
      [1, 'flock-cap-bar'],
      [1, 'flock-loading'],
      [1, 'flock-detail-backdrop'],
      [1, 'stat-pill'],
      [1, 'stat-pill__value'],
      [1, 'stat-pill__label'],
      [1, 'stat-pill', 'stat-pill--active'],
      [1, 'stat-pill', 'stat-pill--inactive'],
      [1, 'stat-pill', 'stat-pill--chain'],
      [1, 'flock-cap-pill', 3, 'flock-cap-pill--active'],
      [1, 'flock-cap-pill', 3, 'click'],
      ['variant', 'card', 3, 'count'],
      ['icon', '~?~', 3, 'title', 'description'],
      [1, 'flock-grid', 'stagger-children'],
      ['type', 'button', 1, 'flock-card', 3, 'flock-card--selected'],
      [1, 'flock-pagination'],
      ['type', 'button', 1, 'flock-card', 3, 'click'],
      [1, 'flock-card__header'],
      [1, 'flock-card__avatar'],
      [1, 'flock-card__info'],
      [1, 'flock-card__name'],
      [1, 'flock-card__status'],
      [1, 'flock-card__score'],
      [1, 'flock-card__desc'],
      [1, 'flock-card__caps'],
      [1, 'flock-card__metrics'],
      ['title', 'Uptime', 1, 'flock-card__metric'],
      ['title', 'Attestations', 1, 'flock-card__metric'],
      ['title', 'Councils', 1, 'flock-card__metric'],
      [1, 'flock-card__cap'],
      [1, 'flock-card__cap', 'flock-card__cap--more'],
      [1, 'flock-pagination__btn', 3, 'click', 'disabled'],
      [1, 'flock-pagination__info'],
      [1, 'flock-detail-backdrop', 3, 'click'],
      [1, 'flock-detail', 3, 'click'],
      [1, 'flock-detail__header'],
      [1, 'flock-detail__avatar'],
      [1, 'flock-detail__name'],
      [1, 'flock-detail__status'],
      ['title', 'Close', 1, 'flock-detail__close', 3, 'click'],
      [1, 'flock-detail__desc'],
      [1, 'flock-detail__section'],
      [1, 'flock-detail__section-title'],
      [1, 'flock-detail__rep'],
      [1, 'flock-detail__rep-bar'],
      [1, 'flock-detail__rep-fill'],
      [1, 'flock-detail__rep-value'],
      [1, 'flock-detail__metrics'],
      [1, 'flock-detail__metric'],
      [1, 'flock-detail__metric-value'],
      [1, 'flock-detail__metric-label'],
      [1, 'flock-detail__fields'],
      [1, 'flock-detail__field'],
      [1, 'flock-detail__field-label'],
      [1, 'flock-detail__field-value', 'flock-detail__field-value--mono'],
      [1, 'flock-detail__field-value'],
      [1, 'flock-detail__actions'],
      [1, 'flock-detail__action-btn', 3, 'click'],
      [1, 'flock-detail__caps'],
      [1, 'flock-detail__cap'],
    ],
    template: (e, l) => {
      if (
        (e & 1 &&
          (n(0, 'div', 0)(1, 'div', 1)(2, 'div', 2)(3, 'h1', 3),
          r(4, 'Flock Directory'),
          i(),
          p(5, U, 17, 4, 'div', 4),
          i(),
          n(6, 'p', 5),
          r(7, 'Discover agents in the network. Search by name, capability, or reputation.'),
          i()(),
          n(8, 'div', 6)(9, 'div', 7)(10, 'span', 8),
          r(11, '/'),
          i(),
          n(12, 'input', 9),
          m('input', (f) => l.onSearchInput(f)),
          i()(),
          n(13, 'div', 10)(14, 'select', 11),
          m('change', (f) => l.onStatusChange(f)),
          n(15, 'option', 12),
          r(16, 'All Status'),
          i(),
          n(17, 'option', 13),
          r(18, 'Active'),
          i(),
          n(19, 'option', 14),
          r(20, 'Inactive'),
          i()(),
          n(21, 'select', 11),
          m('change', (f) => l.onCapabilityChange(f)),
          n(22, 'option', 12),
          r(23, 'All Capabilities'),
          i(),
          b(24, B, 2, 2, 'option', 15, y),
          i(),
          n(26, 'select', 11),
          m('change', (f) => l.onSortByChange(f)),
          n(27, 'option', 16),
          r(28, 'Reputation'),
          i(),
          n(29, 'option', 17),
          r(30, 'Name'),
          i(),
          n(31, 'option', 18),
          r(32, 'Uptime'),
          i(),
          n(33, 'option', 19),
          r(34, 'Newest'),
          i(),
          n(35, 'option', 20),
          r(36, 'Attestations'),
          i()(),
          n(37, 'button', 21),
          m('click', () => l.toggleSortOrder()),
          r(38),
          i()()(),
          p(39, j, 3, 0, 'div', 22),
          p(40, H, 2, 1, 'div', 23),
          p(41, Z, 2, 1),
          p(42, oe, 60, 20, 'div', 24),
          i()),
        e & 2)
      ) {
        let c;
        o(5),
          _(l.stats() ? 5 : -1),
          o(7),
          v('value', l.searchQuery()),
          o(2),
          v('value', l.statusFilter()),
          o(7),
          v('value', l.capabilityFilter()),
          o(3),
          h(l.allCapabilities()),
          o(2),
          v('value', l.sortBy()),
          o(11),
          v('title', l.sortOrder() === 'desc' ? 'Descending' : 'Ascending'),
          o(),
          u(' ', l.sortOrder() === 'desc' ? '\u2193' : '\u2191', ' '),
          o(),
          _(l.allCapabilities().length > 0 ? 39 : -1),
          o(),
          _(l.loading() ? 40 : -1),
          o(),
          _(l.loading() ? -1 : 41),
          o(),
          _((c = l.selectedAgent()) ? 42 : -1, c);
      }
    },
    dependencies: [z, V],
    styles: [
      '.flock-page[_ngcontent-%COMP%]{padding:1.5rem;max-width:1200px;margin:0 auto;animation:_ngcontent-%COMP%_slideUp .3s ease-out}@keyframes _ngcontent-%COMP%_slideUp{0%{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.flock-header[_ngcontent-%COMP%]{margin-bottom:1.5rem}.flock-header__title-row[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:.5rem}.flock-header__title[_ngcontent-%COMP%]{font-size:1.3rem;font-weight:700;color:var(--text-primary, #eee);margin:0}.flock-header__stats[_ngcontent-%COMP%]{display:flex;gap:.5rem;flex-wrap:wrap}.flock-header__subtitle[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-tertiary, #666);margin:0}.stat-pill[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.35rem;padding:.25rem .6rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:6px;font-size:.7rem}.stat-pill__value[_ngcontent-%COMP%]{font-weight:700;color:var(--text-primary, #eee)}.stat-pill__label[_ngcontent-%COMP%]{color:var(--text-tertiary, #666)}.stat-pill--active[_ngcontent-%COMP%]   .stat-pill__value[_ngcontent-%COMP%]{color:var(--accent-green, #0f0)}.stat-pill--inactive[_ngcontent-%COMP%]   .stat-pill__value[_ngcontent-%COMP%]{color:var(--text-tertiary, #666)}.stat-pill--chain[_ngcontent-%COMP%]{border-color:var(--accent-cyan, #0ef)}.stat-pill--chain[_ngcontent-%COMP%]   .stat-pill__value[_ngcontent-%COMP%]{color:var(--accent-cyan, #0ef)}.flock-controls[_ngcontent-%COMP%]{display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap}.flock-search[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;flex:1;min-width:200px;padding:.5rem .75rem;background:var(--bg-input, #1a1a2e);border:1px solid var(--border, #333);border-radius:8px;transition:border-color .15s}.flock-search[_ngcontent-%COMP%]:focus-within{border-color:var(--accent-cyan, #0ef);box-shadow:var(--glow-cyan)}.flock-search__icon[_ngcontent-%COMP%]{color:var(--accent-cyan, #0ef);font-weight:700;font-size:.85rem;flex-shrink:0}.flock-search__input[_ngcontent-%COMP%]{flex:1;background:transparent;border:none;color:var(--text-primary, #eee);font-family:inherit;font-size:.8rem;outline:none}.flock-search__input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary, #666)}.flock-filters[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.flock-filter[_ngcontent-%COMP%]{padding:.4rem .6rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:6px;color:var(--text-secondary, #bbb);font-family:inherit;font-size:.7rem;cursor:pointer;outline:none;transition:border-color var(--transition-fast),box-shadow var(--transition-base)}.flock-filter[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan, #0ef);box-shadow:var(--glow-cyan)}.flock-filter[_ngcontent-%COMP%]   option[_ngcontent-%COMP%]{background:var(--bg-surface, #1a1a2e)}.flock-sort-toggle[_ngcontent-%COMP%]{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:6px;color:var(--text-secondary, #bbb);cursor:pointer;font-size:.85rem;transition:background .1s}.flock-sort-toggle[_ngcontent-%COMP%]:hover{background:var(--bg-hover, #2a2a3e)}.flock-cap-bar[_ngcontent-%COMP%]{display:flex;gap:.35rem;margin-bottom:1rem;flex-wrap:wrap}.flock-cap-pill[_ngcontent-%COMP%]{padding:.2rem .5rem;background:transparent;border:1px solid var(--border, #333);border-radius:12px;color:var(--text-tertiary, #666);font-family:inherit;font-size:.6rem;cursor:pointer;transition:all .1s}.flock-cap-pill[_ngcontent-%COMP%]:hover{border-color:var(--accent-magenta, #f08);color:var(--accent-magenta, #f08)}.flock-cap-pill--active[_ngcontent-%COMP%]{background:#ff00801a;border-color:var(--accent-magenta, #f08);color:var(--accent-magenta, #f08)}.flock-loading[_ngcontent-%COMP%]{padding:3rem;text-align:center;color:var(--text-tertiary, #666);font-size:.8rem}[_nghost-%COMP%]{container-type:inline-size}.flock-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.85rem}@container (max-width: 580px){.flock-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}}@container (min-width: 581px) and (max-width: 900px){.flock-grid[_ngcontent-%COMP%]{grid-template-columns:repeat(2,1fr)}}@container (min-width: 1200px){.flock-grid[_ngcontent-%COMP%]{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}}.flock-card[_ngcontent-%COMP%]{display:flex;flex-direction:column;padding:1rem;background:#0f101899;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.05);border-radius:var(--radius-xl, 16px);cursor:pointer;transition:border-color .25s,box-shadow .25s,transform .2s,background .25s;text-align:left;color:inherit;font-family:inherit;position:relative}.flock-card[_ngcontent-%COMP%]:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,#00e5ff4d,#ff00aa26,#00ff881a);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:0;transition:opacity .3s}.flock-card[_ngcontent-%COMP%]:hover{transform:translateY(-3px);box-shadow:0 8px 32px #0000004d,0 0 20px #00e5ff0f;background:#0f1018bf}.flock-card[_ngcontent-%COMP%]:hover:before{opacity:1}.flock-card[_ngcontent-%COMP%]:active{transform:translateY(-1px);transition-duration:.1s}.flock-card--selected[_ngcontent-%COMP%]{border-color:var(--accent-magenta, #f08)}.flock-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem}.flock-card__avatar[_ngcontent-%COMP%]{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--bg-raised, #222);border:2px solid var(--border, #333);font-weight:700;font-size:.85rem;color:var(--text-primary, #eee);flex-shrink:0}.flock-card__avatar[data-status=active][_ngcontent-%COMP%]{border-color:var(--accent-green, #0f0)}.flock-card__avatar[data-status=inactive][_ngcontent-%COMP%]{border-color:var(--text-tertiary, #666)}.flock-card__info[_ngcontent-%COMP%]{flex:1;min-width:0;display:flex;flex-direction:column;gap:.1rem}.flock-card__name[_ngcontent-%COMP%]{font-weight:700;font-size:.8rem;color:var(--text-primary, #eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.flock-card__status[_ngcontent-%COMP%]{font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}.flock-card__status[data-status=active][_ngcontent-%COMP%]{color:var(--accent-green, #0f0)}.flock-card__status[data-status=inactive][_ngcontent-%COMP%]{color:var(--text-tertiary, #666)}.flock-card__score[_ngcontent-%COMP%]{padding:.2rem .5rem;border-radius:6px;font-weight:700;font-size:.75rem;border:1px solid;flex-shrink:0}.flock-card__score[data-level=high][_ngcontent-%COMP%]{color:var(--accent-green, #0f0);border-color:var(--accent-green, #0f0);background:#00ff000f}.flock-card__score[data-level=mid][_ngcontent-%COMP%]{color:var(--accent-amber, #fa0);border-color:var(--accent-amber, #fa0);background:#ffaa000f}.flock-card__score[data-level=low][_ngcontent-%COMP%]{color:var(--accent-red, #f44);border-color:var(--accent-red, #f44);background:#ff44440f}.flock-card__desc[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary, #888);margin:0 0 .5rem;line-height:1.45}.flock-card__caps[_ngcontent-%COMP%]{display:flex;gap:.25rem;flex-wrap:wrap;margin-bottom:.6rem}.flock-card__cap[_ngcontent-%COMP%]{padding:.1rem .4rem;background:#ff00800f;border:1px solid rgba(255,0,128,.2);border-radius:4px;font-size:.55rem;color:var(--accent-magenta, #f08)}.flock-card__cap--more[_ngcontent-%COMP%]{background:transparent;border-style:dashed}.flock-card__metrics[_ngcontent-%COMP%]{display:flex;gap:.75rem;font-size:.6rem;color:var(--text-tertiary, #666);margin-top:auto}.flock-card__metric[_ngcontent-%COMP%]{display:flex;gap:.2rem;align-items:center}.flock-pagination[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;gap:1rem;padding:1.5rem 0}.flock-pagination__btn[_ngcontent-%COMP%]{padding:.35rem .75rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:6px;color:var(--text-secondary, #bbb);font-family:inherit;font-size:.7rem;cursor:pointer;transition:background .1s}.flock-pagination__btn[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--bg-hover, #2a2a3e)}.flock-pagination__btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:default}.flock-pagination__info[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary, #666)}.flock-detail-backdrop[_ngcontent-%COMP%]{position:fixed;inset:0;z-index:9998;background:#0009;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;justify-content:center;padding-top:8vh;animation:_ngcontent-%COMP%_fadeIn .15s ease-out}@keyframes _ngcontent-%COMP%_fadeIn{0%{opacity:0}to{opacity:1}}@keyframes _ngcontent-%COMP%_panelSlideUp{0%{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}.flock-detail[_ngcontent-%COMP%]{width:520px;max-height:80vh;background:#0f1018d9;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-xl, 16px);box-shadow:0 24px 64px #00000080,0 0 32px #00e5ff0a;overflow-y:auto;align-self:flex-start;padding:1.5rem;animation:_ngcontent-%COMP%_panelSlideUp .25s ease-out}.flock-detail__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}.flock-detail__avatar[_ngcontent-%COMP%]{width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--bg-raised, #222);border:2px solid var(--border, #333);font-weight:700;font-size:1.1rem;color:var(--text-primary, #eee);flex-shrink:0}.flock-detail__avatar[data-status=active][_ngcontent-%COMP%]{border-color:var(--accent-green, #0f0)}.flock-detail__name[_ngcontent-%COMP%]{font-size:1.1rem;font-weight:700;color:var(--text-primary, #eee);margin:0}.flock-detail__status[_ngcontent-%COMP%]{font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}.flock-detail__status[data-status=active][_ngcontent-%COMP%]{color:var(--accent-green, #0f0)}.flock-detail__status[data-status=inactive][_ngcontent-%COMP%]{color:var(--text-tertiary, #666)}.flock-detail__close[_ngcontent-%COMP%]{margin-left:auto;background:transparent;border:none;color:var(--text-tertiary, #666);font-size:1.4rem;cursor:pointer;padding:.25rem;line-height:1}.flock-detail__close[_ngcontent-%COMP%]:hover{color:var(--text-primary, #eee)}.flock-detail__desc[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary, #bbb);line-height:1.5;margin:0 0 1.25rem}.flock-detail__section[_ngcontent-%COMP%]{margin-bottom:1.25rem}.flock-detail__section-title[_ngcontent-%COMP%]{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-tertiary, #666);margin:0 0 .5rem}.flock-detail__rep[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem}.flock-detail__rep-bar[_ngcontent-%COMP%]{flex:1;height:8px;background:var(--bg-raised, #222);border-radius:4px;overflow:hidden}.flock-detail__rep-fill[_ngcontent-%COMP%]{height:100%;border-radius:4px;transition:width .3s ease}.flock-detail__rep-fill[data-level=high][_ngcontent-%COMP%]{background:var(--accent-green, #0f0)}.flock-detail__rep-fill[data-level=mid][_ngcontent-%COMP%]{background:var(--accent-amber, #fa0)}.flock-detail__rep-fill[data-level=low][_ngcontent-%COMP%]{background:var(--accent-red, #f44)}.flock-detail__rep-value[_ngcontent-%COMP%]{font-weight:700;font-size:.8rem;flex-shrink:0}.flock-detail__rep-value[data-level=high][_ngcontent-%COMP%]{color:var(--accent-green, #0f0)}.flock-detail__rep-value[data-level=mid][_ngcontent-%COMP%]{color:var(--accent-amber, #fa0)}.flock-detail__rep-value[data-level=low][_ngcontent-%COMP%]{color:var(--accent-red, #f44)}.flock-detail__metrics[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}.flock-detail__metric[_ngcontent-%COMP%]{text-align:center;padding:.6rem;background:var(--bg-raised, #222);border-radius:8px}.flock-detail__metric-value[_ngcontent-%COMP%]{display:block;font-weight:700;font-size:1rem;color:var(--text-primary, #eee)}.flock-detail__metric-label[_ngcontent-%COMP%]{display:block;font-size:.55rem;color:var(--text-tertiary, #666);text-transform:uppercase;letter-spacing:.05em;margin-top:.15rem}.flock-detail__caps[_ngcontent-%COMP%]{display:flex;gap:.35rem;flex-wrap:wrap}.flock-detail__cap[_ngcontent-%COMP%]{padding:.2rem .5rem;background:#ff008014;border:1px solid rgba(255,0,128,.25);border-radius:4px;font-size:.65rem;color:var(--accent-magenta, #f08)}.flock-detail__fields[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.flock-detail__field[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;font-size:.75rem}.flock-detail__field-label[_ngcontent-%COMP%]{color:var(--text-tertiary, #666)}.flock-detail__field-value[_ngcontent-%COMP%]{color:var(--text-secondary, #bbb)}.flock-detail__field-value--mono[_ngcontent-%COMP%]{font-family:monospace;font-size:.7rem}.flock-detail__actions[_ngcontent-%COMP%]{padding-top:.75rem;border-top:1px solid var(--border, #2a2a3e)}.flock-detail__action-btn[_ngcontent-%COMP%]{width:100%;padding:.6rem;background:#00e5ff14;border:1px solid rgba(0,229,255,.3);border-radius:8px;color:var(--accent-cyan, #0ef);font-family:inherit;font-size:.75rem;font-weight:600;cursor:pointer;transition:background .1s}.flock-detail__action-btn[_ngcontent-%COMP%]:hover{background:#00e5ff26}@media(max-width:640px){.flock-page[_ngcontent-%COMP%]{padding:1rem}.flock-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.flock-detail[_ngcontent-%COMP%]{width:calc(100vw - 2rem)}.flock-header__title-row[_ngcontent-%COMP%]{flex-direction:column;align-items:flex-start}}',
    ],
    changeDetection: 0,
  });
};

export { N as FlockDirectoryComponent };
