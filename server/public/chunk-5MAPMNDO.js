import { bb as m } from './chunk-LF4EWAJA.js';

var u = class f {
  transform(e, t) {
    if (!e) return '';
    if (!t) return 'running...';
    const a = (r) => (r.includes('T') || r.endsWith('Z') ? r : `${r.replace(' ', 'T')}Z`),
      p = new Date(a(e)).getTime(),
      l = new Date(a(t)).getTime(),
      c = Math.max(0, l - p);
    if (c < 1e3) return '<1s';
    const i = Math.floor(c / 1e3),
      s = Math.floor(i / 3600),
      n = Math.floor((i % 3600) / 60),
      o = i % 60;
    return s > 0 ? (n > 0 ? `${s}h ${n}m` : `${s}h`) : n > 0 ? (o > 0 ? `${n}m ${o}s` : `${n}m`) : `${o}s`;
  }
  static \u0275fac = (t) => new (t || f)();
  static \u0275pipe = m({ name: 'duration', type: f, pure: !0 });
};

export { u as a };
