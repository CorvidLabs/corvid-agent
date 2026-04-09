import { pa as a, O as i, q as s } from './chunk-LF4EWAJA.js';
import { a as g } from './chunk-ZSTU6MUH.js';

var o = class t extends g {
  apiPath = '/agents';
  agents = this.entities;
  async loadAgents() {
    return this.load();
  }
  async getAgent(e) {
    return this.getById(e);
  }
  async createAgent(e) {
    return this.create(e);
  }
  async updateAgent(e, n) {
    return this.update(e, n);
  }
  async deleteAgent(e) {
    return this.remove(e);
  }
  async getBalance(e) {
    return s(this.api.get(`/agents/${e}/balance`));
  }
  async getMessages(e) {
    return s(this.api.get(`/agents/${e}/messages`));
  }
  async invokeAgent(e, n, r, m) {
    return s(this.api.post(`/agents/${e}/invoke`, { toAgentId: n, content: r, paymentMicro: m }));
  }
  static \u0275fac = (() => {
    let e;
    return (r) => (e || (e = a(t)))(r || t);
  })();
  static \u0275prov = i({ token: t, factory: t.\u0275fac, providedIn: 'root' });
};

export { o as a };
