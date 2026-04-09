import { a as me } from './chunk-CZZRTCER.js';
import {
  o as _e,
  k as $e,
  q as Be,
  v as be,
  b as De,
  n as fe,
  m as Ge,
  d as He,
  i as Ie,
  F as J,
  N as Je,
  I as je,
  K as Ke,
  C as ke,
  c as Le,
  a as Ne,
  u as Pe,
  t as Q,
  L as Qe,
  H as qe,
  J as Se,
  y as Ue,
  j as ue,
  f as Ve,
  s as ve,
  r as We,
  x as Xe,
  w as Ye,
  h as Z,
  M as Ze,
  g as ze,
} from './chunk-KIK2QXGD.js';
import { a as pe } from './chunk-OFKXBWQC.js';
import './chunk-CSQXEU3M.js';
import { a as he } from './chunk-2EJE5M6O.js';
import { a as ge } from './chunk-FGNIWOFY.js';
import './chunk-ZSTU6MUH.js';
import './chunk-G7DVZDMF.js';
import { b as le } from './chunk-D6WCRQHB.js';
import { d as ce } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  mb as $,
  Qb as A,
  $b as ae,
  jc as B,
  ja as b,
  Na as c,
  rb as D,
  hc as de,
  Mb as F,
  Sb as Fe,
  nb as G,
  fc as H,
  Bb as h,
  Pb as I,
  ma as ie,
  ub as j,
  ic as K,
  Z as k,
  Lb as L,
  qb as l,
  ib as M,
  Ob as m,
  hb as N,
  q as ne,
  sb as O,
  Sa as oe,
  Y as P,
  pb as p,
  tb as R,
  kb as Re,
  Ab as re,
  ob as S,
  bc as se,
  vb as T,
  a as te,
  Jb as U,
  jb as w,
  Ib as X,
  zb as x,
  T as Y,
  _a as z,
} from './chunk-LF4EWAJA.js';

var at = ['feedList'],
  st = (_o, e) => e.value,
  dt = (_o, e) => e.id;
