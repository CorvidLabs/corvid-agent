import {
  W as $,
  la as ae,
  ba as C,
  Qa as ce,
  h as ee,
  O as f,
  T as h,
  X as ie,
  r as k,
  R as m,
  D as ne,
  I as oe,
  B as re,
  U as se,
  L as T,
  z as te,
  m as V,
  S as v,
} from './chunk-LF4EWAJA.js';

var le = null;
function G() {
  return le;
}
function Ze(r) {
  le ??= r;
}
var de = class {},
  W = (() => {
    class r {
      historyGo(_t) {
        throw new Error('');
      }
      static \u0275fac = (n) => new (n || r)();
      static \u0275prov = f({ token: r, factory: () => h(Me), providedIn: 'platform' });
    }
    return r;
  })();
var Me = (() => {
  class r extends W {
    _location;
    _history;
    _doc = h(C);
    constructor() {
      super(), (this._location = window.location), (this._history = window.history);
    }
    getBaseHrefFromDOM() {
      return G().getBaseHref(this._doc);
    }
    onPopState(t) {
      const n = G().getGlobalEventTarget(this._doc, 'window');
      return n.addEventListener('popstate', t, !1), () => n.removeEventListener('popstate', t);
    }
    onHashChange(t) {
      const n = G().getGlobalEventTarget(this._doc, 'window');
      return n.addEventListener('hashchange', t, !1), () => n.removeEventListener('hashchange', t);
    }
    get href() {
      return this._location.href;
    }
    get protocol() {
      return this._location.protocol;
    }
    get hostname() {
      return this._location.hostname;
    }
    get port() {
      return this._location.port;
    }
    get pathname() {
      return this._location.pathname;
    }
    get search() {
      return this._location.search;
    }
    get hash() {
      return this._location.hash;
    }
    set pathname(t) {
      this._location.pathname = t;
    }
    pushState(t, n, o) {
      this._history.pushState(t, n, o);
    }
    replaceState(t, n, o) {
      this._history.replaceState(t, n, o);
    }
    forward() {
      this._history.forward();
    }
    back() {
      this._history.back();
    }
    historyGo(t = 0) {
      this._history.go(t);
    }
    getState() {
      return this._history.state;
    }
    static \u0275fac = (n) => new (n || r)();
    static \u0275prov = f({ token: r, factory: () => new r(), providedIn: 'platform' });
  }
  return r;
})();
function ue(r, e) {
  e = encodeURIComponent(e);
  for (const t of r.split(';')) {
    const n = t.indexOf('='),
      [o, s] = n === -1 ? [t, ''] : [t.slice(0, n), t.slice(n + 1)];
    if (o.trim() === e) return decodeURIComponent(s);
  }
  return null;
}
var U = class {};
var w = class r {
  headers;
  normalizedNames = new Map();
  lazyInit;
  lazyUpdate = null;
  constructor(e) {
    e
      ? typeof e === 'string'
        ? (this.lazyInit = () => {
            (this.headers = new Map()),
              e
                .split(`
`)
                .forEach((t) => {
                  const n = t.indexOf(':');
                  if (n > 0) {
                    const o = t.slice(0, n),
                      s = t.slice(n + 1).trim();
                    this.addHeaderEntry(o, s);
                  }
                });
          })
        : typeof Headers < 'u' && e instanceof Headers
          ? ((this.headers = new Map()),
            e.forEach((t, n) => {
              this.addHeaderEntry(n, t);
            }))
          : (this.lazyInit = () => {
              (this.headers = new Map()),
                Object.entries(e).forEach(([t, n]) => {
                  this.setHeaderEntries(t, n);
                });
            })
      : (this.headers = new Map());
  }
  has(e) {
    return this.init(), this.headers.has(e.toLowerCase());
  }
  get(e) {
    this.init();
    const t = this.headers.get(e.toLowerCase());
    return t && t.length > 0 ? t[0] : null;
  }
  keys() {
    return this.init(), Array.from(this.normalizedNames.values());
  }
  getAll(e) {
    return this.init(), this.headers.get(e.toLowerCase()) || null;
  }
  append(e, t) {
    return this.clone({ name: e, value: t, op: 'a' });
  }
  set(e, t) {
    return this.clone({ name: e, value: t, op: 's' });
  }
  delete(e, t) {
    return this.clone({ name: e, value: t, op: 'd' });
  }
  maybeSetNormalizedName(e, t) {
    this.normalizedNames.has(t) || this.normalizedNames.set(t, e);
  }
  init() {
    this.lazyInit &&
      (this.lazyInit instanceof r ? this.copyFrom(this.lazyInit) : this.lazyInit(),
      (this.lazyInit = null),
      this.lazyUpdate && (this.lazyUpdate.forEach((e) => this.applyUpdate(e)), (this.lazyUpdate = null)));
  }
  copyFrom(e) {
    e.init(),
      Array.from(e.headers.keys()).forEach((t) => {
        this.headers.set(t, e.headers.get(t)), this.normalizedNames.set(t, e.normalizedNames.get(t));
      });
  }
  clone(e) {
    const t = new r();
    return (
      (t.lazyInit = this.lazyInit && this.lazyInit instanceof r ? this.lazyInit : this),
      (t.lazyUpdate = (this.lazyUpdate || []).concat([e])),
      t
    );
  }
  applyUpdate(e) {
    const t = e.name.toLowerCase();
    switch (e.op) {
      case 'a':
      case 's': {
        let n = e.value;
        if ((typeof n === 'string' && (n = [n]), n.length === 0)) return;
        this.maybeSetNormalizedName(e.name, t);
        const o = (e.op === 'a' ? this.headers.get(t) : void 0) || [];
        o.push(...n), this.headers.set(t, o);
        break;
      }
      case 'd': {
        const s = e.value;
        if (!s) this.headers.delete(t), this.normalizedNames.delete(t);
        else {
          let i = this.headers.get(t);
          if (!i) return;
          (i = i.filter((l) => s.indexOf(l) === -1)),
            i.length === 0 ? (this.headers.delete(t), this.normalizedNames.delete(t)) : this.headers.set(t, i);
        }
        break;
      }
    }
  }
  addHeaderEntry(e, t) {
    const n = e.toLowerCase();
    this.maybeSetNormalizedName(e, n), this.headers.has(n) ? this.headers.get(n).push(t) : this.headers.set(n, [t]);
  }
  setHeaderEntries(e, t) {
    const n = (Array.isArray(t) ? t : [t]).map((s) => s.toString()),
      o = e.toLowerCase();
    this.headers.set(o, n), this.maybeSetNormalizedName(e, o);
  }
  forEach(e) {
    this.init(),
      Array.from(this.normalizedNames.keys()).forEach((t) => e(this.normalizedNames.get(t), this.headers.get(t)));
  }
};
var B = class {
    map = new Map();
    set(e, t) {
      return this.map.set(e, t), this;
    }
    get(e) {
      return this.map.has(e) || this.map.set(e, e.defaultValue()), this.map.get(e);
    }
    delete(e) {
      return this.map.delete(e), this;
    }
    has(e) {
      return this.map.has(e);
    }
    keys() {
      return this.map.keys();
    }
  },
  z = class {
    encodeKey(e) {
      return he(e);
    }
    encodeValue(e) {
      return he(e);
    }
    decodeKey(e) {
      return decodeURIComponent(e);
    }
    decodeValue(e) {
      return decodeURIComponent(e);
    }
  };
