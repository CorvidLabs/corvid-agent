import { b as d, ja as g, fc as h, a as o, O as u } from './chunk-LF4EWAJA.js';

var b = 'corvid_chat_tabs',
  I = 12,
  v = class c {
    tabs = g(this.loadTabs());
    activeSessionId = g(null);
    activeTab = h(() => {
      const t = this.activeSessionId();
      return this.tabs().find((s) => s.sessionId === t) ?? null;
    });
    openTab(t, s, e = 'idle', n) {
      this.tabs.update((i) => {
        if (i.find((r) => r.sessionId === t))
          return i.map((r) =>
            r.sessionId === t ? d(o({}, r), { label: s, status: e, agentName: n || r.agentName }) : r,
          );
        const l = [...i, { sessionId: t, label: s, status: e, agentName: n }];
        return l.length > I && l.shift(), l;
      }),
        this.activeSessionId.set(t),
        this.saveTabs();
    }
    closeTab(t) {
      let s = null;
      return (
        this.tabs.update((e) => {
          const n = e.findIndex((a) => a.sessionId === t),
            i = e.filter((a) => a.sessionId !== t);
          if (this.activeSessionId() === t && i.length > 0) {
            const a = Math.min(n, i.length - 1);
            s = i[a].sessionId;
          }
          return i;
        }),
        s ? this.activeSessionId.set(s) : this.tabs().length === 0 && this.activeSessionId.set(null),
        this.saveTabs(),
        s
      );
    }
    updateTabStatus(t, s) {
      this.tabs.update((e) => e.map((n) => (n.sessionId === t ? d(o({}, n), { status: s }) : n))), this.saveTabs();
    }
    updateTabLabel(t, s) {
      this.tabs.update((e) => e.map((n) => (n.sessionId === t ? d(o({}, n), { label: s }) : n))), this.saveTabs();
    }
    switchToTabByIndex(t) {
      const s = this.tabs();
      if (t < 0 || t >= s.length) return null;
      const e = s[t];
      return this.activeSessionId.set(e.sessionId), e.sessionId;
    }
    switchToLastTab() {
      const t = this.tabs();
      if (t.length === 0) return null;
      const s = t[t.length - 1];
      return this.activeSessionId.set(s.sessionId), s.sessionId;
    }
    saveTabs() {
      try {
        localStorage.setItem(b, JSON.stringify(this.tabs()));
      } catch {}
    }
    loadTabs() {
      try {
        const t = localStorage.getItem(b);
        if (!t) return [];
        const s = JSON.parse(t);
        if (Array.isArray(s)) return s;
      } catch {}
      return [];
    }
    static \u0275fac = (s) => new (s || c)();
    static \u0275prov = u({ token: c, factory: c.\u0275fac, providedIn: 'root' });
  };

export { v as a };