function ct(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 16),
      x('click', () => {
        P(t);
        const i = h();
        return k(i.clearThreadFilter());
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = h();
    c(), A(' thread:', t.activeThreadFilter().slice(0, 6), ' \u2715 ');
  }
}
function lt(o, e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 17),
      x('click', () => {
        const i = P(t).$implicit,
          r = h();
        return k(r.setDirectionFilter(i.value));
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = e.$implicit,
      n = h();
    F('dir-chip--active', n.directionFilter() === t.value), c(), I(t.label);
  }
}
function mt(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'div', 12)(1, 'span', 18),
      m(2),
      l(),
      p(3, 'div', 19)(4, 'button', 20),
      x('click', () => {
        P(t);
        const i = h();
        return k(i.prevPage());
      }),
      m(5, 'Previous'),
      l(),
      p(6, 'button', 20),
      x('click', () => {
        P(t);
        const i = h();
        return k(i.nextPage());
      }),
      m(7, 'Next'),
      l()()();
  }
  if (o & 2) {
    const t = h();
    c(2),
      Fe(' Showing ', t.currentOffset() + 1, '\u2013', t.showingEnd(), ' of ', t.totalMessages(), ' '),
      c(2),
      S('disabled', !t.hasPrevPage()),
      c(2),
      S('disabled', !t.hasNextPage());
  }
}
function pt(o, _e) {
  o & 1 && D(0, 'app-skeleton', 13), o & 2 && S('count', 6);
}
function gt(o, _e) {
  if ((o & 1 && D(0, 'app-empty-state', 14), o & 2)) {
    const t = h();
    S('title', t.isFiltered() ? 'No matches' : 'No messages yet')(
      'description',
      t.isFiltered() ? 'No messages match your search.' : 'Messages will appear here in real-time.',
    );
  }
}
function ht(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 33),
      x('click', (i) => {
        P(t);
        const r = h().$implicit;
        return h(2).filterByThread(r.threadId), k(i.stopPropagation());
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = h().$implicit;
    S('title', t.threadId), c(), A('thread:', t.threadId.slice(0, 6));
  }
}
function ut(o, _e) {
  if ((o & 1 && (p(0, 'span', 30), m(1), l()), o & 2)) {
    const t = h().$implicit;
    c(), A('', (t.fee / 1e6).toFixed(4), ' ALGO');
  }
}
function ft(o, _e) {
  o & 1 && (p(0, 'span', 31), D(1, 'span', 34), m(2, ' processing...'), l());
}
function _t(o, _e) {
  if ((o & 1 && (p(0, 'span', 35), m(1), l(), p(2, 'span', 36), m(3), l()), o & 2)) {
    const t = h().$implicit,
      n = h(2);
    F('feed__preview--hidden', n.expandedIds().has(t.id)),
      c(),
      I(n.previewText(t.content)),
      c(2),
      I(n.expandedIds().has(t.id) ? '\u25BE' : '\u25B8');
  }
}
function vt(o, _e) {
  if ((o & 1 && (p(0, 'pre', 32), m(1), l()), o & 2)) {
    const t = h().$implicit;
    c(), I(t.content);
  }
}
function bt(o, e) {
  if (o & 1) {
    const t = T();
    p(0, 'div', 22),
      x('click', () => {
        const i = P(t).$implicit,
          r = h(2);
        return k(i.direction !== 'agent-processing' && r.toggleExpand(i.id));
      }),
      p(1, 'div', 23)(2, 'span', 24),
      m(3),
      ae(4, 'date'),
      l(),
      p(5, 'span', 25),
      m(6),
      l(),
      p(7, 'span', 26),
      m(8),
      l(),
      p(9, 'span', 27),
      m(10, '->'),
      l(),
      p(11, 'span', 28),
      m(12),
      l(),
      M(13, ht, 2, 2, 'button', 29),
      M(14, ut, 2, 1, 'span', 30),
      M(15, ft, 3, 0, 'span', 31)(16, _t, 4, 4),
      l(),
      M(17, vt, 2, 1, 'pre', 32),
      l();
  }
  if (o & 2) {
    const t = e.$implicit,
      n = h(2);
    L('border-left-color', n.agentColor(t.colorIndex)),
      F('feed__entry--expanded', n.expandedIds().has(t.id)),
      N('data-direction', t.direction),
      c(3),
      I(se(4, 17, t.timestamp, 'HH:mm:ss')),
      c(2),
      N('data-dir', t.direction),
      c(),
      A(' ', n.directionLabel(t.direction), ' '),
      c(),
      L('color', n.agentColor(t.colorIndex)),
      c(),
      I(t.agentName),
      c(3),
      S('title', t.participant),
      c(),
      I(n.recipientFrom(t.participantLabel)),
      c(),
      w(t.threadId ? 13 : -1),
      c(),
      w(t.fee !== null && t.fee > 0 ? 14 : -1),
      c(),
      w(t.direction === 'agent-processing' ? 15 : 16),
      c(2),
      w(n.expandedIds().has(t.id) ? 17 : -1);
  }
}
function xt(o, _e) {
  if ((o & 1 && (p(0, 'div', 15, 0), $(2, bt, 18, 20, 'div', 21, dt), l()), o & 2)) {
    const t = h();
    c(2), G(t.entries());
  }
}
var xe = class o {
  wsService = Y(pe);
  agentService = Y(me);
  api = Y(le);
  feedList = B('feedList');
  rawEntries = b([]);
  directionFilter = b('all');
  directionFilters = [
    { value: 'all', label: 'All' },
    { value: 'inbound', label: 'In' },
    { value: 'outbound', label: 'Out' },
    { value: 'agent-send', label: 'Send' },
    { value: 'agent-reply', label: 'Reply' },
    { value: 'status', label: 'Status' },
  ];
  entries = H(() => {
    const e = this.directionFilter(),
      t = this.rawEntries();
    return e === 'all' ? t : t.filter((n) => n.direction === e);
  });
  expandedIds = b(new Set());
  autoScroll = b(!0);
  searchTerm = b('');
  currentOffset = b(0);
  pageSize = b(50);
  totalMessages = b(0);
  activeThreadFilter = b(null);
  isFiltered = H(() => this.searchTerm().length > 0 || this.currentOffset() > 0 || this.activeThreadFilter() !== null);
  showingEnd = H(() => Math.min(this.currentOffset() + this.pageSize(), this.totalMessages()));
  hasPrevPage = H(() => this.currentOffset() > 0);
  hasNextPage = H(() => this.currentOffset() + this.pageSize() < this.totalMessages());
  static AGENT_COLORS = ['#ff6b9d', '#00e5ff', '#ffa040', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fbbf24'];
  unsubscribeWs = null;
  nextId = 0;
  agentMap = {};
  walletToAgent = {};
  agentColorMap = {};
  nextColorIndex = 0;
  loading = b(!0);
  seenMessageKeys = new Set();
  searchDebounceTimer = null;
  async ngOnInit() {
    await this.agentService.loadAgents();
    for (const e of this.agentService.agents())
      (this.agentMap[e.id] = e), e.walletAddress && (this.walletToAgent[e.walletAddress] = e);
    try {
      await this.loadHistory();
    } finally {
      this.loading.set(!1);
    }
    this.unsubscribeWs = this.wsService.onMessage((e) => {
      if (!this.isFiltered()) {
        if (e.type === 'algochat_message') {
          if (this.walletToAgent[e.participant]) return;
          const t = this.labelForAddress(e.participant),
            i = this.findAgentForParticipant(e.participant)?.name ?? 'Agent';
          e.direction === 'inbound'
            ? this.addEntry({
                direction: 'inbound',
                participant: e.participant,
                participantLabel: `${t} \u2192 ${i}`,
                content: e.content,
                agentName: t,
                fee: null,
                threadId: null,
                colorIndex: this.colorIndexForAgent(t),
              })
            : e.direction === 'outbound'
              ? this.addEntry({
                  direction: 'outbound',
                  participant: e.participant,
                  participantLabel: `${i} \u2192 ${t}`,
                  content: e.content,
                  agentName: i,
                  fee: null,
                  threadId: null,
                  colorIndex: this.colorIndexForAgent(i),
                })
              : this.addEntry({
                  direction: 'status',
                  participant: e.participant,
                  participantLabel: i,
                  content: e.content,
                  agentName: i,
                  fee: null,
                  threadId: null,
                  colorIndex: this.colorIndexForAgent(i),
                });
        }
        if (e.type === 'agent_message_update') {
          const t = e.message,
            n = this.agentMap[t.fromAgentId]?.name ?? t.fromAgentId.slice(0, 8),
            i = this.agentMap[t.toAgentId]?.name ?? t.toAgentId.slice(0, 8),
            r = `${t.id}:${t.status}`;
          if (this.seenMessageKeys.has(r)) return;
          this.seenMessageKeys.add(r),
            t.status === 'sent' &&
              this.addEntry({
                direction: 'agent-send',
                participant: `${n} \u2192 ${i}`,
                participantLabel: `${n} \u2192 ${i}`,
                content: t.content,
                agentName: n,
                fee: t.paymentMicro > 0 ? t.paymentMicro : null,
                threadId: t.threadId ?? null,
                colorIndex: this.colorIndexForAgent(n),
              }),
            t.status === 'processing' &&
              (this.removeEntriesByMessageId(t.id),
              this.addEntry({
                direction: 'agent-processing',
                participant: `${i}`,
                participantLabel: `${n} \u2192 ${i}`,
                content: t.content,
                agentName: i,
                fee: null,
                threadId: t.threadId ?? null,
                colorIndex: this.colorIndexForAgent(i),
                messageId: t.id,
              })),
            t.status === 'completed' &&
              t.response &&
              (this.removeEntriesByMessageId(t.id),
              this.addEntry({
                direction: 'agent-reply',
                participant: `${i} \u2192 ${n}`,
                participantLabel: `${i} \u2192 ${n}`,
                content: t.response,
                agentName: i,
                fee: null,
                threadId: t.threadId ?? null,
                colorIndex: this.colorIndexForAgent(i),
              })),
            t.status === 'failed' &&
              (this.removeEntriesByMessageId(t.id),
              this.addEntry({
                direction: 'status',
                participant: `${n} \u2192 ${i}`,
                participantLabel: `${n} \u2192 ${i}`,
                content: `Message failed: ${t.content.slice(0, 80)}`,
                agentName: n,
                fee: null,
                threadId: t.threadId ?? null,
                colorIndex: this.colorIndexForAgent(n),
              }));
        }
      }
    });
  }
  ngOnDestroy() {
    this.unsubscribeWs?.(), this.searchDebounceTimer && clearTimeout(this.searchDebounceTimer);
  }
  agentColor(e) {
    return o.AGENT_COLORS[e % o.AGENT_COLORS.length];
  }
  directionLabel(e) {
    switch (e) {
      case 'inbound':
        return 'IN';
      case 'outbound':
        return 'OUT';
      case 'agent-send':
        return 'SEND';
      case 'agent-reply':
        return 'REPLY';
      case 'agent-processing':
        return 'WORKING';
      case 'status':
        return 'STATUS';
      default:
        return 'A2A';
    }
  }
  recipientFrom(e) {
    const t = e.split(' \u2192 ');
    return t.length > 1 ? t[1] : e;
  }
  previewText(e) {
    const t = e.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 120 ? `${t.slice(0, 120)}...` : t;
  }
  toggleExpand(e) {
    this.expandedIds.update((t) => {
      const n = new Set(t);
      return n.has(e) ? n.delete(e) : n.add(e), n;
    });
  }
  collapseAll() {
    this.expandedIds.set(new Set());
  }
  colorIndexForAgent(e) {
    return e in this.agentColorMap || (this.agentColorMap[e] = this.nextColorIndex++), this.agentColorMap[e];
  }
  toggleAutoScroll() {
    this.autoScroll.update((e) => !e);
  }
  setDirectionFilter(e) {
    this.directionFilter.set(e);
  }
  onExportFeed() {
    const e = this.entries().map(
        (r) => `[${r.timestamp.toISOString()}] [${r.direction.toUpperCase()}] ${r.participantLabel}: ${r.content}`,
      ),
      t = new Blob(
        [
          e.join(`
`),
        ],
        { type: 'text/plain' },
      ),
      n = URL.createObjectURL(t),
      i = document.createElement('a');
    (i.href = n),
      (i.download = `feed-export-${new Date().toISOString().slice(0, 10)}.txt`),
      i.click(),
      URL.revokeObjectURL(n);
  }
  onClear() {
    confirm('Clear all feed messages? This cannot be undone.') &&
      (this.rawEntries.set([]),
      this.expandedIds.set(new Set()),
      this.seenMessageKeys.clear(),
      this.searchTerm.set(''),
      this.currentOffset.set(0),
      this.activeThreadFilter.set(null));
  }
  onSearchInput(e) {
    const t = e.target.value;
    this.searchDebounceTimer && clearTimeout(this.searchDebounceTimer),
      (this.searchDebounceTimer = setTimeout(() => {
        this.searchTerm.set(t), this.currentOffset.set(0), this.loadHistory();
      }, 300));
  }
  filterByThread(e) {
    this.activeThreadFilter.set(e), this.currentOffset.set(0), this.loadHistory();
  }
  clearThreadFilter() {
    this.activeThreadFilter.set(null), this.currentOffset.set(0), this.loadHistory();
  }
  nextPage() {
    this.currentOffset.update((e) => e + this.pageSize()), this.loadHistory();
  }
  prevPage() {
    this.currentOffset.update((e) => Math.max(0, e - this.pageSize())), this.loadHistory();
  }
  async loadHistory() {
    try {
      const e = new URLSearchParams({ limit: String(this.pageSize()), offset: String(this.currentOffset()) }),
        t = this.searchTerm();
      t && e.set('search', t);
      const n = this.activeThreadFilter();
      n && e.set('threadId', n);
      const i = await ne(this.api.get(`/feed/history?${e}`));
      this.totalMessages.set(i.total + (i.algochatTotal ?? 0)), (this.nextId = 0), this.seenMessageKeys.clear();
      const r = [];
      for (const a of [...i.messages].reverse()) {
        const s = this.agentMap[a.fromAgentId]?.name ?? a.fromAgentId.slice(0, 8),
          d = this.agentMap[a.toAgentId]?.name ?? a.toAgentId.slice(0, 8);
        r.push({
          id: this.nextId++,
          timestamp: a.createdAt ? new Date(`${a.createdAt}Z`) : new Date(),
          direction: 'agent-send',
          participant: `${s} \u2192 ${d}`,
          participantLabel: `${s} \u2192 ${d}`,
          content: a.content,
          agentName: s,
          fee: a.paymentMicro > 0 ? a.paymentMicro : null,
          threadId: a.threadId ?? null,
          colorIndex: this.colorIndexForAgent(s),
        }),
          a.status === 'completed' &&
            a.response &&
            r.push({
              id: this.nextId++,
              timestamp: a.completedAt ? new Date(`${a.completedAt}Z`) : new Date(),
              direction: 'agent-reply',
              participant: `${d} \u2192 ${s}`,
              participantLabel: `${d} \u2192 ${s}`,
              content: a.response,
              agentName: d,
              fee: null,
              threadId: a.threadId ?? null,
              colorIndex: this.colorIndexForAgent(d),
            });
      }
      for (const a of [...(i.algochatMessages ?? [])].reverse()) {
        if (this.walletToAgent[a.participant]) continue;
        const s = this.labelForAddress(a.participant),
          g = this.findAgentForParticipant(a.participant)?.name ?? 'Agent';
        a.direction === 'inbound'
          ? r.push({
              id: this.nextId++,
              timestamp: a.createdAt ? new Date(`${a.createdAt}Z`) : new Date(),
              direction: 'inbound',
              participant: a.participant,
              participantLabel: `${s} \u2192 ${g}`,
              content: a.content,
              agentName: s,
              fee: a.fee > 0 ? a.fee : null,
              threadId: null,
              colorIndex: this.colorIndexForAgent(s),
            })
          : a.direction === 'outbound'
            ? r.push({
                id: this.nextId++,
                timestamp: a.createdAt ? new Date(`${a.createdAt}Z`) : new Date(),
                direction: 'outbound',
                participant: a.participant,
                participantLabel: `${g} \u2192 ${s}`,
                content: a.content,
                agentName: g,
                fee: a.fee > 0 ? a.fee : null,
                threadId: null,
                colorIndex: this.colorIndexForAgent(g),
              })
            : r.push({
                id: this.nextId++,
                timestamp: a.createdAt ? new Date(`${a.createdAt}Z`) : new Date(),
                direction: 'status',
                participant: a.participant,
                participantLabel: g,
                content: a.content,
                agentName: g,
                fee: null,
                threadId: null,
                colorIndex: this.colorIndexForAgent(g),
              });
      }
      r.sort((a, s) => s.timestamp.getTime() - a.timestamp.getTime()), (this.nextId = 0);
      for (const a of r) a.id = this.nextId++;
      this.rawEntries.set(r);
    } catch {}
  }
  addEntry(e, t) {
    const n = te({ id: this.nextId++, timestamp: t ?? new Date() }, e);
    this.rawEntries.update((i) => [n, ...i]),
      this.autoScroll() &&
        requestAnimationFrame(() => {
          const i = this.feedList()?.nativeElement;
          i && (i.scrollTop = 0);
        });
  }
  labelForAddress(e) {
    const t = this.walletToAgent[e];
    return t ? t.name : e === 'local' ? 'Local UI' : `${e.slice(0, 8)}...${e.slice(-4)}`;
  }
  removeEntriesByMessageId(e) {
    this.rawEntries.update((t) => t.filter((n) => n.messageId !== e));
  }
  findAgentForParticipant(_e) {
    const t = this.agentService.agents();
    return t.find((n) => n.algochatEnabled) ?? t[0] ?? null;
  }
  agentNameForAddress(e) {
    return this.walletToAgent[e]?.name ?? null;
  }
  static \u0275fac = (t) => new (t || o)();
  static \u0275cmp = z({
    type: o,
    selectors: [['app-live-feed']],
    viewQuery: (t, n) => {
      t & 1 && X(n.feedList, at, 5), t & 2 && U();
    },
    decls: 25,
    vars: 6,
    consts: [
      ['feedList', ''],
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page__actions'],
      [1, 'feed__count'],
      [1, 'btn', 'btn--secondary', 3, 'click'],
      [1, 'btn', 'btn--danger', 3, 'click'],
      [1, 'feed__toolbar'],
      [
        'type',
        'search',
        'placeholder',
        'Search messages...',
        'aria-label',
        'Search messages',
        1,
        'feed__search',
        3,
        'input',
        'value',
      ],
      [1, 'btn', 'btn--filter'],
      [1, 'feed__direction-filters'],
      [1, 'dir-chip', 3, 'dir-chip--active'],
      [1, 'feed__pagination'],
      ['variant', 'table', 3, 'count'],
      ['icon', '[ ]', 3, 'title', 'description'],
      [1, 'feed__list'],
      [1, 'btn', 'btn--filter', 3, 'click'],
      [1, 'dir-chip', 3, 'click'],
      [1, 'feed__page-info'],
      [1, 'feed__page-controls'],
      [1, 'btn', 'btn--secondary', 3, 'click', 'disabled'],
      [1, 'feed__entry', 3, 'feed__entry--expanded', 'border-left-color'],
      [1, 'feed__entry', 3, 'click'],
      [1, 'feed__meta'],
      [1, 'feed__time'],
      [1, 'feed__direction'],
      [1, 'feed__sender'],
      [1, 'feed__arrow'],
      [1, 'feed__participant', 3, 'title'],
      [1, 'feed__thread', 3, 'title'],
      [1, 'feed__fee'],
      [1, 'feed__processing-indicator'],
      [1, 'feed__content'],
      [1, 'feed__thread', 3, 'click', 'title'],
      [1, 'feed__processing-dot'],
      [1, 'feed__preview'],
      [1, 'feed__toggle'],
    ],
    template: (t, n) => {
      t & 1 &&
        (p(0, 'div', 1)(1, 'div', 2)(2, 'h2'),
        m(3, 'Feed'),
        l(),
        p(4, 'div', 3)(5, 'span', 4),
        m(6),
        l(),
        p(7, 'button', 5),
        x('click', () => n.toggleAutoScroll()),
        m(8),
        l(),
        p(9, 'button', 5),
        x('click', () => n.collapseAll()),
        m(10, 'Collapse all'),
        l(),
        p(11, 'button', 6),
        x('click', () => n.onClear()),
        m(12, 'Clear'),
        l()()(),
        p(13, 'div', 7)(14, 'input', 8),
        x('input', (r) => n.onSearchInput(r)),
        l(),
        M(15, ct, 2, 1, 'button', 9),
        p(16, 'button', 5),
        x('click', () => n.onExportFeed()),
        m(17, 'Export'),
        l()(),
        p(18, 'div', 10),
        $(19, lt, 2, 3, 'button', 11, st),
        l(),
        M(21, mt, 8, 5, 'div', 12),
        M(22, pt, 1, 1, 'app-skeleton', 13)(23, gt, 1, 2, 'app-empty-state', 14)(24, xt, 4, 0, 'div', 15),
        l()),
        t & 2 &&
          (c(6),
          A('', n.totalMessages(), ' messages'),
          c(2),
          A(' Auto-scroll: ', n.autoScroll() ? 'ON' : 'OFF', ' '),
          c(6),
          S('value', n.searchTerm()),
          c(),
          w(n.activeThreadFilter() ? 15 : -1),
          c(4),
          G(n.directionFilters),
          c(2),
          w(n.isFiltered() ? 21 : -1),
          c(),
          w(n.loading() ? 22 : n.entries().length === 0 ? 23 : 24));
    },
    dependencies: [he, ge, ce],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem;height:100%;display:flex;flex-direction:column}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-shrink:0}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__actions[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem}.feed__count[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em}.btn[_ngcontent-%COMP%]{padding:.4rem .75rem;border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--text-primary)}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red);border-color:var(--accent-red)}.btn--danger[_ngcontent-%COMP%]:hover{background:var(--accent-red-dim)}.feed__toolbar[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-shrink:0}.feed__search[_ngcontent-%COMP%]{flex:1;padding:.4rem .75rem;font-size:.8rem;font-family:inherit;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-bright);border-radius:var(--radius);outline:none}.feed__search[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan)}.feed__search[_ngcontent-%COMP%]::placeholder{color:var(--text-secondary);opacity:.6}.btn--filter[_ngcontent-%COMP%]{background:#ffd7001a;color:var(--accent-yellow, #ffd700);border:1px solid rgba(255,215,0,.3);padding:.3rem .6rem;border-radius:var(--radius);font-size:.7rem;font-family:var(--font-mono, monospace);cursor:pointer}.btn--filter[_ngcontent-%COMP%]:hover{background:#ffd70033}.feed__pagination[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-shrink:0}.feed__page-info[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.feed__page-controls[_ngcontent-%COMP%]{display:flex;gap:.5rem}.feed__direction-filters[_ngcontent-%COMP%]{display:flex;gap:.25rem;margin-bottom:.75rem;flex-shrink:0}.dir-chip[_ngcontent-%COMP%]{padding:.25rem .55rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:20px;color:var(--text-tertiary);font-size:.65rem;font-family:inherit;cursor:pointer;text-transform:uppercase;transition:all .15s}.dir-chip[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-secondary)}.dir-chip--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.feed__list[_ngcontent-%COMP%]{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin;scrollbar-color:var(--border-bright) transparent}.feed__entry[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.35rem .75rem;font-size:.8rem;border-left:3px solid var(--border);cursor:pointer;transition:background .1s}.feed__entry[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.feed__entry--expanded[_ngcontent-%COMP%], .feed__entry--expanded[_ngcontent-%COMP%]:hover{background:var(--bg-raised)}.feed__entry[data-direction=inbound][_ngcontent-%COMP%]{border-left-color:var(--accent-cyan)}.feed__entry[data-direction=outbound][_ngcontent-%COMP%]{border-left-color:var(--accent-green)}.feed__entry[data-direction=agent-processing][_ngcontent-%COMP%]{border-left-color:#ffa040;background:#ffa0400a}.feed__entry[data-direction=status][_ngcontent-%COMP%]{border-left-color:var(--accent-amber);opacity:.8}.feed__meta[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.4rem;flex-wrap:nowrap;overflow:hidden}.feed__time[_ngcontent-%COMP%]{font-family:var(--font-mono, monospace);font-size:.7rem;color:var(--text-secondary);opacity:.7;flex-shrink:0}.feed__direction[_ngcontent-%COMP%]{font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:var(--radius-sm);text-transform:uppercase;letter-spacing:.08em;flex-shrink:0}.feed__direction[data-dir=inbound][_ngcontent-%COMP%]{color:var(--accent-cyan);background:#00e5ff14;border:1px solid rgba(0,229,255,.2)}.feed__direction[data-dir=outbound][_ngcontent-%COMP%]{color:var(--accent-green);background:#00ff8814;border:1px solid rgba(0,255,136,.2)}.feed__direction[data-dir=agent-send][_ngcontent-%COMP%]{color:#ffa040;background:#ffa04014;border:1px solid rgba(255,160,64,.25)}.feed__direction[data-dir=agent-reply][_ngcontent-%COMP%]{color:#60c0ff;background:#60c0ff14;border:1px solid rgba(96,192,255,.25)}.feed__direction[data-dir=agent-processing][_ngcontent-%COMP%]{color:#ffa040;background:#ffa04014;border:1px solid rgba(255,160,64,.25);animation:_ngcontent-%COMP%_pulse-bg 2s ease-in-out infinite}@keyframes _ngcontent-%COMP%_pulse-bg{0%,to{opacity:.7}50%{opacity:1}}.feed__direction[data-dir=status][_ngcontent-%COMP%]{color:var(--accent-amber);background:#ffaa0014;border:1px solid rgba(255,170,0,.2)}.feed__sender[_ngcontent-%COMP%]{font-weight:700;font-size:.8rem;flex-shrink:0}.feed__arrow[_ngcontent-%COMP%]{color:var(--text-secondary);opacity:.4;font-size:.7rem;flex-shrink:0}.feed__participant[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);font-weight:500;flex-shrink:0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feed__thread[_ngcontent-%COMP%]{font-size:.65rem;font-family:var(--font-mono, monospace);color:var(--accent-yellow, #ffd700);background:#ffd70014;border:1px solid rgba(255,215,0,.2);padding:1px 5px;border-radius:var(--radius-sm);cursor:pointer;flex-shrink:0}.feed__fee[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-green);font-weight:600;flex-shrink:0}.feed__preview[_ngcontent-%COMP%]{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-tertiary);font-size:.75rem;margin-left:.25rem}.feed__preview--hidden[_ngcontent-%COMP%]{display:none}.feed__toggle[_ngcontent-%COMP%]{flex-shrink:0;color:var(--text-tertiary);font-size:.7rem;margin-left:auto;-webkit-user-select:none;user-select:none}.feed__content[_ngcontent-%COMP%]{margin:.4rem 0 0;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);font-size:.78rem;line-height:1.5;max-height:600px;overflow-y:auto;padding:.5rem;background:var(--bg-deep);border-radius:var(--radius-sm);border:1px solid var(--border)}.feed__processing-indicator[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:#ffa040;font-style:italic;margin-left:.25rem}.feed__processing-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;background:#ffa040;animation:_ngcontent-%COMP%_processing-pulse 1.5s ease-in-out infinite}@keyframes _ngcontent-%COMP%_processing-pulse{0%,to{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}',
    ],
    changeDetection: 0,
  });
};
var yt = ['canvas'],
  Ct = ['container'];