function De(r, e) {
  const t = new Map();
  return (
    r.length > 0 &&
      r
        .replace(/^\?/, '')
        .split('&')
        .forEach((o) => {
          const s = o.indexOf('='),
            [i, l] = s === -1 ? [e.decodeKey(o), ''] : [e.decodeKey(o.slice(0, s)), e.decodeValue(o.slice(s + 1))],
            a = t.get(i) || [];
          a.push(l), t.set(i, a);
        }),
    t
  );
}
var Oe = /%(\d[a-f0-9])/gi,
  Ie = { 40: '@', '3A': ':', 24: '$', '2C': ',', '3B': ';', '3D': '=', '3F': '?', '2F': '/' };
function he(r) {
  return encodeURIComponent(r).replace(Oe, (e, t) => Ie[t] ?? e);
}
function S(r) {
  return `${r}`;
}
var g = class r {
  map;
  encoder;
  updates = null;
  cloneFrom = null;
  constructor(e = {}) {
    if (((this.encoder = e.encoder || new z()), e.fromString)) {
      if (e.fromObject) throw new T(2805, !1);
      this.map = De(e.fromString, this.encoder);
    } else
      e.fromObject
        ? ((this.map = new Map()),
          Object.keys(e.fromObject).forEach((t) => {
            const n = e.fromObject[t],
              o = Array.isArray(n) ? n.map(S) : [S(n)];
            this.map.set(t, o);
          }))
        : (this.map = null);
  }
  has(e) {
    return this.init(), this.map.has(e);
  }
  get(e) {
    this.init();
    const t = this.map.get(e);
    return t ? t[0] : null;
  }
  getAll(e) {
    return this.init(), this.map.get(e) || null;
  }
  keys() {
    return this.init(), Array.from(this.map.keys());
  }
  append(e, t) {
    return this.clone({ param: e, value: t, op: 'a' });
  }
  appendAll(e) {
    const t = [];
    return (
      Object.keys(e).forEach((n) => {
        const o = e[n];
        Array.isArray(o)
          ? o.forEach((s) => {
              t.push({ param: n, value: s, op: 'a' });
            })
          : t.push({ param: n, value: o, op: 'a' });
      }),
      this.clone(t)
    );
  }
  set(e, t) {
    return this.clone({ param: e, value: t, op: 's' });
  }
  delete(e, t) {
    return this.clone({ param: e, value: t, op: 'd' });
  }
  toString() {
    return (
      this.init(),
      this.keys()
        .map((e) => {
          const t = this.encoder.encodeKey(e);
          return this.map
            .get(e)
            .map((n) => `${t}=${this.encoder.encodeValue(n)}`)
            .join('&');
        })
        .filter((e) => e !== '')
        .join('&')
    );
  }
  clone(e) {
    const t = new r({ encoder: this.encoder });
    return (t.cloneFrom = this.cloneFrom || this), (t.updates = (this.updates || []).concat(e)), t;
  }
  init() {
    this.map === null && (this.map = new Map()),
      this.cloneFrom !== null &&
        (this.cloneFrom.init(),
        this.cloneFrom.keys().forEach((e) => this.map.set(e, this.cloneFrom.map.get(e))),
        this.updates.forEach((e) => {
          switch (e.op) {
            case 'a':
            case 's': {
              const t = (e.op === 'a' ? this.map.get(e.param) : void 0) || [];
              t.push(S(e.value)), this.map.set(e.param, t);
              break;
            }
            case 'd':
              if (e.value !== void 0) {
                const n = this.map.get(e.param) || [],
                  o = n.indexOf(S(e.value));
                o !== -1 && n.splice(o, 1), n.length > 0 ? this.map.set(e.param, n) : this.map.delete(e.param);
              } else {
                this.map.delete(e.param);
                break;
              }
          }
        }),
        (this.cloneFrom = this.updates = null));
  }
};
function _e(r) {
  switch (r) {
    case 'DELETE':
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
    case 'JSONP':
      return !1;
    default:
      return !0;
  }
}
function fe(r) {
  return typeof ArrayBuffer < 'u' && r instanceof ArrayBuffer;
}
function pe(r) {
  return typeof Blob < 'u' && r instanceof Blob;
}
function ye(r) {
  return typeof FormData < 'u' && r instanceof FormData;
}
function ke(r) {
  return typeof URLSearchParams < 'u' && r instanceof URLSearchParams;
}
var me = 'Content-Type',
  ge = 'Accept',
  Te = 'text/plain',
  ve = 'application/json',
  Ae = `${ve}, ${Te}, */*`,
  M = class r {
    url;
    body = null;
    headers;
    context;
    reportProgress = !1;
    withCredentials = !1;
    credentials;
    keepalive = !1;
    cache;
    priority;
    mode;
    redirect;
    referrer;
    integrity;
    referrerPolicy;
    responseType = 'json';
    method;
    params;
    urlWithParams;
    transferCache;
    timeout;
    constructor(e, t, n, o) {
      (this.url = t), (this.method = e.toUpperCase());
      let s;
      if ((_e(this.method) || o ? ((this.body = n !== void 0 ? n : null), (s = o)) : (s = n), s)) {
        if (
          ((this.reportProgress = !!s.reportProgress),
          (this.withCredentials = !!s.withCredentials),
          (this.keepalive = !!s.keepalive),
          s.responseType && (this.responseType = s.responseType),
          s.headers && (this.headers = s.headers),
          s.context && (this.context = s.context),
          s.params && (this.params = s.params),
          s.priority && (this.priority = s.priority),
          s.cache && (this.cache = s.cache),
          s.credentials && (this.credentials = s.credentials),
          typeof s.timeout === 'number')
        ) {
          if (s.timeout < 1 || !Number.isInteger(s.timeout)) throw new T(2822, '');
          this.timeout = s.timeout;
        }
        s.mode && (this.mode = s.mode),
          s.redirect && (this.redirect = s.redirect),
          s.integrity && (this.integrity = s.integrity),
          s.referrer && (this.referrer = s.referrer),
          s.referrerPolicy && (this.referrerPolicy = s.referrerPolicy),
          (this.transferCache = s.transferCache);
      }
      if (((this.headers ??= new w()), (this.context ??= new B()), !this.params))
        (this.params = new g()), (this.urlWithParams = t);
      else {
        const i = this.params.toString();
        if (i.length === 0) this.urlWithParams = t;
        else {
          const l = t.indexOf('?'),
            a = l === -1 ? '?' : l < t.length - 1 ? '&' : '';
          this.urlWithParams = t + a + i;
        }
      }
    }
    serializeBody() {
      return this.body === null
        ? null
        : typeof this.body === 'string' || fe(this.body) || pe(this.body) || ye(this.body) || ke(this.body)
          ? this.body
          : this.body instanceof g
            ? this.body.toString()
            : typeof this.body === 'object' || typeof this.body === 'boolean' || Array.isArray(this.body)
              ? JSON.stringify(this.body)
              : this.body.toString();
    }
    detectContentTypeHeader() {
      return this.body === null || ye(this.body)
        ? null
        : pe(this.body)
          ? this.body.type || null
          : fe(this.body)
            ? null
            : typeof this.body === 'string'
              ? Te
              : this.body instanceof g
                ? 'application/x-www-form-urlencoded;charset=UTF-8'
                : typeof this.body === 'object' || typeof this.body === 'number' || typeof this.body === 'boolean'
                  ? ve
                  : null;
    }
    clone(e = {}) {
      let t = e.method || this.method,
        n = e.url || this.url,
        o = e.responseType || this.responseType,
        s = e.keepalive ?? this.keepalive,
        i = e.priority || this.priority,
        l = e.cache || this.cache,
        a = e.mode || this.mode,
        p = e.redirect || this.redirect,
        x = e.credentials || this.credentials,
        E = e.referrer || this.referrer,
        O = e.integrity || this.integrity,
        F = e.referrerPolicy || this.referrerPolicy,
        j = e.transferCache ?? this.transferCache,
        L = e.timeout ?? this.timeout,
        c = e.body !== void 0 ? e.body : this.body,
        d = e.withCredentials ?? this.withCredentials,
        y = e.reportProgress ?? this.reportProgress,
        P = e.headers || this.headers,
        u = e.params || this.params,
        I = e.context ?? this.context;
      return (
        e.setHeaders !== void 0 && (P = Object.keys(e.setHeaders).reduce((_, b) => _.set(b, e.setHeaders[b]), P)),
        e.setParams && (u = Object.keys(e.setParams).reduce((_, b) => _.set(b, e.setParams[b]), u)),
        new r(t, n, c, {
          params: u,
          headers: P,
          context: I,
          reportProgress: y,
          responseType: o,
          withCredentials: d,
          transferCache: j,
          keepalive: s,
          cache: l,
          priority: i,
          timeout: L,
          mode: a,
          redirect: p,
          credentials: x,
          referrer: E,
          integrity: O,
          referrerPolicy: F,
        })
      );
    }
  },
  R = ((r) => (
    (r[(r.Sent = 0)] = 'Sent'),
    (r[(r.UploadProgress = 1)] = 'UploadProgress'),
    (r[(r.ResponseHeader = 2)] = 'ResponseHeader'),
    (r[(r.DownloadProgress = 3)] = 'DownloadProgress'),
    (r[(r.Response = 4)] = 'Response'),
    (r[(r.User = 5)] = 'User'),
    r
  ))(R || {}),
  D = class {
    headers;
    status;
    statusText;
    url;
    ok;
    type;
    redirected;
    responseType;
    constructor(e, t = 200, n = 'OK') {
      (this.headers = e.headers || new w()),
        (this.status = e.status !== void 0 ? e.status : t),
        (this.statusText = e.statusText || n),
        (this.url = e.url || null),
        (this.redirected = e.redirected),
        (this.responseType = e.responseType),
        (this.ok = this.status >= 200 && this.status < 300);
    }
  },
  X = class r extends D {
    constructor(e = {}) {
      super(e);
    }
    type = R.ResponseHeader;
    clone(e = {}) {
      return new r({
        headers: e.headers || this.headers,
        status: e.status !== void 0 ? e.status : this.status,
        statusText: e.statusText || this.statusText,
        url: e.url || this.url || void 0,
      });
    }
  },
  A = class r extends D {
    body;
    constructor(e = {}) {
      super(e), (this.body = e.body !== void 0 ? e.body : null);
    }
    type = R.Response;
    clone(e = {}) {
      return new r({
        body: e.body !== void 0 ? e.body : this.body,
        headers: e.headers || this.headers,
        status: e.status !== void 0 ? e.status : this.status,
        statusText: e.statusText || this.statusText,
        url: e.url || this.url || void 0,
        redirected: e.redirected ?? this.redirected,
        responseType: e.responseType ?? this.responseType,
      });
    }
  },
  N = class extends D {
    name = 'HttpErrorResponse';
    message;
    error;
    ok = !1;
    constructor(e) {
      super(e, 0, 'Unknown Error'),
        this.status >= 200 && this.status < 300
          ? (this.message = `Http failure during parsing for ${e.url || '(unknown url)'}`)
          : (this.message = `Http failure response for ${e.url || '(unknown url)'}: ${e.status} ${e.statusText}`),
        (this.error = e.error || null);
    }
  },
  xe = 200,
  Fe = 204;
