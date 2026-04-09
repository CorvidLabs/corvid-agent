import { a as te } from './chunk-2EJE5M6O.js';
import { a as A } from './chunk-355WLUEG.js';
import { r as ee, k as J, b as q, l as W, d as X, f as Y, m as Z } from './chunk-AF4UDQOX.js';
import { a as N } from './chunk-FGNIWOFY.js';
import './chunk-G7DVZDMF.js';
import { b as D } from './chunk-D6WCRQHB.js';
import { e as H } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  jb as _,
  Nb as B,
  Qb as b,
  ob as C,
  Bb as c,
  Pb as d,
  nb as E,
  Wb as F,
  Mb as f,
  Sb as G,
  ja as g,
  vb as h,
  _a as I,
  O as K,
  Rb as k,
  rb as M,
  ib as m,
  pb as n,
  mb as O,
  Na as o,
  ac as P,
  zb as p,
  bc as Q,
  Ob as r,
  hb as S,
  T,
  qb as t,
  Y as u,
  Lb as V,
  Z as v,
  $b as w,
  q as y,
  fc as z,
} from './chunk-LF4EWAJA.js';

var oe = (_a, i) => i.agentId,
  le = (_a, i) => i.name,
  ie = (_a, i) => i.id,
  se = (_a, i) => i.memoryId;