function Mt(o, _e) {
  if (o & 1) {
    const t = T();
    O(0, 'div', 3),
      j(1, 'span', 4),
      m(2),
      O(3, 'button', 5),
      re('click', () => {
        P(t);
        const i = h();
        return k(i.clearSelection());
      }),
      m(4, 'x'),
      R()();
  }
  if (o & 2) {
    const t = h();
    c(), L('background', t.selectedAgent().color), c(), A(' ', t.selectedAgent().name, ' ');
  }
}
var Me = class o {
  agents = K.required();
  messages = K.required();
  agentSelected = de();
  canvasRef = B.required('canvas');
  containerRef = B.required('container');
  selectedAgent = b(null);
  ctx = null;
  animId = 0;
  resizeObserver = null;
  width = 0;
  height = 0;
  dpr = 1;
  nodes = [];
  nodeMap = new Map();
  edges = [];
  edgeMap = new Map();
  particles = [];
  stars = [];
  impacts = [];
  hoveredNodeId = null;
  selectedNodeId = null;
  lastProcessedMsgCount = 0;
  mouseX = -1;
  mouseY = -1;
  onMouseMove = (e) => this.handleMouseMove(e);
  onClick = (e) => this.handleClick(e);
  constructor() {
    oe(() => {
      this.setupCanvas(), this.startAnimation();
    }),
      ie(() => {
        const e = this.agents(),
          t = this.messages();
        this.rebuildGraph(e, t);
      });
  }
  ngOnDestroy() {
    cancelAnimationFrame(this.animId), this.resizeObserver?.disconnect();
    const e = this.canvasRef()?.nativeElement;
    e &&
      (e.removeEventListener('mousemove', this.onMouseMove),
      e.removeEventListener('click', this.onClick),
      e.removeEventListener('mouseleave', this.handleMouseLeave));
  }
  clearSelection() {
    (this.selectedNodeId = null), this.selectedAgent.set(null), this.agentSelected.emit('');
  }
  setupCanvas() {
    const e = this.canvasRef().nativeElement,
      t = this.containerRef().nativeElement;
    (this.ctx = e.getContext('2d')),
      (this.dpr = window.devicePixelRatio || 1),
      this.resizeCanvas(t.clientWidth, t.clientHeight),
      (this.resizeObserver = new ResizeObserver((n) => {
        const i = n[0]?.contentRect;
        i && this.resizeCanvas(i.width, i.height);
      })),
      this.resizeObserver.observe(t),
      e.addEventListener('mousemove', this.onMouseMove),
      e.addEventListener('click', this.onClick),
      e.addEventListener('mouseleave', this.handleMouseLeave),
      this.initStars();
  }
  resizeCanvas(e, t) {
    (this.width = e), (this.height = t);
    const n = this.canvasRef().nativeElement;
    (n.width = e * this.dpr),
      (n.height = t * this.dpr),
      (n.style.width = `${e}px`),
      (n.style.height = `${t}px`),
      this.ctx?.scale(this.dpr, this.dpr),
      this.layoutNodes(),
      this.initStars();
  }
  initStars() {
    const e = Math.min(Math.floor((this.width * this.height) / 3e3), 200);
    this.stars = [];
    for (let t = 0; t < e; t++)
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 1.5 + 0.3,
        baseOpacity: Math.random() * 0.4 + 0.1,
        twinkleSpeed: Math.random() * 0.002 + 0.001,
        phase: Math.random() * Math.PI * 2,
      });
  }
  rebuildGraph(e, t) {
    this.nodeMap.clear();
    for (const n of e) {
      const i = this.nodes.find((a) => a.id === n.id),
        r = {
          id: n.id,
          name: n.name,
          color: n.color || '#00e5ff',
          x: i?.x ?? 0,
          y: i?.y ?? 0,
          radius: 18,
          msgCount: 0,
          lastActive: 0,
          pulsePhase: i?.pulsePhase ?? Math.random() * Math.PI * 2,
        };
      this.nodeMap.set(n.id, r);
    }
    this.edgeMap.clear();
    for (const n of t) {
      const i = [n.fromAgentId, n.toAgentId].sort().join('::'),
        r = this.edgeMap.get(i) ?? { fromId: n.fromAgentId, toId: n.toAgentId, count: 0, lastActive: 0 };
      r.count++, (r.lastActive = Math.max(r.lastActive, n.timestamp)), this.edgeMap.set(i, r);
      const a = this.nodeMap.get(n.fromAgentId),
        s = this.nodeMap.get(n.toAgentId);
      a && (a.msgCount++, (a.lastActive = Math.max(a.lastActive, n.timestamp))),
        s && (s.msgCount++, (s.lastActive = Math.max(s.lastActive, n.timestamp)));
    }
    if (
      ((this.nodes = Array.from(this.nodeMap.values())),
      (this.edges = Array.from(this.edgeMap.values())),
      this.layoutNodes(),
      t.length > this.lastProcessedMsgCount)
    ) {
      const n = t.slice(this.lastProcessedMsgCount);
      for (const i of n) this.spawnParticle(i);
      this.lastProcessedMsgCount = t.length;
    }
  }
  layoutNodes() {
    if (this.nodes.length === 0 || this.width === 0) return;
    const e = this.width / 2,
      t = this.height / 2,
      i = Math.min(e, t) - 60;
    if (this.nodes.length === 1) {
      (this.nodes[0].x = e), (this.nodes[0].y = t);
      return;
    }
    const r = (Math.PI * 2) / this.nodes.length,
      a = -Math.PI / 2;
    for (let d = 0; d < this.nodes.length; d++) {
      const g = a + d * r;
      (this.nodes[d].x = e + Math.cos(g) * i), (this.nodes[d].y = t + Math.sin(g) * i);
    }
    const s = Math.max(1, ...this.nodes.map((d) => d.msgCount));
    for (const d of this.nodes) d.radius = 14 + (d.msgCount / s) * 14;
  }
  spawnParticle(e) {
    if (this.particles.length > 50) return;
    const t = this.nodeMap.get(e.fromAgentId);
    if (!t) return;
    const n = e.status === 'failed' ? '#ff4444' : e.status === 'processing' ? '#ffa040' : t.color;
    this.particles.push({
      fromId: e.fromAgentId,
      toId: e.toAgentId,
      progress: 0,
      speed: e.status === 'processing' ? 0.005 : 0.012 + Math.random() * 0.008,
      color: n,
      size: 3 + Math.random() * 2,
      opacity: 1,
    });
  }
  startAnimation() {
    const e = (t) => {
      (this.animId = requestAnimationFrame(e)), this.render(t);
    };
    this.animId = requestAnimationFrame(e);
  }
  render(e) {
    const t = this.ctx;
    t &&
      (t.save(),
      t.setTransform(this.dpr, 0, 0, this.dpr, 0, 0),
      (t.fillStyle = '#0a0a0f'),
      t.fillRect(0, 0, this.width, this.height),
      this.renderStars(t, e),
      this.renderEdges(t, e),
      this.updateAndRenderParticles(t),
      this.updateAndRenderImpacts(t),
      this.renderNodes(t, e),
      t.restore());
  }
  renderStars(e, t) {
    for (const n of this.stars) {
      const i = Math.sin(t * n.twinkleSpeed + n.phase),
        r = n.baseOpacity + i * 0.15;
      (e.fillStyle = `rgba(180, 200, 255, ${Math.max(0, r)})`),
        e.beginPath(),
        e.arc(n.x, n.y, n.size, 0, Math.PI * 2),
        e.fill();
    }
  }
  renderEdges(e, t) {
    const n = Math.max(1, ...this.edges.map((i) => i.count));
    for (const i of this.edges) {
      const r = this.nodeMap.get(i.fromId),
        a = this.nodeMap.get(i.toId);
      if (!r || !a) continue;
      const s = this.selectedNodeId === i.fromId || this.selectedNodeId === i.toId,
        d = this.hoveredNodeId === i.fromId || this.hoveredNodeId === i.toId,
        g = 0.06 + (i.count / n) * 0.14,
        v = s ? 0.4 : d ? 0.25 : g,
        f = (r.x + a.x) / 2,
        u = (r.y + a.y) / 2,
        _ = a.x - r.x,
        E = -(a.y - r.y) * 0.05,
        C = _ * 0.05;
      (e.strokeStyle = `rgba(100, 140, 200, ${v})`),
        (e.lineWidth = 1 + (i.count / n) * 1.5),
        e.beginPath(),
        e.moveTo(r.x, r.y),
        e.quadraticCurveTo(f + E, u + C, a.x, a.y),
        e.stroke();
      const W = Date.now() - i.lastActive;
      if (W < 3e4) {
        const V = Math.max(0, 0.3 - W / 1e5);
        (e.strokeStyle = `rgba(0, 229, 255, ${V})`),
          (e.lineWidth = 1),
          e.setLineDash([4, 8]),
          (e.lineDashOffset = -(t * 0.03) % 12),
          e.beginPath(),
          e.moveTo(r.x, r.y),
          e.quadraticCurveTo(f + E, u + C, a.x, a.y),
          e.stroke(),
          e.setLineDash([]);
      }
    }
  }
  updateAndRenderParticles(e) {
    const t = [];
    for (const n of this.particles) {
      if (((n.progress += n.speed), n.progress >= 1)) {
        const C = this.nodeMap.get(n.toId);
        C &&
          this.impacts.push({
            x: C.x,
            y: C.y,
            color: n.color,
            radius: C.radius,
            maxRadius: C.radius + 20,
            opacity: 0.6,
          });
        continue;
      }
      t.push(n);
      const i = this.nodeMap.get(n.fromId),
        r = this.nodeMap.get(n.toId);
      if (!i || !r) continue;
      const a = (i.x + r.x) / 2,
        s = (i.y + r.y) / 2,
        d = r.x - i.x,
        g = r.y - i.y,
        v = a - g * 0.05,
        f = s + d * 0.05,
        u = n.progress,
        _ = (1 - u) * (1 - u) * i.x + 2 * (1 - u) * u * v + u * u * r.x,
        y = (1 - u) * (1 - u) * i.y + 2 * (1 - u) * u * f + u * u * r.y,
        E = e.createRadialGradient(_, y, 0, _, y, n.size * 3);
      E.addColorStop(0, n.color + q(n.opacity * 0.6)),
        E.addColorStop(1, `${n.color}00`),
        (e.fillStyle = E),
        e.beginPath(),
        e.arc(_, y, n.size * 3, 0, Math.PI * 2),
        e.fill(),
        (e.fillStyle = n.color + q(n.opacity)),
        e.beginPath(),
        e.arc(_, y, n.size, 0, Math.PI * 2),
        e.fill();
    }
    this.particles = t;
  }
  updateAndRenderImpacts(e) {
    const t = [];
    for (const n of this.impacts)
      (n.radius += 1.5),
        (n.opacity -= 0.02),
        !(n.opacity <= 0) &&
          (t.push(n),
          (e.strokeStyle = n.color + q(n.opacity)),
          (e.lineWidth = 1.5),
          e.beginPath(),
          e.arc(n.x, n.y, n.radius, 0, Math.PI * 2),
          e.stroke());
    this.impacts = t;
  }
  renderNodes(e, t) {
    const n = Date.now();
    for (const i of this.nodes) {
      const r = this.hoveredNodeId === i.id,
        a = this.selectedNodeId === i.id,
        s = n - i.lastActive < 1e4,
        d = r ? i.radius * 1.15 : i.radius,
        g = d * 2.5,
        v = a ? 0.25 : r ? 0.18 : s ? 0.1 : 0.04,
        f = e.createRadialGradient(i.x, i.y, d * 0.5, i.x, i.y, g);
      if (
        (f.addColorStop(0, i.color + q(v)),
        f.addColorStop(1, `${i.color}00`),
        (e.fillStyle = f),
        e.beginPath(),
        e.arc(i.x, i.y, g, 0, Math.PI * 2),
        e.fill(),
        s)
      ) {
        const _ = ((t * 0.001 + i.pulsePhase) % 2) / 2,
          y = d + _ * 20,
          E = Math.max(0, 0.3 * (1 - _));
        (e.strokeStyle = i.color + q(E)),
          (e.lineWidth = 1),
          e.beginPath(),
          e.arc(i.x, i.y, y, 0, Math.PI * 2),
          e.stroke();
      }
      const u = e.createRadialGradient(i.x - d * 0.3, i.y - d * 0.3, 0, i.x, i.y, d);
      if (
        (u.addColorStop(0, wt(i.color, 30)),
        u.addColorStop(0.7, i.color),
        u.addColorStop(1, Et(i.color, 30)),
        (e.fillStyle = u),
        e.beginPath(),
        e.arc(i.x, i.y, d, 0, Math.PI * 2),
        e.fill(),
        (e.strokeStyle = a ? `#ffffff${q(0.7)}` : i.color + q(r ? 0.6 : 0.3)),
        (e.lineWidth = a ? 2 : 1),
        e.beginPath(),
        e.arc(i.x, i.y, d, 0, Math.PI * 2),
        e.stroke(),
        (e.fillStyle = a || r ? '#ffffff' : 'rgba(200, 210, 230, 0.8)'),
        (e.font = '600 10px system-ui, sans-serif'),
        (e.textAlign = 'center'),
        (e.textBaseline = 'top'),
        e.fillText(i.name, i.x, i.y + d + 6),
        i.msgCount > 0)
      ) {
        const _ = `${i.msgCount}`;
        e.font = '600 8px system-ui, sans-serif';
        const y = e.measureText(_).width + 6,
          E = i.x + d * 0.6,
          C = i.y - d * 0.8;
        (e.fillStyle = 'rgba(10, 10, 15, 0.8)'),
          At(e, E - y / 2, C - 6, y, 12, 6),
          e.fill(),
          (e.fillStyle = i.color),
          (e.textAlign = 'center'),
          (e.textBaseline = 'middle'),
          e.fillText(_, E, C);
      }
    }
  }
  handleMouseMove(e) {
    const t = this.canvasRef().nativeElement.getBoundingClientRect();
    (this.mouseX = e.clientX - t.left), (this.mouseY = e.clientY - t.top);
    const n = this.hitTest(this.mouseX, this.mouseY);
    (this.hoveredNodeId = n?.id ?? null), (this.canvasRef().nativeElement.style.cursor = n ? 'pointer' : 'default');
  }
  handleMouseLeave = () => {
    (this.hoveredNodeId = null),
      (this.mouseX = -1),
      (this.mouseY = -1),
      (this.canvasRef().nativeElement.style.cursor = 'default');
  };
  handleClick(e) {
    const t = this.canvasRef().nativeElement.getBoundingClientRect(),
      n = e.clientX - t.left,
      i = e.clientY - t.top,
      r = this.hitTest(n, i);
    r
      ? this.selectedNodeId === r.id
        ? this.clearSelection()
        : ((this.selectedNodeId = r.id),
          this.selectedAgent.set({ id: r.id, name: r.name, color: r.color }),
          this.agentSelected.emit(r.id))
      : this.clearSelection();
  }
  hitTest(e, t) {
    for (let n = this.nodes.length - 1; n >= 0; n--) {
      const i = this.nodes[n],
        r = e - i.x,
        a = t - i.y,
        s = i.radius + 8;
      if (r * r + a * a <= s * s) return i;
    }
    return null;
  }
  static \u0275fac = (t) => new (t || o)();
  static \u0275cmp = z({
    type: o,
    selectors: [['app-agent-network-vis']],
    viewQuery: (t, n) => {
      t & 1 && X(n.canvasRef, yt, 5)(n.containerRef, Ct, 5), t & 2 && U(2);
    },
    inputs: { agents: [1, 'agents'], messages: [1, 'messages'] },
    outputs: { agentSelected: 'agentSelected' },
    decls: 5,
    vars: 1,
    consts: [
      ['container', ''],
      ['canvas', ''],
      [1, 'network-vis'],
      [1, 'network-vis__selected'],
      [1, 'network-vis__selected-dot'],
      [1, 'network-vis__clear', 3, 'click'],
    ],
    template: (t, n) => {
      t & 1 && (O(0, 'div', 2, 0), j(2, 'canvas', null, 1), M(4, Mt, 5, 3, 'div', 3), R()),
        t & 2 && (c(4), w(n.selectedAgent() ? 4 : -1));
    },
    styles: [
      '.network-vis[_ngcontent-%COMP%]{position:relative;width:100%;height:100%;min-height:300px;background:var(--bg-deep, #0a0a0f);border-radius:var(--radius, 6px);border:1px solid var(--border, #1a1a2e);overflow:hidden}canvas[_ngcontent-%COMP%]{display:block;width:100%;height:100%}.network-vis__selected[_ngcontent-%COMP%]{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:6px;padding:4px 10px;background:#0a0a0fd9;border:1px solid var(--border-bright, #2a2a3e);border-radius:16px;font-size:.7rem;color:var(--text-primary, #e0e0e0);font-weight:600;text-transform:uppercase;letter-spacing:.05em;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}.network-vis__selected-dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;flex-shrink:0}.network-vis__clear[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-tertiary, #666);cursor:pointer;font-size:.7rem;font-family:inherit;padding:0 2px;line-height:1}.network-vis__clear[_ngcontent-%COMP%]:hover{color:var(--text-primary, #e0e0e0)}@media(prefers-reduced-motion:reduce){canvas[_ngcontent-%COMP%]{display:none}.network-vis[_ngcontent-%COMP%]:after{content:"Agent network visualization (animations disabled)";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:.8rem}}',
    ],
    changeDetection: 0,
  });
};
function q(o) {
  const e = Math.max(0, Math.min(1, o));
  return Math.round(e * 255)
    .toString(16)
    .padStart(2, '0');
}
function wt(o, e) {
  const t = et(o);
  return `rgb(${Math.min(255, t.r + e)}, ${Math.min(255, t.g + e)}, ${Math.min(255, t.b + e)})`;
}
function Et(o, e) {
  const t = et(o);
  return `rgb(${Math.max(0, t.r - e)}, ${Math.max(0, t.g - e)}, ${Math.max(0, t.b - e)})`;
}
function et(o) {
  const e = o.replace('#', '');
  return {
    r: Number.parseInt(e.slice(0, 2), 16),
    g: Number.parseInt(e.slice(2, 4), 16),
    b: Number.parseInt(e.slice(4, 6), 16),
  };
}
function At(o, e, t, n, i, r) {
  o.beginPath(),
    o.moveTo(e + r, t),
    o.lineTo(e + n - r, t),
    o.arcTo(e + n, t, e + n, t + r, r),
    o.lineTo(e + n, t + i - r),
    o.arcTo(e + n, t + i, e + n - r, t + i, r),
    o.lineTo(e + r, t + i),
    o.arcTo(e, t + i, e, t + i - r, r),
    o.lineTo(e, t + r),
    o.arcTo(e, t, e + r, t, r),
    o.closePath();
}
var It = ['canvas'],
  Pt = ['container'];