var je = new m('');
var Le = /^\)\]\}',?\n/;
var Y = (() => {
  class r {
    xhrFactory;
    tracingService = h(ce, { optional: !0 });
    constructor(t) {
      this.xhrFactory = t;
    }
    maybePropagateTrace(t) {
      return this.tracingService?.propagate ? this.tracingService.propagate(t) : t;
    }
    handle(t) {
      if (t.method === 'JSONP') throw new T(-2800, !1);
      const n = this.xhrFactory;
      return V(null).pipe(
        oe(
          () =>
            new ee((s) => {
              const i = n.build();
              if (
                (i.open(t.method, t.urlWithParams),
                t.withCredentials && (i.withCredentials = !0),
                t.headers.forEach((c, d) => i.setRequestHeader(c, d.join(','))),
                t.headers.has(ge) || i.setRequestHeader(ge, Ae),
                !t.headers.has(me))
              ) {
                const c = t.detectContentTypeHeader();
                c !== null && i.setRequestHeader(me, c);
              }
              if ((t.timeout && (i.timeout = t.timeout), t.responseType)) {
                const c = t.responseType.toLowerCase();
                i.responseType = c !== 'json' ? c : 'text';
              }
              let l = t.serializeBody(),
                a = null,
                p = () => {
                  if (a !== null) return a;
                  const c = i.statusText || 'OK',
                    d = new w(i.getAllResponseHeaders()),
                    y = i.responseURL || t.url;
                  return (a = new X({ headers: d, status: i.status, statusText: c, url: y })), a;
                },
                x = this.maybePropagateTrace(() => {
                  let { headers: c, status: d, statusText: y, url: P } = p(),
                    u = null;
                  d !== Fe && (u = typeof i.response > 'u' ? i.responseText : i.response), d === 0 && (d = u ? xe : 0);
                  let I = d >= 200 && d < 300;
                  if (t.responseType === 'json' && typeof u === 'string') {
                    const _ = u;
                    u = u.replace(Le, '');
                    try {
                      u = u !== '' ? JSON.parse(u) : null;
                    } catch (b) {
                      (u = _), I && ((I = !1), (u = { error: b, text: u }));
                    }
                  }
                  I
                    ? (s.next(new A({ body: u, headers: c, status: d, statusText: y, url: P || void 0 })), s.complete())
                    : s.error(new N({ error: u, headers: c, status: d, statusText: y, url: P || void 0 }));
                }),
                E = this.maybePropagateTrace((c) => {
                  const { url: d } = p(),
                    y = new N({
                      error: c,
                      status: i.status || 0,
                      statusText: i.statusText || 'Unknown Error',
                      url: d || void 0,
                    });
                  s.error(y);
                }),
                O = E;
              t.timeout &&
                (O = this.maybePropagateTrace((_c) => {
                  const { url: d } = p(),
                    y = new N({
                      error: new DOMException('Request timed out', 'TimeoutError'),
                      status: i.status || 0,
                      statusText: i.statusText || 'Request timeout',
                      url: d || void 0,
                    });
                  s.error(y);
                }));
              let F = !1,
                j = this.maybePropagateTrace((c) => {
                  F || (s.next(p()), (F = !0));
                  const d = { type: R.DownloadProgress, loaded: c.loaded };
                  c.lengthComputable && (d.total = c.total),
                    t.responseType === 'text' && i.responseText && (d.partialText = i.responseText),
                    s.next(d);
                }),
                L = this.maybePropagateTrace((c) => {
                  const d = { type: R.UploadProgress, loaded: c.loaded };
                  c.lengthComputable && (d.total = c.total), s.next(d);
                });
              return (
                i.addEventListener('load', x),
                i.addEventListener('error', E),
                i.addEventListener('timeout', O),
                i.addEventListener('abort', E),
                t.reportProgress && (i.addEventListener('progress', j), l && i.upload?.addEventListener('progress', L)),
                i.send(l),
                s.next({ type: R.Sent }),
                () => {
                  i.removeEventListener('error', E),
                    i.removeEventListener('abort', E),
                    i.removeEventListener('load', x),
                    i.removeEventListener('timeout', O),
                    t.reportProgress &&
                      (i.removeEventListener('progress', j), l && i.upload?.removeEventListener('progress', L)),
                    i.readyState !== i.DONE && i.abort();
                }
              );
            }),
        ),
      );
    }
    static \u0275fac = (n) => new (n || r)(v(U));
    static \u0275prov = f({ token: r, factory: r.\u0275fac, providedIn: 'root' });
  }
  return r;
})();
function Ce(r, e) {
  return e(r);
}
function Ue(r, e, t) {
  return (n, o) => ie(t, () => e(n, (s) => r(s, o)));
}
var q = new m('', { factory: () => [] }),
  we = new m(''),
  Ee = new m('', { factory: () => !0 });
