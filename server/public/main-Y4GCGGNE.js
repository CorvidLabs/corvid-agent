import { a as $ } from './chunk-5EOQQV4Z.js';
import { a as R } from './chunk-A4KCXO2Q.js';
import { a as q } from './chunk-CSQXEU3M.js';
import { a as it } from './chunk-CZZRTCER.js';
import { a as ee } from './chunk-J3PBVME7.js';
import { a as J } from './chunk-NZV2JQDS.js';
import { a as B } from './chunk-OFKXBWQC.js';
import { a as Z } from './chunk-OQSRUIML.js';
import { g as be, h as fe, c as ge, d as ve, f as X } from './chunk-UXY6QH5L.js';
import { a as rt } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import {
  j as et,
  f as Je,
  l as nt,
  i as Q,
  b as Qe,
  k as tt,
  h as V,
  d as Y,
  a as Ye,
  g as z,
} from './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import { b as ot, a as ye } from './chunk-D6WCRQHB.js';
import { i as qe, g as Xe, j as Ze } from './chunk-GEI46CGR.js';
import {
  Y as _,
  lb as _e,
  Jb as $e,
  Qb as A,
  wa as Ae,
  Ob as a,
  Ib as Be,
  Pb as b,
  ja as C,
  fc as D,
  fa as De,
  pb as d,
  Ab as E,
  aa as Ee,
  _b as F,
  wb as Fe,
  rb as f,
  Lb as G,
  Hb as Ge,
  ib as g,
  O as H,
  Rb as He,
  Z as h,
  hc as he,
  ub as I,
  ka as Ie,
  Gb as je,
  z as K,
  Nb as Ke,
  nb as k,
  A as ke,
  Wa as Le,
  qb as l,
  zb as M,
  G as Me,
  sb as m,
  _ as me,
  ia as Ne,
  hb as O,
  ba as Oe,
  Mb as P,
  U as Pe,
  tb as p,
  n as pe,
  Ta as Re,
  Na as r,
  L as Se,
  Bb as s,
  _a as T,
  R as Te,
  ra as U,
  jc as Ue,
  T as u,
  Ma as ue,
  Fb as Ve,
  jb as v,
  ma as W,
  ic as We,
  mb as w,
  y as we,
  ob as x,
  q as xe,
  vb as y,
  Ra as ze,
} from './chunk-LF4EWAJA.js';

var vt = '@',
  bt = (() => {
    class n {
      doc;
      delegate;
      zone;
      animationType;
      moduleImpl;
      _rendererFactoryPromise = null;
      scheduler = null;
      injector = u(Ee);
      loadingSchedulerFn = u(ft, { optional: !0 });
      _engine;
      constructor(e, o, i, c, S) {
        (this.doc = e), (this.delegate = o), (this.zone = i), (this.animationType = c), (this.moduleImpl = S);
      }
      ngOnDestroy() {
        this._engine?.flush();
      }
      loadImpl() {
        let e = () => this.moduleImpl ?? import('./chunk-MJW3J4DU.js').then((i) => i),
          o;
        return (
          this.loadingSchedulerFn ? (o = this.loadingSchedulerFn(e)) : (o = e()),
          o
            .catch((_i) => {
              throw new Se(5300, !1);
            })
            .then(({ \u0275createEngine: i, \u0275AnimationRendererFactory: c }) => {
              this._engine = i(this.animationType, this.doc);
              const S = new c(this.delegate, this._engine, this.zone);
              return (this.delegate = S), S;
            })
        );
      }
      createRenderer(e, o) {
        const i = this.delegate.createRenderer(e, o);
        if (i.\u0275type === 0) return i;
        typeof i.throwOnSyntheticProps === 'boolean' && (i.throwOnSyntheticProps = !1);
        const c = new Ce(i);
        return (
          o?.data?.animation && !this._rendererFactoryPromise && (this._rendererFactoryPromise = this.loadImpl()),
          this._rendererFactoryPromise
            ?.then((S) => {
              const gt = S.createRenderer(e, o);
              c.use(gt), (this.scheduler ??= this.injector.get(Ie, null, { optional: !0 })), this.scheduler?.notify(10);
            })
            .catch((_S) => {
              c.use(i);
            }),
          c
        );
      }
      begin() {
        this.delegate.begin?.();
      }
      end() {
        this.delegate.end?.();
      }
      whenRenderingDone() {
        return this.delegate.whenRenderingDone?.() ?? Promise.resolve();
      }
      componentReplaced(e) {
        this._engine?.flush(), this.delegate.componentReplaced?.(e);
      }
      static \u0275fac = (_o) => {
        Le();
      };
      static \u0275prov = H({ token: n, factory: n.\u0275fac });
    }
    return n;
  })(),
  Ce = class {
    delegate;
    replay = [];
    \u0275type = 1;
    constructor(t) {
      this.delegate = t;
    }
    use(t) {
      if (((this.delegate = t), this.replay !== null)) {
        for (const e of this.replay) e(t);
        this.replay = null;
      }
    }
    get data() {
      return this.delegate.data;
    }
    destroy() {
      (this.replay = null), this.delegate.destroy();
    }
    createElement(t, e) {
      return this.delegate.createElement(t, e);
    }
    createComment(t) {
      return this.delegate.createComment(t);
    }
    createText(t) {
      return this.delegate.createText(t);
    }
    get destroyNode() {
      return this.delegate.destroyNode;
    }
    appendChild(t, e) {
      this.delegate.appendChild(t, e);
    }
    insertBefore(t, e, o, i) {
      this.delegate.insertBefore(t, e, o, i);
    }
    removeChild(t, e, o, i) {
      this.delegate.removeChild(t, e, o, i);
    }
    selectRootElement(t, e) {
      return this.delegate.selectRootElement(t, e);
    }
    parentNode(t) {
      return this.delegate.parentNode(t);
    }
    nextSibling(t) {
      return this.delegate.nextSibling(t);
    }
    setAttribute(t, e, o, i) {
      this.delegate.setAttribute(t, e, o, i);
    }
    removeAttribute(t, e, o) {
      this.delegate.removeAttribute(t, e, o);
    }
    addClass(t, e) {
      this.delegate.addClass(t, e);
    }
    removeClass(t, e) {
      this.delegate.removeClass(t, e);
    }
    setStyle(t, e, o, i) {
      this.delegate.setStyle(t, e, o, i);
    }
    removeStyle(t, e, o) {
      this.delegate.removeStyle(t, e, o);
    }
    setProperty(t, e, o) {
      this.shouldReplay(e) && this.replay.push((i) => i.setProperty(t, e, o)), this.delegate.setProperty(t, e, o);
    }
    setValue(t, e) {
      this.delegate.setValue(t, e);
    }
    listen(t, e, o, i) {
      return this.shouldReplay(e) && this.replay.push((c) => c.listen(t, e, o, i)), this.delegate.listen(t, e, o, i);
    }
    shouldReplay(t) {
      return this.replay !== null && t.startsWith(vt);
    }
  },
  ft = new Te('');
function at(n = 'animations') {
  return (
    ze('NgAsyncAnimations'),
    Pe([
      { provide: Re, useFactory: () => new bt(u(Oe), u(Ye), u(De), n) },
      { provide: Ae, useValue: n === 'noop' ? 'NoopAnimations' : 'BrowserAnimations' },
    ])
  );
}
var st = [
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
  { path: 'chat', loadComponent: () => import('./chunk-GIZWPS7F.js').then((n) => n.ChatHomeComponent) },
  { path: 'dashboard', loadComponent: () => import('./chunk-ECCNGYLP.js').then((n) => n.DashboardComponent) },
  {
    path: 'agents',
    children: [
      { path: '', loadComponent: () => import('./chunk-HHGWAZTU.js').then((n) => n.AgentListComponent) },
      {
        path: 'flock-directory',
        loadComponent: () => import('./chunk-PCE4K4US.js').then((n) => n.FlockDirectoryComponent),
      },
      { path: 'projects', loadComponent: () => import('./chunk-LLAWJV6R.js').then((n) => n.ProjectListComponent) },
      { path: 'projects/new', loadComponent: () => import('./chunk-UZDOQVQF.js').then((n) => n.ProjectFormComponent) },
      {
        path: 'projects/:id',
        loadComponent: () => import('./chunk-HUHD7FM4.js').then((n) => n.ProjectDetailComponent),
      },
      {
        path: 'projects/:id/edit',
        loadComponent: () => import('./chunk-UZDOQVQF.js').then((n) => n.ProjectFormComponent),
      },
      { path: 'models', loadComponent: () => import('./chunk-7YYDMR6J.js').then((n) => n.ModelsComponent) },
      { path: 'personas', loadComponent: () => import('./chunk-Y2TJH3TA.js').then((n) => n.PersonaManagerComponent) },
      {
        path: 'skill-bundles',
        loadComponent: () => import('./chunk-X2PRRSUM.js').then((n) => n.SkillBundleListComponent),
      },
      { path: 'new', loadComponent: () => import('./chunk-2ZD6YBGA.js').then((n) => n.AgentFormComponent) },
      { path: ':id', loadComponent: () => import('./chunk-NEIN5572.js').then((n) => n.AgentDetailComponent) },
      { path: ':id/edit', loadComponent: () => import('./chunk-2ZD6YBGA.js').then((n) => n.AgentFormComponent) },
    ],
  },
  {
    path: 'sessions',
    children: [
      { path: '', loadComponent: () => import('./chunk-U46XBFPW.js').then((n) => n.SessionListComponent) },
      { path: 'new', redirectTo: '/chat', pathMatch: 'full' },
      { path: 'work-tasks', loadComponent: () => import('./chunk-3KEMUKRC.js').then((n) => n.WorkTaskListComponent) },
      { path: 'councils', loadComponent: () => import('./chunk-3HFJ7DUI.js').then((n) => n.CouncilListComponent) },
      { path: 'councils/new', loadComponent: () => import('./chunk-RK33MVWP.js').then((n) => n.CouncilFormComponent) },
      {
        path: 'councils/:id',
        loadComponent: () => import('./chunk-YBPLI2EG.js').then((n) => n.CouncilDetailComponent),
      },
      {
        path: 'councils/:id/edit',
        loadComponent: () => import('./chunk-RK33MVWP.js').then((n) => n.CouncilFormComponent),
      },
      {
        path: 'council-launches/:id',
        loadComponent: () => import('./chunk-ITLSQFS3.js').then((n) => n.CouncilLaunchViewComponent),
      },
      { path: 'feed', redirectTo: '/observe', pathMatch: 'full' },
      { path: 'analytics', redirectTo: '/observe/analytics', pathMatch: 'full' },
      { path: 'logs', redirectTo: '/observe/logs', pathMatch: 'full' },
      { path: 'brain-viewer', redirectTo: '/observe/memory', pathMatch: 'full' },
      { path: 'reputation', redirectTo: '/observe/reputation', pathMatch: 'full' },
      { path: ':id', loadComponent: () => import('./chunk-GVE4X63O.js').then((n) => n.SessionViewComponent) },
    ],
  },
  { path: 'library', loadComponent: () => import('./chunk-VJ3HM2CS.js').then((n) => n.LibraryComponent) },
  {
    path: 'observe',
    children: [
      { path: '', loadComponent: () => import('./chunk-OZKJC3Z4.js').then((n) => n.UnifiedCommsComponent) },
      { path: 'memory', loadComponent: () => import('./chunk-3DIRNFPH.js').then((n) => n.UnifiedMemoryComponent) },
      { path: 'library', loadComponent: () => import('./chunk-X7OL3KTM.js').then((n) => n.LibraryBrowserComponent) },
      { path: 'analytics', loadComponent: () => import('./chunk-OAAZSEKN.js').then((n) => n.AnalyticsComponent) },
      { path: 'logs', loadComponent: () => import('./chunk-W6F2AF52.js').then((n) => n.SystemLogsComponent) },
      { path: 'reputation', loadComponent: () => import('./chunk-MVG63GX2.js').then((n) => n.ReputationComponent) },
      { path: 'live-feed', redirectTo: '/observe', pathMatch: 'full' },
      { path: 'agent-comms', redirectTo: '/observe', pathMatch: 'full' },
      { path: 'brain-viewer', redirectTo: '/observe/memory', pathMatch: 'full' },
      { path: 'memory-browser', redirectTo: '/observe/memory', pathMatch: 'full' },
    ],
  },
  {
    path: 'settings',
    children: [
      { path: '', loadComponent: () => import('./chunk-SX24A655.js').then((n) => n.SettingsComponent) },
      { path: 'security', loadComponent: () => import('./chunk-DSHAB2LR.js').then((n) => n.SettingsSecurityComponent) },
      {
        path: 'access-control',
        loadComponent: () => import('./chunk-WNDLUVCU.js').then((n) => n.SettingsAccessComponent),
      },
      {
        path: 'automation',
        loadComponent: () => import('./chunk-MIOM3Z6H.js').then((n) => n.SettingsAutomationComponent),
      },
      {
        path: 'integrations',
        loadComponent: () => import('./chunk-IMCMIKM4.js').then((n) => n.SettingsIntegrationsComponent),
      },
      { path: 'wallets', redirectTo: '/settings/security', pathMatch: 'full' },
      { path: 'spending', redirectTo: '/settings/security', pathMatch: 'full' },
      { path: 'allowlist', redirectTo: '/settings/access-control', pathMatch: 'full' },
      { path: 'github-allowlist', redirectTo: '/settings/access-control', pathMatch: 'full' },
      { path: 'repo-blocklist', redirectTo: '/settings/access-control', pathMatch: 'full' },
      { path: 'schedules', redirectTo: '/settings/automation', pathMatch: 'full' },
      { path: 'workflows', redirectTo: '/settings/automation', pathMatch: 'full' },
      { path: 'webhooks', redirectTo: '/settings/automation', pathMatch: 'full' },
      { path: 'mention-polling', redirectTo: '/settings/automation', pathMatch: 'full' },
      { path: 'mcp-servers', redirectTo: '/settings/integrations', pathMatch: 'full' },
      { path: 'contacts', redirectTo: '/settings/integrations', pathMatch: 'full' },
      { path: 'marketplace', redirectTo: '/settings/integrations', pathMatch: 'full' },
    ],
  },
  { path: 'projects', redirectTo: 'agents/projects', pathMatch: 'full' },
  { path: 'projects/new', redirectTo: 'agents/projects/new', pathMatch: 'full' },
  { path: 'projects/:id', redirectTo: 'agents/projects/:id' },
  { path: 'models', redirectTo: 'agents/models', pathMatch: 'full' },
  { path: 'personas', redirectTo: 'agents/personas', pathMatch: 'full' },
  { path: 'skill-bundles', redirectTo: 'agents/skill-bundles', pathMatch: 'full' },
  { path: 'flock-directory', redirectTo: 'agents/flock-directory', pathMatch: 'full' },
  { path: 'work-tasks', redirectTo: 'sessions/work-tasks', pathMatch: 'full' },
  { path: 'councils', redirectTo: 'sessions/councils', pathMatch: 'full' },
  { path: 'council-launches/:id', redirectTo: 'sessions/council-launches/:id' },
  { path: 'feed', redirectTo: 'observe', pathMatch: 'full' },
  { path: 'analytics', redirectTo: 'observe/analytics', pathMatch: 'full' },
  { path: 'logs', redirectTo: 'observe/logs', pathMatch: 'full' },
  { path: 'brain-viewer', redirectTo: 'observe/memory', pathMatch: 'full' },
  { path: 'reputation', redirectTo: 'observe/reputation', pathMatch: 'full' },
  { path: 'memory-browser', redirectTo: 'observe/memory', pathMatch: 'full' },
  { path: 'agent-comms', redirectTo: 'observe', pathMatch: 'full' },
  { path: 'automate', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'automate/workflows', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'automate/webhooks', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'automate/mention-polling', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'automate/mcp-servers', redirectTo: 'settings/integrations', pathMatch: 'full' },
  { path: 'schedules', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'workflows', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'webhooks', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'mention-polling', redirectTo: 'settings/automation', pathMatch: 'full' },
  { path: 'mcp-servers', redirectTo: 'settings/integrations', pathMatch: 'full' },
  { path: 'security', redirectTo: 'settings/security', pathMatch: 'full' },
  { path: 'wallets', redirectTo: 'settings/security', pathMatch: 'full' },
  { path: 'spending', redirectTo: 'settings/security', pathMatch: 'full' },
  { path: 'allowlist', redirectTo: 'settings/access-control', pathMatch: 'full' },
  { path: 'github-allowlist', redirectTo: 'settings/access-control', pathMatch: 'full' },
  { path: 'repo-blocklist', redirectTo: 'settings/access-control', pathMatch: 'full' },
  { path: 'marketplace', redirectTo: 'settings/integrations', pathMatch: 'full' },
  { path: '**', loadComponent: () => import('./chunk-ZSVSSVA7.js').then((n) => n.RouteErrorComponent) },
];
var ct = (n, t) => {
  if (!ye.apiKey) return t(n);
  const e = n.clone({ setHeaders: { Authorization: `Bearer ${ye.apiKey}` } });
  return t(e);
};
var yt = new Set([0, 502, 503, 504]),
  Ct = 2,
  xt = 1e3,
  lt = (n, t) => {
    const e = n.method.toUpperCase();
    return e !== 'GET' && e !== 'HEAD'
      ? t(n)
      : t(n).pipe(
          Me({
            count: Ct,
            delay: (o, i) => {
              if (o instanceof Xe && yt.has(o.status)) return we(xt * 2 ** (i - 1));
              throw o;
            },
          }),
        );
  };
