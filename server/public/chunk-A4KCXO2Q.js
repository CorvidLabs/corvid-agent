import { b as g } from './chunk-D6WCRQHB.js';
import { ja as a, b as d, q as i, T as l, a as p, O as u } from './chunk-LF4EWAJA.js';
import { a as v } from './chunk-OFKXBWQC.js';

var c = class n {
  static MAX_EVENTS = 500;
  api = l(g);
  ws = l(v);
  sessions = a([]);
  loading = a(!1);
  activeEvents = a(new Map());
  algochatStatus = a(null);
  pendingApprovals = a(new Map());
  cleanupFn = null;
  init() {
    this.cleanupFn = this.ws.onMessage((s) => this.handleWsMessage(s));
  }
  destroy() {
    this.cleanupFn?.();
  }
  async loadSessions(s) {
    this.loading.set(!0);
    try {
      const e = s ? `?projectId=${s}` : '',
        t = await i(this.api.get(`/sessions${e}`));
      this.sessions.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async getSession(s) {
    return i(this.api.get(`/sessions/${s}`));
  }
  async getMessages(s) {
    return i(this.api.get(`/sessions/${s}/messages`));
  }
  async createSession(s) {
    const e = await i(this.api.post('/sessions', s));
    return this.sessions.update((t) => [e, ...t]), e;
  }
  async stopSession(s) {
    await i(this.api.post(`/sessions/${s}/stop`)),
      this.sessions.update((e) => e.map((t) => (t.id === s ? d(p({}, t), { status: 'stopped' }) : t)));
  }
  async resumeSession(s, e) {
    await i(this.api.post(`/sessions/${s}/resume`, { prompt: e })),
      this.sessions.update((t) => t.map((o) => (o.id === s ? d(p({}, o), { status: 'running' }) : o)));
  }
  async deleteSession(s) {
    await i(this.api.delete(`/sessions/${s}`)),
      this.sessions.update((e) => e.filter((t) => t.id !== s)),
      this.activeEvents.update((e) => {
        const t = new Map(e);
        return t.delete(s), t;
      });
  }
  async loadAlgoChatStatus() {
    const s = await i(this.api.get('/algochat/status'));
    this.algochatStatus.set(s);
  }
  subscribeToSession(s) {
    this.ws.subscribe(s);
  }
  unsubscribeFromSession(s) {
    this.ws.unsubscribe(s),
      this.activeEvents.update((e) => {
        const t = new Map(e);
        return t.delete(s), t;
      });
  }
  sendMessage(s, e) {
    this.ws.sendMessage(s, e);
  }
  handleWsMessage(s) {
    if (
      (s.type === 'session_event' &&
        this.activeEvents.update((e) => {
          const t = new Map(e),
            r = [...(t.get(s.sessionId) ?? []), s.event];
          return t.set(s.sessionId, r.length > n.MAX_EVENTS ? r.slice(r.length - n.MAX_EVENTS) : r), t;
        }),
      s.type === 'session_status' &&
        this.sessions.update((e) => e.map((t) => (t.id === s.sessionId ? d(p({}, t), { status: s.status }) : t))),
      s.type === 'approval_request')
    ) {
      const e = new Map(this.pendingApprovals());
      e.set(s.request.id, s.request), this.pendingApprovals.set(e);
    }
  }
  clearApproval(s) {
    const e = new Map(this.pendingApprovals());
    e.delete(s), this.pendingApprovals.set(e);
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275prov = u({ token: n, factory: n.\u0275fac, providedIn: 'root' });
};

export { c as a };
