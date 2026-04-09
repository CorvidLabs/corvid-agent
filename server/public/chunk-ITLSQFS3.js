import { a as de } from './chunk-A4KCXO2Q.js';
import { a as ue } from './chunk-BSGHYIAC.js';
import { a as le } from './chunk-CSQXEU3M.js';
import { a as ce } from './chunk-CZZRTCER.js';
import { e as ae, h as re } from './chunk-G7DVZDMF.js';
import { d as oe } from './chunk-GH246MXO.js';
import { a as ge } from './chunk-J3PBVME7.js';
import { a as pe } from './chunk-N4BOLOM7.js';
import { a as $ } from './chunk-OFKXBWQC.js';
import { a as se } from './chunk-ZSTU6MUH.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  Rb as A,
  Ob as a,
  $b as B,
  Z as b,
  ja as C,
  Bb as c,
  mb as D,
  zb as E,
  Ab as ee,
  _a as F,
  Y as f,
  ub as G,
  jb as g,
  b as H,
  Qb as I,
  _b as ie,
  O as J,
  a as j,
  wb as K,
  nb as L,
  qb as l,
  vb as M,
  tb as m,
  ic as N,
  Xb as ne,
  Na as o,
  ob as P,
  ib as p,
  q as R,
  pb as r,
  fc as S,
  T,
  Nb as te,
  bc as U,
  Pb as u,
  Lb as V,
  sb as v,
  Mb as w,
  pa as X,
  rb as x,
  Ka as Y,
  hb as y,
  lb as Z,
} from './chunk-LF4EWAJA.js';

