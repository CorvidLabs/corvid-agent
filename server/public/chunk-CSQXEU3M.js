import { fc as a, O as c, ja as d } from './chunk-LF4EWAJA.js';

var l = 3,
  h = { success: 4e3, info: 4e3, warning: 8e3, error: 8e3 },
  p = 0,
  f = class o {
    _notifications = d([]);
    timers = new Map();
    notifications = a(() => this._notifications().slice(0, l));
    hasNotifications = a(() => this._notifications().length > 0);
    success(i, t) {
      this.add('success', i, t);
    }
    error(i, t) {
      this.add('error', i, t);
    }
    warning(i, t) {
      this.add('warning', i, t);
    }
    info(i, t) {
      this.add('info', i, t);
    }
    dismiss(i) {
      this.clearTimer(i), this._notifications.update((t) => t.filter((e) => e.id !== i));
    }
    dismissAll() {
      for (const i of this.timers.keys()) this.clearTimer(i);
      this._notifications.set([]);
    }
    add(i, t, e, m) {
      const n = `notif-${++p}`,
        s = m ?? h[i],
        g = { id: n, type: i, message: t, detail: e, duration: s, createdAt: Date.now() };
      if ((this._notifications.update((r) => [g, ...r]), s > 0)) {
        const r = setTimeout(() => this.dismiss(n), s);
        this.timers.set(n, r);
      }
    }
    clearTimer(i) {
      const t = this.timers.get(i);
      t && (clearTimeout(t), this.timers.delete(i));
    }
    static \u0275fac = (t) => new (t || o)();
    static \u0275prov = c({ token: o, factory: o.\u0275fac, providedIn: 'root' });
  };

export { f as a };
