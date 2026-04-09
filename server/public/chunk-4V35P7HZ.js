import { b as g } from './chunk-D6WCRQHB.js';
import { O as a, q as i, ja as n, T as o, fc as s } from './chunk-LF4EWAJA.js';

var y = class e {
  api = o(g);
  entries = n([]);
  loading = n(!1);
  count = s(() => this.entries().length);
  async load(t = {}) {
    this.loading.set(!0);
    try {
      const r = [];
      t.category && r.push(`category=${t.category}`),
        t.tag && r.push(`tag=${encodeURIComponent(t.tag)}`),
        t.limit && r.push(`limit=${t.limit}`);
      const l = r.length > 0 ? `?${r.join('&')}` : '',
        c = await i(this.api.get(`/library${l}`));
      this.entries.set(c);
    } finally {
      this.loading.set(!1);
    }
  }
  async getEntry(t) {
    return i(this.api.get(`/library/${encodeURIComponent(t)}`));
  }
  static \u0275fac = (r) => new (r || e)();
  static \u0275prov = a({ token: e, factory: e.\u0275fac, providedIn: 'root' });
};

export { y as a };
