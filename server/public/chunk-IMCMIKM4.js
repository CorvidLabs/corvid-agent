import { a as Q } from './chunk-2EJE5M6O.js';
import { a as ue } from './chunk-4NPB6SSM.js';
import { a as ee } from './chunk-355WLUEG.js';
import { k as B, r as G, m as H, l as j, d as R, a as ve, b as W, f as z } from './chunk-AF4UDQOX.js';
import { a as Z } from './chunk-CSQXEU3M.js';
import { a as X } from './chunk-CZZRTCER.js';
import { a as K } from './chunk-FGNIWOFY.js';
import { a as J } from './chunk-ZSTU6MUH.js';
import './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as fe } from './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  zb as _,
  $b as A,
  ob as b,
  ib as C,
  a as Ce,
  Na as c,
  ac as D,
  Bb as d,
  Nb as de,
  T as E,
  O as F,
  jb as f,
  Pb as g,
  Vb as h,
  Zb as I,
  qb as i,
  q as k,
  _a as L,
  Ob as l,
  vb as M,
  Y as m,
  Wb as me,
  fc as N,
  pb as n,
  rb as O,
  Mb as P,
  Z as p,
  Rb as q,
  mb as S,
  lb as T,
  pa as U,
  Tb as u,
  hb as V,
  ja as v,
  nb as w,
  Ub as x,
  Qb as y,
} from './chunk-LF4EWAJA.js';

var te = class o extends J {
  apiPath = '/mcp-servers';
  servers = this.entities;
  async loadServers(t) {
    this.loading.set(!0);
    try {
      const e = t ? `/mcp-servers?agentId=${t}` : '/mcp-servers',
        a = await k(this.api.get(e));
      this.entities.set(a);
    } finally {
      this.loading.set(!1);
    }
  }
  async createServer(t) {
    return this.create(t);
  }
  async updateServer(t, e) {
    return this.update(t, e);
  }
  async deleteServer(t) {
    return this.remove(t);
  }
  async testConnection(t) {
    return k(this.api.post(`/mcp-servers/${t}/test`));
  }
  static \u0275fac = (() => {
    let t;
    return (a) => (t || (t = U(o)))(a || o);
  })();
  static \u0275prov = F({ token: o, factory: o.\u0275fac, providedIn: 'root' });
};
var _e = (_o, t) => t.id,
  ye = (_o, t) => t.name;
