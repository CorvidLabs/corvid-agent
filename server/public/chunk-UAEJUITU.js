import { b as p } from './chunk-D6WCRQHB.js';
import { O as c, q as e, ja as k, T as n } from './chunk-LF4EWAJA.js';
import { a as d } from './chunk-OFKXBWQC.js';

var u = class o {
  api = n(p);
  ws = n(d);
  tasks = k([]);
  loading = k(!1);
  unsubscribeWs = null;
  startListening() {
    this.unsubscribeWs ||
      (this.unsubscribeWs = this.ws.onMessage((s) => {
        if (s.type === 'work_task_update') {
          const t = s.task;
          this.tasks.update((a) => {
            const r = a.findIndex((i) => i.id === t.id);
            if (r >= 0) {
              const i = [...a];
              return (i[r] = t), i;
            }
            return [t, ...a];
          });
        }
      }));
  }
  stopListening() {
    this.unsubscribeWs?.(), (this.unsubscribeWs = null);
  }
  async loadTasks(s) {
    this.loading.set(!0);
    try {
      const t = s ? `/work-tasks?agentId=${s}` : '/work-tasks',
        a = await e(this.api.get(t));
      this.tasks.set(a);
    } finally {
      this.loading.set(!1);
    }
  }
  async getTask(s) {
    return e(this.api.get(`/work-tasks/${s}`));
  }
  async createTask(s) {
    const t = await e(this.api.post('/work-tasks', s));
    return this.tasks.update((a) => [t, ...a]), t;
  }
  async cancelTask(s) {
    const t = await e(this.api.post(`/work-tasks/${s}/cancel`));
    return this.tasks.update((a) => a.map((r) => (r.id === s ? t : r))), t;
  }
  async retryTask(s) {
    const t = await e(this.api.post(`/work-tasks/${s}/retry`));
    return this.tasks.update((a) => a.map((r) => (r.id === s ? t : r))), t;
  }
  createViaWebSocket(s, t, a) {
    this.ws.createWorkTask(s, t, a);
  }
  static \u0275fac = (t) => new (t || o)();
  static \u0275prov = c({ token: o, factory: o.\u0275fac, providedIn: 'root' });
};

export { u as a };