var Z = (() => {
  class r {
    static \u0275fac = (n) => new (n || r)();
    static \u0275prov = f({
      token: r,
      factory: (n) => {
        let o = null;
        return n ? (o = new (n || r)()) : (o = v(Y)), o;
      },
      providedIn: 'root',
    });
  }
  return r;
})();
var J = (() => {
    class r {
      backend;
      injector;
      chain = null;
      pendingTasks = h(ae);
      contributeToStability = h(Ee);
      constructor(t, n) {
        (this.backend = t), (this.injector = n);
      }
      handle(t) {
        if (this.chain === null) {
          const n = Array.from(new Set([...this.injector.get(q), ...this.injector.get(we, [])]));
          this.chain = n.reduceRight((o, s) => Ue(o, s, this.injector), Ce);
        }
        if (this.contributeToStability) {
          const n = this.pendingTasks.add();
          return this.chain(t, (o) => this.backend.handle(o)).pipe(ne(n));
        } else return this.chain(t, (n) => this.backend.handle(n));
      }
      static \u0275fac = (n) => new (n || r)(v(Z), v($));
      static \u0275prov = f({ token: r, factory: r.\u0275fac, providedIn: 'root' });
    }
    return r;
  })(),
  Q = (() => {
    class r {
      static \u0275fac = (n) => new (n || r)();
      static \u0275prov = f({
        token: r,
        factory: (n) => {
          let o = null;
          return n ? (o = new (n || r)()) : (o = v(J)), o;
        },
        providedIn: 'root',
      });
    }
    return r;
  })();