function Me(o, t) {
  if ((o & 1 && (n(0, 'option', 17), l(1), i()), o & 2)) {
    const e = t.$implicit;
    b('value', e.id), c(), g(e.name);
  }
}
function Se(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 3)(1, 'h3'),
      l(2, 'Add MCP Server'),
      i(),
      n(3, 'div', 7)(4, 'div', 8)(5, 'label'),
      l(6, 'Name'),
      i(),
      n(7, 'input', 9),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formName, r) || (s.formName = r), p(r);
      }),
      i()(),
      n(8, 'div', 8)(9, 'label'),
      l(10, 'Command'),
      i(),
      n(11, 'input', 10),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formCommand, r) || (s.formCommand = r), p(r);
      }),
      i()(),
      n(12, 'div', 11)(13, 'label'),
      l(14, 'Arguments (one per line)'),
      i(),
      n(15, 'textarea', 12),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formArgs, r) || (s.formArgs = r), p(r);
      }),
      i()(),
      n(16, 'div', 11)(17, 'label'),
      l(18, 'Environment Variables (KEY=VALUE, one per line)'),
      i(),
      n(19, 'textarea', 13),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formEnvVars, r) || (s.formEnvVars = r), p(r);
      }),
      i()(),
      n(20, 'div', 8)(21, 'label'),
      l(22, 'Working Directory'),
      i(),
      n(23, 'input', 14),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formCwd, r) || (s.formCwd = r), p(r);
      }),
      i()(),
      n(24, 'div', 8)(25, 'label'),
      l(26, 'Agent (optional, empty = global)'),
      i(),
      n(27, 'select', 15),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formAgentId, r) || (s.formAgentId = r), p(r);
      }),
      n(28, 'option', 16),
      l(29, 'Global (all agents)'),
      i(),
      S(30, Me, 2, 2, 'option', 17, _e),
      i()(),
      n(32, 'div', 8)(33, 'label'),
      l(34, 'Enabled'),
      i(),
      n(35, 'label', 18)(36, 'input', 19),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formEnabled, r) || (s.formEnabled = r), p(r);
      }),
      i(),
      n(37, 'span'),
      l(38),
      i()()()(),
      n(39, 'div', 20)(40, 'button', 21),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.onCreate());
      }),
      l(41),
      i()()();
  }
  if (o & 2) {
    const e = d();
    c(7),
      u('ngModel', e.formName),
      c(4),
      u('ngModel', e.formCommand),
      c(4),
      u('ngModel', e.formArgs),
      c(4),
      u('ngModel', e.formEnvVars),
      c(4),
      u('ngModel', e.formCwd),
      c(4),
      u('ngModel', e.formAgentId),
      c(3),
      w(e.agentService.agents()),
      c(6),
      u('ngModel', e.formEnabled),
      c(2),
      g(e.formEnabled ? 'Yes' : 'No'),
      c(2),
      b('disabled', e.creating() || !e.formName || !e.formCommand),
      c(),
      y(' ', e.creating() ? 'Creating...' : 'Create Server', ' ');
  }
}
function we(o, _t) {
  o & 1 && (n(0, 'span', 29), l(1, 'Installed'), i());
}
function Pe(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'input', 35),
      _('input', (r) => {
        const s = m(e).$implicit,
          se = d(3).$implicit,
          $ = d(3);
        return p($.setOfficialEnv(se.name, s, r.target.value));
      }),
      i();
  }
  if (o & 2) {
    const e = t.$implicit;
    b('placeholder', e);
  }
}
function ke(o, _t) {
  if ((o & 1 && (n(0, 'div', 32), S(1, Pe, 1, 1, 'input', 34, T), i()), o & 2)) {
    const e = d(2).$implicit;
    c(), w(e.envHints);
  }
}
function Ee(o, _t) {
  if (o & 1) {
    const e = M();
    C(0, ke, 3, 0, 'div', 32),
      n(1, 'button', 33),
      _('click', () => {
        m(e);
        const r = d().$implicit,
          s = d(3);
        return p(s.onInstallOfficial(r));
      }),
      l(2),
      i();
  }
  if (o & 2) {
    const e = d().$implicit,
      a = d(3);
    f(e.envHints.length > 0 ? 0 : -1),
      c(),
      b('disabled', a.installingOfficial() === e.name),
      c(),
      y(' ', a.installingOfficial() === e.name ? 'Installing...' : 'Install', ' ');
  }
}
function Oe(o, t) {
  if (
    (o & 1 &&
      (n(0, 'div', 26)(1, 'div', 27)(2, 'span', 28),
      l(3),
      i(),
      C(4, we, 2, 0, 'span', 29),
      i(),
      n(5, 'p', 30),
      l(6),
      i(),
      n(7, 'code', 31),
      l(8),
      i(),
      C(9, Ee, 3, 3),
      i()),
    o & 2)
  ) {
    const e = t.$implicit,
      a = d(3);
    P('official-card--installed', a.isInstalled(e.name)),
      c(3),
      g(e.name),
      c(),
      f(a.isInstalled(e.name) ? 4 : -1),
      c(2),
      g(e.description),
      c(2),
      q('', e.command, ' ', e.args.join(' ')),
      c(),
      f(a.isInstalled(e.name) ? -1 : 9);
  }
}
function Le(o, _t) {
  if ((o & 1 && (n(0, 'div', 24), S(1, Oe, 10, 8, 'div', 25, ye), i()), o & 2)) {
    const e = d(2);
    c(), w(e.officialServers);
  }
}
function Ve(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 4)(1, 'div', 22),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.showOfficialDefaults.set(!r.showOfficialDefaults()));
      }),
      n(2, 'h3'),
      l(3, 'Official MCP Servers'),
      i(),
      n(4, 'span', 23),
      l(5),
      i()(),
      C(6, Le, 3, 0, 'div', 24),
      i();
  }
  if (o & 2) {
    const e = d();
    c(5), g(e.showOfficialDefaults() ? 'Hide' : 'Show'), c(), f(e.showOfficialDefaults() ? 6 : -1);
  }
}
function Te(o, _t) {
  o & 1 && O(0, 'app-skeleton', 5), o & 2 && b('count', 4);
}
function Ie(o, _t) {
  o & 1 && O(0, 'app-empty-state', 6);
}
function Ne(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 7)(1, 'div', 8)(2, 'label'),
      l(3, 'Name'),
      i(),
      n(4, 'input', 46),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editName, r) || (s.editName = r), p(r);
      }),
      i()(),
      n(5, 'div', 8)(6, 'label'),
      l(7, 'Command'),
      i(),
      n(8, 'input', 47),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editCommand, r) || (s.editCommand = r), p(r);
      }),
      i()(),
      n(9, 'div', 11)(10, 'label'),
      l(11, 'Arguments (one per line)'),
      i(),
      n(12, 'textarea', 48),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editArgs, r) || (s.editArgs = r), p(r);
      }),
      i()(),
      n(13, 'div', 11)(14, 'label'),
      l(15, 'Env Vars (KEY=VALUE per line)'),
      i(),
      n(16, 'textarea', 48),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editEnvVars, r) || (s.editEnvVars = r), p(r);
      }),
      i()(),
      n(17, 'div', 8)(18, 'label'),
      l(19, 'Working Directory'),
      i(),
      n(20, 'input', 47),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editCwd, r) || (s.editCwd = r), p(r);
      }),
      i()(),
      n(21, 'div', 8)(22, 'label'),
      l(23, 'Enabled'),
      i(),
      n(24, 'label', 18)(25, 'input', 19),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editEnabled, r) || (s.editEnabled = r), p(r);
      }),
      i(),
      n(26, 'span'),
      l(27),
      i()()()(),
      n(28, 'div', 20)(29, 'button', 49),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onSaveEdit(r.id));
      }),
      l(30, 'Save'),
      i(),
      n(31, 'button', 50),
      _('click', () => {
        m(e);
        const r = d(5);
        return p(r.editingId.set(null));
      }),
      l(32, 'Cancel'),
      i()();
  }
  if (o & 2) {
    const e = d(5);
    c(4),
      u('ngModel', e.editName),
      c(4),
      u('ngModel', e.editCommand),
      c(4),
      u('ngModel', e.editArgs),
      c(4),
      u('ngModel', e.editEnvVars),
      c(4),
      u('ngModel', e.editCwd),
      c(5),
      u('ngModel', e.editEnabled),
      c(2),
      g(e.editEnabled ? 'Yes' : 'No');
  }
}
function Fe(o, _t) {
  if ((o & 1 && (n(0, 'dt'), l(1, 'CWD'), i(), n(2, 'dd')(3, 'code'), l(4), i()()), o & 2)) {
    const e = d(3).$implicit;
    c(4), g(e.cwd);
  }
}
function Ae(o, _t) {
  if ((o & 1 && (n(0, 'dt'), l(1, 'Env Vars'), i(), n(2, 'dd'), l(3), i()), o & 2)) {
    const e = d(3).$implicit,
      a = d(3);
    c(3), y('', a.Object.keys(e.envVars).length, ' configured');
  }
}
function De(o, _t) {
  if ((o & 1 && (n(0, 'div', 52), l(1), i()), o & 2)) {
    const e = d(6);
    V('data-success', e.testResult().success), c(), y(' ', e.testResult().message, ' ');
  }
}
function We(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'dl', 51)(1, 'dt'),
      l(2, 'Command'),
      i(),
      n(3, 'dd')(4, 'code'),
      l(5),
      i()(),
      C(6, Fe, 5, 1),
      n(7, 'dt'),
      l(8, 'Agent'),
      i(),
      n(9, 'dd'),
      l(10),
      i(),
      C(11, Ae, 4, 1),
      i(),
      C(12, De, 2, 2, 'div', 52),
      n(13, 'div', 20)(14, 'button', 50),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.startEdit(r));
      }),
      l(15, 'Edit'),
      i(),
      n(16, 'button', 53),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onTest(r.id));
      }),
      l(17),
      i(),
      n(18, 'button', 54),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onDelete(r.id));
      }),
      l(19, 'Delete'),
      i()();
  }
  if (o & 2) {
    const e = d(2).$implicit,
      a = d(3);
    c(5),
      q('', e.command, ' ', e.args.join(' ')),
      c(),
      f(e.cwd ? 6 : -1),
      c(4),
      g(e.agentId ? a.getAgentName(e.agentId) : 'Global'),
      c(),
      f(a.Object.keys(e.envVars).length > 0 ? 11 : -1),
      c(),
      f(a.testResult() ? 12 : -1),
      c(4),
      b('disabled', a.testing()),
      c(),
      y(' ', a.testing() ? 'Testing...' : 'Test Connection', ' ');
  }
}
function Re(o, _t) {
  if ((o & 1 && (n(0, 'div', 45), C(1, Ne, 33, 7)(2, We, 20, 8), i()), o & 2)) {
    const e = d().$implicit,
      a = d(3);
    c(), f(a.editingId() === e.id ? 1 : 2);
  }
}
function ze(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 39)(1, 'div', 40),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(3);
        return p(s.toggleExpand(r.id));
      }),
      n(2, 'div', 41)(3, 'span', 42),
      l(4),
      i(),
      n(5, 'span', 43),
      l(6),
      i()(),
      n(7, 'span', 44),
      l(8),
      i()(),
      C(9, Re, 3, 1, 'div', 45),
      i();
  }
  if (o & 2) {
    const e = t.$implicit,
      a = d(3);
    P('server-card--expanded', a.expandedId() === e.id),
      c(4),
      g(e.name),
      c(),
      V('data-enabled', e.enabled),
      c(),
      y(' ', e.enabled ? 'Enabled' : 'Disabled', ' '),
      c(2),
      g(e.command),
      c(),
      f(a.expandedId() === e.id ? 9 : -1);
  }
}
function Be(o, _t) {
  if (
    (o & 1 &&
      (n(0, 'div', 4)(1, 'h3', 36),
      l(2, 'Global Servers'),
      i(),
      n(3, 'div', 37),
      S(4, ze, 10, 7, 'div', 38, _e),
      i()()),
    o & 2)
  ) {
    const e = d(2);
    c(4), w(e.globalServers());
  }
}
function je(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 7)(1, 'div', 8)(2, 'label'),
      l(3, 'Name'),
      i(),
      n(4, 'input', 46),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editName, r) || (s.editName = r), p(r);
      }),
      i()(),
      n(5, 'div', 8)(6, 'label'),
      l(7, 'Command'),
      i(),
      n(8, 'input', 47),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editCommand, r) || (s.editCommand = r), p(r);
      }),
      i()(),
      n(9, 'div', 11)(10, 'label'),
      l(11, 'Arguments (one per line)'),
      i(),
      n(12, 'textarea', 48),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editArgs, r) || (s.editArgs = r), p(r);
      }),
      i()(),
      n(13, 'div', 11)(14, 'label'),
      l(15, 'Env Vars (KEY=VALUE per line)'),
      i(),
      n(16, 'textarea', 48),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editEnvVars, r) || (s.editEnvVars = r), p(r);
      }),
      i()(),
      n(17, 'div', 8)(18, 'label'),
      l(19, 'Working Directory'),
      i(),
      n(20, 'input', 47),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editCwd, r) || (s.editCwd = r), p(r);
      }),
      i()(),
      n(21, 'div', 8)(22, 'label'),
      l(23, 'Enabled'),
      i(),
      n(24, 'label', 18)(25, 'input', 19),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(5);
        return x(s.editEnabled, r) || (s.editEnabled = r), p(r);
      }),
      i(),
      n(26, 'span'),
      l(27),
      i()()()(),
      n(28, 'div', 20)(29, 'button', 49),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onSaveEdit(r.id));
      }),
      l(30, 'Save'),
      i(),
      n(31, 'button', 50),
      _('click', () => {
        m(e);
        const r = d(5);
        return p(r.editingId.set(null));
      }),
      l(32, 'Cancel'),
      i()();
  }
  if (o & 2) {
    const e = d(5);
    c(4),
      u('ngModel', e.editName),
      c(4),
      u('ngModel', e.editCommand),
      c(4),
      u('ngModel', e.editArgs),
      c(4),
      u('ngModel', e.editEnvVars),
      c(4),
      u('ngModel', e.editCwd),
      c(5),
      u('ngModel', e.editEnabled),
      c(2),
      g(e.editEnabled ? 'Yes' : 'No');
  }
}
function He(o, _t) {
  if ((o & 1 && (n(0, 'dt'), l(1, 'CWD'), i(), n(2, 'dd')(3, 'code'), l(4), i()()), o & 2)) {
    const e = d(3).$implicit;
    c(4), g(e.cwd);
  }
}
function Ge(o, _t) {
  if ((o & 1 && (n(0, 'dt'), l(1, 'Env Vars'), i(), n(2, 'dd'), l(3), i()), o & 2)) {
    const e = d(3).$implicit,
      a = d(3);
    c(3), y('', a.Object.keys(e.envVars).length, ' configured');
  }
}
function Ke(o, _t) {
  if ((o & 1 && (n(0, 'div', 52), l(1), i()), o & 2)) {
    const e = d(6);
    V('data-success', e.testResult().success), c(), y(' ', e.testResult().message, ' ');
  }
}
function Qe(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'dl', 51)(1, 'dt'),
      l(2, 'Command'),
      i(),
      n(3, 'dd')(4, 'code'),
      l(5),
      i()(),
      C(6, He, 5, 1),
      n(7, 'dt'),
      l(8, 'Agent'),
      i(),
      n(9, 'dd'),
      l(10),
      i(),
      C(11, Ge, 4, 1),
      i(),
      C(12, Ke, 2, 2, 'div', 52),
      n(13, 'div', 20)(14, 'button', 50),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.startEdit(r));
      }),
      l(15, 'Edit'),
      i(),
      n(16, 'button', 53),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onTest(r.id));
      }),
      l(17),
      i(),
      n(18, 'button', 54),
      _('click', () => {
        m(e);
        const r = d(2).$implicit,
          s = d(3);
        return p(s.onDelete(r.id));
      }),
      l(19, 'Delete'),
      i()();
  }
  if (o & 2) {
    const e = d(2).$implicit,
      a = d(3);
    c(5),
      q('', e.command, ' ', e.args.join(' ')),
      c(),
      f(e.cwd ? 6 : -1),
      c(4),
      g(a.getAgentName(e.agentId)),
      c(),
      f(a.Object.keys(e.envVars).length > 0 ? 11 : -1),
      c(),
      f(a.testResult() ? 12 : -1),
      c(4),
      b('disabled', a.testing()),
      c(),
      y(' ', a.testing() ? 'Testing...' : 'Test Connection', ' ');
  }
}
function Ye(o, _t) {
  if ((o & 1 && (n(0, 'div', 45), C(1, je, 33, 7)(2, Qe, 20, 8), i()), o & 2)) {
    const e = d().$implicit,
      a = d(3);
    c(), f(a.editingId() === e.id ? 1 : 2);
  }
}
function $e(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 39)(1, 'div', 40),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(3);
        return p(s.toggleExpand(r.id));
      }),
      n(2, 'div', 41)(3, 'span', 42),
      l(4),
      i(),
      n(5, 'span', 55),
      l(6),
      i(),
      n(7, 'span', 43),
      l(8),
      i()(),
      n(9, 'span', 44),
      l(10),
      i()(),
      C(11, Ye, 3, 1, 'div', 45),
      i();
  }
  if (o & 2) {
    const e = t.$implicit,
      a = d(3);
    P('server-card--expanded', a.expandedId() === e.id),
      c(4),
      g(e.name),
      c(2),
      g(a.getAgentName(e.agentId)),
      c(),
      V('data-enabled', e.enabled),
      c(),
      y(' ', e.enabled ? 'Enabled' : 'Disabled', ' '),
      c(2),
      g(e.command),
      c(),
      f(a.expandedId() === e.id ? 11 : -1);
  }
}
function Ue(o, _t) {
  if (
    (o & 1 &&
      (n(0, 'div', 4)(1, 'h3', 36),
      l(2, 'Agent-Specific Servers'),
      i(),
      n(3, 'div', 37),
      S(4, $e, 12, 8, 'div', 38, _e),
      i()()),
    o & 2)
  ) {
    const e = d(2);
    c(4), w(e.agentServers());
  }
}
function qe(o, _t) {
  if ((o & 1 && (C(0, Be, 6, 0, 'div', 4), C(1, Ue, 6, 0, 'div', 4)), o & 2)) {
    const e = d();
    f(e.globalServers().length > 0 ? 0 : -1), c(), f(e.agentServers().length > 0 ? 1 : -1);
  }
}
var Je = [
    {
      name: 'GitHub',
      description: 'GitHub API \u2014 repos, issues, PRs, search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      envVars: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      envHints: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    },
    {
      name: 'Filesystem',
      description: 'Local filesystem \u2014 read, write, search files',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'Brave Search',
      description: 'Web search via Brave Search API',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      envVars: { BRAVE_API_KEY: '' },
      envHints: ['BRAVE_API_KEY'],
    },
    {
      name: 'Fetch',
      description: 'Fetch web pages and extract content',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'Memory',
      description: 'Knowledge graph-based persistent memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'PostgreSQL',
      description: 'Query PostgreSQL databases',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      envVars: { POSTGRES_CONNECTION_STRING: '' },
      envHints: ['POSTGRES_CONNECTION_STRING'],
    },
    {
      name: 'Figma',
      description: 'Read Figma files, components, and design tokens',
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-server-figma'],
      envVars: { FIGMA_PERSONAL_ACCESS_TOKEN: '' },
      envHints: ['FIGMA_PERSONAL_ACCESS_TOKEN'],
    },
    {
      name: 'Slack',
      description: 'Slack API \u2014 channels, messages, users',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      envVars: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
      envHints: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    },
    {
      name: 'Puppeteer',
      description: 'Browser automation \u2014 navigate, screenshot, interact',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'Google Maps',
      description: 'Geocoding, directions, places, and elevation',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps'],
      envVars: { GOOGLE_MAPS_API_KEY: '' },
      envHints: ['GOOGLE_MAPS_API_KEY'],
    },
    {
      name: 'SQLite',
      description: 'Query and manage SQLite databases',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'Sentry',
      description: 'Sentry error tracking \u2014 issues, events, releases',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sentry'],
      envVars: { SENTRY_AUTH_TOKEN: '', SENTRY_ORG: '' },
      envHints: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
    },
    {
      name: 'Sequential Thinking',
      description: 'Step-by-step reasoning and problem decomposition',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      envVars: {},
      envHints: [],
    },
    {
      name: 'Linear',
      description: 'Linear project management \u2014 issues, projects, teams',
      command: 'npx',
      args: ['-y', 'mcp-linear'],
      envVars: { LINEAR_API_KEY: '' },
      envHints: ['LINEAR_API_KEY'],
    },
  ],
  ne = class o {
    mcpService = E(te);
    agentService = E(X);
    notify = E(Z);
    showCreateForm = v(!1);
    creating = v(!1);
    expandedId = v(null);
    editingId = v(null);
    testResult = v(null);
    testing = v(!1);
    showOfficialDefaults = v(!0);
    installingOfficial = v(null);
    officialServers = Je;
    Object = Object;
    globalServers = N(() => this.mcpService.servers().filter((t) => !t.agentId));
    agentServers = N(() => this.mcpService.servers().filter((t) => !!t.agentId));
    officialEnvValues = {};
    formName = '';
    formCommand = '';
    formArgs = '';
    formEnvVars = '';
    formCwd = '';
    formAgentId = '';
    formEnabled = !0;
    editName = '';
    editCommand = '';
    editArgs = '';
    editEnvVars = '';
    editCwd = '';
    editEnabled = !0;
    agentNameCache = {};
    async ngOnInit() {
      await this.agentService.loadAgents();
      for (const t of this.agentService.agents()) this.agentNameCache[t.id] = t.name;
      await this.mcpService.loadServers();
    }
    getAgentName(t) {
      return this.agentNameCache[t] ?? t.slice(0, 8);
    }
    toggleExpand(t) {
      this.expandedId.set(this.expandedId() === t ? null : t), this.editingId.set(null), this.testResult.set(null);
    }
    parseEnvVars(t) {
      const e = {};
      for (const a of t.split(`
`)) {
        const r = a.trim();
        if (!r) continue;
        const s = r.indexOf('=');
        s > 0 && (e[r.slice(0, s)] = r.slice(s + 1));
      }
      return e;
    }
    envVarsToString(t) {
      return Object.entries(t)
        .map(([e, a]) => `${e}=${a}`)
        .join(`
`);
    }
    startEdit(t) {
      this.editingId.set(t.id),
        (this.editName = t.name),
        (this.editCommand = t.command),
        (this.editArgs = t.args.join(`
`)),
        (this.editEnvVars = this.envVarsToString(t.envVars)),
        (this.editCwd = t.cwd ?? ''),
        (this.editEnabled = t.enabled);
    }
    async onCreate() {
      if (!(!this.formName || !this.formCommand)) {
        this.creating.set(!0);
        try {
          await this.mcpService.createServer({
            name: this.formName,
            command: this.formCommand,
            args: this.formArgs
              .split(`
`)
              .map((t) => t.trim())
              .filter(Boolean),
            envVars: this.parseEnvVars(this.formEnvVars),
            cwd: this.formCwd || null,
            agentId: this.formAgentId || null,
            enabled: this.formEnabled,
          }),
            (this.formName = ''),
            (this.formCommand = ''),
            (this.formArgs = ''),
            (this.formEnvVars = ''),
            (this.formCwd = ''),
            (this.formAgentId = ''),
            (this.formEnabled = !0),
            this.showCreateForm.set(!1),
            this.notify.success('MCP server created');
        } catch {
          this.notify.error('Failed to create server');
        } finally {
          this.creating.set(!1);
        }
      }
    }
    async onSaveEdit(t) {
      try {
        await this.mcpService.updateServer(t, {
          name: this.editName,
          command: this.editCommand,
          args: this.editArgs
            .split(`
`)
            .map((e) => e.trim())
            .filter(Boolean),
          envVars: this.parseEnvVars(this.editEnvVars),
          cwd: this.editCwd || null,
          enabled: this.editEnabled,
        }),
          this.editingId.set(null),
          this.notify.success('Server updated');
      } catch {
        this.notify.error('Failed to update server');
      }
    }
    async onTest(t) {
      this.testing.set(!0), this.testResult.set(null);
      try {
        const e = await this.mcpService.testConnection(t);
        this.testResult.set(e);
      } catch {
        this.testResult.set({ success: !1, message: 'Connection test failed' });
      } finally {
        this.testing.set(!1);
      }
    }
    async onDelete(t) {
      try {
        await this.mcpService.deleteServer(t), this.expandedId.set(null), this.notify.success('Server deleted');
      } catch {
        this.notify.error('Failed to delete server');
      }
    }
    isInstalled(t) {
      return this.mcpService.servers().some((e) => e.name.toLowerCase() === t.toLowerCase());
    }
    setOfficialEnv(t, e, a) {
      this.officialEnvValues[t] || (this.officialEnvValues[t] = {}), (this.officialEnvValues[t][e] = a);
    }
    async onInstallOfficial(t) {
      this.installingOfficial.set(t.name);
      try {
        const e = Ce({}, t.envVars),
          a = this.officialEnvValues[t.name];
        if (a) for (const [r, s] of Object.entries(a)) s && (e[r] = s);
        await this.mcpService.createServer({ name: t.name, command: t.command, args: t.args, envVars: e, enabled: !0 }),
          this.notify.success(`${t.name} MCP server installed`);
      } catch {
        this.notify.error(`Failed to install ${t.name}`);
      } finally {
        this.installingOfficial.set(null);
      }
    }
    static \u0275fac = (e) => new (e || o)();
    static \u0275cmp = L({
      type: o,
      selectors: [['app-mcp-server-list']],
      decls: 11,
      vars: 4,
      consts: [
        [1, 'page'],
        [1, 'page__header'],
        [1, 'create-btn', 3, 'click'],
        [1, 'create-form'],
        [1, 'section'],
        ['variant', 'table', 3, 'count'],
        ['icon', '{ }', 'title', 'No MCP Servers', 'description', 'No custom MCP servers configured.'],
        [1, 'form-grid'],
        [1, 'form-field'],
        ['placeholder', 'e.g. GitHub MCP', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
        ['placeholder', 'npx @github/mcp-server', 1, 'form-input', 'mono', 3, 'ngModelChange', 'ngModel'],
        [1, 'form-field', 'span-2'],
        [
          'rows',
          '3',
          'placeholder',
          `--port
3001`,
          1,
          'form-textarea',
          'mono',
          3,
          'ngModelChange',
          'ngModel',
        ],
        [
          'rows',
          '3',
          'placeholder',
          `GITHUB_TOKEN=xxx
NODE_ENV=production`,
          1,
          'form-textarea',
          'mono',
          3,
          'ngModelChange',
          'ngModel',
        ],
        ['placeholder', '/path/to/project', 1, 'form-input', 'mono', 3, 'ngModelChange', 'ngModel'],
        [1, 'form-select', 3, 'ngModelChange', 'ngModel'],
        ['value', ''],
        [3, 'value'],
        [1, 'toggle'],
        ['type', 'checkbox', 3, 'ngModelChange', 'ngModel'],
        [1, 'form-actions'],
        [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
        [1, 'section__header', 3, 'click'],
        [1, 'section__toggle'],
        [1, 'official-grid'],
        [1, 'official-card', 3, 'official-card--installed'],
        [1, 'official-card'],
        [1, 'official-card__top'],
        [1, 'official-card__name'],
        [1, 'installed-badge'],
        [1, 'official-card__desc'],
        [1, 'official-card__cmd'],
        [1, 'official-card__env'],
        [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click', 'disabled'],
        [1, 'env-input', 3, 'placeholder'],
        [1, 'env-input', 3, 'input', 'placeholder'],
        [1, 'section__title'],
        [1, 'server-list'],
        [1, 'server-card', 3, 'server-card--expanded'],
        [1, 'server-card'],
        [1, 'server-card__header', 3, 'click'],
        [1, 'server-card__title'],
        [1, 'server-card__name'],
        [1, 'server-card__status'],
        [1, 'server-card__command'],
        [1, 'server-card__details'],
        [1, 'form-input', 3, 'ngModelChange', 'ngModel'],
        [1, 'form-input', 'mono', 3, 'ngModelChange', 'ngModel'],
        ['rows', '3', 1, 'form-textarea', 'mono', 3, 'ngModelChange', 'ngModel'],
        [1, 'btn', 'btn--primary', 3, 'click'],
        [1, 'btn', 'btn--secondary', 3, 'click'],
        [1, 'server-detail-list'],
        [1, 'test-result'],
        [1, 'btn', 'btn--secondary', 3, 'click', 'disabled'],
        [1, 'btn', 'btn--danger', 3, 'click'],
        [1, 'server-card__agent-tag'],
      ],
      template: (e, a) => {
        e & 1 &&
          (n(0, 'div', 0)(1, 'div', 1)(2, 'h2'),
          l(3, 'MCP Servers'),
          i(),
          n(4, 'button', 2),
          _('click', () => a.showCreateForm.set(!a.showCreateForm())),
          l(5),
          i()(),
          C(6, Se, 42, 10, 'div', 3),
          C(7, Ve, 7, 2, 'div', 4),
          C(8, Te, 1, 1, 'app-skeleton', 5)(9, Ie, 1, 0, 'app-empty-state', 6)(10, qe, 2, 2),
          i()),
          e & 2 &&
            (c(5),
            y(' ', a.showCreateForm() ? 'Cancel' : '+ New Server', ' '),
            c(),
            f(a.showCreateForm() ? 6 : -1),
            c(),
            f(a.showCreateForm() ? -1 : 7),
            c(),
            f(a.mcpService.loading() ? 8 : a.mcpService.servers().length === 0 ? 9 : 10));
      },
      dependencies: [G, j, H, W, ve, B, R, z, K, Q],
      styles: [
        '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.create-btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan);font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.loading[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem}.section[_ngcontent-%COMP%]{margin-bottom:1.5rem}.section__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:.75rem}.section__header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.section__toggle[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-cyan);text-transform:uppercase}.section__title[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary);font-size:.9rem}.official-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem}.official-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.75rem;transition:border-color .15s}.official-card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright)}.official-card--installed[_ngcontent-%COMP%]{opacity:.6}.official-card__top[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem}.official-card__name[_ngcontent-%COMP%]{font-weight:700;color:var(--text-primary);font-size:.85rem}.installed-badge[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 6px;border-radius:var(--radius-sm);color:var(--accent-green);border:1px solid var(--accent-green);font-weight:600;text-transform:uppercase}.official-card__desc[_ngcontent-%COMP%]{margin:0 0 .35rem;font-size:.7rem;color:var(--text-secondary)}.official-card__cmd[_ngcontent-%COMP%]{display:block;font-size:.65rem;color:var(--text-tertiary);margin-bottom:.5rem;word-break:break-all}.official-card__env[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem}.env-input[_ngcontent-%COMP%]{padding:.35rem .5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.75rem;font-family:monospace;background:var(--bg-input);color:var(--text-primary);box-sizing:border-box}.env-input[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);outline:none}.btn--sm[_ngcontent-%COMP%]{padding:.3rem .6rem;font-size:.7rem}.server-card__agent-tag[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 6px;border-radius:var(--radius-sm);color:var(--accent-cyan);border:1px solid var(--accent-cyan);font-weight:600}.create-form[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.5rem}.create-form[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.form-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.form-field[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{display:block;font-size:.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}.form-input[_ngcontent-%COMP%], .form-select[_ngcontent-%COMP%], .form-textarea[_ngcontent-%COMP%]{width:100%;padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary);box-sizing:border-box}.form-input[_ngcontent-%COMP%]:focus, .form-select[_ngcontent-%COMP%]:focus, .form-textarea[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.form-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:3em;line-height:1.5}.mono[_ngcontent-%COMP%]{font-family:monospace}.span-2[_ngcontent-%COMP%]{grid-column:span 2}.form-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:1rem}.toggle[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.85rem;color:var(--text-primary)}.toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]{accent-color:var(--accent-cyan)}.server-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.server-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem;transition:border-color .15s}.server-card--expanded[_ngcontent-%COMP%]{border-color:var(--accent-cyan)}.server-card__header[_ngcontent-%COMP%]{cursor:pointer}.server-card__title[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.server-card__name[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.server-card__status[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;background:var(--bg-raised);border:1px solid var(--border)}.server-card__status[data-enabled=true][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.server-card__status[data-enabled=false][_ngcontent-%COMP%]{color:var(--text-secondary)}.server-card__command[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);font-family:monospace}.server-card__details[_ngcontent-%COMP%]{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)}.server-detail-list[_ngcontent-%COMP%]{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin-bottom:1rem}.server-detail-list[_ngcontent-%COMP%]   dt[_ngcontent-%COMP%]{font-weight:600;color:var(--text-secondary);font-size:.75rem;text-transform:uppercase}.server-detail-list[_ngcontent-%COMP%]   dd[_ngcontent-%COMP%]{margin:0;color:var(--text-primary);font-size:.85rem}.server-detail-list[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{color:var(--accent-cyan);font-size:.8rem}.test-result[_ngcontent-%COMP%]{padding:.5rem .75rem;border-radius:var(--radius);font-size:.8rem;margin-bottom:1rem;border:1px solid var(--border)}.test-result[data-success=true][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green);background:#00ff000d}.test-result[data-success=false][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red);background:var(--accent-red-dim)}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red);border-color:var(--accent-red)}.btn--danger[_ngcontent-%COMP%]:hover{background:var(--accent-red-dim)}@media(max-width:767px){.form-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.span-2[_ngcontent-%COMP%]{grid-column:span 1}}',
      ],
      changeDetection: 0,
    });
  };
var ie = class o extends J {
  apiPath = '/contacts';
  contacts = this.entities;
  async load() {
    this.loading.set(!0);
    try {
      const t = await k(this.api.get(this.apiPath));
      this.entities.set(t.contacts);
    } finally {
      this.loading.set(!1);
    }
  }
  async getContact(t) {
    return this.getById(t);
  }
  async createContact(t, e) {
    return this.create({ displayName: t, notes: e });
  }
  async updateContact(t, e) {
    return this.update(t, e);
  }
  async deleteContact(t) {
    return this.remove(t);
  }
  async addLink(t, e, a) {
    const r = await k(this.api.post(`${this.apiPath}/${t}/links`, { platform: e, platformId: a })),
      s = await this.getById(t);
    return this.entities.update((se) => se.map(($) => ($.id === t ? s : $))), r;
  }
  async removeLink(t, e) {
    await k(this.api.delete(`${this.apiPath}/${t}/links/${e}`));
    const a = await this.getById(t);
    this.entities.update((r) => r.map((s) => (s.id === t ? a : s)));
  }
  async verifyLink(t, e) {
    await k(this.api.put(`${this.apiPath}/${t}/links/${e}/verify`, {}));
    const a = await this.getById(t);
    this.entities.update((r) => r.map((s) => (s.id === t ? a : s)));
  }
  static \u0275fac = (() => {
    let t;
    return (a) => (t || (t = U(o)))(a || o);
  })();
  static \u0275prov = F({ token: o, factory: o.\u0275fac, providedIn: 'root' });
};
var he = () => [],
  ge = (_o, t) => t.id;
function Xe(o, _t) {
  o & 1 && O(0, 'app-skeleton', 6), o & 2 && b('count', 5);
}
function Ze(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'app-empty-state', 10),
      _('actionClick', () => {
        m(e);
        const r = d();
        return p(r.openCreate());
      }),
      i();
  }
}
function et(o, t) {
  if ((o & 1 && (n(0, 'span'), l(1), i()), o & 2)) {
    const e = t.$implicit,
      a = d(3);
    de(me('platform-chip platform-chip--', e.platform)),
      P('platform-chip--verified', e.verified),
      c(),
      y(' ', a.platformLabel(e.platform), ' ');
  }
}
function tt(o, _t) {
  o & 1 && (n(0, 'span', 22), l(1, 'No linked accounts'), i());
}
function nt(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'button', 16),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(2);
        return p(s.selectContact(r));
      }),
      n(1, 'div', 17),
      l(2),
      i(),
      n(3, 'div', 18)(4, 'h3', 19),
      l(5),
      i(),
      n(6, 'div', 20),
      S(7, et, 2, 6, 'span', 21, ge),
      C(9, tt, 2, 0, 'span', 22),
      i()(),
      n(10, 'span', 23),
      l(11),
      A(12, 'relativeTime'),
      i()();
  }
  if (o & 2) {
    let e,
      a = t.$implicit,
      r = d(2);
    P('contact-card--active', ((e = r.selectedContact()) == null ? null : e.id) === a.id),
      c(2),
      y(' ', a.displayName.charAt(0).toUpperCase(), ' '),
      c(3),
      g(a.displayName),
      c(2),
      w(a.links ?? I(8, he)),
      c(2),
      f(a.links?.length ? -1 : 9),
      c(2),
      g(D(12, 6, a.updatedAt));
  }
}
function it(o, _t) {
  if ((o & 1 && (n(0, 'p', 13), l(1), i()), o & 2)) {
    const e = d(2);
    c(), y('No contacts match "', e.searchQuery(), '"');
  }
}
function rt(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 24)(1, 'h3', 31),
      l(2, 'Edit Contact'),
      i(),
      n(3, 'label', 32),
      l(4, 'Name'),
      i(),
      n(5, 'input', 33),
      _('ngModelChange', (r) => {
        m(e);
        const s = d(3);
        return p(s.editName.set(r));
      }),
      i(),
      n(6, 'label', 32),
      l(7, 'Notes'),
      i(),
      n(8, 'textarea', 34),
      _('ngModelChange', (r) => {
        m(e);
        const s = d(3);
        return p(s.editNotes.set(r));
      }),
      i(),
      n(9, 'div', 35)(10, 'button', 3),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.saveEdit());
      }),
      l(11, 'Save'),
      i(),
      n(12, 'button', 36),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.editing.set(!1));
      }),
      l(13, 'Cancel'),
      i()()();
  }
  if (o & 2) {
    const e = d(3);
    c(5), b('ngModel', e.editName()), c(3), b('ngModel', e.editNotes());
  }
}
function ot(o, _t) {
  if ((o & 1 && (n(0, 'div', 24)(1, 'h4', 25), l(2, 'Notes'), i(), n(3, 'p', 44), l(4), i()()), o & 2)) {
    const e = d(4);
    c(4), g(e.selectedContact().notes);
  }
}
function at(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 37)(1, 'div', 38),
      l(2),
      i(),
      n(3, 'div')(4, 'h3', 39),
      l(5),
      i(),
      n(6, 'span', 40),
      l(7),
      A(8, 'relativeTime'),
      i()(),
      n(9, 'div', 41)(10, 'button', 42),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.startEdit());
      }),
      l(11, 'Edit'),
      i(),
      n(12, 'button', 43),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.confirmDelete());
      }),
      l(13, 'Delete'),
      i()()(),
      C(14, ot, 5, 1, 'div', 24);
  }
  if (o & 2) {
    const e = d(3);
    c(2),
      y(' ', e.selectedContact().displayName.charAt(0).toUpperCase(), ' '),
      c(3),
      g(e.selectedContact().displayName),
      c(2),
      y('Added ', D(8, 4, e.selectedContact().createdAt)),
      c(7),
      f(e.selectedContact().notes ? 14 : -1);
  }
}
function lt(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'button', 49),
      _('click', () => {
        m(e);
        const r = d().$implicit,
          s = d(3);
        return p(s.verifyLink(r));
      }),
      l(1, 'Verify'),
      i();
  }
}
function ct(o, _t) {
  o & 1 && (n(0, 'span', 47), l(1, 'Verified'), i());
}
function st(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 27)(1, 'span'),
      l(2),
      i(),
      n(3, 'code', 45),
      l(4),
      i(),
      C(5, lt, 2, 0, 'button', 46)(6, ct, 2, 0, 'span', 47),
      n(7, 'button', 48),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(3);
        return p(s.removeLink(r));
      }),
      l(8, 'Remove'),
      i()();
  }
  if (o & 2) {
    const e = t.$implicit,
      a = d(3);
    c(),
      de(me('platform-chip platform-chip--', e.platform)),
      P('platform-chip--verified', e.verified),
      c(),
      y(' ', a.platformLabel(e.platform), ' '),
      c(2),
      g(e.platformId),
      c(),
      f(e.verified ? 6 : 5);
  }
}
function dt(o, _t) {
  o & 1 && (n(0, 'p', 28), l(1, 'No platform accounts linked yet.'), i());
}
function mt(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 29)(1, 'select', 50),
      _('ngModelChange', (r) => {
        m(e);
        const s = d(3);
        return p(s.newLinkPlatform.set(r));
      }),
      n(2, 'option', 51),
      l(3, 'Discord'),
      i(),
      n(4, 'option', 52),
      l(5, 'AlgoChat'),
      i(),
      n(6, 'option', 53),
      l(7, 'GitHub'),
      i()(),
      n(8, 'input', 54),
      _('ngModelChange', (r) => {
        m(e);
        const s = d(3);
        return p(s.newLinkId.set(r));
      }),
      i(),
      n(9, 'div', 35)(10, 'button', 55),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.saveLink());
      }),
      l(11, 'Add'),
      i(),
      n(12, 'button', 42),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.addingLink.set(!1));
      }),
      l(13, 'Cancel'),
      i()()();
  }
  if (o & 2) {
    const e = d(3);
    c(), b('ngModel', e.newLinkPlatform()), c(7), b('ngModel', e.newLinkId());
  }
}
function pt(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'button', 42),
      _('click', () => {
        m(e);
        const r = d(3);
        return p(r.openAddLink());
      }),
      l(1, '+ Add Link'),
      i();
  }
}
function _t(o, _t) {
  if (
    (o & 1 &&
      (n(0, 'div', 14),
      C(1, rt, 14, 2, 'div', 24)(2, at, 15, 6),
      n(3, 'div', 24)(4, 'h4', 25),
      l(5, 'Platform Links'),
      i(),
      n(6, 'div', 26),
      S(7, st, 9, 8, 'div', 27, ge, !1, dt, 2, 0, 'p', 28),
      i(),
      C(10, mt, 14, 2, 'div', 29)(11, pt, 2, 0, 'button', 30),
      i()()),
    o & 2)
  ) {
    const e = d(2);
    c(), f(e.editing() ? 1 : 2), c(6), w(e.selectedContact().links ?? I(3, he)), c(3), f(e.addingLink() ? 10 : 11);
  }
}
function gt(o, _t) {
  o & 1 && (n(0, 'div', 15)(1, 'p'), l(2, 'Select a contact to view details'), i()());
}
function Ct(o, _t) {
  if (
    (o & 1 &&
      (n(0, 'div', 8)(1, 'div', 11),
      S(2, nt, 13, 9, 'button', 12, ge, !1, it, 2, 1, 'p', 13),
      i(),
      C(5, _t, 12, 4, 'div', 14)(6, gt, 3, 0, 'div', 15),
      i()),
    o & 2)
  ) {
    const e = d();
    c(2), w(e.filteredContacts()), c(3), f(e.selectedContact() ? 5 : 6);
  }
}
function ft(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 56),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.creating.set(!1));
      }),
      n(1, 'div', 57),
      _('click', (r) => (m(e), p(r.stopPropagation()))),
      n(2, 'h3', 58),
      l(3, 'New Contact'),
      i(),
      n(4, 'label', 32),
      l(5, 'Name'),
      i(),
      n(6, 'input', 59),
      _('ngModelChange', (r) => {
        m(e);
        const s = d();
        return p(s.createName.set(r));
      }),
      i(),
      n(7, 'label', 32),
      l(8, 'Notes'),
      i(),
      n(9, 'textarea', 60),
      _('ngModelChange', (r) => {
        m(e);
        const s = d();
        return p(s.createNotes.set(r));
      }),
      i(),
      n(10, 'div', 61)(11, 'button', 62),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.saveCreate());
      }),
      l(12, 'Create'),
      i(),
      n(13, 'button', 36),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.creating.set(!1));
      }),
      l(14, 'Cancel'),
      i()()()();
  }
  if (o & 2) {
    let e,
      a = d();
    c(6),
      b('ngModel', a.createName()),
      c(3),
      b('ngModel', a.createNotes()),
      c(2),
      b('disabled', !((e = a.createName()) != null && e.trim()));
  }
}
var vt = { discord: 'Discord', algochat: 'AlgoChat', github: 'GitHub' },
  re = class o {
    contactService = E(ie);
    searchQuery = v('');
    filteredContacts = N(() => {
      const t = this.searchQuery().toLowerCase().trim(),
        e = this.contactService.contacts();
      return t
        ? e.filter(
            (a) =>
              a.displayName.toLowerCase().includes(t) ||
              a.notes?.toLowerCase().includes(t) ||
              a.links?.some((r) => r.platformId.toLowerCase().includes(t)),
          )
        : e;
    });
    selectedContact = v(null);
    editing = v(!1);
    editName = v('');
    editNotes = v('');
    creating = v(!1);
    createName = v('');
    createNotes = v('');
    addingLink = v(!1);
    newLinkPlatform = v('discord');
    newLinkId = v('');
    ngOnInit() {
      this.contactService.load();
    }
    platformLabel(t) {
      return vt[t];
    }
    selectContact(t) {
      this.selectedContact.set(t), this.editing.set(!1), this.addingLink.set(!1);
    }
    openCreate() {
      this.createName.set(''), this.createNotes.set(''), this.creating.set(!0);
    }
    async saveCreate() {
      const t = this.createName().trim();
      if (!t) return;
      const e = await this.contactService.createContact(t, this.createNotes().trim() || void 0);
      this.creating.set(!1),
        await this.contactService.load(),
        this.selectedContact.set(this.contactService.findById(e.id) ?? e);
    }
    startEdit() {
      const t = this.selectedContact();
      t && (this.editName.set(t.displayName), this.editNotes.set(t.notes ?? ''), this.editing.set(!0));
    }
    async saveEdit() {
      const t = this.selectedContact();
      if (!t) return;
      const e = await this.contactService.updateContact(t.id, {
        displayName: this.editName().trim(),
        notes: this.editNotes().trim() || null,
      });
      this.selectedContact.set(e), this.editing.set(!1);
    }
    async confirmDelete() {
      const t = this.selectedContact();
      t &&
        confirm(`Delete contact "${t.displayName}"? This cannot be undone.`) &&
        (await this.contactService.deleteContact(t.id), this.selectedContact.set(null));
    }
    openAddLink() {
      this.newLinkPlatform.set('discord'), this.newLinkId.set(''), this.addingLink.set(!0);
    }
    async saveLink() {
      const t = this.selectedContact(),
        e = this.newLinkId().trim();
      !t ||
        !e ||
        (await this.contactService.addLink(t.id, this.newLinkPlatform(), e),
        this.addingLink.set(!1),
        this.selectedContact.set(this.contactService.findById(t.id) ?? t));
    }
    async removeLink(t) {
      const e = this.selectedContact();
      e &&
        confirm(`Remove ${t.platform} link? This cannot be undone.`) &&
        (await this.contactService.removeLink(e.id, t.id),
        this.selectedContact.set(this.contactService.findById(e.id) ?? e));
    }
    async verifyLink(t) {
      const e = this.selectedContact();
      e &&
        (await this.contactService.verifyLink(e.id, t.id),
        this.selectedContact.set(this.contactService.findById(e.id) ?? e));
    }
    static \u0275fac = (e) => new (e || o)();
    static \u0275cmp = L({
      type: o,
      selectors: [['app-contact-list']],
      decls: 12,
      vars: 3,
      consts: [
        [1, 'page'],
        [1, 'page__header'],
        [1, 'page-title'],
        [1, 'btn', 'btn--primary', 3, 'click'],
        [1, 'page__toolbar'],
        [
          'type',
          'text',
          'placeholder',
          'Search contacts...',
          'aria-label',
          'Search contacts',
          1,
          'search-input',
          3,
          'ngModelChange',
          'ngModel',
        ],
        ['variant', 'table', 3, 'count'],
        [
          'icon',
          `  [^_^]
  /| |\\
   | |`,
          'title',
          'No contacts yet.',
          'description',
          "Contacts map identities across Discord, AlgoChat, and GitHub so the agent never confuses who's who.",
          'actionLabel',
          '+ Add a contact',
          'actionAriaLabel',
          'Add your first contact',
        ],
        [1, 'contact-layout'],
        [1, 'modal-overlay'],
        [
          'icon',
          `  [^_^]
  /| |\\
   | |`,
          'title',
          'No contacts yet.',
          'description',
          "Contacts map identities across Discord, AlgoChat, and GitHub so the agent never confuses who's who.",
          'actionLabel',
          '+ Add a contact',
          'actionAriaLabel',
          'Add your first contact',
          3,
          'actionClick',
        ],
        ['role', 'list', 1, 'contact-list'],
        ['role', 'listitem', 1, 'contact-card', 3, 'contact-card--active'],
        [1, 'no-results'],
        [1, 'contact-detail'],
        [1, 'contact-detail', 'contact-detail--empty'],
        ['role', 'listitem', 1, 'contact-card', 3, 'click'],
        [1, 'contact-card__avatar'],
        [1, 'contact-card__info'],
        [1, 'contact-card__name'],
        [1, 'contact-card__platforms'],
        [3, 'class', 'platform-chip--verified'],
        [1, 'contact-card__no-links'],
        [1, 'contact-card__time'],
        [1, 'detail-section'],
        [1, 'section-label'],
        [1, 'links-list'],
        [1, 'link-row'],
        [1, 'empty-hint'],
        [1, 'add-link-form'],
        [1, 'btn', 'btn--ghost', 'btn--sm'],
        [1, 'detail-title'],
        [1, 'field-label'],
        ['type', 'text', 1, 'field-input', 3, 'ngModelChange', 'ngModel'],
        ['rows', '4', 1, 'field-input', 'field-textarea', 3, 'ngModelChange', 'ngModel'],
        [1, 'detail-actions'],
        [1, 'btn', 'btn--ghost', 3, 'click'],
        [1, 'detail-header'],
        [1, 'detail-avatar'],
        [1, 'detail-name'],
        [1, 'detail-meta'],
        [1, 'detail-header-actions'],
        [1, 'btn', 'btn--ghost', 'btn--sm', 3, 'click'],
        [1, 'btn', 'btn--danger', 'btn--sm', 3, 'click'],
        [1, 'detail-notes'],
        [1, 'link-id'],
        [1, 'btn', 'btn--ghost', 'btn--xs'],
        [1, 'verified-badge'],
        [1, 'btn', 'btn--danger', 'btn--xs', 3, 'click'],
        [1, 'btn', 'btn--ghost', 'btn--xs', 3, 'click'],
        [1, 'field-input', 'field-select', 3, 'ngModelChange', 'ngModel'],
        ['value', 'discord'],
        ['value', 'algochat'],
        ['value', 'github'],
        [
          'type',
          'text',
          'placeholder',
          'Platform ID (e.g. Discord user ID, GitHub handle)',
          1,
          'field-input',
          3,
          'ngModelChange',
          'ngModel',
        ],
        [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click'],
        [1, 'modal-overlay', 3, 'click'],
        [1, 'modal', 3, 'click'],
        [1, 'modal__title'],
        ['type', 'text', 'placeholder', 'Display name', 1, 'field-input', 3, 'ngModelChange', 'ngModel'],
        [
          'rows',
          '3',
          'placeholder',
          'Role, context, anything helpful...',
          1,
          'field-input',
          'field-textarea',
          3,
          'ngModelChange',
          'ngModel',
        ],
        [1, 'modal__actions'],
        [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      ],
      template: (e, a) => {
        e & 1 &&
          (n(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
          l(3, 'Contacts'),
          i(),
          n(4, 'button', 3),
          _('click', () => a.openCreate()),
          l(5, '+ New Contact'),
          i()(),
          n(6, 'div', 4)(7, 'input', 5),
          _('ngModelChange', (s) => a.searchQuery.set(s)),
          i()(),
          C(8, Xe, 1, 1, 'app-skeleton', 6)(9, Ze, 1, 0, 'app-empty-state', 7)(10, Ct, 7, 2, 'div', 8),
          C(11, ft, 15, 3, 'div', 9),
          i()),
          e & 2 &&
            (c(7),
            b('ngModel', a.searchQuery()),
            c(),
            f(a.contactService.loading() ? 8 : a.contactService.contacts().length === 0 && !a.searchQuery() ? 9 : 10),
            c(3),
            f(a.creating() ? 11 : -1));
      },
      dependencies: [G, j, H, W, B, R, z, Q, K, ee],
      styles: [
        '.page[_ngcontent-%COMP%]{padding:1.5rem;height:100%;display:flex;flex-direction:column}.page__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__toolbar[_ngcontent-%COMP%]{margin-bottom:1rem}.search-input[_ngcontent-%COMP%]{width:100%;max-width:400px;padding:.5rem .75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;transition:border-color .2s}.search-input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.search-input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary)}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s;background:transparent}.btn--primary[_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.btn--ghost[_ngcontent-%COMP%]{color:var(--text-secondary);border-color:var(--border)}.btn--ghost[_ngcontent-%COMP%]:hover{border-color:var(--text-tertiary)}.btn--danger[_ngcontent-%COMP%]{color:var(--accent-red, #ff5555);border-color:var(--accent-red, #ff5555)}.btn--danger[_ngcontent-%COMP%]:hover{background:#ff55551a}.btn--sm[_ngcontent-%COMP%]{padding:.3rem .6rem;font-size:.7rem}.btn--xs[_ngcontent-%COMP%]{padding:.2rem .4rem;font-size:.65rem}.contact-layout[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1.2fr;gap:1.5rem;flex:1;min-height:0}.contact-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;overflow-y:auto;max-height:calc(100vh - 220px)}.contact-card[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);cursor:pointer;text-align:left;width:100%;font-family:inherit;color:inherit;transition:border-color .2s,box-shadow .2s}.contact-card[_ngcontent-%COMP%]:hover{border-color:var(--accent-green);box-shadow:0 0 12px #00ff8814}.contact-card--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);box-shadow:0 0 16px #00c8ff1f}.contact-card__avatar[_ngcontent-%COMP%]{width:36px;height:36px;border-radius:50%;background:var(--accent-cyan-dim, rgba(0, 200, 255, .15));color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0}.contact-card__info[_ngcontent-%COMP%]{flex:1;min-width:0}.contact-card__name[_ngcontent-%COMP%]{margin:0 0 .2rem;font-size:.9rem;color:var(--text-primary)}.contact-card__platforms[_ngcontent-%COMP%]{display:flex;gap:.3rem;flex-wrap:wrap}.contact-card__no-links[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary)}.contact-card__time[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);white-space:nowrap}.platform-chip[_ngcontent-%COMP%]{display:inline-block;padding:.1rem .4rem;border-radius:4px;font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;border:1px solid}.platform-chip--discord[_ngcontent-%COMP%]{color:#7289da;border-color:#7289da;background:#7289da1a}.platform-chip--algochat[_ngcontent-%COMP%]{color:var(--accent-green, #00ff88);border-color:var(--accent-green, #00ff88);background:#00ff881a}.platform-chip--github[_ngcontent-%COMP%]{color:#f0f0f0;border-color:#666;background:#ffffff0d}.platform-chip--verified[_ngcontent-%COMP%]{box-shadow:0 0 6px #0f83}.no-results[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.85rem;padding:1rem}.contact-detail[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;overflow-y:auto;max-height:calc(100vh - 220px)}.contact-detail--empty[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)}.detail-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem}.detail-avatar[_ngcontent-%COMP%]{width:48px;height:48px;border-radius:50%;background:var(--accent-cyan-dim, rgba(0, 200, 255, .15));color:var(--accent-cyan);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;flex-shrink:0}.detail-name[_ngcontent-%COMP%]{margin:0;font-size:1.1rem;color:var(--text-primary)}.detail-meta[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-tertiary)}.detail-header-actions[_ngcontent-%COMP%]{margin-left:auto;display:flex;gap:.5rem}.detail-section[_ngcontent-%COMP%]{margin-bottom:1.5rem}.detail-title[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.section-label[_ngcontent-%COMP%]{margin:0 0 .5rem;font-size:.75rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em}.detail-notes[_ngcontent-%COMP%]{margin:0;color:var(--text-secondary);font-size:.85rem;white-space:pre-wrap}.detail-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.75rem}.links-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.75rem}.link-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;background:var(--bg-base, rgba(0, 0, 0, .2));border-radius:var(--radius)}.link-id[_ngcontent-%COMP%]{font-size:.8rem;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.verified-badge[_ngcontent-%COMP%]{font-size:.65rem;color:var(--accent-green, #00ff88);font-weight:600;text-transform:uppercase}.empty-hint[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.8rem;margin:.25rem 0}.add-link-form[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem;padding:.75rem;background:var(--bg-base, rgba(0, 0, 0, .2));border-radius:var(--radius);margin-top:.5rem}.field-label[_ngcontent-%COMP%]{display:block;font-size:.75rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem;margin-top:.75rem}.field-input[_ngcontent-%COMP%]{width:100%;padding:.5rem .75rem;background:var(--bg-base, rgba(0, 0, 0, .3));border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;box-sizing:border-box}.field-input[_ngcontent-%COMP%]:focus{outline:none;border-color:var(--accent-cyan)}.field-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:60px}.field-select[_ngcontent-%COMP%]{appearance:auto;cursor:pointer}.modal-overlay[_ngcontent-%COMP%]{position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;z-index:1000}.modal[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:90%;max-width:440px}.modal__title[_ngcontent-%COMP%]{margin:0 0 .5rem;color:var(--text-primary)}.modal__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:1rem}@media(max-width:767px){.contact-layout[_ngcontent-%COMP%]{grid-template-columns:1fr}}',
      ],
      changeDetection: 0,
    });
  };
var oe = class o {
  api = E(fe);
  listings = v([]);
  loading = v(!1);
  async search(t) {
    const e = new URLSearchParams();
    t.query && e.set('q', t.query),
      t.category && e.set('category', t.category),
      t.pricingModel && e.set('pricing', t.pricingModel),
      t.minRating != null && e.set('minRating', String(t.minRating)),
      t.tags?.length && e.set('tags', t.tags.join(',')),
      t.limit != null && e.set('limit', String(t.limit)),
      t.offset != null && e.set('offset', String(t.offset));
    const a = e.toString(),
      r = await k(this.api.get(`/marketplace/search${a ? `?${a}` : ''}`));
    return this.listings.set(r.listings), r;
  }
  async getListings() {
    const t = await k(this.api.get('/marketplace/listings'));
    return this.listings.set(t.listings), t.listings;
  }
  async getListingsByAgent(t) {
    const e = await k(this.api.get(`/marketplace/listings?agentId=${encodeURIComponent(t)}`));
    return this.listings.set(e), e;
  }
  async createListing(t) {
    const e = await k(this.api.post('/marketplace/listings', t));
    return this.listings.update((a) => [...a, e]), e;
  }
  async updateListing(t, e) {
    const a = await k(this.api.put(`/marketplace/listings/${t}`, e));
    return this.listings.update((r) => r.map((s) => (s.id === t ? a : s))), a;
  }
  async deleteListing(t) {
    await k(this.api.delete(`/marketplace/listings/${t}`)), this.listings.update((e) => e.filter((a) => a.id !== t));
  }
  async getReviews(t) {
    return k(this.api.get(`/marketplace/listings/${t}/reviews`));
  }
  async getFederatedListings() {
    return k(this.api.get('/marketplace/federated'));
  }
  async createReview(t, e) {
    return k(this.api.post(`/marketplace/listings/${t}/reviews`, e));
  }
  static \u0275fac = (e) => new (e || o)();
  static \u0275prov = F({ token: o, factory: o.\u0275fac, providedIn: 'root' });
};
var le = () => [1, 2, 3, 4, 5],
  ce = (_o, t) => t.id;
function ut(o, t) {
  if ((o & 1 && (n(0, 'option', 24), l(1), i()), o & 2)) {
    const e = t.$implicit;
    b('value', e.id), c(), g(e.name);
  }
}
function xt(o, _t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 15)(1, 'h3'),
      l(2, 'Create Listing'),
      i(),
      n(3, 'div', 21)(4, 'div', 22)(5, 'label'),
      l(6, 'Agent'),
      i(),
      n(7, 'select', 23),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formAgentId, r) || (s.formAgentId = r), p(r);
      }),
      n(8, 'option', 6),
      l(9, 'Select agent...'),
      i(),
      S(10, ut, 2, 2, 'option', 24, ce),
      i()(),
      n(12, 'div', 22)(13, 'label'),
      l(14, 'Name'),
      i(),
      n(15, 'input', 25),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formName, r) || (s.formName = r), p(r);
      }),
      i()(),
      n(16, 'div', 22)(17, 'label'),
      l(18, 'Category'),
      i(),
      n(19, 'select', 23),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formCategory, r) || (s.formCategory = r), p(r);
      }),
      n(20, 'option', 13),
      l(21, 'General'),
      i(),
      n(22, 'option', 7),
      l(23, 'Coding'),
      i(),
      n(24, 'option', 8),
      l(25, 'Research'),
      i(),
      n(26, 'option', 9),
      l(27, 'Writing'),
      i(),
      n(28, 'option', 10),
      l(29, 'Data'),
      i(),
      n(30, 'option', 11),
      l(31, 'DevOps'),
      i(),
      n(32, 'option', 12),
      l(33, 'Security'),
      i()()(),
      n(34, 'div', 22)(35, 'label'),
      l(36, 'Pricing'),
      i(),
      n(37, 'select', 23),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formPricing, r) || (s.formPricing = r), p(r);
      }),
      n(38, 'option', 26),
      l(39, 'Free'),
      i(),
      n(40, 'option', 27),
      l(41, 'Per Use'),
      i(),
      n(42, 'option', 28),
      l(43, 'Subscription'),
      i()()(),
      n(44, 'div', 29)(45, 'label'),
      l(46, 'Description'),
      i(),
      n(47, 'textarea', 30),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formDescription, r) || (s.formDescription = r), p(r);
      }),
      i()(),
      n(48, 'div', 29)(49, 'label'),
      l(50, 'Tags (comma-separated)'),
      i(),
      n(51, 'input', 31),
      h('ngModelChange', (r) => {
        m(e);
        const s = d();
        return x(s.formTags, r) || (s.formTags = r), p(r);
      }),
      i()()(),
      n(52, 'div', 32)(53, 'button', 33),
      _('click', () => {
        m(e);
        const r = d();
        return p(r.onCreate());
      }),
      l(54),
      i()()();
  }
  if (o & 2) {
    const e = d();
    c(7),
      u('ngModel', e.formAgentId),
      c(3),
      w(e.agentService.agents()),
      c(5),
      u('ngModel', e.formName),
      c(4),
      u('ngModel', e.formCategory),
      c(18),
      u('ngModel', e.formPricing),
      c(10),
      u('ngModel', e.formDescription),
      c(4),
      u('ngModel', e.formTags),
      c(2),
      b('disabled', e.creating() || !e.formName || !e.formAgentId),
      c(),
      y(' ', e.creating() ? 'Creating...' : 'Create Listing', ' ');
  }
}
function ht(o, _t) {
  o & 1 && O(0, 'app-skeleton', 16), o & 2 && b('count', 4);
}
function bt(o, _t) {
  o & 1 &&
    (n(0, 'div', 17)(1, 'p'),
    l(2, 'Marketplace service unavailable (503). The service may not be initialized yet.'),
    i()());
}
function yt(o, _t) {
  o & 1 && O(0, 'app-empty-state', 18);
}
function Mt(o, t) {
  if ((o & 1 && (n(0, 'span', 39), l(1), i()), o & 2)) {
    const e = t;
    V('data-level', e), c(), g(e);
  }
}
function St(o, t) {
  if ((o & 1 && (n(0, 'span', 49), l(1, '\u2605'), i()), o & 2)) {
    const e = t.$implicit,
      a = d().$implicit,
      r = d(2);
    P('star--filled', e <= r.Math.round(a.avgRating));
  }
}
function wt(o, t) {
  if ((o & 1 && (n(0, 'span', 50), l(1), i()), o & 2)) {
    const e = t.$implicit;
    c(), g(e);
  }
}
function Pt(o, _t) {
  if ((o & 1 && (n(0, 'div', 48), S(1, wt, 2, 1, 'span', 50, T), i()), o & 2)) {
    const e = d().$implicit;
    c(), w(e.tags);
  }
}
function kt(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 35),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(2);
        return p(s.selectListing(r));
      }),
      n(1, 'div', 36)(2, 'span', 37),
      l(3),
      i(),
      n(4, 'div', 38),
      C(5, Mt, 2, 2, 'span', 39),
      n(6, 'span', 40),
      l(7),
      i()()(),
      n(8, 'p', 41),
      l(9),
      i(),
      n(10, 'div', 42)(11, 'span', 43),
      S(12, St, 2, 2, 'span', 44, T),
      n(14, 'span', 45),
      l(15),
      i()(),
      n(16, 'span', 46),
      l(17),
      i(),
      n(18, 'span', 47),
      l(19),
      i()(),
      C(20, Pt, 3, 0, 'div', 48),
      i();
  }
  if (o & 2) {
    let e,
      a = t.$implicit,
      r = d(2);
    P('listing-card--selected', r.selectedId() === a.id),
      c(3),
      g(a.name),
      c(2),
      f((e = r.agentTrustLevels()[a.agentId]) ? 5 : -1, e),
      c(2),
      g(a.category),
      c(2),
      g(a.description),
      c(2),
      b('title', `${a.avgRating} / 5`),
      c(),
      w(I(11, le)),
      c(3),
      y('(', a.reviewCount, ')'),
      c(2),
      g(a.pricingModel === 'free' ? 'Free' : `${a.priceCredits} credits`),
      c(2),
      y('', a.useCount, ' uses'),
      c(),
      f(a.tags.length > 0 ? 20 : -1);
  }
}
function Et(o, _t) {
  if ((o & 1 && (n(0, 'div', 19), S(1, kt, 21, 12, 'div', 34, ce), i()), o & 2)) {
    const e = d();
    c(), w(e.marketplaceService.listings());
  }
}
function Ot(o, t) {
  if ((o & 1 && (n(0, 'span', 49), l(1, '\u2605'), i()), o & 2)) {
    const e = t.$implicit,
      a = d().$implicit,
      r = d(2);
    P('star--filled', e <= r.Math.round(a.avgRating));
  }
}
function Lt(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 53),
      _('click', () => {
        const r = m(e).$implicit,
          s = d(2);
        return p(s.selectListing(r));
      }),
      n(1, 'div', 36)(2, 'span', 37),
      l(3),
      i(),
      n(4, 'div', 38)(5, 'span', 54),
      l(6, 'External'),
      i(),
      n(7, 'span', 40),
      l(8),
      i()()(),
      n(9, 'p', 41),
      l(10),
      i(),
      n(11, 'div', 42)(12, 'span', 43),
      S(13, Ot, 2, 2, 'span', 44, T),
      n(15, 'span', 45),
      l(16),
      i()(),
      n(17, 'span', 46),
      l(18),
      i()()();
  }
  if (o & 2) {
    const e = t.$implicit,
      a = d(2);
    P('listing-card--selected', a.selectedId() === e.id),
      c(3),
      g(e.name),
      c(5),
      g(e.category),
      c(2),
      g(e.description),
      c(2),
      b('title', `${e.avgRating} / 5`),
      c(),
      w(I(8, le)),
      c(3),
      y('(', e.reviewCount, ')'),
      c(2),
      g(e.pricingModel === 'free' ? 'Free' : `${e.priceCredits} credits`);
  }
}
function Vt(o, _t) {
  if (
    (o & 1 && (n(0, 'h3', 51), l(1, 'Federated Listings'), i(), n(2, 'div', 19), S(3, Lt, 19, 9, 'div', 52, ce), i()),
    o & 2)
  ) {
    const e = d();
    c(3), w(e.federatedListings());
  }
}
function Tt(o, t) {
  if ((o & 1 && (n(0, 'span', 39), l(1), i()), o & 2)) {
    const e = t;
    V('data-level', e), c(), g(e);
  }
}
function It(o, t) {
  if ((o & 1 && (n(0, 'span', 74), l(1, '\u2605'), i()), o & 2)) {
    const e = t.$implicit,
      a = d(),
      r = d(2);
    P('star--filled', e <= r.Math.round(a.avgRating));
  }
}
function Nt(o, _t) {
  o & 1 && (n(0, 'p', 68), l(1, 'No reviews yet.'), i());
}
function Ft(o, t) {
  if ((o & 1 && (n(0, 'span', 49), l(1, '\u2605'), i()), o & 2)) {
    const e = t.$implicit,
      a = d().$implicit;
    P('star--filled', e <= a.rating);
  }
}
function At(o, t) {
  if (
    (o & 1 &&
      (n(0, 'div', 75)(1, 'div', 76)(2, 'span', 77),
      S(3, Ft, 2, 2, 'span', 44, T),
      i(),
      n(5, 'span', 78),
      l(6),
      A(7, 'relativeTime'),
      i()(),
      n(8, 'p', 79),
      l(9),
      i()()),
    o & 2)
  ) {
    const e = t.$implicit;
    c(3), w(I(4, le)), c(3), g(D(7, 2, e.createdAt)), c(3), g(e.comment);
  }
}
function Dt(o, _t) {
  if ((o & 1 && S(0, At, 10, 5, 'div', 75, ce), o & 2)) {
    const e = d(3);
    w(e.reviews());
  }
}
function Wt(o, t) {
  if (o & 1) {
    const e = M();
    n(0, 'div', 55)(1, 'div', 56)(2, 'div', 57)(3, 'h3'),
      l(4),
      i(),
      n(5, 'button', 58),
      _('click', () => {
        const r = m(e),
          s = d(2);
        return p(s.onDelete(r.id));
      }),
      l(6, 'Delete'),
      i()(),
      n(7, 'p'),
      l(8),
      i(),
      n(9, 'div', 59)(10, 'span'),
      l(11),
      i(),
      C(12, Tt, 2, 2, 'span', 39),
      i(),
      n(13, 'p', 60),
      l(14),
      A(15, 'relativeTime'),
      i()(),
      n(16, 'div', 61)(17, 'div', 62)(18, 'span', 63),
      l(19, 'Rating'),
      i(),
      n(20, 'span', 64),
      S(21, It, 2, 2, 'span', 65, T),
      i()(),
      n(23, 'div', 62)(24, 'span', 63),
      l(25, 'Uses'),
      i(),
      n(26, 'span', 66),
      l(27),
      i()(),
      n(28, 'div', 62)(29, 'span', 63),
      l(30, 'Price'),
      i(),
      n(31, 'span', 67),
      l(32),
      i()(),
      n(33, 'div', 62)(34, 'span', 63),
      l(35, 'Reviews'),
      i(),
      n(36, 'span', 66),
      l(37),
      i()()()(),
      n(38, 'h4'),
      l(39, 'Reviews'),
      i(),
      C(40, Nt, 2, 0, 'p', 68)(41, Dt, 2, 0),
      n(42, 'div', 69)(43, 'h4'),
      l(44, 'Leave a Review'),
      i(),
      n(45, 'div', 70)(46, 'select', 71),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(2);
        return x(s.reviewRating, r) || (s.reviewRating = r), p(r);
      }),
      n(47, 'option', 24),
      l(48, '5 stars'),
      i(),
      n(49, 'option', 24),
      l(50, '4 stars'),
      i(),
      n(51, 'option', 24),
      l(52, '3 stars'),
      i(),
      n(53, 'option', 24),
      l(54, '2 stars'),
      i(),
      n(55, 'option', 24),
      l(56, '1 star'),
      i()(),
      n(57, 'input', 72),
      h('ngModelChange', (r) => {
        m(e);
        const s = d(2);
        return x(s.reviewComment, r) || (s.reviewComment = r), p(r);
      }),
      i(),
      n(58, 'button', 73),
      _('click', () => {
        m(e);
        const r = d(2);
        return p(r.onReview());
      }),
      l(59, 'Submit'),
      i()()();
  }
  if (o & 2) {
    let e,
      a = t,
      r = d(2);
    c(4),
      g(a.name),
      c(4),
      g(a.description),
      c(3),
      y('Agent: ', r.getAgentName(a.agentId)),
      c(),
      f((e = r.agentTrustLevels()[a.agentId]) ? 12 : -1, e),
      c(2),
      y('Listed ', D(15, 17, a.createdAt)),
      c(7),
      w(I(19, le)),
      c(6),
      g(a.useCount),
      c(5),
      g(a.pricingModel === 'free' ? 'Free' : `${a.priceCredits} credits`),
      c(5),
      g(a.reviewCount),
      c(3),
      f(r.reviews().length === 0 ? 40 : 41),
      c(6),
      u('ngModel', r.reviewRating),
      c(),
      b('value', 5),
      c(2),
      b('value', 4),
      c(2),
      b('value', 3),
      c(2),
      b('value', 2),
      c(2),
      b('value', 1),
      c(2),
      u('ngModel', r.reviewComment),
      c(),
      b('disabled', !r.reviewComment);
  }
}
function Rt(o, _t) {
  if ((o & 1 && (n(0, 'div', 20), C(1, Wt, 60, 20), i()), o & 2)) {
    let e,
      a = d();
    c(), f((e = a.selectedListing()) ? 1 : -1, e);
  }
}
var ae = class o {
  marketplaceService = E(oe);
  agentService = E(X);
  reputationService = E(ue);
  notify = E(Z);
  showCreateForm = v(!1);
  creating = v(!1);
  loadError = v(!1);
  selectedId = v(null);
  selectedListing = v(null);
  reviews = v([]);
  federatedListings = v([]);
  agentTrustLevels = N(() => {
    const t = {};
    for (const e of this.reputationService.scores()) t[e.agentId] = e.trustLevel;
    return t;
  });
  Math = Math;
  searchQuery = '';
  categoryFilter = '';
  formAgentId = '';
  formName = '';
  formDescription = '';
  formCategory = 'general';
  formPricing = 'free';
  formTags = '';
  reviewRating = 5;
  reviewComment = '';
  agentNameCache = {};
  async ngOnInit() {
    await this.agentService.loadAgents();
    for (const t of this.agentService.agents()) this.agentNameCache[t.id] = t.name;
    try {
      await this.marketplaceService.getListings();
    } catch {
      this.loadError.set(!0);
    }
    try {
      await this.reputationService.loadScores();
    } catch {}
    try {
      const t = await this.marketplaceService.getFederatedListings();
      this.federatedListings.set(t);
    } catch {}
  }
  getAgentName(t) {
    return this.agentNameCache[t] ?? t.slice(0, 8);
  }
  async onSearch() {
    await this.marketplaceService.search({
      query: this.searchQuery || void 0,
      category: this.categoryFilter || void 0,
    });
  }
  async selectListing(t) {
    this.selectedId.set(t.id), this.selectedListing.set(t);
    try {
      const e = await this.marketplaceService.getReviews(t.id);
      this.reviews.set(e);
    } catch {
      this.reviews.set([]);
    }
  }
  async onCreate() {
    if (!(!this.formName || !this.formAgentId)) {
      this.creating.set(!0);
      try {
        await this.marketplaceService.createListing({
          agentId: this.formAgentId,
          name: this.formName,
          description: this.formDescription,
          category: this.formCategory,
          pricingModel: this.formPricing,
          tags: this.formTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
          (this.formName = ''),
          (this.formDescription = ''),
          (this.formTags = ''),
          (this.formAgentId = ''),
          this.showCreateForm.set(!1),
          this.notify.success('Listing created');
      } catch {
        this.notify.error('Failed to create listing');
      } finally {
        this.creating.set(!1);
      }
    }
  }
  async onDelete(t) {
    try {
      await this.marketplaceService.deleteListing(t),
        this.selectedId.set(null),
        this.selectedListing.set(null),
        this.notify.success('Listing deleted');
    } catch {
      this.notify.error('Failed to delete listing');
    }
  }
  async onReview() {
    const t = this.selectedId();
    if (!(!t || !this.reviewComment))
      try {
        await this.marketplaceService.createReview(t, {
          rating: Number(this.reviewRating),
          comment: this.reviewComment,
        }),
          (this.reviewComment = '');
        const e = await this.marketplaceService.getReviews(t);
        this.reviews.set(e), await this.marketplaceService.getListings(), this.notify.success('Review submitted');
      } catch {
        this.notify.error('Failed to submit review');
      }
  }
  static \u0275fac = (e) => new (e || o)();
  static \u0275cmp = L({
    type: o,
    selectors: [['app-marketplace']],
    decls: 34,
    vars: 7,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'create-btn', 3, 'click'],
      [1, 'search-bar'],
      ['placeholder', 'Search marketplace...', 1, 'search-input', 3, 'ngModelChange', 'keyup.enter', 'ngModel'],
      [1, 'filter-select', 3, 'ngModelChange', 'change', 'ngModel'],
      ['value', ''],
      ['value', 'coding'],
      ['value', 'research'],
      ['value', 'writing'],
      ['value', 'data'],
      ['value', 'devops'],
      ['value', 'security'],
      ['value', 'general'],
      [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click'],
      [1, 'create-form'],
      ['variant', 'card', 3, 'count'],
      [1, 'error-banner'],
      [
        'icon',
        `  [~~~]
  | @ |
  [~~~]`,
        'title',
        'No marketplace listings.',
        'description',
        'Share skill bundles and agent configurations with the community.',
        'actionLabel',
        '+ Create Listing',
        'actionAriaLabel',
        'Create your first marketplace listing',
      ],
      [1, 'listing-grid'],
      [1, 'detail-panel'],
      [1, 'form-grid'],
      [1, 'form-field'],
      [1, 'form-select', 3, 'ngModelChange', 'ngModel'],
      [3, 'value'],
      ['placeholder', 'Listing name', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      ['value', 'free'],
      ['value', 'per_use'],
      ['value', 'subscription'],
      [1, 'form-field', 'span-2'],
      ['rows', '2', 'placeholder', 'Short description...', 1, 'form-textarea', 3, 'ngModelChange', 'ngModel'],
      ['placeholder', 'typescript, review, testing', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'form-actions'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
      [1, 'listing-card', 3, 'listing-card--selected'],
      [1, 'listing-card', 3, 'click'],
      [1, 'listing-card__header'],
      [1, 'listing-card__name'],
      [1, 'listing-card__badges'],
      [1, 'trust-badge'],
      [1, 'listing-card__category'],
      [1, 'listing-card__desc'],
      [1, 'listing-card__meta'],
      [1, 'listing-card__stars', 3, 'title'],
      [1, 'star', 3, 'star--filled'],
      [1, 'listing-card__review-count'],
      [1, 'listing-card__price'],
      [1, 'listing-card__uses'],
      [1, 'listing-card__tags'],
      [1, 'star'],
      [1, 'tag'],
      [1, 'section-title'],
      [1, 'listing-card', 'listing-card--federated', 3, 'listing-card--selected'],
      [1, 'listing-card', 'listing-card--federated', 3, 'click'],
      [1, 'external-badge'],
      [1, 'detail-columns'],
      [1, 'detail-info'],
      [1, 'detail-panel__header'],
      [1, 'btn', 'btn--danger', 'btn--sm', 3, 'click'],
      [1, 'detail-agent'],
      [1, 'detail-time'],
      [1, 'detail-stats'],
      [1, 'stat-item'],
      [1, 'stat-label'],
      [1, 'stat-value', 'stat-value--rating'],
      [1, 'star', 'star--lg', 3, 'star--filled'],
      [1, 'stat-value'],
      [1, 'stat-value', 'stat-value--price'],
      [1, 'empty'],
      [1, 'review-form'],
      [1, 'review-form__fields'],
      [1, 'form-select', 'review-form__rating', 3, 'ngModelChange', 'ngModel'],
      ['placeholder', 'Your review...', 1, 'form-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click', 'disabled'],
      [1, 'star', 'star--lg'],
      [1, 'review-row'],
      [1, 'review-row__header'],
      [1, 'review-row__stars'],
      [1, 'review-row__time'],
      [1, 'review-row__comment'],
    ],
    template: (e, a) => {
      e & 1 &&
        (n(0, 'div', 0)(1, 'div', 1)(2, 'h2'),
        l(3, 'Marketplace'),
        i(),
        n(4, 'button', 2),
        _('click', () => a.showCreateForm.set(!a.showCreateForm())),
        l(5),
        i()(),
        n(6, 'div', 3)(7, 'input', 4),
        h('ngModelChange', (s) => (x(a.searchQuery, s) || (a.searchQuery = s), s)),
        _('keyup.enter', () => a.onSearch()),
        i(),
        n(8, 'select', 5),
        h('ngModelChange', (s) => (x(a.categoryFilter, s) || (a.categoryFilter = s), s)),
        _('change', () => a.onSearch()),
        n(9, 'option', 6),
        l(10, 'All Categories'),
        i(),
        n(11, 'option', 7),
        l(12, 'Coding'),
        i(),
        n(13, 'option', 8),
        l(14, 'Research'),
        i(),
        n(15, 'option', 9),
        l(16, 'Writing'),
        i(),
        n(17, 'option', 10),
        l(18, 'Data'),
        i(),
        n(19, 'option', 11),
        l(20, 'DevOps'),
        i(),
        n(21, 'option', 12),
        l(22, 'Security'),
        i(),
        n(23, 'option', 13),
        l(24, 'General'),
        i()(),
        n(25, 'button', 14),
        _('click', () => a.onSearch()),
        l(26, 'Search'),
        i()(),
        C(27, xt, 55, 8, 'div', 15),
        C(28, ht, 1, 1, 'app-skeleton', 16)(29, bt, 3, 0, 'div', 17)(30, yt, 1, 0, 'app-empty-state', 18)(
          31,
          Et,
          3,
          0,
          'div',
          19,
        ),
        C(32, Vt, 5, 0),
        C(33, Rt, 2, 1, 'div', 20),
        i()),
        e & 2 &&
          (c(5),
          y(' ', a.showCreateForm() ? 'Cancel' : '+ New Listing', ' '),
          c(2),
          u('ngModel', a.searchQuery),
          c(),
          u('ngModel', a.categoryFilter),
          c(19),
          f(a.showCreateForm() ? 27 : -1),
          c(),
          f(
            a.marketplaceService.loading()
              ? 28
              : a.loadError()
                ? 29
                : a.marketplaceService.listings().length === 0
                  ? 30
                  : 31,
          ),
          c(4),
          f(a.federatedListings().length > 0 ? 32 : -1),
          c(),
          f(a.selectedId() ? 33 : -1));
    },
    dependencies: [G, j, H, W, B, R, z, Q, K, ee],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.create-btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan);font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.search-bar[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:1.5rem;align-items:center}.search-input[_ngcontent-%COMP%]{flex:1;padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary)}.search-input[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.filter-select[_ngcontent-%COMP%]{padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary)}.loading[_ngcontent-%COMP%], .empty[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.85rem}.error-banner[_ngcontent-%COMP%]{background:var(--accent-red-dim);border:1px solid var(--accent-red);border-radius:var(--radius);padding:.75rem 1rem;margin-bottom:1rem}.error-banner[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{margin:0;color:var(--accent-red);font-size:.85rem}.create-form[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.5rem}.create-form[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 1rem;color:var(--text-primary)}.form-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.form-field[_ngcontent-%COMP%]   label[_ngcontent-%COMP%]{display:block;font-size:.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}.form-input[_ngcontent-%COMP%], .form-select[_ngcontent-%COMP%], .form-textarea[_ngcontent-%COMP%]{width:100%;padding:.5rem;border:1px solid var(--border-bright);border-radius:var(--radius);font-size:.85rem;font-family:inherit;background:var(--bg-input);color:var(--text-primary);box-sizing:border-box}.form-input[_ngcontent-%COMP%]:focus, .form-select[_ngcontent-%COMP%]:focus, .form-textarea[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.form-textarea[_ngcontent-%COMP%]{resize:vertical;min-height:3em;line-height:1.5}.span-2[_ngcontent-%COMP%]{grid-column:span 2}.form-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:1rem}.listing-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}.listing-card[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;cursor:pointer;transition:border-color .15s}.listing-card[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan)}.listing-card--selected[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--bg-raised)}.listing-card--federated[_ngcontent-%COMP%]{border-style:dashed}.listing-card__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;gap:.5rem}.listing-card__name[_ngcontent-%COMP%]{font-weight:600;color:var(--text-primary)}.listing-card__badges[_ngcontent-%COMP%]{display:flex;gap:.35rem;align-items:center;flex-shrink:0}.listing-card__category[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:var(--radius-sm);text-transform:uppercase;color:var(--accent-cyan);border:1px solid var(--accent-cyan)}.listing-card__desc[_ngcontent-%COMP%]{margin:.5rem 0;font-size:.8rem;color:var(--text-secondary)}.listing-card__meta[_ngcontent-%COMP%]{display:flex;gap:1rem;font-size:.75rem;color:var(--text-secondary);align-items:center}.listing-card__stars[_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:.1rem}.listing-card__review-count[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);margin-left:.2rem}.listing-card__price[_ngcontent-%COMP%]{color:var(--accent-green)}.listing-card__tags[_ngcontent-%COMP%]{display:flex;gap:.25rem;margin-top:.5rem;flex-wrap:wrap}.tag[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:var(--radius-sm);background:var(--bg-raised);color:var(--text-secondary);border:1px solid var(--border)}.star[_ngcontent-%COMP%]{color:var(--border);font-size:.85rem;line-height:1}.star--filled[_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107)}.star--lg[_ngcontent-%COMP%]{font-size:1.1rem}.trust-badge[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 5px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;background:var(--bg-raised);border:1px solid var(--border)}.trust-badge[data-level=verified][_ngcontent-%COMP%], .trust-badge[data-level=high][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green)}.trust-badge[data-level=medium][_ngcontent-%COMP%]{color:var(--accent-cyan);border-color:var(--accent-cyan)}.trust-badge[data-level=low][_ngcontent-%COMP%]{color:var(--accent-yellow, #ffc107);border-color:var(--accent-yellow, #ffc107)}.trust-badge[data-level=untrusted][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red)}.external-badge[_ngcontent-%COMP%]{font-size:.6rem;padding:1px 5px;border-radius:var(--radius-sm);font-weight:600;text-transform:uppercase;color:var(--accent-orange, #ff9100);border:1px solid var(--accent-orange, #ff9100);background:var(--bg-raised)}.section-title[_ngcontent-%COMP%]{margin:2rem 0 1rem;color:var(--text-primary);font-size:1rem}.detail-panel[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-top:1.5rem}.detail-columns[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr auto;gap:2rem}.detail-panel__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center}.detail-panel__header[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.detail-panel[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:1.5rem 0 .75rem;color:var(--text-primary)}.detail-agent[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--text-secondary);margin:.5rem 0}.detail-time[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.detail-stats[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem;min-width:140px}.stat-item[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.15rem}.stat-label[_ngcontent-%COMP%]{font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)}.stat-value[_ngcontent-%COMP%]{font-size:1rem;font-weight:600;color:var(--text-primary)}.stat-value--rating[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.1rem}.stat-value--price[_ngcontent-%COMP%]{color:var(--accent-green)}.review-row[_ngcontent-%COMP%]{border-bottom:1px solid var(--border);padding:.5rem 0}.review-row__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center}.review-row__stars[_ngcontent-%COMP%]{display:inline-flex;gap:.1rem}.review-row__time[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary)}.review-row__comment[_ngcontent-%COMP%]{margin:.25rem 0 0;font-size:.85rem;color:var(--text-primary)}.review-form[_ngcontent-%COMP%]{margin-top:1rem}.review-form[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{margin:0 0 .5rem}.review-form__fields[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center}.review-form__rating[_ngcontent-%COMP%]{width:auto;flex-shrink:0}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--sm[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.7rem}.btn--primary[_ngcontent-%COMP%]{border-color:var(--accent-cyan);background:var(--accent-cyan-dim);color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff26}.btn--primary[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red);border-color:var(--accent-red)}@media(max-width:767px){.form-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.span-2[_ngcontent-%COMP%]{grid-column:span 1}.listing-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.search-bar[_ngcontent-%COMP%]{flex-wrap:wrap}.detail-columns[_ngcontent-%COMP%]{grid-template-columns:1fr}}',
    ],
    changeDetection: 0,
  });
};
function zt(o, _t) {
  o & 1 && O(0, 'app-mcp-server-list');
}
function Bt(o, _t) {
  o & 1 && O(0, 'app-contact-list');
}
function jt(o, _t) {
  o & 1 && O(0, 'app-marketplace');
}
var be = class o {
  section = v('mcp');
  static \u0275fac = (e) => new (e || o)();
  static \u0275cmp = L({
    type: o,
    selectors: [['app-settings-integrations']],
    decls: 12,
    vars: 7,
    consts: [
      [1, 'settings-section'],
      ['role', 'tablist', 'aria-label', 'Integrations sections', 1, 'settings-section__nav'],
      ['role', 'tab', 1, 'settings-section__btn', 3, 'click'],
      [1, 'settings-section__content'],
    ],
    template: (e, a) => {
      if (
        (e & 1 &&
          (n(0, 'div', 0)(1, 'div', 1)(2, 'button', 2),
          _('click', () => a.section.set('mcp')),
          l(3, ' MCP Servers '),
          i(),
          n(4, 'button', 2),
          _('click', () => a.section.set('contacts')),
          l(5, ' Contacts '),
          i(),
          n(6, 'button', 2),
          _('click', () => a.section.set('marketplace')),
          l(7, ' Marketplace '),
          i()(),
          n(8, 'div', 3),
          C(9, zt, 1, 0, 'app-mcp-server-list')(10, Bt, 1, 0, 'app-contact-list')(11, jt, 1, 0, 'app-marketplace'),
          i()()),
        e & 2)
      ) {
        let r;
        c(2),
          P('settings-section__btn--active', a.section() === 'mcp'),
          c(2),
          P('settings-section__btn--active', a.section() === 'contacts'),
          c(2),
          P('settings-section__btn--active', a.section() === 'marketplace'),
          c(3),
          f((r = a.section()) === 'mcp' ? 9 : r === 'contacts' ? 10 : r === 'marketplace' ? 11 : -1);
      }
    },
    dependencies: [ne, re, ae],
    styles: [
      '.settings-section[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100%}.settings-section__nav[_ngcontent-%COMP%]{display:flex;gap:0;padding:0 1rem;border-bottom:1px solid var(--border-subtle);background:#0c0d1433;overflow-x:auto;scrollbar-width:none;flex-shrink:0}.settings-section__nav[_ngcontent-%COMP%]::-webkit-scrollbar{display:none}.settings-section__btn[_ngcontent-%COMP%]{padding:.5rem .85rem;font-size:.72rem;font-weight:600;font-family:inherit;letter-spacing:.03em;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s}.settings-section__btn[_ngcontent-%COMP%]:hover{color:var(--text-primary)}.settings-section__btn--active[_ngcontent-%COMP%]{color:var(--accent-cyan);border-bottom-color:var(--accent-cyan)}.settings-section__content[_ngcontent-%COMP%]{flex:1;overflow-y:auto}',
    ],
    changeDetection: 0,
  });
};

export { be as SettingsIntegrationsComponent };