var dt = (n, t) => {
  const e = u(q);
  return t(n).pipe(
    ke((o) => {
      if (o.status === 404 && n.url.includes('/persona')) return pe(() => o);
      const i = wt(o),
        c = kt(n.method, n.url, o);
      return e.error(i, c), pe(() => o);
    }),
  );
};
function wt(n) {
  if (n.error?.message && typeof n.error.message === 'string') return n.error.message;
  if (n.error?.error && typeof n.error.error === 'string') return n.error.error;
  switch (n.status) {
    case 0:
      return 'Unable to reach the server';
    case 400:
      return 'Bad request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Access denied';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Conflict \u2014 resource already exists';
    case 422:
      return 'Validation error';
    case 429:
      return 'Too many requests \u2014 please slow down';
    case 500:
      return 'Internal server error';
    case 502:
      return 'Server is temporarily unavailable';
    case 503:
      return 'Service unavailable';
    default:
      return `Request failed (${n.status})`;
  }
}
function kt(n, t, e) {
  const o = t.replace(/^https?:\/\/[^/]+/, ''),
    i = [`${n} ${o}`];
  return (
    e.status === 0
      ? i.push('Check your connection or verify the server is running.')
      : e.statusText && e.statusText !== 'Unknown Error' && i.push(e.statusText),
    i.join(' \xB7 ')
  );
}
var pt = { providers: [Ne(), at(), et(st, tt(), nt()), qe(Ze([ct, lt, dt]))] };
var mt = ge('pageRoute', [
  be('* => *', [
    fe(
      ':enter',
      [
        X({ opacity: 0, transform: 'translateY(8px)' }),
        ve('220ms cubic-bezier(0.22, 1, 0.36, 1)', X({ opacity: 1, transform: 'translateY(0)' })),
      ],
      { optional: !0 },
    ),
  ]),
]);
var Mt = [
    { keys: 'Cmd+K', description: 'Open command palette', category: 'General' },
    { keys: '?', description: 'Toggle shortcuts overlay', category: 'General' },
    { keys: 'Esc', description: 'Close modal / overlay', category: 'General' },
    { keys: 'Cmd+T', description: 'New tab', category: 'Tabs' },
    { keys: 'Cmd+W', description: 'Close active tab', category: 'Tabs' },
    { keys: 'Cmd+1-9', description: 'Switch to tab 1-9', category: 'Tabs' },
    { keys: 'n', description: 'New conversation', category: 'Navigation' },
    { keys: 'g h', description: 'Go to Chat Home', category: 'Navigation' },
    { keys: 'g a', description: 'Go to Agents', category: 'Navigation' },
    { keys: 'g s', description: 'Go to Sessions', category: 'Navigation' },
    { keys: 'g w', description: 'Go to Work Tasks', category: 'Navigation' },
    { keys: 'g e', description: 'Go to Settings', category: 'Navigation' },
  ],
  j = class n {
    router = u(z);
    chatTabs = u($);
    overlayOpen = C(!1);
    shortcuts = Mt;
    pendingPrefix = null;
    prefixTimer = null;
    boundHandler = this.handleKeydown.bind(this);
    constructor() {
      document.addEventListener('keydown', this.boundHandler);
    }
    ngOnDestroy() {
      document.removeEventListener('keydown', this.boundHandler), this.clearPrefix();
    }
    toggleOverlay() {
      this.overlayOpen.update((t) => !t);
    }
    closeOverlay() {
      this.overlayOpen.set(!1);
    }
    handleKeydown(t) {
      const e = t.target?.tagName;
      if (e === 'INPUT' || e === 'TEXTAREA' || e === 'SELECT' || t.target?.isContentEditable) return;
      if ((t.metaKey || t.ctrlKey) && t.key !== 'Escape') return this.handleTabShortcut(t), void 0;
      if (t.altKey) return;
      const o = t.key;
      if (o === 'Escape') {
        this.overlayOpen() && (t.preventDefault(), this.closeOverlay()), this.clearPrefix();
        return;
      }
      if (this.pendingPrefix === 'g') {
        switch ((t.preventDefault(), this.clearPrefix(), o)) {
          case 'h':
            this.router.navigate(['/chat']);
            break;
          case 'a':
            this.router.navigate(['/agents']);
            break;
          case 's':
            this.router.navigate(['/sessions']);
            break;
          case 'w':
            this.router.navigate(['/sessions/work-tasks']);
            break;
          case 'e':
            this.router.navigate(['/settings']);
            break;
        }
        return;
      }
      if (o === 'g') {
        t.preventDefault(), (this.pendingPrefix = 'g'), (this.prefixTimer = setTimeout(() => this.clearPrefix(), 1e3));
        return;
      }
      if (o === '?') {
        t.preventDefault(), this.toggleOverlay();
        return;
      }
      if (o === 'n') {
        t.preventDefault(), this.closeOverlay(), this.router.navigate(['/sessions/new']);
        return;
      }
    }
    handleTabShortcut(t) {
      const e = t.key.toLowerCase();
      if (e === 't') return t.preventDefault(), this.router.navigate(['/chat']), !0;
      if (e === 'w') {
        t.preventDefault();
        const i = this.chatTabs.activeSessionId();
        if (i) {
          const c = this.chatTabs.closeTab(i);
          c ? this.router.navigate(['/sessions', c]) : this.router.navigate(['/chat']);
        }
        return !0;
      }
      const o = parseInt(e, 10);
      if (o >= 1 && o <= 9) {
        t.preventDefault();
        const i = o === 9 ? this.chatTabs.switchToLastTab() : this.chatTabs.switchToTabByIndex(o - 1);
        return i && this.router.navigate(['/sessions', i]), !0;
      }
      return !1;
    }
    clearPrefix() {
      (this.pendingPrefix = null), this.prefixTimer && (clearTimeout(this.prefixTimer), (this.prefixTimer = null));
    }
    static \u0275fac = (e) => new (e || n)();
    static \u0275prov = H({ token: n, factory: n.\u0275fac, providedIn: 'root' });
  };
var St = (n) => ({ exact: n }),
  ut = (_n, t) => t.key,
  _t = (_n, t) => t.route;