function K(r, e) {
  return {
    body: e,
    headers: r.headers,
    context: r.context,
    observe: r.observe,
    params: r.params,
    reportProgress: r.reportProgress,
    responseType: r.responseType,
    withCredentials: r.withCredentials,
    credentials: r.credentials,
    transferCache: r.transferCache,
    timeout: r.timeout,
    keepalive: r.keepalive,
    priority: r.priority,
    cache: r.cache,
    mode: r.mode,
    redirect: r.redirect,
    integrity: r.integrity,
    referrer: r.referrer,
    referrerPolicy: r.referrerPolicy,
  };
}
var be = (() => {
  class r {
    handler;
    constructor(t) {
      this.handler = t;
    }
    request(t, n, o = {}) {
      let s;
      if (t instanceof M) s = t;
      else {
        let a;
        o.headers instanceof w ? (a = o.headers) : (a = new w(o.headers));
        let p;
        o.params && (o.params instanceof g ? (p = o.params) : (p = new g({ fromObject: o.params }))),
          (s = new M(t, n, o.body !== void 0 ? o.body : null, {
            headers: a,
            context: o.context,
            params: p,
            reportProgress: o.reportProgress,
            responseType: o.responseType || 'json',
            withCredentials: o.withCredentials,
            transferCache: o.transferCache,
            keepalive: o.keepalive,
            priority: o.priority,
            cache: o.cache,
            mode: o.mode,
            redirect: o.redirect,
            credentials: o.credentials,
            referrer: o.referrer,
            referrerPolicy: o.referrerPolicy,
            integrity: o.integrity,
            timeout: o.timeout,
          }));
      }
      const i = V(s).pipe(re((a) => this.handler.handle(a)));
      if (t instanceof M || o.observe === 'events') return i;
      const l = i.pipe(te((a) => a instanceof A));
      switch (o.observe || 'body') {
        case 'body':
          switch (s.responseType) {
            case 'arraybuffer':
              return l.pipe(
                k((a) => {
                  if (a.body !== null && !(a.body instanceof ArrayBuffer)) throw new T(2806, !1);
                  return a.body;
                }),
              );
            case 'blob':
              return l.pipe(
                k((a) => {
                  if (a.body !== null && !(a.body instanceof Blob)) throw new T(2807, !1);
                  return a.body;
                }),
              );
            case 'text':
              return l.pipe(
                k((a) => {
                  if (a.body !== null && typeof a.body !== 'string') throw new T(2808, !1);
                  return a.body;
                }),
              );
            default:
              return l.pipe(k((a) => a.body));
          }
        case 'response':
          return l;
        default:
          throw new T(2809, !1);
      }
    }
    delete(t, n = {}) {
      return this.request('DELETE', t, n);
    }
    get(t, n = {}) {
      return this.request('GET', t, n);
    }
    head(t, n = {}) {
      return this.request('HEAD', t, n);
    }
    jsonp(t, n) {
      return this.request('JSONP', t, {
        params: new g().append(n, 'JSONP_CALLBACK'),
        observe: 'body',
        responseType: 'json',
      });
    }
    options(t, n = {}) {
      return this.request('OPTIONS', t, n);
    }
    patch(t, n, o = {}) {
      return this.request('PATCH', t, K(o, n));
    }
    post(t, n, o = {}) {
      return this.request('POST', t, K(o, n));
    }
    put(t, n, o = {}) {
      return this.request('PUT', t, K(o, n));
    }
    static \u0275fac = (n) => new (n || r)(v(Q));
    static \u0275prov = f({ token: r, factory: r.\u0275fac, providedIn: 'root' });
  }
  return r;
})();
var Se = new m('', { factory: () => !0 }),
  Be = 'XSRF-TOKEN',
  ze = new m('', { factory: () => Be }),
  Xe = 'X-XSRF-TOKEN',
  Je = new m('', { factory: () => Xe }),
  Ve = (() => {
    class r {
      cookieName = h(ze);
      doc = h(C);
      lastCookieString = '';
      lastToken = null;
      parseCount = 0;
      getToken() {
        const t = this.doc.cookie || '';
        return (
          t !== this.lastCookieString &&
            (this.parseCount++, (this.lastToken = ue(t, this.cookieName)), (this.lastCookieString = t)),
          this.lastToken
        );
      }
      static \u0275fac = (n) => new (n || r)();
      static \u0275prov = f({ token: r, factory: r.\u0275fac, providedIn: 'root' });
    }
    return r;
  })(),
  Re = (() => {
    class r {
      static \u0275fac = (n) => new (n || r)();
      static \u0275prov = f({
        token: r,
        factory: (n) => {
          let o = null;
          return n ? (o = new (n || r)()) : (o = v(Ve)), o;
        },
        providedIn: 'root',
      });
    }
    return r;
  })();
