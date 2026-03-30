import { b as l } from './chunk-D6WCRQHB.js';
import { q as a, T as i, O as o, ja as s } from './chunk-LF4EWAJA.js';

var p = class t {
  api = i(l);
  persona = s(null);
  loading = s(!1);
  async loadPersona(e) {
    this.loading.set(!0);
    try {
      const n = await a(this.api.get(`/agents/${e}/persona`));
      return this.persona.set(n), n;
    } catch {
      return this.persona.set(null), null;
    } finally {
      this.loading.set(!1);
    }
  }
  async checkPersonaExists(e) {
    try {
      return (await a(this.api.get(`/agents/${e}/persona`))) != null;
    } catch {
      return !1;
    }
  }
  async savePersona(e, n) {
    const r = await a(this.api.put(`/agents/${e}/persona`, n));
    return this.persona.set(r), r;
  }
  async deletePersona(e) {
    await a(this.api.delete(`/agents/${e}/persona`)), this.persona.set(null);
  }
  static \u0275fac = (n) => new (n || t)();
  static \u0275prov = o({ token: t, factory: t.\u0275fac, providedIn: 'root' });
};

export { p as a };