function Tt(n, _t) {
  if ((n & 1 && (d(0, 'span', 24), a(1, '\u25BE'), l()), n & 2)) {
    const e = s().$implicit,
      o = s();
    P('topnav__tab-chevron--open', o.openDropdown() === e.key);
  }
}
function Pt(n, t) {
  if (n & 1) {
    const e = y();
    d(0, 'a', 26),
      M('click', () => {
        _(e);
        const i = s(3);
        return h(i.closeDropdown());
      }),
      f(1, 'app-icon', 21),
      a(2),
      l();
  }
  if (n & 2) {
    const e = t.$implicit;
    x('routerLink', e.route)('routerLinkActiveOptions', F(5, St, e.route === '/chat')),
      r(),
      x('name', e.icon)('size', 12),
      r(),
      A(' ', e.label, ' ');
  }
}
function Et(n, _t) {
  if ((n & 1 && (d(0, 'div', 23), w(1, Pt, 3, 7, 'a', 25, _t), l()), n & 2)) {
    const e = s().$implicit;
    r(), k(e.children);
  }
}
function Ot(n, t) {
  if (n & 1) {
    const e = y();
    d(0, 'div', 5)(1, 'button', 20),
      M('click', (i) => {
        const c = _(e).$implicit,
          S = s();
        return h(S.onTabClick(c, i));
      }),
      f(2, 'app-icon', 21),
      a(3),
      g(4, Tt, 2, 2, 'span', 22),
      l(),
      g(5, Et, 3, 0, 'div', 23),
      l();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = s();
    r(),
      P('topnav__tab--active', o.isTabActive(e)),
      r(),
      x('name', e.icon)('size', 14),
      r(),
      A(' ', e.label, ' '),
      r(),
      v(e.children.length > 1 ? 4 : -1),
      r(),
      v(o.openDropdown() === e.key && e.children.length > 1 ? 5 : -1);
  }
}
function Dt(n, t) {
  if (n & 1) {
    const e = y();
    d(0, 'a', 32),
      M('click', () => {
        _(e);
        const i = s(3);
        return h(i.mobileOpen.set(!1));
      }),
      f(1, 'app-icon', 21),
      a(2),
      l();
  }
  if (n & 2) {
    const e = t.$implicit;
    x('routerLink', e.route), r(), x('name', e.icon)('size', 14), r(), A(' ', e.label, ' ');
  }
}
function Nt(n, t) {
  if ((n & 1 && (d(0, 'div', 29)(1, 'span', 30), a(2), l(), w(3, Dt, 3, 4, 'a', 31, _t), l()), n & 2)) {
    const e = t.$implicit;
    r(2), b(e.label), r(), k(e.children);
  }
}
function It(n, _t) {
  if (n & 1) {
    const e = y();
    d(0, 'div', 27),
      M('click', () => {
        _(e);
        const i = s();
        return h(i.mobileOpen.set(!1));
      }),
      l(),
      d(1, 'div', 28),
      w(2, Nt, 5, 1, 'div', 29, ut),
      l();
  }
  if (n & 2) {
    const e = s();
    r(2), k(e.tabs());
  }
}
var At = [
    { key: 'home', label: 'Home', icon: 'chat', route: '/chat', matchRoutes: ['/chat'], children: [] },
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
      matchRoutes: ['/dashboard'],
      children: [],
    },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: 'sessions',
      route: '/sessions',
      matchRoutes: ['/sessions'],
      children: [
        { label: 'Conversations', icon: 'sessions', route: '/sessions' },
        { label: 'Work Tasks', icon: 'list', route: '/sessions/work-tasks' },
        { label: 'Councils', icon: 'users', route: '/sessions/councils' },
      ],
    },
    {
      key: 'observe',
      label: 'Observe',
      icon: 'eye',
      route: '/observe',
      matchRoutes: ['/observe', '/library'],
      children: [
        { label: 'Comms', icon: 'activity', route: '/observe' },
        { label: 'Memory', icon: 'database', route: '/observe/memory' },
        { label: 'Library', icon: 'book-open', route: '/library' },
        { label: 'Analytics', icon: 'bar-chart', route: '/observe/analytics' },
        { label: 'Logs', icon: 'terminal', route: '/observe/logs' },
        { label: 'Reputation', icon: 'star', route: '/observe/reputation' },
      ],
    },
    {
      key: 'agents',
      label: 'Agents',
      icon: 'agents',
      route: '/agents',
      matchRoutes: ['/agents'],
      children: [
        { label: 'All Agents', icon: 'agents', route: '/agents' },
        { label: 'Flock Directory', icon: 'globe', route: '/agents/flock-directory' },
        { label: 'Projects', icon: 'code', route: '/agents/projects' },
        { label: 'Models', icon: 'zap', route: '/agents/models' },
      ],
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: 'settings',
      route: '/settings',
      matchRoutes: ['/settings'],
      children: [
        { label: 'General', icon: 'settings', route: '/settings' },
        { label: 'Security', icon: 'shield', route: '/settings/security' },
        { label: 'Access Control', icon: 'lock', route: '/settings/access-control' },
        { label: 'Automation', icon: 'clock', route: '/settings/automation' },
        { label: 'Integrations', icon: 'server', route: '/settings/integrations' },
      ],
    },
  ],
  te = class n {
    wsService = u(B);
    sessionService = u(R);
    apiService = u(ot);
    router = u(z);
    shortcutsService = u(j);
    elRef = u(U);
    tabs = D(() => At);
    openDropdown = C(null);
    mobileOpen = C(!1);
    currentNetwork = C('testnet');
    switching = C(!1);
    currentUrl = '';
    routerSub = null;
    ngOnInit() {
      (this.currentUrl = this.router.url),
        (this.routerSub = this.router.events.pipe(K((t) => t instanceof Y)).subscribe((t) => {
          (this.currentUrl = t.urlAfterRedirects), this.closeDropdown();
        })),
        this.loadNetwork();
    }
    ngOnDestroy() {
      this.routerSub?.unsubscribe();
    }
    onDocumentClick(t) {
      this.elRef.nativeElement.contains(t.target) || this.closeDropdown();
    }
    onEscape() {
      this.closeDropdown(), this.mobileOpen.set(!1);
    }
    isTabActive(t) {
      return t.matchRoutes.some((e) => this.currentUrl.startsWith(e));
    }
    onTabClick(t, e) {
      if ((e.stopPropagation(), this.openDropdown() === t.key)) {
        this.closeDropdown();
        return;
      }
      if (t.children.length > 1) {
        this.openDropdown.set(t.key);
        return;
      }
      this.router.navigate([t.route]);
    }
    closeDropdown() {
      this.openDropdown.set(null);
    }
    openCommandPalette() {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: !0 }));
    }
    openHelp() {
      this.shortcutsService.overlayOpen.set(!0);
    }
    async loadNetwork() {
      try {
        await this.sessionService.loadAlgoChatStatus();
        const t = this.sessionService.algochatStatus();
        t?.network && this.currentNetwork.set(t.network);
      } catch {}
    }
    async switchNetwork(t) {
      if (!(t === this.currentNetwork() || this.switching())) {
        this.switching.set(!0);
        try {
          await xe(this.apiService.post('/algochat/network', { network: t })),
            this.currentNetwork.set(t),
            await this.sessionService.loadAlgoChatStatus();
        } catch (e) {
          console.error('Failed to switch network:', e);
        } finally {
          this.switching.set(!1);
        }
      }
    }
    static \u0275fac = (e) => new (e || n)();
    static \u0275cmp = T({
      type: n,
      selectors: [['app-top-nav']],
      hostBindings: (e, o) => {
        e & 1 && M('click', (c) => o.onDocumentClick(c), ue)('keydown.escape', () => o.onEscape(), ue);
      },
      decls: 30,
      vars: 15,
      consts: [
        ['role', 'navigation', 'aria-label', 'Main navigation', 1, 'topnav'],
        [1, 'topnav__left'],
        ['routerLink', '/chat', 1, 'topnav__logo'],
        [1, 'topnav__logo-text'],
        [1, 'topnav__tabs'],
        [1, 'topnav__tab-wrapper'],
        [1, 'topnav__right'],
        ['role', 'group', 'aria-label', 'Network selector', 1, 'topnav__network'],
        ['aria-label', 'Switch to testnet', 1, 'network-btn', 3, 'click', 'disabled'],
        ['aria-label', 'Switch to mainnet', 1, 'network-btn', 3, 'click', 'disabled'],
        ['title', 'Command palette (Cmd+K)', 'type', 'button', 1, 'topnav__search-btn', 3, 'click'],
        ['name', 'search', 3, 'size'],
        [1, 'topnav__search-label'],
        [1, 'topnav__search-kbd'],
        [1, 'topnav__status'],
        [3, 'status'],
        ['title', 'Keyboard shortcuts (?)', 'type', 'button', 1, 'topnav__help', 3, 'click'],
        ['name', 'help', 3, 'size'],
        ['aria-label', 'Toggle navigation', 'type', 'button', 1, 'topnav__hamburger', 3, 'click'],
        [1, 'topnav__hamburger-icon'],
        ['type', 'button', 1, 'topnav__tab', 3, 'click'],
        [3, 'name', 'size'],
        [1, 'topnav__tab-chevron', 3, 'topnav__tab-chevron--open'],
        [1, 'topnav__dropdown'],
        [1, 'topnav__tab-chevron'],
        [
          'routerLinkActive',
          'topnav__dropdown-item--active',
          1,
          'topnav__dropdown-item',
          3,
          'routerLink',
          'routerLinkActiveOptions',
        ],
        [
          'routerLinkActive',
          'topnav__dropdown-item--active',
          1,
          'topnav__dropdown-item',
          3,
          'click',
          'routerLink',
          'routerLinkActiveOptions',
        ],
        [1, 'topnav-mobile-backdrop', 3, 'click'],
        [1, 'topnav-mobile'],
        [1, 'topnav-mobile__section'],
        [1, 'topnav-mobile__section-label'],
        ['routerLinkActive', 'topnav-mobile__link--active', 1, 'topnav-mobile__link', 3, 'routerLink'],
        ['routerLinkActive', 'topnav-mobile__link--active', 1, 'topnav-mobile__link', 3, 'click', 'routerLink'],
      ],
      template: (e, o) => {
        e & 1 &&
          (d(0, 'nav', 0)(1, 'div', 1)(2, 'a', 2)(3, 'span', 3),
          a(4, 'CorvidAgent'),
          l()(),
          d(5, 'div', 4),
          w(6, Ot, 6, 7, 'div', 5, ut),
          l()(),
          d(8, 'div', 6)(9, 'div', 7)(10, 'button', 8),
          M('click', () => o.switchNetwork('testnet')),
          a(11, 'TEST'),
          l(),
          d(12, 'button', 9),
          M('click', () => o.switchNetwork('mainnet')),
          a(13, 'MAIN'),
          l()(),
          d(14, 'button', 10),
          M('click', () => o.openCommandPalette()),
          f(15, 'app-icon', 11),
          d(16, 'span', 12),
          a(17, 'Search...'),
          l(),
          d(18, 'kbd', 13),
          a(19, '\u2318K'),
          l()(),
          d(20, 'div', 14),
          f(21, 'app-status-badge', 15),
          l(),
          d(22, 'button', 16),
          M('click', () => o.openHelp()),
          f(23, 'app-icon', 17),
          l()(),
          d(24, 'button', 18),
          M('click', () => o.mobileOpen.set(!o.mobileOpen())),
          d(25, 'span', 19),
          f(26, 'span')(27, 'span')(28, 'span'),
          l()()(),
          g(29, It, 4, 0)),
          e & 2 &&
            (r(6),
            k(o.tabs()),
            r(4),
            P('network-btn--active', o.currentNetwork() === 'testnet')(
              'network-btn--testnet',
              o.currentNetwork() === 'testnet',
            ),
            x('disabled', o.switching()),
            r(2),
            P('network-btn--active', o.currentNetwork() === 'mainnet')(
              'network-btn--mainnet',
              o.currentNetwork() === 'mainnet',
            ),
            x('disabled', o.switching()),
            r(3),
            x('size', 12),
            r(6),
            x('status', o.wsService.connectionStatus()),
            r(2),
            x('size', 14),
            r(),
            O('aria-expanded', o.mobileOpen()),
            r(5),
            v(o.mobileOpen() ? 29 : -1));
      },
      dependencies: [V, Q, ee, J],
      styles: [
        '.topnav[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 1.25rem;background:var(--glass-bg-solid);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle);position:relative;z-index:100}.topnav__left[_ngcontent-%COMP%]{display:flex;align-items:center;gap:1.5rem}.topnav__logo[_ngcontent-%COMP%]{text-decoration:none;display:flex;align-items:center}.topnav__logo-text[_ngcontent-%COMP%]{font-family:Dogica Pixel,Dogica,monospace;font-size:1rem;font-weight:700;background:linear-gradient(135deg,var(--accent-cyan),var(--accent-magenta));background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:gradientShift 8s ease infinite;letter-spacing:.06em}.topnav__tabs[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.25rem}.topnav__tab-wrapper[_ngcontent-%COMP%]{position:relative}.topnav__tab[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.3rem;padding:.5rem 1rem;background:none;border:none;color:var(--text-secondary);font-family:inherit;font-size:.8rem;font-weight:600;letter-spacing:.04em;cursor:pointer;transition:color .15s,background .15s;border-bottom:2px solid transparent;height:48px;text-transform:uppercase}.topnav__tab[_ngcontent-%COMP%]:hover{color:var(--text-primary);background:var(--bg-hover)}.topnav__tab--active[_ngcontent-%COMP%]{color:var(--accent-cyan);border-bottom-color:var(--accent-cyan);text-shadow:0 0 8px var(--accent-cyan-border);background:linear-gradient(180deg,transparent 0%,var(--accent-cyan-subtle) 100%)}.topnav__tab-chevron[_ngcontent-%COMP%]{font-size:.6rem;transition:transform .15s ease}.topnav__tab-chevron--open[_ngcontent-%COMP%]{transform:rotate(180deg)}.topnav__dropdown[_ngcontent-%COMP%]{position:absolute;top:100%;left:0;min-width:190px;background:#161822eb;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--border-faint);border-radius:var(--radius-lg, 10px);padding:.4rem 0;z-index:200;box-shadow:0 12px 40px var(--shadow-deep),0 0 0 1px var(--accent-cyan-subtle);animation:_ngcontent-%COMP%_dropdownIn .15s ease-out}@keyframes _ngcontent-%COMP%_dropdownIn{0%{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}.topnav__dropdown-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.5rem 1rem;color:var(--text-secondary);text-decoration:none;font-size:.75rem;letter-spacing:.03em;transition:background .1s,color .1s}.topnav__dropdown-item[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--accent-cyan)}.topnav__dropdown-item--active[_ngcontent-%COMP%]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}.topnav__right[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.75rem}.topnav__network[_ngcontent-%COMP%]{display:flex;border:1px solid var(--border-bright);border-radius:var(--radius, 6px);overflow:hidden}.network-btn[_ngcontent-%COMP%]{padding:.25rem .5rem;font-family:inherit;font-size:.55rem;font-weight:700;letter-spacing:.06em;border:none;background:transparent;color:var(--text-tertiary);cursor:pointer;transition:background .15s,color .15s;text-transform:uppercase}.network-btn[_ngcontent-%COMP%]:hover:not(:disabled):not(.network-btn--active){background:var(--bg-hover);color:var(--text-secondary)}.network-btn[_ngcontent-%COMP%]:disabled{opacity:.4;cursor:not-allowed}.network-btn--active.network-btn--testnet[_ngcontent-%COMP%]{background:#4a90d926;color:#4a90d9}.network-btn--active.network-btn--mainnet[_ngcontent-%COMP%]{background:#50e3c226;color:#50e3c2}.topnav__status[_ngcontent-%COMP%]{display:flex;align-items:center}.topnav__help[_ngcontent-%COMP%]{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:1px solid var(--border-bright);border-radius:var(--radius, 6px);color:var(--text-tertiary);font-family:inherit;font-size:.75rem;font-weight:700;cursor:pointer;transition:color .15s,border-color .15s}.topnav__help[_ngcontent-%COMP%]:hover{color:var(--accent-cyan);border-color:var(--accent-cyan)}.topnav__search-btn[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.3rem .7rem;background:#0c0d1499;border:1px solid var(--border-subtle);border-radius:var(--radius-lg, 10px);color:var(--text-tertiary);font-family:inherit;font-size:.7rem;cursor:pointer;transition:border-color .2s,color .2s,box-shadow .2s;min-width:160px}.topnav__search-btn[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan-border);color:var(--text-secondary);box-shadow:0 0 12px var(--accent-cyan-subtle)}.topnav__search-label[_ngcontent-%COMP%]{flex:1;text-align:left}.topnav__search-kbd[_ngcontent-%COMP%]{padding:.08rem .3rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:3px;font-family:inherit;font-size:.55rem;color:var(--text-tertiary)}.topnav__hamburger[_ngcontent-%COMP%]{display:none;background:none;border:1px solid var(--border);border-radius:var(--radius, 4px);padding:.35rem;cursor:pointer;width:34px;height:34px;align-items:center;justify-content:center}.topnav__hamburger-icon[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:3px;width:16px}.topnav__hamburger-icon[_ngcontent-%COMP%]   span[_ngcontent-%COMP%]{display:block;height:2px;width:100%;background:var(--text-secondary);border-radius:1px}.topnav-mobile-backdrop[_ngcontent-%COMP%], .topnav-mobile[_ngcontent-%COMP%]{display:none}@media(max-width:767px){.topnav[_ngcontent-%COMP%]{height:40px}.topnav__tabs[_ngcontent-%COMP%], .topnav__right[_ngcontent-%COMP%]{display:none}.topnav__hamburger[_ngcontent-%COMP%]{display:flex}.topnav-mobile-backdrop[_ngcontent-%COMP%]{display:block;position:fixed;inset:0;background:var(--overlay);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);z-index:998}.topnav-mobile[_ngcontent-%COMP%]{display:flex;flex-direction:column;position:fixed;inset:40px 0 0;background:var(--bg-surface);z-index:999;overflow-y:auto;padding:1rem 0}.topnav-mobile__section[_ngcontent-%COMP%]{padding:.5rem 0;border-bottom:1px solid var(--border)}.topnav-mobile__section-label[_ngcontent-%COMP%]{display:block;padding:.4rem 1.5rem;font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-tertiary);font-weight:700}.topnav-mobile__link[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.6rem;padding:.75rem 1.5rem;color:var(--text-secondary);text-decoration:none;font-size:.85rem;transition:background .1s,color .1s}.topnav-mobile__link[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--accent-cyan)}.topnav-mobile__link--active[_ngcontent-%COMP%]{color:var(--accent-cyan);background:var(--accent-cyan-dim)}}',
      ],
      changeDetection: 0,
    });
  };
var zt = (n) => ['/sessions', n],
  Rt = (_n, t) => t.sessionId;
