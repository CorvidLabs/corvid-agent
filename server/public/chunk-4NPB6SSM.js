import { b as u } from './chunk-D6WCRQHB.js';
import { ja as a, T as c, q as n, O as p } from './chunk-LF4EWAJA.js';

var l = class r {
  api = c(u);
  scores = a([]);
  events = a([]);
  explanation = a(null);
  loading = a(!1);
  async loadScores() {
    this.loading.set(!0);
    try {
      const t = await n(this.api.get('/reputation/scores'));
      this.scores.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async computeAll() {
    this.loading.set(!0);
    try {
      const t = await n(this.api.post('/reputation/scores'));
      this.scores.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async getScore(t) {
    return n(this.api.get(`/reputation/scores/${t}`));
  }
  async refreshScore(t) {
    const e = await n(this.api.post(`/reputation/scores/${t}`));
    return (
      this.scores.update((i) => {
        const o = i.findIndex((s) => s.agentId === t);
        if (o >= 0) {
          const s = [...i];
          return (s[o] = e), s;
        }
        return [...i, e];
      }),
      e
    );
  }
  async getEvents(t, e) {
    const i = e !== void 0 ? `?limit=${e}` : '',
      o = await n(this.api.get(`/reputation/events/${t}${i}`));
    return this.events.set(o), o;
  }
  async getExplanation(t) {
    const e = await n(this.api.get(`/reputation/explain/${t}`));
    return this.explanation.set(e), e;
  }
  async getStats(t) {
    return n(this.api.get(`/reputation/stats/${t}`));
  }
  async getAttestation(t) {
    return n(this.api.get(`/reputation/attestation/${t}`));
  }
  async createAttestation(t) {
    return n(this.api.post(`/reputation/attestation/${t}`));
  }
  async getHistory(t, e = 90) {
    return n(this.api.get(`/reputation/history/${t}?days=${e}`));
  }
  static \u0275fac = (e) => new (e || r)();
  static \u0275prov = p({ token: r, factory: r.\u0275fac, providedIn: 'root' });
};

export { l as a };
