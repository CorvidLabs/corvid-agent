import { pa as c, O as o } from './chunk-LF4EWAJA.js';
import { a as i } from './chunk-ZSTU6MUH.js';

var a = class e extends i {
  apiPath = '/projects';
  projects = this.entities;
  async loadProjects() {
    return this.load();
  }
  async getProject(t) {
    return this.getById(t);
  }
  async createProject(t) {
    return this.create(t);
  }
  async updateProject(t, r) {
    return this.update(t, r);
  }
  async deleteProject(t) {
    return this.remove(t);
  }
  static \u0275fac = (() => {
    let t;
    return (n) => (t || (t = c(e)))(n || e);
  })();
  static \u0275prov = o({ token: e, factory: e.\u0275fac, providedIn: 'root' });
};

export { a };