function Lt(n, _t) {
  if ((n & 1 && (d(0, 'span', 4), a(1), l()), n & 2)) {
    const e = s(2);
    r(), b(e.tabsService.tabs().length);
  }
}
function Ft(n, _t) {
  n & 1 && f(0, 'span', 11);
}
function Vt(n, _t) {
  n & 1 && f(0, 'span', 11);
}
function jt(n, _t) {
  n & 1 && f(0, 'span', 11);
}
function Gt(n, _t) {
  n & 1 && a(0, ' ! ');
}
function Bt(_n, _t) {}
function $t(n, _t) {
  if ((n & 1 && (d(0, 'span', 12), a(1), l()), n & 2)) {
    const e = s().$implicit;
    r(), b(e.agentName);
  }
}
function Kt(n, t) {
  if (n & 1) {
    const e = y();
    d(0, 'a', 8)(1, 'span', 9),
      a(2),
      l(),
      d(3, 'span', 10),
      g(4, Ft, 1, 0, 'span', 11)(5, Vt, 1, 0, 'span', 11)(6, jt, 1, 0, 'span', 11)(7, Gt, 1, 0)(8, Bt, 0, 0),
      l(),
      g(9, $t, 2, 1, 'span', 12),
      d(10, 'span', 13),
      a(11),
      l(),
      d(12, 'button', 14),
      M('click', (i) => {
        const c = _(e).$implicit,
          S = s(3);
        return h(S.closeTab(c.sessionId, i));
      }),
      a(13, '\xD7'),
      l()();
  }
  if (n & 2) {
    let e,
      o = t.$implicit,
      i = t.$index,
      c = s(3);
    P('tab--active', c.tabsService.activeSessionId() === o.sessionId)(
      'tab--running',
      o.status === 'running' || o.status === 'thinking' || o.status === 'tool_use',
    )('tab--error', o.status === 'error'),
      x('routerLink', F(12, zt, o.sessionId))('title', (o.agentName ? `${o.agentName} \u2014 ` : '') + o.label),
      r(2),
      b(i < 9 ? i + 1 : ''),
      r(2),
      v((e = o.status) === 'running' ? 4 : e === 'thinking' ? 5 : e === 'tool_use' ? 6 : e === 'error' ? 7 : 8),
      r(5),
      v(o.agentName ? 9 : -1),
      r(2),
      b(o.label);
  }
}
function Ht(n, _t) {
  if (n & 1) {
    const e = y();
    d(0, 'div', 5),
      w(1, Kt, 14, 14, 'a', 6, Rt),
      l(),
      d(3, 'button', 7),
      M('click', () => {
        _(e);
        const i = s(2);
        return h(i.newChat());
      }),
      a(4, '+'),
      l();
  }
  if (n & 2) {
    const e = s(2);
    r(), k(e.tabsService.tabs());
  }
}
function Wt(n, _t) {
  if (n & 1) {
    const e = y();
    d(0, 'div', 1)(1, 'button', 2),
      M('click', () => {
        _(e);
        const i = s();
        return h(i.toggleCollapse());
      }),
      d(2, 'span', 3),
      a(3, '\u25BE'),
      l(),
      g(4, Lt, 2, 1, 'span', 4),
      l(),
      g(5, Ht, 5, 0),
      l();
  }
  if (n & 2) {
    const e = s();
    P('tab-bar--collapsed', e.collapsed()),
      r(),
      x('title', e.collapsed() ? `Show tabs (${e.tabsService.tabs().length} open)` : 'Hide tabs'),
      r(),
      P('tab-bar__collapse-chevron--down', e.collapsed()),
      r(2),
      v(e.collapsed() ? 4 : -1),
      r(),
      v(e.collapsed() ? -1 : 5);
  }
}
var ht = 'corvid-chat-tabs-collapsed',
  ne = class n {
    tabsService = u($);
    router = u(z);
    collapsed = C(localStorage.getItem(ht) === 'true');
    toggleCollapse() {
      const t = !this.collapsed();
      this.collapsed.set(t), localStorage.setItem(ht, String(t));
    }
    closeTab(t, e) {
      e.preventDefault(), e.stopPropagation();
      const o = this.tabsService.closeTab(t);
      o ? this.router.navigate(['/sessions', o]) : this.router.navigate(['/chat']);
    }
    newChat() {
      this.router.navigate(['/chat']);
    }
    static \u0275fac = (e) => new (e || n)();
    static \u0275cmp = T({
      type: n,
      selectors: [['app-chat-tab-bar']],
      decls: 1,
      vars: 1,
      consts: [
        [1, 'tab-bar', 3, 'tab-bar--collapsed'],
        [1, 'tab-bar'],
        ['type', 'button', 1, 'tab-bar__collapse', 3, 'click', 'title'],
        [1, 'tab-bar__collapse-chevron'],
        [1, 'tab-bar__collapse-count'],
        [1, 'tab-bar__tabs'],
        [1, 'tab', 3, 'tab--active', 'tab--running', 'tab--error', 'routerLink', 'title'],
        ['title', 'New conversation (Cmd+T)', 'type', 'button', 1, 'tab-bar__new', 3, 'click'],
        [1, 'tab', 3, 'routerLink', 'title'],
        [1, 'tab__index'],
        [1, 'tab__status'],
        [1, 'tab__pulse'],
        [1, 'tab__agent'],
        [1, 'tab__label'],
        ['title', 'Close tab (Cmd+W)', 'type', 'button', 1, 'tab__close', 3, 'click'],
      ],
      template: (e, o) => {
        e & 1 && g(0, Wt, 6, 7, 'div', 0), e & 2 && v(o.tabsService.tabs().length > 0 ? 0 : -1);
      },
      dependencies: [V],
      styles: [
        '.tab-bar[_ngcontent-%COMP%]{display:flex;align-items:center;background:var(--bg-surface, #1a1a2e);border-bottom:1px solid var(--border, #2a2a3e);height:36px;padding:0 .25rem;gap:.25rem;min-width:0}.tab-bar--collapsed[_ngcontent-%COMP%]{height:24px}.tab-bar__collapse[_ngcontent-%COMP%]{flex-shrink:0;display:flex;align-items:center;gap:.25rem;background:none;border:none;color:var(--text-tertiary, #666);font-family:inherit;font-size:.6rem;cursor:pointer;padding:.15rem .35rem;border-radius:3px;transition:color .15s,background .15s}.tab-bar__collapse[_ngcontent-%COMP%]:hover{color:var(--accent-cyan, #0ef);background:var(--bg-hover, #252538)}.tab-bar__collapse-chevron[_ngcontent-%COMP%]{font-size:.55rem;transition:transform .15s ease;transform:rotate(-90deg)}.tab-bar__collapse-chevron--down[_ngcontent-%COMP%]{transform:rotate(0)}.tab-bar__collapse-count[_ngcontent-%COMP%]{font-size:.55rem;font-weight:700;color:var(--accent-cyan, #0ef)}.tab-bar__tabs[_ngcontent-%COMP%]{display:flex;flex:1;min-width:0;gap:2px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--border, #2a2a3e) transparent}.tab-bar__tabs[_ngcontent-%COMP%]::-webkit-scrollbar{height:3px}.tab-bar__tabs[_ngcontent-%COMP%]::-webkit-scrollbar-track{background:transparent}.tab-bar__tabs[_ngcontent-%COMP%]::-webkit-scrollbar-thumb{background:var(--border, #2a2a3e);border-radius:3px}.tab[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.3rem;padding:.25rem .5rem;background:transparent;border:none;border-radius:4px 4px 0 0;color:var(--text-tertiary, #666);font-family:inherit;font-size:.68rem;text-decoration:none;cursor:pointer;transition:background .1s,color .1s;max-width:180px;min-width:0;white-space:nowrap;flex-shrink:0}.tab[_ngcontent-%COMP%]:hover{background:var(--bg-hover, #252538);color:var(--text-secondary, #bbb)}.tab--active[_ngcontent-%COMP%]{background:var(--bg-deep, #111);color:var(--text-primary, #eee);border-bottom:2px solid var(--accent-cyan, #0ef)}.tab--running[_ngcontent-%COMP%]   .tab__status[_ngcontent-%COMP%]{color:var(--accent-cyan, #0ef)}.tab--error[_ngcontent-%COMP%]   .tab__status[_ngcontent-%COMP%]{color:var(--accent-red, #f33)}.tab__index[_ngcontent-%COMP%]{flex-shrink:0;font-size:.55rem;color:var(--text-quaternary, #555);min-width:8px;text-align:center}.tab--active[_ngcontent-%COMP%]   .tab__index[_ngcontent-%COMP%]{color:var(--text-tertiary, #888)}.tab__status[_ngcontent-%COMP%]{flex-shrink:0;width:10px;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700}.tab__agent[_ngcontent-%COMP%]{flex-shrink:0;font-size:.6rem;color:var(--accent-cyan, #0ef);opacity:.7;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tab__pulse[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;background:var(--accent-cyan, #0ef);animation:_ngcontent-%COMP%_pulse 1.5s ease-in-out infinite}@keyframes _ngcontent-%COMP%_pulse{0%,to{opacity:.4}50%{opacity:1}}.tab__label[_ngcontent-%COMP%]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tab__close[_ngcontent-%COMP%]{flex-shrink:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:2px;color:var(--text-tertiary, #666);font-size:.8rem;cursor:pointer;opacity:0;transition:opacity .1s,background .1s}.tab[_ngcontent-%COMP%]:hover   .tab__close[_ngcontent-%COMP%]{opacity:1}.tab__close[_ngcontent-%COMP%]:hover{background:var(--accent-red-dim, var(--accent-red-dim));color:var(--accent-red, #f33)}.tab-bar__new[_ngcontent-%COMP%]{flex-shrink:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border, #333);border-radius:4px;color:var(--text-tertiary, #666);font-size:1rem;cursor:pointer;transition:color .15s,border-color .15s}.tab-bar__new[_ngcontent-%COMP%]:hover{color:var(--accent-cyan, #0ef);border-color:var(--accent-cyan, #0ef)}',
      ],
      changeDetection: 0,
    });
  };
var oe = class n {
  position = We('right');
  resized = he();
  resizeEnd = he();
  dragging = !1;
  startX = 0;
  startY = 0;
  el = u(U);
  boundMouseMove = this.onMouseMove.bind(this);
  boundMouseUp = this.onMouseUp.bind(this);
  boundTouchMove = this.onTouchMove.bind(this);
  boundTouchEnd = this.onTouchEnd.bind(this);
  onMouseDown(t) {
    t.preventDefault(),
      this.startDrag(t.clientX, t.clientY),
      document.addEventListener('mousemove', this.boundMouseMove),
      document.addEventListener('mouseup', this.boundMouseUp);
  }
  onTouchStart(t) {
    if (t.touches.length !== 1) return;
    const e = t.touches[0];
    this.startDrag(e.clientX, e.clientY),
      document.addEventListener('touchmove', this.boundTouchMove, { passive: !1 }),
      document.addEventListener('touchend', this.boundTouchEnd);
  }
  onKeyDown(t) {
    const e = t.shiftKey ? 20 : 4,
      o = this.position(),
      i = o === 'left' || o === 'right';
    i && t.key === 'ArrowLeft'
      ? (t.preventDefault(), this.resized.emit(o === 'left' ? e : -e))
      : i && t.key === 'ArrowRight'
        ? (t.preventDefault(), this.resized.emit(o === 'left' ? -e : e))
        : !i && t.key === 'ArrowUp'
          ? (t.preventDefault(), this.resized.emit(o === 'top' ? e : -e))
          : !i && t.key === 'ArrowDown' && (t.preventDefault(), this.resized.emit(o === 'top' ? -e : e));
  }
  ngOnDestroy() {
    this.cleanupListeners();
  }
  startDrag(t, e) {
    (this.dragging = !0),
      (this.startX = t),
      (this.startY = e),
      (document.body.style.cursor =
        this.position() === 'left' || this.position() === 'right' ? 'col-resize' : 'row-resize'),
      (document.body.style.userSelect = 'none');
  }
  onMouseMove(t) {
    this.emitDelta(t.clientX, t.clientY);
  }
  onTouchMove(t) {
    if ((t.preventDefault(), t.touches.length !== 1)) return;
    const e = t.touches[0];
    this.emitDelta(e.clientX, e.clientY);
  }
  emitDelta(t, e) {
    let o = this.position(),
      i;
    o === 'right'
      ? (i = this.startX - t)
      : o === 'left'
        ? (i = t - this.startX)
        : o === 'bottom'
          ? (i = this.startY - e)
          : (i = e - this.startY),
      (this.startX = t),
      (this.startY = e),
      this.resized.emit(i);
  }
  onMouseUp() {
    this.endDrag(),
      document.removeEventListener('mousemove', this.boundMouseMove),
      document.removeEventListener('mouseup', this.boundMouseUp);
  }
  onTouchEnd() {
    this.endDrag(),
      document.removeEventListener('touchmove', this.boundTouchMove),
      document.removeEventListener('touchend', this.boundTouchEnd);
  }
  endDrag() {
    (this.dragging = !1),
      (document.body.style.cursor = ''),
      (document.body.style.userSelect = ''),
      this.resizeEnd.emit();
  }
  cleanupListeners() {
    document.removeEventListener('mousemove', this.boundMouseMove),
      document.removeEventListener('mouseup', this.boundMouseUp),
      document.removeEventListener('touchmove', this.boundTouchMove),
      document.removeEventListener('touchend', this.boundTouchEnd);
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-resize-handle']],
    inputs: { position: [1, 'position'] },
    outputs: { resized: 'resized', resizeEnd: 'resizeEnd' },
    decls: 2,
    vars: 7,
    consts: [
      [
        'role',
        'separator',
        'aria-label',
        'Resize handle',
        'tabindex',
        '0',
        1,
        'resize-handle',
        3,
        'mousedown',
        'touchstart',
        'keydown',
      ],
      [1, 'resize-handle__indicator'],
    ],
    template: (e, o) => {
      e & 1 &&
        (m(0, 'div', 0),
        E('mousedown', (c) => o.onMouseDown(c))('touchstart', (c) => o.onTouchStart(c))('keydown', (c) =>
          o.onKeyDown(c),
        ),
        I(1, 'div', 1),
        p()),
        e & 2 &&
          (P('resize-handle--horizontal', o.position() === 'left' || o.position() === 'right')(
            'resize-handle--vertical',
            o.position() === 'top' || o.position() === 'bottom',
          )('resize-handle--dragging', o.dragging),
          O('aria-orientation', o.position() === 'left' || o.position() === 'right' ? 'vertical' : 'horizontal'));
    },
    styles: [
      '.resize-handle[_ngcontent-%COMP%]{position:relative;z-index:10;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s ease}.resize-handle--horizontal[_ngcontent-%COMP%]{width:6px;cursor:col-resize;margin:0 -2px}.resize-handle--vertical[_ngcontent-%COMP%]{height:6px;cursor:row-resize;margin:-2px 0}.resize-handle[_ngcontent-%COMP%]:hover, .resize-handle--dragging[_ngcontent-%COMP%]{background:var(--accent-cyan-subtle)}.resize-handle__indicator[_ngcontent-%COMP%]{border-radius:2px;background:var(--border-bright, #2a2d48);transition:background .15s ease,box-shadow .15s ease}.resize-handle--horizontal[_ngcontent-%COMP%]   .resize-handle__indicator[_ngcontent-%COMP%]{width:2px;height:24px}.resize-handle--vertical[_ngcontent-%COMP%]   .resize-handle__indicator[_ngcontent-%COMP%]{width:24px;height:2px}.resize-handle[_ngcontent-%COMP%]:hover   .resize-handle__indicator[_ngcontent-%COMP%], .resize-handle--dragging[_ngcontent-%COMP%]   .resize-handle__indicator[_ngcontent-%COMP%]{background:var(--accent-cyan, #00e5ff);box-shadow:0 0 6px var(--accent-cyan-glow)}@media(max-width:767px){.resize-handle[_ngcontent-%COMP%]{display:none}}@media(prefers-reduced-motion:reduce){.resize-handle[_ngcontent-%COMP%], .resize-handle__indicator[_ngcontent-%COMP%]{transition:none!important}}',
    ],
    changeDetection: 0,
  });
};
var Ut = (n) => ['/sessions', n],
  Yt = (_n, t) => t.id;