function ce(a, _i) {
  a & 1 && (n(0, 'div', 1), M(1, 'app-skeleton', 2), t()), a & 2 && (o(), C('count', 4));
}
function de(a, _i) {
  if ((a & 1 && r(0), a & 2)) {
    const e = c(3);
    b(' \xB7 ', e.syncStatus().pendingCount, ' pending ');
  }
}
function me(a, _i) {
  if ((a & 1 && r(0), a & 2)) {
    const e = c(3);
    b(' \xB7 ', e.syncStatus().failedCount, ' failed ');
  }
}
function _e(a, _i) {
  if ((a & 1 && (r(0), w(1, 'relativeTime')), a & 2)) {
    const e = c(3);
    b(' \xB7 Last sync: ', P(1, 1, e.syncStatus().lastSyncAt), ' ');
  }
}
function pe(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 22),
      M(1, 'span', 23),
      n(2, 'span', 24),
      r(3),
      m(4, de, 1, 1),
      m(5, me, 1, 1),
      m(6, _e, 2, 3),
      t()()),
    a & 2)
  ) {
    const e = c(2);
    f('sync-banner--ok', e.syncStatus().isRunning)('sync-banner--warn', !e.syncStatus().isRunning),
      o(3),
      b(' Sync ', e.syncStatus().isRunning ? 'Active' : 'Inactive', ' '),
      o(),
      _(e.syncStatus().pendingCount > 0 ? 4 : -1),
      o(),
      _(e.syncStatus().failedCount > 0 ? 5 : -1),
      o(),
      _(e.syncStatus().lastSyncAt ? 6 : -1);
  }
}
function ge(a, _i) {
  if ((a & 1 && (n(0, 'div', 37)(1, 'span', 27), r(2, 'Observations'), t(), n(3, 'span', 38), r(4), t()()), a & 2)) {
    const e = c(3);
    o(4), d(e.obsStats().totalActive);
  }
}
function ue(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 4)(1, 'h3'),
      r(2, 'Tier Breakdown'),
      t(),
      n(3, 'div', 39)(4, 'div', 40)(5, 'span', 41),
      r(6),
      t()(),
      n(7, 'div', 42)(8, 'span', 41),
      r(9),
      t()()()()),
    a & 2)
  ) {
    const e = c(3);
    o(4),
      V('flex', e.stats().byTier.longterm),
      C('title', `Long-term: ${e.stats().byTier.longterm}`),
      o(2),
      b('LT (', e.stats().byTier.longterm, ')'),
      o(),
      V('flex', e.stats().byTier.shortterm),
      C('title', `Short-term: ${e.stats().byTier.shortterm}`),
      o(2),
      b('ST (', e.stats().byTier.shortterm, ')');
  }
}
function ve(a, i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 46),
      p('click', () => {
        const s = u(e).$implicit,
          x = c(4);
        return v(x.filterByAgent(s.agentId));
      }),
      n(1, 'span', 47),
      r(2),
      t(),
      n(3, 'span'),
      r(4),
      t(),
      n(5, 'span', 48),
      r(6),
      t(),
      n(7, 'span', 49),
      r(8),
      t()();
  }
  if (a & 2) {
    const e = i.$implicit;
    o(2), d(e.agentName), o(2), d(e.total), o(2), d(e.longterm), o(2), d(e.shortterm);
  }
}
function xe(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 4)(1, 'h3'),
      r(2, 'Memories by Agent'),
      t(),
      n(3, 'div', 43)(4, 'div', 44)(5, 'span'),
      r(6, 'Agent'),
      t(),
      n(7, 'span'),
      r(8, 'Total'),
      t(),
      n(9, 'span'),
      r(10, 'Long-term'),
      t(),
      n(11, 'span'),
      r(12, 'Short-term'),
      t()(),
      O(13, ve, 9, 4, 'div', 45, oe),
      t()()),
    a & 2)
  ) {
    const e = c(3);
    o(13), E(e.stats().byAgent);
  }
}
function be(a, i) {
  if (a & 1) {
    const e = h();
    n(0, 'button', 8),
      p('click', () => {
        const s = u(e).$implicit,
          x = c(4);
        return v(x.toggleCategory(s.name));
      }),
      r(1),
      t();
  }
  if (a & 2) {
    const e = i.$implicit,
      l = c(4);
    f('chip--active', l.categoryFilter() === e.name), o(), k(' ', e.name, ' (', e.count, ') ');
  }
}
function fe(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 4)(1, 'h3'), r(2, 'Categories'), t(), n(3, 'div', 50), O(4, be, 2, 4, 'button', 51, le), t()()),
    a & 2)
  ) {
    const e = c(3);
    o(4), E(e.categoryEntries());
  }
}
function Ce(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 25)(1, 'div', 26)(2, 'span', 27),
      r(3, 'Total Memories'),
      t(),
      n(4, 'span', 28),
      r(5),
      t()(),
      n(6, 'div', 29)(7, 'span', 27),
      r(8, 'Long-term'),
      t(),
      n(9, 'span', 30),
      r(10),
      t()(),
      n(11, 'div', 31)(12, 'span', 27),
      r(13, 'Short-term'),
      t(),
      n(14, 'span', 32),
      r(15),
      t()(),
      n(16, 'div', 26)(17, 'span', 27),
      r(18, 'Avg Decay'),
      t(),
      n(19, 'span', 33),
      r(20),
      w(21, 'number'),
      t()(),
      n(22, 'div', 26)(23, 'span', 27),
      r(24, 'Confirmed'),
      t(),
      n(25, 'span', 34),
      r(26),
      t()(),
      n(27, 'div', 26)(28, 'span', 27),
      r(29, 'Pending'),
      t(),
      n(30, 'span', 35),
      r(31),
      t()(),
      n(32, 'div', 26)(33, 'span', 27),
      r(34, 'Failed'),
      t(),
      n(35, 'span', 36),
      r(36),
      t()(),
      m(37, ge, 5, 1, 'div', 37),
      t(),
      m(38, ue, 10, 8, 'div', 4),
      m(39, xe, 15, 0, 'div', 4),
      m(40, fe, 6, 0, 'div', 4)),
    a & 2)
  ) {
    const e = c(2);
    o(5),
      d(e.stats().totalMemories),
      o(5),
      d(e.stats().byTier.longterm),
      o(5),
      d(e.stats().byTier.shortterm),
      o(5),
      d(e.stats().averageDecayScore !== null ? Q(21, 11, e.stats().averageDecayScore, '1.2-2') : '\u2014'),
      o(6),
      d(e.stats().byStatus.confirmed),
      o(5),
      d(e.stats().byStatus.pending),
      o(5),
      d(e.stats().byStatus.failed),
      o(),
      _(e.obsStats() ? 37 : -1),
      o(),
      _(e.stats().totalMemories > 0 ? 38 : -1),
      o(),
      _(e.stats().byAgent.length > 0 ? 39 : -1),
      o(),
      _(e.categoryEntries().length > 0 ? 40 : -1);
  }
}
function ye(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'button', 52),
      p('click', () => {
        u(e);
        const s = c(2);
        return v(s.clearAgentFilter());
      }),
      r(1),
      t();
  }
  if (a & 2) {
    const e = c(2);
    o(), b('Agent: ', e.agentFilter(), ' \xD7');
  }
}
function he(a, _i) {
  a & 1 && (n(0, 'p', 1), r(1, 'Searching...'), t());
}
function Me(a, _i) {
  a & 1 &&
    (n(0, 'div', 58)(1, 'pre', 60),
    r(
      2,
      `  _____
 / o o \\
|  ___  |
 \\_____/`,
    ),
    t(),
    n(3, 'p'),
    r(4, 'No memories found'),
    t()());
}
function we(a, _i) {
  if ((a & 1 && (n(0, 'span', 69), r(1), t()), a & 2)) {
    const e = c().$implicit;
    o(), d(e.category);
  }
}
function Se(a, _i) {
  if ((a & 1 && (n(0, 'div', 72)(1, 'span', 73), r(2, 'TXID'), t(), n(3, 'span', 78), r(4), t()()), a & 2)) {
    const e = c(2).$implicit;
    o(4), d(e.txid);
  }
}
function Pe(a, _i) {
  if ((a & 1 && (n(0, 'div', 72)(1, 'span', 73), r(2, 'ASA ID'), t(), n(3, 'span', 79), r(4), t()()), a & 2)) {
    const e = c(2).$implicit;
    o(4), d(e.asaId);
  }
}
function Oe(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 71)(1, 'div', 72)(2, 'span', 73),
      r(3, 'ID'),
      t(),
      n(4, 'span', 74),
      r(5),
      t()(),
      n(6, 'div', 72)(7, 'span', 73),
      r(8, 'Agent'),
      t(),
      n(9, 'span', 75),
      r(10),
      t()(),
      n(11, 'div', 72)(12, 'span', 73),
      r(13, 'Storage'),
      t(),
      n(14, 'span', 75),
      r(15),
      t()(),
      m(16, Se, 5, 1, 'div', 72),
      m(17, Pe, 5, 1, 'div', 72),
      n(18, 'div', 72)(19, 'span', 73),
      r(20, 'Decay'),
      t(),
      n(21, 'span', 75),
      r(22),
      w(23, 'number'),
      t()(),
      n(24, 'div', 72)(25, 'span', 73),
      r(26, 'Created'),
      t(),
      n(27, 'span', 75),
      r(28),
      t()(),
      n(29, 'div', 72)(30, 'span', 73),
      r(31, 'Updated'),
      t(),
      n(32, 'span', 75),
      r(33),
      t()(),
      n(34, 'div', 76)(35, 'span', 73),
      r(36, 'Content'),
      t(),
      n(37, 'pre', 77),
      r(38),
      t()()()),
    a & 2)
  ) {
    const e = c().$implicit,
      l = c(4);
    o(5),
      d(e.id),
      o(5),
      d(e.agentId),
      o(4),
      S('data-storage', e.storageType),
      o(),
      d(l.storageLabel(e.storageType)),
      o(),
      _(e.txid ? 16 : -1),
      o(),
      _(e.asaId ? 17 : -1),
      o(5),
      d(Q(23, 10, e.decayScore, '1.4-4')),
      o(6),
      d(e.createdAt),
      o(5),
      d(e.updatedAt),
      o(5),
      d(e.content);
  }
}
function Ee(a, i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 62),
      p('click', () => {
        const s = u(e).$implicit,
          x = c(4);
        return v(x.toggleExpand(s.id));
      }),
      n(1, 'div', 63)(2, 'span', 64),
      r(3),
      t(),
      n(4, 'span', 65),
      r(5),
      t(),
      n(6, 'span', 66),
      r(7),
      t(),
      n(8, 'span', 67),
      r(9),
      t(),
      n(10, 'span', 68),
      r(11),
      t(),
      m(12, we, 2, 1, 'span', 69),
      n(13, 'span', 70),
      r(14),
      w(15, 'relativeTime'),
      t()(),
      m(16, Oe, 39, 13, 'div', 71),
      t();
  }
  if (a & 2) {
    const e = i.$implicit,
      l = c(4);
    f('memory-card--expanded', l.expandedId() === e.id),
      o(2),
      S('data-tier', e.tier),
      o(),
      d(e.tier === 'longterm' ? 'LT' : 'ST'),
      o(),
      S('data-storage', e.storageType),
      o(),
      d(l.storageLabel(e.storageType)),
      o(2),
      d(e.key),
      o(),
      S('data-status', e.status),
      o(),
      d(e.status),
      o(),
      C('title', `Decay score: ${e.decayScore.toFixed(3)}`),
      o(),
      b(' ', l.decayBar(e.decayScore), ' '),
      o(),
      _(e.category ? 12 : -1),
      o(2),
      d(P(15, 14, e.updatedAt)),
      o(2),
      _(l.expandedId() === e.id ? 16 : -1);
  }
}
function ke(a, _i) {
  if ((a & 1 && (n(0, 'div', 59), O(1, Ee, 17, 16, 'div', 61, ie), t()), a & 2)) {
    const e = c(3);
    o(), E(e.memories());
  }
}
function Te(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 4)(1, 'div', 53)(2, 'span', 54),
      r(3),
      t(),
      n(4, 'div', 55)(5, 'button', 56),
      p('click', () => {
        u(e);
        const s = c(2);
        return v(s.prevPage());
      }),
      r(6, 'Prev'),
      t(),
      n(7, 'span', 57),
      r(8),
      t(),
      n(9, 'button', 56),
      p('click', () => {
        u(e);
        const s = c(2);
        return v(s.nextPage());
      }),
      r(10, 'Next'),
      t()()(),
      m(11, Me, 5, 0, 'div', 58)(12, ke, 3, 0, 'div', 59),
      t();
  }
  if (a & 2) {
    const e = c(2);
    o(3),
      b('', e.listTotal(), ' memories'),
      o(2),
      C('disabled', e.currentOffset() === 0),
      o(3),
      k('', e.currentOffset() + 1, '\u2013', e.Math.min(e.currentOffset() + e.pageSize(), e.listTotal())),
      o(),
      C('disabled', e.currentOffset() + e.pageSize() >= e.listTotal()),
      o(2),
      _(e.memories().length === 0 ? 11 : 12);
  }
}
function Ie(a, i) {
  if (
    (a & 1 &&
      (n(0, 'div', 80)(1, 'span', 81),
      r(2),
      t(),
      n(3, 'span', 82),
      r(4),
      t(),
      n(5, 'span', 83),
      r(6),
      w(7, 'relativeTime'),
      t()()),
    a & 2)
  ) {
    const e = i.$implicit;
    o(2), d(e.key), o(2), d(e.error), o(2), d(P(7, 3, e.failedAt));
  }
}
function Ve(a, _i) {
  if (
    (a & 1 && (n(0, 'div', 12)(1, 'h3'), r(2, 'Recent Sync Errors'), t(), O(3, Ie, 8, 5, 'div', 80, se), t()), a & 2)
  ) {
    const e = c(2);
    o(3), E(e.syncStatus().recentErrors);
  }
}
function Be(a, _i) {
  if ((a & 1 && r(0), a & 2)) {
    const e = c(3);
    b(' \xB7 ', e.obsStats().graduationCandidates, ' ready to graduate ');
  }
}
function Fe(a, _i) {
  if ((a & 1 && (n(0, 'span', 14), r(1), m(2, Be, 1, 1), t()), a & 2)) {
    const e = c(2);
    o(), b(' ', e.obsStats().totalActive, ' active '), o(), _(e.obsStats().graduationCandidates > 0 ? 2 : -1);
  }
}
function ze(a, _i) {
  a & 1 && (n(0, 'p', 1), r(1, 'Loading observations...'), t());
}
function De(a, _i) {
  a & 1 && (n(0, 'p', 20), r(1, 'No observations found'), t());
}
function Ae(a, _i) {
  if ((a & 1 && (n(0, 'div', 72)(1, 'span', 73), r(2, 'Key'), t(), n(3, 'span', 74), r(4), t()()), a & 2)) {
    const e = c(2).$implicit;
    o(4), d(e.suggestedKey);
  }
}
function Ne(a, _i) {
  if ((a & 1 && (n(0, 'div', 72)(1, 'span', 73), r(2, 'Graduated'), t(), n(3, 'span', 93), r(4), t()()), a & 2)) {
    const e = c(2).$implicit;
    o(4), d(e.graduatedKey);
  }
}
function Le(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 72)(1, 'span', 73), r(2, 'Expires'), t(), n(3, 'span', 75), r(4), w(5, 'relativeTime'), t()()),
    a & 2)
  ) {
    const e = c(2).$implicit;
    o(4), d(P(5, 1, e.expiresAt));
  }
}
function $e(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 92)(1, 'button', 94),
      p('click', (s) => {
        u(e);
        const x = c(2).$implicit,
          j = c(3);
        return v(j.forceGraduate(x.id, s));
      }),
      r(2),
      t(),
      n(3, 'button', 95),
      p('click', (s) => {
        u(e);
        const x = c(2).$implicit,
          j = c(3);
        return v(j.boostObs(x.id, s));
      }),
      r(4, ' Boost +1 '),
      t()();
  }
  if (a & 2) {
    const e = c(2).$implicit,
      l = c(3);
    o(),
      C('disabled', l.graduatingId() === e.id),
      o(),
      b(' ', l.graduatingId() === e.id ? 'Graduating...' : 'Force Graduate', ' ');
  }
}
function Re(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 91)(1, 'div', 72)(2, 'span', 73),
      r(3, 'ID'),
      t(),
      n(4, 'span', 74),
      r(5),
      t()(),
      n(6, 'div', 72)(7, 'span', 73),
      r(8, 'Agent'),
      t(),
      n(9, 'span', 75),
      r(10),
      t()(),
      n(11, 'div', 72)(12, 'span', 73),
      r(13, 'Source'),
      t(),
      n(14, 'span', 75),
      r(15),
      t()(),
      m(16, Ae, 5, 1, 'div', 72),
      n(17, 'div', 72)(18, 'span', 73),
      r(19, 'Score'),
      t(),
      n(20, 'span', 75),
      r(21),
      t()(),
      m(22, Ne, 5, 1, 'div', 72),
      m(23, Le, 6, 3, 'div', 72),
      n(24, 'div', 72)(25, 'span', 73),
      r(26, 'Created'),
      t(),
      n(27, 'span', 75),
      r(28),
      t()(),
      n(29, 'div', 76)(30, 'span', 73),
      r(31, 'Content'),
      t(),
      n(32, 'pre', 77),
      r(33),
      t()(),
      m(34, $e, 5, 2, 'div', 92),
      t()),
    a & 2)
  ) {
    const e = c().$implicit;
    o(5),
      d(e.id),
      o(5),
      d(e.agentId),
      o(5),
      k('', e.source, '', e.sourceId ? ` (${e.sourceId})` : ''),
      o(),
      _(e.suggestedKey ? 16 : -1),
      o(5),
      k('', e.relevanceScore.toFixed(2), ' (', e.accessCount, ' accesses)'),
      o(),
      _(e.graduatedKey ? 22 : -1),
      o(),
      _(e.expiresAt ? 23 : -1),
      o(5),
      d(e.createdAt),
      o(5),
      d(e.content),
      o(),
      _(e.status === 'active' ? 34 : -1);
  }
}
function je(a, i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 85),
      p('click', () => {
        const s = u(e).$implicit,
          x = c(3);
        return v(x.toggleObsExpand(s.id));
      }),
      n(1, 'div', 86)(2, 'span', 87),
      r(3),
      t(),
      n(4, 'span', 88),
      r(5),
      t(),
      n(6, 'span', 89),
      r(7),
      t(),
      n(8, 'span', 90),
      r(9),
      t()(),
      m(10, Re, 35, 12, 'div', 91),
      t();
  }
  if (a & 2) {
    const e = i.$implicit,
      l = c(3);
    f('obs-card--expanded', l.expandedObsId() === e.id),
      o(2),
      S('data-source', e.source),
      o(),
      d(e.source),
      o(2),
      k('', e.content.slice(0, 80), '', e.content.length > 80 ? '...' : ''),
      o(),
      C('title', `Relevance: ${e.relevanceScore.toFixed(1)} / Access: ${e.accessCount}`),
      o(),
      k(' ', l.relevanceBar(e.relevanceScore), ' ', e.relevanceScore.toFixed(1), ' '),
      o(),
      S('data-obs-status', e.status),
      o(),
      d(e.status),
      o(),
      _(l.expandedObsId() === e.id ? 10 : -1);
  }
}
function Qe(a, _i) {
  if ((a & 1 && (n(0, 'div', 21), O(1, je, 11, 12, 'div', 84, ie), t()), a & 2)) {
    const e = c(2);
    o(), E(e.observations());
  }
}
function Ue(a, _i) {
  if (a & 1) {
    const e = h();
    m(0, pe, 7, 8, 'div', 3),
      m(1, Ce, 41, 14),
      n(2, 'div', 4)(3, 'h3'),
      r(4, 'Memory Explorer'),
      t(),
      n(5, 'div', 5)(6, 'input', 6),
      p('input', (s) => {
        u(e);
        const x = c();
        return v(x.onSearchInput(s));
      })('keydown.enter', () => {
        u(e);
        const s = c();
        return v(s.applySearch());
      }),
      t(),
      n(7, 'div', 7)(8, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setTier(null));
      }),
      r(9, 'All'),
      t(),
      n(10, 'button', 9),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setTier('longterm'));
      }),
      r(11, 'Long-term'),
      t(),
      n(12, 'button', 10),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setTier('shortterm'));
      }),
      r(13, 'Short-term'),
      t()(),
      n(14, 'div', 7)(15, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setStatus(null));
      }),
      r(16, 'All'),
      t(),
      n(17, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setStatus('confirmed'));
      }),
      r(18, 'Confirmed'),
      t(),
      n(19, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setStatus('pending'));
      }),
      r(20, 'Pending'),
      t(),
      n(21, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setStatus('failed'));
      }),
      r(22, 'Failed'),
      t()(),
      m(23, ye, 2, 1, 'button', 11),
      t()(),
      m(24, he, 2, 0, 'p', 1)(25, Te, 13, 6, 'div', 4),
      m(26, Ve, 5, 0, 'div', 12),
      n(27, 'div', 4)(28, 'div', 13)(29, 'h3'),
      r(30, 'Observations'),
      t(),
      m(31, Fe, 3, 2, 'span', 14),
      t(),
      n(32, 'div', 15)(33, 'button', 8),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setObsStatus(null));
      }),
      r(34, 'All'),
      t(),
      n(35, 'button', 16),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setObsStatus('active'));
      }),
      r(36, 'Active'),
      t(),
      n(37, 'button', 17),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setObsStatus('graduated'));
      }),
      r(38, 'Graduated'),
      t(),
      n(39, 'button', 18),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setObsStatus('expired'));
      }),
      r(40, 'Expired'),
      t(),
      n(41, 'button', 19),
      p('click', () => {
        u(e);
        const s = c();
        return v(s.setObsStatus('dismissed'));
      }),
      r(42, 'Dismissed'),
      t()(),
      m(43, ze, 2, 0, 'p', 1)(44, De, 2, 0, 'p', 20)(45, Qe, 3, 0, 'div', 21),
      t();
  }
  if (a & 2) {
    const e = c();
    _(e.syncStatus() ? 0 : -1),
      o(),
      _(e.stats() ? 1 : -1),
      o(5),
      C('value', e.searchQuery()),
      o(2),
      f('chip--active', e.tierFilter() === null),
      o(2),
      f('chip--active', e.tierFilter() === 'longterm'),
      o(2),
      f('chip--active', e.tierFilter() === 'shortterm'),
      o(3),
      f('chip--active', e.statusFilter() === null),
      o(2),
      f('chip--active', e.statusFilter() === 'confirmed'),
      o(2),
      f('chip--active', e.statusFilter() === 'pending'),
      o(2),
      f('chip--active', e.statusFilter() === 'failed'),
      o(2),
      _(e.agentFilter() ? 23 : -1),
      o(),
      _(e.listLoading() ? 24 : 25),
      o(2),
      _(e.syncStatus() && e.syncStatus().recentErrors.length > 0 ? 26 : -1),
      o(5),
      _(e.obsStats() ? 31 : -1),
      o(2),
      f('chip--active', e.obsStatusFilter() === null),
      o(2),
      f('chip--active', e.obsStatusFilter() === 'active'),
      o(2),
      f('chip--active', e.obsStatusFilter() === 'graduated'),
      o(2),
      f('chip--active', e.obsStatusFilter() === 'expired'),
      o(2),
      f('chip--active', e.obsStatusFilter() === 'dismissed'),
      o(2),
      _(e.obsLoading() ? 43 : e.observations().length === 0 ? 44 : 45);
  }
}
var L = class a {
  Math = Math;
  api = T(D);
  loading = g(!0);
  listLoading = g(!1);
  stats = g(null);
  syncStatus = g(null);
  memories = g([]);
  listTotal = g(0);
  expandedId = g(null);
  observations = g([]);
  obsStats = g(null);
  obsLoading = g(!1);
  obsStatusFilter = g('active');
  expandedObsId = g(null);
  graduatingId = g(null);
  searchQuery = g('');
  tierFilter = g(null);
  statusFilter = g(null);
  categoryFilter = g(null);
  agentFilter = g(null);
  currentOffset = g(0);
  categoryEntries = z(() => {
    const i = this.stats();
    return i
      ? Object.entries(i.byCategory)
          .map(([e, l]) => ({ name: e, count: l }))
          .sort((e, l) => l.count - e.count)
      : [];
  });
  pageSize() {
    return 50;
  }
  ngOnInit() {
    this.loadAll();
  }
  setTier(i) {
    this.tierFilter.set(i), this.currentOffset.set(0), this.loadMemories();
  }
  setStatus(i) {
    this.statusFilter.set(i), this.currentOffset.set(0), this.loadMemories();
  }
  toggleCategory(i) {
    this.categoryFilter.set(this.categoryFilter() === i ? null : i), this.currentOffset.set(0), this.loadMemories();
  }
  filterByAgent(i) {
    this.agentFilter.set(i), this.currentOffset.set(0), this.loadMemories();
  }
  clearAgentFilter() {
    this.agentFilter.set(null), this.currentOffset.set(0), this.loadMemories();
  }
  onSearchInput(i) {
    this.searchQuery.set(i.target.value);
  }
  applySearch() {
    this.currentOffset.set(0), this.loadMemories();
  }
  toggleExpand(i) {
    this.expandedId.set(this.expandedId() === i ? null : i);
  }
  prevPage() {
    this.currentOffset.set(Math.max(0, this.currentOffset() - this.pageSize())), this.loadMemories();
  }
  nextPage() {
    this.currentOffset.set(this.currentOffset() + this.pageSize()), this.loadMemories();
  }
  decayBar(i) {
    const e = Math.round(i * 6);
    return '\u2588'.repeat(e) + '\u2591'.repeat(6 - e);
  }
  storageLabel(i) {
    switch (i) {
      case 'arc69':
        return 'ARC-69';
      case 'plain-txn':
        return 'Plain Txn';
      case 'pending':
        return 'Pending';
    }
  }
  relevanceBar(i) {
    const e = Math.min(i, 5),
      l = Math.round(e);
    return '\u2B50'.repeat(l);
  }
  setObsStatus(i) {
    this.obsStatusFilter.set(i), this.loadObservations();
  }
  toggleObsExpand(i) {
    this.expandedObsId.set(this.expandedObsId() === i ? null : i);
  }
  async forceGraduate(i, e) {
    e.stopPropagation(), this.graduatingId.set(i);
    try {
      await y(this.api.post(`/dashboard/memories/observations/${i}/graduate`, {})),
        await Promise.all([this.loadObservations(), this.loadMemories()]);
      const [l, s] = await Promise.all([
        y(this.api.get('/dashboard/memories/stats')),
        y(this.api.get('/dashboard/memories/observations/stats')),
      ]);
      this.stats.set(l), this.obsStats.set(s);
    } catch {
    } finally {
      this.graduatingId.set(null);
    }
  }
  async boostObs(i, e) {
    e.stopPropagation();
    try {
      await y(this.api.post(`/dashboard/memories/observations/${i}/boost`, {})), await this.loadObservations();
    } catch {}
  }
  async loadAll() {
    this.loading.set(!0);
    try {
      const [i, e, l, s] = await Promise.all([
        y(this.api.get('/dashboard/memories/stats')),
        y(this.api.get('/dashboard/memories/sync-status')),
        y(this.api.get('/dashboard/memories?limit=50&offset=0')),
        y(this.api.get('/dashboard/memories/observations/stats')).catch(() => null),
      ]);
      this.stats.set(i),
        this.syncStatus.set(e),
        this.memories.set(l.entries),
        this.listTotal.set(l.total),
        this.obsStats.set(s),
        this.loadObservations();
    } catch {
    } finally {
      this.loading.set(!1);
    }
  }
  async loadObservations() {
    this.obsLoading.set(!0);
    try {
      const i = new URLSearchParams();
      this.obsStatusFilter() && i.set('status', this.obsStatusFilter()),
        this.agentFilter() && i.set('agentId', this.agentFilter()),
        i.set('limit', '50');
      const e = await y(this.api.get(`/dashboard/memories/observations?${i.toString()}`));
      this.observations.set(e.observations);
    } catch {
    } finally {
      this.obsLoading.set(!1);
    }
  }
  async loadMemories() {
    this.listLoading.set(!0);
    try {
      const i = new URLSearchParams();
      i.set('limit', String(this.pageSize())),
        i.set('offset', String(this.currentOffset())),
        this.tierFilter() && i.set('tier', this.tierFilter()),
        this.statusFilter() && i.set('status', this.statusFilter()),
        this.categoryFilter() && i.set('category', this.categoryFilter()),
        this.agentFilter() && i.set('agentId', this.agentFilter()),
        this.searchQuery().trim() && i.set('search', this.searchQuery().trim());
      const e = await y(this.api.get(`/dashboard/memories?${i.toString()}`));
      this.memories.set(e.entries), this.listTotal.set(e.total), this.expandedId.set(null);
    } catch {
    } finally {
      this.listLoading.set(!1);
    }
  }
  static \u0275fac = (e) => new (e || a)();
  static \u0275cmp = I({
    type: a,
    selectors: [['app-brain-viewer']],
    decls: 5,
    vars: 1,
    consts: [
      [1, 'brain-viewer'],
      [1, 'loading'],
      ['variant', 'card', 3, 'count'],
      [1, 'sync-banner', 3, 'sync-banner--ok', 'sync-banner--warn'],
      [1, 'section'],
      [1, 'filters'],
      ['type', 'text', 'placeholder', 'Search memories...', 1, 'search-input', 3, 'input', 'keydown.enter', 'value'],
      [1, 'filter-chips'],
      [1, 'chip', 3, 'click'],
      [1, 'chip', 'chip--lt', 3, 'click'],
      [1, 'chip', 'chip--st', 3, 'click'],
      [1, 'chip', 'chip--clear'],
      [1, 'section', 'section--errors'],
      [1, 'obs-header'],
      [1, 'obs-header__meta'],
      [1, 'filter-chips', 2, 'margin-bottom', '0.75rem'],
      [1, 'chip', 'chip--obs-active', 3, 'click'],
      [1, 'chip', 'chip--obs-graduated', 3, 'click'],
      [1, 'chip', 'chip--obs-expired', 3, 'click'],
      [1, 'chip', 'chip--obs-dismissed', 3, 'click'],
      [1, 'obs-empty'],
      [1, 'obs-list'],
      [1, 'sync-banner'],
      [1, 'sync-banner__indicator'],
      [1, 'sync-banner__text'],
      [1, 'stats-cards'],
      [1, 'stat-card'],
      [1, 'stat-card__label'],
      [1, 'stat-card__value'],
      [1, 'stat-card', 'stat-card--longterm'],
      [1, 'stat-card__value', 'stat-card__value--longterm'],
      [1, 'stat-card', 'stat-card--shortterm'],
      [1, 'stat-card__value', 'stat-card__value--shortterm'],
      [1, 'stat-card__value', 'stat-card__value--decay'],
      [1, 'stat-card__value', 'stat-card__value--confirmed'],
      [1, 'stat-card__value', 'stat-card__value--pending'],
      [1, 'stat-card__value', 'stat-card__value--failed'],
      [1, 'stat-card', 'stat-card--observations'],
      [1, 'stat-card__value', 'stat-card__value--observations'],
      [1, 'tier-bar'],
      [1, 'tier-bar__segment', 'tier-bar__segment--longterm', 3, 'title'],
      [1, 'tier-bar__label'],
      [1, 'tier-bar__segment', 'tier-bar__segment--shortterm', 3, 'title'],
      [1, 'agent-table'],
      [1, 'agent-table__header'],
      [1, 'agent-table__row'],
      [1, 'agent-table__row', 3, 'click'],
      [1, 'agent-name'],
      [1, 'longterm-val'],
      [1, 'shortterm-val'],
      [1, 'category-chips'],
      [1, 'chip', 3, 'chip--active'],
      [1, 'chip', 'chip--clear', 3, 'click'],
      [1, 'list-header'],
      [1, 'list-header__count'],
      [1, 'pagination'],
      [1, 'btn--sm', 3, 'click', 'disabled'],
      [1, 'page-info'],
      [1, 'empty-state'],
      [1, 'memory-list'],
      [1, 'empty-state__icon'],
      [1, 'memory-card', 3, 'memory-card--expanded'],
      [1, 'memory-card', 3, 'click'],
      [1, 'memory-card__header'],
      [1, 'memory-card__tier'],
      [1, 'memory-card__storage'],
      [1, 'memory-card__key'],
      [1, 'memory-card__status'],
      [1, 'memory-card__decay', 3, 'title'],
      [1, 'memory-card__category'],
      [1, 'memory-card__time'],
      [1, 'memory-card__detail'],
      [1, 'detail-row'],
      [1, 'detail-label'],
      [1, 'detail-value', 'detail-value--mono'],
      [1, 'detail-value'],
      [1, 'detail-content'],
      [1, 'detail-pre'],
      [1, 'detail-value', 'detail-value--mono', 'detail-value--txid'],
      [1, 'detail-value', 'detail-value--mono', 'detail-value--asa'],
      [1, 'error-row'],
      [1, 'error-row__key'],
      [1, 'error-row__msg'],
      [1, 'error-row__time'],
      [1, 'obs-card', 3, 'obs-card--expanded'],
      [1, 'obs-card', 3, 'click'],
      [1, 'obs-card__header'],
      [1, 'obs-card__source'],
      [1, 'obs-card__content-preview'],
      [1, 'obs-card__score', 3, 'title'],
      [1, 'obs-card__status'],
      [1, 'obs-card__detail'],
      [1, 'obs-card__actions'],
      [1, 'detail-value', 'detail-value--mono', 2, 'color', 'var(--accent-green)'],
      [1, 'btn--action', 'btn--graduate', 3, 'click', 'disabled'],
      [1, 'btn--action', 'btn--boost', 3, 'click'],
    ],
    template: (e, l) => {
      e & 1 && (n(0, 'div', 0)(1, 'h2'), r(2, 'Brain Viewer'), t(), m(3, ce, 2, 1, 'div', 1)(4, Ue, 46, 32), t()),
        e & 2 && (o(3), _(l.loading() ? 3 : 4));
    },
    dependencies: [N, H, A],
    styles: [
      '.brain-viewer[_ngcontent-%COMP%]{padding:1.5rem}.brain-viewer[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0 0 1.5rem;color:var(--text-primary)}.brain-viewer[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem}.loading[_ngcontent-%COMP%]{color:var(--text-secondary)}.sync-banner[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-radius:var(--radius-lg);margin-bottom:1.25rem;font-size:.75rem;border:1px solid var(--border)}.sync-banner--ok[_ngcontent-%COMP%]{background:#00ff880d;border-color:var(--accent-green)}.sync-banner--warn[_ngcontent-%COMP%]{background:#ffaa000d;border-color:var(--accent-amber)}.sync-banner__indicator[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;flex-shrink:0}.sync-banner--ok[_ngcontent-%COMP%]   .sync-banner__indicator[_ngcontent-%COMP%]{background:var(--accent-green);box-shadow:0 0 6px var(--accent-green)}.sync-banner--warn[_ngcontent-%COMP%]   .sync-banner__indicator[_ngcontent-%COMP%]{background:var(--accent-amber);box-shadow:0 0 6px var(--accent-amber)}.sync-banner__text[_ngcontent-%COMP%]{color:var(--text-secondary)}.stats-cards[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.75rem;margin-bottom:1.25rem}.stat-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;display:flex;flex-direction:column;gap:.35rem}.stat-card--longterm[_ngcontent-%COMP%]{border-color:var(--accent-cyan);border-style:dashed}.stat-card--shortterm[_ngcontent-%COMP%]{border-color:var(--accent-amber);border-style:dashed}.stat-card__label[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em}.stat-card__value[_ngcontent-%COMP%]{font-size:1.5rem;font-weight:700;color:var(--accent-cyan);text-shadow:0 0 10px rgba(0,229,255,.15)}.stat-card__value--longterm[_ngcontent-%COMP%]{color:var(--accent-cyan)}.stat-card__value--shortterm[_ngcontent-%COMP%]{color:var(--accent-amber);text-shadow:0 0 10px rgba(255,170,0,.15)}.stat-card__value--decay[_ngcontent-%COMP%]{color:var(--accent-purple);text-shadow:0 0 10px rgba(167,139,250,.15)}.stat-card__value--confirmed[_ngcontent-%COMP%]{color:var(--accent-green);text-shadow:0 0 10px rgba(0,255,136,.15)}.stat-card__value--pending[_ngcontent-%COMP%]{color:var(--accent-amber);text-shadow:0 0 10px rgba(255,170,0,.15)}.stat-card__value--failed[_ngcontent-%COMP%]{color:var(--accent-red);text-shadow:0 0 10px rgba(255,51,85,.15)}.section[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}.section--errors[_ngcontent-%COMP%]{border-color:var(--accent-red)}.tier-bar[_ngcontent-%COMP%]{display:flex;height:28px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)}.tier-bar__segment[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;min-width:40px;transition:flex .3s}.tier-bar__segment--longterm[_ngcontent-%COMP%]{background:var(--accent-cyan-dim, rgba(0, 229, 255, .1));color:var(--accent-cyan)}.tier-bar__segment--shortterm[_ngcontent-%COMP%]{background:var(--accent-amber-dim, rgba(255, 170, 0, .1));color:var(--accent-amber)}.tier-bar__label[_ngcontent-%COMP%]{font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}.agent-table[_ngcontent-%COMP%]{display:flex;flex-direction:column}.agent-table__header[_ngcontent-%COMP%], .agent-table__row[_ngcontent-%COMP%]{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:.5rem;padding:.4rem 0;font-size:.7rem}.agent-table__header[_ngcontent-%COMP%]{color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);font-weight:700}.agent-table__row[_ngcontent-%COMP%]{color:var(--text-secondary);border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s}.agent-table__row[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.agent-table__row[_ngcontent-%COMP%]:last-child{border-bottom:none}.agent-name[_ngcontent-%COMP%]{color:var(--accent-cyan);font-weight:600}.longterm-val[_ngcontent-%COMP%]{color:var(--accent-cyan)}.shortterm-val[_ngcontent-%COMP%]{color:var(--accent-amber)}.category-chips[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.4rem}.chip[_ngcontent-%COMP%]{padding:.3rem .65rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.7rem;font-family:inherit;cursor:pointer;transition:border-color .15s,color .15s}.chip[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-primary)}.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim, rgba(0, 229, 255, .08))}.chip--lt.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan)}.chip--st.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-amber);color:var(--accent-amber);background:var(--accent-amber-dim, rgba(255, 170, 0, .08))}.chip--clear[_ngcontent-%COMP%]{border-color:var(--accent-magenta);color:var(--accent-magenta);background:#ff00aa0f}.filters[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.6rem}.search-input[_ngcontent-%COMP%]{width:100%;padding:.5rem .75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:.8rem;outline:none;transition:border-color .15s}.search-input[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan)}.search-input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.filter-chips[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.35rem}.list-header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}.list-header__count[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em}.pagination[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.page-info[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary)}.btn--sm[_ngcontent-%COMP%]{padding:.25rem .6rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:.65rem;font-family:inherit;cursor:pointer;transition:border-color .15s,color .15s}.btn--sm[_ngcontent-%COMP%]:hover:not(:disabled){border-color:var(--accent-cyan);color:var(--accent-cyan)}.btn--sm[_ngcontent-%COMP%]:disabled{opacity:.35;cursor:not-allowed}.empty-state[_ngcontent-%COMP%]{text-align:center;padding:2rem;color:var(--text-tertiary)}.empty-state__icon[_ngcontent-%COMP%]{font-size:.7rem;line-height:1.3;margin-bottom:.75rem}.memory-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:4px}.memory-card[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s,background .15s}.memory-card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright)}.memory-card--expanded[_ngcontent-%COMP%]{border-color:var(--accent-cyan)}.memory-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;font-size:.7rem}.memory-card__tier[_ngcontent-%COMP%]{padding:.15rem .35rem;border-radius:3px;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;flex-shrink:0}.memory-card__tier[data-tier=longterm][_ngcontent-%COMP%]{background:var(--accent-cyan-dim, rgba(0, 229, 255, .1));color:var(--accent-cyan)}.memory-card__tier[data-tier=shortterm][_ngcontent-%COMP%]{background:var(--accent-amber-dim, rgba(255, 170, 0, .1));color:var(--accent-amber)}.memory-card__key[_ngcontent-%COMP%]{color:var(--text-primary);font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.memory-card__status[_ngcontent-%COMP%]{font-size:.6rem;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}.memory-card__status[data-status=confirmed][_ngcontent-%COMP%]{color:var(--accent-green)}.memory-card__status[data-status=pending][_ngcontent-%COMP%]{color:var(--accent-amber)}.memory-card__status[data-status=failed][_ngcontent-%COMP%]{color:var(--accent-red)}.memory-card__decay[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);flex-shrink:0;font-family:monospace}.memory-card__category[_ngcontent-%COMP%]{padding:.1rem .3rem;background:var(--accent-purple-dim, rgba(167, 139, 250, .1));color:var(--accent-purple);border-radius:3px;font-size:.55rem;flex-shrink:0}.memory-card__storage[_ngcontent-%COMP%]{padding:.15rem .35rem;border-radius:3px;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}.memory-card__storage[data-storage=arc69][_ngcontent-%COMP%]{background:var(--accent-green-dim, rgba(0, 255, 136, .1));color:var(--accent-green)}.memory-card__storage[data-storage=plain-txn][_ngcontent-%COMP%]{background:var(--accent-purple-dim, rgba(167, 139, 250, .1));color:var(--accent-purple)}.memory-card__storage[data-storage=pending][_ngcontent-%COMP%]{background:var(--accent-amber-dim, rgba(255, 170, 0, .1));color:var(--accent-amber)}.memory-card__time[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.6rem;flex-shrink:0;white-space:nowrap}.memory-card__detail[_ngcontent-%COMP%]{padding:.75rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.4rem}.detail-row[_ngcontent-%COMP%]{display:flex;gap:.75rem;font-size:.7rem}.detail-label[_ngcontent-%COMP%]{width:72px;flex-shrink:0;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;font-size:.6rem;padding-top:.1rem}.detail-value[_ngcontent-%COMP%]{color:var(--text-secondary);word-break:break-all}.detail-value--mono[_ngcontent-%COMP%]{font-family:monospace;font-size:.65rem}.detail-value--txid[_ngcontent-%COMP%]{color:var(--accent-green)}.detail-value--asa[_ngcontent-%COMP%]{color:var(--accent-cyan)}[data-storage=arc69][_ngcontent-%COMP%]{color:var(--accent-green)}[data-storage=plain-txn][_ngcontent-%COMP%]{color:var(--accent-purple)}[data-storage=pending][_ngcontent-%COMP%]{color:var(--accent-amber)}.detail-content[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.3rem;margin-top:.3rem}.detail-pre[_ngcontent-%COMP%]{background:var(--bg-deep, #0a0a12);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;font-size:.7rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;margin:0;max-height:300px;overflow-y:auto}.error-row[_ngcontent-%COMP%]{display:flex;gap:.75rem;padding:.4rem 0;font-size:.7rem;border-bottom:1px solid var(--border);align-items:center}.error-row[_ngcontent-%COMP%]:last-child{border-bottom:none}.error-row__key[_ngcontent-%COMP%]{color:var(--text-primary);font-weight:600;flex:1}.error-row__msg[_ngcontent-%COMP%]{color:var(--accent-red);flex:1}.error-row__time[_ngcontent-%COMP%]{color:var(--text-tertiary);flex-shrink:0}.stat-card--observations[_ngcontent-%COMP%]{border-color:var(--accent-magenta);border-style:dashed}.stat-card__value--observations[_ngcontent-%COMP%]{color:var(--accent-magenta);text-shadow:0 0 10px rgba(255,0,170,.15)}.obs-header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}.obs-header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0}.obs-header__meta[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary)}.obs-empty[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.75rem}.chip--obs-active.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan)}.chip--obs-graduated.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-green);color:var(--accent-green);background:#00ff8814}.chip--obs-expired.chip--active[_ngcontent-%COMP%]{border-color:var(--text-tertiary);color:var(--text-tertiary)}.chip--obs-dismissed.chip--active[_ngcontent-%COMP%]{border-color:var(--accent-red);color:var(--accent-red);background:#ff335514}.obs-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:4px}.obs-card[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:border-color .15s}.obs-card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright)}.obs-card--expanded[_ngcontent-%COMP%]{border-color:var(--accent-magenta)}.obs-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;font-size:.7rem}.obs-card__source[_ngcontent-%COMP%]{padding:.15rem .35rem;border-radius:3px;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;flex-shrink:0;background:var(--accent-magenta-dim, rgba(255, 0, 170, .1));color:var(--accent-magenta)}.obs-card__content-preview[_ngcontent-%COMP%]{color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.obs-card__score[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);flex-shrink:0;font-family:monospace}.obs-card__status[_ngcontent-%COMP%]{font-size:.6rem;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}.obs-card__status[data-obs-status=active][_ngcontent-%COMP%]{color:var(--accent-cyan)}.obs-card__status[data-obs-status=graduated][_ngcontent-%COMP%]{color:var(--accent-green)}.obs-card__status[data-obs-status=expired][_ngcontent-%COMP%]{color:var(--text-tertiary)}.obs-card__status[data-obs-status=dismissed][_ngcontent-%COMP%]{color:var(--accent-red)}.obs-card__detail[_ngcontent-%COMP%]{padding:.75rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.4rem}.obs-card__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border)}.btn--action[_ngcontent-%COMP%]{padding:.35rem .75rem;border-radius:var(--radius-sm);font-size:.65rem;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid;transition:opacity .15s}.btn--action[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--graduate[_ngcontent-%COMP%]{background:#00ff881a;border-color:var(--accent-green);color:var(--accent-green)}.btn--graduate[_ngcontent-%COMP%]:hover:not(:disabled){background:#0f83}.btn--boost[_ngcontent-%COMP%]{background:#00e5ff1a;border-color:var(--accent-cyan);color:var(--accent-cyan)}.btn--boost[_ngcontent-%COMP%]:hover{background:#00e5ff33}@media(max-width:767px){.stats-cards[_ngcontent-%COMP%]{grid-template-columns:repeat(2,1fr)}.memory-card__header[_ngcontent-%COMP%]{flex-wrap:wrap}.agent-table__header[_ngcontent-%COMP%], .agent-table__row[_ngcontent-%COMP%]{grid-template-columns:2fr 1fr 1fr 1fr;font-size:.6rem}}',
    ],
    changeDetection: 0,
  });
};
var $ = class a {
  api = T(D);
  memories = g([]);
  total = g(0);
  loading = g(!1);
  stats = g(null);
  async loadMemories(i = {}) {
    this.loading.set(!0);
    try {
      const e = new URLSearchParams();
      i.search && e.set('search', i.search),
        i.tier && e.set('tier', i.tier),
        i.status && e.set('status', i.status),
        i.agentId && e.set('agentId', i.agentId),
        i.limit && e.set('limit', String(i.limit)),
        i.offset && e.set('offset', String(i.offset));
      const l = e.toString(),
        s = `/dashboard/memories${l ? `?${l}` : ''}`,
        x = await y(this.api.get(s));
      this.memories.set(x.entries), this.total.set(x.total);
    } finally {
      this.loading.set(!1);
    }
  }
  async loadStats() {
    const i = await y(this.api.get('/dashboard/memories/stats'));
    this.stats.set(i);
  }
  async getMemory(i) {
    return y(this.api.get(`/dashboard/memories/${i}`));
  }
  async saveMemory(i, e, l) {
    return y(this.api.post('/mcp/save-memory', { agentId: i, key: e, content: l }));
  }
  async deleteMemory(i, e, l = 'soft') {
    return y(this.api.post('/mcp/delete-memory', { agentId: i, key: e, mode: l }));
  }
  static \u0275fac = (e) => new (e || a)();
  static \u0275prov = K({ token: a, factory: a.\u0275fac, providedIn: 'root' });
};
var Ke = (_a, i) => i.id;
function Ge(a, _i) {
  if ((a & 1 && (n(0, 'div', 17)(1, 'span', 18), r(2), t(), n(3, 'span', 19), r(4, 'Avg Freshness'), t()()), a & 2)) {
    const e = c();
    o(2), b('', (e.averageDecayScore * 100).toFixed(0), '%');
  }
}
function He(a, i) {
  if (
    (a & 1 &&
      (n(0, 'div', 3)(1, 'div', 17)(2, 'span', 18),
      r(3),
      t(),
      n(4, 'span', 19),
      r(5, 'Total'),
      t()(),
      n(6, 'div', 20)(7, 'span', 18),
      r(8),
      t(),
      n(9, 'span', 19),
      r(10, 'On-Chain'),
      t()(),
      n(11, 'div', 21)(12, 'span', 18),
      r(13),
      t(),
      n(14, 'span', 19),
      r(15, 'Pending'),
      t()(),
      m(16, Ge, 5, 1, 'div', 17),
      t()),
    a & 2)
  ) {
    const e = i;
    o(3),
      d(e.totalMemories),
      o(5),
      d(e.byTier.longterm),
      o(5),
      d(e.byTier.shortterm),
      o(3),
      _(e.averageDecayScore !== null ? 16 : -1);
  }
}
function qe(a, _i) {
  a & 1 && M(0, 'app-skeleton', 14), a & 2 && C('count', 6);
}
function Xe(a, _i) {
  a & 1 && M(0, 'app-empty-state', 15);
}
function Ye(a, _i) {
  if ((a & 1 && (n(0, 'span', 32), r(1), t()), a & 2)) {
    const e = c().$implicit;
    o(), b('ASA #', e.asaId);
  }
}
function Je(a, i) {
  if (a & 1) {
    const e = h();
    n(0, 'button', 28),
      p('click', () => {
        const s = u(e).$implicit,
          x = c(2);
        return v(x.selectMemory(s));
      }),
      n(1, 'div', 29)(2, 'code', 30),
      r(3),
      t(),
      n(4, 'span'),
      r(5),
      t()(),
      n(6, 'div', 31),
      m(7, Ye, 2, 1, 'span', 32),
      n(8, 'span'),
      r(9),
      t(),
      n(10, 'span', 33),
      r(11),
      w(12, 'relativeTime'),
      t()(),
      n(13, 'p', 34),
      r(14),
      t()();
  }
  if (a & 2) {
    let e,
      l = i.$implicit,
      s = c(2);
    f('memory-card--active', ((e = s.selectedMemory()) == null ? null : e.id) === l.id),
      o(3),
      d(l.key),
      o(),
      B(F('tier-badge tier-badge--', l.tier)),
      o(),
      b(' ', l.tier === 'longterm' ? 'ON-CHAIN' : 'LOCAL', ' '),
      o(2),
      _(l.asaId ? 7 : -1),
      o(),
      B(F('status-chip status-chip--', l.status)),
      o(),
      d(l.status),
      o(2),
      d(P(12, 14, l.updatedAt)),
      o(3),
      d(s.truncate(l.content, 120));
  }
}
function We(a, _i) {
  a & 1 && (n(0, 'p', 24), r(1, 'No memories match your search.'), t());
}
function Ze(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 25)(1, 'button', 35),
      p('click', () => {
        u(e);
        const s = c(2);
        return v(s.goToPage(s.currentPage() - 1));
      }),
      r(2, 'Prev'),
      t(),
      n(3, 'span', 36),
      r(4),
      t(),
      n(5, 'button', 35),
      p('click', () => {
        u(e);
        const s = c(2);
        return v(s.goToPage(s.currentPage() + 1));
      }),
      r(6, 'Next'),
      t()();
  }
  if (a & 2) {
    const e = c(2);
    o(),
      C('disabled', e.currentPage() <= 1),
      o(3),
      G(' Page ', e.currentPage(), ' of ', e.totalPages(), ' (', e.memoryService.total(), ' total) '),
      o(),
      C('disabled', e.currentPage() >= e.totalPages());
  }
}
function et(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 37)(1, 'h3', 38),
      r(2, 'Edit Memory'),
      t(),
      n(3, 'label', 39),
      r(4, 'Key'),
      t(),
      M(5, 'input', 40),
      n(6, 'label', 39),
      r(7, 'Content'),
      t(),
      n(8, 'textarea', 41),
      p('ngModelChange', (s) => {
        u(e);
        const x = c(3);
        return v(x.editContent.set(s));
      }),
      t(),
      n(9, 'div', 42)(10, 'button', 43),
      p('click', () => {
        u(e);
        const s = c(3);
        return v(s.saveEdit());
      }),
      r(11),
      t(),
      n(12, 'button', 44),
      p('click', () => {
        u(e);
        const s = c(3);
        return v(s.editing.set(!1));
      }),
      r(13, 'Cancel'),
      t()()();
  }
  if (a & 2) {
    const e = c(),
      l = c(2);
    o(5),
      C('value', e.key),
      o(3),
      C('ngModel', l.editContent()),
      o(2),
      C('disabled', l.saving()),
      o(),
      b(' ', l.saving() ? 'Saving...' : 'Save', ' ');
  }
}
function tt(a, _i) {
  if ((a & 1 && (n(0, 'div', 52)(1, 'span', 53), r(2, 'ASA ID'), t(), n(3, 'span', 56), r(4), t()()), a & 2)) {
    const e = c(2);
    o(4), d(e.asaId);
  }
}
function nt(a, _i) {
  if ((a & 1 && (n(0, 'div', 55)(1, 'span', 53), r(2, 'Transaction ID'), t(), n(3, 'code', 61), r(4), t()()), a & 2)) {
    const e = c(2);
    o(4), d(e.txid);
  }
}
function it(a, _i) {
  if ((a & 1 && (n(0, 'span', 62), r(1), t()), a & 2)) {
    const e = c(3);
    o(), b('(', (e.categoryConfidence * 100).toFixed(0), '%)');
  }
}
function rt(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 52)(1, 'span', 53),
      r(2, 'Category'),
      t(),
      n(3, 'span', 54),
      r(4),
      m(5, it, 2, 1, 'span', 62),
      t()()),
    a & 2)
  ) {
    const e = c(2);
    o(4), b('', e.category, ' '), o(), _(e.categoryConfidence !== null ? 5 : -1);
  }
}
function at(a, _i) {
  if (a & 1) {
    const e = h();
    n(0, 'div', 45)(1, 'div')(2, 'h3', 46)(3, 'code'),
      r(4),
      t()(),
      n(5, 'span', 47),
      r(6),
      w(7, 'relativeTime'),
      t()(),
      n(8, 'div', 48)(9, 'button', 49),
      p('click', () => {
        u(e);
        const s = c(3);
        return v(s.startEdit());
      }),
      r(10, 'Edit'),
      t(),
      n(11, 'button', 50),
      p('click', () => {
        u(e);
        const s = c(3);
        return v(s.confirmDelete());
      }),
      r(12, 'Delete'),
      t()()(),
      n(13, 'div', 51)(14, 'div', 52)(15, 'span', 53),
      r(16, 'Tier'),
      t(),
      n(17, 'span'),
      r(18),
      t()(),
      n(19, 'div', 52)(20, 'span', 53),
      r(21, 'Status'),
      t(),
      n(22, 'span'),
      r(23),
      t()(),
      n(24, 'div', 52)(25, 'span', 53),
      r(26, 'Storage'),
      t(),
      n(27, 'span', 54),
      r(28),
      t()(),
      m(29, tt, 5, 1, 'div', 52),
      m(30, nt, 5, 1, 'div', 55),
      n(31, 'div', 52)(32, 'span', 53),
      r(33, 'Agent'),
      t(),
      n(34, 'span', 56),
      r(35),
      t()(),
      n(36, 'div', 52)(37, 'span', 53),
      r(38, 'Created'),
      t(),
      n(39, 'span', 54),
      r(40),
      w(41, 'relativeTime'),
      t()(),
      n(42, 'div', 52)(43, 'span', 53),
      r(44, 'Freshness'),
      t(),
      n(45, 'div', 57),
      M(46, 'div', 58),
      t(),
      n(47, 'span', 54),
      r(48),
      t()(),
      m(49, rt, 6, 2, 'div', 52),
      t(),
      n(50, 'div', 37)(51, 'h4', 59),
      r(52, 'Content'),
      t(),
      n(53, 'pre', 60),
      r(54),
      t()();
  }
  if (a & 2) {
    const e = c();
    o(4),
      d(e.key),
      o(2),
      b('Updated ', P(7, 20, e.updatedAt)),
      o(11),
      B(F('tier-badge tier-badge--', e.tier)),
      o(),
      b(' ', e.tier === 'longterm' ? 'ON-CHAIN' : 'LOCAL', ' '),
      o(4),
      B(F('status-chip status-chip--', e.status)),
      o(),
      d(e.status),
      o(5),
      d(e.storageType),
      o(),
      _(e.asaId ? 29 : -1),
      o(),
      _(e.txid ? 30 : -1),
      o(5),
      d(e.agentId),
      o(5),
      d(P(41, 22, e.createdAt)),
      o(6),
      V('width', e.decayScore * 100, '%'),
      o(2),
      b('', (e.decayScore * 100).toFixed(0), '%'),
      o(),
      _(e.category ? 49 : -1),
      o(5),
      d(e.content);
  }
}
function ot(a, _i) {
  if ((a & 1 && (n(0, 'div', 26), m(1, et, 14, 4, 'div', 37)(2, at, 55, 24), t()), a & 2)) {
    const e = c(2);
    o(), _(e.editing() ? 1 : 2);
  }
}
function lt(a, _i) {
  a & 1 && (n(0, 'div', 27)(1, 'p'), r(2, 'Select a memory to view details'), t()());
}
function st(a, _i) {
  if (
    (a & 1 &&
      (n(0, 'div', 16)(1, 'div', 22),
      O(2, Je, 15, 16, 'button', 23, Ke, !1, We, 2, 0, 'p', 24),
      m(5, Ze, 7, 5, 'div', 25),
      t(),
      m(6, ot, 3, 1, 'div', 26)(7, lt, 3, 0, 'div', 27),
      t()),
    a & 2)
  ) {
    let e,
      l = c();
    o(2),
      E(l.memoryService.memories()),
      o(3),
      _(l.memoryService.total() > l.pageSize ? 5 : -1),
      o(),
      _((e = l.selectedMemory()) ? 6 : 7, e);
  }
}
var R = class a {
  memoryService = T($);
  searchQuery = g('');
  tierFilter = g('');
  statusFilter = g('');
  pageSize = 50;
  currentPage = g(1);
  totalPages = z(() => Math.max(1, Math.ceil(this.memoryService.total() / this.pageSize)));
  selectedMemory = g(null);
  editing = g(!1);
  editContent = g('');
  saving = g(!1);
  searchTimer = null;
  ngOnInit() {
    this.loadData();
  }
  async loadData() {
    await Promise.all([this.memoryService.loadMemories({ limit: this.pageSize }), this.memoryService.loadStats()]);
  }
  onSearchChange(i) {
    this.searchQuery.set(i),
      this.searchTimer && clearTimeout(this.searchTimer),
      (this.searchTimer = setTimeout(() => {
        this.currentPage.set(1), this.reloadMemories();
      }, 300));
  }
  onTierChange(i) {
    this.tierFilter.set(i), this.currentPage.set(1), this.reloadMemories();
  }
  onStatusChange(i) {
    this.statusFilter.set(i), this.currentPage.set(1), this.reloadMemories();
  }
  goToPage(i) {
    i < 1 || i > this.totalPages() || (this.currentPage.set(i), this.reloadMemories());
  }
  selectMemory(i) {
    this.selectedMemory.set(i), this.editing.set(!1);
  }
  startEdit() {
    const i = this.selectedMemory();
    i && (this.editContent.set(i.content), this.editing.set(!0));
  }
  async saveEdit() {
    const i = this.selectedMemory();
    if (!i) return;
    const e = this.editContent().trim();
    if (e) {
      this.saving.set(!0);
      try {
        if (!(await this.memoryService.saveMemory(i.agentId, i.key, e)).isError) {
          this.editing.set(!1), await this.reloadMemories();
          const s = this.memoryService.memories().find((x) => x.key === i.key && x.agentId === i.agentId);
          s && this.selectedMemory.set(s);
        }
      } finally {
        this.saving.set(!1);
      }
    }
  }
  async confirmDelete() {
    const i = this.selectedMemory();
    if (!i || !confirm(`Delete memory "${i.key}"? This will archive the memory.`)) return;
    (await this.memoryService.deleteMemory(i.agentId, i.key, 'soft')).isError ||
      (this.selectedMemory.set(null), await this.reloadMemories(), await this.memoryService.loadStats());
  }
  truncate(i, e) {
    return i.length > e ? `${i.slice(0, e)}...` : i;
  }
  async reloadMemories() {
    await this.memoryService.loadMemories({
      search: this.searchQuery() || void 0,
      tier: this.tierFilter() || void 0,
      status: this.statusFilter() || void 0,
      limit: this.pageSize,
      offset: (this.currentPage() - 1) * this.pageSize,
    });
  }
  static \u0275fac = (e) => new (e || a)();
  static \u0275cmp = I({
    type: a,
    selectors: [['app-memory-browser']],
    decls: 26,
    vars: 5,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page-title'],
      [1, 'stats-bar'],
      [1, 'page__toolbar'],
      [
        'type',
        'text',
        'placeholder',
        'Search by key or content...',
        'aria-label',
        'Search memories',
        1,
        'search-input',
        3,
        'ngModelChange',
        'ngModel',
      ],
      ['aria-label', 'Filter by tier', 1, 'filter-select', 3, 'ngModelChange', 'ngModel'],
      ['value', ''],
      ['value', 'longterm'],
      ['value', 'shortterm'],
      ['aria-label', 'Filter by status', 1, 'filter-select', 3, 'ngModelChange', 'ngModel'],
      ['value', 'confirmed'],
      ['value', 'pending'],
      ['value', 'failed'],
      ['variant', 'table', 3, 'count'],
      [
        'icon',
        `  [mem]
  /   \\
 |     |`,
        'title',
        'No memories found.',
        'description',
        'Agent memories will appear here once the agent starts storing data on-chain or locally.',
      ],
      [1, 'memory-layout'],
      [1, 'stat'],
      [1, 'stat__value'],
      [1, 'stat__label'],
      [1, 'stat', 'stat--longterm'],
      [1, 'stat', 'stat--shortterm'],
      ['role', 'list', 1, 'memory-list'],
      ['role', 'listitem', 1, 'memory-card', 3, 'memory-card--active'],
      [1, 'no-results'],
      [1, 'pagination'],
      [1, 'memory-detail'],
      [1, 'memory-detail', 'memory-detail--empty'],
      ['role', 'listitem', 1, 'memory-card', 3, 'click'],
      [1, 'memory-card__header'],
      [1, 'memory-card__key'],
      [1, 'memory-card__meta'],
      [1, 'memory-card__asa'],
      [1, 'memory-card__time'],
      [1, 'memory-card__preview'],
      [1, 'btn', 'btn--ghost', 'btn--sm', 3, 'click', 'disabled'],
      [1, 'pagination__info'],
      [1, 'detail-section'],
      [1, 'detail-title'],
      [1, 'field-label'],
      ['type', 'text', 'disabled', '', 1, 'field-input', 'field-input--disabled', 3, 'value'],
      ['rows', '10', 1, 'field-input', 'field-textarea', 3, 'ngModelChange', 'ngModel'],
      [1, 'detail-actions'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'btn', 'btn--ghost', 3, 'click'],
      [1, 'detail-header'],
      [1, 'detail-name'],
      [1, 'detail-meta'],
      [1, 'detail-header-actions'],
      [1, 'btn', 'btn--ghost', 'btn--sm', 3, 'click'],
      [1, 'btn', 'btn--danger', 'btn--sm', 3, 'click'],
      [1, 'meta-grid'],
      [1, 'meta-item'],
      [1, 'meta-label'],
      [1, 'meta-value'],
      [1, 'meta-item', 'meta-item--wide'],
      [1, 'meta-value', 'meta-value--mono'],
      [1, 'decay-bar'],
      [1, 'decay-bar__fill'],
      [1, 'section-label'],
      [1, 'memory-content'],
      [1, 'meta-value', 'meta-value--mono', 'meta-value--break'],
      [1, 'confidence'],
    ],
    template: (e, l) => {
      if (
        (e & 1 &&
          (n(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
          r(3, 'Memory Browser'),
          t()(),
          m(4, He, 17, 4, 'div', 3),
          n(5, 'div', 4)(6, 'input', 5),
          p('ngModelChange', (x) => l.onSearchChange(x)),
          t(),
          n(7, 'select', 6),
          p('ngModelChange', (x) => l.onTierChange(x)),
          n(8, 'option', 7),
          r(9, 'All Tiers'),
          t(),
          n(10, 'option', 8),
          r(11, 'On-Chain (longterm)'),
          t(),
          n(12, 'option', 9),
          r(13, 'Pending (shortterm)'),
          t()(),
          n(14, 'select', 10),
          p('ngModelChange', (x) => l.onStatusChange(x)),
          n(15, 'option', 7),
          r(16, 'All Statuses'),
          t(),
          n(17, 'option', 11),
          r(18, 'Confirmed'),
          t(),
          n(19, 'option', 12),
          r(20, 'Pending'),
          t(),
          n(21, 'option', 13),
          r(22, 'Failed'),
          t()()(),
          m(23, qe, 1, 1, 'app-skeleton', 14)(24, Xe, 1, 0, 'app-empty-state', 15)(25, st, 8, 3, 'div', 16),
          t()),
        e & 2)
      ) {
        let s;
        o(4),
          _((s = l.memoryService.stats()) ? 4 : -1, s),
          o(2),
          C('ngModel', l.searchQuery()),
          o(),
          C('ngModel', l.tierFilter()),
          o(7),
          C('ngModel', l.statusFilter()),
          o(9),
          _(
            l.memoryService.loading()
              ? 23
              : l.memoryService.memories().length === 0 && !l.searchQuery() && !l.tierFilter() && !l.statusFilter()
                ? 24
                : 25,
          );
      }
    },
    dependencies: [ee, W, Z, q, J, X, Y, te, N, A],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem;height:100%;display:flex;flex-direction:column}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__toolbar[_ngcontent-%COMP%]{display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap}.stats-bar[_ngcontent-%COMP%]{display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}.stat[_ngcontent-%COMP%]{padding:.5rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;align-items:center;min-width:80px}.stat__value[_ngcontent-%COMP%]{font-size:1.2rem;font-weight:700;color:var(--text-primary)}.stat__label[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}.stat--longterm[_ngcontent-%COMP%]{border-color:var(--accent-green, #00ff88)}.stat--longterm[_ngcontent-%COMP%]   .stat__value[_ngcontent-%COMP%]{color:var(--accent-green, #00ff88)}.stat--shortterm[_ngcontent-%COMP%]{border-color:var(--accent-yellow, #ffcc00)}.stat--shortterm[_ngcontent-%COMP%]   .stat__value[_ngcontent-%COMP%]{color:var(--accent-yellow, #ffcc00)}.search-input[_ngcontent-%COMP%]{flex:1;min-width:200px;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;transition:border-color .2s}.search-input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.search-input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.filter-select[_ngcontent-%COMP%]{padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;appearance:auto;cursor:pointer}.filter-select[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s;background:transparent}.btn--primary[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.btn--ghost[_ngcontent-%COMP%]{color:var(--text-secondary);border-color:var(--border)}.btn--ghost[_ngcontent-%COMP%]:hover{border-color:var(--text-tertiary)}.btn--ghost[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.btn--danger[_ngcontent-%COMP%]{color:var(--accent-red, #ff5555);border-color:var(--accent-red, #ff5555)}.btn--danger[_ngcontent-%COMP%]:hover{background:#ff55551a}.btn--sm[_ngcontent-%COMP%]{padding:.3rem .6rem;font-size:.7rem}.memory-layout[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1.2fr;gap:1.5rem;flex:1;min-height:0}.memory-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;overflow-y:auto;max-height:calc(100vh - 320px)}.memory-card[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.35rem;padding:.75rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);cursor:pointer;text-align:left;width:100%;font-family:inherit;color:inherit;transition:border-color .2s,box-shadow .2s}.memory-card[_ngcontent-%COMP%]:hover{border-color:var(--accent-green);box-shadow:0 0 12px #00ff8814}.memory-card--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);box-shadow:0 0 16px #00c8ff1f}.memory-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.memory-card__key[_ngcontent-%COMP%]{font-size:.85rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.memory-card__meta[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.memory-card__asa[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-cyan);font-weight:600;font-family:var(--font-mono, monospace)}.memory-card__time[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);margin-left:auto}.memory-card__preview[_ngcontent-%COMP%]{margin:0;font-size:.75rem;color:var(--text-secondary);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.tier-badge[_ngcontent-%COMP%]{display:inline-block;padding:.1rem .4rem;border-radius:4px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border:1px solid;flex-shrink:0}.tier-badge--longterm[_ngcontent-%COMP%]{color:var(--accent-green, #00ff88);border-color:var(--accent-green, #00ff88);background:#00ff881a}.tier-badge--shortterm[_ngcontent-%COMP%]{color:var(--accent-yellow, #ffcc00);border-color:var(--accent-yellow, #ffcc00);background:#ffcc001a}.status-chip[_ngcontent-%COMP%]{display:inline-block;padding:.1rem .35rem;border-radius:4px;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em}.status-chip--confirmed[_ngcontent-%COMP%]{color:var(--accent-green, #00ff88);background:#00ff881a}.status-chip--pending[_ngcontent-%COMP%]{color:var(--accent-yellow, #ffcc00);background:#ffcc001a}.status-chip--failed[_ngcontent-%COMP%]{color:var(--accent-red, #ff5555);background:#ff55551a}.no-results[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.85rem;padding:1rem}.pagination[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;gap:.75rem;padding:.75rem 0;margin-top:.5rem}.pagination__info[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary)}.memory-detail[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;overflow-y:auto;max-height:calc(100vh - 320px)}.memory-detail--empty[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)}.detail-header[_ngcontent-%COMP%]{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}.detail-name[_ngcontent-%COMP%]{margin:0;font-size:1rem;color:var(--text-primary)}.detail-name[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{font-size:.95rem}.detail-meta[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary)}.detail-header-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;flex-shrink:0}.meta-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;margin-bottom:1.5rem}.meta-item[_ngcontent-%COMP%]{padding:.5rem .75rem;background:var(--bg-base, rgba(0, 0, 0, .2));border-radius:var(--radius)}.meta-item--wide[_ngcontent-%COMP%]{grid-column:1 / -1}.meta-label[_ngcontent-%COMP%]{display:block;font-size:.65rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}.meta-value[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-primary)}.meta-value--mono[_ngcontent-%COMP%]{font-family:var(--font-mono, monospace);font-size:.75rem}.meta-value--break[_ngcontent-%COMP%]{word-break:break-all}.confidence[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary)}.decay-bar[_ngcontent-%COMP%]{width:100%;height:4px;background:var(--border);border-radius:2px;margin:.25rem 0;overflow:hidden}.decay-bar__fill[_ngcontent-%COMP%]{height:100%;background:var(--accent-cyan);border-radius:2px;transition:width .3s}.detail-section[_ngcontent-%COMP%]{margin-bottom:1.5rem}.detail-title[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.section-label[_ngcontent-%COMP%]{margin:0 0 .5rem;font-size:.75rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}.memory-content[_ngcontent-%COMP%]{margin:0;padding:1rem;background:var(--bg-base, rgba(0, 0, 0, .3));border-radius:var(--radius);color:var(--text-secondary);font-size:.8rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;font-family:var(--font-mono, monospace)}.detail-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.75rem}.field-label[_ngcontent-%COMP%]{display:block;font-size:.75rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem;margin-top:.75rem}.field-input[_ngcontent-%COMP%]{width:100%;padding:.5rem .75rem;background:var(--bg-base, rgba(0, 0, 0, .3));border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;box-sizing:border-box}.field-input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.field-input--disabled[_ngcontent-%COMP%]{opacity:.5;cursor:not-allowed}.field-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:120px;font-family:var(--font-mono, monospace);font-size:.8rem}@media(max-width:767px){.page[_ngcontent-%COMP%]{padding:1rem}.memory-layout[_ngcontent-%COMP%]{grid-template-columns:1fr}.memory-list[_ngcontent-%COMP%], .memory-detail[_ngcontent-%COMP%]{max-height:none}.stats-bar[_ngcontent-%COMP%]{gap:.5rem}.stat[_ngcontent-%COMP%]{min-width:60px;padding:.35rem .5rem}.stat__value[_ngcontent-%COMP%]{font-size:1rem}.meta-grid[_ngcontent-%COMP%]{grid-template-columns:1fr 1fr}.page__toolbar[_ngcontent-%COMP%]{flex-direction:column}.search-input[_ngcontent-%COMP%]{min-width:unset}}',
    ],
    changeDetection: 0,
  });
};
function ct(a, _i) {
  a & 1 && M(0, 'app-brain-viewer');
}
function dt(a, _i) {
  a & 1 && M(0, 'app-memory-browser');
}
var re = 'memory_view_mode',
  ae = class a {
    view = g(this.loadView());
    setView(i) {
      this.view.set(i), typeof localStorage < 'u' && localStorage.setItem(re, i);
    }
    loadView() {
      if (typeof localStorage < 'u') {
        const i = localStorage.getItem(re);
        if (i === 'overview' || i === 'browse') return i;
      }
      return 'overview';
    }
    static \u0275fac = (e) => new (e || a)();
    static \u0275cmp = I({
      type: a,
      selectors: [['app-unified-memory']],
      decls: 12,
      vars: 7,
      consts: [
        [1, 'unified-memory'],
        [1, 'unified-memory__header'],
        [1, 'unified-memory__title'],
        ['role', 'tablist', 'aria-label', 'Memory view mode', 1, 'unified-memory__modes'],
        ['role', 'tab', 1, 'unified-memory__mode-btn', 3, 'click'],
        [1, 'unified-memory__content'],
      ],
      template: (e, l) => {
        if (
          (e & 1 &&
            (n(0, 'div', 0)(1, 'header', 1)(2, 'h2', 2),
            r(3, 'Memory'),
            t(),
            n(4, 'div', 3)(5, 'button', 4),
            p('click', () => l.setView('overview')),
            r(6, ' Overview '),
            t(),
            n(7, 'button', 4),
            p('click', () => l.setView('browse')),
            r(8, ' Browse '),
            t()()(),
            n(9, 'div', 5),
            m(10, ct, 1, 0, 'app-brain-viewer')(11, dt, 1, 0, 'app-memory-browser'),
            t()()),
          e & 2)
        ) {
          let s;
          o(5),
            f('unified-memory__mode-btn--active', l.view() === 'overview'),
            S('aria-selected', l.view() === 'overview'),
            o(2),
            f('unified-memory__mode-btn--active', l.view() === 'browse'),
            S('aria-selected', l.view() === 'browse'),
            o(3),
            _((s = l.view()) === 'overview' ? 10 : s === 'browse' ? 11 : -1);
        }
      },
      dependencies: [L, R],
      styles: [
        '.unified-memory[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100%}.unified-memory__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.25rem;background:#0c0d144d;border-bottom:1px solid var(--border-subtle);flex-shrink:0}.unified-memory__title[_ngcontent-%COMP%]{font-size:.95rem;font-weight:600;color:var(--text-primary);margin:0}.unified-memory__modes[_ngcontent-%COMP%]{display:flex;gap:0;background:var(--glass-bg-solid);border:1px solid var(--border-subtle);border-radius:6px;overflow:hidden}.unified-memory__mode-btn[_ngcontent-%COMP%]{padding:.35rem .85rem;font-size:.72rem;font-weight:600;font-family:inherit;letter-spacing:.03em;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;transition:color .15s,background .15s}.unified-memory__mode-btn[_ngcontent-%COMP%]:hover{color:var(--text-primary);background:var(--bg-hover)}.unified-memory__mode-btn--active[_ngcontent-%COMP%]{color:var(--accent-cyan);background:var(--accent-cyan-subtle);text-shadow:0 0 8px var(--accent-cyan-border)}.unified-memory__content[_ngcontent-%COMP%]{flex:1;overflow-y:auto}@media(max-width:767px){.unified-memory__header[_ngcontent-%COMP%]{padding:.5rem .75rem}.unified-memory__mode-btn[_ngcontent-%COMP%]{padding:.3rem .65rem;font-size:.68rem}}',
      ],
      changeDetection: 0,
    });
  };

export { ae as UnifiedMemoryComponent };