function kt(o, _e) {
  if (o & 1) {
    const t = T();
    O(0, 'div', 4),
      j(1, 'span', 7),
      m(2),
      O(3, 'button', 8),
      re('click', () => {
        P(t);
        const i = h();
        return k(i.clearSelection());
      }),
      m(4, 'x'),
      R()();
  }
  if (o & 2) {
    const t = h();
    c(), L('background', t.selectedAgent().color), c(), A(' ', t.selectedAgent().name, ' ');
  }
}
function St(o, e) {
  if (
    (o & 1 &&
      (O(0, 'div', 12)(1, 'span', 13),
      m(2),
      R(),
      O(3, 'span', 14)(4, 'span'),
      m(5),
      R(),
      O(6, 'span', 15),
      m(7, '\u2192'),
      R(),
      m(8),
      R(),
      O(9, 'span', 16),
      m(10),
      R()()),
    o & 2)
  ) {
    const t = e.$implicit,
      n = h(2);
    c(2),
      I(n.formatTime(t.timestamp)),
      c(2),
      L('color', t.color),
      c(),
      I(t.fromAgent),
      c(3),
      A(' ', t.toAgent, ' '),
      c(2),
      I(t.content);
  }
}
function Tt(o, _e) {
  if (
    (o & 1 &&
      (O(0, 'div', 5, 2)(2, 'div', 9)(3, 'span'),
      m(4, 'Message Log'),
      R(),
      O(5, 'span', 10),
      m(6),
      R()(),
      O(7, 'div', 11),
      $(8, St, 11, 6, 'div', 12, Re),
      R()()),
    o & 2)
  ) {
    const t = h();
    c(6), I(t.logEntries().length), c(2), G(t.logEntries());
  }
}
var we = class o {
  agents = K.required();
  messages = K.required();
  agentSelected = de();
  canvasRef = B.required('canvas');
  containerRef = B.required('container');
  selectedAgent = b(null);
  logEntries = b([]);
  renderer = null;
  scene = null;
  camera = null;
  animId = 0;
  resizeObserver = null;
  agentNodes = [];
  nodeMap = new Map();
  edges = [];
  edgeMap = new Map();
  particles = [];
  starField = null;
  starTwinklePhases = null;
  starBaseOpacities = null;
  groundGrid = null;
  nebulaClouds = null;
  trails = [];
  static MAX_LOG_ENTRIES = 50;
  static TRAIL_MAX_AGE = 45;
  isDragging = !1;
  lastMouseX = 0;
  lastMouseY = 0;
  orbitTheta = 0;
  orbitPhi = Math.PI / 4;
  orbitRadius = 30;
  targetTheta = 0;
  targetPhi = Math.PI / 4;
  targetRadius = 30;
  raycaster = new Qe();
  mouse = new ze();
  hoveredNodeId = null;
  selectedNodeId = null;
  lastProcessedMsgCount = 0;
  static GLOW_MATERIAL = new ve({ transparent: !0, opacity: 0.15, depthWrite: !1, side: Le });
  static EDGE_MATERIAL = new Pe({ color: 1714750, transparent: !0, opacity: 0.4 });
  static PARTICLE_GEOMETRY = new J(0.12, 6, 6);
  dragStartX = 0;
  dragStartY = 0;
  dragMoved = !1;
  capturedPointerId = -1;
  onPointerDown = (e) => this.handlePointerDown(e);
  onPointerMove = (e) => this.handlePointerMove(e);
  onPointerUp = (e) => this.handlePointerUp(e);
  onWheel = (e) => this.handleWheel(e);
  constructor() {
    oe(() => {
      this.initScene(), this.rebuildGraph(this.agents(), this.messages()), this.startAnimation();
    }),
      ie(() => {
        const e = this.agents(),
          t = this.messages();
        this.rebuildGraph(e, t);
      });
  }
  ngOnDestroy() {
    cancelAnimationFrame(this.animId), this.resizeObserver?.disconnect();
    const e = this.canvasRef()?.nativeElement;
    e &&
      (this.capturedPointerId >= 0 && e.releasePointerCapture(this.capturedPointerId),
      e.removeEventListener('pointerdown', this.onPointerDown),
      e.removeEventListener('pointermove', this.onPointerMove),
      e.removeEventListener('pointerup', this.onPointerUp),
      e.removeEventListener('wheel', this.onWheel)),
      this.agentNodes.forEach((t) => {
        t.mesh.geometry.dispose(), t.mesh.material.dispose(), t.glowMesh.geometry.dispose(), t.label.material.dispose();
      }),
      this.edges.forEach((t) => {
        t.line.geometry.dispose();
      }),
      this.particles.forEach((t) => {
        t.mesh.material.dispose();
      }),
      this.trails.forEach((t) => {
        t.mesh.material.dispose();
      }),
      this.starField?.geometry.dispose(),
      this.starField?.material?.dispose(),
      this.groundGrid?.traverse((t) => {
        t instanceof be && (t.geometry.dispose(), t.material.dispose());
      }),
      this.nebulaClouds?.traverse((t) => {
        t instanceof Q && (t.geometry.dispose(), t.material.dispose());
      }),
      this.renderer?.dispose();
  }
  clearSelection() {
    (this.selectedNodeId = null), this.selectedAgent.set(null), this.agentSelected.emit('');
  }
  formatTime(e) {
    return new Date(e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  initScene() {
    const e = this.canvasRef().nativeElement,
      t = this.containerRef().nativeElement,
      n = t.getBoundingClientRect();
    (this.renderer = new Je({ canvas: e, antialias: !0, alpha: !1 })),
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)),
      this.renderer.setSize(n.width, n.height),
      this.renderer.setClearColor(328970),
      (this.scene = new Ge()),
      (this.scene.fog = new $e(328970, 0.015)),
      (this.camera = new je(60, n.width / n.height, 0.1, 200)),
      this.updateCameraPosition();
    const i = new Ke(1710638, 0.8);
    this.scene.add(i);
    const r = new Se(58879, 1.5, 80);
    r.position.set(0, 15, 0), this.scene.add(r);
    const a = new Se(10980346, 0.6, 60);
    a.position.set(-10, -5, 10),
      this.scene.add(a),
      this.createStarfield(),
      this.createGroundGrid(),
      this.createNebulaClouds(),
      (e.style.cursor = 'crosshair'),
      e.addEventListener('pointerdown', this.onPointerDown),
      e.addEventListener('pointermove', this.onPointerMove),
      e.addEventListener('pointerup', this.onPointerUp),
      e.addEventListener('wheel', this.onWheel, { passive: !1 }),
      e.addEventListener(
        'touchstart',
        (s) => {
          s.touches.length === 1 &&
            ((this.isDragging = !0),
            (this.lastMouseX = s.touches[0].clientX),
            (this.lastMouseY = s.touches[0].clientY));
        },
        { passive: !0 },
      ),
      e.addEventListener(
        'touchmove',
        (s) => {
          if (this.isDragging && s.touches.length === 1) {
            const d = s.touches[0].clientX - this.lastMouseX,
              g = s.touches[0].clientY - this.lastMouseY;
            (this.targetTheta -= d * 0.005),
              (this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi - g * 0.005))),
              (this.lastMouseX = s.touches[0].clientX),
              (this.lastMouseY = s.touches[0].clientY);
          }
        },
        { passive: !0 },
      ),
      e.addEventListener(
        'touchend',
        () => {
          this.isDragging = !1;
        },
        { passive: !0 },
      ),
      (this.resizeObserver = new ResizeObserver((s) => {
        const d = s[0];
        if (!d) return;
        const { width: g, height: v } = d.contentRect;
        g === 0 ||
          v === 0 ||
          (this.renderer.setSize(g, v), (this.camera.aspect = g / v), this.camera.updateProjectionMatrix());
      })),
      this.resizeObserver.observe(t);
  }
  createStarfield() {
    const t = new Float32Array(2700),
      n = new Float32Array(900 * 3),
      i = new Float32Array(900);
    (this.starTwinklePhases = new Float32Array(900)), (this.starBaseOpacities = new Float32Array(900));
    for (let s = 0; s < 900; s++) {
      const d = s * 3,
        g = 50 + Math.random() * 50,
        v = Math.random() * Math.PI * 2,
        f = Math.acos(2 * Math.random() - 1);
      (t[d] = g * Math.sin(f) * Math.cos(v)), (t[d + 1] = g * Math.sin(f) * Math.sin(v)), (t[d + 2] = g * Math.cos(f));
      const u = Math.random();
      if (u < 0.3)
        (n[d] = 0.4 + Math.random() * 0.3),
          (n[d + 1] = 0.7 + Math.random() * 0.3),
          (n[d + 2] = 0.9 + Math.random() * 0.1);
      else if (u < 0.5)
        (n[d] = 0.9 + Math.random() * 0.1),
          (n[d + 1] = 0.6 + Math.random() * 0.2),
          (n[d + 2] = 0.3 + Math.random() * 0.2);
      else {
        const _ = 0.4 + Math.random() * 0.6;
        (n[d] = _ * (0.8 + Math.random() * 0.2)), (n[d + 1] = _ * (0.8 + Math.random() * 0.2)), (n[d + 2] = _);
      }
      (i[s] = 0.08 + Math.random() * 0.25),
        (this.starTwinklePhases[s] = Math.random() * Math.PI * 2),
        (this.starBaseOpacities[s] = 0.3 + Math.random() * 0.7);
    }
    const r = new _e();
    r.setAttribute('position', new fe(t, 3)),
      r.setAttribute('color', new fe(n, 3)),
      r.setAttribute('size', new fe(i, 1));
    const a = new Ye({
      size: 0.18,
      vertexColors: !0,
      transparent: !0,
      opacity: 0.7,
      sizeAttenuation: !0,
      depthWrite: !1,
    });
    (this.starField = new Xe(r, a)), this.scene.add(this.starField);
  }
  createGroundGrid() {
    this.groundGrid = new Ie();
    const e = new ue(657950),
      t = new ue(58879),
      n = 3,
      i = 40,
      r = n * Math.sqrt(3);
    for (let a = -i / r; a <= i / r; a++)
      for (let s = -i / (n * 1.5); s <= i / (n * 1.5); s++) {
        const d = s * n * 1.5,
          g = a * r + (s % 2 ? r / 2 : 0),
          v = Math.sqrt(d * d + g * g);
        if (v > i) continue;
        const f = [];
        for (let C = 0; C <= 6; C++) {
          const W = (Math.PI / 3) * C + Math.PI / 6;
          f.push(new Z(d + Math.cos(W) * n * 0.95, -8, g + Math.sin(W) * n * 0.95));
        }
        const u = new _e().setFromPoints(f),
          _ = Math.max(0, 0.12 - v * 0.002),
          y = v < 8,
          E = new Pe({ color: y ? t : e, transparent: !0, opacity: y ? _ * 2 : _ });
        this.groundGrid.add(new be(u, E));
      }
    this.scene.add(this.groundGrid);
  }
  createNebulaClouds() {
    this.nebulaClouds = new Ie();
    const e = [
      { color: 1703984, opacity: 0.03 },
      { color: 6707, opacity: 0.025 },
      { color: 13090, opacity: 0.02 },
      { color: 655392, opacity: 0.035 },
    ];
    for (let t = 0; t < 12; t++) {
      const n = e[t % e.length],
        i = 15 + Math.random() * 25,
        r = new J(i, 12, 12),
        a = new ve({ color: n.color, transparent: !0, opacity: n.opacity, side: He, depthWrite: !1 }),
        s = new Q(r, a),
        d = 40 + Math.random() * 40,
        g = Math.random() * Math.PI * 2,
        v = Math.acos(2 * Math.random() - 1);
      s.position.set(d * Math.sin(v) * Math.cos(g), d * Math.sin(v) * Math.sin(g) * 0.5, d * Math.cos(v)),
        s.scale.set(1, 0.5 + Math.random() * 0.5, 1),
        this.nebulaClouds.add(s);
    }
    this.scene.add(this.nebulaClouds);
  }
  rebuildGraph(e, t) {
    if (!this.scene) return;
    const n = e.length,
      i = Math.max(6, n * 2.5);
    for (let s = 0; s < n; s++) {
      const d = e[s],
        g = this.nodeMap.get(d.id);
      if (g) {
        g.color.set(d.color), g.mesh.material.color.set(d.color), g.mesh.material.emissive.set(d.color);
        continue;
      }
      const v = (s / n) * Math.PI * 2,
        f = Math.cos(v) * i,
        u = Math.sin(v) * i,
        _ = (Math.random() - 0.5) * 4,
        y = new ue(d.color),
        E = 0.8,
        C = new J(E, 24, 24),
        W = new qe({ color: y, emissive: y, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.7 }),
        V = new Q(C, W);
      V.position.set(f, _, u), (V.userData.agentId = d.id), this.scene.add(V);
      const rt = new J(E * 2, 16, 16),
        Te = o.GLOW_MATERIAL.clone();
      Te.color = y.clone();
      const Ae = new Q(rt, Te);
      Ae.position.copy(V.position), this.scene.add(Ae);
      const ee = this.createLabelSprite(d.name, d.color);
      ee.position.set(f, _ + E + 0.8, u), ee.scale.set(3, 1.5, 1), this.scene.add(ee);
      const Oe = {
        id: d.id,
        name: d.name,
        color: y,
        position: new Z(f, _, u),
        mesh: V,
        glowMesh: Ae,
        label: ee,
        msgCount: 0,
        lastActive: 0,
        pulsePhase: Math.random() * Math.PI * 2,
        baseRadius: E,
      };
      this.agentNodes.push(Oe), this.nodeMap.set(d.id, Oe);
    }
    const r = t.slice(this.lastProcessedMsgCount);
    this.lastProcessedMsgCount = t.length;
    const a = [];
    for (const s of r) {
      const d = this.nodeMap.get(s.fromAgentId),
        g = this.nodeMap.get(s.toAgentId);
      if (!d || !g || d.id === g.id) continue;
      d.msgCount++, (d.lastActive = s.timestamp), (g.lastActive = s.timestamp);
      let v = [s.fromAgentId, s.toAgentId].sort().join(':'),
        f = this.edgeMap.get(v);
      if (!f) {
        const C = new _e();
        this.updateEdgeGeometry(C, d.position, g.position);
        const W = o.EDGE_MATERIAL.clone(),
          V = new be(C, W);
        this.scene.add(V),
          (f = { fromId: s.fromAgentId, toId: s.toAgentId, count: 0, lastActive: 0, line: V }),
          this.edges.push(f),
          this.edgeMap.set(v, f);
      }
      f.count++, (f.lastActive = s.timestamp);
      const u = f.line.material;
      (u.opacity = Math.min(0.8, 0.3 + f.count * 0.02)), this.spawnParticle(d, g);
      const _ = s.content ? s.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '',
        y = _.length > 60 ? `${_.slice(0, 60)}...` : _,
        E = {
          fromAgent: s.fromAgent ?? d.name,
          toAgent: s.toAgent ?? g.name,
          content: y,
          channel: s.channel,
          timestamp: s.timestamp,
          color: d.color.getStyle(),
        };
      a.push(E);
    }
    a.length > 0 && this.logEntries.update((s) => [...a, ...s].slice(0, o.MAX_LOG_ENTRIES));
  }
  updateEdgeGeometry(e, t, n) {
    const i = new Z().addVectors(t, n).multiplyScalar(0.5);
    i.y += t.distanceTo(n) * 0.15;
    const a = new ke(t, i, n).getPoints(20);
    e.setFromPoints(a);
  }
  spawnParticle(e, t) {
    const n = new ve({ color: e.color, transparent: !0, opacity: 0.9, depthWrite: !1 }),
      i = new Q(o.PARTICLE_GEOMETRY, n);
    i.position.copy(e.position),
      this.scene.add(i),
      this.particles.push({
        fromId: e.id,
        toId: t.id,
        progress: 0,
        speed: 0.008 + Math.random() * 0.006,
        color: e.color.clone(),
        mesh: i,
        opacity: 0.9,
      });
  }
  createLabelSprite(e, t) {
    const n = document.createElement('canvas'),
      i = n.getContext('2d');
    (n.width = 256),
      (n.height = 64),
      i.clearRect(0, 0, n.width, n.height),
      (i.font = 'bold 28px system-ui, -apple-system, sans-serif'),
      (i.textAlign = 'center'),
      (i.textBaseline = 'middle'),
      (i.shadowColor = 'rgba(0, 0, 0, 0.8)'),
      (i.shadowBlur = 6),
      (i.fillStyle = t),
      i.fillText(e, n.width / 2, n.height / 2);
    const r = new Ue(n);
    r.minFilter = Ve;
    const a = new Be({ map: r, transparent: !0, opacity: 0.9, depthWrite: !1, sizeAttenuation: !0 });
    return new We(a);
  }
  startAnimation() {
    const e = new Ze(),
      t = () => {
        this.animId = requestAnimationFrame(t);
        const n = e.getDelta(),
          i = e.getElapsedTime();
        (this.orbitTheta += (this.targetTheta - this.orbitTheta) * 0.08),
          (this.orbitPhi += (this.targetPhi - this.orbitPhi) * 0.08),
          (this.orbitRadius += (this.targetRadius - this.orbitRadius) * 0.08),
          this.isDragging || (this.targetTheta += 8e-4),
          this.updateCameraPosition();
        for (const a of this.agentNodes) {
          a.pulsePhase += n * 1.5;
          const s = 0.1 + Math.sin(a.pulsePhase) * 0.06,
            d = a.glowMesh.material;
          d.opacity = s;
          const g = a.id === this.hoveredNodeId,
            v = a.id === this.selectedNodeId,
            f = g || v ? 1.3 : 1,
            u = a.mesh.scale.x,
            _ = u + (f - u) * 0.1;
          a.mesh.scale.setScalar(_), a.glowMesh.scale.setScalar(_);
          const y = a.mesh.material;
          y.emissiveIntensity = g || v ? 0.8 : 0.4;
        }
        for (let a = this.particles.length - 1; a >= 0; a--) {
          const s = this.particles[a];
          if (((s.progress += s.speed), s.progress >= 1)) {
            const f = s.mesh.material;
            (f.opacity = 0.6),
              s.mesh.scale.setScalar(0.8),
              this.trails.push({
                fromId: s.fromId,
                toId: s.toId,
                mesh: s.mesh,
                createdAt: performance.now() / 1e3,
                maxAge: o.TRAIL_MAX_AGE,
              }),
              this.particles.splice(a, 1);
            continue;
          }
          const d = this.nodeMap.get(s.fromId),
            g = this.nodeMap.get(s.toId);
          if (d && g) {
            const f = new Z().addVectors(d.position, g.position).multiplyScalar(0.5);
            f.y += d.position.distanceTo(g.position) * 0.15;
            const _ = new ke(d.position, f, g.position).getPoint(s.progress);
            s.mesh.position.copy(_);
          }
          const v = s.mesh.material;
          v.opacity = s.progress > 0.7 ? ((1 - s.progress) / 0.3) * 0.9 : 0.9;
        }
        const r = performance.now() / 1e3;
        for (let a = this.trails.length - 1; a >= 0; a--) {
          const s = this.trails[a],
            d = r - s.createdAt;
          if (d >= s.maxAge) {
            this.scene.remove(s.mesh), s.mesh.material.dispose(), this.trails.splice(a, 1);
            continue;
          }
          const g = 1 - d / s.maxAge,
            v = s.mesh.material;
          (v.opacity = g * 0.5), s.mesh.scale.setScalar(0.5 + g * 0.3);
        }
        if (
          this.starField &&
          ((this.starField.rotation.y = i * 0.02), this.starTwinklePhases && this.starBaseOpacities)
        ) {
          const a = this.starField.geometry.attributes.color,
            s = this.starTwinklePhases.length;
          for (let d = 0; d < s; d++) {
            const g = this.starTwinklePhases[d],
              f = this.starBaseOpacities[d] * (0.6 + 0.4 * Math.sin(i * (0.8 + g) + g * 10)),
              u = d * 3,
              _ = a.array[u],
              y = a.array[u + 1],
              E = a.array[u + 2],
              C = Math.max(_, y, E, 0.01);
            (a.array[u] = (_ / C) * f), (a.array[u + 1] = (y / C) * f), (a.array[u + 2] = (E / C) * f);
          }
          a.needsUpdate = !0;
        }
        this.nebulaClouds && (this.nebulaClouds.rotation.y = i * 0.005),
          this.renderer && this.scene && this.camera && this.renderer.render(this.scene, this.camera);
      };
    t();
  }
  updateCameraPosition() {
    if (!this.camera) return;
    const e = this.orbitRadius * Math.sin(this.orbitPhi) * Math.cos(this.orbitTheta),
      t = this.orbitRadius * Math.cos(this.orbitPhi),
      n = this.orbitRadius * Math.sin(this.orbitPhi) * Math.sin(this.orbitTheta);
    this.camera.position.set(e, t, n), this.camera.lookAt(0, 0, 0);
  }
  handlePointerDown(e) {
    if (e.button !== 0) return;
    (this.dragStartX = e.clientX), (this.dragStartY = e.clientY), (this.dragMoved = !1);
    const t = this.canvasRef().nativeElement;
    t.setPointerCapture(e.pointerId),
      (this.capturedPointerId = e.pointerId),
      (this.isDragging = !0),
      (this.lastMouseX = e.clientX),
      (this.lastMouseY = e.clientY),
      (t.style.cursor = 'grabbing');
  }
  handlePointerMove(e) {
    if (this.isDragging) {
      const a = e.clientX - this.lastMouseX,
        s = e.clientY - this.lastMouseY;
      (Math.abs(a) > 3 || Math.abs(s) > 3) && (this.dragMoved = !0),
        (this.targetTheta -= a * 0.005),
        (this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi - s * 0.005))),
        (this.lastMouseX = e.clientX),
        (this.lastMouseY = e.clientY);
      return;
    }
    const t = this.canvasRef().nativeElement,
      n = t.getBoundingClientRect();
    (this.mouse.x = ((e.clientX - n.left) / n.width) * 2 - 1),
      (this.mouse.y = -((e.clientY - n.top) / n.height) * 2 + 1),
      this.raycaster.setFromCamera(this.mouse, this.camera);
    const i = this.agentNodes.map((a) => a.mesh),
      r = this.raycaster.intersectObjects(i);
    r.length > 0
      ? ((this.hoveredNodeId = r[0].object.userData.agentId), (t.style.cursor = 'pointer'))
      : ((this.hoveredNodeId = null), (t.style.cursor = 'crosshair'));
  }
  handlePointerUp(_e) {
    this.isDragging = !1;
    const t = this.canvasRef().nativeElement;
    if (
      (this.capturedPointerId >= 0 && (t.releasePointerCapture(this.capturedPointerId), (this.capturedPointerId = -1)),
      (t.style.cursor = 'crosshair'),
      !this.dragMoved && this.camera)
    ) {
      const n = t.getBoundingClientRect();
      (this.mouse.x = ((this.dragStartX - n.left) / n.width) * 2 - 1),
        (this.mouse.y = -((this.dragStartY - n.top) / n.height) * 2 + 1),
        this.raycaster.setFromCamera(this.mouse, this.camera);
      const i = this.agentNodes.map((a) => a.mesh),
        r = this.raycaster.intersectObjects(i);
      if (r.length > 0) {
        const a = r[0].object.userData.agentId;
        if (this.selectedNodeId === a) this.clearSelection();
        else {
          this.selectedNodeId = a;
          const s = this.agents().find((d) => d.id === a);
          this.selectedAgent.set(s ?? null), this.agentSelected.emit(a);
        }
      } else this.clearSelection();
    }
  }
  handleWheel(e) {
    e.preventDefault(), (this.targetRadius = Math.max(10, Math.min(80, this.targetRadius + e.deltaY * 0.03)));
  }
  static \u0275fac = (t) => new (t || o)();
  static \u0275cmp = z({
    type: o,
    selectors: [['app-agent-network-3d']],
    viewQuery: (t, n) => {
      t & 1 && X(n.canvasRef, It, 5)(n.containerRef, Pt, 5), t & 2 && U(2);
    },
    inputs: { agents: [1, 'agents'], messages: [1, 'messages'] },
    outputs: { agentSelected: 'agentSelected' },
    decls: 8,
    vars: 2,
    consts: [
      ['container', ''],
      ['canvas', ''],
      ['logPanel', ''],
      [1, 'network-3d'],
      [1, 'network-3d__selected'],
      [1, 'network-3d__log'],
      [1, 'network-3d__hint'],
      [1, 'network-3d__selected-dot'],
      [1, 'network-3d__clear', 3, 'click'],
      [1, 'network-3d__log-header'],
      [1, 'network-3d__log-count'],
      [1, 'network-3d__log-list'],
      [1, 'network-3d__log-item'],
      [1, 'network-3d__log-time'],
      [1, 'network-3d__log-flow'],
      [1, 'network-3d__log-arrow'],
      [1, 'network-3d__log-preview'],
    ],
    template: (t, n) => {
      t & 1 &&
        (O(0, 'div', 3, 0),
        j(2, 'canvas', null, 1),
        M(4, kt, 5, 3, 'div', 4),
        M(5, Tt, 10, 1, 'div', 5),
        O(6, 'div', 6),
        m(7, 'Click & drag to orbit \xB7 Scroll to zoom \xB7 Click agent to select'),
        R()()),
        t & 2 && (c(4), w(n.selectedAgent() ? 4 : -1), c(), w(n.logEntries().length > 0 ? 5 : -1));
    },
    styles: [
      '.network-3d[_ngcontent-%COMP%]{position:relative;width:100%;height:100%;min-height:400px;background:#05050a;border-radius:var(--radius, 6px);border:1px solid var(--border, #1a1a2e);overflow:hidden;cursor:crosshair}canvas[_ngcontent-%COMP%]{display:block;width:100%;height:100%}.network-3d__selected[_ngcontent-%COMP%]{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:6px;padding:4px 10px;background:#05050ad9;border:1px solid var(--border-bright, #2a2a3e);border-radius:16px;font-size:.7rem;color:var(--text-primary, #e0e0e0);font-weight:600;text-transform:uppercase;letter-spacing:.05em;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);z-index:10}.network-3d__selected-dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;flex-shrink:0}.network-3d__clear[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-tertiary, #666);cursor:pointer;font-size:.7rem;font-family:inherit;padding:0 2px;line-height:1}.network-3d__clear[_ngcontent-%COMP%]:hover{color:var(--text-primary, #e0e0e0)}.network-3d__hint[_ngcontent-%COMP%]{position:absolute;bottom:10px;left:50%;transform:translate(-50%);font-size:.6rem;color:var(--text-tertiary, #555);letter-spacing:.05em;opacity:.6;pointer-events:none;z-index:10}.network-3d__log[_ngcontent-%COMP%]{position:absolute;bottom:32px;right:12px;width:280px;max-height:240px;background:#05050ae0;border:1px solid var(--border-bright, #2a2a3e);border-radius:8px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:10;overflow:hidden;display:flex;flex-direction:column;font-size:.65rem}.network-3d__log-header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border, #1a1a2e);color:var(--text-secondary, #aaa);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:.6rem}.network-3d__log-count[_ngcontent-%COMP%]{background:var(--surface-alt, #1a1a2e);padding:1px 6px;border-radius:8px;font-size:.55rem;color:var(--text-tertiary, #666)}.network-3d__log-list[_ngcontent-%COMP%]{overflow-y:auto;flex:1;padding:4px 0}.network-3d__log-item[_ngcontent-%COMP%]{padding:3px 10px;display:flex;flex-direction:column;gap:1px;border-bottom:1px solid rgba(255,255,255,.03)}.network-3d__log-item[_ngcontent-%COMP%]:last-child{border-bottom:none}.network-3d__log-time[_ngcontent-%COMP%]{color:var(--text-tertiary, #555);font-size:.55rem;font-family:monospace}.network-3d__log-flow[_ngcontent-%COMP%]{color:var(--text-secondary, #aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.network-3d__log-arrow[_ngcontent-%COMP%]{color:var(--text-tertiary, #555);margin:0 3px}.network-3d__log-preview[_ngcontent-%COMP%]{color:var(--text-tertiary, #666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.58rem}@media(max-width:600px){.network-3d__log[_ngcontent-%COMP%]{width:200px;max-height:160px;bottom:28px;right:8px}}@media(prefers-reduced-motion:reduce){canvas[_ngcontent-%COMP%]{display:none}.network-3d[_ngcontent-%COMP%]:after{content:"Agent 3D network (animations disabled \\2014  switch to Basic view)";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:.8rem}}',
    ],
    changeDetection: 0,
  });
};
var Ot = ['timeline'],
  nt = (_o, e) => e.id,
  tt = (_o, e) => e.value;
