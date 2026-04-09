import { a as U } from './chunk-2EJE5M6O.js';
import { a as q } from './chunk-4NPB6SSM.js';
import { a as Z } from './chunk-355WLUEG.js';
import { r as X } from './chunk-AF4UDQOX.js';
import { a as W } from './chunk-CSQXEU3M.js';
import { a as G } from './chunk-CZZRTCER.js';
import { a as Y } from './chunk-FGNIWOFY.js';
import './chunk-ZSTU6MUH.js';
import './chunk-G7DVZDMF.js';
import { e as j } from './chunk-GH246MXO.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  Pb as _,
  T as A,
  qb as a,
  Sb as B,
  mb as C,
  Ob as c,
  ob as D,
  Bb as d,
  Z as E,
  ac as F,
  fc as f,
  _a as H,
  _ as h,
  Lb as I,
  Na as i,
  Y as k,
  Rb as L,
  Qb as M,
  hb as m,
  kb as N,
  pb as o,
  ja as P,
  ib as p,
  vb as R,
  bc as S,
  jb as s,
  $ as T,
  nb as u,
  zb as w,
  rb as x,
  $b as y,
  Mb as z,
} from './chunk-LF4EWAJA.js';

var V = (_t, n) => n.agentId,
  $ = (_t, n) => n.key,
  te = (_t, n) => n.component,
  K = (_t, n) => n.id,
  ne = (_t, n) => n.source,
  ie = (_t, n) => n.value,
  ae = (_t, n) => n.text;
