import { q as i, O as l, pa as s } from './chunk-LF4EWAJA.js';
import { a as r } from './chunk-ZSTU6MUH.js';

var o = class n extends r {
  apiPath = '/skill-bundles';
  bundles = this.entities;
  async loadBundles() {
    return this.load();
  }
  async createBundle(e) {
    return this.create(e);
  }
  async updateBundle(e, t) {
    return this.update(e, t);
  }
  async deleteBundle(e) {
    return this.remove(e);
  }
  async getAgentBundles(e) {
    return i(this.api.get(`/agents/${e}/skills`));
  }
  async assignToAgent(e, t) {
    return i(this.api.post(`/agents/${e}/skills`, { bundleId: t }));
  }
  async removeFromAgent(e, t) {
    await i(this.api.delete(`/agents/${e}/skills/${t}`));
  }
  static \u0275fac = (() => {
    let e;
    return (a) => (e || (e = s(n)))(a || n);
  })();
  static \u0275prov = l({ token: n, factory: n.\u0275fac, providedIn: 'root' });
};

export { o as a };