var z = class i extends se {
  apiPath = '/proposals';
  proposals = this.entities;
  activeVote = C(null);
  voteLoading = C(!1);
  async loadProposals(t) {
    this.loading.set(!0);
    try {
      const e = t ? `${this.apiPath}?councilId=${encodeURIComponent(t)}` : this.apiPath,
        n = await R(this.api.get(e));
      this.entities.set(n);
    } finally {
      this.loading.set(!1);
    }
  }
  async createProposal(t) {
    return this.create(t);
  }
  async updateProposal(t, e) {
    return this.update(t, e);
  }
  async deleteProposal(t) {
    return this.remove(t);
  }
  async transitionProposal(t, e, n) {
    const s = { status: e };
    n && (s.decision = n);
    const d = await R(this.api.post(`${this.apiPath}/${t}/transition`, s));
    return this.entities.update((_) => _.map((h) => (h.id === t ? d : h))), d;
  }
  async getVoteStatus(t) {
    this.voteLoading.set(!0);
    try {
      const e = await R(this.api.get(`/council-launches/${t}/vote`));
      return this.activeVote.set(e), e;
    } finally {
      this.voteLoading.set(!1);
    }
  }
  async refreshVoteStatus(t) {
    try {
      const e = await R(this.api.get(`/council-launches/${t}/vote`));
      this.activeVote.set(e);
    } catch {}
  }
  async castVote(t, e, n, s) {
    const d = { agentId: e, vote: n };
    s && (d.reason = s);
    const _ = await R(this.api.post(`/council-launches/${t}/vote`, d));
    return this.activeVote.update((h) => h && H(j({}, h), { evaluation: _.evaluation })), _;
  }
  async approveHuman(t, e) {
    const n = await R(this.api.post(`/council-launches/${t}/vote/approve`, { approvedBy: e }));
    this.activeVote.update(
      (s) => s && H(j({}, s), { humanApproved: !0, humanApprovedBy: e, evaluation: n.evaluation }),
    );
  }
  clearActiveVote() {
    this.activeVote.set(null);
  }
  static \u0275fac = (() => {
    let t;
    return (n) => (t || (t = X(i)))(n || i);
  })();
  static \u0275prov = J({ token: i, factory: i.\u0275fac, providedIn: 'root' });
};
var Q = {
  0: {
    tier: 0,
    label: 'Constitutional',
    description: 'Core system integrity \u2014 human-only commits',
    quorumThreshold: 1,
    requiresHumanApproval: !0,
    allowsAutomation: !1,
  },
  1: {
    tier: 1,
    label: 'Structural',
    description: 'System configuration \u2014 supermajority + human approval',
    quorumThreshold: 0.75,
    requiresHumanApproval: !0,
    allowsAutomation: !1,
  },
  2: {
    tier: 2,
    label: 'Operational',
    description: 'Day-to-day operations \u2014 council majority sufficient',
    quorumThreshold: 0.5,
    requiresHumanApproval: !1,
    allowsAutomation: !0,
  },
};
var xe = (_i, t) => t.agentId;
function fe(i, t) {
  if (
    (i & 1 &&
      (v(0, 'div', 16)(1, 'span', 21),
      a(2, '\u25CF'),
      m(),
      v(3, 'span', 22),
      a(4),
      m(),
      v(5, 'span', 23),
      a(6),
      m(),
      v(7, 'div', 24),
      G(8, 'div', 25),
      m(),
      v(9, 'span', 26),
      a(10),
      m()()),
    i & 2)
  ) {
    const e = t.$implicit,
      n = c(2);
    y('aria-label', `${n.getAgentName(e.agentId)} voted ${e.vote} with weight ${e.weight}`),
      o(),
      w('vote-row__indicator--cast', !0),
      o(2),
      V('color', n.agentColorMap()[e.agentId] ?? 'var(--text-primary)'),
      o(),
      I(' ', n.getAgentName(e.agentId), ' '),
      o(2),
      I('w:', e.weight),
      o(2),
      V('width', e.weight, '%'),
      y('data-vote', e.vote),
      o(),
      y('data-vote', e.vote),
      o(),
      I(' ', e.vote.toUpperCase(), ' ');
  }
}
function be(i, t) {
  if (
    (i & 1 &&
      (v(0, 'div', 17)(1, 'span', 21),
      a(2, '\u25CB'),
      m(),
      v(3, 'span', 27),
      a(4),
      m(),
      v(5, 'span', 23),
      a(6, 'w:--'),
      m(),
      v(7, 'div', 24),
      G(8, 'div', 28),
      m(),
      v(9, 'span', 29),
      a(10, 'PENDING'),
      m()()),
    i & 2)
  ) {
    const e = t.$implicit,
      n = c(2);
    y('aria-label', `${n.getAgentName(e)} has not voted yet`), o(4), u(n.getAgentName(e));
  }
}
function ye(i, _t) {
  if ((i & 1 && (v(0, 'span'), a(1, '|'), m(), v(2, 'span'), a(3), m()), i & 2)) {
    const e = c();
    o(2),
      w('vote-panel__human--met', e.humanApproved)('vote-panel__human--pending', !e.humanApproved),
      o(),
      I(' Human approval: ', e.humanApproved ? 'GRANTED' : 'REQUIRED', ' ');
  }
}
function we(i, _t) {
  if (i & 1) {
    const e = M();
    v(0, 'div', 19)(1, 'button', 30),
      ee('click', () => {
        f(e);
        const s = c(2);
        return b(s.onApproveHuman());
      }),
      a(2),
      m()();
  }
  if (i & 2) {
    const e = c(2);
    o(), K('disabled', e.approving()), o(), I(' ', e.approving() ? 'APPROVING...' : 'APPROVE (HUMAN)', ' ');
  }
}
function Se(i, _t) {
  if ((i & 1 && (v(0, 'div', 20), a(1), m()), i & 2)) {
    const e = c();
    y('data-status', e.status), o(), I(' ', e.evaluation.reason, ' ');
  }
}
function Me(i, t) {
  if (
    (i & 1 &&
      (v(0, 'div', 2)(1, 'div', 3)(2, 'span', 4),
      a(3, '\u25C6'),
      m(),
      v(4, 'span', 5),
      a(5, 'GOVERNANCE VOTE'),
      m(),
      v(6, 'span', 6),
      a(7),
      m()(),
      v(8, 'div', 7)(9, 'span', 8),
      a(10),
      m(),
      v(11, 'span', 9),
      a(12),
      m()(),
      v(13, 'div', 10),
      G(14, 'div', 11)(15, 'div', 12),
      v(16, 'span', 13),
      a(17),
      m()(),
      v(18, 'div', 14)(19, 'div', 15),
      a(20),
      m(),
      D(21, fe, 11, 12, 'div', 16, xe),
      D(23, be, 11, 2, 'div', 17, Z),
      m(),
      v(25, 'div', 18)(26, 'span'),
      a(27),
      m(),
      v(28, 'span'),
      a(29, '|'),
      m(),
      v(30, 'span'),
      a(31),
      m(),
      p(32, ye, 4, 5),
      m(),
      p(33, we, 3, 2, 'div', 19),
      p(34, Se, 2, 2, 'div', 20),
      m()),
    i & 2)
  ) {
    const e = t,
      n = c();
    w('vote-panel--resolved', n.isResolved()),
      o(6),
      y('data-tier', e.governanceTier)('aria-label', `${n.tierInfo().label}: ${n.tierInfo().description}`),
      o(),
      A(' Tier: ', n.tierInfo().label, ' (Layer ', e.governanceTier, ') '),
      o(2),
      y('data-status', e.status),
      o(),
      I(' Status: ', n.statusLabel(), ' '),
      o(2),
      I(' Quorum: ', (e.evaluation.requiredThreshold * 100).toFixed(0), '% '),
      o(),
      y('aria-valuenow', (e.evaluation.weightedApprovalRatio * 100).toFixed(0))(
        'aria-label',
        'Approval progress: ' +
          (e.evaluation.weightedApprovalRatio * 100).toFixed(0) +
          '% of ' +
          (e.evaluation.requiredThreshold * 100).toFixed(0) +
          '% required',
      ),
      o(),
      V('width', n.Math.min(e.evaluation.weightedApprovalRatio * 100, 100), '%'),
      o(),
      V('left', e.evaluation.requiredThreshold * 100, '%'),
      o(2),
      A(
        ' ',
        (e.evaluation.weightedApprovalRatio * 100).toFixed(1),
        '% / ',
        (e.evaluation.requiredThreshold * 100).toFixed(0),
        '% ',
      ),
      o(3),
      A(' VOTES (', n.votesCast(), '/', e.totalMembers, ' cast) '),
      o(),
      L(n.sortedVotes()),
      o(2),
      L(n.pendingAgents()),
      o(4),
      I('Weighted ratio: ', (e.evaluation.weightedApprovalRatio * 100).toFixed(1), '%'),
      o(4),
      I('Unweighted: ', (e.evaluation.approvalRatio * 100).toFixed(1), '%'),
      o(),
      g(n.tierInfo().requiresHumanApproval ? 32 : -1),
      o(),
      g(e.evaluation.awaitingHumanApproval && !e.humanApproved ? 33 : -1),
      o(),
      g(n.isResolved() ? 34 : -1);
  }
}
function Pe(i, _t) {
  i & 1 && (v(0, 'div', 1)(1, 'span', 4), a(2, '\u25C6'), m(), v(3, 'span'), a(4, 'Loading governance vote...'), m()());
}
var q = class i {
  Math = Math;
  launchId = N.required();
  agentNames = N({});
  agentColors = N({});
  councilAgentIds = N([]);
  governanceService = T(z);
  wsService = T($);
  notifications = T(le);
  approving = C(!1);
  unsubscribeWs = null;
  voteStatus = S(() => this.governanceService.activeVote());
  tierInfo = S(() => {
    const e = this.voteStatus()?.governanceTier ?? 2;
    return Q[e] ?? Q[2];
  });
  statusLabel = S(() => {
    const t = this.voteStatus();
    return t
      ? ({
          pending: 'AWAITING VOTES',
          approved: 'APPROVED',
          rejected: 'REJECTED',
          expired: 'EXPIRED',
          awaiting_human: 'AWAITING HUMAN APPROVAL',
        }[t.status] ?? t.status.toUpperCase())
      : '';
  });
  isResolved = S(() => {
    const t = this.voteStatus()?.status;
    return t === 'approved' || t === 'rejected';
  });
  votesCast = S(() => this.voteStatus()?.votes.length ?? 0);
  sortedVotes = S(() => [...(this.voteStatus()?.votes ?? [])].sort((e, n) => n.weight - e.weight));
  pendingAgents = S(() => {
    const t = this.voteStatus();
    if (!t) return [];
    const e = new Set(t.votes.map((n) => n.agentId));
    return this.councilAgentIds().filter((n) => !e.has(n));
  });
  agentColorMap = S(() => this.agentColors());
  async ngOnInit() {
    await this.governanceService.refreshVoteStatus(this.launchId()),
      (this.unsubscribeWs = this.wsService.onMessage((t) => {
        t.type === 'governance_vote_cast' &&
          'launchId' in t &&
          t.launchId === this.launchId() &&
          this.governanceService.refreshVoteStatus(this.launchId()),
          t.type === 'governance_vote_resolved' &&
            'launchId' in t &&
            t.launchId === this.launchId() &&
            this.governanceService.refreshVoteStatus(this.launchId());
      }));
  }
  ngOnDestroy() {
    this.unsubscribeWs?.(), this.governanceService.clearActiveVote();
  }
  getAgentName(t) {
    return t ? (this.agentNames()[t] ?? t) : 'Unknown';
  }
  async onApproveHuman() {
    this.approving.set(!0);
    try {
      await this.governanceService.approveHuman(this.launchId(), 'owner'),
        this.notifications.success('Human approval granted'),
        await this.governanceService.refreshVoteStatus(this.launchId());
    } catch {
      this.notifications.error('Failed to grant human approval');
    } finally {
      this.approving.set(!1);
    }
  }
  static \u0275fac = (e) => new (e || i)();
  static \u0275cmp = F({
    type: i,
    selectors: [['app-governance-vote-panel']],
    inputs: {
      launchId: [1, 'launchId'],
      agentNames: [1, 'agentNames'],
      agentColors: [1, 'agentColors'],
      councilAgentIds: [1, 'councilAgentIds'],
    },
    decls: 2,
    vars: 1,
    consts: [
      [1, 'vote-panel', 3, 'vote-panel--resolved'],
      [1, 'vote-panel', 'vote-panel--loading'],
      [1, 'vote-panel'],
      [1, 'vote-panel__header'],
      ['aria-hidden', 'true', 1, 'vote-panel__icon'],
      [1, 'vote-panel__title'],
      [1, 'vote-panel__tier'],
      [1, 'vote-panel__status-row'],
      ['role', 'status', 1, 'vote-panel__status'],
      [1, 'vote-panel__quorum'],
      ['role', 'progressbar', 'aria-valuemin', '0', 'aria-valuemax', '100', 1, 'progress-container'],
      [1, 'progress-bar'],
      ['aria-hidden', 'true', 1, 'progress-threshold'],
      [1, 'progress-label'],
      ['role', 'list', 'aria-label', 'Council votes', 1, 'vote-list'],
      [1, 'vote-list__header'],
      ['role', 'listitem', 1, 'vote-row'],
      ['role', 'listitem', 1, 'vote-row', 'vote-row--pending'],
      [1, 'vote-panel__ratios'],
      [1, 'vote-panel__human-action'],
      ['role', 'status', 'aria-live', 'assertive', 1, 'vote-panel__resolution'],
      ['aria-hidden', 'true', 1, 'vote-row__indicator'],
      [1, 'vote-row__name'],
      [1, 'vote-row__weight'],
      [1, 'vote-row__bar'],
      [1, 'vote-row__bar-fill'],
      [1, 'vote-row__badge'],
      [1, 'vote-row__name', 'vote-row__name--pending'],
      [1, 'vote-row__bar-fill', 'vote-row__bar-fill--pending'],
      [1, 'vote-row__badge', 'vote-row__badge--pending'],
      [1, 'btn', 'btn--primary', 3, 'click', 'disabled'],
    ],
    template: (e, n) => {
      if ((e & 1 && p(0, Me, 35, 24, 'div', 0)(1, Pe, 5, 0, 'div', 1), e & 2)) {
        let s;
        g((s = n.voteStatus()) ? 0 : n.governanceService.voteLoading() ? 1 : -1, s);
      }
    },
    styles: [
      '.vote-panel[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem 1.25rem;margin:1rem 0}.vote-panel--resolved[_ngcontent-%COMP%]{border-color:var(--border-bright)}.vote-panel--loading[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;color:var(--text-secondary);font-size:var(--text-sm)}.vote-panel__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem}.vote-panel__icon[_ngcontent-%COMP%]{color:var(--accent-amber);font-size:.7rem}.vote-panel__title[_ngcontent-%COMP%]{font-size:var(--text-sm);font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-primary)}.vote-panel__tier[_ngcontent-%COMP%]{margin-left:auto;font-size:var(--text-xs);color:var(--text-secondary)}.vote-panel__status-row[_ngcontent-%COMP%]{display:flex;justify-content:space-between;margin-bottom:.75rem;font-size:var(--text-sm);color:var(--text-secondary)}.vote-panel__status[data-status=approved][_ngcontent-%COMP%]{color:var(--accent-green)}.vote-panel__status[data-status=rejected][_ngcontent-%COMP%]{color:var(--accent-red)}.vote-panel__status[data-status=awaiting_human][_ngcontent-%COMP%]{color:var(--accent-amber)}.vote-panel__status[data-status=pending][_ngcontent-%COMP%]{color:var(--accent-cyan)}.progress-container[_ngcontent-%COMP%]{position:relative;height:1.25rem;background:var(--bg-input);border-radius:var(--radius);margin-bottom:.75rem;overflow:visible}.progress-bar[_ngcontent-%COMP%]{height:100%;background:var(--accent-green);border-radius:var(--radius);transition:width var(--transition-slow);min-width:0}.progress-threshold[_ngcontent-%COMP%]{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--accent-amber);z-index:1}.progress-label[_ngcontent-%COMP%]{position:absolute;right:.5rem;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--text-primary);font-weight:600;z-index:2}.vote-list[_ngcontent-%COMP%]{background:var(--bg-deep);border-radius:var(--radius);padding:.5rem .75rem;margin-bottom:.75rem}.vote-list__header[_ngcontent-%COMP%]{font-size:var(--text-xs);color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem;font-weight:600}.vote-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.25rem 0;font-size:var(--text-sm)}.vote-row--pending[_ngcontent-%COMP%]{opacity:.5}.vote-row__indicator[_ngcontent-%COMP%]{font-size:.5rem;flex-shrink:0}.vote-row__indicator--cast[_ngcontent-%COMP%]{color:var(--accent-green)}.vote-row__name[_ngcontent-%COMP%]{min-width:80px;font-weight:600}.vote-row__name--pending[_ngcontent-%COMP%]{color:var(--text-tertiary)}.vote-row__weight[_ngcontent-%COMP%]{font-size:var(--text-xs);color:var(--text-secondary);min-width:32px;text-align:right}.vote-row__bar[_ngcontent-%COMP%]{flex:1;height:6px;background:var(--bg-surface);border-radius:3px;overflow:hidden}.vote-row__bar-fill[_ngcontent-%COMP%]{height:100%;border-radius:3px;transition:width var(--transition-slow)}.vote-row__bar-fill[data-vote=approve][_ngcontent-%COMP%]{background:var(--accent-green)}.vote-row__bar-fill[data-vote=reject][_ngcontent-%COMP%]{background:var(--accent-red)}.vote-row__bar-fill[data-vote=abstain][_ngcontent-%COMP%]{background:var(--text-secondary)}.vote-row__bar-fill--pending[_ngcontent-%COMP%]{width:0}.vote-row__badge[_ngcontent-%COMP%]{font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.04em;min-width:56px;text-align:center}.vote-row__badge[data-vote=approve][_ngcontent-%COMP%]{color:var(--accent-green)}.vote-row__badge[data-vote=reject][_ngcontent-%COMP%]{color:var(--accent-red)}.vote-row__badge[data-vote=abstain][_ngcontent-%COMP%]{color:var(--text-secondary)}.vote-row__badge--pending[_ngcontent-%COMP%]{color:var(--text-tertiary)}.vote-panel__ratios[_ngcontent-%COMP%]{display:flex;gap:.5rem;flex-wrap:wrap;font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:.5rem}.vote-panel__human--met[_ngcontent-%COMP%]{color:var(--accent-green)}.vote-panel__human--pending[_ngcontent-%COMP%]{color:var(--accent-amber)}.vote-panel__human-action[_ngcontent-%COMP%]{margin-top:.75rem;display:flex;justify-content:center}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--primary[_ngcontent-%COMP%]{background:transparent;color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn[_ngcontent-%COMP%]:disabled{opacity:.3;cursor:not-allowed}.vote-panel__resolution[_ngcontent-%COMP%]{margin-top:.5rem;padding:.5rem .75rem;border-radius:var(--radius);font-size:var(--text-sm);font-weight:600;border:1px solid}.vote-panel__resolution[data-status=approved][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green-dim);background:var(--accent-green-dim)}.vote-panel__resolution[data-status=rejected][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red-dim);background:var(--accent-red-dim)}.vote-panel__resolution[data-status=awaiting_human][_ngcontent-%COMP%]{color:var(--accent-amber);border-color:#ffaa0026;background:#ffaa001a}',
    ],
    changeDetection: 0,
  });
};
var Ee = (i) => ['/sessions/councils', i],
  W = (_i, t) => t.id,
  ve = (_i, t) => t.ts;