function Qt(n, _t) {
  if (n & 1) {
    const e = y();
    d(0, 'app-resize-handle', 4),
      M('resized', (i) => {
        _(e);
        const c = s();
        return h(c.onResize(i));
      })('resizeEnd', () => {
        _(e);
        const i = s();
        return h(i.onResizeEnd());
      }),
      l();
  }
}
function Xt(n, _t) {
  n & 1 && (d(0, 'p', 7), a(1, 'No active sessions'), l());
}
function qt(n, t) {
  if ((n & 1 && (d(0, 'a', 8)(1, 'div', 13)(2, 'span', 14), a(3), l(), f(4, 'app-status-badge', 11), l()()), n & 2)) {
    const e = t.$implicit;
    x('routerLink', F(3, Ut, e.id)), r(3), b(e.name || 'Session'), r(), x('status', e.status);
  }
}
function Zt(n, _t) {
  if (
    (n & 1 &&
      (d(0, 'div', 3)(1, 'div', 5)(2, 'h3', 6),
      a(3, 'Active Sessions'),
      l(),
      g(4, Xt, 2, 0, 'p', 7),
      w(5, qt, 5, 5, 'a', 8, Yt),
      l(),
      d(7, 'div', 5)(8, 'h3', 6),
      a(9, 'System'),
      l(),
      d(10, 'div', 9)(11, 'span', 10),
      a(12, 'WebSocket'),
      l(),
      f(13, 'app-status-badge', 11),
      l(),
      d(14, 'div', 9)(15, 'span', 10),
      a(16, 'Sessions'),
      l(),
      d(17, 'span', 12),
      a(18),
      l()()()()),
    n & 2)
  ) {
    const e = s();
    r(4),
      v(e.activeSessions().length === 0 ? 4 : -1),
      r(),
      k(e.activeSessions()),
      r(8),
      x('status', e.wsService.connectionStatus()),
      r(5),
      b(e.sessionCount());
  }
}
var ie = class n {
  wsService = u(B);
  sessionService = u(R);
  open = C(typeof localStorage < 'u' && localStorage.getItem('activity_rail_open') === 'true');
  customWidth = C(this.loadWidth());
  effectiveWidth = D(() => (this.open() ? this.customWidth() : 36));
  interval = null;
  activeSessions = D(() =>
    this.sessionService
      .sessions()
      .filter((e) => e.status === 'running' || e.status === 'thinking' || e.status === 'tool_use')
      .slice(0, 10),
  );
  sessionCount = D(() => this.sessionService.sessions().length);
  constructor() {
    W(() => {
      const t = this.open();
      typeof localStorage < 'u' && localStorage.setItem('activity_rail_open', String(t));
    });
  }
  ngOnInit() {
    this.sessionService.loadSessions(),
      (this.interval = setInterval(() => {
        this.sessionService.loadSessions();
      }, 15e3));
  }
  ngOnDestroy() {
    this.interval && clearInterval(this.interval);
  }
  toggle() {
    this.open.set(!this.open());
  }
  onResize(t) {
    const e = this.customWidth(),
      o = Math.max(180, Math.min(500, e + t));
    this.customWidth.set(o);
  }
  onResizeEnd() {
    typeof localStorage < 'u' && localStorage.setItem('activity_rail_width', String(this.customWidth()));
  }
  loadWidth() {
    if (typeof localStorage < 'u') {
      const t = localStorage.getItem('activity_rail_width');
      if (t) {
        const e = parseInt(t, 10);
        if (!Number.isNaN(e) && e >= 180 && e <= 500) return e;
      }
    }
    return 260;
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-activity-rail']],
    decls: 5,
    vars: 11,
    consts: [
      ['position', 'left'],
      ['role', 'complementary', 'aria-label', 'Activity panel', 1, 'rail'],
      ['type', 'button', 1, 'rail__toggle', 3, 'click'],
      [1, 'rail__content'],
      ['position', 'left', 3, 'resized', 'resizeEnd'],
      [1, 'rail__section'],
      [1, 'rail__heading'],
      [1, 'rail__empty'],
      [1, 'rail__item', 3, 'routerLink'],
      [1, 'rail__stat'],
      [1, 'rail__stat-label'],
      [3, 'status'],
      [1, 'rail__stat-value'],
      [1, 'rail__item-top'],
      [1, 'rail__item-name'],
    ],
    template: (e, o) => {
      e & 1 &&
        (g(0, Qt, 1, 0, 'app-resize-handle', 0),
        d(1, 'aside', 1)(2, 'button', 2),
        M('click', () => o.toggle()),
        a(3),
        l(),
        g(4, Zt, 19, 3, 'div', 3),
        l()),
        e & 2 &&
          (v(o.open() ? 0 : -1),
          r(),
          G('width', o.effectiveWidth(), 'px')('min-width', o.effectiveWidth(), 'px'),
          P('rail--open', o.open()),
          r(),
          O('aria-expanded', o.open())('title', o.open() ? 'Collapse activity' : 'Show activity'),
          r(),
          A(' ', o.open() ? '\xBB' : '\xAB', ' '),
          r(),
          v(o.open() ? 4 : -1));
    },
    dependencies: [V, ee, oe],
    styles: [
      '[_nghost-%COMP%]{display:flex;flex-shrink:0}.rail[_ngcontent-%COMP%]{width:100%;min-width:0;background:var(--glass-bg-solid);border-left:1px solid var(--border-subtle);display:flex;flex-direction:column;transition:width .2s ease,min-width .2s ease;overflow:hidden}.rail__toggle[_ngcontent-%COMP%]{width:100%;padding:.6rem;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:.85rem;font-family:inherit;cursor:pointer;transition:color .15s,background .15s}.rail__toggle[_ngcontent-%COMP%]:hover{color:var(--accent-cyan);background:var(--bg-hover)}.rail__content[_ngcontent-%COMP%]{flex:1;overflow-y:auto;padding:.5rem 0}.rail__section[_ngcontent-%COMP%]{padding:.5rem .75rem;border-bottom:1px solid var(--border)}.rail__section[_ngcontent-%COMP%]:last-child{border-bottom:none}.rail__heading[_ngcontent-%COMP%]{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-tertiary);font-weight:700;margin:0 0 .5rem}.rail__empty[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);margin:0;padding:.25rem 0}.rail__item[_ngcontent-%COMP%]{display:block;padding:.4rem .5rem;margin:.2rem 0;border-radius:var(--radius, 6px);text-decoration:none;color:var(--text-secondary);transition:background .1s}.rail__item[_ngcontent-%COMP%]:hover{background:var(--bg-hover);color:var(--text-primary)}.rail__item-top[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;gap:.4rem}.rail__item-name[_ngcontent-%COMP%]{font-size:.72rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rail__stat[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;padding:.3rem 0}.rail__stat-label[_ngcontent-%COMP%]{font-size:.68rem;color:var(--text-secondary)}.rail__stat-value[_ngcontent-%COMP%]{font-size:.68rem;color:var(--text-primary);font-weight:600}@media(max-width:767px){.rail[_ngcontent-%COMP%]{display:none}}',
    ],
    changeDetection: 0,
  });
};
var Jt = ['searchInput'],
  en = (_n, t) => t.category,
  tn = (_n, t) => t.id;
