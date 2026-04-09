import { a as _e } from './chunk-355WLUEG.js';
import { a as ne } from './chunk-A4KCXO2Q.js';
import { f as ae, r as ce, b as ie, l as le, d as oe, k as re, m as se } from './chunk-AF4UDQOX.js';
import { a as ee } from './chunk-CSQXEU3M.js';
import { a as Y } from './chunk-CZZRTCER.js';
import { a as me } from './chunk-FGNIWOFY.js';
import { a as ue } from './chunk-HUVUOGY7.js';
import { a as pe } from './chunk-J3PBVME7.js';
import { a as te } from './chunk-OFKXBWQC.js';
import { a as de } from './chunk-UAEJUITU.js';
import { a as ge } from './chunk-WVB4QSU3.js';
import { a as Z } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import { b as X } from './chunk-D6WCRQHB.js';
import { e as J, g as K, h as Q } from './chunk-G7DVZDMF.js';
import { e as q } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  Pb as _,
  Lb as $,
  ac as A,
  Ob as a,
  Rb as B,
  $b as b,
  Y as C,
  Bb as c,
  _b as D,
  rb as E,
  Z as f,
  Mb as G,
  jb as g,
  _a as H,
  zb as h,
  qb as i,
  a as j,
  T as k,
  q as M,
  ib as m,
  Tb as N,
  hb as O,
  pb as o,
  bc as P,
  ja as p,
  Ka as R,
  Na as r,
  nb as S,
  fc as T,
  b as U,
  ob as u,
  Vb as V,
  Kb as W,
  mb as w,
  Qb as x,
  vb as y,
  Ub as z,
} from './chunk-LF4EWAJA.js';

var Ce = (t) => ['/agents', t, 'edit'],
  L = (t) => ['/sessions', t],
  fe = (_t, n) => n.key,
  xe = (_t, n) => n.date,
  I = (_t, n) => n.id,
  be = (_t, n) => n.bundleId;