function Ie(i, _t) {
  i & 1 && (r(0, 'span', 10), a(1, 'Auto-advancing to discussion...'), l());
}
function Ve(i, _t) {
  if (i & 1) {
    const e = M();
    p(0, Ie, 2, 0, 'span', 10),
      r(1, 'button', 18),
      E('click', () => {
        f(e);
        const s = c(2);
        return b(s.onStartReview());
      }),
      a(2),
      l();
  }
  if (i & 2) {
    const e = c(2);
    g(e.allMembersDone() ? 0 : -1),
      o(),
      P('disabled', !e.allMembersDone() || e.triggeringReview()),
      o(),
      u(e.triggeringReview() ? 'Starting...' : 'Skip Discussion & Start Review');
  }
}
function Oe(i, _t) {
  if ((i & 1 && (r(0, 'span', 10), a(1), l()), i & 2)) {
    const e = c();
    o(), A(' Agents are discussing... (Round ', e.currentDiscussionRound, '/', e.totalDiscussionRounds, ') ');
  }
}
function ke(i, _t) {
  i & 1 && (r(0, 'span', 10), a(1, 'Auto-advancing to synthesis...'), l());
}
function Te(i, _t) {
  if (i & 1) {
    const e = M();
    p(0, ke, 2, 0, 'span', 10),
      r(1, 'button', 18),
      E('click', () => {
        f(e);
        const s = c(2);
        return b(s.onSynthesize());
      }),
      a(2),
      l();
  }
  if (i & 2) {
    const e = c(2);
    g(e.allReviewsDone() ? 0 : -1),
      o(),
      P('disabled', !e.allReviewsDone() || e.triggeringSynthesis()),
      o(),
      u(e.triggeringSynthesis() ? 'Starting...' : 'Synthesize Now');
  }
}
function De(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'button', 19),
      E('click', () => {
        f(e);
        const s = c(2);
        return b(s.onAbort());
      }),
      a(1),
      l();
  }
  if (i & 2) {
    const e = c(2);
    P('disabled', e.aborting()), o(), u(e.aborting() ? 'Ending...' : 'End Council');
  }
}
function Le(i, _t) {
  if ((i & 1 && (r(0, 'span', 26), a(1), l()), i & 2)) {
    const e = c().$implicit;
    o(), u(e.detail);
  }
}
function Ae(i, t) {
  if (
    (i & 1 &&
      (r(0, 'div', 22)(1, 'span', 23),
      a(2),
      B(3, 'date'),
      l(),
      r(4, 'span', 24),
      a(5),
      l(),
      r(6, 'span', 25),
      a(7),
      l(),
      p(8, Le, 2, 1, 'span', 26),
      l()),
    i & 2)
  ) {
    const e = t.$implicit;
    te(`log-entry--${e.level}`),
      o(2),
      u(U(3, 6, e.createdAt, 'HH:mm:ss')),
      o(3),
      u(e.level),
      o(2),
      u(e.message),
      o(),
      g(e.detail ? 8 : -1);
  }
}
function Re(i, _t) {
  i & 1 && (r(0, 'div', 21), a(1, 'No log entries yet'), l());
}
function Ne(i, _t) {
  if ((i & 1 && (r(0, 'div', 13), D(1, Ae, 9, 9, 'div', 20, W, !1, Re, 2, 0, 'div', 21), l()), i & 2)) {
    const e = c(2);
    o(), L(e.logs());
  }
}
function Fe(i, _t) {
  i & 1 && x(0, 'span', 29);
}
function Ge(i, _t) {
  i & 1 && x(0, 'span', 30);
}
function $e(i, _t) {
  if ((i & 1 && (r(0, 'span', 33), a(1), l()), i & 2)) {
    const e = c().$implicit,
      n = c(2);
    o(), u(e.status === 'running' ? n.getActivity(e.agentId) || 'Waiting...' : n.getPreviewText(e.id));
  }
}
function ze(i, t) {
  if ((i & 1 && (r(0, 'div', 39)(1, 'span', 23), a(2), l(), r(3, 'span'), a(4), l()()), i & 2)) {
    const e = t.$implicit;
    o(2), u(e.time), o(2), u(e.text);
  }
}
function qe(i, _t) {
  if ((i & 1 && (x(0, 'span', 30), r(1, 'span'), a(2), l()), i & 2)) {
    const e = c(4).$implicit,
      n = c(2);
    o(2), u(n.getActivity(e.agentId) || 'Queued \u2014 waiting for model slot...');
  }
}
function We(i, _t) {
  if ((i & 1 && (x(0, 'span', 29), r(1, 'span'), a(2), l()), i & 2)) {
    const e = c(4).$implicit,
      n = c(2);
    o(2), u(n.getActivity(e.agentId) || 'Waiting for model...');
  }
}
function je(i, _t) {
  if ((i & 1 && (r(0, 'div', 39), p(1, qe, 3, 1)(2, We, 3, 1), l()), i & 2)) {
    const e = c(3).$implicit,
      n = c(2);
    o(), g(n.getDisplayStatus(e) === 'queued' ? 1 : 2);
  }
}
function He(i, _t) {
  if ((i & 1 && (r(0, 'div', 37), D(1, ze, 5, 2, 'div', 39, ve, !1, je, 3, 1, 'div', 39), l()), i & 2)) {
    const e = c(2).$implicit,
      n = c(2);
    o(), L(n.getEventLog(e.id));
  }
}
function Be(i, _t) {
  if ((i & 1 && x(0, 'app-session-output', 38), i & 2)) {
    const e = c(2).$implicit,
      n = c(2);
    P('messages', n.getMessages(e.id))('events', n.getEvents(e.id))('isRunning', !1);
  }
}
function Ue(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 36),
      E('click', (s) => (f(e), b(s.stopPropagation()))),
      p(1, He, 4, 1, 'div', 37)(2, Be, 1, 3, 'app-session-output', 38),
      l();
  }
  if (i & 2) {
    const e = c().$implicit;
    o(), g(e.status === 'running' ? 1 : 2);
  }
}
function Qe(i, t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 27),
      E('click', () => {
        const s = f(e).$implicit,
          d = c(2);
        return b(d.toggleSession(s.id));
      })('keydown.enter', () => {
        const s = f(e).$implicit,
          d = c(2);
        return b(d.toggleSession(s.id));
      })('keydown.space', (s) => {
        const d = f(e).$implicit,
          _ = c(2);
        return s.preventDefault(), b(_.toggleSession(d.id));
      }),
      r(1, 'div', 28),
      p(2, Fe, 1, 0, 'span', 29),
      p(3, Ge, 1, 0, 'span', 30),
      r(4, 'span', 31),
      a(5),
      l(),
      x(6, 'app-status-badge', 32),
      p(7, $e, 2, 1, 'span', 33),
      r(8, 'span', 34),
      a(9),
      l()(),
      p(10, Ue, 3, 1, 'div', 35),
      l();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = c(2);
    V('border-left-color', n.agentColor(e.agentId)),
      w('feed-entry--expanded', n.expandedSessions().has(e.id)),
      y('aria-expanded', n.expandedSessions().has(e.id)),
      o(2),
      g(e.status === 'running' && n.getDisplayStatus(e) !== 'queued' ? 2 : -1),
      o(),
      g(n.getDisplayStatus(e) === 'queued' ? 3 : -1),
      o(),
      V('color', n.agentColor(e.agentId)),
      o(),
      u(n.getAgentName(e.agentId)),
      o(),
      P('status', n.getDisplayStatus(e)),
      o(),
      g(n.expandedSessions().has(e.id) ? -1 : 7),
      o(2),
      u(n.expandedSessions().has(e.id) ? '\u25BE' : '\u25B8'),
      o(),
      g(n.expandedSessions().has(e.id) ? 10 : -1);
  }
}
function Je(i, _t) {
  if ((i & 1 && (r(0, 'div', 40), x(1, 'span', 29), r(2, 'span'), a(3), l()()), i & 2)) {
    const e = c(2);
    o(3), A('Agents are discussing... (Round ', e.currentDiscussionRound, '/', e.totalDiscussionRounds, ')');
  }
}
function Xe(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'a', 46), E('click', (s) => (f(e), b(s.stopPropagation()))), a(1, 'tx'), l();
  }
  if (i & 2) {
    const e = c().$implicit,
      n = c(3);
    P('href', ne('https://lora.algokit.io/', n.explorerNetwork(), '/transaction/', e.txid), Y);
  }
}
function Ye(i, _t) {
  if ((i & 1 && (r(0, 'span', 33), a(1), l()), i & 2)) {
    const e = c().$implicit,
      n = c(3);
    o(), u(n.previewText(e.content));
  }
}
function Ze(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'pre', 47), E('click', (s) => (f(e), b(s.stopPropagation()))), a(1), l();
  }
  if (i & 2) {
    const e = c().$implicit;
    o(), u(e.content);
  }
}
function Ke(i, t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 27),
      E('click', () => {
        const s = f(e).$implicit,
          d = c(3);
        return b(d.toggleDiscussion(s.id));
      })('keydown.enter', () => {
        const s = f(e).$implicit,
          d = c(3);
        return b(d.toggleDiscussion(s.id));
      })('keydown.space', (s) => {
        const d = f(e).$implicit,
          _ = c(3);
        return s.preventDefault(), b(_.toggleDiscussion(d.id));
      }),
      r(1, 'div', 28)(2, 'span', 31),
      a(3),
      l(),
      r(4, 'span', 42),
      a(5),
      l(),
      r(6, 'span', 43),
      a(7),
      B(8, 'date'),
      l(),
      p(9, Xe, 2, 3, 'a', 44),
      p(10, Ye, 2, 1, 'span', 33),
      r(11, 'span', 34),
      a(12),
      l()(),
      p(13, Ze, 2, 1, 'pre', 45),
      l();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = c(3);
    V('border-left-color', n.agentColor(e.agentName)),
      w('feed-entry--expanded', n.expandedDiscussion().has(e.id)),
      y('aria-expanded', n.expandedDiscussion().has(e.id)),
      o(2),
      V('color', n.agentColor(e.agentName)),
      o(),
      u(e.agentName),
      o(2),
      I('R', e.round),
      o(2),
      u(U(8, 14, e.createdAt, 'HH:mm:ss')),
      o(2),
      g(e.txid ? 9 : -1),
      o(),
      g(n.expandedDiscussion().has(e.id) ? -1 : 10),
      o(2),
      u(n.expandedDiscussion().has(e.id) ? '\u25BE' : '\u25B8'),
      o(),
      g(n.expandedDiscussion().has(e.id) ? 13 : -1);
  }
}
function et(i, _t) {
  i & 1 && (r(0, 'div', 48), a(1, 'No discussion messages yet.'), l());
}
function tt(i, _t) {
  if ((i & 1 && p(0, et, 2, 0, 'div', 48), i & 2)) {
    const e = c(2);
    g(e.stage !== 'discussing' ? 0 : -1);
  }
}
function nt(i, _t) {
  if (
    (i & 1 &&
      (r(0, 'h3', 14),
      a(1, 'Discussion'),
      l(),
      p(2, Je, 4, 2, 'div', 40),
      r(3, 'div', 41),
      D(4, Ke, 14, 17, 'div', 16, W, !1, tt, 1, 1),
      l()),
    i & 2)
  ) {
    const e = c(),
      n = c();
    o(2), g(e.stage === 'discussing' ? 2 : -1), o(2), L(n.discussionMessages());
  }
}
function it(i, _t) {
  i & 1 && x(0, 'span', 29);
}
function ot(i, _t) {
  i & 1 && x(0, 'span', 30);
}
function at(i, _t) {
  if ((i & 1 && (r(0, 'span', 33), a(1), l()), i & 2)) {
    const e = c().$implicit,
      n = c(3);
    o(), u(e.status === 'running' ? n.getActivity(e.agentId) || 'Waiting...' : n.getPreviewText(e.id));
  }
}
function rt(i, t) {
  if ((i & 1 && (r(0, 'div', 39)(1, 'span', 23), a(2), l(), r(3, 'span'), a(4), l()()), i & 2)) {
    const e = t.$implicit;
    o(2), u(e.time), o(2), u(e.text);
  }
}
function st(i, _t) {
  if ((i & 1 && (x(0, 'span', 30), r(1, 'span'), a(2), l()), i & 2)) {
    const e = c(4).$implicit,
      n = c(3);
    o(2), u(n.getActivity(e.agentId) || 'Queued \u2014 waiting for model slot...');
  }
}
function ct(i, _t) {
  if ((i & 1 && (x(0, 'span', 29), r(1, 'span'), a(2), l()), i & 2)) {
    const e = c(4).$implicit,
      n = c(3);
    o(2), u(n.getActivity(e.agentId) || 'Waiting for model...');
  }
}
function lt(i, _t) {
  if ((i & 1 && (r(0, 'div', 39), p(1, st, 3, 1)(2, ct, 3, 1), l()), i & 2)) {
    const e = c(3).$implicit,
      n = c(3);
    o(), g(n.getDisplayStatus(e) === 'queued' ? 1 : 2);
  }
}
function dt(i, _t) {
  if ((i & 1 && (r(0, 'div', 37), D(1, rt, 5, 2, 'div', 39, ve, !1, lt, 3, 1, 'div', 39), l()), i & 2)) {
    const e = c(2).$implicit,
      n = c(3);
    o(), L(n.getEventLog(e.id));
  }
}
function pt(i, _t) {
  if ((i & 1 && x(0, 'app-session-output', 38), i & 2)) {
    const e = c(2).$implicit,
      n = c(3);
    P('messages', n.getMessages(e.id))('events', n.getEvents(e.id))('isRunning', !1);
  }
}
function gt(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 36),
      E('click', (s) => (f(e), b(s.stopPropagation()))),
      p(1, dt, 4, 1, 'div', 37)(2, pt, 1, 3, 'app-session-output', 38),
      l();
  }
  if (i & 2) {
    const e = c().$implicit;
    o(), g(e.status === 'running' ? 1 : 2);
  }
}
function ut(i, t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 27),
      E('click', () => {
        const s = f(e).$implicit,
          d = c(3);
        return b(d.toggleSession(s.id));
      })('keydown.enter', () => {
        const s = f(e).$implicit,
          d = c(3);
        return b(d.toggleSession(s.id));
      })('keydown.space', (s) => {
        const d = f(e).$implicit,
          _ = c(3);
        return s.preventDefault(), b(_.toggleSession(d.id));
      }),
      r(1, 'div', 28),
      p(2, it, 1, 0, 'span', 29),
      p(3, ot, 1, 0, 'span', 30),
      r(4, 'span', 31),
      a(5),
      l(),
      x(6, 'app-status-badge', 32),
      p(7, at, 2, 1, 'span', 33),
      r(8, 'span', 34),
      a(9),
      l()(),
      p(10, gt, 3, 1, 'div', 35),
      l();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = c(3);
    V('border-left-color', n.agentColor(e.agentId)),
      w('feed-entry--expanded', n.expandedSessions().has(e.id)),
      y('aria-expanded', n.expandedSessions().has(e.id)),
      o(2),
      g(e.status === 'running' && n.getDisplayStatus(e) !== 'queued' ? 2 : -1),
      o(),
      g(n.getDisplayStatus(e) === 'queued' ? 3 : -1),
      o(),
      V('color', n.agentColor(e.agentId)),
      o(),
      u(n.getAgentName(e.agentId)),
      o(),
      P('status', n.getDisplayStatus(e)),
      o(),
      g(n.expandedSessions().has(e.id) ? -1 : 7),
      o(2),
      u(n.expandedSessions().has(e.id) ? '\u25BE' : '\u25B8'),
      o(),
      g(n.expandedSessions().has(e.id) ? 10 : -1);
  }
}
function _t(i, _t) {
  if (
    (i & 1 && (r(0, 'h3', 14), a(1, 'Peer Reviews'), l(), r(2, 'div', 15), D(3, ut, 11, 14, 'div', 16, W), l()), i & 2)
  ) {
    const e = c(2);
    o(3), L(e.reviewSessions());
  }
}
function mt(i, _t) {
  if ((i & 1 && x(0, 'app-governance-vote-panel', 17), i & 2)) {
    const e = c(),
      n = c();
    P('launchId', e.id)('agentNames', n.agentNameMap)('agentColors', n.agentColorRecord())(
      'councilAgentIds',
      n.councilAgentIds(),
    );
  }
}
function vt(i, _t) {
  if ((i & 1 && (r(0, 'pre', 53), a(1), l()), i & 2)) {
    const e = c(2);
    o(), u(e.synthesis);
  }
}
function ht(i, _t) {
  i & 1 && (r(0, 'p', 54), a(1, 'No synthesis was produced for this council launch.'), l());
}
function Ct(i, _t) {
  if ((i & 1 && (r(0, 'div', 56), x(1, 'app-session-output', 38), l()), i & 2)) {
    const e = c(4);
    o(), P('messages', e.getChatMessages())('events', e.getChatEvents())('isRunning', e.chatRunning());
  }
}
function xt(i, _t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 55)(1, 'h3', 14),
      a(2, 'Chat with Council'),
      l(),
      p(3, Ct, 2, 3, 'div', 56),
      r(4, 'div', 57)(5, 'input', 58),
      E('input', (s) => {
        f(e);
        const d = c(3);
        return b(d.chatInput.set(s.target.value));
      })('keydown.enter', () => {
        f(e);
        const s = c(3);
        return b(s.onSendChat());
      }),
      l(),
      r(6, 'button', 59),
      E('click', () => {
        f(e);
        const s = c(3);
        return b(s.onSendChat());
      }),
      a(7),
      l()()();
  }
  if (i & 2) {
    const e = c(3);
    o(3),
      g(e.chatSessionId() ? 3 : -1),
      o(2),
      P('value', e.chatInput())('disabled', e.chatSending()),
      o(),
      P('disabled', e.chatSending() || !e.chatInput().trim()),
      o(),
      u(e.chatSending() ? 'Sending...' : 'Send');
  }
}
function ft(i, _t) {
  if (
    (i & 1 &&
      (r(0, 'div', 49)(1, 'div', 50)(2, 'span', 51),
      a(3, '\u2713'),
      l(),
      r(4, 'h3', 52),
      a(5, 'Council Decision'),
      l()(),
      p(6, vt, 2, 1, 'pre', 53)(7, ht, 2, 0, 'p', 54),
      l(),
      p(8, xt, 8, 5, 'div', 55)),
    i & 2)
  ) {
    const e = c();
    w('synthesis--empty', !e.synthesis), o(6), g(e.synthesis ? 6 : 7), o(2), g(e.synthesis ? 8 : -1);
  }
}
function bt(i, t) {
  if (i & 1) {
    const e = M();
    r(0, 'div', 0)(1, 'div', 1)(2, 'div')(3, 'h2'),
      a(4, 'Council Launch'),
      l(),
      r(5, 'p', 2),
      a(6),
      l()(),
      r(7, 'a', 3),
      a(8, 'Back to Council'),
      l()(),
      r(9, 'div', 4)(10, 'div', 5),
      x(11, 'span', 6),
      r(12, 'span', 7),
      a(13, 'Responding'),
      l()(),
      x(14, 'div', 8),
      r(15, 'div', 5),
      x(16, 'span', 6),
      r(17, 'span', 7),
      a(18, 'Discussing'),
      l()(),
      x(19, 'div', 8),
      r(20, 'div', 5),
      x(21, 'span', 6),
      r(22, 'span', 7),
      a(23, 'Reviewing'),
      l()(),
      x(24, 'div', 8),
      r(25, 'div', 5),
      x(26, 'span', 6),
      r(27, 'span', 7),
      a(28, 'Synthesizing'),
      l()(),
      x(29, 'div', 8),
      r(30, 'div', 5),
      x(31, 'span', 6),
      r(32, 'span', 7),
      a(33, 'Complete'),
      l()()(),
      r(34, 'div', 9),
      p(35, Ve, 3, 3),
      p(36, Oe, 2, 2, 'span', 10),
      p(37, Te, 3, 3),
      p(38, De, 2, 2, 'button', 11),
      r(39, 'button', 12),
      E('click', () => {
        f(e);
        const s = c();
        return b(s.logsOpen.set(!s.logsOpen()));
      }),
      a(40),
      l()(),
      p(41, Ne, 4, 1, 'div', 13),
      r(42, 'h3', 14),
      a(43, 'Member Responses'),
      l(),
      r(44, 'div', 15),
      D(45, Qe, 11, 14, 'div', 16, W),
      l(),
      p(47, nt, 7, 2),
      p(48, _t, 5, 0),
      p(49, mt, 1, 4, 'app-governance-vote-panel', 17),
      p(50, ft, 9, 4),
      l();
  }
  if (i & 2) {
    const e = t,
      n = c();
    o(6),
      u(e.prompt),
      o(),
      P('routerLink', ie(46, Ee, e.councilId)),
      o(3),
      w('stage-step--active', e.stage === 'responding')('stage-step--done', n.stageIndex() > 0),
      y('data-stage', 'responding'),
      o(4),
      w('stage-connector--done', n.stageIndex() > 0),
      o(),
      w('stage-step--active', e.stage === 'discussing')('stage-step--done', n.stageIndex() > 1),
      y('data-stage', 'discussing'),
      o(4),
      w('stage-connector--done', n.stageIndex() > 1),
      o(),
      w('stage-step--active', e.stage === 'reviewing')('stage-step--done', n.stageIndex() > 2),
      y('data-stage', 'reviewing'),
      o(4),
      w('stage-connector--done', n.stageIndex() > 2),
      o(),
      w('stage-step--active', e.stage === 'synthesizing')('stage-step--done', n.stageIndex() > 3),
      y('data-stage', 'synthesizing'),
      o(4),
      w('stage-connector--done', n.stageIndex() > 3),
      o(),
      w('stage-step--active', e.stage === 'complete')('stage-step--done', e.stage === 'complete'),
      y('data-stage', 'complete'),
      o(5),
      g(e.stage === 'responding' ? 35 : -1),
      o(),
      g(e.stage === 'discussing' ? 36 : -1),
      o(),
      g(e.stage === 'reviewing' && n.hasChairman() ? 37 : -1),
      o(),
      g(e.stage !== 'complete' ? 38 : -1),
      o(2),
      A(' ', n.logsOpen() ? 'Hide' : 'Show', ' Logs (', n.logs().length, ') '),
      o(),
      g(n.logsOpen() ? 41 : -1),
      o(4),
      L(n.memberSessions()),
      o(2),
      g(n.discussionMessages().length > 0 || e.stage === 'discussing' ? 47 : -1),
      o(),
      g(n.reviewSessions().length > 0 ? 48 : -1),
      o(),
      g(e.voteType === 'governance' ? 49 : -1),
      o(),
      g(e.stage === 'complete' ? 50 : -1);
  }
}
function yt(i, _t) {
  i & 1 && (r(0, 'div', 0)(1, 'p'), a(2, 'Loading...'), l()());
}
var me = class i {
  route = T(ae);
  councilService = T(pe);
  agentService = T(ce);
  sessionService = T(de);
  wsService = T($);
  static AGENT_COLORS = ['#ff6b9d', '#00e5ff', '#ffa040', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fbbf24'];
  launch = C(null);
  hasChairman = C(!1);
  allSessions = C([]);
  logs = C([]);
  discussionMessages = C([]);
  logsOpen = C(!0);
  triggeringReview = C(!1);
  triggeringSynthesis = C(!1);
  aborting = C(!1);
  expandedSessions = C(new Set());
  expandedDiscussion = C(new Set());
  chatSessionId = C(null);
  chatInput = C('');
  chatSending = C(!1);
  chatRunning = C(!1);
  agentNameMap = {};
  agentIdBySession = {};
  agentColorMap = {};
  nextColorIndex = 0;
  sessionMessages = C(new Map());
  sessionEvents = C(new Map());
  agentActivity = C(new Map());
  queuedAgents = C(new Set());
  unsubscribeWs = null;
  refreshInterval = null;
  activityTimers = new Map();
  memberSessions = S(() => this.allSessions().filter((t) => t.councilRole === 'member'));
  reviewSessions = S(() => this.allSessions().filter((t) => t.councilRole === 'reviewer'));
  stageIndex = S(() => {
    const t = this.launch();
    return t ? ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'].indexOf(t.stage) : 0;
  });
  allMembersDone = S(() => {
    const t = this.memberSessions();
    return t.length > 0 && t.every((e) => e.status !== 'running');
  });
  allReviewsDone = S(() => {
    const t = this.reviewSessions();
    return t.length > 0 && t.every((e) => e.status !== 'running');
  });
  explorerNetwork = S(() => this.sessionService.algochatStatus()?.network ?? 'testnet');
  agentColorRecord = S(() => {
    const t = {};
    for (const [e, n] of Object.entries(this.agentColorMap)) t[e] = i.AGENT_COLORS[n % i.AGENT_COLORS.length];
    return t;
  });
  councilAgentIds = S(() => {
    const t = this.allSessions(),
      e = new Set();
    for (const n of t) n.agentId && e.add(n.agentId);
    return Array.from(e);
  });
  async ngOnInit() {
    const t = this.route.snapshot.paramMap.get('id');
    if (t) {
      await this.agentService.loadAgents();
      for (const e of this.agentService.agents()) this.agentNameMap[e.id] = e.name;
      this.sessionService.loadAlgoChatStatus().catch(() => {}), await this.loadLaunchData(t);
      try {
        const e = await this.councilService.getLaunchLogs(t);
        this.logs.set(e);
      } catch {}
      try {
        const e = await this.councilService.getDiscussionMessages(t);
        this.discussionMessages.set(e);
      } catch {}
      for (const e of this.allSessions()) this.sessionService.subscribeToSession(e.id);
      (this.unsubscribeWs = this.wsService.onMessage((e) => {
        if (e.type === 'session_event') {
          const n = new Map(this.sessionEvents()),
            s = n.get(e.sessionId) ?? [];
          n.set(e.sessionId, [...s, e.event]), this.sessionEvents.set(n);
          const d = this.agentIdBySession[e.sessionId],
            _ = e.event?.data;
          if (d && e.event?.eventType === 'thinking') {
            const h = !!_?.thinking;
            this.setActivity(d, h ? 'Thinking...' : ''),
              h &&
                this.queuedAgents.update((O) => {
                  const k = new Set(O);
                  return k.delete(d), k;
                });
          }
          if (d && e.event?.eventType === 'queue_status') {
            const h = _?.statusMessage;
            h
              ? (this.setActivity(d, h),
                this.queuedAgents.update((O) => {
                  const k = new Set(O);
                  return k.add(d), k;
                }))
              : this.queuedAgents.update((O) => {
                  const k = new Set(O);
                  return k.delete(d), k;
                });
          }
          if (d && e.event?.eventType === 'tool_status') {
            const h = _?.statusMessage;
            h && this.setActivity(d, h, 5e3);
          }
        }
        if (e.type === 'session_status') {
          this.refreshSessions();
          const n = this.chatSessionId();
          n &&
            e.sessionId === n &&
            (this.chatRunning.set(e.status === 'running'),
            e.status !== 'running' &&
              this.sessionService
                .getMessages(n)
                .then((s) => {
                  const d = new Map(this.sessionMessages());
                  d.set(n, s), this.sessionMessages.set(d);
                })
                .catch(() => {}));
        }
        if (
          (e.type === 'council_stage_change' && e.launchId === t && this.loadLaunchData(t),
          e.type === 'council_log' && e.log.launchId === t && this.logs.update((n) => [...n, e.log]),
          e.type === 'council_discussion_message' &&
            e.message.launchId === t &&
            this.discussionMessages.update((n) => [...n, e.message]),
          e.type === 'chat_thinking' && this.setActivity(e.agentId, e.active ? 'Thinking...' : ''),
          e.type === 'chat_tool_use' && this.setActivity(e.agentId, `Using ${e.toolName}`, 3e3),
          e.type === 'algochat_message')
        ) {
          const n =
            e.direction === 'outbound' ? `Sending message to ${e.participant}` : `Message from ${e.participant}`;
          this.setActivity(e.participant, n, 4e3);
        }
      })),
        (this.refreshInterval = setInterval(() => this.refreshLaunch(t), 5e3));
    }
  }
  ngOnDestroy() {
    this.unsubscribeWs?.(), this.refreshInterval && clearInterval(this.refreshInterval);
    for (const e of this.activityTimers.values()) clearTimeout(e);
    for (const e of this.allSessions()) this.sessionService.unsubscribeFromSession(e.id);
    const t = this.chatSessionId();
    t && this.sessionService.unsubscribeFromSession(t);
  }
  getAgentName(t) {
    return t ? (this.agentNameMap[t] ?? t.slice(0, 8)) : 'Unknown';
  }
  getDisplayStatus(t) {
    return t.status === 'running' && t.agentId && this.queuedAgents().has(t.agentId) ? 'queued' : t.status;
  }
  agentColor(t) {
    if (!t) return '#666';
    const e = this.agentNameMap[t] ?? t;
    e in this.agentColorMap || (this.agentColorMap[e] = this.nextColorIndex++);
    const n = this.agentColorMap[e];
    return i.AGENT_COLORS[n % i.AGENT_COLORS.length];
  }
  previewText(t) {
    const e = t.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return e.length > 120 ? `${e.slice(0, 120)}...` : e;
  }
  getPreviewText(t) {
    const n = (this.sessionMessages().get(t) ?? []).filter((d) => d.role === 'assistant'),
      s = n.length > 0 ? n[n.length - 1] : null;
    return s?.content ? this.previewText(s.content) : '';
  }
  toggleSession(t) {
    this.expandedSessions.update((e) => {
      const n = new Set(e);
      return n.has(t) ? n.delete(t) : n.add(t), n;
    });
  }
  toggleDiscussion(t) {
    this.expandedDiscussion.update((e) => {
      const n = new Set(e);
      return n.has(t) ? n.delete(t) : n.add(t), n;
    });
  }
  getActivity(t) {
    return t ? (this.agentActivity().get(t) ?? '') : '';
  }
  getEventLog(t) {
    let e = this.sessionEvents().get(t) ?? [],
      n = [],
      s = '';
    for (const d of e) {
      let _ = d.data,
        h = '';
      if (d.eventType === 'tool_status' && _?.statusMessage) h = _.statusMessage;
      else if (d.eventType === 'queue_status' && _?.statusMessage) h = _.statusMessage;
      else if (d.eventType === 'thinking' && _?.thinking) h = 'Thinking...';
      else if (d.eventType === 'assistant') h = 'Generating response...';
      else if (d.eventType === 'performance') {
        const O = _?.tokensPerSecond,
          k = _?.outputTokens,
          he = _?.model;
        O && (h = `${he ?? 'Model'}: ${k ?? '?'} tokens @ ${O} tok/s`);
      }
      if (h && h !== s) {
        const O = new Date(d.timestamp);
        n.push({ ts: O.getTime(), time: O.toLocaleTimeString(), text: h }), (s = h);
      }
    }
    return n;
  }
  setActivity(t, e, n) {
    const s = new Map(this.agentActivity());
    e ? s.set(t, e) : s.delete(t), this.agentActivity.set(s);
    const d = this.activityTimers.get(t);
    d && clearTimeout(d),
      e &&
        n &&
        this.activityTimers.set(
          t,
          setTimeout(() => {
            const _ = new Map(this.agentActivity());
            _.delete(t), this.agentActivity.set(_);
          }, n),
        );
  }
  getMessages(t) {
    return this.sessionMessages().get(t) ?? [];
  }
  getEvents(t) {
    return this.sessionEvents().get(t) ?? [];
  }
  async onStartReview() {
    const t = this.launch();
    if (t) {
      this.triggeringReview.set(!0);
      try {
        await this.councilService.triggerReview(t.id), await this.loadLaunchData(t.id);
      } finally {
        this.triggeringReview.set(!1);
      }
    }
  }
  async onSynthesize() {
    const t = this.launch();
    if (t) {
      this.triggeringSynthesis.set(!0);
      try {
        await this.councilService.triggerSynthesis(t.id), await this.loadLaunchData(t.id);
      } finally {
        this.triggeringSynthesis.set(!1);
      }
    }
  }
  async onAbort() {
    const t = this.launch();
    if (t && confirm('End this council? Running sessions will be stopped and existing responses will be aggregated.')) {
      this.aborting.set(!0);
      try {
        await this.councilService.abortLaunch(t.id), await this.loadLaunchData(t.id);
      } finally {
        this.aborting.set(!1);
      }
    }
  }
  getChatMessages() {
    const t = this.chatSessionId();
    return t ? (this.sessionMessages().get(t) ?? []) : [];
  }
  getChatEvents() {
    const t = this.chatSessionId();
    return t ? (this.sessionEvents().get(t) ?? []) : [];
  }
  async onSendChat() {
    const t = this.launch(),
      e = this.chatInput().trim();
    if (!(!t || !e)) {
      this.chatSending.set(!0);
      try {
        const n = await this.councilService.chatWithCouncil(t.id, e);
        this.chatInput.set(''),
          this.chatSessionId.set(n.sessionId),
          this.chatRunning.set(!0),
          this.sessionService.subscribeToSession(n.sessionId),
          n.created && (await this.loadLaunchData(t.id));
      } finally {
        this.chatSending.set(!1);
      }
    }
  }
  async loadLaunchData(t) {
    const e = await this.councilService.getCouncilLaunch(t);
    this.launch.set(e);
    try {
      const d = await this.councilService.getCouncil(e.councilId);
      this.hasChairman.set(!!d.chairmanAgentId);
    } catch {}
    const n = [],
      s = new Map();
    for (const d of e.sessionIds)
      try {
        const _ = await this.sessionService.getSession(d);
        n.push(_);
        const h = await this.sessionService.getMessages(d);
        s.set(d, h);
      } catch {}
    this.allSessions.set(n), this.sessionMessages.set(s);
    for (const d of n)
      d.agentId && (this.agentIdBySession[d.id] = d.agentId), this.sessionService.subscribeToSession(d.id);
    if (e.chatSessionId) {
      this.chatSessionId.set(e.chatSessionId), this.sessionService.subscribeToSession(e.chatSessionId);
      try {
        const d = await this.sessionService.getSession(e.chatSessionId);
        this.chatRunning.set(d.status === 'running');
        const _ = await this.sessionService.getMessages(e.chatSessionId);
        s.set(e.chatSessionId, _), this.sessionMessages.set(new Map(s));
      } catch {}
    }
  }
  async refreshSessions() {
    const t = this.launch();
    if (!t) return;
    const e = [];
    for (const n of t.sessionIds)
      try {
        e.push(await this.sessionService.getSession(n));
      } catch {}
    this.allSessions.set(e);
  }
  async refreshLaunch(t) {
    try {
      const e = await this.councilService.getCouncilLaunch(t),
        n = this.launch();
      n &&
        (e.stage !== n.stage || e.sessionIds.length !== n.sessionIds.length) &&
        (this.launch.set(e), e.sessionIds.length !== n.sessionIds.length && (await this.loadLaunchData(t)));
    } catch {}
  }
  static \u0275fac = (e) => new (e || i)();
  static \u0275cmp = F({
    type: i,
    selectors: [['app-council-launch-view']],
    decls: 2,
    vars: 1,
    consts: [
      [1, 'page'],
      [1, 'page__header'],
      [1, 'page__prompt'],
      [1, 'btn', 'btn--secondary', 3, 'routerLink'],
      [1, 'stage-bar'],
      [1, 'stage-step'],
      [1, 'stage-dot'],
      [1, 'stage-label'],
      [1, 'stage-connector'],
      [1, 'actions'],
      [1, 'auto-label'],
      [1, 'btn', 'btn--danger', 'btn--sm', 3, 'disabled'],
      [1, 'btn', 'btn--secondary', 'btn--sm', 3, 'click'],
      ['role', 'log', 'aria-label', 'Council activity log', 1, 'log-panel'],
      [1, 'section-title'],
      [1, 'feed-list'],
      ['tabindex', '0', 'role', 'button', 1, 'feed-entry', 3, 'feed-entry--expanded', 'border-left-color'],
      [3, 'launchId', 'agentNames', 'agentColors', 'councilAgentIds'],
      [1, 'btn', 'btn--secondary', 'btn--sm', 3, 'click', 'disabled'],
      [1, 'btn', 'btn--danger', 'btn--sm', 3, 'click', 'disabled'],
      [1, 'log-entry', 3, 'class'],
      [1, 'log-empty'],
      [1, 'log-entry'],
      [1, 'log-ts'],
      [1, 'log-level'],
      [1, 'log-msg'],
      [1, 'log-detail'],
      ['tabindex', '0', 'role', 'button', 1, 'feed-entry', 3, 'click', 'keydown.enter', 'keydown.space'],
      [1, 'feed-meta'],
      [1, 'processing-dot'],
      [1, 'queued-dot'],
      [1, 'feed-name'],
      [3, 'status'],
      [1, 'feed-preview'],
      [1, 'feed-toggle'],
      [1, 'feed-content'],
      [1, 'feed-content', 3, 'click'],
      [1, 'feed-event-log'],
      [3, 'messages', 'events', 'isRunning'],
      [1, 'feed-event-entry'],
      [1, 'discussion-loading'],
      ['role', 'log', 'aria-label', 'Council discussion', 1, 'feed-list'],
      [1, 'feed-badge'],
      [1, 'feed-time'],
      [
        'target',
        '_blank',
        'rel',
        'noopener noreferrer',
        'aria-label',
        'View transaction on chain',
        1,
        'feed-tx',
        3,
        'href',
      ],
      [1, 'feed-content', 'feed-content--text'],
      [
        'target',
        '_blank',
        'rel',
        'noopener noreferrer',
        'aria-label',
        'View transaction on chain',
        1,
        'feed-tx',
        3,
        'click',
        'href',
      ],
      [1, 'feed-content', 'feed-content--text', 3, 'click'],
      [1, 'feed-empty'],
      [1, 'synthesis'],
      [1, 'synthesis__header'],
      ['aria-hidden', 'true', 1, 'synthesis__icon'],
      [1, 'synthesis__title'],
      [1, 'synthesis__content'],
      [1, 'synthesis__warning'],
      [1, 'council-chat'],
      [1, 'council-chat__output'],
      [1, 'council-chat__input'],
      [
        'type',
        'text',
        'placeholder',
        "Ask a follow-up question about the council's decision...",
        1,
        'council-chat__field',
        3,
        'input',
        'keydown.enter',
        'value',
        'disabled',
      ],
      [1, 'btn', 'btn--primary', 'btn--sm', 3, 'click', 'disabled'],
    ],
    template: (e, n) => {
      if ((e & 1 && p(0, bt, 51, 48, 'div', 0)(1, yt, 3, 0, 'div', 0), e & 2)) {
        let s;
        g((s = n.launch()) ? 0 : 1, s);
      }
    },
    dependencies: [re, ue, ge, q, oe],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem}.page__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem}.page__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;color:var(--text-primary)}.page__prompt[_ngcontent-%COMP%]{margin:.25rem 0 0;color:var(--text-secondary);font-size:.9rem;max-width:600px}.btn[_ngcontent-%COMP%]{padding:.5rem 1rem;border-radius:var(--radius);font-size:.8rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em}.btn--primary[_ngcontent-%COMP%]{background:transparent;color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--accent-cyan-dim)}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--bg-hover)}.btn--danger[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red, #f87171);border-color:var(--accent-red, #f87171)}.btn[_ngcontent-%COMP%]:disabled{opacity:.3;cursor:not-allowed}.btn--sm[_ngcontent-%COMP%]{font-size:.7rem;padding:.35rem .75rem}.auto-label[_ngcontent-%COMP%]{font-size:.8rem;color:var(--accent-cyan);font-weight:600;animation:_ngcontent-%COMP%_pulse 1.5s ease-in-out infinite}@keyframes _ngcontent-%COMP%_pulse{0%,to{opacity:1}50%{opacity:.5}}.stage-bar[_ngcontent-%COMP%]{display:flex;align-items:center;gap:0;margin-bottom:1.5rem;padding:1rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg)}.stage-step[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.stage-dot[_ngcontent-%COMP%]{width:12px;height:12px;border-radius:50%;border:2px solid var(--border-bright);background:transparent}.stage-step--done[_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:var(--accent-green);background:var(--accent-green)}.stage-label[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}.stage-step--done[_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:var(--accent-green)}.stage-connector[_ngcontent-%COMP%]{flex:1;height:2px;background:var(--border);margin:0 .5rem;min-width:20px}.stage-connector--done[_ngcontent-%COMP%]{background:var(--accent-green)}.stage-step--active[data-stage=responding][_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:#00e5ff;background:#00e5ff}.stage-step--active[data-stage=responding][_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:#00e5ff}.stage-step--active[data-stage=discussing][_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:#fbbf24;background:#fbbf24}.stage-step--active[data-stage=discussing][_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:#fbbf24}.stage-step--active[data-stage=reviewing][_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:var(--accent-purple);background:var(--accent-purple)}.stage-step--active[data-stage=reviewing][_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:var(--accent-purple)}.stage-step--active[data-stage=synthesizing][_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:#f472b6;background:#f472b6}.stage-step--active[data-stage=synthesizing][_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:#f472b6}.stage-step--active[data-stage=complete][_ngcontent-%COMP%]   .stage-dot[_ngcontent-%COMP%]{border-color:var(--accent-green);background:var(--accent-green)}.stage-step--active[data-stage=complete][_ngcontent-%COMP%]   .stage-label[_ngcontent-%COMP%]{color:var(--accent-green)}.actions[_ngcontent-%COMP%]{margin-bottom:1.5rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}.section-title[_ngcontent-%COMP%]{margin:1.5rem 0 .75rem;color:var(--text-primary)}.log-panel[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.5rem;margin-bottom:1.5rem;max-height:250px;overflow-y:auto;font-family:Dogica Pixel,Dogica,monospace;font-size:.75rem;line-height:1.6}.log-entry[_ngcontent-%COMP%]{display:flex;gap:.5rem;padding:.15rem .5rem}.log-entry[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.log-ts[_ngcontent-%COMP%]{color:var(--text-tertiary);flex-shrink:0}.log-level[_ngcontent-%COMP%]{flex-shrink:0;width:3.5em;text-transform:uppercase;font-weight:700}.log-entry--info[_ngcontent-%COMP%]   .log-level[_ngcontent-%COMP%]{color:var(--accent-cyan)}.log-entry--stage[_ngcontent-%COMP%]   .log-level[_ngcontent-%COMP%]{color:var(--accent-green)}.log-entry--warn[_ngcontent-%COMP%]   .log-level[_ngcontent-%COMP%]{color:var(--accent-yellow, #fbbf24)}.log-entry--error[_ngcontent-%COMP%]   .log-level[_ngcontent-%COMP%]{color:var(--accent-red, #f87171)}.log-msg[_ngcontent-%COMP%]{color:var(--text-primary)}.log-detail[_ngcontent-%COMP%]{color:var(--text-tertiary)}.log-empty[_ngcontent-%COMP%]{color:var(--text-tertiary);padding:.5rem;text-align:center}.feed-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:2px}.feed-entry[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:.35rem .75rem;font-size:.8rem;border-left:3px solid var(--border);cursor:pointer;transition:background .1s}.feed-entry[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.feed-entry--expanded[_ngcontent-%COMP%], .feed-entry--expanded[_ngcontent-%COMP%]:hover{background:var(--bg-raised)}.feed-meta[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.4rem;flex-wrap:nowrap;overflow:hidden}.feed-name[_ngcontent-%COMP%]{font-weight:700;font-size:.8rem;flex-shrink:0}.feed-preview[_ngcontent-%COMP%]{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-tertiary);font-size:.75rem;margin-left:.25rem}.feed-event-log[_ngcontent-%COMP%]{background:var(--bg-deep);border-radius:var(--radius-sm);padding:.3rem;margin-bottom:.3rem;max-height:120px;overflow-y:auto;font-size:.7rem}.feed-event-entry[_ngcontent-%COMP%]{display:flex;gap:.3rem;padding:1px .3rem;color:var(--accent)}.feed-toggle[_ngcontent-%COMP%]{flex-shrink:0;color:var(--text-tertiary);font-size:.7rem;margin-left:auto;-webkit-user-select:none;user-select:none}.feed-content[_ngcontent-%COMP%]{max-height:600px;overflow-y:auto;margin:.4rem 0 0}.feed-content--text[_ngcontent-%COMP%]{white-space:pre-wrap;word-break:break-word;color:var(--text-primary);font-size:.78rem;line-height:1.5;padding:.5rem;background:var(--bg-deep);border-radius:var(--radius-sm);border:1px solid var(--border)}.feed-badge[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 6px;border-radius:9999px;background:var(--accent-cyan-dim, rgba(0, 229, 255, .1));color:var(--accent-cyan);font-weight:700;text-transform:uppercase;flex-shrink:0}.feed-time[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);flex-shrink:0}.feed-tx[_ngcontent-%COMP%]{font-size:.65rem;padding:1px 5px;border-radius:var(--radius-sm);background:var(--bg-raised);border:1px solid var(--border-bright);color:var(--accent-magenta);text-decoration:none;font-weight:600;flex-shrink:0}.feed-tx[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.feed-empty[_ngcontent-%COMP%]{color:var(--text-tertiary);font-size:.8rem;padding:.5rem}.processing-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;background:#00e5ff;flex-shrink:0;animation:_ngcontent-%COMP%_processing-pulse 1.5s ease-in-out infinite}@keyframes _ngcontent-%COMP%_processing-pulse{0%,to{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}.queued-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;background:var(--accent-yellow, #fbbf24);flex-shrink:0;opacity:.6}.discussion-loading[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.75rem;font-size:.8rem;color:var(--accent-cyan);animation:_ngcontent-%COMP%_pulse 1.5s ease-in-out infinite}.synthesis[_ngcontent-%COMP%]{margin-top:1.5rem;border:1px solid var(--accent-green);border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:0 0 16px #00ff8814}.synthesis--empty[_ngcontent-%COMP%]{border-color:var(--accent-yellow, #fbbf24);box-shadow:0 0 12px #fbbf240f}.synthesis__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.75rem 1.25rem;border-bottom:1px solid var(--border);background:var(--bg-raised);border-radius:var(--radius-lg) var(--radius-lg) 0 0}.synthesis__icon[_ngcontent-%COMP%]{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--accent-green);color:var(--bg-base, #0a0f1a);font-size:.75rem;font-weight:700;flex-shrink:0}.synthesis--empty[_ngcontent-%COMP%]   .synthesis__icon[_ngcontent-%COMP%]{background:var(--accent-yellow, #fbbf24)}.synthesis__title[_ngcontent-%COMP%]{margin:0;font-size:.95rem;color:var(--accent-green);font-weight:700}.synthesis--empty[_ngcontent-%COMP%]   .synthesis__title[_ngcontent-%COMP%]{color:var(--accent-yellow, #fbbf24)}.synthesis__content[_ngcontent-%COMP%]{padding:1.25rem;font-size:.85rem;margin:0;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);line-height:1.6}.synthesis__warning[_ngcontent-%COMP%]{padding:1rem 1.25rem;margin:0;font-size:.85rem;color:var(--accent-yellow, #fbbf24);font-style:italic}.council-chat[_ngcontent-%COMP%]{margin-top:1.5rem}.council-chat__output[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:.75rem;margin-bottom:.75rem;max-height:500px;overflow-y:auto}.council-chat__input[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center}.council-chat__field[_ngcontent-%COMP%]{flex:1;padding:.5rem .75rem;border-radius:var(--radius);border:1px solid var(--border-bright);background:var(--bg-surface);color:var(--text-primary);font-family:inherit;font-size:.85rem;outline:none}.council-chat__field[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan)}.council-chat__field[_ngcontent-%COMP%]:disabled{opacity:.5}',
    ],
    changeDetection: 0,
  });
};

export { me as CouncilLaunchViewComponent };
