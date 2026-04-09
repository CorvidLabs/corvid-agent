import { bb as l } from './chunk-LF4EWAJA.js';

var p = class s {
  transform(t) {
    if (!t) return '';
    const r = t.includes('T') || t.endsWith('Z') ? t : `${t.replace(' ', 'T')}Z`,
      n = new Date(r),
      e = Date.now() - n.getTime();
    if (e < 0) {
      const m = Math.floor(-e / 1e3),
        f = Math.floor(m / 60),
        a = Math.floor(f / 60),
        d = Math.floor(a / 24);
      return m < 60
        ? 'in <1m'
        : f < 60
          ? `in ${f}m`
          : a < 24
            ? `in ${a}h`
            : d < 30
              ? `in ${d}d`
              : n.toLocaleDateString();
    }
    const u = Math.floor(e / 1e3),
      o = Math.floor(u / 60),
      i = Math.floor(o / 60),
      c = Math.floor(i / 24);
    return u < 60
      ? 'just now'
      : o < 60
        ? `${o}m ago`
        : i < 24
          ? `${i}h ago`
          : c < 30
            ? `${c}d ago`
            : n.toLocaleDateString();
  }
  static \u0275fac = (r) => new (r || s)();
  static \u0275pipe = l({ name: 'relativeTime', type: s, pure: !0 });
};

export { p as a };