function oe(t, _n) {
  t & 1 && x(0, 'app-skeleton', 3), t & 2 && D('count', 4);
}
function re(t, _n) {
  t & 1 &&
    (o(0, 'div', 4)(1, 'p'), c(2, 'Reputation service unavailable (503). Scores may not be computed yet.'), a()());
}
function ce(t, _n) {
  t & 1 && x(0, 'app-empty-state', 5);
}
function le(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 24)(1, 'div', 25)(2, 'span'),
      c(3),
      a(),
      o(4, 'span', 26),
      c(5),
      a()(),
      o(6, 'div', 27),
      x(7, 'div', 28),
      a(),
      o(8, 'span', 29),
      c(9),
      y(10, 'number'),
      a()()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d(2).$implicit;
    i(3),
      _(e.label),
      i(2),
      _(e.weight),
      i(2),
      I('width', r.components[e.key], '%'),
      m('data-color', e.color),
      i(2),
      _(S(10, 6, r.components[e.key], '1.0-0'));
  }
}
function de(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 14)(1, 'div', 18),
      h(),
      o(2, 'svg', 19),
      x(3, 'circle', 20)(4, 'circle', 21),
      o(5, 'text', 22),
      c(6),
      y(7, 'number'),
      a()()(),
      T(),
      o(8, 'div', 23),
      C(9, le, 11, 9, 'div', 24, $),
      a()()),
    t & 2)
  ) {
    const e = d().$implicit,
      r = d(2);
    i(4),
      m('data-level', e.trustLevel)('stroke-dasharray', r.ringCircumference)(
        'stroke-dashoffset',
        r.getRingOffset(e.overallScore),
      ),
      i(2),
      M(' ', S(7, 4, e.overallScore, '1.0-0'), ' '),
      i(3),
      u(r.componentMeta);
  }
}
function _e(t, _n) {
  t & 1 && (o(0, 'div', 15), c(1, 'No activity data'), a());
}
function pe(t, n) {
  if (t & 1) {
    const e = R();
    o(0, 'div', 10),
      w('click', () => {
        const l = k(e).$implicit,
          g = d(2);
        return E(g.selectAgent(l.agentId));
      }),
      o(1, 'div', 11)(2, 'span', 12),
      c(3),
      a(),
      o(4, 'span', 13),
      c(5),
      a()(),
      p(6, de, 11, 7, 'div', 14)(7, _e, 2, 0, 'div', 15),
      o(8, 'div', 16)(9, 'span', 17),
      c(10),
      y(11, 'relativeTime'),
      a()()();
  }
  if (t & 2) {
    const e = n.$implicit,
      r = d(2);
    z('agent-card--selected', r.selectedAgentId() === e.agentId),
      i(3),
      _(r.getAgentName(e.agentId)),
      i(),
      m('data-level', e.trustLevel),
      i(),
      _(e.trustLevel),
      i(),
      s(e.hasActivity ? 6 : 7),
      i(4),
      _(F(11, 7, e.computedAt));
  }
}
function se(t, n) {
  if ((t & 1 && (h(), o(0, 'g')(1, 'text', 36), c(2), a(), x(3, 'rect', 37), o(4, 'text', 38), c(5), a()()), t & 2)) {
    const e = n.$implicit,
      r = n.$index;
    m('transform', `translate(0,${r * 28})`),
      i(2),
      _(e.name),
      i(),
      m('width', e.barWidth)('data-level', e.trustLevel),
      i(),
      m('x', 104 + e.barWidth),
      i(),
      _(e.score);
  }
}
function me(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 41)(1, 'span', 42), c(2), a(), o(3, 'div', 43), x(4, 'div', 44), a(), o(5, 'span', 45), c(6), a()()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d().$implicit;
    i(2), _(e.name), i(2), I('width', e.components[r.key], '%'), m('data-color', r.color), i(2), _(e.components[r.key]);
  }
}
function ge(t, n) {
  if (
    (t & 1 && (o(0, 'div', 35)(1, 'span', 39), c(2), a(), o(3, 'div', 40), C(4, me, 7, 5, 'div', 41, V), a()()), t & 2)
  ) {
    const e = n.$implicit,
      r = d(4);
    i(2), _(e.label), i(2), u(r.comparisonData());
  }
}
function ve(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 31)(1, 'div', 32),
      h(),
      o(2, 'svg', 33),
      C(3, se, 6, 6, ':svg:g', null, V),
      a()(),
      T(),
      o(5, 'div', 34),
      C(6, ge, 6, 1, 'div', 35, $),
      a()()),
    t & 2)
  ) {
    const e = d(3);
    i(2),
      m('viewBox', `0 0 ${e.compareWidth} ${e.compareBarHeight}`),
      i(),
      u(e.comparisonData()),
      i(3),
      u(e.componentMeta);
  }
}
function Ce(t, _n) {
  if (t & 1) {
    const e = R();
    o(0, 'div', 8)(1, 'h4')(2, 'button', 30),
      w('click', () => {
        k(e);
        const l = d(2);
        return E(l.compareMode.set(!l.compareMode()));
      }),
      c(3),
      a()(),
      p(4, ve, 8, 1, 'div', 31),
      a();
  }
  if (t & 2) {
    const e = d(2);
    i(2),
      z('btn--primary', e.compareMode()),
      i(),
      M(' ', e.compareMode() ? 'Exit Compare' : 'Compare Agents', ' '),
      i(),
      s(e.compareMode() ? 4 : -1);
  }
}
function ue(t, _n) {
  t & 1 && (o(0, 'div', 50), c(1, ' This agent has no recorded activity. Scores shown are system defaults. '), a());
}
function xe(t, _n) {
  if ((t & 1 && (o(0, 'div', 54), c(1), y(2, 'number'), a()), t & 2)) {
    const e = d();
    i(), L(' Decay applied: ', S(2, 2, e.decayFactor, '1.3-3'), 'x multiplier (raw score: ', e.rawScore, ') ');
  }
}
function he(t, _n) {
  t & 1 && (o(0, 'span', 62), c(1, 'DEFAULT'), a());
}
function fe(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 67)(1, 'span', 68),
      c(2),
      a(),
      o(3, 'span', 69),
      c(4),
      a(),
      o(5, 'span', 70),
      c(6),
      y(7, 'relativeTime'),
      a()()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d(7);
    i(),
      m('data-type', e.event_type),
      i(),
      _(r.getEventLabel(e.event_type)),
      i(),
      m('data-impact', e.score_impact >= 0 ? 'positive' : 'negative'),
      i(),
      L(' ', e.score_impact >= 0 ? '+' : '', '', e.score_impact, ' '),
      i(2),
      _(F(7, 6, e.created_at));
  }
}
function ye(t, _n) {
  if ((t & 1 && (o(0, 'div', 65)(1, 'span', 66), c(2), a(), C(3, fe, 8, 8, 'div', 67, K), a()), t & 2)) {
    const e = d().$implicit;
    i(2), M('Evidence (', e.recentEvents.length, ' events):'), i(), u(e.recentEvents);
  }
}
function be(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 57)(1, 'div', 58)(2, 'span', 59),
      c(3),
      a(),
      o(4, 'span', 60),
      c(5),
      y(6, 'number'),
      a(),
      o(7, 'span', 61),
      c(8),
      y(9, 'number'),
      a(),
      p(10, he, 2, 0, 'span', 62),
      a(),
      o(11, 'div', 63),
      c(12),
      a(),
      o(13, 'div', 64),
      c(14),
      y(15, 'number'),
      a(),
      p(16, ye, 5, 1, 'div', 65),
      a()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d(5);
    z('explain-card--default', e.isDefault),
      i(3),
      _(r.getComponentLabel(e.component)),
      i(2),
      M('', S(6, 10, e.weight * 100, '1.0-0'), '%'),
      i(2),
      m('data-color', r.getComponentColor(e.component)),
      i(),
      M(' ', S(9, 13, e.score, '1.0-0'), ' '),
      i(2),
      s(e.isDefault ? 10 : -1),
      i(2),
      _(e.reason),
      i(2),
      M(' Contributes ', S(15, 16, e.weightedContribution, '1.1-1'), ' to overall score '),
      i(2),
      s(e.recentEvents.length > 0 ? 16 : -1);
  }
}
function Pe(t, n) {
  if ((t & 1 && (p(0, xe, 3, 5, 'div', 54), o(1, 'div', 55), C(2, be, 17, 19, 'div', 56, te), a()), t & 2)) {
    const e = n;
    s(e.decayFactor < 1 ? 0 : -1), i(2), u(e.components);
  }
}
function Me(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 71)(1, 'div', 72)(2, 'span'),
      c(3),
      a(),
      o(4, 'span', 73),
      c(5),
      a()(),
      o(6, 'div', 74),
      x(7, 'div', 75),
      a(),
      o(8, 'span', 76),
      c(9),
      y(10, 'number'),
      a()()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d(2);
    i(3),
      _(e.label),
      i(2),
      _(e.weight),
      i(2),
      I('width', r.components[e.key], '%'),
      m('data-color', e.color),
      i(2),
      _(S(10, 6, r.components[e.key], '1.0-0'));
  }
}
function Oe(t, _n) {
  if ((t & 1 && (o(0, 'div', 51), C(1, Me, 11, 9, 'div', 71, $), a()), t & 2)) {
    const e = d(4);
    i(), u(e.componentMeta);
  }
}
function Se(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 78)(1, 'div', 79),
      c(2, '\u{1F44D}'),
      a(),
      o(3, 'div', 80),
      c(4),
      a(),
      o(5, 'div', 81),
      c(6, 'Likes'),
      a()(),
      o(7, 'div', 78)(8, 'div', 82),
      c(9, '\u{1F44E}'),
      a(),
      o(10, 'div', 80),
      c(11),
      a(),
      o(12, 'div', 81),
      c(13, 'Dislikes'),
      a()()),
    t & 2)
  ) {
    const e = d(5);
    i(4), _(e.stats().feedbackTotal.positive), i(7), _(e.stats().feedbackTotal.negative);
  }
}
function we(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 79),
    c(2, '\u2713'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Tasks Done'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function ke(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 82),
    c(2, '\u2717'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Tasks Failed'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function Ee(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 83),
    c(2, '\u2699'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Sessions'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function Te(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 83),
    c(2, '\u{1F517}'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Attestations'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function Re(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 79),
    c(2, '\u21BA'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Improvements'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function Ie(t, n) {
  t & 1 &&
    (o(0, 'div', 78)(1, 'div', 82),
    c(2, '\u26A0'),
    a(),
    o(3, 'div', 80),
    c(4),
    a(),
    o(5, 'div', 81),
    c(6, 'Violations'),
    a()()),
    t & 2 && (i(4), _(n.count));
}
function Le(t, n) {
  if (
    (t & 1 && (o(0, 'div', 85)(1, 'span', 86), c(2), a(), o(3, 'span', 87), c(4), a(), o(5, 'span', 88), c(6), a()()),
    t & 2)
  ) {
    const e = n.$implicit;
    i(2), _(e.source), i(2), M('+', e.positive), i(2), M('-', e.negative);
  }
}
function $e(t, _n) {
  if (
    (t & 1 && (o(0, 'h4'), c(1, 'Feedback by Source'), a(), o(2, 'div', 84), C(3, Le, 7, 3, 'div', 85, ne), a()), t & 2)
  ) {
    const e = d(5);
    i(3), u(e.feedbackSources());
  }
}
function Ae(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'h4'),
      c(1, 'Activity Breakdown'),
      a(),
      o(2, 'div', 77),
      p(3, Se, 14, 2),
      p(4, we, 7, 1, 'div', 78),
      p(5, ke, 7, 1, 'div', 78),
      p(6, Ee, 7, 1, 'div', 78),
      p(7, Te, 7, 1, 'div', 78),
      p(8, Re, 7, 1, 'div', 78),
      p(9, Ie, 7, 1, 'div', 78),
      a(),
      p(10, $e, 5, 0)),
    t & 2)
  ) {
    let e,
      r,
      l,
      g,
      v,
      O,
      b = d(4);
    i(3),
      s(b.stats().feedbackTotal.total > 0 ? 3 : -1),
      i(),
      s((e = b.stats().events.task_completed) ? 4 : -1, e),
      i(),
      s((r = b.stats().events.task_failed) ? 5 : -1, r),
      i(),
      s((l = b.stats().events.session_completed) ? 6 : -1, l),
      i(),
      s((g = b.stats().events.attestation_published) ? 7 : -1, g),
      i(),
      s((v = b.stats().events.improvement_loop_completed) ? 8 : -1, v),
      i(),
      s((O = b.stats().events.security_violation) ? 9 : -1, O),
      i(),
      s(b.hasFeedbackSources() ? 10 : -1);
  }
}
function De(t, _n) {
  if ((t & 1 && (o(0, 'p', 52), c(1, 'Attestation: '), o(2, 'code'), c(3), a()()), t & 2)) {
    const e = d();
    i(3), _(e.attestationHash);
  }
}
function ze(t, _n) {
  if (t & 1) {
    const e = R();
    o(0, 'button', 89),
      w('click', () => {
        k(e);
        const l = d(),
          g = d(3);
        return E(g.onCreateAttestation(l.agentId));
      }),
      c(1, 'Create Attestation'),
      a();
  }
}
function Fe(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 48)(1, 'h3'),
      c(2),
      a(),
      o(3, 'span', 49),
      c(4),
      a()(),
      p(5, ue, 2, 0, 'div', 50),
      p(6, Pe, 4, 1)(7, Oe, 3, 0, 'div', 51),
      p(8, Ae, 11, 8),
      p(9, De, 4, 1, 'p', 52)(10, ze, 2, 0, 'button', 53)),
    t & 2)
  ) {
    let e,
      r = n,
      l = d(3);
    i(2),
      _(l.getAgentName(r.agentId)),
      i(),
      m('data-level', r.trustLevel),
      i(),
      _(r.trustLevel),
      i(),
      s(r.hasActivity ? -1 : 5),
      i(),
      s((e = l.explanation()) ? 6 : 7, e),
      i(2),
      s(l.stats() ? 8 : -1),
      i(),
      s(r.attestationHash ? 9 : 10);
  }
}
function Ne(t, _n) {
  if ((t & 1 && (o(0, 'span', 100), c(1), a()), t & 2)) {
    const e = d().$implicit;
    m('data-color', e.color), i(), _(e.label);
  }
}
function Ve(t, _n) {
  if ((t & 1 && p(0, Ne, 2, 2, 'span', 100), t & 2)) {
    const e = d(4);
    s(e.showComponents() ? 0 : -1);
  }
}
function He(t, n) {
  if ((t & 1 && (h(), x(0, 'line', 101), o(1, 'text', 102), c(2), a()), t & 2)) {
    const e = n.$implicit,
      r = d(4);
    m('y1', e.y)('x2', r.historyWidth)('y2', e.y), i(), m('y', e.y - 2), i(), _(e.value);
  }
}
function Be(t, n) {
  if ((t & 1 && (h(), x(0, 'path', 103)), t & 2)) {
    const e = n.$implicit;
    m('d', e.path)('data-color', e.color);
  }
}
function je(t, _n) {
  if ((t & 1 && C(0, Be, 1, 2, ':svg:path', 103, $), t & 2)) {
    const e = d(4);
    u(e.historyComponentLines());
  }
}
function Ge(t, _n) {
  if ((t & 1 && (h(), x(0, 'path', 95)), t & 2)) {
    const e = d(4);
    m('d', e.historyAreaPath());
  }
}
function We(t, _n) {
  if ((t & 1 && (h(), x(0, 'path', 96)), t & 2)) {
    const e = d(4);
    m('d', e.historyLinePath());
  }
}
function Xe(t, n) {
  if ((t & 1 && (h(), o(0, 'circle', 97)(1, 'title'), c(2), a()()), t & 2)) {
    const e = n.$implicit;
    m('cx', e.x)('cy', e.y)('data-level', e.trustLevel), i(2), L('', e.date, ': Score ', e.score);
  }
}
function Ze(t, n) {
  if ((t & 1 && (o(0, 'span'), c(1), a()), t & 2)) {
    const e = n.$implicit;
    I('left', e.pct, '%'), i(), _(e.text);
  }
}
function Ye(t, _n) {
  if (t & 1) {
    const e = R();
    o(0, 'h4'),
      c(1, 'Score Trend'),
      a(),
      o(2, 'div', 90)(3, 'div', 91)(4, 'label', 92)(5, 'input', 93),
      w('change', () => {
        k(e);
        const l = d(3);
        return E(l.showComponents.set(!l.showComponents()));
      }),
      a(),
      c(6, ' Show components '),
      a(),
      C(7, Ve, 1, 1, null, null, $),
      a(),
      h(),
      o(9, 'svg', 94),
      C(10, He, 3, 5, null, null, ie),
      p(12, je, 2, 0),
      p(13, Ge, 1, 1, ':svg:path', 95),
      p(14, We, 1, 1, ':svg:path', 96),
      C(15, Xe, 3, 5, ':svg:circle', 97, N),
      a(),
      T(),
      o(17, 'div', 98),
      C(18, Ze, 2, 3, 'span', 99, ae),
      a()();
  }
  if (t & 2) {
    const e = d(3);
    i(5),
      D('checked', e.showComponents()),
      i(2),
      u(e.componentMeta),
      i(2),
      m('viewBox', `0 0 ${e.historyWidth} ${e.historyHeight}`),
      i(),
      u(e.historyYGrid),
      i(2),
      s(e.showComponents() ? 12 : -1),
      i(),
      s(e.historyAreaPath() ? 13 : -1),
      i(),
      s(e.historyLinePath() ? 14 : -1),
      i(),
      u(e.historyPoints()),
      i(3),
      u(e.historyXLabels());
  }
}
function Ue(t, _n) {
  if ((t & 1 && (h(), x(0, 'path', 107)), t & 2)) {
    const e = d(4);
    m('d', e.trendPathPositive());
  }
}
function qe(t, _n) {
  if ((t & 1 && (h(), x(0, 'path', 108)), t & 2)) {
    const e = d(4);
    m('d', e.trendPathNegative());
  }
}
function Je(t, _n) {
  if ((t & 1 && (h(), x(0, 'path', 109)), t & 2)) {
    const e = d(4);
    m('d', e.trendLinePath());
  }
}
function Ke(t, n) {
  if ((t & 1 && (h(), o(0, 'circle', 110)(1, 'title'), c(2), a()()), t & 2)) {
    const e = n.$implicit;
    m('cx', e.x)('cy', e.y)('data-impact', e.impact >= 0 ? 'positive' : 'negative'),
      i(2),
      B('', e.label, ': ', e.impact >= 0 ? '+' : '', '', e.impact);
  }
}
function Qe(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'h4'),
      c(1, 'Score Impact Timeline'),
      a(),
      o(2, 'div', 104),
      h(),
      o(3, 'svg', 105),
      x(4, 'line', 106),
      p(5, Ue, 1, 1, ':svg:path', 107),
      p(6, qe, 1, 1, ':svg:path', 108),
      p(7, Je, 1, 1, ':svg:path', 109),
      C(8, Ke, 3, 6, ':svg:circle', 110, N),
      a(),
      T(),
      o(10, 'div', 111)(11, 'span', 112),
      c(12, '+ positive'),
      a(),
      o(13, 'span', 113),
      c(14, '- negative'),
      a()()()),
    t & 2)
  ) {
    const e = d(3);
    i(3),
      m('viewBox', `0 0 ${e.trendWidth} ${e.trendHeight}`),
      i(),
      m('y1', e.trendHeight / 2)('x1', e.trendWidth)('y2', e.trendHeight / 2),
      i(),
      s(e.trendPathPositive() ? 5 : -1),
      i(),
      s(e.trendPathNegative() ? 6 : -1),
      i(),
      s(e.trendLinePath() ? 7 : -1),
      i(),
      u(e.trendPoints());
  }
}
function et(t, _n) {
  t & 1 && (o(0, 'p', 46), c(1, 'No events recorded.'), a());
}
function tt(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 114)(1, 'span', 115),
      c(2),
      a(),
      o(3, 'span', 116),
      c(4),
      a(),
      o(5, 'span', 117),
      c(6),
      y(7, 'relativeTime'),
      a()()),
    t & 2)
  ) {
    const e = n.$implicit,
      r = d(4);
    i(),
      m('data-type', e.eventType),
      i(),
      _(r.getEventLabel(e.eventType)),
      i(),
      m('data-impact', e.scoreImpact >= 0 ? 'positive' : 'negative'),
      i(),
      L(' ', e.scoreImpact >= 0 ? '+' : '', '', e.scoreImpact, ' '),
      i(2),
      _(F(7, 6, e.createdAt));
  }
}
function nt(t, _n) {
  if ((t & 1 && (o(0, 'div', 47), C(1, tt, 8, 8, 'div', 114, K), a()), t & 2)) {
    const e = d(3);
    i(), u(e.reputationService.events());
  }
}
function it(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 9),
      p(1, Fe, 11, 7),
      p(2, Ye, 20, 5),
      p(3, Qe, 15, 7),
      o(4, 'h4'),
      c(5, 'All Events'),
      a(),
      p(6, et, 2, 0, 'p', 46)(7, nt, 3, 0, 'div', 47),
      a()),
    t & 2)
  ) {
    let e,
      r = d(2);
    i(),
      s((e = r.selectedScore()) ? 1 : -1, e),
      i(),
      s(r.history().length > 1 ? 2 : -1),
      i(),
      s(r.reputationService.events().length > 1 ? 3 : -1),
      i(3),
      s(r.reputationService.events().length === 0 ? 6 : 7);
  }
}
function at(t, _n) {
  if (
    (t & 1 && (o(0, 'div', 6), C(1, pe, 12, 9, 'div', 7, V), a(), p(3, Ce, 5, 4, 'div', 8), p(4, it, 8, 4, 'div', 9)),
    t & 2)
  ) {
    const e = d();
    i(),
      u(e.reputationService.scores()),
      i(2),
      s(e.reputationService.scores().length > 1 ? 3 : -1),
      i(),
      s(e.selectedAgentId() ? 4 : -1);
  }
}
var J = class t {
  reputationService = A(q);
  agentService = A(G);
  notify = A(W);
  selectedAgentId = P(null);
  selectedScore = P(null);
  explanation = P(null);
  stats = P(null);
  computing = P(!1);
  loadError = P(!1);
  history = P([]);
  showComponents = P(!1);
  compareMode = P(!1);
  trendWidth = 400;
  trendHeight = 80;
  historyWidth = 500;
  historyHeight = 120;
  historyPad = 12;
  historyYGrid = [
    { value: 100, y: 12 },
    { value: 50, y: 60 },
    { value: 0, y: 108 },
  ];
  historyPoints = f(() => {
    const n = this.history();
    if (n.length < 2) return [];
    const e = this.historyPad,
      r = this.historyWidth,
      l = this.historyHeight;
    return n.map((g, v) => ({
      x: e + (v / (n.length - 1)) * (r - e * 2),
      y: e + ((100 - g.overallScore) / 100) * (l - e * 2),
      score: g.overallScore,
      trustLevel: g.trustLevel,
      date: new Date(g.computedAt).toLocaleDateString(),
    }));
  });
  historyLinePath = f(() => {
    const n = this.historyPoints();
    return n.length < 2 ? '' : `M ${n.map((e) => `${e.x},${e.y}`).join(' L ')}`;
  });
  historyAreaPath = f(() => {
    const n = this.historyPoints();
    if (n.length < 2) return '';
    const e = this.historyHeight - this.historyPad;
    return `M ${n[0].x},${e} ${n.map((r) => `L ${r.x},${r.y}`).join(' ')} L ${n[n.length - 1].x},${e} Z`;
  });
  historyComponentLines = f(() => {
    const n = this.history();
    if (n.length < 2) return [];
    const e = this.historyPad,
      r = this.historyWidth,
      l = this.historyHeight;
    return this.componentMeta.map((g) => {
      const v = n.map((O, b) => {
        const Q = e + (b / (n.length - 1)) * (r - e * 2),
          ee = e + ((100 - O.components[g.key]) / 100) * (l - e * 2);
        return `${Q},${ee}`;
      });
      return { key: g.key, color: g.color, path: `M ${v.join(' L ')}` };
    });
  });
  historyXLabels = f(() => {
    const n = this.history();
    if (n.length < 2) return [];
    const e = Math.min(n.length, 5),
      r = [];
    for (let l = 0; l < e; l++) {
      const g = Math.round((l / (e - 1)) * (n.length - 1)),
        v = new Date(n[g].computedAt);
      r.push({ text: `${v.getMonth() + 1}/${v.getDate()}`, pct: (g / (n.length - 1)) * 100 });
    }
    return r;
  });
  compareWidth = 400;
  compareBarHeight = f(() => this.reputationService.scores().length * 28);
  comparisonData = f(() => {
    const n = this.compareWidth - 140;
    return this.reputationService
      .scores()
      .filter((e) => e.hasActivity)
      .sort((e, r) => r.overallScore - e.overallScore)
      .map((e) => ({
        agentId: e.agentId,
        name: this.getAgentName(e.agentId),
        score: e.overallScore,
        trustLevel: e.trustLevel,
        components: e.components,
        barWidth: (e.overallScore / 100) * n,
      }));
  });
  trendPoints = f(() => {
    const n = this.reputationService.events();
    if (n.length < 2) return [];
    const e = [...n].sort((v, O) => new Date(v.createdAt).getTime() - new Date(O.createdAt).getTime()),
      r = Math.max(...e.map((v) => Math.abs(v.scoreImpact)), 1),
      l = this.trendHeight / 2,
      g = 8;
    return e.map((v, O) => ({
      x: g + (O / (e.length - 1)) * (this.trendWidth - g * 2),
      y: l - (v.scoreImpact / r) * (l - g),
      impact: v.scoreImpact,
      label: this.eventLabels[v.eventType] ?? v.eventType,
    }));
  });
  trendLinePath = f(() => {
    const n = this.trendPoints();
    return n.length < 2 ? '' : `M ${n.map((e) => `${e.x},${e.y}`).join(' L ')}`;
  });
  trendPathPositive = f(() => {
    const n = this.trendPoints();
    if (n.length < 2) return '';
    const e = this.trendHeight / 2,
      r = n.map((l) => ({ x: l.x, y: Math.min(l.y, e) }));
    return `M ${r[0].x},${e} ${r.map((l) => `L ${l.x},${l.y}`).join(' ')} L ${r[r.length - 1].x},${e} Z`;
  });
  trendPathNegative = f(() => {
    const n = this.trendPoints();
    if (n.length < 2) return '';
    const e = this.trendHeight / 2,
      r = n.map((l) => ({ x: l.x, y: Math.max(l.y, e) }));
    return `M ${r[0].x},${e} ${r.map((l) => `L ${l.x},${l.y}`).join(' ')} L ${r[r.length - 1].x},${e} Z`;
  });
  ringCircumference = 2 * Math.PI * 52;
  componentMeta = [
    { key: 'taskCompletion', label: 'Task Completion', weight: '30%', color: 'green' },
    { key: 'peerRating', label: 'Peer Rating', weight: '25%', color: 'yellow' },
    { key: 'creditPattern', label: 'Credit Pattern', weight: '15%', color: 'cyan' },
    { key: 'securityCompliance', label: 'Security', weight: '20%', color: 'purple' },
    { key: 'activityLevel', label: 'Activity', weight: '10%', color: 'orange' },
  ];
  eventLabels = {
    task_completed: 'Task Completed',
    task_failed: 'Task Failed',
    review_received: 'Review Received',
    credit_spent: 'Credit Spent',
    credit_earned: 'Credit Earned',
    security_violation: 'Security Violation',
    session_completed: 'Session Completed',
    attestation_published: 'Attestation Published',
    improvement_loop_completed: 'Improvement Completed',
    improvement_loop_failed: 'Improvement Failed',
  };
  agentNameCache = {};
  async ngOnInit() {
    await this.agentService.loadAgents();
    for (const n of this.agentService.agents()) this.agentNameCache[n.id] = n.name;
    try {
      await this.reputationService.loadScores();
    } catch {
      this.loadError.set(!0);
    }
  }
  getAgentName(n) {
    return this.agentNameCache[n] ?? n.slice(0, 8);
  }
  getRingOffset(n) {
    return this.ringCircumference - (n / 100) * this.ringCircumference;
  }
  getEventLabel(n) {
    return this.eventLabels[n] ?? n;
  }
  componentLabels = {
    taskCompletion: 'Task Completion',
    peerRating: 'Peer Rating',
    creditPattern: 'Credit Pattern',
    securityCompliance: 'Security',
    activityLevel: 'Activity',
  };
  componentColors = {
    taskCompletion: 'green',
    peerRating: 'yellow',
    creditPattern: 'cyan',
    securityCompliance: 'purple',
    activityLevel: 'orange',
  };
  getComponentLabel(n) {
    return this.componentLabels[n] ?? n;
  }
  getComponentColor(n) {
    return this.componentColors[n] ?? 'cyan';
  }
  hasFeedbackSources() {
    const n = this.stats();
    return !!n && Object.keys(n.feedback).length > 0;
  }
  feedbackSources() {
    const n = this.stats();
    return n
      ? Object.entries(n.feedback).map(([e, r]) => ({ source: e, positive: r.positive, negative: r.negative }))
      : [];
  }
  async selectAgent(n) {
    this.selectedAgentId.set(n), this.explanation.set(null), this.stats.set(null), this.history.set([]);
    try {
      const e = await this.reputationService.getScore(n);
      this.selectedScore.set(e),
        await Promise.all([
          this.reputationService.getEvents(n, 0),
          this.reputationService.getExplanation(n).then((r) => this.explanation.set(r)),
          this.reputationService
            .getStats(n)
            .then((r) => this.stats.set(r))
            .catch(() => {}),
          this.reputationService
            .getHistory(n)
            .then((r) => this.history.set(r))
            .catch(() => {}),
        ]);
    } catch {
      this.selectedScore.set(null);
    }
  }
  async onComputeAll() {
    this.computing.set(!0);
    try {
      await this.reputationService.computeAll(), this.notify.success('All scores recomputed');
    } catch {
      this.notify.error('Failed to compute scores');
    } finally {
      this.computing.set(!1);
    }
  }
  async onCreateAttestation(n) {
    try {
      await this.reputationService.createAttestation(n);
      const e = await this.reputationService.getScore(n);
      this.selectedScore.set(e), this.notify.success('Attestation created');
    } catch {
      this.notify.error('Failed to create attestation');
    }
  }
  static \u0275fac = (e) => new (e || t)();
  static \u0275cmp = H({
    type: t,
    selectors: [['app-reputation']],
    decls: 10,
    vars: 3,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      ['variant', 'table', 3, 'count'],
      [1, 'error-banner'],
      [
        'icon',
        `  [***]
  [** ]
  [*  ]`,
        'title',
        'No reputation scores yet.',
        'description',
        'Reputation scores are computed from agent activity, session outcomes, and peer reviews.',
        'actionLabel',
        'View Agents',
        'actionRoute',
        '/agents',
        'actionAriaLabel',
        'View agents to start building reputation',
      ],
      [1, 'card-grid', 'stagger-children'],
      [1, 'agent-card', 'card-lift', 3, 'agent-card--selected'],
      [1, 'compare-section'],
      [1, 'detail-panel'],
      [1, 'agent-card', 'card-lift', 3, 'click'],
      [1, 'agent-card__header'],
      [1, 'agent-card__name'],
      [1, 'trust-badge'],
      [1, 'agent-card__body'],
      [1, 'no-activity'],
      [1, 'agent-card__footer'],
      [1, 'computed-at'],
      [1, 'score-ring'],
      ['viewBox', '0 0 120 120', 1, 'score-ring__svg'],
      ['cx', '60', 'cy', '60', 'r', '52', 1, 'score-ring__bg'],
      ['cx', '60', 'cy', '60', 'r', '52', 'transform', 'rotate(-90 60 60)', 1, 'score-ring__fill'],
      ['x', '60', 'y', '60', 'dominant-baseline', 'central', 'text-anchor', 'middle', 1, 'score-ring__text'],
      [1, 'component-bars'],
      [1, 'comp-bar'],
      [1, 'comp-bar__label'],
      [1, 'comp-bar__weight'],
      [1, 'comp-bar__track'],
      [1, 'comp-bar__fill'],
      [1, 'comp-bar__value'],
      [1, 'btn', 'btn--sm', 3, 'click'],
      [1, 'compare-grid'],
      [1, 'compare-chart'],
      [1, 'compare-chart__svg'],
      [1, 'compare-components'],
      [1, 'compare-component-row'],
      ['x', '0', 'y', '16', 1, 'compare-chart__name'],
      ['x', '100', 'y', '4', 'height', '16', 'rx', '3', 1, 'compare-chart__bar'],
      ['y', '16', 1, 'compare-chart__score'],
      [1, 'compare-component-label'],
      [1, 'compare-component-bars'],
      [1, 'compare-mini-bar'],
      [1, 'compare-mini-name'],
      [1, 'compare-mini-track'],
      [1, 'compare-mini-fill'],
      [1, 'compare-mini-val'],
      [1, 'empty'],
      [1, 'events-list'],
      [1, 'detail-panel__header'],
      [1, 'trust-badge', 'trust-badge--lg'],
      [1, 'no-activity-notice'],
      [1, 'detail-components'],
      [1, 'attestation'],
      [1, 'btn', 'btn--primary', 'btn--sm'],
      [1, 'decay-notice'],
      [1, 'explain-components'],
      [1, 'explain-card', 3, 'explain-card--default'],
      [1, 'explain-card'],
      [1, 'explain-card__header'],
      [1, 'explain-card__name'],
      [1, 'explain-card__weight'],
      [1, 'explain-card__score'],
      [1, 'default-badge'],
      [1, 'explain-card__reason'],
      [1, 'explain-card__contribution'],
      [1, 'explain-card__events'],
      [1, 'explain-card__events-label'],
      [1, 'explain-event'],
      [1, 'explain-event__type'],
      [1, 'explain-event__impact'],
      [1, 'explain-event__time'],
      [1, 'detail-bar'],
      [1, 'detail-bar__label'],
      [1, 'detail-bar__weight'],
      [1, 'detail-bar__track'],
      [1, 'detail-bar__fill'],
      [1, 'detail-bar__value'],
      [1, 'stats-grid', 'stagger-scale'],
      [1, 'stat-card'],
      ['data-type', 'positive', 1, 'stat-card__icon'],
      [1, 'stat-card__value'],
      [1, 'stat-card__label'],
      ['data-type', 'negative', 1, 'stat-card__icon'],
      [1, 'stat-card__icon'],
      [1, 'feedback-sources'],
      [1, 'source-row'],
      [1, 'source-row__name'],
      [1, 'source-row__positive'],
      [1, 'source-row__negative'],
      [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click'],
      [1, 'history-chart'],
      [1, 'history-chart__legend'],
      [1, 'history-chart__toggle'],
      ['type', 'checkbox', 3, 'change', 'checked'],
      ['preserveAspectRatio', 'none', 1, 'history-chart__svg'],
      [1, 'history-chart__area'],
      [1, 'history-chart__main-line'],
      ['r', '3', 1, 'history-chart__dot'],
      [1, 'history-chart__x-labels'],
      [3, 'left'],
      [1, 'history-chart__legend-item'],
      ['x1', '0', 1, 'history-chart__grid'],
      ['x', '2', 1, 'history-chart__axis-label'],
      [1, 'history-chart__component-line'],
      [1, 'trend-chart'],
      ['preserveAspectRatio', 'none', 1, 'trend-chart__svg'],
      ['x1', '0', 1, 'trend-chart__zero'],
      [1, 'trend-chart__area', 'trend-chart__area--positive'],
      [1, 'trend-chart__area', 'trend-chart__area--negative'],
      [1, 'trend-chart__line'],
      ['r', '2.5', 1, 'trend-chart__dot'],
      [1, 'trend-chart__labels'],
      [1, 'trend-chart__label', 'trend-chart__label--positive'],
      [1, 'trend-chart__label', 'trend-chart__label--negative'],
      [1, 'event-row'],
      [1, 'event-label'],
      [1, 'event-impact'],
      [1, 'event-time'],
    ],
    template: (e, r) => {
      e & 1 &&
        (o(0, 'div', 0)(1, 'div', 1)(2, 'h2'),
        c(3, 'Agent Reputation'),
        a(),
        o(4, 'button', 2),
        w('click', () => r.onComputeAll()),
        c(5),
        a()(),
        p(6, oe, 1, 1, 'app-skeleton', 3)(7, re, 3, 0, 'div', 4)(8, ce, 1, 0, 'app-empty-state', 5)(9, at, 5, 2),
        a()),
        e & 2 &&
          (i(4),
          D('disabled', r.computing()),
          i(),
          M(' ', r.computing() ? 'Computing...' : 'Compute All', ' '),
          i(),
          s(r.reputationService.loading() ? 6 : r.loadError() ? 7 : r.reputationService.scores().length === 0 ? 8 : 9));
    },
    dependencies: [X, U, Y, j, Z],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.loading[_ngcontent-%COMP%], .empty[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem}.error-banner[_ngcontent-%COMP%]{background:var(--accent-red-dim);border:1px solid var(--accent-red);border-radius:var(--radius);padding:.75rem 1rem;margin-bottom:1rem}.error-banner[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{margin:0;color:var(--accent-red);font-size:.85rem}.card-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem}.agent-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;cursor:pointer;transition:border-color .15s}.agent-card[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan)}.agent-card--selected[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--bg-raised)}.agent-card__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}.agent-card__name[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary);font-size:.9rem}.agent-card__body[_ngcontent-%COMP%]{display:flex;gap:1rem;align-items:flex-start}.agent-card__footer[_ngcontent-%COMP%]{margin-top:.75rem}.computed-at[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary)}.trust-badge[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;background:var(--bg-raised);border:1px solid var(--border)}.trust-badge--lg[_ngcontent-%COMP%]{font-size:.75rem;padding:2px 10px}.trust-badge[data-level=verified][_ngcontent-%COMP%], .trust-badge[data-level=high][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.trust-badge[data-level=medium][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.trust-badge[data-level=low][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107);border-color:var(--accent-yellow, #ffc107)}.trust-badge[data-level=untrusted][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.score-ring[_ngcontent-%COMP%]{flex-shrink:0;width:80px;height:80px}.score-ring__svg[_ngcontent-%COMP%]{width:100%;height:100%}.score-ring__bg[_ngcontent-%COMP%]{fill:none;stroke:var(--border);stroke-width:8}.score-ring__fill[_ngcontent-%COMP%]{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .5s ease;animation:_ngcontent-%COMP%_ringDraw .8s ease-out}@keyframes _ngcontent-%COMP%_ringDraw{0%{stroke-dashoffset:326.73}}.score-ring__fill[data-level=verified][_ngcontent-%COMP%], .score-ring__fill[data-level=high][_ngcontent-%COMP%]{stroke:var(--accent-green)}.score-ring__fill[data-level=medium][_ngcontent-%COMP%]{stroke:var(--accent-cyan)}.score-ring__fill[data-level=low][_ngcontent-%COMP%]{stroke:var(--accent-yellow, #ffc107)}.score-ring__fill[data-level=untrusted][_ngcontent-%COMP%]{stroke:var(--accent-red)}.score-ring__text[_ngcontent-%COMP%]{font-size:1.4rem;font-weight:700;fill:var(--text-primary)}.component-bars[_ngcontent-%COMP%]{flex:1;display:flex;flex-direction:column;gap:.3rem}.comp-bar[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 60px 28px;align-items:center;gap:.4rem}.comp-bar__label[_ngcontent-%COMP%]{display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-secondary)}.comp-bar__weight[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-secondary);opacity:.7}.comp-bar__track[_ngcontent-%COMP%]{height:6px;background:var(--bg-raised);border-radius:3px;overflow:hidden}.comp-bar__fill[_ngcontent-%COMP%]{height:100%;border-radius:3px;transition:width .3s ease}.comp-bar__fill[data-color=green][_ngcontent-%COMP%]{background:var(--accent-green)}.comp-bar__fill[data-color=yellow][_ngcontent-%COMP%]{background:var(--accent-yellow, #ffc107)}.comp-bar__fill[data-color=cyan][_ngcontent-%COMP%]{background:var(--accent-cyan)}.comp-bar__fill[data-color=purple][_ngcontent-%COMP%]{background:var(--accent-purple, #b388ff)}.comp-bar__fill[data-color=orange][_ngcontent-%COMP%]{background:var(--accent-orange, #ff9100)}.comp-bar__value[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-primary);text-align:right}.detail-panel[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-top:1.5rem}.detail-panel__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}.detail-panel__header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.detail-panel[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:1.5rem 0 .75rem;color:var(--text-primary)}.detail-components[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.detail-bar[_ngcontent-%COMP%]{display:grid;grid-template-columns:140px 1fr 40px;align-items:center;gap:.5rem}.detail-bar__label[_ngcontent-%COMP%]{display:flex;justify-content:space-between}.detail-bar__label[_ngcontent-%COMP%]   span[_ngcontent-%COMP%]:first-child{font-size:.8rem;color:var(--text-secondary);font-weight:600}.detail-bar__weight[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);opacity:.7}.detail-bar__track[_ngcontent-%COMP%]{height:8px;background:var(--bg-raised);border-radius:4px;overflow:hidden}.detail-bar__fill[_ngcontent-%COMP%]{height:100%;border-radius:4px;transition:width .3s ease}.detail-bar__fill[data-color=green][_ngcontent-%COMP%]{background:var(--accent-green)}.detail-bar__fill[data-color=yellow][_ngcontent-%COMP%]{background:var(--accent-yellow, #ffc107)}.detail-bar__fill[data-color=cyan][_ngcontent-%COMP%]{background:var(--accent-cyan)}.detail-bar__fill[data-color=purple][_ngcontent-%COMP%]{background:var(--accent-purple, #b388ff)}.detail-bar__fill[data-color=orange][_ngcontent-%COMP%]{background:var(--accent-orange, #ff9100)}.detail-bar__value[_ngcontent-%COMP%]{font-size:.85rem;color:var(--text-primary);text-align:right;font-weight:600}.attestation[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary);margin:1rem 0}.attestation[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{color:var(--accent-green);font-size:.75rem}.no-activity[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.8rem;padding:1rem;text-align:center;font-style:italic;width:100%}.no-activity-notice[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem;margin-bottom:1rem;font-size:.8rem;color:var(--text-secondary)}.decay-notice[_ngcontent-%COMP%]{background:var(--accent-yellow-dim, rgba(255, 193, 7, .1));border:1px solid var(--accent-yellow, #ffc107);border-radius:var(--radius);padding:.5rem .75rem;margin-bottom:1rem;font-size:.8rem;color:var(--accent-yellow, #ffc107)}.explain-components[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem}.explain-card[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem}.explain-card--default[_ngcontent-%COMP%]{border-left:3px solid var(--accent-yellow, #ffc107)}.explain-card__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}.explain-card__name[_ngcontent-%COMP%]{font-weight:600;font-size:.85rem;color:var(--text-primary)}.explain-card__weight[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary)}.explain-card__score[_ngcontent-%COMP%]{font-size:.85rem;font-weight:700;margin-left:auto}.explain-card__score[data-color=green][_ngcontent-%COMP%]{color:var(--accent-green)}.explain-card__score[data-color=yellow][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107)}.explain-card__score[data-color=cyan][_ngcontent-%COMP%]{color:var(--accent-cyan)}.explain-card__score[data-color=purple][_ngcontent-%COMP%]{color:var(--accent-purple, #b388ff)}.explain-card__score[data-color=orange][_ngcontent-%COMP%]{color:var(--accent-orange, #ff9100)}.default-badge[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 5px;border-radius:3px;font-weight:700;background:var(--accent-yellow-dim, rgba(255, 193, 7, .1));color:var(--accent-yellow, #ffc107);border:1px solid var(--accent-yellow, #ffc107)}.explain-card__reason[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary);line-height:1.4;margin-bottom:.3rem}.explain-card__contribution[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);opacity:.7}.explain-card__events[_ngcontent-%COMP%]{margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border)}.explain-card__events-label[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.3rem}.explain-event[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.15rem 0;font-size:.75rem}.explain-event__type[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.explain-event__type[data-type=task_completed][_ngcontent-%COMP%], .explain-event__type[data-type=credit_earned][_ngcontent-%COMP%], .explain-event__type[data-type=session_completed][_ngcontent-%COMP%]{color:var(--accent-green)}.explain-event__type[data-type=task_failed][_ngcontent-%COMP%], .explain-event__type[data-type=security_violation][_ngcontent-%COMP%]{color:var(--accent-red)}.explain-event__type[data-type=feedback_received][_ngcontent-%COMP%], .explain-event__type[data-type=review_received][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107)}.explain-event__type[data-type=credit_spent][_ngcontent-%COMP%]{color:var(--accent-cyan)}.explain-event__impact[_ngcontent-%COMP%]{font-weight:600;min-width:2.5em}.explain-event__impact[data-impact=positive][_ngcontent-%COMP%]{color:var(--accent-green)}.explain-event__impact[data-impact=negative][_ngcontent-%COMP%]{color:var(--accent-red)}.explain-event__time[_ngcontent-%COMP%]{color:var(--text-secondary);margin-left:auto}.stats-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:.75rem}.stat-card[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;text-align:center}.stat-card__icon[_ngcontent-%COMP%]{font-size:1.2rem;margin-bottom:.25rem}.stat-card__icon[data-type=positive][_ngcontent-%COMP%]{color:var(--accent-green)}.stat-card__icon[data-type=negative][_ngcontent-%COMP%]{color:var(--accent-red)}.stat-card__value[_ngcontent-%COMP%]{font-size:1.4rem;font-weight:700;color:var(--text-primary)}.stat-card__label[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-top:.15rem}.feedback-sources[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.source-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.35rem 0;font-size:.8rem;border-bottom:1px solid var(--border)}.source-row__name[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary);flex:1;text-transform:capitalize}.source-row__positive[_ngcontent-%COMP%]{color:var(--accent-green);font-weight:600}.source-row__negative[_ngcontent-%COMP%]{color:var(--accent-red);font-weight:600}.events-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem}.event-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.4rem 0;font-size:.8rem;border-bottom:1px solid var(--border)}.event-label[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.event-label[data-type=task_completed][_ngcontent-%COMP%], .event-label[data-type=credit_earned][_ngcontent-%COMP%], .event-label[data-type=session_completed][_ngcontent-%COMP%], .event-label[data-type=improvement_loop_completed][_ngcontent-%COMP%]{color:var(--accent-green)}.event-label[data-type=task_failed][_ngcontent-%COMP%], .event-label[data-type=security_violation][_ngcontent-%COMP%], .event-label[data-type=improvement_loop_failed][_ngcontent-%COMP%]{color:var(--accent-red)}.event-label[data-type=review_received][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107)}.event-label[data-type=credit_spent][_ngcontent-%COMP%]{color:var(--accent-cyan)}.event-label[data-type=attestation_published][_ngcontent-%COMP%]{color:var(--accent-purple, #b388ff)}.event-impact[_ngcontent-%COMP%]{font-weight:600;min-width:3em}.event-impact[data-impact=positive][_ngcontent-%COMP%]{color:var(--accent-green)}.event-impact[data-impact=negative][_ngcontent-%COMP%]{color:var(--accent-red)}.event-time[_ngcontent-%COMP%]{color:var(--text-secondary);margin-left:auto;font-size:.75rem}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--sm[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem}.btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.trend-chart[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem}.trend-chart__svg[_ngcontent-%COMP%]{width:100%;height:80px;display:block}.trend-chart__zero[_ngcontent-%COMP%]{stroke:var(--border);stroke-width:.5;stroke-dasharray:4 2}.trend-chart__line[_ngcontent-%COMP%]{fill:none;stroke:var(--accent-cyan);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}.trend-chart__area[_ngcontent-%COMP%]{opacity:.15}.trend-chart__area--positive[_ngcontent-%COMP%]{fill:var(--accent-green)}.trend-chart__area--negative[_ngcontent-%COMP%]{fill:var(--accent-red)}.trend-chart__dot[_ngcontent-%COMP%]{transition:r .15s}.trend-chart__dot[_ngcontent-%COMP%]:hover{r:4}.trend-chart__dot[data-impact=positive][_ngcontent-%COMP%]{fill:var(--accent-green)}.trend-chart__dot[data-impact=negative][_ngcontent-%COMP%]{fill:var(--accent-red)}.trend-chart__labels[_ngcontent-%COMP%]{display:flex;justify-content:space-between;margin-top:.35rem}.trend-chart__label[_ngcontent-%COMP%]{font-size:.55rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}.trend-chart__label--positive[_ngcontent-%COMP%]{color:var(--accent-green)}.trend-chart__label--negative[_ngcontent-%COMP%]{color:var(--accent-red)}.history-chart[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:1rem}.history-chart__legend[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;flex-wrap:wrap}.history-chart__toggle[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);display:flex;align-items:center;gap:.3rem;cursor:pointer}.history-chart__toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]{cursor:pointer}.history-chart__legend-item[_ngcontent-%COMP%]{font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}.history-chart__legend-item[data-color=green][_ngcontent-%COMP%]{color:var(--accent-green)}.history-chart__legend-item[data-color=yellow][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107)}.history-chart__legend-item[data-color=cyan][_ngcontent-%COMP%]{color:var(--accent-cyan)}.history-chart__legend-item[data-color=purple][_ngcontent-%COMP%]{color:var(--accent-purple, #b388ff)}.history-chart__legend-item[data-color=orange][_ngcontent-%COMP%]{color:var(--accent-orange, #ff9100)}.history-chart__svg[_ngcontent-%COMP%]{width:100%;height:120px;display:block}.history-chart__grid[_ngcontent-%COMP%]{stroke:var(--border);stroke-width:.5;opacity:.5}.history-chart__axis-label[_ngcontent-%COMP%]{fill:var(--text-tertiary);font-size:7px}.history-chart__main-line[_ngcontent-%COMP%]{fill:none;stroke:var(--accent-cyan);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.history-chart__area[_ngcontent-%COMP%]{fill:var(--accent-cyan);opacity:.08}.history-chart__component-line[_ngcontent-%COMP%]{fill:none;stroke-width:1;stroke-linejoin:round;stroke-linecap:round;opacity:.6}.history-chart__component-line[data-color=green][_ngcontent-%COMP%]{stroke:var(--accent-green)}.history-chart__component-line[data-color=yellow][_ngcontent-%COMP%]{stroke:var(--accent-yellow, #ffc107)}.history-chart__component-line[data-color=cyan][_ngcontent-%COMP%]{stroke:var(--accent-cyan);stroke-dasharray:4 2}.history-chart__component-line[data-color=purple][_ngcontent-%COMP%]{stroke:var(--accent-purple, #b388ff)}.history-chart__component-line[data-color=orange][_ngcontent-%COMP%]{stroke:var(--accent-orange, #ff9100)}.history-chart__dot[_ngcontent-%COMP%]{transition:r .15s;cursor:default}.history-chart__dot[_ngcontent-%COMP%]:hover{r:5}.history-chart__dot[data-level=verified][_ngcontent-%COMP%], .history-chart__dot[data-level=high][_ngcontent-%COMP%]{fill:var(--accent-green)}.history-chart__dot[data-level=medium][_ngcontent-%COMP%]{fill:var(--accent-cyan)}.history-chart__dot[data-level=low][_ngcontent-%COMP%]{fill:var(--accent-yellow, #ffc107)}.history-chart__dot[data-level=untrusted][_ngcontent-%COMP%]{fill:var(--accent-red)}.history-chart__x-labels[_ngcontent-%COMP%]{position:relative;height:1rem;margin-top:.25rem}.history-chart__x-labels[_ngcontent-%COMP%]   span[_ngcontent-%COMP%]{position:absolute;font-size:.55rem;color:var(--text-tertiary);transform:translate(-50%)}.compare-section[_ngcontent-%COMP%]{margin-top:1.5rem}.compare-section[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:0 0 .75rem}.compare-grid[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem}.compare-chart__svg[_ngcontent-%COMP%]{width:100%;display:block}.compare-chart__name[_ngcontent-%COMP%]{fill:var(--text-secondary);font-size:10px;font-weight:600}.compare-chart__bar[_ngcontent-%COMP%]{opacity:.8}.compare-chart__bar[data-level=verified][_ngcontent-%COMP%], .compare-chart__bar[data-level=high][_ngcontent-%COMP%]{fill:var(--accent-green)}.compare-chart__bar[data-level=medium][_ngcontent-%COMP%]{fill:var(--accent-cyan)}.compare-chart__bar[data-level=low][_ngcontent-%COMP%]{fill:var(--accent-yellow, #ffc107)}.compare-chart__bar[data-level=untrusted][_ngcontent-%COMP%]{fill:var(--accent-red)}.compare-chart__score[_ngcontent-%COMP%]{fill:var(--text-primary);font-size:10px;font-weight:700}.compare-components[_ngcontent-%COMP%]{margin-top:1rem;display:flex;flex-direction:column;gap:.75rem}.compare-component-label[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-primary);display:block;margin-bottom:.3rem}.compare-component-bars[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.2rem}.compare-mini-bar[_ngcontent-%COMP%]{display:grid;grid-template-columns:80px 1fr 30px;align-items:center;gap:.4rem}.compare-mini-name[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compare-mini-track[_ngcontent-%COMP%]{height:6px;background:var(--bg-raised);border-radius:3px;overflow:hidden}.compare-mini-fill[_ngcontent-%COMP%]{height:100%;border-radius:3px;transition:width .3s}.compare-mini-fill[data-color=green][_ngcontent-%COMP%]{background:var(--accent-green)}.compare-mini-fill[data-color=yellow][_ngcontent-%COMP%]{background:var(--accent-yellow, #ffc107)}.compare-mini-fill[data-color=cyan][_ngcontent-%COMP%]{background:var(--accent-cyan)}.compare-mini-fill[data-color=purple][_ngcontent-%COMP%]{background:var(--accent-purple, #b388ff)}.compare-mini-fill[data-color=orange][_ngcontent-%COMP%]{background:var(--accent-orange, #ff9100)}.compare-mini-val[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-primary);text-align:right}@media(max-width:767px){.card-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.agent-card__body[_ngcontent-%COMP%]{flex-direction:column;align-items:center}.component-bars[_ngcontent-%COMP%]{width:100%}.compare-mini-bar[_ngcontent-%COMP%]{grid-template-columns:60px 1fr 24px}}',
    ],
    changeDetection: 0,
  });
};

export { J as ReputationComponent };
