import { bb as n } from './chunk-LF4EWAJA.js';

var i = class r {
  transform(e) {
    if (!e) return '';
    const t = e.includes('T') || e.endsWith('Z') ? e : `${e.replace(' ', 'T')}Z`;
    return new Date(t).toLocaleString();
  }
  static \u0275fac = (t) => new (t || r)();
  static \u0275pipe = n({ name: 'absoluteTime', type: r, pure: !0 });
};

export { i as a };