function ke(t, _n) {
  if ((t & 1 && (o(0, 'span', 10), a(1), i()), t & 2)) {
    const e = c().$implicit;
    r(), _(e.count);
  }
}
function he(t, n) {
  if (t & 1) {
    const e = y();
    o(0, 'button', 9),
      h('click', () => {
        const s = C(e).$implicit,
          d = c(2);
        return f(d.activeTab.set(s.key));
      }),
      a(1),
      m(2, ke, 2, 1, 'span', 10),
      i();
  }
  if (t & 2) {
    const e = n.$implicit,
      l = c(2);
    G('tab--active', l.activeTab() === e.key),
      r(),
      x(' ', e.label, ' '),
      r(),
      g(e.count !== void 0 && e.count > 0 ? 2 : -1);
  }
}
function ye(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 12)(1, 'span', 13), a(2, 'ALGO Balance'), i(), o(3, 'span', 19), a(4), b(5, 'number'), i()()),
    t & 2)
  ) {
    const e = c(3);
    r(4), _(P(5, 1, e.walletBalance() / 1e6, '1.2-6'));
  }
}
function we(t, _n) {
  if ((t & 1 && (o(0, 'dt'), a(1, 'Max Budget'), i(), o(2, 'dd'), a(3), b(4, 'number'), i()), t & 2)) {
    const e = c(2);
    r(3), x('', P(4, 1, e.maxBudgetUsd, '1.2-2'), ' USD');
  }
}
function Se(t, _n) {
  if ((t & 1 && (o(0, 'dt'), a(1, 'Wallet'), i(), o(2, 'dd')(3, 'code'), a(4), i()()), t & 2)) {
    const e = c(2);
    r(4), _(e.walletAddress);
  }
}
function Me(t, _n) {
  if ((t & 1 && (o(0, 'div', 18)(1, 'h3'), a(2, 'System Prompt'), i(), o(3, 'pre', 20), a(4), i()()), t & 2)) {
    const e = c(2);
    r(4), _(e.systemPrompt);
  }
}
function Pe(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 22)(1, 'span', 23),
      a(2),
      i(),
      o(3, 'div', 24),
      E(4, 'div', 25),
      i(),
      o(5, 'span', 26),
      a(6),
      b(7, 'number'),
      i()()),
    t & 2)
  ) {
    const e = n.$implicit;
    u('title', `${e.date}: $${e.cost.toFixed(4)}`),
      r(2),
      _(e.dateShort),
      r(2),
      $('width', e.pct, '%'),
      r(2),
      x('$', P(7, 5, e.cost, '1.2-4'));
  }
}
function Ae(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 18)(1, 'h3'), a(2, 'Cost Analytics'), i(), o(3, 'div', 21), w(4, Pe, 8, 8, 'div', 22, xe), i()()),
    t & 2)
  ) {
    const e = c(3);
    r(4), S(e.costByDay());
  }
}
function Te(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 11)(1, 'div', 12)(2, 'span', 13),
      a(3, 'Total Sessions'),
      i(),
      o(4, 'span', 14),
      a(5),
      i()(),
      o(6, 'div', 12)(7, 'span', 13),
      a(8, 'Running'),
      i(),
      o(9, 'span', 15),
      a(10),
      i()(),
      o(11, 'div', 12)(12, 'span', 13),
      a(13, 'Total Cost'),
      i(),
      o(14, 'span', 16),
      a(15),
      b(16, 'number'),
      i()(),
      o(17, 'div', 12)(18, 'span', 13),
      a(19, 'Work Tasks'),
      i(),
      o(20, 'span', 14),
      a(21),
      i()(),
      m(22, ye, 6, 4, 'div', 12),
      i(),
      o(23, 'div', 17)(24, 'dl')(25, 'dt'),
      a(26, 'Model'),
      i(),
      o(27, 'dd'),
      a(28),
      i(),
      o(29, 'dt'),
      a(30, 'Permission Mode'),
      i(),
      o(31, 'dd'),
      a(32),
      i(),
      m(33, we, 5, 4),
      o(34, 'dt'),
      a(35, 'AlgoChat'),
      i(),
      o(36, 'dd'),
      a(37),
      i(),
      o(38, 'dt'),
      a(39, 'Default Project'),
      i(),
      o(40, 'dd'),
      a(41),
      i(),
      m(42, Se, 5, 1),
      o(43, 'dt'),
      a(44, 'Created'),
      i(),
      o(45, 'dd'),
      a(46),
      b(47, 'relativeTime'),
      i()()(),
      m(48, Me, 5, 1, 'div', 18),
      m(49, Ae, 6, 0, 'div', 18)),
    t & 2)
  ) {
    const e = c(),
      l = c();
    r(5),
      _(l.agentSessions().length),
      r(5),
      _(l.agentRunningSessions().length),
      r(5),
      x('$', P(16, 15, l.totalCost(), '1.2-4')),
      r(6),
      _(l.workTasks().length),
      r(),
      g(e.walletAddress ? 22 : -1),
      r(6),
      _(e.model || 'default'),
      r(4),
      _(e.permissionMode),
      r(),
      g(e.maxBudgetUsd !== null ? 33 : -1),
      r(4),
      B('', e.algochatEnabled ? 'Enabled' : 'Disabled', '', e.algochatAuto ? ' (Auto)' : ''),
      r(4),
      _(l.defaultProjectName() || 'None (global default)'),
      r(),
      g(e.walletAddress ? 42 : -1),
      r(4),
      _(A(47, 18, e.createdAt)),
      r(2),
      g(e.systemPrompt ? 48 : -1),
      r(),
      g(l.agentSessions().length > 0 ? 49 : -1);
  }
}
function Oe(t, _n) {
  t & 1 && (o(0, 'p', 27), a(1, 'No sessions yet.'), i());
}
function Ee(t, n) {
  if (
    (t & 1 &&
      (o(0, 'a', 30)(1, 'span', 31),
      a(2),
      i(),
      o(3, 'span'),
      E(4, 'app-status-badge', 32),
      i(),
      o(5, 'span', 33),
      a(6),
      b(7, 'number'),
      i(),
      o(8, 'span'),
      a(9),
      i(),
      o(10, 'span', 34),
      a(11),
      b(12, 'relativeTime'),
      i()()),
    t & 2)
  ) {
    const e = n.$implicit;
    u('routerLink', D(11, L, e.id)),
      r(2),
      _(e.name || (e.initialPrompt == null ? null : e.initialPrompt.slice(0, 40)) || e.id.slice(0, 8)),
      r(2),
      u('status', e.status),
      r(2),
      x('$', P(7, 6, e.totalCostUsd, '1.2-4')),
      r(3),
      _(e.totalTurns),
      r(2),
      _(A(12, 9, e.updatedAt));
  }
}
function De(t, _n) {
  if (
    (t & 1 &&
      (o(0, 'div', 28)(1, 'div', 29)(2, 'span'),
      a(3, 'Name'),
      i(),
      o(4, 'span'),
      a(5, 'Status'),
      i(),
      o(6, 'span'),
      a(7, 'Cost'),
      i(),
      o(8, 'span'),
      a(9, 'Turns'),
      i(),
      o(10, 'span'),
      a(11, 'Time'),
      i()(),
      w(12, Ee, 13, 13, 'a', 30, I),
      i()),
    t & 2)
  ) {
    const e = c(3);
    r(12), S(e.agentSessions());
  }
}
function Ie(t, _n) {
  if ((t & 1 && m(0, Oe, 2, 0, 'p', 27)(1, De, 14, 0, 'div', 28), t & 2)) {
    const e = c(2);
    g(e.agentSessions().length === 0 ? 0 : 1);
  }
}
function Fe(t, _n) {
  t & 1 && (o(0, 'p', 27), a(1, 'No messages yet.'), i());
}
function Be(t, _n) {
  if ((t & 1 && (o(0, 'span', 46), a(1), b(2, 'number'), i()), t & 2)) {
    const e = c().$implicit;
    r(), x('', P(2, 1, e.paymentMicro / 1e6, '1.3-6'), ' ALGO');
  }
}
function Ne(t, _n) {
  if ((t & 1 && (o(0, 'p', 48), a(1), i()), t & 2)) {
    const e = c().$implicit;
    r(), _(e.response.length > 120 ? `${e.response.slice(0, 120)}...` : e.response);
  }
}
function ze(t, _n) {
  if ((t & 1 && (o(0, 'a', 49), a(1, 'View Session'), i()), t & 2)) {
    const e = c().$implicit;
    u('routerLink', D(1, L, e.sessionId));
  }
}
function Ve(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 42)(1, 'div', 43)(2, 'span', 44),
      a(3),
      i(),
      o(4, 'span', 45),
      a(5),
      i(),
      m(6, Be, 3, 4, 'span', 46),
      i(),
      o(7, 'p', 47),
      a(8),
      i(),
      m(9, Ne, 2, 1, 'p', 48),
      m(10, ze, 2, 3, 'a', 49),
      i()),
    t & 2)
  ) {
    const e = n.$implicit,
      l = c(3),
      s = c();
    r(3),
      B(
        ' ',
        e.fromAgentId === l.id ? 'Sent to' : 'From',
        ' ',
        e.fromAgentId === l.id ? s.getAgentName(e.toAgentId) : s.getAgentName(e.fromAgentId),
        ' ',
      ),
      r(),
      O('data-status', e.status),
      r(),
      _(e.status),
      r(),
      g(e.paymentMicro > 0 ? 6 : -1),
      r(2),
      _(e.content.length > 120 ? `${e.content.slice(0, 120)}...` : e.content),
      r(),
      g(e.response ? 9 : -1),
      r(),
      g(e.sessionId ? 10 : -1);
  }
}
function We(t, _n) {
  if ((t & 1 && (o(0, 'div', 35), w(1, Ve, 11, 8, 'div', 42, I), i()), t & 2)) {
    const e = c(3);
    r(), S(e.messages());
  }
}
function $e(t, n) {
  if ((t & 1 && (o(0, 'option', 39), a(1), i()), t & 2)) {
    const e = n.$implicit;
    u('value', e.id), r(), _(e.name);
  }
}
function Le(t, _n) {
  if (t & 1) {
    const e = y();
    m(0, Fe, 2, 0, 'p', 27)(1, We, 3, 0, 'div', 35),
      o(2, 'div', 36)(3, 'h4'),
      a(4, 'Invoke Another Agent'),
      i(),
      o(5, 'select', 37),
      V('ngModelChange', (s) => {
        C(e);
        const d = c(2);
        return z(d.invokeTargetId, s) || (d.invokeTargetId = s), f(s);
      }),
      o(6, 'option', 38),
      a(7, 'Select target agent...'),
      i(),
      w(8, $e, 2, 2, 'option', 39, I),
      i(),
      o(10, 'textarea', 40),
      V('ngModelChange', (s) => {
        C(e);
        const d = c(2);
        return z(d.invokeContent, s) || (d.invokeContent = s), f(s);
      }),
      i(),
      o(11, 'button', 41),
      h('click', () => {
        C(e);
        const s = c(2);
        return f(s.onInvoke());
      }),
      a(12),
      i()();
  }
  if (t & 2) {
    const e = c(2);
    g(e.messages().length === 0 ? 0 : 1),
      r(5),
      N('ngModel', e.invokeTargetId),
      r(3),
      S(e.otherAgents()),
      r(2),
      N('ngModel', e.invokeContent),
      r(),
      u('disabled', !e.invokeTargetId || !e.invokeContent || e.invoking()),
      r(),
      _(e.invoking() ? 'Sending...' : 'Send Message');
  }
}
function je(t, _n) {
  t & 1 && (o(0, 'p', 27), a(1, 'No work tasks yet.'), i());
}
function Ue(t, _n) {
  if ((t & 1 && (o(0, 'p', 59)(1, 'code'), a(2), i()()), t & 2)) {
    const e = c().$implicit;
    r(2), _(e.branchName);
  }
}
function Re(t, _n) {
  if ((t & 1 && (o(0, 'a', 60), a(1), i()), t & 2)) {
    const e = c().$implicit;
    u('href', e.prUrl, R), r(), _(e.prUrl);
  }
}
function He(t, _n) {
  if ((t & 1 && (o(0, 'p', 61), a(1), i()), t & 2)) {
    const e = c().$implicit;
    r(), _(e.error);
  }
}
function Ge(t, _n) {
  if ((t & 1 && (o(0, 'a', 62), a(1, 'View Session'), i()), t & 2)) {
    const e = c().$implicit;
    u('routerLink', D(1, L, e.sessionId));
  }
}
function qe(t, _n) {
  if (t & 1) {
    const e = y();
    o(0, 'button', 64),
      h('click', () => {
        C(e);
        const s = c().$implicit,
          d = c(4);
        return f(d.onCancelWork(s.id));
      }),
      a(1, 'Cancel'),
      i();
  }
}
function Je(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 53)(1, 'div', 54)(2, 'span', 55),
      a(3),
      i(),
      o(4, 'span', 56),
      a(5),
      i(),
      o(6, 'span', 57),
      a(7),
      b(8, 'relativeTime'),
      i()(),
      o(9, 'p', 58),
      a(10),
      i(),
      m(11, Ue, 3, 1, 'p', 59),
      m(12, Re, 2, 2, 'a', 60),
      m(13, He, 2, 1, 'p', 61),
      m(14, Ge, 2, 3, 'a', 62),
      m(15, qe, 2, 0, 'button', 63),
      i()),
    t & 2)
  ) {
    const e = n.$implicit;
    r(2),
      O('data-status', e.status),
      r(),
      _(e.status),
      r(2),
      _(e.source),
      r(2),
      _(A(8, 10, e.createdAt)),
      r(3),
      _(e.description),
      r(),
      g(e.branchName ? 11 : -1),
      r(),
      g(e.prUrl ? 12 : -1),
      r(),
      g(e.error ? 13 : -1),
      r(),
      g(e.sessionId ? 14 : -1),
      r(),
      g(e.status === 'running' || e.status === 'branching' ? 15 : -1);
  }
}
function Ke(t, _n) {
  if ((t & 1 && (o(0, 'div', 52), w(1, Je, 16, 12, 'div', 53, I), i()), t & 2)) {
    const e = c(3);
    r(), S(e.workTasks());
  }
}
function Qe(t, _n) {
  if (t & 1) {
    const e = y();
    o(0, 'div', 50)(1, 'textarea', 51),
      V('ngModelChange', (s) => {
        C(e);
        const d = c(2);
        return z(d.workDescription, s) || (d.workDescription = s), f(s);
      }),
      i(),
      o(2, 'button', 41),
      h('click', () => {
        C(e);
        const s = c(2);
        return f(s.onCreateWork());
      }),
      a(3),
      i()(),
      m(4, je, 2, 0, 'p', 27)(5, Ke, 3, 0, 'div', 52);
  }
  if (t & 2) {
    const e = c(2);
    r(),
      N('ngModel', e.workDescription),
      r(),
      u('disabled', !e.workDescription || e.creatingWork()),
      r(),
      _(e.creatingWork() ? 'Starting...' : 'Start Work Task'),
      r(),
      g(e.workTasks().length === 0 ? 4 : 5);
  }
}
function Xe(t, _n) {
  if ((t & 1 && (o(0, 'div', 70)(1, 'span', 71), a(2), i(), o(3, 'span', 72), a(4, 'Test Score'), i()()), t & 2)) {
    const e = c(4);
    r(),
      O('data-level', e.lastTestScore() >= 70 ? 'high' : e.lastTestScore() >= 30 ? 'mid' : 'low'),
      r(),
      x('', e.lastTestScore(), '/100');
  }
}
function Ye(t, _n) {
  t & 1 && a(0, ' Testing... ');
}
function Ze(t, _n) {
  t & 1 && a(0, ' Test on Cooldown ');
}
function et(t, _n) {
  t & 1 && a(0, ' Run Test ');
}
function tt(t, _n) {
  if ((t & 1 && (o(0, 'dt'), a(1, 'Last Heartbeat'), i(), o(2, 'dd'), a(3), b(4, 'relativeTime'), i()), t & 2)) {
    const e = c();
    r(3), _(A(4, 1, e.lastHeartbeat));
  }
}
function nt(t, n) {
  if (t & 1) {
    const e = y();
    o(0, 'div', 65)(1, 'div', 67)(2, 'h3'),
      a(3, 'Flock Profile'),
      i(),
      o(4, 'span', 68),
      a(5),
      i()(),
      o(6, 'div', 69)(7, 'div', 70)(8, 'span', 71),
      a(9),
      b(10, 'number'),
      i(),
      o(11, 'span', 72),
      a(12, 'Uptime'),
      i(),
      o(13, 'div', 73),
      E(14, 'div', 74),
      i()(),
      o(15, 'div', 70)(16, 'span', 71),
      a(17),
      i(),
      o(18, 'span', 72),
      a(19, 'Attestations'),
      i()(),
      o(20, 'div', 70)(21, 'span', 71),
      a(22),
      i(),
      o(23, 'span', 72),
      a(24, 'Councils'),
      i()(),
      m(25, Xe, 5, 2, 'div', 70),
      i(),
      o(26, 'div', 75)(27, 'button', 76),
      h('click', () => {
        C(e);
        const s = c(3);
        return f(s.sendHeartbeat());
      }),
      a(28),
      i(),
      o(29, 'button', 76),
      h('click', () => {
        C(e);
        const s = c(3);
        return f(s.runFlockTest());
      }),
      m(30, Ye, 1, 0)(31, Ze, 1, 0)(32, et, 1, 0),
      i()(),
      o(33, 'div', 77)(34, 'dl')(35, 'dt'),
      a(36, 'Address'),
      i(),
      o(37, 'dd')(38, 'code'),
      a(39),
      i()(),
      o(40, 'dt'),
      a(41, 'Status'),
      i(),
      o(42, 'dd'),
      a(43),
      i(),
      o(44, 'dt'),
      a(45, 'Capabilities'),
      i(),
      o(46, 'dd'),
      a(47),
      i(),
      o(48, 'dt'),
      a(49, 'Registered'),
      i(),
      o(50, 'dd'),
      a(51),
      b(52, 'relativeTime'),
      i(),
      m(53, tt, 5, 3),
      i()()();
  }
  if (t & 2) {
    const e = n,
      l = c(3);
    r(4),
      O('data-level', e.reputationScore >= 70 ? 'high' : e.reputationScore >= 30 ? 'mid' : 'low'),
      r(),
      _(e.reputationScore),
      r(4),
      x('', P(10, 18, e.uptimePct, '1.1-1'), '%'),
      r(5),
      $('width', e.uptimePct, '%'),
      r(3),
      _(e.attestationCount),
      r(5),
      _(e.councilParticipations),
      r(3),
      g(l.lastTestScore() !== null ? 25 : -1),
      r(2),
      u('disabled', l.sendingHeartbeat()),
      r(),
      x(' ', l.sendingHeartbeat() ? 'Sending...' : 'Send Heartbeat', ' '),
      r(),
      u('disabled', l.runningTest() || l.isTestOnCooldown()),
      r(),
      g(l.runningTest() ? 30 : l.isTestOnCooldown() ? 31 : 32),
      r(9),
      B('', e.address.slice(0, 12), '...', e.address.slice(-6)),
      r(4),
      _(e.status),
      r(4),
      _(e.capabilities.join(', ') || 'None'),
      r(4),
      _(A(52, 21, e.registeredAt)),
      r(2),
      g(e.lastHeartbeat ? 53 : -1);
  }
}
function it(t, _n) {
  t & 1 && (o(0, 'p', 80), a(1, 'This agent needs a wallet before it can register.'), i());
}
function ot(t, _n) {
  if (t & 1) {
    const e = y();
    o(0, 'div', 66)(1, 'p', 78),
      a(2, 'This agent is not registered in the Flock Directory.'),
      i(),
      o(3, 'p', 79),
      a(4, 'Register to enable discovery, reputation tracking, and cross-agent collaboration.'),
      i(),
      m(5, it, 2, 0, 'p', 80),
      o(6, 'button', 41),
      h('click', () => {
        C(e);
        const s = c(3);
        return f(s.registerInFlock());
      }),
      a(7),
      i()();
  }
  if (t & 2) {
    const e = c(2),
      l = c();
    r(5),
      g(e.walletAddress ? -1 : 5),
      r(),
      u('disabled', l.registeringFlock() || !e.walletAddress),
      r(),
      x(' ', l.registeringFlock() ? 'Registering...' : 'Register in Flock', ' ');
  }
}
function at(t, _n) {
  if ((t & 1 && m(0, nt, 54, 23, 'div', 65)(1, ot, 8, 3, 'div', 66), t & 2)) {
    let e,
      l = c(2);
    g((e = l.flockAgent()) ? 0 : 1, e);
  }
}
function rt(t, _n) {
  if ((t & 1 && (o(0, 'p', 82)(1, 'strong'), a(2, 'Voice:'), i(), a(3), i()), t & 2)) {
    const e = c();
    r(3), x(' ', e.voiceGuidelines);
  }
}
function lt(t, _n) {
  if ((t & 1 && (o(0, 'p', 82)(1, 'strong'), a(2, 'Background:'), i(), a(3), i()), t & 2)) {
    const e = c();
    r(3), x(' ', e.background);
  }
}
function st(t, n) {
  if (
    (t & 1 &&
      (o(0, 'div', 81)(1, 'dl')(2, 'dt'),
      a(3, 'Archetype'),
      i(),
      o(4, 'dd'),
      a(5),
      i(),
      o(6, 'dt'),
      a(7, 'Traits'),
      i(),
      o(8, 'dd'),
      a(9),
      i()(),
      m(10, rt, 4, 1, 'p', 82),
      m(11, lt, 4, 1, 'p', 82),
      i(),
      o(12, 'button', 83),
      a(13, 'Edit Persona'),
      i()),
    t & 2)
  ) {
    const e = n;
    r(5),
      _(e.archetype),
      r(4),
      _(e.traits.join(', ') || 'None'),
      r(),
      g(e.voiceGuidelines ? 10 : -1),
      r(),
      g(e.background ? 11 : -1);
  }
}
function ct(t, _n) {
  t & 1 && (o(0, 'p', 27), a(1, 'No persona configured. '), o(2, 'a', 84), a(3, 'Configure one'), i()());
}
function dt(t, _n) {
  if ((t & 1 && m(0, st, 14, 4)(1, ct, 4, 0, 'p', 27), t & 2)) {
    let e,
      l = c(2);
    g((e = l.persona()) ? 0 : 1, e);
  }
}
function _t(t, n) {
  if ((t & 1 && (o(0, 'option', 39), a(1), i()), t & 2)) {
    const e = n.$implicit;
    u('value', e.id), r(), _(e.name);
  }
}
function mt(t, _n) {
  t & 1 && (o(0, 'p', 27), a(1, 'No skill bundles assigned. '), o(2, 'a', 90), a(3, 'Manage bundles'), i()());
}
function gt(t, n) {
  if (t & 1) {
    const e = y();
    o(0, 'span', 91),
      a(1),
      o(2, 'button', 92),
      h('click', () => {
        const s = C(e).$implicit,
          d = c(4);
        return f(d.unassignBundle(s.bundleId));
      }),
      a(3, '\xD7'),
      i()();
  }
  if (t & 2) {
    const e = n.$implicit,
      l = c(4);
    r(), x(' ', l.getBundleName(e.bundleId), ' ');
  }
}
function pt(t, _n) {
  if ((t & 1 && (o(0, 'div', 89), w(1, gt, 4, 1, 'span', 91, be), i()), t & 2)) {
    const e = c(3);
    r(), S(e.agentBundles());
  }
}
function ut(t, _n) {
  if (t & 1) {
    const e = y();
    o(0, 'div', 85)(1, 'select', 86, 0)(3, 'option', 87),
      a(4, 'Add a skill bundle...'),
      i(),
      w(5, _t, 2, 2, 'option', 39, I),
      i(),
      o(7, 'button', 88),
      h('click', () => {
        C(e);
        const s = W(2);
        return c(2).assignBundle(s.value), f((s.value = ''));
      }),
      a(8, 'Add'),
      i()(),
      m(9, mt, 4, 0, 'p', 27)(10, pt, 3, 0, 'div', 89);
  }
  if (t & 2) {
    const e = W(2),
      l = c(2);
    r(5), S(l.availableBundles()), r(2), u('disabled', !e.value), r(2), g(l.agentBundles().length === 0 ? 9 : 10);
  }
}
function vt(t, n) {
  if (t & 1) {
    const e = y();
    o(0, 'div', 1)(1, 'div', 2)(2, 'div')(3, 'h2'),
      a(4),
      i(),
      o(5, 'p', 3),
      a(6),
      i()(),
      o(7, 'div', 4)(8, 'a', 5),
      a(9, 'Edit'),
      i(),
      o(10, 'button', 6),
      h('click', () => {
        C(e);
        const s = c();
        return f(s.onDelete());
      }),
      a(11, 'Delete'),
      i()()(),
      o(12, 'div', 7),
      w(13, he, 3, 4, 'button', 8, fe),
      i(),
      m(15, Te, 50, 20),
      m(16, Ie, 2, 1),
      m(17, Le, 13, 5),
      m(18, Qe, 6, 4),
      m(19, at, 2, 1),
      m(20, dt, 2, 1),
      m(21, ut, 11, 2),
      i();
  }
  if (t & 2) {
    const e = n,
      l = c();
    r(4),
      _(e.name),
      r(2),
      _(e.description),
      r(2),
      u('routerLink', D(10, Ce, e.id)),
      r(5),
      S(l.tabs),
      r(2),
      g(l.activeTab() === 'overview' ? 15 : -1),
      r(),
      g(l.activeTab() === 'sessions' ? 16 : -1),
      r(),
      g(l.activeTab() === 'messages' ? 17 : -1),
      r(),
      g(l.activeTab() === 'work-tasks' ? 18 : -1),
      r(),
      g(l.activeTab() === 'flock' ? 19 : -1),
      r(),
      g(l.activeTab() === 'persona' ? 20 : -1),
      r(),
      g(l.activeTab() === 'skills' ? 21 : -1);
  }
}
function Ct(t, _n) {
  t & 1 && (o(0, 'div', 1), E(1, 'app-skeleton', 93)(2, 'app-skeleton', 94), i()),
    t & 2 && (r(), u('count', 1), r(), u('count', 4));
}
var ve = class t {
  route = k(J);
  router = k(K);
  agentService = k(Y);
  projectService = k(Z);
  sessionService = k(ne);
  wsService = k(te);
  workTaskService = k(de);
  personaService = k(ge);
  skillBundleService = k(ue);
  notify = k(ee);
  apiService = k(X);
  agent = p(null);
  persona = p(null);
  agentBundles = p([]);
  defaultProjectName = p(null);
  walletBalance = p(0);
  messages = p([]);
  otherAgents = p([]);
  invoking = p(!1);
  workTasks = p([]);
  creatingWork = p(!1);
  flockAgent = p(null);
  registeringFlock = p(!1);
  sendingHeartbeat = p(!1);
  runningTest = p(!1);
  testCooldownUntil = p(null);
  lastTestScore = p(null);
  activeTab = p('overview');
  invokeTargetId = '';
  invokeContent = '';
  workDescription = '';
  agentNameCache = {};
  unsubscribeWs = null;
  agentSessions = T(() => {
    const n = this.agent();
    return n
      ? this.sessionService
          .sessions()
          .filter((e) => e.agentId === n.id)
          .sort((e, l) => new Date(l.updatedAt).getTime() - new Date(e.updatedAt).getTime())
      : [];
  });
  agentRunningSessions = T(() => this.agentSessions().filter((n) => n.status === 'running'));
  totalCost = T(() => this.agentSessions().reduce((n, e) => n + e.totalCostUsd, 0));
  costByDay = T(() => {
    const n = this.agentSessions(),
      e = new Map();
    for (const d of n) {
      const v = d.createdAt.slice(0, 10);
      e.set(v, (e.get(v) ?? 0) + d.totalCostUsd);
    }
    const l = Array.from(e.entries())
        .map(([d, v]) => ({ date: d, cost: v }))
        .sort((d, v) => d.date.localeCompare(v.date))
        .slice(-14),
      s = Math.max(...l.map((d) => d.cost), 0.001);
    return l.map((d) => ({ date: d.date, dateShort: d.date.slice(5), cost: d.cost, pct: (d.cost / s) * 100 }));
  });
  get tabs() {
    return [
      { key: 'overview', label: 'Overview' },
      { key: 'sessions', label: 'Sessions', count: this.agentSessions().length },
      { key: 'messages', label: 'Messages', count: this.messages().length },
      { key: 'work-tasks', label: 'Work Tasks', count: this.workTasks().length },
      { key: 'flock', label: 'Flock' },
      { key: 'persona', label: 'Persona' },
      { key: 'skills', label: 'Skills', count: this.agentBundles().length },
    ];
  }
  async ngOnInit() {
    const n = this.route.snapshot.paramMap.get('id');
    if (!n) return;
    const e = await this.agentService.getAgent(n);
    this.agent.set(e),
      this.sessionService.loadSessions(),
      e.defaultProjectId &&
        this.projectService
          .getProject(e.defaultProjectId)
          .then((l) => this.defaultProjectName.set(l.name))
          .catch(() => this.defaultProjectName.set(null)),
      e.walletAddress &&
        this.agentService
          .getBalance(n)
          .then((l) => this.walletBalance.set(l.balance))
          .catch(() => {}),
      this.loadFlockProfile(e.walletAddress ?? void 0, e.name),
      this.personaService
        .loadPersona(n)
        .then((l) => this.persona.set(l))
        .catch(() => this.persona.set(null)),
      this.skillBundleService
        .getAgentBundles(n)
        .then((l) => this.agentBundles.set(l))
        .catch(() => this.agentBundles.set([])),
      this.skillBundleService.loadBundles().catch(() => {}),
      this.agentService
        .getMessages(n)
        .then((l) => this.messages.set(l))
        .catch(() => this.messages.set([])),
      await this.agentService.loadAgents(),
      this.otherAgents.set(this.agentService.agents().filter((l) => l.id !== n));
    for (const l of this.agentService.agents()) this.agentNameCache[l.id] = l.name;
    this.workTaskService
      .loadTasks(n)
      .then(() => this.workTasks.set(this.workTaskService.tasks()))
      .catch(() => this.workTasks.set([])),
      this.workTaskService.startListening(),
      (this.unsubscribeWs = this.wsService.onMessage((l) => {
        if (
          (l.type === 'agent_balance' && l.agentId === n && this.walletBalance.set(l.balance),
          l.type === 'work_task_update' &&
            l.task.agentId === n &&
            this.workTasks.update((s) => {
              const d = s.findIndex((v) => v.id === l.task.id);
              if (d >= 0) {
                const v = [...s];
                return (v[d] = l.task), v;
              }
              return [l.task, ...s];
            }),
          l.type === 'agent_message_update')
        ) {
          const s = l.message;
          (s.fromAgentId === n || s.toAgentId === n) &&
            this.messages.update((d) => {
              const v = d.findIndex((F) => F.id === s.id);
              if (v >= 0) {
                const F = [...d];
                return (F[v] = s), F;
              }
              return [s, ...d];
            });
        }
      }));
  }
  ngOnDestroy() {
    this.unsubscribeWs?.(), this.workTaskService.stopListening();
  }
  async loadFlockProfile(n, e) {
    try {
      if (n) {
        const d = await M(this.apiService.get(`/flock-directory/lookup/${encodeURIComponent(n)}`)).catch(() => null);
        if (d) {
          this.flockAgent.set(d), this.loadTestInfo(d.id);
          return;
        }
      }
      const s = (
        await M(this.apiService.get(`/flock-directory/search?q=${encodeURIComponent(e)}&limit=5`))
      ).agents.find((d) => d.name.toLowerCase() === e.toLowerCase());
      this.flockAgent.set(s ?? null), s && this.loadTestInfo(s.id);
    } catch {
      this.flockAgent.set(null);
    }
  }
  async loadTestInfo(n) {
    try {
      const [e, l] = await Promise.all([
        M(this.apiService.get(`/flock-directory/testing/agents/${n}/score`)).catch(() => null),
        M(this.apiService.get(`/flock-directory/testing/agents/${n}/cooldown`)).catch(() => null),
      ]);
      e?.rawScore != null && this.lastTestScore.set(e.rawScore),
        l?.onCooldown && l.nextAvailableAt && this.testCooldownUntil.set(l.nextAvailableAt);
    } catch {}
  }
  async registerInFlock() {
    const n = this.agent();
    if (n) {
      if (!n.walletAddress) {
        this.notify.error('Agent needs a wallet before registering in Flock. Create one in the agent settings.');
        return;
      }
      this.registeringFlock.set(!0);
      try {
        const e = await M(
          this.apiService.post('/flock-directory/agents', {
            name: n.name,
            description: n.description,
            address: n.walletAddress,
            capabilities: [],
          }),
        );
        this.flockAgent.set(e), this.notify.info('Agent registered in Flock Directory');
      } catch {
        this.notify.error('Failed to register in Flock Directory');
      } finally {
        this.registeringFlock.set(!1);
      }
    }
  }
  async sendHeartbeat() {
    const n = this.flockAgent();
    if (n) {
      this.sendingHeartbeat.set(!0);
      try {
        await M(this.apiService.post(`/flock-directory/agents/${n.id}/heartbeat`, {})),
          this.flockAgent.set(U(j({}, n), { lastHeartbeat: new Date().toISOString(), status: 'active' })),
          this.notify.info('Heartbeat sent');
      } catch {
        this.notify.error('Failed to send heartbeat');
      } finally {
        this.sendingHeartbeat.set(!1);
      }
    }
  }
  async runFlockTest() {
    const n = this.flockAgent();
    if (n) {
      this.runningTest.set(!0);
      try {
        const e = await M(this.apiService.post(`/flock-directory/testing/agents/${n.id}/run`, {}));
        this.lastTestScore.set(e.result.overallScore),
          this.testCooldownUntil.set(e.nextAvailableAt),
          this.notify.info(`Test complete \u2014 score: ${e.result.overallScore}/100`);
      } catch (e) {
        const l = e;
        l.status === 429 && l.error?.nextAvailableAt
          ? (this.testCooldownUntil.set(l.error.nextAvailableAt),
            this.notify.error(`Test on cooldown \u2014 try again in ${l.error.remainingMin} minutes`))
          : this.notify.error('Failed to run test');
      } finally {
        this.runningTest.set(!1);
      }
    }
  }
  isTestOnCooldown() {
    const n = this.testCooldownUntil();
    return n ? new Date(n).getTime() > Date.now() : !1;
  }
  async onDelete() {
    const n = this.agent();
    n && (await this.agentService.deleteAgent(n.id), this.router.navigate(['/agents']));
  }
  getAgentName(n) {
    return this.agentNameCache[n] ?? n.slice(0, 8);
  }
  getBundleName(n) {
    return this.skillBundleService.bundles().find((e) => e.id === n)?.name ?? n.slice(0, 8);
  }
  availableBundles = T(() => {
    const n = new Set(this.agentBundles().map((e) => e.bundleId));
    return this.skillBundleService.bundles().filter((e) => !n.has(e.id));
  });
  async assignBundle(n) {
    const e = this.agent();
    if (!(!e || !n))
      try {
        const l = await this.skillBundleService.assignToAgent(e.id, n);
        this.agentBundles.update((s) => [...s, l]), this.notify.success('Skill bundle assigned');
      } catch {
        this.notify.error('Failed to assign skill bundle');
      }
  }
  async unassignBundle(n) {
    const e = this.agent();
    if (e)
      try {
        await this.skillBundleService.removeFromAgent(e.id, n),
          this.agentBundles.update((l) => l.filter((s) => s.bundleId !== n)),
          this.notify.success('Skill bundle removed');
      } catch {
        this.notify.error('Failed to remove skill bundle');
      }
  }
  async onCreateWork() {
    const n = this.agent();
    if (!(!n || !this.workDescription)) {
      this.creatingWork.set(!0);
      try {
        const e = await this.workTaskService.createTask({
          agentId: n.id,
          description: this.workDescription,
          projectId: n.defaultProjectId ?? void 0,
        });
        this.workTasks.update((l) => [e, ...l]), (this.workDescription = '');
      } catch {
        this.notify.error('Failed to create work task');
      } finally {
        this.creatingWork.set(!1);
      }
    }
  }
  async onCancelWork(n) {
    try {
      const e = await this.workTaskService.cancelTask(n);
      this.workTasks.update((l) => l.map((s) => (s.id === n ? e : s)));
    } catch {
      this.notify.error('Failed to cancel work task');
    }
  }
  async onInvoke() {
    const n = this.agent();
    if (!(!n || !this.invokeTargetId || !this.invokeContent)) {
      this.invoking.set(!0);
      try {
        await this.agentService.invokeAgent(n.id, this.invokeTargetId, this.invokeContent), (this.invokeContent = '');
        const e = await this.agentService.getMessages(n.id);
        this.messages.set(e);
      } catch {
        this.notify.error('Failed to invoke agent');
      } finally {
        this.invoking.set(!1);
      }
    }
  }
  static \u0275fac = (e) => new (e || t)();
  static \u0275cmp = H({
    type: t,
    selectors: [['app-agent-detail']],
    decls: 2,
    vars: 1,
    consts: [
      ['bundleSelect', ''],
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page__desc'],
      [1, 'page__actions'],
      [1, 'btn', 'btn--secondary', 3, 'routerLink'],
      [1, 'btn', 'btn--danger', 3, 'click'],
      [1, 'tabs'],
      [1, 'tab', 3, 'tab--active'],
      [1, 'tab', 3, 'click'],
      [1, 'tab__count'],
      [1, 'stats-row'],
      [1, 'stat-card'],
      [1, 'stat-card__label'],
      [1, 'stat-card__value'],
      [1, 'stat-card__value', 'stat-card__value--active'],
      [1, 'stat-card__value', 'stat-card__value--cost'],
      [1, 'detail__info'],
      [1, 'detail__section'],
      [1, 'stat-card__value', 'stat-card__value--algo'],
      [1, 'detail__code'],
      [1, 'cost-bars'],
      [1, 'cost-bar-row', 3, 'title'],
      [1, 'cost-bar-row__label'],
      [1, 'cost-bar-row__bar-wrap'],
      [1, 'cost-bar-row__bar'],
      [1, 'cost-bar-row__value'],
      [1, 'detail__empty'],
      [1, 'session-table'],
      [1, 'session-table__header'],
      [1, 'session-table__row', 3, 'routerLink'],
      [1, 'session-table__name'],
      [3, 'status'],
      [1, 'session-table__cost'],
      [1, 'session-table__time'],
      [1, 'messages-list'],
      [1, 'invoke-form'],
      ['aria-label', 'Select target agent', 1, 'invoke-select', 3, 'ngModelChange', 'ngModel'],
      ['value', '', 'disabled', ''],
      [3, 'value'],
      ['placeholder', 'Message content...', 'rows', '3', 1, 'invoke-textarea', 3, 'ngModelChange', 'ngModel'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'message-row'],
      [1, 'message-row__header'],
      [1, 'message-row__direction'],
      [1, 'message-row__status'],
      [1, 'message-row__payment'],
      [1, 'message-row__content'],
      [1, 'message-row__response'],
      [1, 'message-row__session', 3, 'routerLink'],
      [1, 'work-form'],
      [
        'placeholder',
        "Describe the task (e.g. 'Fix the login button alignment')...",
        'rows',
        '3',
        1,
        'invoke-textarea',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [1, 'work-tasks-list'],
      [1, 'work-task-row'],
      [1, 'work-task-row__header'],
      [1, 'work-task-row__status'],
      [1, 'work-task-row__source'],
      [1, 'work-task-row__time'],
      [1, 'work-task-row__desc'],
      [1, 'work-task-row__branch'],
      ['target', '_blank', 'rel', 'noopener', 1, 'work-task-row__pr', 3, 'href'],
      [1, 'work-task-row__error'],
      [1, 'work-task-row__session', 3, 'routerLink'],
      [1, 'btn', 'btn--danger', 'btn--sm'],
      [1, 'btn', 'btn--danger', 'btn--sm', 3, 'click'],
      [1, 'flock-profile'],
      [1, 'flock-register'],
      [1, 'flock-profile__header'],
      [1, 'flock-profile__score'],
      [1, 'flock-profile__metrics'],
      [1, 'flock-metric'],
      [1, 'flock-metric__value'],
      [1, 'flock-metric__label'],
      [1, 'flock-metric__bar'],
      [1, 'flock-metric__fill'],
      [1, 'flock-profile__actions'],
      [1, 'btn', 'btn--secondary', 'btn--sm', 3, 'click', 'disabled'],
      [1, 'flock-profile__info'],
      [1, 'flock-register__text'],
      [1, 'flock-register__hint'],
      [1, 'flock-register__hint', 2, 'color', 'var(--color-warning)'],
      [1, 'persona-info'],
      [1, 'persona-info__text'],
      ['routerLink', '/agents/personas', 1, 'btn', 'btn--secondary', 'btn--sm'],
      ['routerLink', '/agents/personas'],
      [1, 'skills-assign'],
      [1, 'skills-assign__select'],
      ['value', ''],
      [1, 'skills-assign__btn', 3, 'click', 'disabled'],
      [1, 'skills-list'],
      ['routerLink', '/agents/skill-bundles'],
      [1, 'skill-tag'],
      ['title', 'Remove', 1, 'skill-tag__remove', 3, 'click'],
      ['variant', 'card', 3, 'count'],
      ['variant', 'table', 3, 'count'],
    ],
    template: (e, l) => {
      if ((e & 1 && m(0, vt, 22, 12, 'div', 1)(1, Ct, 3, 2, 'div', 1), e & 2)) {
        let s;
        g((s = l.agent()) ? 0 : 1, s);
      }
    },
    dependencies: [Q, ce, le, se, ie, re, oe, ae, pe, me, _e, q],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__desc[_ngcontent-%COMP%]{margin:.25rem 0 0;color:var(--text-secondary)}.page__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem}.tabs[_ngcontent-%COMP%]{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:1.5rem;overflow-x:auto}.tab[_ngcontent-%COMP%]{padding:.5rem 1rem;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;transition:all .15s;white-space:nowrap;display:flex;align-items:center;gap:.35rem}.tab[_ngcontent-%COMP%]:hover{color:var(--text-primary)}.tab--active[_ngcontent-%COMP%]{color:var(--accent-cyan);border-bottom-color:var(--accent-cyan)}.tab__count[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 5px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-tertiary);border:1px solid var(--border)}.tab--active[_ngcontent-%COMP%]   .tab__count[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.stats-row[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem}.stat-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.75rem;display:flex;flex-direction:column;gap:.2rem}.stat-card__label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em}.stat-card__value[_ngcontent-%COMP%]{font-size:1.3rem;font-weight:700;color:var(--accent-cyan)}.stat-card__value--active[_ngcontent-%COMP%]{color:var(--accent-amber, #ffc107)}.stat-card__value--cost[_ngcontent-%COMP%]{color:var(--accent-green)}.stat-card__value--algo[_ngcontent-%COMP%]{color:var(--accent-magenta)}.session-table[_ngcontent-%COMP%]{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.session-table__header[_ngcontent-%COMP%]{display:grid;grid-template-columns:2fr 1fr 1fr .5fr 1fr;padding:.5rem 1rem;background:var(--bg-raised);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)}.session-table__row[_ngcontent-%COMP%]{display:grid;grid-template-columns:2fr 1fr 1fr .5fr 1fr;padding:.5rem 1rem;border-top:1px solid var(--border);font-size:.8rem;color:var(--text-primary);text-decoration:none;transition:background .1s;align-items:center}.session-table__row[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.session-table__name[_ngcontent-%COMP%]{font-weight:600;color:var(--accent-cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.session-table__cost[_ngcontent-%COMP%]{color:var(--accent-green)}.session-table__time[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary)}.cost-bars[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:3px}.cost-bar-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.cost-bar-row__label[_ngcontent-%COMP%]{width:48px;flex-shrink:0;font-size:.6rem;color:var(--text-tertiary);text-align:right}.cost-bar-row__bar-wrap[_ngcontent-%COMP%]{flex:1;height:14px;background:var(--bg-raised);border-radius:2px;overflow:hidden}.cost-bar-row__bar[_ngcontent-%COMP%]{height:100%;background:linear-gradient(90deg,var(--accent-cyan-dim),var(--accent-cyan));border-radius:2px;min-width:1px;transition:width .3s}.cost-bar-row__value[_ngcontent-%COMP%]{width:64px;flex-shrink:0;font-size:.6rem;color:var(--accent-green);text-align:right}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;text-decoration:none;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--text-primary)}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red);border-color:var(--accent-red)}.btn--danger[_ngcontent-%COMP%]:hover{background:var(--accent-red-dim)}.btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--sm[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem;margin-top:.5rem}.detail__info[_ngcontent-%COMP%]   dl[_ngcontent-%COMP%]{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem}.detail__info[_ngcontent-%COMP%]   dt[_ngcontent-%COMP%]{font-weight:600;color:var(--text-secondary);font-size:.8rem;text-transform:uppercase;letter-spacing:.03em}.detail__info[_ngcontent-%COMP%]   dd[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.detail__section[_ngcontent-%COMP%]{margin-top:1.5rem}.detail__section[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary)}.detail__code[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;font-size:.8rem;white-space:pre-wrap;overflow-x:auto;color:var(--accent-green)}.detail__empty[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem}.detail__empty[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]{color:var(--accent-cyan);text-decoration:none}.detail__empty[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]:hover{text-decoration:underline}.messages-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1.5rem}.message-row[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem}.message-row__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem}.message-row__direction[_ngcontent-%COMP%]{color:var(--text-secondary);font-weight:600;font-size:.75rem;text-transform:uppercase}.message-row__status[_ngcontent-%COMP%]{font-size:.7rem;padding:1px 6px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}.message-row__status[data-status=completed][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.message-row__status[data-status=processing][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.message-row__status[data-status=failed][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.message-row__payment[_ngcontent-%COMP%]{font-size:.75rem;color:var(--accent-green);font-weight:600}.message-row__content[_ngcontent-%COMP%]{margin:.25rem 0;color:var(--text-primary);font-size:.85rem}.message-row__response[_ngcontent-%COMP%]{margin:.25rem 0;color:var(--accent-cyan);font-style:italic;font-size:.85rem}.message-row__session[_ngcontent-%COMP%]{font-size:.75rem;color:var(--accent-cyan);text-decoration:none}.invoke-form[_ngcontent-%COMP%]{margin-top:1.5rem;display:flex;flex-direction:column;gap:.5rem;max-width:500px}.invoke-form[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.invoke-select[_ngcontent-%COMP%], .invoke-textarea[_ngcontent-%COMP%]{padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary)}.invoke-select[_ngcontent-%COMP%]:focus, .invoke-textarea[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.invoke-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:5em;line-height:1.5}.work-form[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;max-width:500px;margin-bottom:1rem}.work-tasks-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem}.work-task-row[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem}.work-task-row__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem}.work-task-row__status[_ngcontent-%COMP%]{font-size:.7rem;padding:1px 6px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}.work-task-row__status[data-status=completed][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.work-task-row__status[data-status=running][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.work-task-row__status[data-status=failed][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.work-task-row__source[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);text-transform:uppercase}.work-task-row__time[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);margin-left:auto}.work-task-row__desc[_ngcontent-%COMP%]{margin:.25rem 0;color:var(--text-primary);font-size:.85rem}.work-task-row__branch[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{color:var(--accent-cyan);font-size:.75rem}.work-task-row__pr[_ngcontent-%COMP%]{display:block;font-size:.75rem;color:var(--accent-green);text-decoration:none;word-break:break-all}.work-task-row__error[_ngcontent-%COMP%]{margin:.25rem 0;font-size:.8rem;color:var(--accent-red)}.work-task-row__session[_ngcontent-%COMP%]{font-size:.75rem;color:var(--accent-cyan);text-decoration:none}.persona-info[_ngcontent-%COMP%]   dl[_ngcontent-%COMP%]{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin-bottom:.5rem}.persona-info[_ngcontent-%COMP%]   dt[_ngcontent-%COMP%]{font-weight:600;color:var(--text-secondary);font-size:.8rem;text-transform:uppercase}.persona-info[_ngcontent-%COMP%]   dd[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.persona-info__text[_ngcontent-%COMP%]{font-size:.85rem;color:var(--text-secondary);margin:.25rem 0}.skills-assign[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1rem}.skills-assign__select[_ngcontent-%COMP%]{flex:1;padding:.4rem .5rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-primary);border-radius:var(--radius-sm);font-size:.8rem}.skills-assign__btn[_ngcontent-%COMP%]{padding:.4rem 1rem;background:var(--accent-cyan);color:var(--bg-primary);border:none;border-radius:var(--radius-sm);font-size:.8rem;cursor:pointer}.skills-assign__btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:default}.skills-list[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.5rem}.skill-tag[_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:.35rem;font-size:.75rem;padding:3px 10px;border-radius:var(--radius-sm);background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan)}.skill-tag__remove[_ngcontent-%COMP%]{background:none;border:none;color:var(--accent-cyan);cursor:pointer;font-size:1rem;line-height:1;padding:0;opacity:.6}.skill-tag__remove[_ngcontent-%COMP%]:hover{opacity:1}.flock-profile[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:1.25rem}.flock-profile__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center}.flock-profile__header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.flock-profile__score[_ngcontent-%COMP%]{font-size:1.5rem;font-weight:700;font-family:var(--font-mono, monospace);padding:2px 10px;border-radius:var(--radius-sm);border:1px solid}.flock-profile__score[data-level=high][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.flock-profile__score[data-level=mid][_ngcontent-%COMP%]{color:var(--accent-amber, #ffc107);border-color:var(--accent-amber, #ffc107)}.flock-profile__score[data-level=low][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.flock-profile__metrics[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.75rem}.flock-metric[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.75rem;display:flex;flex-direction:column;gap:.2rem}.flock-metric__value[_ngcontent-%COMP%]{font-size:1.3rem;font-weight:700;color:var(--accent-cyan)}.flock-metric__value[data-level=high][_ngcontent-%COMP%]{color:var(--accent-cyan)}.flock-metric__value[data-level=mid][_ngcontent-%COMP%]{color:var(--accent-amber, #ffc107)}.flock-metric__value[data-level=low][_ngcontent-%COMP%]{color:var(--accent-red)}.flock-metric__label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em}.flock-metric__bar[_ngcontent-%COMP%]{height:4px;background:var(--bg-raised);border-radius:2px;overflow:hidden;margin-top:.25rem}.flock-metric__fill[_ngcontent-%COMP%]{height:100%;background:linear-gradient(90deg,var(--accent-cyan-dim),var(--accent-cyan));border-radius:2px;min-width:1px;transition:width .3s}.flock-profile__info[_ngcontent-%COMP%]   dl[_ngcontent-%COMP%]{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem}.flock-profile__info[_ngcontent-%COMP%]   dt[_ngcontent-%COMP%]{font-weight:600;color:var(--text-secondary);font-size:.8rem;text-transform:uppercase;letter-spacing:.03em}.flock-profile__info[_ngcontent-%COMP%]   dd[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.flock-profile__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;flex-wrap:wrap}.flock-register[_ngcontent-%COMP%]{text-align:center;padding:2rem 1rem}.flock-register__text[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem;font-weight:600;margin:0 0 .35rem}.flock-register__hint[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.75rem;margin:0 0 1rem;line-height:1.5}code[_ngcontent-%COMP%]{background:var(--bg-raised);color:var(--accent-magenta);padding:2px 6px;border-radius:var(--radius-sm);font-size:.8rem;border:1px solid var(--border)}@media(max-width:767px){.stats-row[_ngcontent-%COMP%]{grid-template-columns:repeat(2,1fr)}.session-table__header[_ngcontent-%COMP%], .session-table__row[_ngcontent-%COMP%]{grid-template-columns:2fr 1fr 1fr}.session-table__header[_ngcontent-%COMP%]   span[_ngcontent-%COMP%]:nth-child(n+4), .session-table__row[_ngcontent-%COMP%]   span[_ngcontent-%COMP%]:nth-child(n+4){display:none}.tabs[_ngcontent-%COMP%]{gap:0}.tab[_ngcontent-%COMP%]{padding:.4rem .6rem;font-size:.7rem}}',
    ],
    changeDetection: 0,
  });
};

export { ve as AgentDetailComponent };