function $e(r, e) {
  if (!h(Se) || r.method === 'GET' || r.method === 'HEAD') return e(r);
  try {
    const o = h(W).href,
      { origin: s } = new URL(o),
      { origin: i } = new URL(r.url, s);
    if (s !== i) return e(r);
  } catch {
    return e(r);
  }
  const t = h(Re).getToken(),
    n = h(Je);
  return t != null && !r.headers.has(n) && (r = r.clone({ headers: r.headers.set(n, t) })), e(r);
}
var H = ((r) => (
  (r[(r.Interceptors = 0)] = 'Interceptors'),
  (r[(r.LegacyInterceptors = 1)] = 'LegacyInterceptors'),
  (r[(r.CustomXsrfConfiguration = 2)] = 'CustomXsrfConfiguration'),
  (r[(r.NoXsrfProtection = 3)] = 'NoXsrfProtection'),
  (r[(r.JsonpSupport = 4)] = 'JsonpSupport'),
  (r[(r.RequestsMadeViaParent = 5)] = 'RequestsMadeViaParent'),
  (r[(r.Fetch = 6)] = 'Fetch'),
  r
))(H || {});
function Ge(r, e) {
  return { \u0275kind: r, \u0275providers: e };
}
function We(...r) {
  const e = [
    be,
    J,
    { provide: Q, useExisting: J },
    { provide: Z, useFactory: () => h(je, { optional: !0 }) ?? h(Y) },
    { provide: q, useValue: $e, multi: !0 },
  ];
  for (const t of r) e.push(...t.\u0275providers);
  return se(e);
}
function Ke(r) {
  return Ge(
    H.Interceptors,
    r.map((e) => ({ provide: q, useValue: e, multi: !0 })),
  );
}

export { be as h, de as c, G as a, Ke as j, N as g, U as f, ue as e, W as d, We as i, Ze as b };
