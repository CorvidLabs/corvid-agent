import { O as c, pa as o, q as s } from './chunk-LF4EWAJA.js';
import { a as r } from './chunk-ZSTU6MUH.js';

var u = class e extends r {
  apiPath = '/councils';
  councils = this.entities;
  async loadCouncils() {
    return this.load();
  }
  async getCouncil(n) {
    return this.getById(n);
  }
  async createCouncil(n) {
    return this.create(n);
  }
  async updateCouncil(n, i) {
    return this.update(n, i);
  }
  async deleteCouncil(n) {
    return this.remove(n);
  }
  async launchCouncil(n, i, t) {
    return s(this.api.post(`/councils/${n}/launch`, { projectId: i, prompt: t }));
  }
  async getCouncilLaunch(n) {
    return s(this.api.get(`/council-launches/${n}`));
  }
  async getCouncilLaunches(n) {
    return s(this.api.get(`/councils/${n}/launches`));
  }
  async getAllLaunches() {
    return s(this.api.get('/council-launches'));
  }
  async abortLaunch(n) {
    return s(this.api.post(`/council-launches/${n}/abort`));
  }
  async triggerReview(n) {
    return s(this.api.post(`/council-launches/${n}/review`));
  }
  async triggerSynthesis(n) {
    return s(this.api.post(`/council-launches/${n}/synthesize`));
  }
  async getLaunchLogs(n) {
    return s(this.api.get(`/council-launches/${n}/logs`));
  }
  async getDiscussionMessages(n) {
    return s(this.api.get(`/council-launches/${n}/discussion-messages`));
  }
  async chatWithCouncil(n, i) {
    return s(this.api.post(`/council-launches/${n}/chat`, { message: i }));
  }
  static \u0275fac = (() => {
    let n;
    return (t) => (n || (n = o(e)))(t || e);
  })();
  static \u0275prov = c({ token: e, factory: e.\u0275fac, providedIn: 'root' });
};

export { u as a };