function nn(n, _t) {
  if ((n & 1 && (m(0, 'div', 9), a(1), p()), n & 2)) {
    const e = s(2);
    r(), A('No results for "', e.query(), '"');
  }
}
function on(n, t) {
  if (n & 1) {
    const e = y();
    m(0, 'button', 14),
      E('click', () => {
        const i = _(e).$implicit,
          c = s(4);
        return h(c.execute(i));
      })('mouseenter', () => {
        const i = _(e).$implicit,
          c = s(4);
        return h(c.selectedIndex.set(c.getGlobalIndex(i.id)));
      }),
      m(1, 'span', 15),
      a(2),
      p(),
      m(3, 'span', 16),
      a(4),
      p(),
      m(5, 'span', 17),
      a(6),
      p()();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = s(4);
    P('palette__item--active', e.id === o.activeId()), r(2), b(e.icon), r(2), b(e.label), r(2), b(e.category);
  }
}
function rn(n, t) {
  if ((n & 1 && (m(0, 'div', 11)(1, 'div', 12), a(2), p(), w(3, on, 7, 5, 'button', 13, tn), p()), n & 2)) {
    const e = t.$implicit;
    r(2), b(e.category), r(), k(e.items);
  }
}
function an(n, _t) {
  if ((n & 1 && w(0, rn, 5, 1, 'div', 11, en), n & 2)) {
    const e = s(2);
    k(e.groupedResults());
  }
}
function sn(n, _t) {
  if (n & 1) {
    const e = y();
    m(0, 'div', 2),
      E('click', () => {
        _(e);
        const i = s();
        return h(i.close());
      })('keydown.escape', () => {
        _(e);
        const i = s();
        return h(i.close());
      }),
      m(1, 'div', 3),
      E('click', (i) => (_(e), h(i.stopPropagation()))),
      m(2, 'div', 4)(3, 'span', 5),
      a(4, '/'),
      p(),
      m(5, 'input', 6, 0),
      E('input', (i) => {
        _(e);
        const c = s();
        return h(c.onInput(i));
      })('keydown.escape', () => {
        _(e);
        const i = s();
        return h(i.close());
      })('keydown.arrowdown', (i) => {
        _(e);
        const c = s();
        return h(c.moveSelection(1, i));
      })('keydown.arrowup', (i) => {
        _(e);
        const c = s();
        return h(c.moveSelection(-1, i));
      })('keydown.enter', () => {
        _(e);
        const i = s();
        return h(i.executeSelected());
      }),
      p(),
      m(7, 'kbd', 7),
      a(8, 'esc'),
      p()(),
      m(9, 'div', 8),
      g(10, nn, 2, 1, 'div', 9)(11, an, 2, 0),
      p(),
      m(12, 'div', 10)(13, 'span')(14, 'kbd'),
      a(15, '\u2191'),
      p(),
      m(16, 'kbd'),
      a(17, '\u2193'),
      p(),
      a(18, ' navigate'),
      p(),
      m(19, 'span')(20, 'kbd'),
      a(21, 'Enter'),
      p(),
      a(22, ' select'),
      p(),
      m(23, 'span')(24, 'kbd'),
      a(25, 'Esc'),
      p(),
      a(26, ' close'),
      p()()()();
  }
  if (n & 2) {
    const e = s();
    r(5), Fe('value', e.query()), r(5), v(e.filteredCommands().length === 0 ? 10 : 11);
  }
}
var re = class n {
  router = u(z);
  agentService = u(it);
  sessionService = u(R);
  projectService = u(rt);
  tourService = u(Z);
  searchInputRef;
  open = C(!1);
  query = C('');
  selectedIndex = C(0);
  boundKeyHandler = this.handleGlobalKey.bind(this);
  constructor() {
    document.addEventListener('keydown', this.boundKeyHandler);
  }
  ngAfterViewInit() {}
  ngOnDestroy() {
    document.removeEventListener('keydown', this.boundKeyHandler);
  }
  handleGlobalKey(t) {
    (t.metaKey || t.ctrlKey) && t.key === 'k' && (t.preventDefault(), this.toggle());
  }
  toggle() {
    const t = !this.open();
    this.open.set(t),
      t &&
        (this.query.set(''),
        this.selectedIndex.set(0),
        setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 10));
  }
  close() {
    this.open.set(!1);
  }
  onInput(t) {
    this.query.set(t.target.value), this.selectedIndex.set(0);
  }
  allCommands = D(() => {
    const t = [
      {
        id: 'nav-chat',
        label: 'Go to Chat',
        category: 'Navigation',
        icon: '\u{1F4AC}',
        action: () => this.nav('/chat'),
        keywords: 'home',
      },
      {
        id: 'nav-agents',
        label: 'Go to Agents',
        category: 'Navigation',
        icon: '\u{1F916}',
        action: () => this.nav('/agents'),
        keywords: 'bots',
      },
      {
        id: 'nav-flock',
        label: 'Go to Flock Directory',
        category: 'Navigation',
        icon: '\u{1F310}',
        action: () => this.nav('/agents/flock-directory'),
        keywords: 'directory discover network registry',
      },
      {
        id: 'nav-sessions',
        label: 'Go to Sessions',
        category: 'Navigation',
        icon: '\u{1F4CB}',
        action: () => this.nav('/sessions'),
        keywords: 'conversations history',
      },
      {
        id: 'nav-work-tasks',
        label: 'Go to Work Tasks',
        category: 'Navigation',
        icon: '\u{1F4DD}',
        action: () => this.nav('/sessions/work-tasks'),
      },
      {
        id: 'nav-projects',
        label: 'Go to Projects',
        category: 'Navigation',
        icon: '\u{1F4C1}',
        action: () => this.nav('/agents/projects'),
      },
      {
        id: 'nav-councils',
        label: 'Go to Councils',
        category: 'Navigation',
        icon: '\u{1F465}',
        action: () => this.nav('/sessions/councils'),
      },
      {
        id: 'nav-models',
        label: 'Go to Models',
        category: 'Navigation',
        icon: '\u{1F9E0}',
        action: () => this.nav('/agents/models'),
      },
      {
        id: 'nav-analytics',
        label: 'Go to Analytics',
        category: 'Navigation',
        icon: '\u{1F4CA}',
        action: () => this.nav('/sessions/analytics'),
      },
      {
        id: 'nav-logs',
        label: 'Go to Logs',
        category: 'Navigation',
        icon: '\u{1F4DC}',
        action: () => this.nav('/observe/logs'),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        category: 'Navigation',
        icon: '\u2699\uFE0F',
        action: () => this.nav('/settings'),
      },
      {
        id: 'nav-wallets',
        label: 'Go to Wallets',
        category: 'Navigation',
        icon: '\u{1F4B0}',
        action: () => this.nav('/settings/wallets'),
      },
      {
        id: 'nav-security',
        label: 'Go to Security',
        category: 'Navigation',
        icon: '\u{1F512}',
        action: () => this.nav('/settings/security'),
      },
      {
        id: 'nav-spending',
        label: 'Go to Spending',
        category: 'Navigation',
        icon: '\u{1F4B3}',
        action: () => this.nav('/settings/spending'),
      },
      {
        id: 'nav-feed',
        label: 'Go to Live Feed',
        category: 'Navigation',
        icon: '\u{1F4E1}',
        action: () => this.nav('/observe'),
        keywords: 'observe activity',
      },
      {
        id: 'nav-mcp',
        label: 'Go to MCP Servers',
        category: 'Navigation',
        icon: '\u{1F50C}',
        action: () => this.nav('/settings/mcp-servers'),
      },
      {
        id: 'nav-skills',
        label: 'Go to Skill Bundles',
        category: 'Navigation',
        icon: '\u{1F3AF}',
        action: () => this.nav('/agents/skill-bundles'),
      },
      {
        id: 'nav-marketplace',
        label: 'Go to Marketplace',
        category: 'Navigation',
        icon: '\u{1F3EA}',
        action: () => this.nav('/settings/marketplace'),
      },
      {
        id: 'nav-reputation',
        label: 'Go to Reputation',
        category: 'Navigation',
        icon: '\u2B50',
        action: () => this.nav('/observe/reputation'),
      },
      {
        id: 'nav-webhooks',
        label: 'Go to Webhooks',
        category: 'Navigation',
        icon: '\u{1FA9D}',
        action: () => this.nav('/settings/webhooks'),
      },
      {
        id: 'nav-schedules',
        label: 'Go to Schedules',
        category: 'Navigation',
        icon: '\u{1F550}',
        action: () => this.nav('/settings/schedules'),
        keywords: 'automate cron',
      },
      {
        id: 'nav-workflows',
        label: 'Go to Workflows',
        category: 'Navigation',
        icon: '\u{1F504}',
        action: () => this.nav('/settings/workflows'),
      },
      {
        id: 'nav-brain',
        label: 'Go to Brain Viewer',
        category: 'Navigation',
        icon: '\u{1F9E9}',
        action: () => this.nav('/observe/brain-viewer'),
      },
      {
        id: 'act-new-session',
        label: 'New Conversation',
        category: 'Actions',
        icon: '\u2728',
        action: () => this.nav('/sessions/new'),
        keywords: 'create chat start',
      },
      {
        id: 'act-new-agent',
        label: 'Create New Agent',
        category: 'Actions',
        icon: '\u2795',
        action: () => this.nav('/agents/new'),
        keywords: 'add bot',
      },
      {
        id: 'act-new-project',
        label: 'Create New Project',
        category: 'Actions',
        icon: '\u{1F4C1}',
        action: () => this.nav('/agents/projects/new'),
        keywords: 'add',
      },
      {
        id: 'act-new-council',
        label: 'Create New Council',
        category: 'Actions',
        icon: '\u{1F465}',
        action: () => this.nav('/sessions/councils/new'),
        keywords: 'add multi-agent',
      },
      {
        id: 'act-replay-tour',
        label: 'Replay Guided Tour',
        category: 'Actions',
        icon: '?',
        action: () => this.replayTour(),
        keywords: 'onboarding help walkthrough',
      },
    ];
    for (const o of this.agentService.agents())
      t.push({
        id: `agent-${o.id}`,
        label: o.name,
        category: 'Agents',
        icon: o.displayIcon || o.name.charAt(0).toUpperCase(),
        action: () => this.nav(`/agents/${o.id}`),
        keywords: o.model,
      });
    const e = this.sessionService
      .sessions()
      .slice()
      .sort((o, i) => new Date(i.updatedAt).getTime() - new Date(o.updatedAt).getTime())
      .slice(0, 10);
    for (const o of e)
      t.push({
        id: `session-${o.id}`,
        label: o.name || o.initialPrompt || `Session ${o.id.slice(0, 8)}`,
        category: 'Recent Sessions',
        icon: o.status === 'running' ? '\u25B6' : o.status === 'error' ? '!' : '\u25FC',
        action: () => this.nav(`/sessions/${o.id}`),
        keywords: o.initialPrompt || '',
      });
    for (const o of this.projectService.projects())
      t.push({
        id: `project-${o.id}`,
        label: o.name,
        category: 'Projects',
        icon: '\u{1F4C1}',
        action: () => this.nav(`/projects/${o.id}`),
        keywords: o.description || '',
      });
    return t;
  });
  filteredCommands = D(() => {
    const t = this.query().toLowerCase().trim();
    if (!t) return this.allCommands();
    const e = t.split(/\s+/);
    return this.allCommands().filter((o) => {
      const i = `${o.label} ${o.category} ${o.keywords || ''}`.toLowerCase();
      return e.every((c) => i.includes(c));
    });
  });
  groupedResults = D(() => {
    const t = new Map();
    for (const e of this.filteredCommands()) {
      const o = t.get(e.category) || [];
      o.push(e), t.set(e.category, o);
    }
    return Array.from(t.entries()).map(([e, o]) => ({ category: e, items: o }));
  });
  activeId = D(() => {
    const t = this.filteredCommands(),
      e = this.selectedIndex();
    return t[e]?.id ?? '';
  });
  getGlobalIndex(t) {
    return this.filteredCommands().findIndex((e) => e.id === t);
  }
  moveSelection(t, e) {
    e.preventDefault();
    const o = this.filteredCommands().length;
    o !== 0 && this.selectedIndex.update((i) => (i + t + o) % o);
  }
  executeSelected() {
    const t = this.filteredCommands(),
      e = this.selectedIndex();
    t[e] && this.execute(t[e]);
  }
  execute(t) {
    this.close(), t.action();
  }
  nav(t) {
    this.router.navigate([t]);
  }
  replayTour() {
    this.tourService.reset(),
      this.router.navigate(['/chat']).then(() => {
        setTimeout(() => this.tourService.startTour(), 400);
      });
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-command-palette']],
    viewQuery: (e, o) => {
      if ((e & 1 && Ve(Jt, 5), e & 2)) {
        let i;
        je((i = Ge())) && (o.searchInputRef = i.first);
      }
    },
    decls: 1,
    vars: 1,
    consts: [
      ['searchInput', ''],
      [1, 'palette-backdrop'],
      [1, 'palette-backdrop', 3, 'click', 'keydown.escape'],
      [1, 'palette', 3, 'click'],
      [1, 'palette__search'],
      [1, 'palette__search-icon'],
      [
        'type',
        'text',
        'placeholder',
        'Type a command...',
        'autocomplete',
        'off',
        'spellcheck',
        'false',
        1,
        'palette__input',
        3,
        'input',
        'keydown.escape',
        'keydown.arrowdown',
        'keydown.arrowup',
        'keydown.enter',
        'value',
      ],
      [1, 'palette__esc'],
      [1, 'palette__results'],
      [1, 'palette__empty'],
      [1, 'palette__footer'],
      [1, 'palette__group'],
      [1, 'palette__group-label'],
      ['type', 'button', 1, 'palette__item', 3, 'palette__item--active'],
      ['type', 'button', 1, 'palette__item', 3, 'click', 'mouseenter'],
      [1, 'palette__item-icon'],
      [1, 'palette__item-label'],
      [1, 'palette__item-cat'],
    ],
    template: (e, o) => {
      e & 1 && g(0, sn, 27, 2, 'div', 1), e & 2 && v(o.open() ? 0 : -1);
    },
    styles: [
      '.palette-backdrop[_ngcontent-%COMP%]{position:fixed;inset:0;z-index:9999;background:var(--overlay);display:flex;justify-content:center;padding-top:15vh;animation:_ngcontent-%COMP%_fadeIn .1s ease}@keyframes _ngcontent-%COMP%_fadeIn{0%{opacity:0}to{opacity:1}}.palette[_ngcontent-%COMP%]{width:560px;max-height:420px;background:var(--bg-surface, #1a1a2e);border:1px solid var(--border-bright, #333);border-radius:12px;box-shadow:0 16px 48px var(--shadow-deep);display:flex;flex-direction:column;overflow:hidden;align-self:flex-start}.palette__search[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.75rem 1rem;border-bottom:1px solid var(--border, #2a2a3e)}.palette__search-icon[_ngcontent-%COMP%]{color:var(--accent-cyan, #0ef);font-weight:700;font-size:.9rem;flex-shrink:0}.palette__input[_ngcontent-%COMP%]{flex:1;background:transparent;border:none;color:var(--text-primary, #eee);font-family:inherit;font-size:.9rem;outline:none}.palette__input[_ngcontent-%COMP%]::placeholder{color:var(--text-tertiary, #666)}.palette__esc[_ngcontent-%COMP%]{padding:.1rem .35rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:4px;color:var(--text-tertiary, #666);font-size:.55rem;font-family:inherit}.palette__results[_ngcontent-%COMP%]{flex:1;overflow-y:auto;padding:.25rem 0}.palette__empty[_ngcontent-%COMP%]{padding:1.5rem;text-align:center;color:var(--text-tertiary, #666);font-size:.8rem}.palette__group[_ngcontent-%COMP%]{padding:.25rem 0}.palette__group-label[_ngcontent-%COMP%]{padding:.25rem 1rem;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-tertiary, #666)}.palette__item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;width:100%;padding:.5rem 1rem;background:transparent;border:none;color:var(--text-secondary, #bbb);font-family:inherit;font-size:.8rem;cursor:pointer;text-align:left;transition:background .05s}.palette__item[_ngcontent-%COMP%]:hover, .palette__item--active[_ngcontent-%COMP%]{background:var(--accent-cyan-dim, var(--accent-cyan-subtle));color:var(--text-primary, #eee)}.palette__item-icon[_ngcontent-%COMP%]{width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--bg-raised, #222);border-radius:4px;font-size:.65rem;flex-shrink:0}.palette__item-label[_ngcontent-%COMP%]{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.palette__item-cat[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary, #666);flex-shrink:0}.palette__footer[_ngcontent-%COMP%]{display:flex;gap:1rem;padding:.5rem 1rem;border-top:1px solid var(--border, #2a2a3e);font-size:.58rem;color:var(--text-tertiary, #666)}.palette__footer[_ngcontent-%COMP%]   kbd[_ngcontent-%COMP%]{padding:.05rem .25rem;background:var(--bg-raised, #222);border:1px solid var(--border, #333);border-radius:3px;font-family:inherit;font-size:.55rem;margin-right:.15rem}@media(max-width:640px){.palette[_ngcontent-%COMP%]{width:calc(100vw - 2rem)}}',
    ],
    changeDetection: 0,
  });
};
var cn = (_n, t) => t.id;
function ln(n, _t) {
  if ((n & 1 && (m(0, 'p', 6), a(1), p()), n & 2)) {
    const e = s().$implicit;
    r(), b(e.detail);
  }
}
function dn(n, _t) {
  if ((n & 1 && I(0, 'div', 9), n & 2)) {
    const e = s().$implicit;
    G('animation-duration', e.duration, 'ms');
  }
}
function pn(n, t) {
  if (n & 1) {
    const e = y();
    m(0, 'div', 2)(1, 'span', 3),
      a(2),
      p(),
      m(3, 'div', 4)(4, 'p', 5),
      a(5),
      p(),
      g(6, ln, 2, 1, 'p', 6),
      p(),
      m(7, 'button', 7),
      E('click', () => {
        const i = _(e).$implicit,
          c = s();
        return h(c.dismiss(i.id));
      }),
      a(8, ' \xD7 '),
      p(),
      g(9, dn, 1, 2, 'div', 8),
      p();
  }
  if (n & 2) {
    const e = t.$implicit,
      o = s();
    Ke(`toast toast--${e.type}`),
      O('aria-label', `${e.type}: ${e.message}`),
      r(2),
      b(o.icon(e.type)),
      r(3),
      b(e.message),
      r(),
      v(e.detail ? 6 : -1),
      r(3),
      v(e.duration && e.duration > 0 ? 9 : -1);
  }
}
var ae = class n {
  notificationService = u(q);
  notifications = this.notificationService.notifications;
  icon(t) {
    switch (t) {
      case 'success':
        return '\u2713';
      case 'error':
        return '\u2715';
      case 'warning':
        return '\u26A0';
      case 'info':
        return '\u2139';
    }
  }
  dismiss(t) {
    this.notificationService.dismiss(t);
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-toast-container']],
    decls: 3,
    vars: 0,
    consts: [
      ['role', 'status', 'aria-live', 'polite', 'aria-relevant', 'additions removals', 1, 'toast-container'],
      ['role', 'alert', 1, 'toast', 3, 'class'],
      ['role', 'alert', 1, 'toast'],
      ['aria-hidden', 'true', 1, 'toast__icon'],
      [1, 'toast__body'],
      [1, 'toast__message'],
      [1, 'toast__detail'],
      ['aria-label', 'Dismiss notification', 'type', 'button', 1, 'toast__close', 3, 'click'],
      [1, 'toast__progress', 3, 'animation-duration'],
      [1, 'toast__progress'],
    ],
    template: (e, o) => {
      e & 1 && (m(0, 'div', 0), w(1, pn, 10, 7, 'div', 1, cn), p()), e & 2 && (r(), k(o.notifications()));
    },
    styles: [
      '.toast-container[_ngcontent-%COMP%]{position:fixed;bottom:5rem;right:1rem;z-index:10000;display:flex;flex-direction:column;gap:.5rem;max-width:420px;width:calc(100vw - 2rem);pointer-events:none}.toast[_ngcontent-%COMP%]{display:flex;align-items:flex-start;gap:.5rem;padding:.75rem 1rem;border-radius:var(--radius);border:1px solid;font-size:.8rem;pointer-events:auto;animation:_ngcontent-%COMP%_toast-in .3s ease-out;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);position:relative;overflow:hidden}.toast[_ngcontent-%COMP%]:nth-child(1){animation-delay:0ms}.toast[_ngcontent-%COMP%]:nth-child(2){animation-delay:60ms}.toast[_ngcontent-%COMP%]:nth-child(3){animation-delay:.12s}@keyframes _ngcontent-%COMP%_toast-in{0%{opacity:0;transform:translate(1rem)}to{opacity:1;transform:translate(0)}}.toast--success[_ngcontent-%COMP%]{background:var(--accent-green-dim);border-color:var(--accent-green-border);color:var(--accent-green)}.toast--error[_ngcontent-%COMP%]{background:var(--accent-red-dim);border-color:var(--accent-red-border);color:var(--accent-red)}.toast--warning[_ngcontent-%COMP%]{background:var(--accent-amber-dim);border-color:var(--accent-amber-border);color:var(--accent-amber)}.toast--info[_ngcontent-%COMP%]{background:var(--accent-cyan-dim);border-color:var(--accent-cyan-border);color:var(--accent-cyan)}.toast__icon[_ngcontent-%COMP%]{flex-shrink:0;font-size:1rem;line-height:1;margin-top:1px}.toast__body[_ngcontent-%COMP%]{flex:1;min-width:0}.toast__message[_ngcontent-%COMP%]{margin:0;font-weight:600;line-height:1.3;color:inherit}.toast__detail[_ngcontent-%COMP%]{margin:.25rem 0 0;font-size:.75rem;color:var(--text-secondary);line-height:1.4;word-break:break-word}.toast__close[_ngcontent-%COMP%]{flex-shrink:0;background:none;border:none;color:inherit;font-size:1.1rem;cursor:pointer;padding:0 .125rem;line-height:1;opacity:.6;transition:opacity .15s}.toast__close[_ngcontent-%COMP%]:hover{opacity:1}.toast__close[_ngcontent-%COMP%]:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:2px}.toast__progress[_ngcontent-%COMP%]{position:absolute;bottom:0;left:0;right:0;height:2px;background:currentColor;opacity:.4;transform-origin:left;animation:_ngcontent-%COMP%_toastProgress linear forwards}@keyframes _ngcontent-%COMP%_toastProgress{0%{transform:scaleX(1)}to{transform:scaleX(0)}}@media(max-width:640px){.toast-container[_ngcontent-%COMP%]{top:auto;bottom:1rem;right:.5rem;left:.5rem;max-width:none;width:auto}.toast[_ngcontent-%COMP%]{animation-name:toast-in-mobile}@keyframes toast-in-mobile{0%{opacity:0;transform:translateY(.5rem)}to{opacity:1;transform:translateY(0)}}}',
    ],
    changeDetection: 0,
  });
};
var mn = (_n, t) => t.keys;
function un(n, _t) {
  n & 1 && (m(0, 'span', 15), a(1, 'then'), p());
}
function _n(n, t) {
  if ((n & 1 && (m(0, 'kbd'), a(1), p(), g(2, un, 2, 0, 'span', 15)), n & 2)) {
    const e = t.$implicit,
      o = t.$index,
      i = t.$count;
    r(), b(e), r(), v(o !== i - 1 ? 2 : -1);
  }
}
function hn(n, t) {
  if (
    (n & 1 && (m(0, 'div', 12)(1, 'dt', 13), w(2, _n, 3, 2, null, null, _e), p(), m(4, 'dd', 14), a(5), p()()), n & 2)
  ) {
    const e = t.$implicit,
      o = s(3);
    r(2), k(o.splitKeys(e.keys)), r(3), b(e.description);
  }
}
function gn(n, t) {
  if (
    (n & 1 && (m(0, 'div', 7)(1, 'h3', 10), a(2), p(), m(3, 'dl', 11), w(4, hn, 6, 1, 'div', 12, mn), p()()), n & 2)
  ) {
    const e = t.$implicit,
      o = s(2);
    r(2), b(e), r(2), k(o.byCategory(e));
  }
}
function vn(n, _t) {
  if (n & 1) {
    const e = y();
    m(0, 'div', 1),
      E('click', (i) => {
        _(e);
        const c = s();
        return h(c.onBackdropClick(i));
      })('keydown.escape', () => {
        _(e);
        const i = s();
        return h(i.shortcuts.closeOverlay());
      }),
      m(1, 'div', 2)(2, 'div', 3)(3, 'h2', 4),
      a(4, 'Keyboard Shortcuts'),
      p(),
      m(5, 'button', 5),
      E('click', () => {
        _(e);
        const i = s();
        return h(i.shortcuts.closeOverlay());
      }),
      a(6, ' ESC '),
      p()(),
      m(7, 'div', 6),
      w(8, gn, 6, 1, 'div', 7, _e),
      p(),
      m(10, 'div', 8)(11, 'span', 9),
      a(12, 'CorvidAgent'),
      p()()()();
  }
  if (n & 2) {
    const e = s();
    r(8), k(e.categories);
  }
}
var se = class n {
  shortcuts = u(j);
  categories = ['General', 'Navigation'];
  byCategory(t) {
    return this.shortcuts.shortcuts.filter((e) => e.category === t);
  }
  splitKeys(t) {
    return t.split(' ');
  }
  onBackdropClick(t) {
    t.target.classList.contains('shortcuts-overlay') && this.shortcuts.closeOverlay();
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-keyboard-shortcuts-overlay']],
    decls: 1,
    vars: 1,
    consts: [
      ['role', 'dialog', 'aria-labelledby', 'shortcuts-title', 'aria-modal', 'true', 1, 'shortcuts-overlay'],
      [
        'role',
        'dialog',
        'aria-labelledby',
        'shortcuts-title',
        'aria-modal',
        'true',
        1,
        'shortcuts-overlay',
        3,
        'click',
        'keydown.escape',
      ],
      [1, 'shortcuts-panel'],
      [1, 'shortcuts-panel__header'],
      ['id', 'shortcuts-title'],
      ['aria-label', 'Close shortcuts', 'type', 'button', 1, 'shortcuts-panel__close', 3, 'click'],
      [1, 'shortcuts-panel__body'],
      [1, 'shortcuts-panel__category'],
      [1, 'shortcuts-panel__footer'],
      [1, 'shortcuts-panel__version'],
      [1, 'shortcuts-panel__category-label'],
      [1, 'shortcuts-panel__list'],
      [1, 'shortcuts-panel__entry'],
      [1, 'shortcuts-panel__keys'],
      [1, 'shortcuts-panel__desc'],
      [1, 'shortcuts-panel__then'],
    ],
    template: (e, o) => {
      e & 1 && g(0, vn, 13, 0, 'div', 0), e & 2 && v(o.shortcuts.overlayOpen() ? 0 : -1);
    },
    styles: [
      '.shortcuts-overlay[_ngcontent-%COMP%]{position:fixed;inset:0;background:var(--overlay-heavy);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2000}.shortcuts-panel[_ngcontent-%COMP%]{background:var(--bg-surface, #0f1018);border:1px solid var(--accent-cyan, #00e5ff);border-radius:var(--radius-lg, 8px);padding:1.5rem;max-width:520px;width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 0 24px var(--accent-cyan-dim),0 0 60px #00e5ff0d}.shortcuts-panel__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;padding-bottom:.75rem;border-bottom:1px solid var(--border, #1e2035)}.shortcuts-panel__header[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0;font-size:.9rem;font-weight:700;color:var(--accent-cyan, #00e5ff);text-transform:uppercase;letter-spacing:.08em}.shortcuts-panel__close[_ngcontent-%COMP%]{padding:.25rem .5rem;background:transparent;border:1px solid var(--border-bright, #2a2d48);border-radius:var(--radius-sm, 3px);color:var(--text-tertiary, #4a4d68);font-size:.65rem;font-weight:600;font-family:inherit;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;transition:color var(--transition-fast, .1s ease),border-color var(--transition-fast, .1s ease)}.shortcuts-panel__close[_ngcontent-%COMP%]:hover{color:var(--accent-cyan, #00e5ff);border-color:var(--accent-cyan, #00e5ff)}.shortcuts-panel__close[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--accent-cyan, #00e5ff);outline-offset:2px}.shortcuts-panel__body[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:1rem}.shortcuts-panel__category-label[_ngcontent-%COMP%]{margin:0 0 .5rem;font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-tertiary, #4a4d68);font-weight:600}.shortcuts-panel__list[_ngcontent-%COMP%]{margin:0;padding:0;display:flex;flex-direction:column;gap:.375rem}.shortcuts-panel__entry[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.375rem .5rem;border-radius:var(--radius-sm, 3px);transition:background var(--transition-fast, .1s ease)}.shortcuts-panel__entry[_ngcontent-%COMP%]:hover{background:var(--bg-hover, #1a1c2e)}.shortcuts-panel__keys[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.25rem}kbd[_ngcontent-%COMP%]{display:inline-block;padding:.15rem .4rem;background:var(--bg-raised, #161822);border:1px solid var(--border-bright, #2a2d48);border-radius:var(--radius-sm, 3px);font-size:.7rem;font-family:inherit;color:var(--text-primary, #e0e0ec);font-weight:600;min-width:1.5em;text-align:center;box-shadow:0 1px 0 var(--border, #1e2035)}.shortcuts-panel__then[_ngcontent-%COMP%]{font-size:.55rem;color:var(--text-tertiary, #4a4d68);text-transform:uppercase;letter-spacing:.05em}.shortcuts-panel__desc[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary, #7a7d98);margin:0}.shortcuts-panel__footer[_ngcontent-%COMP%]{margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border, #1e2035);display:flex;align-items:center;justify-content:center}.shortcuts-panel__version[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary, #4a4d68);text-transform:uppercase;letter-spacing:.08em}@media(max-width:767px){.shortcuts-overlay[_ngcontent-%COMP%]{display:none}}',
    ],
    changeDetection: 0,
  });
};
var bn = (_n, t) => t.id;
function fn(n, _t) {
  if ((n & 1 && (me(), I(0, 'rect', 5)), n & 2)) {
    const e = s(2);
    O('x', e.spotlight().left - 6)('y', e.spotlight().top - 6)('width', e.spotlight().width + 12)(
      'height',
      e.spotlight().height + 12,
    );
  }
}
function yn(n, _t) {
  if ((n & 1 && I(0, 'div', 9), n & 2)) {
    const e = s(2);
    G('top', e.spotlight().top - 6, 'px')('left', e.spotlight().left - 6, 'px')(
      'width',
      e.spotlight().width + 12,
      'px',
    )('height', e.spotlight().height + 12, 'px');
  }
}
function Cn(n, t) {
  if ((n & 1 && I(0, 'span', 21), n & 2)) {
    const e = t.$index,
      o = s(3);
    P('tour-dot--active', e === o.tourService.currentStepIndex())(
      'tour-dot--done',
      e < o.tourService.currentStepIndex(),
    );
  }
}
function xn(n, _t) {
  if (n & 1) {
    const e = y();
    m(0, 'button', 22),
      E('click', () => {
        _(e);
        const i = s(3);
        return h(i.onPrev());
      }),
      a(1, 'Back'),
      p();
  }
}
function wn(n, t) {
  if (n & 1) {
    const e = y();
    m(0, 'div', 10),
      E('click', (i) => (_(e), h(i.stopPropagation()))),
      m(1, 'div', 11)(2, 'span', 12),
      a(3),
      p(),
      m(4, 'button', 13),
      E('click', () => {
        _(e);
        const i = s(2);
        return h(i.tourService.skip());
      }),
      a(5, 'Skip tour'),
      p()(),
      m(6, 'h3', 14),
      a(7),
      p(),
      m(8, 'p', 15),
      a(9),
      p(),
      m(10, 'div', 16),
      w(11, Cn, 1, 4, 'span', 17, bn),
      p(),
      m(13, 'div', 18),
      g(14, xn, 2, 0, 'button', 19),
      m(15, 'button', 20),
      E('click', () => {
        _(e);
        const i = s(2);
        return h(i.onNext());
      }),
      a(16),
      p()()();
  }
  if (n & 2) {
    const e = t,
      o = s(2);
    G('top', o.tooltipPos().top)('left', o.tooltipPos().left),
      O('data-placement', e.placement),
      r(3),
      He('', o.tourService.currentStepIndex() + 1, ' / ', o.tourService.steps().length),
      r(4),
      b(e.title),
      r(2),
      b(e.content),
      r(2),
      k(o.tourService.steps()),
      r(3),
      v(o.tourService.currentStepIndex() > 0 ? 14 : -1),
      r(2),
      A(' ', o.tourService.currentStepIndex() === o.tourService.steps().length - 1 ? 'Done' : 'Next', ' ');
  }
}
function kn(n, _t) {
  if (n & 1) {
    const e = y();
    m(0, 'div', 1),
      E('click', (i) => {
        _(e);
        const c = s();
        return h(c.onOverlayClick(i));
      }),
      me(),
      m(1, 'svg', 2)(2, 'defs')(3, 'mask', 3),
      I(4, 'rect', 4),
      g(5, fn, 1, 4, ':svg:rect', 5),
      p()(),
      I(6, 'rect', 6),
      p(),
      g(7, yn, 1, 8, 'div', 7),
      g(8, wn, 17, 11, 'div', 8),
      p();
  }
  if (n & 2) {
    let e,
      o = s();
    r(5),
      v(o.spotlight() ? 5 : -1),
      r(2),
      v(o.spotlight() ? 7 : -1),
      r(),
      v((e = o.tourService.currentStep()) ? 8 : -1, e);
  }
}
var ce = class n {
  tourService = u(Z);
  spotlight = C(null);
  tooltipPos = C({ top: '50%', left: '50%' });
  resizeObserver = null;
  constructor() {
    W(() => {
      const t = this.tourService.currentStep();
      this.tourService.active() && t && setTimeout(() => this.positionForStep(t), 150);
    });
  }
  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }
  onOverlayClick(t) {
    t.target.closest('.tour-tooltip') || this.tourService.next();
  }
  onNext() {
    this.tourService.next();
  }
  onPrev() {
    this.tourService.prev();
  }
  positionForStep(t) {
    const e = document.querySelector(t.selector);
    if (!e) {
      this.spotlight.set(null), this.tooltipPos.set({ top: '40%', left: 'calc(50% - 170px)' });
      return;
    }
    const o = e.getBoundingClientRect();
    this.spotlight.set({ top: o.top, left: o.left, width: o.width, height: o.height });
    let i = 16,
      c,
      S;
    switch (t.placement) {
      case 'bottom':
        (c = o.bottom + i), (S = o.left + o.width / 2 - 170);
        break;
      case 'top':
        (c = o.top - i - 200), (S = o.left + o.width / 2 - 170);
        break;
      case 'right':
        (c = o.top + o.height / 2 - 100), (S = o.right + i);
        break;
      case 'left':
        (c = o.top + o.height / 2 - 100), (S = o.left - i - 340);
        break;
    }
    (S = Math.max(16, Math.min(S, window.innerWidth - 360))),
      (c = Math.max(16, Math.min(c, window.innerHeight - 240))),
      this.tooltipPos.set({ top: `${c}px`, left: `${S}px` });
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-guided-tour']],
    decls: 1,
    vars: 1,
    consts: [
      [1, 'tour-overlay'],
      [1, 'tour-overlay', 3, 'click'],
      ['xmlns', 'http://www.w3.org/2000/svg', 1, 'tour-mask'],
      ['id', 'tour-spotlight-mask'],
      ['width', '100%', 'height', '100%', 'fill', 'white'],
      ['rx', '8', 'ry', '8', 'fill', 'black'],
      ['width', '100%', 'height', '100%', 'fill', 'rgba(0,0,0,0.65)', 'mask', 'url(#tour-spotlight-mask)'],
      [1, 'tour-spotlight-ring', 3, 'top', 'left', 'width', 'height'],
      [1, 'tour-tooltip', 3, 'top', 'left'],
      [1, 'tour-spotlight-ring'],
      [1, 'tour-tooltip', 3, 'click'],
      [1, 'tour-tooltip__header'],
      [1, 'tour-tooltip__step'],
      [1, 'tour-tooltip__skip', 3, 'click'],
      [1, 'tour-tooltip__title'],
      [1, 'tour-tooltip__content'],
      [1, 'tour-dots'],
      [1, 'tour-dot', 3, 'tour-dot--active', 'tour-dot--done'],
      [1, 'tour-tooltip__actions'],
      [1, 'tour-btn', 'tour-btn--ghost'],
      [1, 'tour-btn', 'tour-btn--primary', 3, 'click'],
      [1, 'tour-dot'],
      [1, 'tour-btn', 'tour-btn--ghost', 3, 'click'],
    ],
    template: (e, o) => {
      e & 1 && g(0, kn, 9, 3, 'div', 0), e & 2 && v(o.tourService.active() ? 0 : -1);
    },
    styles: [
      '.tour-overlay[_ngcontent-%COMP%]{position:fixed;inset:0;z-index:10000;pointer-events:auto}.tour-mask[_ngcontent-%COMP%]{position:absolute;inset:0;width:100%;height:100%}.tour-spotlight-ring[_ngcontent-%COMP%]{position:absolute;border:2px solid var(--accent-cyan, #00e5ff);border-radius:8px;box-shadow:0 0 16px var(--accent-cyan-glow),inset 0 0 16px #00e5ff0d;pointer-events:none;transition:top .3s ease,left .3s ease,width .3s ease,height .3s ease}.tour-tooltip[_ngcontent-%COMP%]{position:absolute;width:340px;max-width:calc(100vw - 2rem);background:var(--bg-surface, #1a1a2e);border:1px solid var(--border-bright, #3a3a5c);border-radius:var(--radius-lg, 12px);padding:1rem 1.25rem;box-shadow:0 8px 32px var(--shadow-deep),0 0 0 1px var(--accent-cyan-dim);z-index:10001;transition:top .3s ease,left .3s ease;animation:_ngcontent-%COMP%_tour-fadein .25s ease}@keyframes _ngcontent-%COMP%_tour-fadein{0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.tour-tooltip__header[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}.tour-tooltip__step[_ngcontent-%COMP%]{font-size:.7rem;font-weight:600;color:var(--accent-cyan, #00e5ff);letter-spacing:.05em}.tour-tooltip__skip[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-tertiary, #666);font-size:.7rem;font-family:inherit;cursor:pointer;padding:.2rem .4rem;border-radius:var(--radius, 6px)}.tour-tooltip__skip[_ngcontent-%COMP%]:hover{color:var(--text-secondary, #999);background:var(--bg-hover, rgba(255,255,255,.05))}.tour-tooltip__title[_ngcontent-%COMP%]{margin:0 0 .4rem;font-size:.95rem;font-weight:700;color:var(--text-primary, #e0e0e0)}.tour-tooltip__content[_ngcontent-%COMP%]{margin:0 0 .75rem;font-size:.8rem;line-height:1.5;color:var(--text-secondary, #aaa);white-space:pre-line}.tour-dots[_ngcontent-%COMP%]{display:flex;gap:6px;justify-content:center;margin-bottom:.75rem}.tour-dot[_ngcontent-%COMP%]{width:6px;height:6px;border-radius:50%;background:var(--border, #333);transition:background .2s,box-shadow .2s}.tour-dot--active[_ngcontent-%COMP%]{background:var(--accent-cyan, #00e5ff);box-shadow:0 0 6px var(--accent-cyan-glow)}.tour-dot--done[_ngcontent-%COMP%]{background:var(--accent-green, #00e676)}.tour-tooltip__actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;justify-content:flex-end}.tour-btn[_ngcontent-%COMP%]{padding:.4rem 1rem;border-radius:var(--radius, 6px);font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid transparent;transition:background .15s,border-color .15s}.tour-btn--primary[_ngcontent-%COMP%]{background:var(--accent-cyan-dim);border-color:var(--accent-cyan, #00e5ff);color:var(--accent-cyan, #00e5ff)}.tour-btn--primary[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-border);box-shadow:0 0 8px var(--accent-cyan-border)}.tour-btn--ghost[_ngcontent-%COMP%]{background:transparent;border-color:var(--border, #333);color:var(--text-secondary, #999)}.tour-btn--ghost[_ngcontent-%COMP%]:hover{background:var(--bg-hover, rgba(255,255,255,.05))}',
    ],
    changeDetection: 0,
  });
};
var Mn = (n) => ({ exact: n }),
  Sn = (_n, t) => t.route;
