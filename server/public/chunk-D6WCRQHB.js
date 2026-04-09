import { h as l } from './chunk-GEI46CGR.js';
import { O as o, T as r } from './chunk-LF4EWAJA.js';

var i = typeof window < 'u' ? window.location.host : 'localhost:3000',
  p = typeof window < 'u' ? window.location.protocol : 'http:',
  w = p === 'https:' ? 'wss:' : 'ws:',
  a = null,
  d =
    typeof window < 'u'
      ? (() => {
          const s = new URLSearchParams(window.location.search),
            t = s.get('apiKey');
          if (t) {
            s.delete('apiKey');
            const n = s.toString(),
              h = window.location.pathname + (n ? `?${n}` : '') + window.location.hash;
            window.history.replaceState(null, '', h);
          }
          const e = t ?? a;
          return e && (a = e), e;
        })()
      : null,
  u = { apiUrl: `${p}//${i}/api`, wsUrl: `${w}//${i}/ws`, apiKey: d ?? '' };
var c = class s {
  http = r(l);
  baseUrl = u.apiUrl;
  get(t) {
    return this.http.get(`${this.baseUrl}${t}`);
  }
  post(t, e = {}) {
    return this.http.post(`${this.baseUrl}${t}`, e);
  }
  put(t, e = {}) {
    return this.http.put(`${this.baseUrl}${t}`, e);
  }
  patch(t, e = {}) {
    return this.http.patch(`${this.baseUrl}${t}`, e);
  }
  delete(t) {
    return this.http.delete(`${this.baseUrl}${t}`);
  }
  deleteWithBody(t, e) {
    return this.http.delete(`${this.baseUrl}${t}`, { body: e });
  }
  static \u0275fac = (e) => new (e || s)();
  static \u0275prov = o({ token: s, factory: s.\u0275fac, providedIn: 'root' });
};

export { c as b, u as a };
