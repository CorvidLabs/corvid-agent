import { Ob as b, sb as c, tb as d, Qb as g, ic as i, _a as n, hb as o, Na as r, Nb as s } from './chunk-LF4EWAJA.js';

var u = class t {
  status = i.required();
  static \u0275fac = (e) => new (e || t)();
  static \u0275cmp = n({
    type: t,
    selectors: [['app-status-badge']],
    inputs: { status: [1, 'status'] },
    decls: 2,
    vars: 4,
    consts: [[1, 'status-badge']],
    template: (e, a) => {
      e & 1 && (c(0, 'span', 0), b(1), d()),
        e & 2 &&
          (s(`status-badge--${a.status()}`), o('aria-label', `Status: ${a.status()}`), r(), g(' ', a.status(), ' '));
    },
    styles: [
      '.status-badge[_ngcontent-%COMP%]{display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;border:1px solid;transition:background .3s ease,color .3s ease,border-color .3s ease,box-shadow .3s ease}.status-badge--idle[_ngcontent-%COMP%]{background:var(--bg-raised);color:var(--text-secondary);border-color:var(--border-bright)}.status-badge--loading[_ngcontent-%COMP%]{background:var(--accent-cyan-dim, var(--accent-cyan-dim));color:var(--accent-cyan, #00c8ff);border-color:var(--accent-cyan-border)}.status-badge--running[_ngcontent-%COMP%]{background:var(--accent-green-dim);color:var(--accent-green);border-color:var(--accent-green-border)}.status-badge--thinking[_ngcontent-%COMP%]{background:var(--accent-purple-dim, var(--accent-purple-subtle));color:var(--accent-purple, #a855f7);border-color:var(--accent-purple-border);animation:_ngcontent-%COMP%_statusPulse 1.5s ease-in-out infinite}.status-badge--tool_use[_ngcontent-%COMP%]{background:var(--accent-cyan-dim, var(--accent-cyan-dim));color:var(--accent-cyan, #00c8ff);border-color:var(--accent-cyan-border);animation:_ngcontent-%COMP%_statusPulse 1s ease-in-out infinite}@keyframes _ngcontent-%COMP%_statusPulse{0%,to{opacity:1;box-shadow:none}50%{opacity:.7;box-shadow:0 0 6px 1px currentColor}}.status-badge--paused[_ngcontent-%COMP%]{background:var(--accent-amber-dim);color:var(--accent-amber);border-color:var(--accent-amber-border)}.status-badge--stopped[_ngcontent-%COMP%]{background:var(--bg-raised);color:var(--text-tertiary);border-color:var(--border)}.status-badge--error[_ngcontent-%COMP%]{background:var(--accent-red-dim);color:var(--accent-red);border-color:var(--accent-red-border)}.status-badge--queued[_ngcontent-%COMP%]{background:var(--accent-amber-dim);color:var(--accent-yellow, #fbbf24);border-color:var(--accent-amber-border)}.status-badge--completed[_ngcontent-%COMP%]{background:var(--accent-green-dim);color:var(--accent-green);border-color:var(--accent-green-border)}.status-badge--failed[_ngcontent-%COMP%]{background:var(--accent-red-dim);color:var(--accent-red);border-color:var(--accent-red-border)}.status-badge--pending[_ngcontent-%COMP%]{background:var(--accent-amber-dim);color:var(--accent-amber);border-color:var(--accent-amber-border)}.status-badge--branching[_ngcontent-%COMP%], .status-badge--validating[_ngcontent-%COMP%]{background:var(--accent-cyan-dim, var(--accent-cyan-dim));color:var(--accent-cyan, #00c8ff);border-color:var(--accent-cyan-border);animation:_ngcontent-%COMP%_statusPulse 1.5s ease-in-out infinite}.status-badge--cancelled[_ngcontent-%COMP%]{background:var(--bg-raised);color:var(--text-tertiary);border-color:var(--border)}.status-badge--active[_ngcontent-%COMP%], .status-badge--connected[_ngcontent-%COMP%]{background:var(--accent-green-dim);color:var(--accent-green);border-color:var(--accent-green-border)}.status-badge--disconnected[_ngcontent-%COMP%]{background:var(--accent-red-dim);color:var(--accent-red);border-color:var(--accent-red-border)}',
    ],
    changeDetection: 0,
  });
};

export { u as a };