function Tn(n, _t) {
  if ((n & 1 && (d(0, 'span', 4), a(1), l()), n & 2)) {
    const e = s(2);
    O('aria-label', `${e.activeSessionCount()} active sessions`),
      r(),
      b(e.activeSessionCount() > 9 ? '9+' : e.activeSessionCount());
  }
}
function Pn(n, t) {
  if (
    (n & 1 &&
      (d(0, 'a', 1)(1, 'span', 2), f(2, 'app-icon', 3), g(3, Tn, 2, 2, 'span', 4), l(), d(4, 'span', 5), a(5), l()()),
    n & 2)
  ) {
    const e = t.$implicit,
      o = s();
    x('routerLink', e.route)('routerLinkActiveOptions', F(7, Mn, e.exact)),
      O('aria-label', e.label),
      r(2),
      x('name', e.icon)('size', 20),
      r(),
      v(e.badgeKey === 'sessions' && o.activeSessionCount() > 0 ? 3 : -1),
      r(2),
      b(e.label);
  }
}
var En = [
    { label: 'Home', icon: 'home', route: '/chat', exact: !0 },
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', exact: !0 },
    { label: 'Sessions', icon: 'sessions', route: '/sessions', exact: !1, badgeKey: 'sessions' },
    { label: 'Observe', icon: 'eye', route: '/observe', exact: !1 },
    { label: 'Agents', icon: 'agents', route: '/agents', exact: !1 },
  ],
  le = class n {
    sessionService = u(R);
    items = En;
    activeSessionCount = D(
      () =>
        this.sessionService
          .sessions()
          .filter((t) => t.status === 'running' || t.status === 'thinking' || t.status === 'tool_use').length,
    );
    static \u0275fac = (e) => new (e || n)();
    static \u0275cmp = T({
      type: n,
      selectors: [['app-mobile-bottom-nav']],
      decls: 3,
      vars: 0,
      consts: [
        ['role', 'navigation', 'aria-label', 'Mobile navigation', 1, 'bottom-nav'],
        [
          'routerLinkActive',
          'bottom-nav__item--active',
          1,
          'bottom-nav__item',
          3,
          'routerLink',
          'routerLinkActiveOptions',
        ],
        [1, 'bottom-nav__icon-wrapper'],
        [3, 'name', 'size'],
        [1, 'bottom-nav__badge'],
        [1, 'bottom-nav__label'],
      ],
      template: (e, o) => {
        e & 1 && (d(0, 'nav', 0), w(1, Pn, 6, 9, 'a', 1, Sn), l()), e & 2 && (r(), k(o.items));
      },
      dependencies: [V, Q, J],
      styles: [
        '[_nghost-%COMP%]{display:none}@media(max-width:767px){[_nghost-%COMP%]{display:block;position:fixed;bottom:0;left:0;right:0;z-index:100}}.bottom-nav[_ngcontent-%COMP%]{display:flex;align-items:stretch;justify-content:space-around;height:56px;background:var(--glass-bg-solid);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--border-faint);padding-bottom:env(safe-area-inset-bottom,0)}.bottom-nav__item[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2rem;flex:1;color:var(--text-tertiary);text-decoration:none;transition:color .15s;-webkit-tap-highlight-color:transparent;position:relative}.bottom-nav__item[_ngcontent-%COMP%]:active{color:var(--text-secondary)}.bottom-nav__item--active[_ngcontent-%COMP%]{color:var(--accent-cyan)}.bottom-nav__item--active[_ngcontent-%COMP%]:before{content:"";position:absolute;top:0;left:25%;right:25%;height:2px;background:var(--accent-cyan);border-radius:0 0 2px 2px}.bottom-nav__label[_ngcontent-%COMP%]{font-size:.6rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase}.bottom-nav__icon-wrapper[_ngcontent-%COMP%]{position:relative;display:inline-flex}.bottom-nav__badge[_ngcontent-%COMP%]{position:absolute;top:-4px;right:-8px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:var(--accent-cyan);color:var(--bg-deep);font-size:.5rem;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 6px #00e5ff66}',
      ],
      changeDetection: 0,
    });
  };
