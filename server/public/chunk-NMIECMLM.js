import { b as p } from './chunk-D6WCRQHB.js';
import { ja as a, T as d, O as l, q as r } from './chunk-LF4EWAJA.js';

var c = class n {
  api = d(p);
  entries = a([]);
  loading = a(!1);
  async loadEntries() {
    this.loading.set(!0);
    try {
      const t = await r(this.api.get('/allowlist'));
      this.entries.set(t);
    } finally {
      this.loading.set(!1);
    }
  }
  async addEntry(t, e) {
    const i = await r(this.api.post('/allowlist', { address: t, label: e }));
    return this.entries.update((s) => [i, ...s]), i;
  }
  async updateEntry(t, e) {
    const i = await r(this.api.put(`/allowlist/${encodeURIComponent(t)}`, { label: e }));
    return this.entries.update((s) => s.map((o) => (o.address === t ? i : o))), i;
  }
  async removeEntry(t) {
    await r(this.api.delete(`/allowlist/${encodeURIComponent(t)}`)),
      this.entries.update((e) => e.filter((i) => i.address !== t));
  }
  static \u0275fac = (e) => new (e || n)();
  static \u0275prov = l({ token: n, factory: n.\u0275fac, providedIn: 'root' });
};

export { c as a };