function Rt(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'app-view-mode-toggle', 22),
      x('modeChange', (i) => {
        P(t);
        const r = h();
        return k(r.setNetworkViewMode(i));
      }),
      l();
  }
  if (o & 2) {
    const t = h();
    S('mode', t.networkViewMode());
  }
}
function Ft(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 23),
      x('click', () => {
        P(t);
        const i = h();
        return k(i.toggleAutoScroll());
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = h();
    c(), A(' Auto-scroll: ', t.autoScroll() ? 'ON' : 'OFF', ' ');
  }
}
function Nt(o, e) {
  if ((o & 1 && (p(0, 'option', 15), m(1), l()), o & 2)) {
    const t = e.$implicit;
    S('value', t.id), c(), I(t.name);
  }
}
function Dt(o, e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 6),
      x('click', () => {
        const i = P(t).$implicit,
          r = h();
        return k(r.setChannelFilter(i.value));
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = e.$implicit,
      n = h();
    F('ch-chip--active', n.channelFilter() === t.value), c(), I(t.label);
  }
}
function Lt(o, e) {
  if (o & 1) {
    const t = T();
    p(0, 'button', 6),
      x('click', () => {
        const i = P(t).$implicit,
          r = h();
        return k(r.setStatusFilter(i.value));
      }),
      m(1),
      l();
  }
  if (o & 2) {
    const t = e.$implicit,
      n = h();
    F('ch-chip--active', n.statusFilter() === t.value), c(), I(t.label);
  }
}
function Ht(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'app-agent-network-vis', 24),
      x('agentSelected', (i) => {
        P(t);
        const r = h();
        return k(r.onNetworkAgentSelected(i));
      }),
      l();
  }
  if (o & 2) {
    const t = h();
    S('agents', t.visAgents())('messages', t.visMessages());
  }
}
function Vt(o, _e) {
  if (o & 1) {
    const t = T();
    p(0, 'app-agent-network-3d', 24),
      x('agentSelected', (i) => {
        P(t);
        const r = h();
        return k(r.onNetworkAgentSelected(i));
      }),
      l();
  }
  if (o & 2) {
    const t = h();
    S('agents', t.visAgents())('messages', t.visMessages());
  }
}
function zt(o, _e) {
  o & 1 && D(0, 'app-skeleton', 19), o & 2 && S('count', 6);
}
function $t(o, _e) {
  if ((o & 1 && D(0, 'app-empty-state', 20), o & 2)) {
    const t = h();
    S('title', t.hasActiveFilters() ? 'No matches' : 'No agent communications yet')(
      'description',
      t.hasActiveFilters()
        ? 'No messages match your current filters.'
        : 'Agent-to-agent messages will appear here in real-time as they communicate.',
    );
  }
}
function Gt(o, _e) {
  o & 1 && D(0, 'span', 34);
}
function Bt(o, _e) {
  o & 1 && m(0, ' --> ');
}
function Wt(o, _e) {
  if ((o & 1 && (p(0, 'span', 36), m(1), l()), o & 2)) {
    const t = h().$implicit;
    c(), A('', (t.fee / 1e6).toFixed(4), ' ALGO');
  }
}
function Yt(o, _e) {
  if ((o & 1 && (p(0, 'span', 37), m(1), l()), o & 2)) {
    const t = h().$implicit;
    S('title', t.threadId), c(), A(' thread:', t.threadId.slice(0, 6), ' ');
  }
}
function Xt(o, _e) {
  if ((o & 1 && (p(0, 'div', 40)(1, 'span', 41), m(2, 'Response'), l(), p(3, 'pre', 43), m(4), l()()), o & 2)) {
    const t = h(2).$implicit;
    c(4), I(t.response);
  }
}
function Ut(o, _e) {
  if (
    (o & 1 &&
      (p(0, 'div', 39)(1, 'div', 40)(2, 'span', 41),
      m(3, 'Message'),
      l(),
      p(4, 'pre', 42),
      m(5),
      l()(),
      M(6, Xt, 5, 1, 'div', 40),
      l()),
    o & 2)
  ) {
    const t = h().$implicit;
    c(5), I(t.content), c(), w(t.response ? 6 : -1);
  }
}
function qt(o, e) {
  if (o & 1) {
    const t = T();
    p(0, 'div', 26),
      x('click', () => {
        const i = P(t).$implicit,
          r = h(2);
        return k(r.toggleExpand(i.id));
      }),
      p(1, 'div', 27)(2, 'span', 28),
      m(3),
      ae(4, 'date'),
      l(),
      p(5, 'span', 29),
      m(6),
      l(),
      D(7, 'span', 30),
      l(),
      p(8, 'div', 31)(9, 'span', 32),
      m(10),
      l(),
      p(11, 'span', 33),
      M(12, Gt, 1, 0, 'span', 34)(13, Bt, 1, 0),
      l(),
      p(14, 'span', 35),
      m(15),
      l(),
      M(16, Wt, 2, 1, 'span', 36),
      M(17, Yt, 2, 2, 'span', 37),
      l(),
      p(18, 'div', 38),
      m(19),
      l(),
      M(20, Ut, 7, 2, 'div', 39),
      l();
  }
  if (o & 2) {
    const t = e.$implicit,
      n = h(2);
    L('border-left-color', n.agentColor(t.colorIndex)),
      N('data-status', t.status)('data-channel', t.channel),
      c(3),
      I(se(4, 21, t.timestamp, 'HH:mm:ss.SSS')),
      c(2),
      N('data-channel', t.channel),
      c(),
      A(' ', n.channelLabel(t.channel), ' '),
      c(),
      S('title', t.status),
      N('data-status', t.status),
      c(2),
      L('color', n.agentColor(t.colorIndex)),
      c(),
      A(' ', t.fromAgent, ' '),
      c(),
      N('data-status', t.status),
      c(),
      w(t.status === 'processing' ? 12 : 13),
      c(3),
      A(' ', t.toAgent, ' '),
      c(),
      w(t.fee !== null && t.fee > 0 ? 16 : -1),
      c(),
      w(t.threadId ? 17 : -1),
      c(),
      F('comms__msg-preview--hidden', n.expandedIds().has(t.id)),
      c(),
      A(' ', n.previewText(t.content), ' '),
      c(),
      w(n.expandedIds().has(t.id) ? 20 : -1);
  }
}
function jt(o, _e) {
  if ((o & 1 && (p(0, 'div', 21, 0), $(2, qt, 21, 24, 'div', 25, nt), l()), o & 2)) {
    const t = h();
    c(2), G(t.entries());
  }
}
var Ee = class o {
  wsService = Y(pe);
  agentService = Y(me);
  api = Y(le);
  viewModeService = Y(Ne);
  timelineEl = B('timeline');
  loading = b(!0);
  rawEntries = b([]);
  agentFilter = b('');
  channelFilter = b('all');
  statusFilter = b('all');
  expandedIds = b(new Set());
  autoScroll = b(!0);
  totalMessages = b(0);
  agents = b([]);
  wsConnected = this.wsService.connected;
  viewMode = b('list');
  networkViewMode = this.viewModeService.getMode('comms-network');
  channelFilters = [
    { value: 'all', label: 'All' },
    { value: 'agent-invoke', label: 'A2A' },
    { value: 'algochat', label: 'AlgoChat' },
    { value: 'council', label: 'Council' },
  ];
  statusFilters = [
    { value: 'all', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'processing', label: 'Active' },
    { value: 'completed', label: 'Done' },
    { value: 'failed', label: 'Failed' },
  ];
  entries = H(() => {
    let e = this.rawEntries(),
      t = this.agentFilter(),
      n = this.channelFilter(),
      i = this.statusFilter();
    return (
      t && (e = e.filter((r) => r.fromAgentId === t || r.toAgentId === t)),
      n !== 'all' && (e = e.filter((r) => r.channel === n)),
      i !== 'all' && (e = e.filter((r) => r.status === i)),
      e
    );
  });
  hasActiveFilters = H(
    () => this.agentFilter() !== '' || this.channelFilter() !== 'all' || this.statusFilter() !== 'all',
  );
  visAgents = H(() =>
    this.agents().map((e, t) => ({
      id: e.id,
      name: e.name,
      color: e.displayColor || o.AGENT_COLORS[t % o.AGENT_COLORS.length],
    })),
  );
  visMessages = H(() =>
    this.rawEntries().map((e) => ({
      fromAgentId: e.fromAgentId,
      toAgentId: e.toAgentId,
      status: e.status,
      timestamp: e.timestamp.getTime(),
      channel: e.channel,
      fromAgent: e.fromAgent,
      toAgent: e.toAgent,
      content: e.content,
    })),
  );
  static AGENT_COLORS = ['#ff6b9d', '#00e5ff', '#ffa040', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fbbf24'];
  unsubscribeWs = null;
  nextId = 0;
  agentMap = {};
  agentColorMap = {};
  nextColorIndex = 0;
  seenMessageKeys = new Set();
  async ngOnInit() {
    await this.agentService.loadAgents();
    const e = this.agentService.agents();
    this.agents.set(e);
    for (const t of e) this.agentMap[t.id] = t;
    try {
      await this.loadHistory();
    } finally {
      this.loading.set(!1);
    }
    this.unsubscribeWs = this.wsService.onMessage((t) => {
      if (t.type === 'agent_message_update') {
        const n = t.message,
          i = this.agentMap[n.fromAgentId]?.name ?? n.fromAgentId.slice(0, 8),
          r = this.agentMap[n.toAgentId]?.name ?? n.toAgentId.slice(0, 8),
          a = `${n.id}:${n.status}`;
        if (this.seenMessageKeys.has(a)) return;
        this.seenMessageKeys.add(a),
          n.status === 'processing'
            ? (this.removeEntriesByMessageId(n.id),
              this.addEntry({
                fromAgent: i,
                fromAgentId: n.fromAgentId,
                toAgent: r,
                toAgentId: n.toAgentId,
                channel: 'agent-invoke',
                status: 'processing',
                content: n.content,
                response: null,
                fee: n.paymentMicro > 0 ? n.paymentMicro : null,
                threadId: n.threadId ?? null,
                colorIndex: this.colorIndexForAgent(i),
                messageId: n.id,
              }))
            : n.status === 'completed'
              ? (this.removeEntriesByMessageId(n.id),
                this.addEntry({
                  fromAgent: i,
                  fromAgentId: n.fromAgentId,
                  toAgent: r,
                  toAgentId: n.toAgentId,
                  channel: 'agent-invoke',
                  status: 'completed',
                  content: n.content,
                  response: n.response,
                  fee: n.paymentMicro > 0 ? n.paymentMicro : null,
                  threadId: n.threadId ?? null,
                  colorIndex: this.colorIndexForAgent(i),
                  messageId: n.id,
                }))
              : n.status === 'failed'
                ? (this.removeEntriesByMessageId(n.id),
                  this.addEntry({
                    fromAgent: i,
                    fromAgentId: n.fromAgentId,
                    toAgent: r,
                    toAgentId: n.toAgentId,
                    channel: 'agent-invoke',
                    status: 'failed',
                    content: n.content,
                    response: null,
                    fee: n.paymentMicro > 0 ? n.paymentMicro : null,
                    threadId: n.threadId ?? null,
                    colorIndex: this.colorIndexForAgent(i),
                    messageId: n.id,
                  }))
                : n.status === 'sent' &&
                  this.addEntry({
                    fromAgent: i,
                    fromAgentId: n.fromAgentId,
                    toAgent: r,
                    toAgentId: n.toAgentId,
                    channel: 'agent-invoke',
                    status: 'sent',
                    content: n.content,
                    response: null,
                    fee: n.paymentMicro > 0 ? n.paymentMicro : null,
                    threadId: n.threadId ?? null,
                    colorIndex: this.colorIndexForAgent(i),
                    messageId: n.id,
                  });
      }
      if (t.type === 'algochat_message') {
        const n = this.agentService.agents(),
          i = n.find((s) => s.algochatEnabled) ?? n[0];
        if (!i) return;
        const r = i.name,
          a = t.participant === 'local' ? 'Local UI' : `${t.participant.slice(0, 8)}...${t.participant.slice(-4)}`;
        t.direction === 'inbound'
          ? this.addEntry({
              fromAgent: a,
              fromAgentId: t.participant,
              toAgent: r,
              toAgentId: i.id,
              channel: 'algochat',
              status: 'completed',
              content: t.content,
              response: null,
              fee: null,
              threadId: null,
              colorIndex: this.colorIndexForAgent(a),
            })
          : t.direction === 'outbound' &&
            this.addEntry({
              fromAgent: r,
              fromAgentId: i.id,
              toAgent: a,
              toAgentId: t.participant,
              channel: 'algochat',
              status: 'completed',
              content: t.content,
              response: null,
              fee: null,
              threadId: null,
              colorIndex: this.colorIndexForAgent(r),
            });
      }
    });
  }
  ngOnDestroy() {
    this.unsubscribeWs?.();
  }
  agentColor(e) {
    return o.AGENT_COLORS[e % o.AGENT_COLORS.length];
  }
  channelLabel(e) {
    switch (e) {
      case 'agent-invoke':
        return 'A2A';
      case 'algochat':
        return 'AlgoChat';
      case 'council':
        return 'Council';
      case 'system':
        return 'System';
      default:
        return e;
    }
  }
  previewText(e) {
    const t = e.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 100 ? `${t.slice(0, 100)}...` : t;
  }
  toggleExpand(e) {
    this.expandedIds.update((t) => {
      const n = new Set(t);
      return n.has(e) ? n.delete(e) : n.add(e), n;
    });
  }
  toggleAutoScroll() {
    this.autoScroll.update((e) => !e);
  }
  onAgentFilterChange(e) {
    this.agentFilter.set(e.target.value);
  }
  setChannelFilter(e) {
    this.channelFilter.set(e);
  }
  setStatusFilter(e) {
    this.statusFilter.set(e);
  }
  setViewMode(e) {
    this.viewMode.set(e);
  }
  setNetworkViewMode(e) {
    this.viewModeService.setMode('comms-network', e);
  }
  onNetworkAgentSelected(e) {
    this.agentFilter.set(e);
  }
  colorIndexForAgent(e) {
    return e in this.agentColorMap || (this.agentColorMap[e] = this.nextColorIndex++), this.agentColorMap[e];
  }
  addEntry(e, t) {
    const n = te({ id: this.nextId++, timestamp: t ?? new Date() }, e);
    this.rawEntries.update((i) => [n, ...i]),
      this.totalMessages.update((i) => i + 1),
      this.autoScroll() &&
        requestAnimationFrame(() => {
          const i = this.timelineEl()?.nativeElement;
          i && (i.scrollTop = 0);
        });
  }
  removeEntriesByMessageId(e) {
    this.rawEntries.update((t) => t.filter((n) => n.messageId !== e));
  }
  async loadHistory() {
    try {
      const e = await ne(this.api.get('/feed/history?limit=100&offset=0'));
      this.totalMessages.set(e.total), (this.nextId = 0), this.seenMessageKeys.clear();
      const t = [];
      for (const n of [...e.messages].reverse()) {
        const i = this.agentMap[n.fromAgentId]?.name ?? n.fromAgentId.slice(0, 8),
          r = this.agentMap[n.toAgentId]?.name ?? n.toAgentId.slice(0, 8),
          a = {
            id: this.nextId++,
            timestamp: n.createdAt ? new Date(`${n.createdAt}Z`) : new Date(),
            fromAgent: i,
            fromAgentId: n.fromAgentId,
            toAgent: r,
            toAgentId: n.toAgentId,
            channel: 'agent-invoke',
            status: n.status === 'completed' || n.status === 'failed' ? n.status : 'sent',
            content: n.content,
            response: n.response,
            fee: n.paymentMicro > 0 ? n.paymentMicro : null,
            threadId: n.threadId ?? null,
            colorIndex: this.colorIndexForAgent(i),
            messageId: n.id,
          };
        t.push(a), this.seenMessageKeys.add(`${n.id}:${n.status}`);
      }
      t.sort((n, i) => i.timestamp.getTime() - n.timestamp.getTime()), (this.nextId = 0);
      for (const n of t) n.id = this.nextId++;
      this.rawEntries.set(t);
    } catch {}
  }
  static \u0275fac = (t) => new (t || o)();
  static \u0275cmp = z({
    type: o,
    selectors: [['app-agent-comms']],
    viewQuery: (t, n) => {
      t & 1 && X(n.timelineEl, Ot, 5), t & 2 && U();
    },
    decls: 42,
    vars: 11,
    consts: [
      ['timeline', ''],
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page__actions'],
      [1, 'comms__count'],
      [1, 'comms__view-toggle'],
      [1, 'ch-chip', 3, 'click'],
      ['ariaLabel', 'Network visualization mode', 3, 'mode'],
      [1, 'btn', 'btn--secondary'],
      [1, 'comms__status'],
      [1, 'comms__filters'],
      [1, 'comms__filter-group'],
      [1, 'comms__filter-label'],
      ['aria-label', 'Filter by agent', 1, 'comms__select', 3, 'change', 'value'],
      ['value', ''],
      [3, 'value'],
      [1, 'comms__channel-chips'],
      [1, 'ch-chip', 3, 'ch-chip--active'],
      [3, 'agents', 'messages'],
      ['variant', 'table', 3, 'count'],
      ['icon', '<- ->', 3, 'title', 'description'],
      [1, 'comms__timeline'],
      ['ariaLabel', 'Network visualization mode', 3, 'modeChange', 'mode'],
      [1, 'btn', 'btn--secondary', 3, 'click'],
      [3, 'agentSelected', 'agents', 'messages'],
      [1, 'comms__msg', 3, 'border-left-color'],
      [1, 'comms__msg', 3, 'click'],
      [1, 'comms__msg-header'],
      [1, 'comms__time'],
      [1, 'comms__channel-badge'],
      [1, 'comms__status-dot', 3, 'title'],
      [1, 'comms__msg-flow'],
      [1, 'comms__agent-from'],
      [1, 'comms__arrow'],
      [1, 'comms__arrow-anim'],
      [1, 'comms__agent-to'],
      [1, 'comms__fee'],
      [1, 'comms__thread', 3, 'title'],
      [1, 'comms__msg-preview'],
      [1, 'comms__msg-detail'],
      [1, 'comms__msg-section'],
      [1, 'comms__msg-section-label'],
      [1, 'comms__msg-content'],
      [1, 'comms__msg-content', 'comms__msg-content--response'],
    ],
    template: (t, n) => {
      t & 1 &&
        (p(0, 'div', 1)(1, 'div', 2)(2, 'h2'),
        m(3, 'Agent Communications'),
        l(),
        p(4, 'div', 3)(5, 'span', 4),
        m(6),
        l(),
        p(7, 'div', 5)(8, 'button', 6),
        x('click', () => n.setViewMode('list')),
        m(9, 'List'),
        l(),
        p(10, 'button', 6),
        x('click', () => n.setViewMode('network')),
        m(11, 'Network'),
        l()(),
        M(12, Rt, 1, 1, 'app-view-mode-toggle', 7),
        M(13, Ft, 2, 1, 'button', 8),
        p(14, 'span', 9),
        m(15),
        l()()(),
        p(16, 'div', 10)(17, 'div', 11)(18, 'label', 12),
        m(19, 'Agent'),
        l(),
        p(20, 'select', 13),
        x('change', (r) => n.onAgentFilterChange(r)),
        p(21, 'option', 14),
        m(22, 'All Agents'),
        l(),
        $(23, Nt, 2, 2, 'option', 15, nt),
        l()(),
        p(25, 'div', 11)(26, 'label', 12),
        m(27, 'Channel'),
        l(),
        p(28, 'div', 16),
        $(29, Dt, 2, 3, 'button', 17, tt),
        l()(),
        p(31, 'div', 11)(32, 'label', 12),
        m(33, 'Status'),
        l(),
        p(34, 'div', 16),
        $(35, Lt, 2, 3, 'button', 17, tt),
        l()()(),
        M(37, Ht, 1, 2, 'app-agent-network-vis', 18)(38, Vt, 1, 2, 'app-agent-network-3d', 18)(
          39,
          zt,
          1,
          1,
          'app-skeleton',
          19,
        )(40, $t, 1, 2, 'app-empty-state', 20)(41, jt, 4, 0, 'div', 21),
        l()),
        t & 2 &&
          (c(6),
          A('', n.totalMessages(), ' messages'),
          c(2),
          F('ch-chip--active', n.viewMode() === 'list'),
          c(2),
          F('ch-chip--active', n.viewMode() === 'network'),
          c(2),
          w(n.viewMode() === 'network' ? 12 : -1),
          c(),
          w(n.viewMode() === 'list' ? 13 : -1),
          c(),
          N('data-status', n.wsConnected() ? 'on' : 'off'),
          c(),
          A(' ', n.wsConnected() ? 'LIVE' : 'OFFLINE', ' '),
          c(5),
          S('value', n.agentFilter()),
          c(3),
          G(n.agents()),
          c(6),
          G(n.channelFilters),
          c(6),
          G(n.statusFilters),
          c(2),
          w(
            n.viewMode() === 'network' && n.networkViewMode() === 'basic'
              ? 37
              : n.viewMode() === 'network' && n.networkViewMode() === '3d'
                ? 38
                : n.loading()
                  ? 39
                  : n.entries().length === 0
                    ? 40
                    : 41,
          ));
    },
    dependencies: [he, ge, Me, we, De, ce],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem;height:100%;display:flex;flex-direction:column}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-shrink:0;flex-wrap:wrap;gap:.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__actions[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem}.comms__count[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em}.comms__view-toggle[_ngcontent-%COMP%]{display:flex;gap:2px}.comms__status[_ngcontent-%COMP%]{font-size:.6rem;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.1em}.comms__status[data-status=on][_ngcontent-%COMP%]{color:var(--accent-green);background:#00ff881a;border:1px solid rgba(0,255,136,.3);animation:_ngcontent-%COMP%_live-pulse 2s ease-in-out infinite}.comms__status[data-status=off][_ngcontent-%COMP%]{color:var(--accent-red);background:#ff50501a;border:1px solid rgba(255,80,80,.3)}@keyframes _ngcontent-%COMP%_live-pulse{0%,to{opacity:.7}50%{opacity:1}}.btn[_ngcontent-%COMP%]{padding:.4rem .75rem;border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--text-primary)}.comms__filters[_ngcontent-%COMP%]{display:flex;gap:1rem;margin-bottom:.75rem;flex-shrink:0;flex-wrap:wrap;align-items:flex-end}.comms__filter-group[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.comms__filter-label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em}.comms__select[_ngcontent-%COMP%]{padding:.35rem .6rem;font-size:.75rem;font-family:inherit;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-bright);border-radius:var(--radius);outline:none;cursor:pointer;min-width:140px}.comms__select[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan)}.comms__channel-chips[_ngcontent-%COMP%]{display:flex;gap:.25rem;flex-wrap:wrap}.ch-chip[_ngcontent-%COMP%]{padding:.25rem .55rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:20px;color:var(--text-tertiary);font-size:.65rem;font-family:inherit;cursor:pointer;text-transform:uppercase;transition:all .15s}.ch-chip[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-secondary)}.ch-chip--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.comms__timeline[_ngcontent-%COMP%]{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin;scrollbar-color:var(--border-bright) transparent}.comms__msg[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.5rem .75rem;border-left:3px solid var(--border);cursor:pointer;transition:background .1s}.comms__msg[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.comms__msg[data-status=processing][_ngcontent-%COMP%]{background:#ffa04008}.comms__msg[data-status=failed][_ngcontent-%COMP%]{background:#ff505008}.comms__msg-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem}.comms__time[_ngcontent-%COMP%]{font-family:var(--font-mono, monospace);font-size:.65rem;color:var(--text-secondary);opacity:.7;flex-shrink:0}.comms__channel-badge[_ngcontent-%COMP%]{font-size:.55rem;font-weight:700;padding:1px 6px;border-radius:var(--radius-sm);text-transform:uppercase;letter-spacing:.08em;flex-shrink:0}.comms__channel-badge[data-channel=agent-invoke][_ngcontent-%COMP%]{color:#60c0ff;background:#60c0ff14;border:1px solid rgba(96,192,255,.25)}.comms__channel-badge[data-channel=algochat][_ngcontent-%COMP%]{color:var(--accent-cyan);background:#00e5ff14;border:1px solid rgba(0,229,255,.2)}.comms__channel-badge[data-channel=council][_ngcontent-%COMP%]{color:#a78bfa;background:#a78bfa14;border:1px solid rgba(167,139,250,.25)}.comms__channel-badge[data-channel=system][_ngcontent-%COMP%]{color:var(--accent-amber);background:#ffaa0014;border:1px solid rgba(255,170,0,.2)}.comms__status-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;flex-shrink:0}.comms__status-dot[data-status=sent][_ngcontent-%COMP%]{background:var(--accent-cyan)}.comms__status-dot[data-status=processing][_ngcontent-%COMP%]{background:#ffa040;animation:_ngcontent-%COMP%_dot-pulse 1.5s ease-in-out infinite}.comms__status-dot[data-status=completed][_ngcontent-%COMP%]{background:var(--accent-green)}.comms__status-dot[data-status=failed][_ngcontent-%COMP%]{background:var(--accent-red)}@keyframes _ngcontent-%COMP%_dot-pulse{0%,to{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.3)}}.comms__msg-flow[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}.comms__agent-from[_ngcontent-%COMP%]{font-weight:700;font-size:.8rem;flex-shrink:0}.comms__arrow[_ngcontent-%COMP%]{color:var(--text-secondary);opacity:.5;font-size:.7rem;font-family:var(--font-mono, monospace);flex-shrink:0}.comms__arrow[data-status=processing][_ngcontent-%COMP%]{color:#ffa040;opacity:1}.comms__arrow-anim[_ngcontent-%COMP%]{display:inline-block;width:24px;height:2px;background:#ffa040;position:relative;border-radius:1px}.comms__arrow-anim[_ngcontent-%COMP%]:after{content:"";position:absolute;right:0;top:-3px;width:0;height:0;border-left:5px solid #ffa040;border-top:4px solid transparent;border-bottom:4px solid transparent}.comms__agent-to[_ngcontent-%COMP%]{font-weight:500;font-size:.8rem;color:var(--text-secondary);flex-shrink:0}.comms__fee[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-green);font-weight:600;flex-shrink:0}.comms__thread[_ngcontent-%COMP%]{font-size:.6rem;font-family:var(--font-mono, monospace);color:var(--accent-yellow, #ffd700);background:#ffd70014;border:1px solid rgba(255,215,0,.2);padding:1px 5px;border-radius:var(--radius-sm);flex-shrink:0}.comms__msg-preview[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary);margin-top:.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.comms__msg-preview--hidden[_ngcontent-%COMP%]{display:none}.comms__msg-detail[_ngcontent-%COMP%]{margin-top:.5rem}.comms__msg-section[_ngcontent-%COMP%]{margin-bottom:.5rem}.comms__msg-section-label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:.2rem}.comms__msg-content[_ngcontent-%COMP%]{margin:0;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);font-size:.78rem;line-height:1.5;max-height:400px;overflow-y:auto;padding:.5rem;background:var(--bg-deep);border-radius:var(--radius-sm);border:1px solid var(--border)}.comms__msg-content--response[_ngcontent-%COMP%]{border-color:#00ff8826}@media(max-width:767px){.page[_ngcontent-%COMP%]{padding:.75rem}.page__header[_ngcontent-%COMP%]{flex-direction:column;align-items:flex-start;gap:.5rem}.page__actions[_ngcontent-%COMP%]{width:100%;justify-content:space-between}.comms__filters[_ngcontent-%COMP%]{flex-direction:column;gap:.5rem}.comms__select[_ngcontent-%COMP%]{min-width:unset;width:100%}.comms__msg-flow[_ngcontent-%COMP%]{font-size:.75rem}.comms__msg[_ngcontent-%COMP%]{padding:.4rem .5rem}.comms__time[_ngcontent-%COMP%]{font-size:.6rem}.comms__agent-from[_ngcontent-%COMP%], .comms__agent-to[_ngcontent-%COMP%]{font-size:.75rem}}@media(max-width:480px){.page[_ngcontent-%COMP%]{padding:.5rem}.comms__msg-header[_ngcontent-%COMP%]{flex-wrap:wrap}.comms__msg-flow[_ngcontent-%COMP%]{flex-wrap:wrap;gap:.25rem}}@media(prefers-reduced-motion:reduce){.comms__status[data-status=on][_ngcontent-%COMP%]{animation:none}.comms__status-dot[data-status=processing][_ngcontent-%COMP%]{animation:none;opacity:1}}',
    ],
    changeDetection: 0,
  });
};
function Kt(o, _e) {
  o & 1 && D(0, 'app-live-feed');
}
function Qt(o, _e) {
  o & 1 && D(0, 'app-agent-comms');
}
var it = 'comms_view_mode',
  ot = class o {
    view = b(this.loadView());
    setView(e) {
      this.view.set(e), typeof localStorage < 'u' && localStorage.setItem(it, e);
    }
    loadView() {
      if (typeof localStorage < 'u') {
        const e = localStorage.getItem(it);
        if (e === 'feed' || e === 'network') return e;
      }
      return 'feed';
    }
    static \u0275fac = (t) => new (t || o)();
    static \u0275cmp = z({
      type: o,
      selectors: [['app-unified-comms']],
      decls: 12,
      vars: 7,
      consts: [
        [1, 'unified-comms'],
        [1, 'unified-comms__header'],
        [1, 'unified-comms__title'],
        ['role', 'tablist', 'aria-label', 'Comms view mode', 1, 'unified-comms__modes'],
        ['role', 'tab', 1, 'unified-comms__mode-btn', 3, 'click'],
        [1, 'unified-comms__content'],
      ],
      template: (t, n) => {
        if (
          (t & 1 &&
            (p(0, 'div', 0)(1, 'header', 1)(2, 'h2', 2),
            m(3, 'Comms'),
            l(),
            p(4, 'div', 3)(5, 'button', 4),
            x('click', () => n.setView('feed')),
            m(6, ' Feed '),
            l(),
            p(7, 'button', 4),
            x('click', () => n.setView('network')),
            m(8, ' Network '),
            l()()(),
            p(9, 'div', 5),
            M(10, Kt, 1, 0, 'app-live-feed')(11, Qt, 1, 0, 'app-agent-comms'),
            l()()),
          t & 2)
        ) {
          let i;
          c(5),
            F('unified-comms__mode-btn--active', n.view() === 'feed'),
            N('aria-selected', n.view() === 'feed'),
            c(2),
            F('unified-comms__mode-btn--active', n.view() === 'network'),
            N('aria-selected', n.view() === 'network'),
            c(3),
            w((i = n.view()) === 'feed' ? 10 : i === 'network' ? 11 : -1);
        }
      },
      dependencies: [xe, Ee],
      styles: [
        '.unified-comms[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100%}.unified-comms__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.25rem;background:#0c0d144d;border-bottom:1px solid var(--border-subtle);flex-shrink:0}.unified-comms__title[_ngcontent-%COMP%]{font-size:.95rem;font-weight:600;color:var(--text-primary);margin:0}.unified-comms__modes[_ngcontent-%COMP%]{display:flex;gap:0;background:var(--glass-bg-solid);border:1px solid var(--border-subtle);border-radius:6px;overflow:hidden}.unified-comms__mode-btn[_ngcontent-%COMP%]{padding:.35rem .85rem;font-size:.72rem;font-weight:600;font-family:inherit;letter-spacing:.03em;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;transition:color .15s,background .15s}.unified-comms__mode-btn[_ngcontent-%COMP%]:hover{color:var(--text-primary);background:var(--bg-hover)}.unified-comms__mode-btn--active[_ngcontent-%COMP%]{color:var(--accent-cyan);background:var(--accent-cyan-subtle);text-shadow:0 0 8px var(--accent-cyan-border)}.unified-comms__content[_ngcontent-%COMP%]{flex:1;overflow-y:auto}@media(max-width:767px){.unified-comms__header[_ngcontent-%COMP%]{padding:.5rem .75rem}.unified-comms__mode-btn[_ngcontent-%COMP%]{padding:.3rem .65rem;font-size:.68rem}}',
      ],
      changeDetection: 0,
    });
  };

export { ot as UnifiedCommsComponent };