var On = ['mainContent'];
function Dn(n, _t) {
  n & 1 && f(0, 'app-chat-tab-bar');
}
function Nn(n, _t) {
  n & 1 && (d(0, 'div', 2), f(1, 'span', 8), a(2, ' Server is restarting \u2014 reconnecting automatically... '), l());
}
function In(n, _t) {
  if (n & 1) {
    const e = y();
    d(0, 'div', 3),
      f(1, 'span', 8),
      a(2, ' Connection lost \u2014 reconnecting... '),
      d(3, 'button', 9),
      M('click', () => {
        _(e);
        const i = s();
        return h(i.retryConnection());
      }),
      a(4, 'Retry now'),
      l()();
  }
}
function An(n, _t) {
  n & 1 && f(0, 'app-mobile-bottom-nav');
}
var de = class n {
  wsService = u(B);
  chatTabs = u($);
  sessionService = u(R);
  _shortcuts = u(j);
  router = u(z);
  showScrollTop = C(!1);
  isSessionView = C(!1);
  routeAnimationKey = C(this.router.url);
  reduceMotion = C(!1);
  mainContent = Ue('mainContent');
  routerSub = null;
  motionQuery = null;
  onMotionChange = null;
  ngOnInit() {
    this.wsService.connect(),
      this.sessionService.init(),
      typeof globalThis.matchMedia < 'u' &&
        ((this.motionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)')),
        this.reduceMotion.set(this.motionQuery.matches),
        (this.onMotionChange = (t) => this.reduceMotion.set(t.matches)),
        this.motionQuery.addEventListener('change', this.onMotionChange)),
      this.isSessionView.set(this.router.url.startsWith('/sessions/')),
      (this.routerSub = this.router.events.pipe(K((t) => t instanceof Y)).subscribe((t) => {
        this.isSessionView.set(t.urlAfterRedirects.startsWith('/sessions/')),
          this.routeAnimationKey.set(t.urlAfterRedirects);
      }));
  }
  ngOnDestroy() {
    this.motionQuery && this.onMotionChange && this.motionQuery.removeEventListener('change', this.onMotionChange),
      this.sessionService.destroy(),
      this.wsService.disconnect(),
      this.routerSub?.unsubscribe();
  }
  onScroll(t) {
    const e = t.target;
    this.showScrollTop.set(e.scrollTop > 300);
  }
  scrollToTop() {
    this.mainContent()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
  retryConnection() {
    this.wsService.disconnect(), this.wsService.connect();
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275cmp = T({
    type: n,
    selectors: [['app-root']],
    viewQuery: (e, o) => {
      e & 1 && Be(o.mainContent, On, 5), e & 2 && $e();
    },
    decls: 18,
    vars: 9,
    consts: [
      ['mainContent', ''],
      [1, 'app-layout'],
      ['role', 'alert', 1, 'app-layout__banner', 'app-layout__banner--restart'],
      ['role', 'alert', 1, 'app-layout__banner'],
      [1, 'app-layout__body'],
      ['role', 'main', 'id', 'main-content', 1, 'app-layout__content', 3, 'scroll'],
      [1, 'router-outlet-host'],
      ['aria-label', 'Scroll to top', 'title', 'Scroll to top', 1, 'scroll-to-top', 3, 'click'],
      [1, 'app-layout__banner-dot'],
      ['type', 'button', 1, 'app-layout__banner-retry', 3, 'click'],
    ],
    template: (e, o) => {
      if (e & 1) {
        const i = y();
        d(0, 'div', 1),
          f(1, 'app-top-nav'),
          g(2, Dn, 1, 0, 'app-chat-tab-bar'),
          g(3, Nn, 3, 0, 'div', 2)(4, In, 5, 0, 'div', 3),
          d(5, 'div', 4)(6, 'main', 5, 0),
          M('scroll', (S) => (_(i), h(o.onScroll(S)))),
          d(8, 'div', 6),
          f(9, 'router-outlet'),
          l()(),
          f(10, 'app-activity-rail'),
          l()(),
          d(11, 'button', 7),
          M('click', () => (_(i), h(o.scrollToTop()))),
          a(12, '\u25B2'),
          l(),
          g(13, An, 1, 0, 'app-mobile-bottom-nav'),
          f(14, 'app-command-palette')(15, 'app-keyboard-shortcuts-overlay')(16, 'app-guided-tour')(
            17,
            'app-toast-container',
          );
      }
      e & 2 &&
        (P('app-layout--session', o.isSessionView()),
        r(2),
        v(o.chatTabs.tabs().length > 0 ? 2 : -1),
        r(),
        v(o.wsService.serverRestarting() ? 3 : o.wsService.connected() ? -1 : 4),
        r(5),
        x('@.disabled', o.reduceMotion())('@pageRoute', o.routeAnimationKey()),
        r(3),
        P('scroll-to-top--visible', o.showScrollTop()),
        r(2),
        v(o.isSessionView() ? -1 : 13));
    },
    dependencies: [Je, te, ne, ie, re, ae, se, ce, le],
    styles: [
      '.app-layout[_ngcontent-%COMP%]{display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden}.app-layout__body[_ngcontent-%COMP%]{display:flex;flex:1;overflow:hidden}.app-layout__content[_ngcontent-%COMP%]{flex:1;min-height:0;min-width:0;position:relative;background:var(--bg-deep);overflow-y:auto;scroll-behavior:smooth;container-type:inline-size}.router-outlet-host[_ngcontent-%COMP%]{display:block;min-height:100%;min-width:0;position:relative}.app-layout__banner[_ngcontent-%COMP%]{padding:.375rem 1rem;background:var(--accent-red-dim, rgba(255, 51, 85, .1));border-bottom:1px solid var(--accent-red, #f33);color:var(--accent-red, #f33);font-size:.75rem;font-weight:600;text-align:center;letter-spacing:.03em}.app-layout__banner-dot[_ngcontent-%COMP%]{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:.5rem;animation:_ngcontent-%COMP%_bannerPulse 1.5s ease-in-out infinite}@keyframes _ngcontent-%COMP%_bannerPulse{0%,to{opacity:1}50%{opacity:.3}}.app-layout__banner-retry[_ngcontent-%COMP%]{margin-left:.75rem;padding:.15rem .6rem;background:transparent;border:1px solid currentColor;border-radius:var(--radius-sm, 4px);color:inherit;font-family:inherit;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:background .15s,color .15s}.app-layout__banner-retry[_ngcontent-%COMP%]:hover{background:currentColor;color:var(--bg-deep, #0a0a12)}.app-layout__banner--restart[_ngcontent-%COMP%]{background:var(--accent-yellow-dim, rgba(255, 204, 0, .1));border-bottom-color:var(--accent-yellow, #fc0);color:var(--accent-yellow, #fc0)}@media(max-width:767px){.app-layout__content[_ngcontent-%COMP%]{padding-bottom:56px}.app-layout--session[_ngcontent-%COMP%]   .app-layout__content[_ngcontent-%COMP%]{padding-bottom:0}}@media(max-width:767px){[_nghost-%COMP%]     app-chat-tab-bar{display:none}}',
    ],
    data: { animation: [mt] },
    changeDetection: 0,
  });
};
Qe(de, pt).catch((n) => console.error(n));
