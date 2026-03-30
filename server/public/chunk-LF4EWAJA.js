var fp = Object.create;
var Ko = Object.defineProperty,
  pp = Object.defineProperties,
  hp = Object.getOwnPropertyDescriptor,
  gp = Object.getOwnPropertyDescriptors,
  mp = Object.getOwnPropertyNames,
  Jn = Object.getOwnPropertySymbols,
  yp = Object.getPrototypeOf,
  Jo = Object.prototype.hasOwnProperty,
  ac = Object.prototype.propertyIsEnumerable;
var sc = (e, t, n) => (t in e ? Ko(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (e[t] = n)),
  Q = (e, t) => {
    for (var n in (t ||= {})) Jo.call(t, n) && sc(e, n, t[n]);
    if (Jn) for (var n of Jn(t)) ac.call(t, n) && sc(e, n, t[n]);
    return e;
  },
  Z = (e, t) => pp(e, gp(t));
var gI = (e, t) => {
  var n = {};
  for (var r in e) Jo.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
  if (e != null && Jn) for (var r of Jn(e)) t.indexOf(r) < 0 && ac.call(e, r) && (n[r] = e[r]);
  return n;
};
var mI = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var vp = (e, t, n, r) => {
  if ((t && typeof t === 'object') || typeof t === 'function')
    for (const o of mp(t))
      !Jo.call(e, o) && o !== n && Ko(e, o, { get: () => t[o], enumerable: !(r = hp(t, o)) || r.enumerable });
  return e;
};
var yI = (e, t, n) => (
  (n = e != null ? fp(yp(e)) : {}), vp(t || !e || !e.__esModule ? Ko(n, 'default', { value: e, enumerable: !0 }) : n, e)
);
function Mt(e) {
  const n = e((r) => {
    Error.call(r), (r.stack = new Error().stack);
  });
  return (n.prototype = Object.create(Error.prototype)), (n.prototype.constructor = n), n;
}
var Je = Mt(
  (e) =>
    function () {
      e(this), (this.name = 'EmptyError'), (this.message = 'no elements in sequence');
    },
);
function I(e) {
  return typeof e === 'function';
}
var Xn = Mt(
  (e) =>
    function (n) {
      e(this),
        (this.message = n
          ? `${n.length} errors occurred during unsubscription:
${n
  .map((r, o) => `${o + 1}) ${r.toString()}`)
  .join(`
  `)}`
          : ''),
        (this.name = 'UnsubscriptionError'),
        (this.errors = n);
    },
);
function Xe(e, t) {
  if (e) {
    const n = e.indexOf(t);
    0 <= n && e.splice(n, 1);
  }
}
var B = class e {
  constructor(t) {
    (this.initialTeardown = t), (this.closed = !1), (this._parentage = null), (this._finalizers = null);
  }
  unsubscribe() {
    let t;
    if (!this.closed) {
      this.closed = !0;
      const { _parentage: n } = this;
      if (n)
        if (((this._parentage = null), Array.isArray(n))) for (const i of n) i.remove(this);
        else n.remove(this);
      const { initialTeardown: r } = this;
      if (I(r))
        try {
          r();
        } catch (i) {
          t = i instanceof Xn ? i.errors : [i];
        }
      const { _finalizers: o } = this;
      if (o) {
        this._finalizers = null;
        for (const i of o)
          try {
            cc(i);
          } catch (s) {
            (t = t ?? []), s instanceof Xn ? (t = [...t, ...s.errors]) : t.push(s);
          }
      }
      if (t) throw new Xn(t);
    }
  }
  add(t) {
    var n;
    if (t && t !== this)
      if (this.closed) cc(t);
      else {
        if (t instanceof e) {
          if (t.closed || t._hasParent(this)) return;
          t._addParent(this);
        }
        (this._finalizers = (n = this._finalizers) !== null && n !== void 0 ? n : []).push(t);
      }
  }
  _hasParent(t) {
    const { _parentage: n } = this;
    return n === t || (Array.isArray(n) && n.includes(t));
  }
  _addParent(t) {
    const { _parentage: n } = this;
    this._parentage = Array.isArray(n) ? (n.push(t), n) : n ? [n, t] : t;
  }
  _removeParent(t) {
    const { _parentage: n } = this;
    n === t ? (this._parentage = null) : Array.isArray(n) && Xe(n, t);
  }
  remove(t) {
    const { _finalizers: n } = this;
    n && Xe(n, t), t instanceof e && t._removeParent(this);
  }
};
B.EMPTY = (() => {
  const e = new B();
  return (e.closed = !0), e;
})();
var Xo = B.EMPTY;
function er(e) {
  return e instanceof B || (e && 'closed' in e && I(e.remove) && I(e.add) && I(e.unsubscribe));
}
function cc(e) {
  I(e) ? e() : e.unsubscribe();
}
var ae = {
  onUnhandledError: null,
  onStoppedNotification: null,
  Promise: void 0,
  useDeprecatedSynchronousErrorHandling: !1,
  useDeprecatedNextContext: !1,
};
var _t = {
  setTimeout(e, t, ...n) {
    const { delegate: r } = _t;
    return r?.setTimeout ? r.setTimeout(e, t, ...n) : setTimeout(e, t, ...n);
  },
  clearTimeout(e) {
    const { delegate: t } = _t;
    return (t?.clearTimeout || clearTimeout)(e);
  },
  delegate: void 0,
};
function tr(e) {
  _t.setTimeout(() => {
    const { onUnhandledError: t } = ae;
    if (t) t(e);
    else throw e;
  });
}
function Xt() {}
var lc = ei('C', void 0, void 0);
function uc(e) {
  return ei('E', void 0, e);
}
function dc(e) {
  return ei('N', e, void 0);
}
function ei(e, t, n) {
  return { kind: e, value: t, error: n };
}
var et = null;
function Nt(e) {
  if (ae.useDeprecatedSynchronousErrorHandling) {
    const t = !et;
    if ((t && (et = { errorThrown: !1, error: null }), e(), t)) {
      const { errorThrown: n, error: r } = et;
      if (((et = null), n)) throw r;
    }
  } else e();
}
function fc(e) {
  ae.useDeprecatedSynchronousErrorHandling && et && ((et.errorThrown = !0), (et.error = e));
}
var tt = class extends B {
    constructor(t) {
      super(), (this.isStopped = !1), t ? ((this.destination = t), er(t) && t.add(this)) : (this.destination = Dp);
    }
    static create(t, n, r) {
      return new je(t, n, r);
    }
    next(t) {
      this.isStopped ? ni(dc(t), this) : this._next(t);
    }
    error(t) {
      this.isStopped ? ni(uc(t), this) : ((this.isStopped = !0), this._error(t));
    }
    complete() {
      this.isStopped ? ni(lc, this) : ((this.isStopped = !0), this._complete());
    }
    unsubscribe() {
      this.closed || ((this.isStopped = !0), super.unsubscribe(), (this.destination = null));
    }
    _next(t) {
      this.destination.next(t);
    }
    _error(t) {
      try {
        this.destination.error(t);
      } finally {
        this.unsubscribe();
      }
    }
    _complete() {
      try {
        this.destination.complete();
      } finally {
        this.unsubscribe();
      }
    }
  },
  Ep = Function.prototype.bind;
function ti(e, t) {
  return Ep.call(e, t);
}
var ri = class {
    constructor(t) {
      this.partialObserver = t;
    }
    next(t) {
      const { partialObserver: n } = this;
      if (n.next)
        try {
          n.next(t);
        } catch (r) {
          nr(r);
        }
    }
    error(t) {
      const { partialObserver: n } = this;
      if (n.error)
        try {
          n.error(t);
        } catch (r) {
          nr(r);
        }
      else nr(t);
    }
    complete() {
      const { partialObserver: t } = this;
      if (t.complete)
        try {
          t.complete();
        } catch (n) {
          nr(n);
        }
    }
  },
  je = class extends tt {
    constructor(t, n, r) {
      super();
      let o;
      if (I(t) || !t) o = { next: t ?? void 0, error: n ?? void 0, complete: r ?? void 0 };
      else {
        let i;
        this && ae.useDeprecatedNextContext
          ? ((i = Object.create(t)),
            (i.unsubscribe = () => this.unsubscribe()),
            (o = {
              next: t.next && ti(t.next, i),
              error: t.error && ti(t.error, i),
              complete: t.complete && ti(t.complete, i),
            }))
          : (o = t);
      }
      this.destination = new ri(o);
    }
  };
function nr(e) {
  ae.useDeprecatedSynchronousErrorHandling ? fc(e) : tr(e);
}
function Ip(e) {
  throw e;
}
function ni(e, t) {
  const { onStoppedNotification: n } = ae;
  n && _t.setTimeout(() => n(e, t));
}
var Dp = { closed: !0, next: Xt, error: Ip, complete: Xt };
function Cp(e, t) {
  const n = typeof t === 'object';
  return new Promise((r, o) => {
    const i = new je({
      next: (s) => {
        r(s), i.unsubscribe();
      },
      error: o,
      complete: () => {
        n ? r(t.defaultValue) : o(new Je());
      },
    });
    e.subscribe(i);
  });
}
var St = (typeof Symbol === 'function' && Symbol.observable) || '@@observable';
function ee(e) {
  return e;
}
function bp(...e) {
  return oi(e);
}
function oi(e) {
  return e.length === 0 ? ee : e.length === 1 ? e[0] : (n) => e.reduce((r, o) => o(r), n);
}
var w = (() => {
  class e {
    constructor(n) {
      n && (this._subscribe = n);
    }
    lift(n) {
      const r = new e();
      return (r.source = this), (r.operator = n), r;
    }
    subscribe(n, r, o) {
      const i = wp(n) ? n : new je(n, r, o);
      return (
        Nt(() => {
          const { operator: s, source: a } = this;
          i.add(s ? s.call(i, a) : a ? this._subscribe(i) : this._trySubscribe(i));
        }),
        i
      );
    }
    _trySubscribe(n) {
      try {
        return this._subscribe(n);
      } catch (r) {
        n.error(r);
      }
    }
    forEach(n, r) {
      return (
        (r = pc(r)),
        new r((o, i) => {
          const s = new je({
            next: (a) => {
              try {
                n(a);
              } catch (c) {
                i(c), s.unsubscribe();
              }
            },
            error: i,
            complete: o,
          });
          this.subscribe(s);
        })
      );
    }
    _subscribe(n) {
      var r;
      return (r = this.source) === null || r === void 0 ? void 0 : r.subscribe(n);
    }
    [St]() {
      return this;
    }
    pipe(...n) {
      return oi(n)(this);
    }
    toPromise(n) {
      return (
        (n = pc(n)),
        new n((r, o) => {
          let i;
          this.subscribe(
            (s) => (i = s),
            (s) => o(s),
            () => r(i),
          );
        })
      );
    }
  }
  return (e.create = (t) => new e(t)), e;
})();
function pc(e) {
  var t;
  return (t = e ?? ae.Promise) !== null && t !== void 0 ? t : Promise;
}
function Tp(e) {
  return e && I(e.next) && I(e.error) && I(e.complete);
}
function wp(e) {
  return (e && e instanceof tt) || (Tp(e) && er(e));
}
function Mp(e) {
  return I(e?.lift);
}
function N(e) {
  return (t) => {
    if (Mp(t))
      return t.lift(function (n) {
        try {
          return e(n, this);
        } catch (r) {
          this.error(r);
        }
      });
    throw new TypeError('Unable to lift unknown Observable type');
  };
}
function M(e, t, n, r, o) {
  return new ii(e, t, n, r, o);
}
var ii = class extends tt {
  constructor(t, n, r, o, i, s) {
    super(t),
      (this.onFinalize = i),
      (this.shouldUnsubscribe = s),
      (this._next = n
        ? (a) => {
            try {
              n(a);
            } catch (c) {
              t.error(c);
            }
          }
        : super._next),
      (this._error = o
        ? function (a) {
            try {
              o(a);
            } catch (c) {
              t.error(c);
            } finally {
              this.unsubscribe();
            }
          }
        : super._error),
      (this._complete = r
        ? function () {
            try {
              r();
            } catch (a) {
              t.error(a);
            } finally {
              this.unsubscribe();
            }
          }
        : super._complete);
  }
  unsubscribe() {
    var t;
    if (!this.shouldUnsubscribe || this.shouldUnsubscribe()) {
      const { closed: n } = this;
      super.unsubscribe(), !n && ((t = this.onFinalize) === null || t === void 0 || t.call(this));
    }
  }
};
var hc = Mt(
  (e) =>
    function () {
      e(this), (this.name = 'ObjectUnsubscribedError'), (this.message = 'object unsubscribed');
    },
);
var Me = (() => {
    class e extends w {
      constructor() {
        super(),
          (this.closed = !1),
          (this.currentObservers = null),
          (this.observers = []),
          (this.isStopped = !1),
          (this.hasError = !1),
          (this.thrownError = null);
      }
      lift(n) {
        const r = new rr(this, this);
        return (r.operator = n), r;
      }
      _throwIfClosed() {
        if (this.closed) throw new hc();
      }
      next(n) {
        Nt(() => {
          if ((this._throwIfClosed(), !this.isStopped)) {
            this.currentObservers || (this.currentObservers = Array.from(this.observers));
            for (const r of this.currentObservers) r.next(n);
          }
        });
      }
      error(n) {
        Nt(() => {
          if ((this._throwIfClosed(), !this.isStopped)) {
            (this.hasError = this.isStopped = !0), (this.thrownError = n);
            const { observers: r } = this;
            for (; r.length; ) r.shift().error(n);
          }
        });
      }
      complete() {
        Nt(() => {
          if ((this._throwIfClosed(), !this.isStopped)) {
            this.isStopped = !0;
            const { observers: n } = this;
            for (; n.length; ) n.shift().complete();
          }
        });
      }
      unsubscribe() {
        (this.isStopped = this.closed = !0), (this.observers = this.currentObservers = null);
      }
      get observed() {
        var n;
        return ((n = this.observers) === null || n === void 0 ? void 0 : n.length) > 0;
      }
      _trySubscribe(n) {
        return this._throwIfClosed(), super._trySubscribe(n);
      }
      _subscribe(n) {
        return this._throwIfClosed(), this._checkFinalizedStatuses(n), this._innerSubscribe(n);
      }
      _innerSubscribe(n) {
        const { hasError: r, isStopped: o, observers: i } = this;
        return r || o
          ? Xo
          : ((this.currentObservers = null),
            i.push(n),
            new B(() => {
              (this.currentObservers = null), Xe(i, n);
            }));
      }
      _checkFinalizedStatuses(n) {
        const { hasError: r, thrownError: o, isStopped: i } = this;
        r ? n.error(o) : i && n.complete();
      }
      asObservable() {
        const n = new w();
        return (n.source = this), n;
      }
    }
    return (e.create = (t, n) => new rr(t, n)), e;
  })(),
  rr = class extends Me {
    constructor(t, n) {
      super(), (this.destination = t), (this.source = n);
    }
    next(t) {
      var n, r;
      (r = (n = this.destination) === null || n === void 0 ? void 0 : n.next) === null || r === void 0 || r.call(n, t);
    }
    error(t) {
      var n, r;
      (r = (n = this.destination) === null || n === void 0 ? void 0 : n.error) === null || r === void 0 || r.call(n, t);
    }
    complete() {
      var t, n;
      (n = (t = this.destination) === null || t === void 0 ? void 0 : t.complete) === null || n === void 0 || n.call(t);
    }
    _subscribe(t) {
      var n, r;
      return (r = (n = this.source) === null || n === void 0 ? void 0 : n.subscribe(t)) !== null && r !== void 0
        ? r
        : Xo;
    }
  };
var en = class extends Me {
  constructor(t) {
    super(), (this._value = t);
  }
  get value() {
    return this.getValue();
  }
  _subscribe(t) {
    const n = super._subscribe(t);
    return !n.closed && t.next(this._value), n;
  }
  getValue() {
    const { hasError: t, thrownError: n, _value: r } = this;
    if (t) throw n;
    return this._throwIfClosed(), r;
  }
  next(t) {
    super.next((this._value = t));
  }
};
var si = {
  now() {
    return (si.delegate || Date).now();
  },
  delegate: void 0,
};
var or = class extends B {
  constructor(_t, _n) {
    super();
  }
  schedule(_t, _n = 0) {
    return this;
  }
};
var tn = {
  setInterval(e, t, ...n) {
    const { delegate: r } = tn;
    return r?.setInterval ? r.setInterval(e, t, ...n) : setInterval(e, t, ...n);
  },
  clearInterval(e) {
    const { delegate: t } = tn;
    return (t?.clearInterval || clearInterval)(e);
  },
  delegate: void 0,
};
var ir = class extends or {
  constructor(t, n) {
    super(t, n), (this.scheduler = t), (this.work = n), (this.pending = !1);
  }
  schedule(t, n = 0) {
    var r;
    if (this.closed) return this;
    this.state = t;
    const o = this.id,
      i = this.scheduler;
    return (
      o != null && (this.id = this.recycleAsyncId(i, o, n)),
      (this.pending = !0),
      (this.delay = n),
      (this.id = (r = this.id) !== null && r !== void 0 ? r : this.requestAsyncId(i, this.id, n)),
      this
    );
  }
  requestAsyncId(t, _n, r = 0) {
    return tn.setInterval(t.flush.bind(t, this), r);
  }
  recycleAsyncId(_t, n, r = 0) {
    if (r != null && this.delay === r && this.pending === !1) return n;
    n != null && tn.clearInterval(n);
  }
  execute(t, n) {
    if (this.closed) return new Error('executing a cancelled action');
    this.pending = !1;
    const r = this._execute(t, n);
    if (r) return r;
    this.pending === !1 && this.id != null && (this.id = this.recycleAsyncId(this.scheduler, this.id, null));
  }
  _execute(t, _n) {
    let r = !1,
      o;
    try {
      this.work(t);
    } catch (i) {
      (r = !0), (o = i || new Error('Scheduled action threw falsy error'));
    }
    if (r) return this.unsubscribe(), o;
  }
  unsubscribe() {
    if (!this.closed) {
      const { id: t, scheduler: n } = this,
        { actions: r } = n;
      (this.work = this.state = this.scheduler = null),
        (this.pending = !1),
        Xe(r, this),
        t != null && (this.id = this.recycleAsyncId(n, t, null)),
        (this.delay = null),
        super.unsubscribe();
    }
  }
};
var xt = class e {
  constructor(t, n = e.now) {
    (this.schedulerActionCtor = t), (this.now = n);
  }
  schedule(t, n = 0, r) {
    return new this.schedulerActionCtor(this, t).schedule(r, n);
  }
};
xt.now = si.now;
var sr = class extends xt {
  constructor(t, n = xt.now) {
    super(t, n), (this.actions = []), (this._active = !1);
  }
  flush(t) {
    const { actions: n } = this;
    if (this._active) {
      n.push(t);
      return;
    }
    let r;
    this._active = !0;
    do if ((r = t.execute(t.state, t.delay))) break;
    while ((t = n.shift()));
    if (((this._active = !1), r)) {
      for (; (t = n.shift()); ) t.unsubscribe();
      throw r;
    }
  }
};
var _p = new sr(ir),
  gc = _p;
var nn = new w((e) => e.complete());
function ar(e) {
  return e && I(e.schedule);
}
function mc(e) {
  return e[e.length - 1];
}
function cr(e) {
  return I(mc(e)) ? e.pop() : void 0;
}
function Ve(e) {
  return ar(mc(e)) ? e.pop() : void 0;
}
function vc(e, t, n, r) {
  function o(i) {
    return i instanceof n
      ? i
      : new n((s) => {
          s(i);
        });
  }
  return new (n || (n = Promise))((i, s) => {
    function a(u) {
      try {
        l(r.next(u));
      } catch (d) {
        s(d);
      }
    }
    function c(u) {
      try {
        l(r.throw(u));
      } catch (d) {
        s(d);
      }
    }
    function l(u) {
      u.done ? i(u.value) : o(u.value).then(a, c);
    }
    l((r = r.apply(e, t || [])).next());
  });
}
function yc(e) {
  var t = typeof Symbol === 'function' && Symbol.iterator,
    n = t && e[t],
    r = 0;
  if (n) return n.call(e);
  if (e && typeof e.length === 'number')
    return { next: () => (e && r >= e.length && (e = void 0), { value: e?.[r++], done: !e }) };
  throw new TypeError(t ? 'Object is not iterable.' : 'Symbol.iterator is not defined.');
}
function nt(e) {
  return this instanceof nt ? ((this.v = e), this) : new nt(e);
}
function Ec(e, t, n) {
  if (!Symbol.asyncIterator) throw new TypeError('Symbol.asyncIterator is not defined.');
  var r = n.apply(e, t || []),
    o,
    i = [];
  return (
    (o = Object.create((typeof AsyncIterator === 'function' ? AsyncIterator : Object).prototype)),
    a('next'),
    a('throw'),
    a('return', s),
    (o[Symbol.asyncIterator] = function () {
      return this;
    }),
    o
  );
  function s(f) {
    return (h) => Promise.resolve(h).then(f, d);
  }
  function a(f, h) {
    r[f] &&
      ((o[f] = (v) =>
        new Promise((S, T) => {
          i.push([f, v, S, T]) > 1 || c(f, v);
        })),
      h && (o[f] = h(o[f])));
  }
  function c(f, h) {
    try {
      l(r[f](h));
    } catch (v) {
      p(i[0][3], v);
    }
  }
  function l(f) {
    f.value instanceof nt ? Promise.resolve(f.value.v).then(u, d) : p(i[0][2], f);
  }
  function u(f) {
    c('next', f);
  }
  function d(f) {
    c('throw', f);
  }
  function p(f, h) {
    f(h), i.shift(), i.length && c(i[0][0], i[0][1]);
  }
}
function Ic(e) {
  if (!Symbol.asyncIterator) throw new TypeError('Symbol.asyncIterator is not defined.');
  var t = e[Symbol.asyncIterator],
    n;
  return t
    ? t.call(e)
    : ((e = typeof yc === 'function' ? yc(e) : e[Symbol.iterator]()),
      (n = {}),
      r('next'),
      r('throw'),
      r('return'),
      (n[Symbol.asyncIterator] = function () {
        return this;
      }),
      n);
  function r(i) {
    n[i] =
      e[i] &&
      ((s) =>
        new Promise((a, c) => {
          (s = e[i](s)), o(a, c, s.done, s.value);
        }));
  }
  function o(i, s, a, c) {
    Promise.resolve(c).then((l) => {
      i({ value: l, done: a });
    }, s);
  }
}
var lr = (e) => e && typeof e.length === 'number' && typeof e !== 'function';
function ur(e) {
  return I(e?.then);
}
function dr(e) {
  return I(e[St]);
}
function fr(e) {
  return Symbol.asyncIterator && I(e?.[Symbol.asyncIterator]);
}
function pr(e) {
  return new TypeError(
    `You provided ${e !== null && typeof e === 'object' ? 'an invalid object' : `'${e}'`} where a stream was expected. You can provide an Observable, Promise, ReadableStream, Array, AsyncIterable, or Iterable.`,
  );
}
function Np() {
  return typeof Symbol !== 'function' || !Symbol.iterator ? '@@iterator' : Symbol.iterator;
}
var hr = Np();
function gr(e) {
  return I(e?.[hr]);
}
function mr(e) {
  return Ec(this, arguments, function* () {
    const n = e.getReader();
    try {
      for (;;) {
        const { value: r, done: o } = yield nt(n.read());
        if (o) return yield nt(void 0);
        yield yield nt(r);
      }
    } finally {
      n.releaseLock();
    }
  });
}
function yr(e) {
  return I(e?.getReader);
}
function L(e) {
  if (e instanceof w) return e;
  if (e != null) {
    if (dr(e)) return Sp(e);
    if (lr(e)) return xp(e);
    if (ur(e)) return Ap(e);
    if (fr(e)) return Dc(e);
    if (gr(e)) return Rp(e);
    if (yr(e)) return kp(e);
  }
  throw pr(e);
}
function Sp(e) {
  return new w((t) => {
    const n = e[St]();
    if (I(n.subscribe)) return n.subscribe(t);
    throw new TypeError('Provided object does not correctly implement Symbol.observable');
  });
}
function xp(e) {
  return new w((t) => {
    for (let n = 0; n < e.length && !t.closed; n++) t.next(e[n]);
    t.complete();
  });
}
function Ap(e) {
  return new w((t) => {
    e.then(
      (n) => {
        t.closed || (t.next(n), t.complete());
      },
      (n) => t.error(n),
    ).then(null, tr);
  });
}
function Rp(e) {
  return new w((t) => {
    for (const n of e) if ((t.next(n), t.closed)) return;
    t.complete();
  });
}
function Dc(e) {
  return new w((t) => {
    Op(e, t).catch((n) => t.error(n));
  });
}
function kp(e) {
  return Dc(mr(e));
}
function Op(e, t) {
  var n, r, o, i;
  return vc(this, void 0, void 0, function* () {
    try {
      for (n = Ic(e); (r = yield n.next()), !r.done; ) {
        const s = r.value;
        if ((t.next(s), t.closed)) return;
      }
    } catch (s) {
      o = { error: s };
    } finally {
      try {
        r && !r.done && (i = n.return) && (yield i.call(n));
      } finally {
        if (o) throw o.error;
      }
    }
    t.complete();
  });
}
function X(e, t, n, r = 0, o = !1) {
  const i = t.schedule(function () {
    n(), o ? e.add(this.schedule(null, r)) : this.unsubscribe();
  }, r);
  if ((e.add(i), !o)) return i;
}
function vr(e, t = 0) {
  return N((n, r) => {
    n.subscribe(
      M(
        r,
        (o) => X(r, e, () => r.next(o), t),
        () => X(r, e, () => r.complete(), t),
        (o) => X(r, e, () => r.error(o), t),
      ),
    );
  });
}
function Er(e, t = 0) {
  return N((n, r) => {
    r.add(e.schedule(() => n.subscribe(r), t));
  });
}
function Cc(e, t) {
  return L(e).pipe(Er(t), vr(t));
}
function bc(e, t) {
  return L(e).pipe(Er(t), vr(t));
}
function Tc(e, t) {
  return new w((n) => {
    let r = 0;
    return t.schedule(function () {
      r === e.length ? n.complete() : (n.next(e[r++]), n.closed || this.schedule());
    });
  });
}
function wc(e, t) {
  return new w((n) => {
    let r;
    return (
      X(n, t, () => {
        (r = e[hr]()),
          X(
            n,
            t,
            () => {
              let o, i;
              try {
                ({ value: o, done: i } = r.next());
              } catch (s) {
                n.error(s);
                return;
              }
              i ? n.complete() : n.next(o);
            },
            0,
            !0,
          );
      }),
      () => I(r?.return) && r.return()
    );
  });
}
function Ir(e, t) {
  if (!e) throw new Error('Iterable cannot be null');
  return new w((n) => {
    X(n, t, () => {
      const r = e[Symbol.asyncIterator]();
      X(
        n,
        t,
        () => {
          r.next().then((o) => {
            o.done ? n.complete() : n.next(o.value);
          });
        },
        0,
        !0,
      );
    });
  });
}
function Mc(e, t) {
  return Ir(mr(e), t);
}
function _c(e, t) {
  if (e != null) {
    if (dr(e)) return Cc(e, t);
    if (lr(e)) return Tc(e, t);
    if (ur(e)) return bc(e, t);
    if (fr(e)) return Ir(e, t);
    if (gr(e)) return wc(e, t);
    if (yr(e)) return Mc(e, t);
  }
  throw pr(e);
}
function He(e, t) {
  return t ? _c(e, t) : L(e);
}
function Pp(...e) {
  const t = Ve(e);
  return He(e, t);
}
function Lp(e, t) {
  const n = I(e) ? e : () => e,
    r = (o) => o.error(n());
  return new w(t ? (o) => t.schedule(r, 0, o) : r);
}
function Fp(e) {
  return !!e && (e instanceof w || (I(e.lift) && I(e.subscribe)));
}
function Nc(e) {
  return e instanceof Date && !Number.isNaN(e);
}
function rt(e, t) {
  return N((n, r) => {
    let o = 0;
    n.subscribe(
      M(r, (i) => {
        r.next(e.call(t, i, o++));
      }),
    );
  });
}
var { isArray: jp } = Array;
function Vp(e, t) {
  return jp(t) ? e(...t) : e(t);
}
function Dr(e) {
  return rt((t) => Vp(e, t));
}
var { isArray: Hp } = Array,
  { getPrototypeOf: Bp, prototype: $p, keys: Up } = Object;
function Cr(e) {
  if (e.length === 1) {
    const t = e[0];
    if (Hp(t)) return { args: t, keys: null };
    if (qp(t)) {
      const n = Up(t);
      return { args: n.map((r) => t[r]), keys: n };
    }
  }
  return { args: e, keys: null };
}
function qp(e) {
  return e && typeof e === 'object' && Bp(e) === $p;
}
function br(e, t) {
  return e.reduce((n, r, o) => ((n[r] = t[o]), n), {});
}
function Wp(...e) {
  const t = Ve(e),
    n = cr(e),
    { args: r, keys: o } = Cr(e);
  if (r.length === 0) return He([], t);
  const i = new w(Gp(r, t, o ? (s) => br(o, s) : ee));
  return n ? i.pipe(Dr(n)) : i;
}
function Gp(e, t, n = ee) {
  return (r) => {
    Sc(
      t,
      () => {
        let { length: o } = e,
          i = new Array(o),
          s = o,
          a = o;
        for (let c = 0; c < o; c++)
          Sc(
            t,
            () => {
              let l = He(e[c], t),
                u = !1;
              l.subscribe(
                M(
                  r,
                  (d) => {
                    (i[c] = d), u || ((u = !0), a--), a || r.next(n(i.slice()));
                  },
                  () => {
                    --s || r.complete();
                  },
                ),
              );
            },
            r,
          );
      },
      r,
    );
  };
}
function Sc(e, t, n) {
  e ? X(n, e, t) : t();
}
function xc(e, t, n, r, o, i, s, a) {
  let c = [],
    l = 0,
    u = 0,
    d = !1,
    p = () => {
      d && !c.length && !l && t.complete();
    },
    f = (v) => (l < r ? h(v) : c.push(v)),
    h = (v) => {
      i && t.next(v), l++;
      let S = !1;
      L(n(v, u++)).subscribe(
        M(
          t,
          (T) => {
            o?.(T), i ? f(T) : t.next(T);
          },
          () => {
            S = !0;
          },
          void 0,
          () => {
            if (S)
              try {
                for (l--; c.length && l < r; ) {
                  const T = c.shift();
                  s ? X(t, s, () => h(T)) : h(T);
                }
                p();
              } catch (T) {
                t.error(T);
              }
          },
        ),
      );
    };
  return (
    e.subscribe(
      M(t, f, () => {
        (d = !0), p();
      }),
    ),
    () => {
      a?.();
    }
  );
}
function ot(e, t, n = 1 / 0) {
  return I(t)
    ? ot((r, o) => rt((i, s) => t(r, i, o, s))(L(e(r, o))), n)
    : (typeof t === 'number' && (n = t), N((r, o) => xc(r, o, e, n)));
}
function ai(e = 1 / 0) {
  return ot(ee, e);
}
function Ac() {
  return ai(1);
}
function Tr(...e) {
  return Ac()(He(e, Ve(e)));
}
function zp(e) {
  return new w((t) => {
    L(e()).subscribe(t);
  });
}
function Qp(...e) {
  const t = cr(e),
    { args: n, keys: r } = Cr(e),
    o = new w((i) => {
      const { length: s } = n;
      if (!s) {
        i.complete();
        return;
      }
      let a = new Array(s),
        c = s,
        l = s;
      for (let u = 0; u < s; u++) {
        let d = !1;
        L(n[u]).subscribe(
          M(
            i,
            (p) => {
              d || ((d = !0), l--), (a[u] = p);
            },
            () => c--,
            void 0,
            () => {
              (!c || !d) && (l || i.next(r ? br(r, a) : a), i.complete());
            },
          ),
        );
      }
    });
  return t ? o.pipe(Dr(t)) : o;
}
function ci(e = 0, t, n = gc) {
  let r = -1;
  return (
    t != null && (ar(t) ? (n = t) : (r = t)),
    new w((o) => {
      let i = Nc(e) ? +e - n.now() : e;
      i < 0 && (i = 0);
      let s = 0;
      return n.schedule(function () {
        o.closed || (o.next(s++), 0 <= r ? this.schedule(void 0, r) : o.complete());
      }, i);
    })
  );
}
function wr(e, t) {
  return N((n, r) => {
    let o = 0;
    n.subscribe(M(r, (i) => e.call(t, i, o++) && r.next(i)));
  });
}
function li(e) {
  return N((t, n) => {
    let r = null,
      o = !1,
      i;
    (r = t.subscribe(
      M(n, void 0, void 0, (s) => {
        (i = L(e(s, li(e)(t)))), r ? (r.unsubscribe(), (r = null), i.subscribe(n)) : (o = !0);
      }),
    )),
      o && (r.unsubscribe(), (r = null), i.subscribe(n));
  });
}
function Zp(e, t) {
  return I(t) ? ot(e, t, 1) : ot(e, 1);
}
function Rc(e) {
  return N((t, n) => {
    let r = !1;
    t.subscribe(
      M(
        n,
        (o) => {
          (r = !0), n.next(o);
        },
        () => {
          r || n.next(e), n.complete();
        },
      ),
    );
  });
}
function ui(e) {
  return e <= 0
    ? () => nn
    : N((t, n) => {
        let r = 0;
        t.subscribe(
          M(n, (o) => {
            ++r <= e && (n.next(o), e <= r && n.complete());
          }),
        );
      });
}
function kc(e = Yp) {
  return N((t, n) => {
    let r = !1;
    t.subscribe(
      M(
        n,
        (o) => {
          (r = !0), n.next(o);
        },
        () => (r ? n.complete() : n.error(e())),
      ),
    );
  });
}
function Yp() {
  return new Je();
}
function Kp(e) {
  return N((t, n) => {
    try {
      t.subscribe(n);
    } finally {
      n.add(e);
    }
  });
}
function Jp(e, t) {
  const n = arguments.length >= 2;
  return (r) => r.pipe(e ? wr((o, i) => e(o, i, r)) : ee, ui(1), n ? Rc(t) : kc(() => new Je()));
}
function Xp(e) {
  return e <= 0
    ? () => nn
    : N((t, n) => {
        let r = [];
        t.subscribe(
          M(
            n,
            (o) => {
              r.push(o), e < r.length && r.shift();
            },
            () => {
              for (const o of r) n.next(o);
              n.complete();
            },
            void 0,
            () => {
              r = null;
            },
          ),
        );
      });
}
function eh(e = 1 / 0) {
  let t;
  e && typeof e === 'object' ? (t = e) : (t = { count: e });
  const { count: n = 1 / 0, delay: r, resetOnSuccess: o = !1 } = t;
  return n <= 0
    ? ee
    : N((i, s) => {
        let a = 0,
          c,
          l = () => {
            let u = !1;
            (c = i.subscribe(
              M(
                s,
                (d) => {
                  o && (a = 0), s.next(d);
                },
                void 0,
                (d) => {
                  if (a++ < n) {
                    const p = () => {
                      c ? (c.unsubscribe(), (c = null), l()) : (u = !0);
                    };
                    if (r != null) {
                      const f = typeof r === 'number' ? ci(r) : L(r(d, a)),
                        h = M(
                          s,
                          () => {
                            h.unsubscribe(), p();
                          },
                          () => {
                            s.complete();
                          },
                        );
                      f.subscribe(h);
                    } else p();
                  } else s.error(d);
                },
              ),
            )),
              u && (c.unsubscribe(), (c = null), l());
          };
        l();
      });
}
function th(...e) {
  const t = Ve(e);
  return N((n, r) => {
    (t ? Tr(e, n, t) : Tr(e, n)).subscribe(r);
  });
}
function nh(e, t) {
  return N((n, r) => {
    let o = null,
      i = 0,
      s = !1,
      a = () => s && !o && r.complete();
    n.subscribe(
      M(
        r,
        (c) => {
          o?.unsubscribe();
          let l = 0,
            u = i++;
          L(e(c, u)).subscribe(
            (o = M(
              r,
              (d) => r.next(t ? t(c, d, u, l++) : d),
              () => {
                (o = null), a();
              },
            )),
          );
        },
        () => {
          (s = !0), a();
        },
      ),
    );
  });
}
function rh(e) {
  return N((t, n) => {
    L(e).subscribe(M(n, () => n.complete(), Xt)), !n.closed && t.subscribe(n);
  });
}
function oh(e, t, n) {
  const r = I(e) || t || n ? { next: e, error: t, complete: n } : e;
  return r
    ? N((o, i) => {
        var s;
        (s = r.subscribe) === null || s === void 0 || s.call(r);
        let a = !0;
        o.subscribe(
          M(
            i,
            (c) => {
              var l;
              (l = r.next) === null || l === void 0 || l.call(r, c), i.next(c);
            },
            () => {
              var c;
              (a = !1), (c = r.complete) === null || c === void 0 || c.call(r), i.complete();
            },
            (c) => {
              var l;
              (a = !1), (l = r.error) === null || l === void 0 || l.call(r, c), i.error(c);
            },
            () => {
              var c, l;
              a && ((c = r.unsubscribe) === null || c === void 0 || c.call(r)),
                (l = r.finalize) === null || l === void 0 || l.call(r);
            },
          ),
        );
      })
    : ee;
}
var W = null,
  Mr = !1,
  hi = 1,
  ih = null,
  $ = Symbol('SIGNAL');
function g(e) {
  const t = W;
  return (W = e), t;
}
function Nr() {
  return W;
}
var At = {
  version: 0,
  lastCleanEpoch: 0,
  dirty: !1,
  producers: void 0,
  producersTail: void 0,
  consumers: void 0,
  consumersTail: void 0,
  recomputing: !1,
  consumerAllowSignalWrites: !1,
  consumerIsAlwaysLive: !1,
  kind: 'unknown',
  producerMustRecompute: () => !1,
  producerRecomputeValue: () => {},
  consumerMarkedDirty: () => {},
  consumerOnSignalRead: () => {},
};
function rn(e) {
  if (Mr) throw new Error('');
  if (W === null) return;
  W.consumerOnSignalRead(e);
  const t = W.producersTail;
  if (t !== void 0 && t.producer === e) return;
  let n,
    r = W.recomputing;
  if (r && ((n = t !== void 0 ? t.nextProducer : W.producers), n !== void 0 && n.producer === e)) {
    (W.producersTail = n), (n.lastReadVersion = e.version);
    return;
  }
  const o = e.consumersTail;
  if (o !== void 0 && o.consumer === W && (!r || ah(o, W))) return;
  const i = kt(W),
    s = {
      producer: e,
      consumer: W,
      nextProducer: n,
      prevConsumer: o,
      lastReadVersion: e.version,
      nextConsumer: void 0,
    };
  (W.producersTail = s), t !== void 0 ? (t.nextProducer = s) : (W.producers = s), i && Fc(e, s);
}
function Oc() {
  hi++;
}
function gi(e) {
  if (!(kt(e) && !e.dirty) && !(!e.dirty && e.lastCleanEpoch === hi)) {
    if (!e.producerMustRecompute(e) && !sn(e)) {
      pi(e);
      return;
    }
    e.producerRecomputeValue(e), pi(e);
  }
}
function mi(e) {
  if (e.consumers === void 0) return;
  const t = Mr;
  Mr = !0;
  try {
    for (let n = e.consumers; n !== void 0; n = n.nextConsumer) {
      const r = n.consumer;
      r.dirty || sh(r);
    }
  } finally {
    Mr = t;
  }
}
function yi() {
  return W?.consumerAllowSignalWrites !== !1;
}
function sh(e) {
  (e.dirty = !0), mi(e), e.consumerMarkedDirty?.(e);
}
function pi(e) {
  (e.dirty = !1), (e.lastCleanEpoch = hi);
}
function Rt(e) {
  return e && Pc(e), g(e);
}
function Pc(e) {
  (e.producersTail = void 0), (e.recomputing = !0);
}
function on(e, t) {
  g(t), e && Lc(e);
}
function Lc(e) {
  e.recomputing = !1;
  let t = e.producersTail,
    n = t !== void 0 ? t.nextProducer : e.producers;
  if (n !== void 0) {
    if (kt(e))
      do n = vi(n);
      while (n !== void 0);
    t !== void 0 ? (t.nextProducer = void 0) : (e.producers = void 0);
  }
}
function sn(e) {
  for (let t = e.producers; t !== void 0; t = t.nextProducer) {
    const n = t.producer,
      r = t.lastReadVersion;
    if (r !== n.version || (gi(n), r !== n.version)) return !0;
  }
  return !1;
}
function it(e) {
  if (kt(e)) {
    let t = e.producers;
    for (; t !== void 0; ) t = vi(t);
  }
  (e.producers = void 0), (e.producersTail = void 0), (e.consumers = void 0), (e.consumersTail = void 0);
}
function Fc(e, t) {
  const n = e.consumersTail,
    r = kt(e);
  if (
    (n !== void 0
      ? ((t.nextConsumer = n.nextConsumer), (n.nextConsumer = t))
      : ((t.nextConsumer = void 0), (e.consumers = t)),
    (t.prevConsumer = n),
    (e.consumersTail = t),
    !r)
  )
    for (let o = e.producers; o !== void 0; o = o.nextProducer) Fc(o.producer, o);
}
function vi(e) {
  const t = e.producer,
    n = e.nextProducer,
    r = e.nextConsumer,
    o = e.prevConsumer;
  if (
    ((e.nextConsumer = void 0),
    (e.prevConsumer = void 0),
    r !== void 0 ? (r.prevConsumer = o) : (t.consumersTail = o),
    o !== void 0)
  )
    o.nextConsumer = r;
  else if (((t.consumers = r), !kt(t))) {
    let i = t.producers;
    for (; i !== void 0; ) i = vi(i);
  }
  return n;
}
function kt(e) {
  return e.consumerIsAlwaysLive || e.consumers !== void 0;
}
function Ei(e) {
  ih?.(e);
}
function ah(e, t) {
  const n = t.producersTail;
  if (n !== void 0) {
    let r = t.producers;
    do {
      if (r === e) return !0;
      if (r === n) break;
      r = r.nextProducer;
    } while (r !== void 0);
  }
  return !1;
}
function Ii(e, t) {
  return Object.is(e, t);
}
function an(e, t) {
  const n = Object.create(ch);
  (n.computation = e), t !== void 0 && (n.equal = t);
  const r = () => {
    if ((gi(n), rn(n), n.value === _r)) throw n.error;
    return n.value;
  };
  return (r[$] = n), Ei(n), r;
}
var di = Symbol('UNSET'),
  fi = Symbol('COMPUTING'),
  _r = Symbol('ERRORED'),
  ch = Z(Q({}, At), {
    value: di,
    dirty: !0,
    error: null,
    equal: Ii,
    kind: 'computed',
    producerMustRecompute(e) {
      return e.value === di || e.value === fi;
    },
    producerRecomputeValue(e) {
      if (e.value === fi) throw new Error('');
      const t = e.value;
      e.value = fi;
      let n = Rt(e),
        r,
        o = !1;
      try {
        (r = e.computation()), g(null), (o = t !== di && t !== _r && r !== _r && e.equal(t, r));
      } catch (i) {
        (r = _r), (e.error = i);
      } finally {
        on(e, n);
      }
      if (o) {
        e.value = t;
        return;
      }
      (e.value = r), e.version++;
    },
  });
function lh() {
  throw new Error();
}
var jc = lh;
function Vc(e) {
  jc(e);
}
function Di(e) {
  jc = e;
}
var uh = null;
function Ci(e, t) {
  const n = Object.create(Sr);
  (n.value = e), t !== void 0 && (n.equal = t);
  const r = () => Hc(n);
  return (r[$] = n), Ei(n), [r, (s) => cn(n, s), (s) => Bc(n, s)];
}
function Hc(e) {
  return rn(e), e.value;
}
function cn(e, t) {
  yi() || Vc(e), e.equal(e.value, t) || ((e.value = t), dh(e));
}
function Bc(e, t) {
  yi() || Vc(e), cn(e, t(e.value));
}
var Sr = Z(Q({}, At), { equal: Ii, value: void 0, kind: 'signal' });
function dh(e) {
  e.version++, Oc(), mi(e), uh?.(e);
}
function bi(e) {
  const t = g(null);
  try {
    return e();
  } finally {
    g(t);
  }
}
var Ti = Z(Q({}, At), { consumerIsAlwaysLive: !0, consumerAllowSignalWrites: !0, dirty: !0, kind: 'effect' });
function wi(e) {
  if (((e.dirty = !1), e.version > 0 && !sn(e))) return;
  e.version++;
  const t = Rt(e);
  try {
    e.cleanup(), e.fn();
  } finally {
    on(e, t);
  }
}
var Mi;
function xr() {
  return Mi;
}
function he(e) {
  const t = Mi;
  return (Mi = e), t;
}
var $c = Symbol('NotFound');
function Ot(e) {
  return e === $c || e?.name === '\u0275NotFound';
}
var Fr = 'https://angular.dev/best-practices/security#preventing-cross-site-scripting-xss',
  b = class extends Error {
    code;
    constructor(t, n) {
      super(gn(t, n)), (this.code = t);
    }
  };
function fh(e) {
  return `NG0${Math.abs(e)}`;
}
function gn(e, t) {
  return `${fh(e)}${t ? `: ${t}` : ''}`;
}
var ve = globalThis;
function x(e) {
  for (const t in e) if (e[t] === x) return t;
  throw Error('');
}
function zc(e, t) {
  for (const n in t) Object.hasOwn(t, n) && !Object.hasOwn(e, n) && (e[n] = t[n]);
}
function Se(e) {
  if (typeof e === 'string') return e;
  if (Array.isArray(e)) return `[${e.map(Se).join(', ')}]`;
  if (e == null) return `${e}`;
  const t = e.overriddenName || e.name;
  if (t) return `${t}`;
  const n = e.toString();
  if (n == null) return `${n}`;
  const r = n.indexOf(`
`);
  return r >= 0 ? n.slice(0, r) : n;
}
function jr(e, t) {
  return e ? (t ? `${e} ${t}` : e) : t || '';
}
var ph = x({ __forward_ref__: x });
function Vr(e) {
  return (
    (e.__forward_ref__ = Vr),
    (e.toString = function () {
      return Se(this());
    }),
    e
  );
}
function U(e) {
  return Vi(e) ? e() : e;
}
function Vi(e) {
  return typeof e === 'function' && Object.hasOwn(e, ph) && e.__forward_ref__ === Vr;
}
function z(e) {
  return { token: e.token, providedIn: e.providedIn || null, factory: e.factory, value: void 0 };
}
function Qc(e) {
  return { providers: e.providers || [], imports: e.imports || [] };
}
function mn(e) {
  return gh(e, Hr);
}
function hh(e) {
  return mn(e) !== null;
}
function gh(e, t) {
  return (Object.hasOwn(e, t) && e[t]) || null;
}
function mh(e) {
  const t = e?.[Hr] ?? null;
  return t || null;
}
function Ni(e) {
  return e && Object.hasOwn(e, Rr) ? e[Rr] : null;
}
var Hr = x({ \u0275prov: x }),
  Rr = x({ \u0275inj: x }),
  R = class {
    _desc;
    ngMetadataName = 'InjectionToken';
    \u0275prov;
    constructor(t, n) {
      (this._desc = t),
        (this.\u0275prov = void 0),
        typeof n === 'number'
          ? (this.__NG_ELEMENT_ID__ = n)
          : n !== void 0 &&
            (this.\u0275prov = z({ token: this, providedIn: n.providedIn || 'root', factory: n.factory }));
    }
    get multi() {
      return this;
    }
    toString() {
      return `InjectionToken ${this._desc}`;
    }
  };
function Hi(e) {
  return e && !!e.\u0275providers;
}
var Bi = x({ \u0275cmp: x }),
  $i = x({ \u0275dir: x }),
  Ui = x({ \u0275pipe: x }),
  qi = x({ \u0275mod: x }),
  un = x({ \u0275fac: x }),
  ut = x({ __NG_ELEMENT_ID__: x }),
  Uc = x({ __NG_ENV_ID__: x });
function Wi(e) {
  return Br(e, '@NgModule'), e[qi] || null;
}
function Re(e) {
  return Br(e, '@Component'), e[Bi] || null;
}
function Gi(e) {
  return Br(e, '@Directive'), e[$i] || null;
}
function Zc(e) {
  return Br(e, '@Pipe'), e[Ui] || null;
}
function Br(e, _t) {
  if (e == null) throw new b(-919, !1);
}
function Ee(e) {
  return typeof e === 'string' ? e : e == null ? '' : String(e);
}
var Yc = x({ ngErrorCode: x }),
  yh = x({ ngErrorMessage: x }),
  vh = x({ ngTokenPath: x });
function zi(_e, t) {
  return Kc('', -200, t);
}
function $r(_e, _t) {
  throw new b(-201, !1);
}
function Kc(e, t, n) {
  const r = new b(t, e);
  return (r[Yc] = t), (r[yh] = e), n && (r[vh] = n), r;
}
function Eh(e) {
  return e[Yc];
}
var Si;
function Jc() {
  return Si;
}
function Y(e) {
  const t = Si;
  return (Si = e), t;
}
function Qi(e, t, n) {
  const r = mn(e);
  if (r && r.providedIn === 'root') return r.value === void 0 ? (r.value = r.factory()) : r.value;
  if (n & 8) return null;
  if (t !== void 0) return t;
  $r(e, '');
}
var Ih = {},
  st = Ih,
  Dh = '__NG_DI_FLAG__',
  xi = class {
    injector;
    constructor(t) {
      this.injector = t;
    }
    retrieve(t, n) {
      const r = at(n) || 0;
      try {
        return this.injector.get(t, r & 8 ? null : st, r);
      } catch (o) {
        if (Ot(o)) return o;
        throw o;
      }
    }
  };
function Ch(e, t = 0) {
  const n = xr();
  if (n === void 0) throw new b(-203, !1);
  if (n === null) return Qi(e, void 0, t);
  {
    const r = bh(t),
      o = n.retrieve(e, r);
    if (Ot(o)) {
      if (r.optional) return null;
      throw o;
    }
    return o;
  }
}
function ge(e, t = 0) {
  return (Jc() || Ch)(U(e), t);
}
function D(e, t) {
  return ge(e, at(t));
}
function at(e) {
  return typeof e > 'u' || typeof e === 'number'
    ? e
    : 0 | (e.optional && 8) | (e.host && 1) | (e.self && 2) | (e.skipSelf && 4);
}
function bh(e) {
  return { optional: !!(e & 8), host: !!(e & 1), self: !!(e & 2), skipSelf: !!(e & 4) };
}
function Ai(e) {
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const r = U(e[n]);
    if (Array.isArray(r)) {
      if (r.length === 0) throw new b(900, !1);
      let o,
        i = 0;
      for (let s = 0; s < r.length; s++) {
        const a = r[s],
          c = Th(a);
        typeof c === 'number' ? (c === -1 ? (o = a.token) : (i |= c)) : (o = a);
      }
      t.push(ge(o, i));
    } else t.push(ge(r));
  }
  return t;
}
function Th(e) {
  return e[Dh];
}
function Be(e, _t) {
  const n = Object.hasOwn(e, un);
  return n ? e[un] : null;
}
function Xc(e, t, n) {
  if (e.length !== t.length) return !1;
  for (let r = 0; r < e.length; r++) {
    let o = e[r],
      i = t[r];
    if ((n && ((o = n(o)), (i = n(i))), i !== o)) return !1;
  }
  return !0;
}
function el(e) {
  return e.flat(Number.POSITIVE_INFINITY);
}
function Ur(e, t) {
  e.forEach((n) => (Array.isArray(n) ? Ur(n, t) : t(n)));
}
function Zi(e, t, n) {
  t >= e.length ? e.push(n) : e.splice(t, 0, n);
}
function yn(e, t) {
  return t >= e.length - 1 ? e.pop() : e.splice(t, 1)[0];
}
function tl(e, t) {
  const n = [];
  for (let r = 0; r < e; r++) n.push(t);
  return n;
}
function nl(e, t, n, r) {
  let o = e.length;
  if (o === t) e.push(n, r);
  else if (o === 1) e.push(r, e[0]), (e[0] = n);
  else {
    for (o--, e.push(e[o - 1], e[o]); o > t; ) {
      const i = o - 2;
      (e[o] = e[i]), o--;
    }
    (e[t] = n), (e[t + 1] = r);
  }
}
function qr(e, t, n) {
  let r = Lt(e, t);
  return r >= 0 ? (e[r | 1] = n) : ((r = ~r), nl(e, r, t, n)), r;
}
function Wr(e, t) {
  const n = Lt(e, t);
  if (n >= 0) return e[n | 1];
}
function Lt(e, t) {
  return wh(e, t, 1);
}
function wh(e, t, n) {
  let r = 0,
    o = e.length >> n;
  for (; o !== r; ) {
    const i = r + ((o - r) >> 1),
      s = e[i << n];
    if (t === s) return i << n;
    s > t ? (o = i) : (r = i + 1);
  }
  return ~(o << n);
}
var qe = {},
  G = [],
  Ft = new R(''),
  Yi = new R('', -1),
  Ki = new R(''),
  dn = class {
    get(_t, n = st) {
      if (n === st) {
        const o = Kc('', -201);
        throw ((o.name = '\u0275NotFound'), o);
      }
      return n;
    }
  };
function Gr(e) {
  return { \u0275providers: e };
}
function rl(e) {
  return Gr([{ provide: Ft, multi: !0, useValue: e }]);
}
function ol(...e) {
  return { \u0275providers: Ji(!0, e), \u0275fromNgModule: !0 };
}
function Ji(_e, ...t) {
  let n = [],
    r = new Set(),
    o,
    i = (s) => {
      n.push(s);
    };
  return (
    Ur(t, (s) => {
      const a = s;
      kr(a, i, [], r) && ((o ||= []), o.push(a));
    }),
    o !== void 0 && il(o, i),
    n
  );
}
function il(e, t) {
  for (let n = 0; n < e.length; n++) {
    const { ngModule: r, providers: o } = e[n];
    Xi(o, (i) => {
      t(i, r);
    });
  }
}
function kr(e, t, n, r) {
  if (((e = U(e)), !e)) return !1;
  let o = null,
    i = Ni(e),
    s = !i && Re(e);
  if (!i && !s) {
    const c = e.ngModule;
    if (((i = Ni(c)), i)) o = c;
    else return !1;
  } else {
    if (s && !s.standalone) return !1;
    o = e;
  }
  const a = r.has(o);
  if (s) {
    if (a) return !1;
    if ((r.add(o), s.dependencies)) {
      const c = typeof s.dependencies === 'function' ? s.dependencies() : s.dependencies;
      for (const l of c) kr(l, t, n, r);
    }
  } else if (i) {
    if (i.imports != null && !a) {
      r.add(o);
      let l;
      Ur(i.imports, (u) => {
        kr(u, t, n, r) && ((l ||= []), l.push(u));
      }),
        l !== void 0 && il(l, t);
    }
    if (!a) {
      const l = Be(o) || (() => new o());
      t({ provide: o, useFactory: l, deps: G }, o),
        t({ provide: Ki, useValue: o, multi: !0 }, o),
        t({ provide: Ft, useValue: () => ge(o), multi: !0 }, o);
    }
    const c = i.providers;
    if (c != null && !a) {
      const l = e;
      Xi(c, (u) => {
        t(u, l);
      });
    }
  } else return !1;
  return o !== e && e.providers !== void 0;
}
function Xi(e, t) {
  for (let n of e) Hi(n) && (n = n.\u0275providers), Array.isArray(n) ? Xi(n, t) : t(n);
}
var Mh = x({ provide: String, useValue: x });
function sl(e) {
  return e !== null && typeof e === 'object' && Mh in e;
}
function _h(e) {
  return !!e?.useExisting;
}
function Nh(e) {
  return !!e?.useFactory;
}
function ct(e) {
  return typeof e === 'function';
}
function al(e) {
  return !!e.useClass;
}
var es = new R(''),
  Ar = {},
  qc = {},
  _i;
function vn() {
  return _i === void 0 && (_i = new dn()), _i;
}
var re = class {},
  lt = class extends re {
    parent;
    source;
    scopes;
    records = new Map();
    _ngOnDestroyHooks = new Set();
    _onDestroyHooks = [];
    get destroyed() {
      return this._destroyed;
    }
    _destroyed = !1;
    injectorDefTypes;
    constructor(t, n, r, o) {
      super(),
        (this.parent = n),
        (this.source = r),
        (this.scopes = o),
        ki(t, (s) => this.processProvider(s)),
        this.records.set(Yi, Pt(void 0, this)),
        o.has('environment') && this.records.set(re, Pt(void 0, this));
      const i = this.records.get(es);
      i != null && typeof i.value === 'string' && this.scopes.add(i.value),
        (this.injectorDefTypes = new Set(this.get(Ki, G, { self: !0 })));
    }
    retrieve(t, n) {
      const r = at(n) || 0;
      try {
        return this.get(t, st, r);
      } catch (o) {
        if (Ot(o)) return o;
        throw o;
      }
    }
    destroy() {
      ln(this), (this._destroyed = !0);
      const t = g(null);
      try {
        for (const r of this._ngOnDestroyHooks) r.ngOnDestroy();
        const n = this._onDestroyHooks;
        this._onDestroyHooks = [];
        for (const r of n) r();
      } finally {
        this.records.clear(), this._ngOnDestroyHooks.clear(), this.injectorDefTypes.clear(), g(t);
      }
    }
    onDestroy(t) {
      return ln(this), this._onDestroyHooks.push(t), () => this.removeOnDestroy(t);
    }
    runInContext(t) {
      ln(this);
      let n = he(this),
        r = Y(void 0),
        _o;
      try {
        return t();
      } finally {
        he(n), Y(r);
      }
    }
    get(t, n = st, r) {
      if ((ln(this), Object.hasOwn(t, Uc))) return t[Uc](this);
      let o = at(r),
        _i,
        s = he(this),
        a = Y(void 0);
      try {
        if (!(o & 4)) {
          let l = this.records.get(t);
          if (l === void 0) {
            const u = kh(t) && mn(t);
            u && this.injectableDefInScope(u) ? (l = Pt(Ri(t), Ar)) : (l = null), this.records.set(t, l);
          }
          if (l != null) return this.hydrate(t, l, o);
        }
        const c = o & 2 ? vn() : this.parent;
        return (n = o & 8 && n === st ? null : n), c.get(t, n);
      } catch (c) {
        const l = Eh(c);
        throw l === -200 || l === -201 ? new b(l, null) : c;
      } finally {
        Y(a), he(s);
      }
    }
    resolveInjectorInitializers() {
      let t = g(null),
        n = he(this),
        r = Y(void 0),
        _o;
      try {
        const i = this.get(Ft, G, { self: !0 });
        for (const s of i) s();
      } finally {
        he(n), Y(r), g(t);
      }
    }
    toString() {
      const t = [],
        n = this.records;
      for (const r of n.keys()) t.push(Se(r));
      return `R3Injector[${t.join(', ')}]`;
    }
    processProvider(t) {
      t = U(t);
      let n = ct(t) ? t : U(t?.provide),
        r = xh(t);
      if (!ct(t) && t.multi === !0) {
        let o = this.records.get(n);
        o || ((o = Pt(void 0, Ar, !0)), (o.factory = () => Ai(o.multi)), this.records.set(n, o)),
          (n = t),
          o.multi.push(t);
      }
      this.records.set(n, r);
    }
    hydrate(t, n, r) {
      const o = g(null);
      try {
        if (n.value === qc) throw zi(Se(t));
        return (
          n.value === Ar && ((n.value = qc), (n.value = n.factory(void 0, r))),
          typeof n.value === 'object' && n.value && Rh(n.value) && this._ngOnDestroyHooks.add(n.value),
          n.value
        );
      } finally {
        g(o);
      }
    }
    injectableDefInScope(t) {
      if (!t.providedIn) return !1;
      const n = U(t.providedIn);
      return typeof n === 'string' ? n === 'any' || this.scopes.has(n) : this.injectorDefTypes.has(n);
    }
    removeOnDestroy(t) {
      const n = this._onDestroyHooks.indexOf(t);
      n !== -1 && this._onDestroyHooks.splice(n, 1);
    }
  };
function Ri(e) {
  const t = mn(e),
    n = t !== null ? t.factory : Be(e);
  if (n !== null) return n;
  if (e instanceof R) throw new b(204, !1);
  if (e instanceof Function) return Sh(e);
  throw new b(204, !1);
}
function Sh(e) {
  if (e.length > 0) throw new b(204, !1);
  const n = mh(e);
  return n !== null ? () => n.factory(e) : () => new e();
}
function xh(e) {
  if (sl(e)) return Pt(void 0, e.useValue);
  {
    const t = ts(e);
    return Pt(t, Ar);
  }
}
function ts(e, _t, _n) {
  let r;
  if (ct(e)) {
    const o = U(e);
    return Be(o) || Ri(o);
  } else if (sl(e)) r = () => U(e.useValue);
  else if (Nh(e)) r = () => e.useFactory(...Ai(e.deps || []));
  else if (_h(e)) r = (_o, i) => ge(U(e.useExisting), i !== void 0 && i & 8 ? 8 : void 0);
  else {
    const o = U(e && (e.useClass || e.provide));
    if (Ah(e)) r = () => new o(...Ai(e.deps));
    else return Be(o) || Ri(o);
  }
  return r;
}
function ln(e) {
  if (e.destroyed) throw new b(205, !1);
}
function Pt(e, t, n = !1) {
  return { factory: e, value: t, multi: n ? [] : void 0 };
}
function Ah(e) {
  return !!e.deps;
}
function Rh(e) {
  return e !== null && typeof e === 'object' && typeof e.ngOnDestroy === 'function';
}
function kh(e) {
  return typeof e === 'function' || (typeof e === 'object' && e.ngMetadataName === 'InjectionToken');
}
function ki(e, t) {
  for (const n of e) Array.isArray(n) ? ki(n, t) : n && Hi(n) ? ki(n.\u0275providers, t) : t(n);
}
function zr(e, t) {
  let n;
  e instanceof lt ? (ln(e), (n = e)) : (n = new xi(e));
  let _r,
    o = he(n),
    i = Y(void 0);
  try {
    return t();
  } finally {
    he(o), Y(i);
  }
}
function cl() {
  return Jc() !== void 0 || xr() != null;
}
var ce = 0,
  y = 1,
  E = 2,
  V = 3,
  oe = 4,
  K = 5,
  dt = 6,
  jt = 7,
  j = 8,
  ke = 9,
  Ie = 10,
  k = 11,
  Vt = 12,
  ns = 13,
  ft = 14,
  J = 15,
  We = 16,
  pt = 17,
  De = 18,
  Oe = 19,
  rs = 20,
  Ne = 21,
  Qr = 22,
  $e = 23,
  te = 24,
  ht = 25,
  gt = 26,
  O = 27,
  ll = 1,
  os = 6,
  Ge = 7,
  En = 8,
  mt = 9,
  F = 10;
function Ce(e) {
  return Array.isArray(e) && typeof e[ll] === 'object';
}
function le(e) {
  return Array.isArray(e) && e[ll] === !0;
}
function is(e) {
  return (e.flags & 4) !== 0;
}
function ze(e) {
  return e.componentOffset > -1;
}
function Zr(e) {
  return (e.flags & 1) === 1;
}
function be(e) {
  return !!e.template;
}
function Ht(e) {
  return (e[E] & 512) !== 0;
}
function yt(e) {
  return (e[E] & 256) === 256;
}
var ss = 'svg',
  ul = 'math';
function ie(e) {
  for (; Array.isArray(e); ) e = e[ce];
  return e;
}
function as(e, t) {
  return ie(t[e]);
}
function ue(e, t) {
  return ie(t[e.index]);
}
function In(e, t) {
  return e.data[t];
}
function Dn(e, t) {
  return e[t];
}
function cs(e, t, n, r) {
  n >= e.data.length && ((e.data[n] = null), (e.blueprint[n] = null)), (t[n] = r);
}
function se(e, t) {
  const n = t[e];
  return Ce(n) ? n : n[ce];
}
function dl(e) {
  return (e[E] & 4) === 4;
}
function Yr(e) {
  return (e[E] & 128) === 128;
}
function fl(e) {
  return le(e[V]);
}
function Te(e, t) {
  return t == null ? null : e[t];
}
function ls(e) {
  e[pt] = 0;
}
function us(e) {
  e[E] & 1024 || ((e[E] |= 1024), Yr(e) && vt(e));
}
function pl(e, t) {
  for (; e > 0; ) (t = t[ft]), e--;
  return t;
}
function Cn(e) {
  return !!(e[E] & 9216 || e[te]?.dirty);
}
function Kr(e) {
  e[Ie].changeDetectionScheduler?.notify(8), e[E] & 64 && (e[E] |= 1024), Cn(e) && vt(e);
}
function vt(e) {
  e[Ie].changeDetectionScheduler?.notify(0);
  let t = Ue(e);
  for (; t !== null && !(t[E] & 8192 || ((t[E] |= 8192), !Yr(t))); ) t = Ue(t);
}
function ds(e, t) {
  if (yt(e)) throw new b(911, !1);
  e[Ne] === null && (e[Ne] = []), e[Ne].push(t);
}
function hl(e, t) {
  if (e[Ne] === null) return;
  const n = e[Ne].indexOf(t);
  n !== -1 && e[Ne].splice(n, 1);
}
function Ue(e) {
  const t = e[V];
  return le(t) ? t[V] : t;
}
function fs(e) {
  return (e[jt] ??= []);
}
function ps(e) {
  return (e.cleanup ??= []);
}
function gl(e, t, n, r) {
  const o = fs(t);
  o.push(n), e.firstCreatePass && ps(e).push(r, o.length - 1);
}
var C = { lFrame: Sl(null), bindingsEnabled: !0, skipHydrationRootTNode: null };
var Oi = !1;
function ml() {
  return C.lFrame.elementDepthCount;
}
function yl() {
  C.lFrame.elementDepthCount++;
}
function hs() {
  C.lFrame.elementDepthCount--;
}
function vl() {
  return C.bindingsEnabled;
}
function gs() {
  return C.skipHydrationRootTNode !== null;
}
function ms(e) {
  return C.skipHydrationRootTNode === e;
}
function ys() {
  C.skipHydrationRootTNode = null;
}
function m() {
  return C.lFrame.lView;
}
function P() {
  return C.lFrame.tView;
}
function El(e) {
  return (C.lFrame.contextLView = e), e[j];
}
function Il(e) {
  return (C.lFrame.contextLView = null), e;
}
function H() {
  let e = vs();
  for (; e !== null && e.type === 64; ) e = e.parent;
  return e;
}
function vs() {
  return C.lFrame.currentTNode;
}
function Dl() {
  const e = C.lFrame,
    t = e.currentTNode;
  return e.isParent ? t : t.parent;
}
function Bt(e, t) {
  const n = C.lFrame;
  (n.currentTNode = e), (n.isParent = t);
}
function Es() {
  return C.lFrame.isParent;
}
function Is() {
  C.lFrame.isParent = !1;
}
function Cl() {
  return C.lFrame.contextLView;
}
function Ds() {
  return Oi;
}
function fn(e) {
  const t = Oi;
  return (Oi = e), t;
}
function $t() {
  let e = C.lFrame,
    t = e.bindingRootIndex;
  return t === -1 && (t = e.bindingRootIndex = e.tView.bindingStartIndex), t;
}
function Cs() {
  return C.lFrame.bindingIndex;
}
function bl(e) {
  return (C.lFrame.bindingIndex = e);
}
function Qe() {
  return C.lFrame.bindingIndex++;
}
function bn(e) {
  const t = C.lFrame,
    n = t.bindingIndex;
  return (t.bindingIndex = t.bindingIndex + e), n;
}
function Tl() {
  return C.lFrame.inI18n;
}
function wl(e, t) {
  const n = C.lFrame;
  (n.bindingIndex = n.bindingRootIndex = e), Jr(t);
}
function Ml() {
  return C.lFrame.currentDirectiveIndex;
}
function Jr(e) {
  C.lFrame.currentDirectiveIndex = e;
}
function _l(e) {
  const t = C.lFrame.currentDirectiveIndex;
  return t === -1 ? null : e[t];
}
function Xr() {
  return C.lFrame.currentQueryIndex;
}
function Tn(e) {
  C.lFrame.currentQueryIndex = e;
}
function Oh(e) {
  const t = e[y];
  return t.type === 2 ? t.declTNode : t.type === 1 ? e[K] : null;
}
function bs(e, t, n) {
  if (n & 4) {
    let o = t,
      i = e;
    for (; (o = o.parent), o === null && !(n & 1); ) if (((o = Oh(i)), o === null || ((i = i[ft]), o.type & 10))) break;
    if (o === null) return !1;
    (t = o), (e = i);
  }
  const r = (C.lFrame = Nl());
  return (r.currentTNode = t), (r.lView = e), !0;
}
function eo(e) {
  const t = Nl(),
    n = e[y];
  (C.lFrame = t),
    (t.currentTNode = n.firstChild),
    (t.lView = e),
    (t.tView = n),
    (t.contextLView = e),
    (t.bindingIndex = n.bindingStartIndex),
    (t.inI18n = !1);
}
function Nl() {
  const e = C.lFrame,
    t = e === null ? null : e.child;
  return t === null ? Sl(e) : t;
}
function Sl(e) {
  const t = {
    currentTNode: null,
    isParent: !0,
    lView: null,
    tView: null,
    selectedIndex: -1,
    contextLView: null,
    elementDepthCount: 0,
    currentNamespace: null,
    currentDirectiveIndex: -1,
    bindingRootIndex: -1,
    bindingIndex: -1,
    currentQueryIndex: 0,
    parent: e,
    child: null,
    inI18n: !1,
  };
  return e !== null && (e.child = t), t;
}
function xl() {
  const e = C.lFrame;
  return (C.lFrame = e.parent), (e.currentTNode = null), (e.lView = null), e;
}
var Ts = xl;
function to() {
  const e = xl();
  (e.isParent = !0),
    (e.tView = null),
    (e.selectedIndex = -1),
    (e.contextLView = null),
    (e.elementDepthCount = 0),
    (e.currentDirectiveIndex = -1),
    (e.currentNamespace = null),
    (e.bindingRootIndex = -1),
    (e.bindingIndex = -1),
    (e.currentQueryIndex = 0);
}
function Al(e) {
  return (C.lFrame.contextLView = pl(e, C.lFrame.contextLView))[j];
}
function de() {
  return C.lFrame.selectedIndex;
}
function Ze(e) {
  C.lFrame.selectedIndex = e;
}
function wn() {
  const e = C.lFrame;
  return In(e.tView, e.selectedIndex);
}
function Rl() {
  C.lFrame.currentNamespace = ss;
}
function kl() {
  Ph();
}
function Ph() {
  C.lFrame.currentNamespace = null;
}
function Ol() {
  return C.lFrame.currentNamespace;
}
var Pl = !0;
function no() {
  return Pl;
}
function ro(e) {
  Pl = e;
}
function Pi(e, t = null, n = null, r) {
  const o = ws(e, t, n, r);
  return o.resolveInjectorInitializers(), o;
}
function ws(e, t = null, n = null, r, o = new Set()) {
  const i = [n || G, ol(e)];
  return (r = r || (typeof e === 'object' ? void 0 : Se(e))), new lt(i, t || vn(), r || null, o);
}
var me = class e {
    static THROW_IF_NOT_FOUND = st;
    static NULL = new dn();
    static create(t, n) {
      if (Array.isArray(t)) return Pi({ name: '' }, n, t, '');
      {
        const r = t.name ?? '';
        return Pi({ name: r }, t.parent, t.providers, r);
      }
    }
    static \u0275prov = z({ token: e, providedIn: 'any', factory: () => ge(Yi) });
    static __NG_ELEMENT_ID__ = -1;
  },
  oo = new R(''),
  Pe = (() => {
    class e {
      static __NG_ELEMENT_ID__ = Lh;
      static __NG_ENV_ID__ = (n) => n;
    }
    return e;
  })(),
  Or = class extends Pe {
    _lView;
    constructor(t) {
      super(), (this._lView = t);
    }
    get destroyed() {
      return yt(this._lView);
    }
    onDestroy(t) {
      const n = this._lView;
      return ds(n, t), () => hl(n, t);
    }
  };
function Lh() {
  return new Or(m());
}
var Ll = !1,
  Fl = new R(''),
  Et = (() => {
    class e {
      taskId = 0;
      pendingTasks = new Set();
      destroyed = !1;
      pendingTask = new en(!1);
      debugTaskTracker = D(Fl, { optional: !0 });
      get hasPendingTasks() {
        return this.destroyed ? !1 : this.pendingTask.value;
      }
      get hasPendingTasksObservable() {
        return this.destroyed
          ? new w((n) => {
              n.next(!1), n.complete();
            })
          : this.pendingTask;
      }
      add() {
        !this.hasPendingTasks && !this.destroyed && this.pendingTask.next(!0);
        const n = this.taskId++;
        return this.pendingTasks.add(n), this.debugTaskTracker?.add(n), n;
      }
      has(n) {
        return this.pendingTasks.has(n);
      }
      remove(n) {
        this.pendingTasks.delete(n),
          this.debugTaskTracker?.remove(n),
          this.pendingTasks.size === 0 && this.hasPendingTasks && this.pendingTask.next(!1);
      }
      ngOnDestroy() {
        this.pendingTasks.clear(),
          this.hasPendingTasks && this.pendingTask.next(!1),
          (this.destroyed = !0),
          this.pendingTask.unsubscribe();
      }
      static \u0275prov = z({ token: e, providedIn: 'root', factory: () => new e() });
    }
    return e;
  })(),
  Li = class extends Me {
    __isAsync;
    destroyRef = void 0;
    pendingTasks = void 0;
    constructor(t = !1) {
      super(),
        (this.__isAsync = t),
        cl() &&
          ((this.destroyRef = D(Pe, { optional: !0 }) ?? void 0),
          (this.pendingTasks = D(Et, { optional: !0 }) ?? void 0));
    }
    emit(t) {
      const n = g(null);
      try {
        super.next(t);
      } finally {
        g(n);
      }
    }
    subscribe(t, n, r) {
      let o = t,
        i = n || (() => null),
        s = r;
      if (t && typeof t === 'object') {
        const c = t;
        (o = c.next?.bind(c)), (i = c.error?.bind(c)), (s = c.complete?.bind(c));
      }
      this.__isAsync &&
        ((i = this.wrapInTimeout(i)), o && (o = this.wrapInTimeout(o)), s && (s = this.wrapInTimeout(s)));
      const a = super.subscribe({ next: o, error: i, complete: s });
      return t instanceof B && t.add(a), a;
    }
    wrapInTimeout(t) {
      return (n) => {
        const r = this.pendingTasks?.add();
        setTimeout(() => {
          try {
            t(n);
          } finally {
            r !== void 0 && this.pendingTasks?.remove(r);
          }
        });
      };
    }
  },
  _e = Li;
function Pr(..._e) {}
function Ms(e) {
  let t, n;
  function r() {
    e = Pr;
    try {
      n !== void 0 && typeof cancelAnimationFrame === 'function' && cancelAnimationFrame(n),
        t !== void 0 && clearTimeout(t);
    } catch {}
  }
  return (
    (t = setTimeout(() => {
      e(), r();
    })),
    typeof requestAnimationFrame === 'function' &&
      (n = requestAnimationFrame(() => {
        e(), r();
      })),
    () => r()
  );
}
function jl(e) {
  return (
    queueMicrotask(() => e()),
    () => {
      e = Pr;
    }
  );
}
var _s = 'isAngularZone',
  pn = `${_s}_ID`,
  Fh = 0,
  ye = class e {
    hasPendingMacrotasks = !1;
    hasPendingMicrotasks = !1;
    isStable = !0;
    onUnstable = new _e(!1);
    onMicrotaskEmpty = new _e(!1);
    onStable = new _e(!1);
    onError = new _e(!1);
    constructor(t) {
      const {
        enableLongStackTrace: n = !1,
        shouldCoalesceEventChangeDetection: r = !1,
        shouldCoalesceRunChangeDetection: o = !1,
        scheduleInRootZone: i = Ll,
      } = t;
      if (typeof Zone > 'u') throw new b(908, !1);
      Zone.assertZonePatched();

      (this._nesting = 0),
        (this._outer = this._inner = Zone.current),
        Zone.TaskTrackingZoneSpec && (this._inner = this._inner.fork(new Zone.TaskTrackingZoneSpec())),
        n && Zone.longStackTraceZoneSpec && (this._inner = this._inner.fork(Zone.longStackTraceZoneSpec)),
        (this.shouldCoalesceEventChangeDetection = !o && r),
        (this.shouldCoalesceRunChangeDetection = o),
        (this.callbackScheduled = !1),
        (this.scheduleInRootZone = i),
        Hh(this);
    }
    static isInAngularZone() {
      return typeof Zone < 'u' && Zone.current.get(_s) === !0;
    }
    static assertInAngularZone() {
      if (!e.isInAngularZone()) throw new b(909, !1);
    }
    static assertNotInAngularZone() {
      if (e.isInAngularZone()) throw new b(909, !1);
    }
    run(t, n, r) {
      return this._inner.run(t, n, r);
    }
    runTask(t, n, r, o) {
      const i = this._inner,
        s = i.scheduleEventTask(`NgZoneEvent: ${o}`, t, jh, Pr, Pr);
      try {
        return i.runTask(s, n, r);
      } finally {
        i.cancelTask(s);
      }
    }
    runGuarded(t, n, r) {
      return this._inner.runGuarded(t, n, r);
    }
    runOutsideAngular(t) {
      return this._outer.run(t);
    }
  },
  jh = {};
function Ns(e) {
  if (e._nesting === 0 && !e.hasPendingMicrotasks && !e.isStable)
    try {
      e._nesting++, e.onMicrotaskEmpty.emit(null);
    } finally {
      if ((e._nesting--, !e.hasPendingMicrotasks))
        try {
          e.runOutsideAngular(() => e.onStable.emit(null));
        } finally {
          e.isStable = !0;
        }
    }
}
function Vh(e) {
  if (e.isCheckStableRunning || e.callbackScheduled) return;
  e.callbackScheduled = !0;
  function t() {
    Ms(() => {
      (e.callbackScheduled = !1), Fi(e), (e.isCheckStableRunning = !0), Ns(e), (e.isCheckStableRunning = !1);
    });
  }
  e.scheduleInRootZone
    ? Zone.root.run(() => {
        t();
      })
    : e._outer.run(() => {
        t();
      }),
    Fi(e);
}
function Hh(e) {
  const t = () => {
      Vh(e);
    },
    n = Fh++;
  e._inner = e._inner.fork({
    name: 'angular',
    properties: { [_s]: !0, [pn]: n, [pn + n]: !0 },
    onInvokeTask: (r, _o, i, s, a, c) => {
      if (Bh(c)) return r.invokeTask(i, s, a, c);
      try {
        return Wc(e), r.invokeTask(i, s, a, c);
      } finally {
        ((e.shouldCoalesceEventChangeDetection && s.type === 'eventTask') || e.shouldCoalesceRunChangeDetection) && t(),
          Gc(e);
      }
    },
    onInvoke: (r, _o, i, s, a, c, l) => {
      try {
        return Wc(e), r.invoke(i, s, a, c, l);
      } finally {
        e.shouldCoalesceRunChangeDetection && !e.callbackScheduled && !$h(c) && t(), Gc(e);
      }
    },
    onHasTask: (r, o, i, s) => {
      r.hasTask(i, s),
        o === i &&
          (s.change === 'microTask'
            ? ((e._hasPendingMicrotasks = s.microTask), Fi(e), Ns(e))
            : s.change === 'macroTask' && (e.hasPendingMacrotasks = s.macroTask));
    },
    onHandleError: (r, _o, i, s) => (r.handleError(i, s), e.runOutsideAngular(() => e.onError.emit(s)), !1),
  });
}
function Fi(e) {
  e._hasPendingMicrotasks ||
  ((e.shouldCoalesceEventChangeDetection || e.shouldCoalesceRunChangeDetection) && e.callbackScheduled === !0)
    ? (e.hasPendingMicrotasks = !0)
    : (e.hasPendingMicrotasks = !1);
}
function Wc(e) {
  e._nesting++, e.isStable && ((e.isStable = !1), e.onUnstable.emit(null));
}
function Gc(e) {
  e._nesting--, Ns(e);
}
var hn = class {
  hasPendingMicrotasks = !1;
  hasPendingMacrotasks = !1;
  isStable = !0;
  onUnstable = new _e();
  onMicrotaskEmpty = new _e();
  onStable = new _e();
  onError = new _e();
  run(t, n, r) {
    return t.apply(n, r);
  }
  runGuarded(t, n, r) {
    return t.apply(n, r);
  }
  runOutsideAngular(t) {
    return t();
  }
  runTask(t, n, r, _o) {
    return t.apply(n, r);
  }
};
function Bh(e) {
  return Vl(e, '__ignore_ng_zone__');
}
function $h(e) {
  return Vl(e, '__scheduler_tick__');
}
function Vl(e, t) {
  return !Array.isArray(e) || e.length !== 1 ? !1 : e[0]?.data?.[t] === !0;
}
var xe = class {
    _console = console;
    handleError(t) {
      this._console.error('ERROR', t);
    }
  },
  Ye = new R('', {
    factory: () => {
      let e = D(ye),
        t = D(re),
        n;
      return (r) => {
        e.runOutsideAngular(() => {
          t.destroyed && !n
            ? setTimeout(() => {
                throw r;
              })
            : ((n ??= t.get(xe)), n.handleError(r));
        });
      };
    },
  }),
  Hl = {
    provide: Ft,
    useValue: () => {
      const _e = D(xe, { optional: !0 });
    },
    multi: !0,
  },
  Uh = new R('', {
    factory: () => {
      const e = D(oo).defaultView;
      if (!e) return;
      const t = D(Ye),
        n = (i) => {
          t(i.reason), i.preventDefault();
        },
        r = (i) => {
          i.error ? t(i.error) : t(new Error(i.message, { cause: i })), i.preventDefault();
        },
        o = () => {
          e.addEventListener('unhandledrejection', n), e.addEventListener('error', r);
        };
      typeof Zone < 'u' ? Zone.root.run(o) : o(),
        D(Pe).onDestroy(() => {
          e.removeEventListener('error', r), e.removeEventListener('unhandledrejection', n);
        });
    },
  });
function qh() {
  return Gr([
    rl(() => {
      D(Uh);
    }),
  ]);
}
function io(e, t) {
  const [n, r, o] = Ci(e, t?.equal),
    i = n,
    _s = i[$];
  return (i.set = r), (i.update = o), (i.asReadonly = Ss.bind(i)), i;
}
function Ss() {
  const e = this[$];
  if (e.readonlyFn === void 0) {
    const t = () => this();
    (t[$] = e), (e.readonlyFn = t);
  }
  return e.readonlyFn;
}
var Mn = (() => {
  class e {
    view;
    node;
    constructor(n, r) {
      (this.view = n), (this.node = r);
    }
    static __NG_ELEMENT_ID__ = Wh;
  }
  return e;
})();
function Wh() {
  return new Mn(m(), H());
}
var Ae = class {},
  _n = new R('', { factory: () => !0 });
var xs = new R(''),
  As = (() => {
    class e {
      internalPendingTasks = D(Et);
      scheduler = D(Ae);
      errorHandler = D(Ye);
      add() {
        const n = this.internalPendingTasks.add();
        return () => {
          this.internalPendingTasks.has(n) && (this.scheduler.notify(11), this.internalPendingTasks.remove(n));
        };
      }
      run(n) {
        const r = this.add();
        n().catch(this.errorHandler).finally(r);
      }
      static \u0275prov = z({ token: e, providedIn: 'root', factory: () => new e() });
    }
    return e;
  })(),
  so = (() => {
    class e {
      static \u0275prov = z({ token: e, providedIn: 'root', factory: () => new ji() });
    }
    return e;
  })(),
  ji = class {
    dirtyEffectCount = 0;
    queues = new Map();
    add(t) {
      this.enqueue(t), this.schedule(t);
    }
    schedule(t) {
      t.dirty && this.dirtyEffectCount++;
    }
    remove(t) {
      const n = t.zone,
        r = this.queues.get(n);
      r.has(t) && (r.delete(t), t.dirty && this.dirtyEffectCount--);
    }
    enqueue(t) {
      const n = t.zone;
      this.queues.has(n) || this.queues.set(n, new Set());
      const r = this.queues.get(n);
      r.has(t) || r.add(t);
    }
    flush() {
      for (; this.dirtyEffectCount > 0; ) {
        let t = !1;
        for (const [n, r] of this.queues)
          n === null ? (t ||= this.flushQueue(r)) : (t ||= n.run(() => this.flushQueue(r)));
        t || (this.dirtyEffectCount = 0);
      }
    }
    flushQueue(t) {
      let n = !1;
      for (const r of t) r.dirty && (this.dirtyEffectCount--, (n = !0), r.run());
      return n;
    }
  },
  Lr = class {
    [$];
    constructor(t) {
      this[$] = t;
    }
    destroy() {
      this[$].destroy();
    }
  };
function Bl(e, t) {
  let n = t?.injector ?? D(me),
    r = t?.manualCleanup !== !0 ? n.get(Pe) : null,
    o,
    i = n.get(Mn, null, { optional: !0 }),
    s = n.get(Ae);
  return (
    i !== null
      ? ((o = Qh(i.view, s, e)), r instanceof Or && r._lView === i.view && (r = null))
      : (o = Zh(e, n.get(so), s)),
    (o.injector = n),
    r !== null && (o.onDestroyFns = [r.onDestroy(() => o.destroy())]),
    new Lr(o)
  );
}
var $l = Z(Q({}, Ti), {
    cleanupFns: void 0,
    zone: null,
    onDestroyFns: null,
    run() {
      const e = fn(!1);
      try {
        wi(this);
      } finally {
        fn(e);
      }
    },
    cleanup() {
      if (!this.cleanupFns?.length) return;
      const e = g(null);
      try {
        for (; this.cleanupFns.length; ) this.cleanupFns.pop()();
      } finally {
        (this.cleanupFns = []), g(e);
      }
    },
  }),
  Gh = Z(Q({}, $l), {
    consumerMarkedDirty() {
      this.scheduler.schedule(this), this.notifier.notify(12);
    },
    destroy() {
      if ((it(this), this.onDestroyFns !== null)) for (const e of this.onDestroyFns) e();
      this.cleanup(), this.scheduler.remove(this);
    },
  }),
  zh = Z(Q({}, $l), {
    consumerMarkedDirty() {
      (this.view[E] |= 8192), vt(this.view), this.notifier.notify(13);
    },
    destroy() {
      if ((it(this), this.onDestroyFns !== null)) for (const e of this.onDestroyFns) e();
      this.cleanup(), this.view[$e]?.delete(this);
    },
  });
function Qh(e, t, n) {
  const r = Object.create(zh);
  return (
    (r.view = e),
    (r.zone = typeof Zone < 'u' ? Zone.current : null),
    (r.notifier = t),
    (r.fn = Ul(r, n)),
    (e[$e] ??= new Set()),
    e[$e].add(r),
    r.consumerMarkedDirty(r),
    r
  );
}
function Zh(e, t, n) {
  const r = Object.create(Gh);
  return (
    (r.fn = Ul(r, e)),
    (r.scheduler = t),
    (r.notifier = n),
    (r.zone = typeof Zone < 'u' ? Zone.current : null),
    r.scheduler.add(r),
    r.notifier.notify(12),
    r
  );
}
function Ul(e, t) {
  return () => {
    t((n) => (e.cleanupFns ??= []).push(n));
  };
}
function Rs(e) {
  return bi(e);
}
function Hn(e) {
  return { toString: e }.toString();
}
function ng(e) {
  return typeof e === 'function';
}
function Cu(e, t, n, r) {
  t !== null ? t.applyValueToInputSignal(t, r) : (e[n] = r);
}
var yo = class {
    previousValue;
    currentValue;
    firstChange;
    constructor(t, n, r) {
      (this.previousValue = t), (this.currentValue = n), (this.firstChange = r);
    }
    isFirstChange() {
      return this.firstChange;
    }
  },
  rg = (() => {
    const e = () => bu;
    return (e.ngInherit = !0), e;
  })();
function bu(e) {
  return e.type.prototype.ngOnChanges && (e.setInput = ig), og;
}
function og() {
  const e = wu(this),
    t = e?.current;
  if (t) {
    const n = e.previous;
    if (n === qe) e.previous = t;
    else for (const r in t) n[r] = t[r];
    (e.current = null), this.ngOnChanges(t);
  }
}
function ig(e, t, n, r, o) {
  const i = this.declaredInputs[r],
    s = wu(e) || sg(e, { previous: qe, current: null }),
    a = s.current || (s.current = {}),
    c = s.previous,
    l = c[i];
  (a[i] = new yo(l?.currentValue, n, c === qe)), Cu(e, t, o, n);
}
var Tu = '__ngSimpleChanges__';
function wu(e) {
  return e[Tu] || null;
}
function sg(e, t) {
  return (e[Tu] = t);
}
var ql = [];
var A = (e, t = null, n) => {
    for (let r = 0; r < ql.length; r++) {
      const o = ql[r];
      o(e, t, n);
    }
  },
  _ = ((e) => (
    (e[(e.TemplateCreateStart = 0)] = 'TemplateCreateStart'),
    (e[(e.TemplateCreateEnd = 1)] = 'TemplateCreateEnd'),
    (e[(e.TemplateUpdateStart = 2)] = 'TemplateUpdateStart'),
    (e[(e.TemplateUpdateEnd = 3)] = 'TemplateUpdateEnd'),
    (e[(e.LifecycleHookStart = 4)] = 'LifecycleHookStart'),
    (e[(e.LifecycleHookEnd = 5)] = 'LifecycleHookEnd'),
    (e[(e.OutputStart = 6)] = 'OutputStart'),
    (e[(e.OutputEnd = 7)] = 'OutputEnd'),
    (e[(e.BootstrapApplicationStart = 8)] = 'BootstrapApplicationStart'),
    (e[(e.BootstrapApplicationEnd = 9)] = 'BootstrapApplicationEnd'),
    (e[(e.BootstrapComponentStart = 10)] = 'BootstrapComponentStart'),
    (e[(e.BootstrapComponentEnd = 11)] = 'BootstrapComponentEnd'),
    (e[(e.ChangeDetectionStart = 12)] = 'ChangeDetectionStart'),
    (e[(e.ChangeDetectionEnd = 13)] = 'ChangeDetectionEnd'),
    (e[(e.ChangeDetectionSyncStart = 14)] = 'ChangeDetectionSyncStart'),
    (e[(e.ChangeDetectionSyncEnd = 15)] = 'ChangeDetectionSyncEnd'),
    (e[(e.AfterRenderHooksStart = 16)] = 'AfterRenderHooksStart'),
    (e[(e.AfterRenderHooksEnd = 17)] = 'AfterRenderHooksEnd'),
    (e[(e.ComponentStart = 18)] = 'ComponentStart'),
    (e[(e.ComponentEnd = 19)] = 'ComponentEnd'),
    (e[(e.DeferBlockStateStart = 20)] = 'DeferBlockStateStart'),
    (e[(e.DeferBlockStateEnd = 21)] = 'DeferBlockStateEnd'),
    (e[(e.DynamicComponentStart = 22)] = 'DynamicComponentStart'),
    (e[(e.DynamicComponentEnd = 23)] = 'DynamicComponentEnd'),
    (e[(e.HostBindingsUpdateStart = 24)] = 'HostBindingsUpdateStart'),
    (e[(e.HostBindingsUpdateEnd = 25)] = 'HostBindingsUpdateEnd'),
    e
  ))(_ || {});
function ag(e, t, n) {
  const { ngOnChanges: r, ngOnInit: o, ngDoCheck: i } = t.type.prototype;
  if (r) {
    const s = bu(t);
    (n.preOrderHooks ??= []).push(e, s), (n.preOrderCheckHooks ??= []).push(e, s);
  }
  o && (n.preOrderHooks ??= []).push(0 - e, o),
    i && ((n.preOrderHooks ??= []).push(e, i), (n.preOrderCheckHooks ??= []).push(e, i));
}
function cg(e, t) {
  for (let n = t.directiveStart, r = t.directiveEnd; n < r; n++) {
    const i = e.data[n].type.prototype,
      {
        ngAfterContentInit: s,
        ngAfterContentChecked: a,
        ngAfterViewInit: c,
        ngAfterViewChecked: l,
        ngOnDestroy: u,
      } = i;
    s && (e.contentHooks ??= []).push(-n, s),
      a && ((e.contentHooks ??= []).push(n, a), (e.contentCheckHooks ??= []).push(n, a)),
      c && (e.viewHooks ??= []).push(-n, c),
      l && ((e.viewHooks ??= []).push(n, l), (e.viewCheckHooks ??= []).push(n, l)),
      u != null && (e.destroyHooks ??= []).push(n, u);
  }
}
function fo(e, t, n) {
  Mu(e, t, 3, n);
}
function po(e, t, n, r) {
  (e[E] & 3) === n && Mu(e, t, n, r);
}
function ks(e, t) {
  let n = e[E];
  (n & 3) === t && ((n &= 16383), (n += 1), (e[E] = n));
}
function Mu(e, t, n, r) {
  let o = r !== void 0 ? e[pt] & 65535 : 0,
    i = r ?? -1,
    s = t.length - 1,
    a = 0;
  for (let c = o; c < s; c++)
    if (typeof t[c + 1] === 'number') {
      if (((a = t[c]), r != null && a >= r)) break;
    } else
      t[c] < 0 && (e[pt] += 65536),
        (a < i || i === -1) && (lg(e, n, t, c), (e[pt] = (e[pt] & 4294901760) + c + 2)),
        c++;
}
function Wl(e, t) {
  A(_.LifecycleHookStart, e, t);
  const n = g(null);
  try {
    t.call(e);
  } finally {
    g(n), A(_.LifecycleHookEnd, e, t);
  }
}
function lg(e, t, n, r) {
  const o = n[r] < 0,
    i = n[r + 1],
    s = o ? -n[r] : n[r],
    a = e[s];
  o ? e[E] >> 14 < e[pt] >> 16 && (e[E] & 3) === t && ((e[E] += 16384), Wl(a, i)) : Wl(a, i);
}
var qt = -1,
  Dt = class {
    factory;
    name;
    injectImpl;
    resolving = !1;
    canSeeViewProviders;
    multi;
    componentProviders;
    index;
    providerFactory;
    constructor(t, n, r, o) {
      (this.factory = t), (this.name = o), (this.canSeeViewProviders = n), (this.injectImpl = r);
    }
  };
function ug(e) {
  return (e.flags & 8) !== 0;
}
function dg(e) {
  return (e.flags & 16) !== 0;
}
function fg(e, t, n) {
  let r = 0;
  for (; r < n.length; ) {
    const o = n[r];
    if (typeof o === 'number') {
      if (o !== 0) break;
      r++;
      const i = n[r++],
        s = n[r++],
        a = n[r++];
      e.setAttribute(t, s, a, i);
    } else {
      const i = o,
        s = n[++r];
      pg(i) ? e.setProperty(t, i, s) : e.setAttribute(t, i, s), r++;
    }
  }
  return r;
}
function _u(e) {
  return e === 3 || e === 4 || e === 6;
}
function pg(e) {
  return e.charCodeAt(0) === 64;
}
function Wt(e, t) {
  if (!(t === null || t.length === 0))
    if (e === null || e.length === 0) e = t.slice();
    else {
      let n = -1;
      for (let r = 0; r < t.length; r++) {
        const o = t[r];
        typeof o === 'number'
          ? (n = o)
          : n === 0 || (n === -1 || n === 2 ? Gl(e, n, o, null, t[++r]) : Gl(e, n, o, null, null));
      }
    }
  return e;
}
function Gl(e, t, n, _r, o) {
  let i = 0,
    s = e.length;
  if (t === -1) s = -1;
  else
    for (; i < e.length; ) {
      const a = e[i++];
      if (typeof a === 'number') {
        if (a === t) {
          s = -1;
          break;
        } else if (a > t) {
          s = i - 1;
          break;
        }
      }
    }
  for (; i < e.length; ) {
    const a = e[i];
    if (typeof a === 'number') break;
    if (a === n) {
      o !== null && (e[i + 1] = o);
      return;
    }
    i++, o !== null && i++;
  }
  s !== -1 && (e.splice(s, 0, t), (i = s + 1)), e.splice(i++, 0, n), o !== null && e.splice(i++, 0, o);
}
function Nu(e) {
  return e !== qt;
}
function vo(e) {
  return e & 32767;
}
function hg(e) {
  return e >> 16;
}
function Eo(e, t) {
  let n = hg(e),
    r = t;
  for (; n > 0; ) (r = r[ft]), n--;
  return r;
}
var qs = !0;
function Io(e) {
  const t = qs;
  return (qs = e), t;
}
var gg = 256,
  Su = gg - 1,
  xu = 5,
  mg = 0,
  we = {};
function yg(e, t, n) {
  let r;
  typeof n === 'string' ? (r = n.charCodeAt(0) || 0) : Object.hasOwn(n, ut) && (r = n[ut]),
    r == null && (r = n[ut] = mg++);
  const o = r & Su,
    i = 1 << o;
  t.data[e + (o >> xu)] |= i;
}
function Do(e, t) {
  const n = Au(e, t);
  if (n !== -1) return n;
  const r = t[y];
  r.firstCreatePass && ((e.injectorIndex = t.length), Os(r.data, e), Os(t, null), Os(r.blueprint, null));
  const o = wa(e, t),
    i = e.injectorIndex;
  if (Nu(o)) {
    const s = vo(o),
      a = Eo(o, t),
      c = a[y].data;
    for (let l = 0; l < 8; l++) t[i + l] = a[s + l] | c[s + l];
  }
  return (t[i + 8] = o), i;
}
function Os(e, t) {
  e.push(0, 0, 0, 0, 0, 0, 0, 0, t);
}
function Au(e, t) {
  return e.injectorIndex === -1 ||
    (e.parent && e.parent.injectorIndex === e.injectorIndex) ||
    t[e.injectorIndex + 8] === null
    ? -1
    : e.injectorIndex;
}
function wa(e, t) {
  if (e.parent && e.parent.injectorIndex !== -1) return e.parent.injectorIndex;
  let n = 0,
    r = null,
    o = t;
  for (; o !== null; ) {
    if (((r = Lu(o)), r === null)) return qt;
    if ((n++, (o = o[ft]), r.injectorIndex !== -1)) return r.injectorIndex | (n << 16);
  }
  return qt;
}
function Ws(e, t, n) {
  yg(e, t, n);
}
function vg(e, t) {
  if (t === 'class') return e.classes;
  if (t === 'style') return e.styles;
  const n = e.attrs;
  if (n) {
    let r = n.length,
      o = 0;
    for (; o < r; ) {
      const i = n[o];
      if (_u(i)) break;
      if (i === 0) o = o + 2;
      else if (typeof i === 'number') for (o++; o < r && typeof n[o] === 'string'; ) o++;
      else {
        if (i === t) return n[o + 1];
        o = o + 2;
      }
    }
  }
  return null;
}
function Ru(e, t, n) {
  if (n & 8 || e !== void 0) return e;
  $r(t, 'NodeInjector');
}
function ku(e, t, n, r) {
  if ((n & 8 && r === void 0 && (r = null), (n & 3) === 0)) {
    const o = e[ke],
      i = Y(void 0);
    try {
      return o ? o.get(t, r, n & 8) : Qi(t, r, n & 8);
    } finally {
      Y(i);
    }
  }
  return Ru(r, t, n);
}
function Ou(e, t, n, r = 0, o) {
  if (e !== null) {
    if (t[E] & 2048 && !(r & 2)) {
      const s = bg(e, t, n, r, we);
      if (s !== we) return s;
    }
    const i = Pu(e, t, n, r, we);
    if (i !== we) return i;
  }
  return ku(t, n, r, o);
}
function Pu(e, t, n, r, o) {
  const i = Ig(n);
  if (typeof i === 'function') {
    if (!bs(t, e, r)) return r & 1 ? Ru(o, n, r) : ku(t, n, r, o);
    try {
      let s;
      if (((s = i(r)), s == null && !(r & 8))) $r(n);
      else return s;
    } finally {
      Ts();
    }
  } else if (typeof i === 'number') {
    let s = null,
      a = Au(e, t),
      c = qt,
      l = r & 1 ? t[J][K] : null;
    for (
      (a === -1 || r & 4) &&
      ((c = a === -1 ? wa(e, t) : t[a + 8]),
      c === qt || !Ql(r, !1) ? (a = -1) : ((s = t[y]), (a = vo(c)), (t = Eo(c, t))));
      a !== -1;
    ) {
      const u = t[y];
      if (zl(i, a, u.data)) {
        const d = Eg(a, t, n, s, r, l);
        if (d !== we) return d;
      }
      (c = t[a + 8]),
        c !== qt && Ql(r, t[y].data[a + 8] === l) && zl(i, a, t) ? ((s = u), (a = vo(c)), (t = Eo(c, t))) : (a = -1);
    }
  }
  return o;
}
function Eg(e, t, n, r, o, i) {
  const s = t[y],
    a = s.data[e + 8],
    c = r == null ? ze(a) && qs : r !== s && (a.type & 3) !== 0,
    l = o & 1 && i === a,
    u = ho(a, s, n, c, l);
  return u !== null ? An(t, s, u, a, o) : we;
}
function ho(e, t, n, r, o) {
  const i = e.providerIndexes,
    s = t.data,
    a = i & 1048575,
    c = e.directiveStart,
    l = e.directiveEnd,
    u = i >> 20,
    d = r ? a : a + u,
    p = o ? a + u : l;
  for (let f = d; f < p; f++) {
    const h = s[f];
    if ((f < c && n === h) || (f >= c && h.type === n)) return f;
  }
  if (o) {
    const f = s[c];
    if (f && be(f) && f.type === n) return c;
  }
  return null;
}
function An(e, t, n, r, o) {
  let i = e[n],
    s = t.data;
  if (i instanceof Dt) {
    const a = i;
    if (a.resolving) throw zi('');
    const c = Io(a.canSeeViewProviders);
    a.resolving = !0;
    let _l = s[n].type || s[n],
      _u,
      d = a.injectImpl ? Y(a.injectImpl) : null,
      _p = bs(e, r, 0);
    try {
      (i = e[n] = a.factory(void 0, o, s, e, r)), t.firstCreatePass && n >= r.directiveStart && ag(n, s[n], t);
    } finally {
      d !== null && Y(d), Io(c), (a.resolving = !1), Ts();
    }
  }
  return i;
}
function Ig(e) {
  if (typeof e === 'string') return e.charCodeAt(0) || 0;
  const t = Object.hasOwn(e, ut) ? e[ut] : void 0;
  return typeof t === 'number' ? (t >= 0 ? t & Su : Dg) : t;
}
function zl(e, t, n) {
  const r = 1 << e;
  return !!(n[t + (e >> xu)] & r);
}
function Ql(e, t) {
  return !(e & 2) && !(e & 1 && t);
}
var It = class {
  _tNode;
  _lView;
  constructor(t, n) {
    (this._tNode = t), (this._lView = n);
  }
  get(t, n, r) {
    return Ou(this._tNode, this._lView, t, at(r), n);
  }
};
function Dg() {
  return new It(H(), m());
}
function Cg(e) {
  return Hn(() => {
    let t = e.prototype.constructor,
      n = t[un] || Gs(t),
      r = Object.prototype,
      o = Object.getPrototypeOf(e.prototype).constructor;
    for (; o && o !== r; ) {
      const i = o[un] || Gs(o);
      if (i && i !== n) return i;
      o = Object.getPrototypeOf(o);
    }
    return (i) => new i();
  });
}
function Gs(e) {
  return Vi(e)
    ? () => {
        const t = Gs(U(e));
        return t?.();
      }
    : Be(e);
}
function bg(e, t, n, r, o) {
  let i = e,
    s = t;
  for (; i !== null && s !== null && s[E] & 2048 && !Ht(s); ) {
    const a = Pu(i, s, n, r | 2, we);
    if (a !== we) return a;
    let c = i.parent;
    if (!c) {
      const l = s[rs];
      if (l) {
        const u = l.get(n, we, r);
        if (u !== we) return u;
      }
      (c = Lu(s)), (s = s[ft]);
    }
    i = c;
  }
  return o;
}
function Lu(e) {
  const t = e[y],
    n = t.type;
  return n === 2 ? t.declTNode : n === 1 ? e[K] : null;
}
function Fu(e) {
  return vg(H(), e);
}
function Tg() {
  return Yt(H(), m());
}
function Yt(e, t) {
  return new Bn(ue(e, t));
}
var Bn = (() => {
  class e {
    nativeElement;
    constructor(n) {
      this.nativeElement = n;
    }
    static __NG_ELEMENT_ID__ = Tg;
  }
  return e;
})();
function ju(e) {
  return e instanceof Bn ? e.nativeElement : e;
}
function wg() {
  return this._results[Symbol.iterator]();
}
var Co = class {
  _emitDistinctChangesOnly;
  dirty = !0;
  _onDirty = void 0;
  _results = [];
  _changesDetected = !1;
  _changes = void 0;
  length = 0;
  first = void 0;
  last = void 0;
  get changes() {
    return (this._changes ??= new Me());
  }
  constructor(t = !1) {
    this._emitDistinctChangesOnly = t;
  }
  get(t) {
    return this._results[t];
  }
  map(t) {
    return this._results.map(t);
  }
  filter(t) {
    return this._results.filter(t);
  }
  find(t) {
    return this._results.find(t);
  }
  reduce(t, n) {
    return this._results.reduce(t, n);
  }
  forEach(t) {
    this._results.forEach(t);
  }
  some(t) {
    return this._results.some(t);
  }
  toArray() {
    return this._results.slice();
  }
  toString() {
    return this._results.toString();
  }
  reset(t, n) {
    this.dirty = !1;
    const r = el(t);
    (this._changesDetected = !Xc(this._results, r, n)) &&
      ((this._results = r), (this.length = r.length), (this.last = r[this.length - 1]), (this.first = r[0]));
  }
  notifyOnChanges() {
    this._changes !== void 0 && (this._changesDetected || !this._emitDistinctChangesOnly) && this._changes.next(this);
  }
  onDirty(t) {
    this._onDirty = t;
  }
  setDirty() {
    (this.dirty = !0), this._onDirty?.();
  }
  destroy() {
    this._changes !== void 0 && (this._changes.complete(), this._changes.unsubscribe());
  }
  [Symbol.iterator] = wg;
};
function Vu(e) {
  return (e.flags & 128) === 128;
}
var Ma = ((e) => ((e[(e.OnPush = 0)] = 'OnPush'), (e[(e.Default = 1)] = 'Default'), e))(Ma || {}),
  Hu = new Map(),
  Mg = 0;
function _g() {
  return Mg++;
}
function Ng(e) {
  Hu.set(e[Oe], e);
}
function zs(e) {
  Hu.delete(e[Oe]);
}
var Zl = '__ngContext__';
function Gt(e, t) {
  Ce(t) ? ((e[Zl] = t[Oe]), Ng(t)) : (e[Zl] = t);
}
function Bu(e) {
  return Uu(e[Vt]);
}
function $u(e) {
  return Uu(e[oe]);
}
function Uu(e) {
  for (; e !== null && !le(e); ) e = e[oe];
  return e;
}
var Qs;
function Sg(e) {
  Qs = e;
}
function qu() {
  if (Qs !== void 0) return Qs;
  if (typeof document < 'u') return document;
  throw new b(210, !1);
}
var xg = new R('', { factory: () => Ag }),
  Ag = 'ng';
var Wu = new R(''),
  Rg = new R('', { providedIn: 'platform', factory: () => 'unknown' }),
  kg = new R(''),
  Og = new R('', { factory: () => D(oo).body?.querySelector('[ngCspNonce]')?.getAttribute('ngCspNonce') || null });
var Gu = 'r';
var zu = 'di';
var Qu = !1,
  Zu = new R('', { factory: () => Qu });
var Pg = (_e, _t, _n, _r) => {};
function Lg(e, t, n, r) {
  Pg(e, t, n, r);
}
function Fo(e) {
  return (e.flags & 32) === 32;
}
var Fg = () => null;
function Yu(e, t, n = !1) {
  return Fg(e, t, n);
}
function Ku(e, t) {
  const n = e.contentQueries;
  if (n !== null) {
    const r = g(null);
    try {
      for (let o = 0; o < n.length; o += 2) {
        const i = n[o],
          s = n[o + 1];
        if (s !== -1) {
          const a = e.data[s];
          Tn(i), a.contentQueries(2, t[s], s);
        }
      }
    } finally {
      g(r);
    }
  }
}
function Zs(e, t, n) {
  Tn(0);
  const r = g(null);
  try {
    t(e, n);
  } finally {
    g(r);
  }
}
function Ju(e, t, n) {
  if (is(t)) {
    const r = g(null);
    try {
      const o = t.directiveStart,
        i = t.directiveEnd;
      for (let s = o; s < i; s++) {
        const a = e.data[s];
        if (a.contentQueries) {
          const c = n[s];
          a.contentQueries(1, c, s);
        }
      }
    } finally {
      g(r);
    }
  }
}
var Ct = ((e) => (
  (e[(e.Emulated = 0)] = 'Emulated'),
  (e[(e.None = 2)] = 'None'),
  (e[(e.ShadowDom = 3)] = 'ShadowDom'),
  (e[(e.ExperimentalIsolatedShadowDom = 4)] = 'ExperimentalIsolatedShadowDom'),
  e
))(Ct || {});
var ao;
function jg() {
  if (ao === void 0 && ((ao = null), ve.trustedTypes))
    try {
      ao = ve.trustedTypes.createPolicy('angular', {
        createHTML: (e) => e,
        createScript: (e) => e,
        createScriptURL: (e) => e,
      });
    } catch {}
  return ao;
}
function jo(e) {
  return jg()?.createHTML(e) || e;
}
var co;
function Xu() {
  if (co === void 0 && ((co = null), ve.trustedTypes))
    try {
      co = ve.trustedTypes.createPolicy('angular#unsafe-bypass', {
        createHTML: (e) => e,
        createScript: (e) => e,
        createScriptURL: (e) => e,
      });
    } catch {}
  return co;
}
function Yl(e) {
  return Xu()?.createHTML(e) || e;
}
function Kl(e) {
  return Xu()?.createScriptURL(e) || e;
}
var Le = class {
    changingThisBreaksApplicationSecurity;
    constructor(t) {
      this.changingThisBreaksApplicationSecurity = t;
    }
    toString() {
      return `SafeValue must use [property]=binding: ${this.changingThisBreaksApplicationSecurity} (see ${Fr})`;
    }
  },
  Ys = class extends Le {
    getTypeName() {
      return 'HTML';
    }
  },
  Ks = class extends Le {
    getTypeName() {
      return 'Style';
    }
  },
  Js = class extends Le {
    getTypeName() {
      return 'Script';
    }
  },
  Xs = class extends Le {
    getTypeName() {
      return 'URL';
    }
  },
  ea = class extends Le {
    getTypeName() {
      return 'ResourceURL';
    }
  };
function Kt(e) {
  return e instanceof Le ? e.changingThisBreaksApplicationSecurity : e;
}
function Vo(e, t) {
  const n = ed(e);
  if (n != null && n !== t) {
    if (n === 'ResourceURL' && t === 'URL') return !0;
    throw new Error(`Required a safe ${t}, got a ${n} (see ${Fr})`);
  }
  return n === t;
}
function ed(e) {
  return (e instanceof Le && e.getTypeName()) || null;
}
function Vg(e) {
  return new Ys(e);
}
function Hg(e) {
  return new Ks(e);
}
function Bg(e) {
  return new Js(e);
}
function $g(e) {
  return new Xs(e);
}
function Ug(e) {
  return new ea(e);
}
function qg(e) {
  const t = new na(e);
  return Wg() ? new ta(t) : t;
}
var ta = class {
    inertDocumentHelper;
    constructor(t) {
      this.inertDocumentHelper = t;
    }
    getInertBodyElement(t) {
      t = `<body><remove></remove>${t}`;
      try {
        const n = new window.DOMParser().parseFromString(jo(t), 'text/html').body;
        return n === null ? this.inertDocumentHelper.getInertBodyElement(t) : (n.firstChild?.remove(), n);
      } catch {
        return null;
      }
    }
  },
  na = class {
    defaultDoc;
    inertDocument;
    constructor(t) {
      (this.defaultDoc = t),
        (this.inertDocument = this.defaultDoc.implementation.createHTMLDocument('sanitization-inert'));
    }
    getInertBodyElement(t) {
      const n = this.inertDocument.createElement('template');
      return (n.innerHTML = jo(t)), n;
    }
  };
function Wg() {
  try {
    return !!new window.DOMParser().parseFromString(jo(''), 'text/html');
  } catch {
    return !1;
  }
}
var Gg = /^(?!javascript:)(?:[a-z0-9+.-]+:|[^&:/?#]*(?:[/?#]|$))/i;
function _a(e) {
  return (e = String(e)), e.match(Gg) ? e : `unsafe:${e}`;
}
function Fe(e) {
  const t = {};
  for (const n of e.split(',')) t[n] = !0;
  return t;
}
function $n(...e) {
  const t = {};
  for (const n of e) for (const r in n) Object.hasOwn(n, r) && (t[r] = !0);
  return t;
}
var td = Fe('area,br,col,hr,img,wbr'),
  nd = Fe('colgroup,dd,dt,li,p,tbody,td,tfoot,th,thead,tr'),
  rd = Fe('rp,rt'),
  zg = $n(rd, nd),
  Qg = $n(
    nd,
    Fe(
      'address,article,aside,blockquote,caption,center,del,details,dialog,dir,div,dl,figure,figcaption,footer,h1,h2,h3,h4,h5,h6,header,hgroup,hr,ins,main,map,menu,nav,ol,pre,section,summary,table,ul',
    ),
  ),
  Zg = $n(
    rd,
    Fe(
      'a,abbr,acronym,audio,b,bdi,bdo,big,br,cite,code,del,dfn,em,font,i,img,ins,kbd,label,map,mark,picture,q,ruby,rp,rt,s,samp,small,source,span,strike,strong,sub,sup,time,track,tt,u,var,video',
    ),
  ),
  Jl = $n(td, Qg, Zg, zg),
  od = Fe('background,cite,href,itemtype,longdesc,poster,src,xlink:href'),
  Yg = Fe(
    'abbr,accesskey,align,alt,autoplay,axis,bgcolor,border,cellpadding,cellspacing,class,clear,color,cols,colspan,compact,controls,coords,datetime,default,dir,download,face,headers,height,hidden,hreflang,hspace,ismap,itemscope,itemprop,kind,label,lang,language,loop,media,muted,nohref,nowrap,open,preload,rel,rev,role,rows,rowspan,rules,scope,scrolling,shape,size,sizes,span,srclang,srcset,start,summary,tabindex,target,title,translate,type,usemap,valign,value,vspace,width',
  ),
  Kg = Fe(
    'aria-activedescendant,aria-atomic,aria-autocomplete,aria-busy,aria-checked,aria-colcount,aria-colindex,aria-colspan,aria-controls,aria-current,aria-describedby,aria-details,aria-disabled,aria-dropeffect,aria-errormessage,aria-expanded,aria-flowto,aria-grabbed,aria-haspopup,aria-hidden,aria-invalid,aria-keyshortcuts,aria-label,aria-labelledby,aria-level,aria-live,aria-modal,aria-multiline,aria-multiselectable,aria-orientation,aria-owns,aria-placeholder,aria-posinset,aria-pressed,aria-readonly,aria-relevant,aria-required,aria-roledescription,aria-rowcount,aria-rowindex,aria-rowspan,aria-selected,aria-setsize,aria-sort,aria-valuemax,aria-valuemin,aria-valuenow,aria-valuetext',
  ),
  Jg = $n(od, Yg, Kg),
  Xg = Fe('script,style,template'),
  ra = class {
    sanitizedSomething = !1;
    buf = [];
    sanitizeChildren(t) {
      let n = t.firstChild,
        r = !0,
        o = [];
      for (; n; ) {
        if (
          (n.nodeType === Node.ELEMENT_NODE
            ? (r = this.startElement(n))
            : n.nodeType === Node.TEXT_NODE
              ? this.chars(n.nodeValue)
              : (this.sanitizedSomething = !0),
          r && n.firstChild)
        ) {
          o.push(n), (n = nm(n));
          continue;
        }
        for (; n; ) {
          n.nodeType === Node.ELEMENT_NODE && this.endElement(n);
          const i = tm(n);
          if (i) {
            n = i;
            break;
          }
          n = o.pop();
        }
      }
      return this.buf.join('');
    }
    startElement(t) {
      const n = Xl(t).toLowerCase();
      if (!Object.hasOwn(Jl, n)) return (this.sanitizedSomething = !0), !Object.hasOwn(Xg, n);
      this.buf.push('<'), this.buf.push(n);
      const r = t.attributes;
      for (let o = 0; o < r.length; o++) {
        const i = r.item(o),
          s = i.name,
          a = s.toLowerCase();
        if (!Object.hasOwn(Jg, a)) {
          this.sanitizedSomething = !0;
          continue;
        }
        let c = i.value;
        od[a] && (c = _a(c)), this.buf.push(' ', s, '="', eu(c), '"');
      }
      return this.buf.push('>'), !0;
    }
    endElement(t) {
      const n = Xl(t).toLowerCase();
      Object.hasOwn(Jl, n) && !Object.hasOwn(td, n) && (this.buf.push('</'), this.buf.push(n), this.buf.push('>'));
    }
    chars(t) {
      this.buf.push(eu(t));
    }
  };
function em(e, t) {
  return (e.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_CONTAINED_BY) !== Node.DOCUMENT_POSITION_CONTAINED_BY;
}
function tm(e) {
  const t = e.nextSibling;
  if (t && e !== t.previousSibling) throw id(t);
  return t;
}
function nm(e) {
  const t = e.firstChild;
  if (t && em(e, t)) throw id(t);
  return t;
}
function Xl(e) {
  const t = e.nodeName;
  return typeof t === 'string' ? t : 'FORM';
}
function id(e) {
  return new Error(`Failed to sanitize html because the element is clobbered: ${e.outerHTML}`);
}
var rm = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
  om = /([^#-~ |!])/g;
function eu(e) {
  return e
    .replace(/&/g, '&amp;')
    .replace(rm, (t) => {
      const n = t.charCodeAt(0),
        r = t.charCodeAt(1);
      return `&#${(n - 55296) * 1024 + (r - 56320) + 65536};`;
    })
    .replace(om, (t) => `&#${t.charCodeAt(0)};`)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
var lo;
function sd(e, t) {
  let n = null;
  try {
    lo = lo || qg(e);
    let r = t ? String(t) : '';
    n = lo.getInertBodyElement(r);
    let o = 5,
      i = r;
    do {
      if (o === 0) throw new Error('Failed to sanitize html because the input is unstable');
      o--, (r = i), (i = n.innerHTML), (n = lo.getInertBodyElement(r));
    } while (r !== i);
    const a = new ra().sanitizeChildren(tu(n) || n);
    return jo(a);
  } finally {
    if (n) {
      const r = tu(n) || n;
      for (; r.firstChild; ) r.firstChild.remove();
    }
  }
}
function tu(e) {
  return 'content' in e && im(e) ? e.content : null;
}
function im(e) {
  return e.nodeType === Node.ELEMENT_NODE && e.nodeName === 'TEMPLATE';
}
function sm(e, t) {
  return e.createText(t);
}
function am(e, t, n) {
  e.setValue(t, n);
}
function ad(e, t, n) {
  return e.createElement(t, n);
}
function bo(e, t, n, r, o) {
  e.insertBefore(t, n, r, o);
}
function cd(e, t, n) {
  e.appendChild(t, n);
}
function nu(e, t, n, r, o) {
  r !== null ? bo(e, t, n, r, o) : cd(e, t, n);
}
function ld(e, t, n, r) {
  e.removeChild(null, t, n, r);
}
function cm(e, t, n) {
  e.setAttribute(t, 'style', n);
}
function lm(e, t, n) {
  n === '' ? e.removeAttribute(t, 'class') : e.setAttribute(t, 'class', n);
}
function ud(e, t, n) {
  const { mergedAttrs: r, classes: o, styles: i } = n;
  r !== null && fg(e, t, r), o !== null && lm(e, t, o), i !== null && cm(e, t, i);
}
var Un = ((e) => (
  (e[(e.NONE = 0)] = 'NONE'),
  (e[(e.HTML = 1)] = 'HTML'),
  (e[(e.STYLE = 2)] = 'STYLE'),
  (e[(e.SCRIPT = 3)] = 'SCRIPT'),
  (e[(e.URL = 4)] = 'URL'),
  (e[(e.RESOURCE_URL = 5)] = 'RESOURCE_URL'),
  e
))(Un || {});
function um(e) {
  const t = Na();
  return t ? Yl(t.sanitize(Un.HTML, e) || '') : Vo(e, 'HTML') ? Yl(Kt(e)) : sd(qu(), Ee(e));
}
function dd(e) {
  const t = Na();
  return t ? t.sanitize(Un.URL, e) || '' : Vo(e, 'URL') ? Kt(e) : _a(Ee(e));
}
function fd(e) {
  const t = Na();
  if (t) return Kl(t.sanitize(Un.RESOURCE_URL, e) || '');
  if (Vo(e, 'ResourceURL')) return Kl(Kt(e));
  throw new b(904, !1);
}
var dm = new Set(['embed', 'frame', 'iframe', 'media', 'script']),
  fm = new Set(['base', 'link', 'script']);
function pm(e, t) {
  return (t === 'src' && dm.has(e)) || (t === 'href' && fm.has(e)) || (t === 'xlink:href' && e === 'script') ? fd : dd;
}
function hm(e, t, n) {
  return pm(t, n)(e);
}
function Na() {
  const e = m();
  return e?.[Ie].sanitizer;
}
function gm(e) {
  return e.ownerDocument;
}
function pd(e) {
  return e instanceof Function ? e() : e;
}
function mm(e, t, n) {
  const r = e.length;
  for (;;) {
    const o = e.indexOf(t, n);
    if (o === -1) return o;
    if (o === 0 || e.charCodeAt(o - 1) <= 32) {
      const i = t.length;
      if (o + i === r || e.charCodeAt(o + i) <= 32) return o;
    }
    n = o + 1;
  }
}
var hd = 'ng-template';
function ym(e, t, n, r) {
  let o = 0;
  if (r) {
    for (; o < t.length && typeof t[o] === 'string'; o += 2)
      if (t[o] === 'class' && mm(t[o + 1].toLowerCase(), n, 0) !== -1) return !0;
  } else if (Sa(e)) return !1;
  if (((o = t.indexOf(1, o)), o > -1)) {
    let i;
    for (; ++o < t.length && typeof (i = t[o]) === 'string'; ) if (i.toLowerCase() === n) return !0;
  }
  return !1;
}
function Sa(e) {
  return e.type === 4 && e.value !== hd;
}
function vm(e, t, n) {
  const r = e.type === 4 && !n ? hd : e.value;
  return t === r;
}
function Em(e, t, n) {
  let r = 4,
    o = e.attrs,
    i = o !== null ? Cm(o) : 0,
    s = !1;
  for (let a = 0; a < t.length; a++) {
    const c = t[a];
    if (typeof c === 'number') {
      if (!s && !fe(r) && !fe(c)) return !1;
      if (s && fe(c)) continue;
      (s = !1), (r = c | (r & 1));
      continue;
    }
    if (!s)
      if (r & 4) {
        if (((r = 2 | (r & 1)), (c !== '' && !vm(e, c, n)) || (c === '' && t.length === 1))) {
          if (fe(r)) return !1;
          s = !0;
        }
      } else if (r & 8) {
        if (o === null || !ym(e, o, c, n)) {
          if (fe(r)) return !1;
          s = !0;
        }
      } else {
        const l = t[++a],
          u = Im(c, o, Sa(e), n);
        if (u === -1) {
          if (fe(r)) return !1;
          s = !0;
          continue;
        }
        if (l !== '') {
          let d;
          if ((u > i ? (d = '') : (d = o[u + 1].toLowerCase()), r & 2 && l !== d)) {
            if (fe(r)) return !1;
            s = !0;
          }
        }
      }
  }
  return fe(r) || s;
}
function fe(e) {
  return (e & 1) === 0;
}
function Im(e, t, n, r) {
  if (t === null) return -1;
  let o = 0;
  if (r || !n) {
    let i = !1;
    for (; o < t.length; ) {
      const s = t[o];
      if (s === e) return o;
      if (s === 3 || s === 6) i = !0;
      else if (s === 1 || s === 2) {
        let a = t[++o];
        for (; typeof a === 'string'; ) a = t[++o];
        continue;
      } else {
        if (s === 4) break;
        if (s === 0) {
          o += 4;
          continue;
        }
      }
      o += i ? 1 : 2;
    }
    return -1;
  } else return bm(t, e);
}
function gd(e, t, n = !1) {
  for (let r = 0; r < t.length; r++) if (Em(e, t[r], n)) return !0;
  return !1;
}
function Dm(e) {
  const t = e.attrs;
  if (t != null) {
    const n = t.indexOf(5);
    if ((n & 1) === 0) return t[n + 1];
  }
  return null;
}
function Cm(e) {
  for (let t = 0; t < e.length; t++) {
    const n = e[t];
    if (_u(n)) return t;
  }
  return e.length;
}
function bm(e, t) {
  let n = e.indexOf(4);
  if (n > -1)
    for (n++; n < e.length; ) {
      const r = e[n];
      if (typeof r === 'number') return -1;
      if (r === t) return n;
      n++;
    }
  return -1;
}
function Tm(e, t) {
  e: for (let n = 0; n < t.length; n++) {
    const r = t[n];
    if (e.length === r.length) {
      for (let o = 0; o < e.length; o++) if (e[o] !== r[o]) continue e;
      return !0;
    }
  }
  return !1;
}
function ru(e, t) {
  return e ? `:not(${t.trim()})` : t;
}
function wm(e) {
  let t = e[0],
    n = 1,
    r = 2,
    o = '',
    i = !1;
  for (; n < e.length; ) {
    const s = e[n];
    if (typeof s === 'string')
      if (r & 2) {
        const a = e[++n];
        o += `[${s}${a.length > 0 ? `="${a}"` : ''}]`;
      } else r & 8 ? (o += `.${s}`) : r & 4 && (o += ` ${s}`);
    else o !== '' && !fe(s) && ((t += ru(i, o)), (o = '')), (r = s), (i = i || !fe(r));
    n++;
  }
  return o !== '' && (t += ru(i, o)), t;
}
function Mm(e) {
  return e.map(wm).join(',');
}
function _m(e) {
  let t = [],
    n = [],
    r = 1,
    o = 2;
  for (; r < e.length; ) {
    const i = e[r];
    if (typeof i === 'string') o === 2 ? i !== '' && t.push(i, e[++r]) : o === 8 && n.push(i);
    else {
      if (!fe(o)) break;
      o = i;
    }
    r++;
  }
  return n.length && t.push(1, ...n), t;
}
var q = {};
function xa(e, t, n, r, o, i, s, a, c, l, u) {
  const d = O + r,
    p = d + o,
    f = Nm(d, p),
    h = typeof l === 'function' ? l() : l;
  return (f[y] = {
    type: e,
    blueprint: f,
    template: n,
    queries: null,
    viewQuery: a,
    declTNode: t,
    data: f.slice().fill(null, d),
    bindingStartIndex: d,
    expandoStartIndex: p,
    hostBindingOpCodes: null,
    firstCreatePass: !0,
    firstUpdatePass: !0,
    staticViewQueries: !1,
    staticContentQueries: !1,
    preOrderHooks: null,
    preOrderCheckHooks: null,
    contentHooks: null,
    contentCheckHooks: null,
    viewHooks: null,
    viewCheckHooks: null,
    destroyHooks: null,
    cleanup: null,
    contentQueries: null,
    components: null,
    directiveRegistry: typeof i === 'function' ? i() : i,
    pipeRegistry: typeof s === 'function' ? s() : s,
    firstChild: null,
    schemas: c,
    consts: h,
    incompleteFirstPass: !1,
    ssrId: u,
  });
}
function Nm(e, t) {
  const n = [];
  for (let r = 0; r < t; r++) n.push(r < e ? null : q);
  return n;
}
function Sm(e) {
  const t = e.tView;
  return t === null || t.incompleteFirstPass
    ? (e.tView = xa(
        1,
        null,
        e.template,
        e.decls,
        e.vars,
        e.directiveDefs,
        e.pipeDefs,
        e.viewQuery,
        e.schemas,
        e.consts,
        e.id,
      ))
    : t;
}
function Aa(e, t, n, r, o, i, s, a, c, l, u) {
  const d = t.blueprint.slice();
  return (
    (d[ce] = o),
    (d[E] = r | 4 | 128 | 8 | 64 | 1024),
    (l !== null || (e && e[E] & 2048)) && (d[E] |= 2048),
    ls(d),
    (d[V] = d[ft] = e),
    (d[j] = n),
    (d[Ie] = s || e?.[Ie]),
    (d[k] = a || e?.[k]),
    (d[ke] = c || e?.[ke] || null),
    (d[K] = i),
    (d[Oe] = _g()),
    (d[dt] = u),
    (d[rs] = l),
    (d[J] = t.type === 2 ? e[J] : d),
    d
  );
}
function xm(e, t, n) {
  const r = ue(t, e),
    o = Sm(n),
    i = e[Ie].rendererFactory,
    s = Ra(e, Aa(e, o, null, md(n), r, t, null, i.createRenderer(r, n), null, null, null));
  return (e[t.index] = s);
}
function md(e) {
  let t = 16;
  return e.signals ? (t = 4096) : e.onPush && (t = 64), t;
}
function yd(e, t, n, r) {
  if (n === 0) return -1;
  const o = t.length;
  for (let i = 0; i < n; i++) t.push(r), e.blueprint.push(r), e.data.push(null);
  return o;
}
function Ra(e, t) {
  return e[Vt] ? (e[ns][oe] = t) : (e[Vt] = t), (e[ns] = t), t;
}
function Am(e = 1) {
  vd(P(), m(), de() + e, !1);
}
function vd(e, t, n, r) {
  if (!r)
    if ((t[E] & 3) === 3) {
      const i = e.preOrderCheckHooks;
      i !== null && fo(t, i, n);
    } else {
      const i = e.preOrderHooks;
      i !== null && po(t, i, 0, n);
    }
  Ze(n);
}
var Ho = ((e) => (
  (e[(e.None = 0)] = 'None'),
  (e[(e.SignalBased = 1)] = 'SignalBased'),
  (e[(e.HasDecoratorInputTransform = 2)] = 'HasDecoratorInputTransform'),
  e
))(Ho || {});
function oa(e, t, n, r) {
  const o = g(null);
  try {
    let [i, s, a] = e.inputs[n],
      c = null;
    (s & Ho.SignalBased) !== 0 && (c = t[i][$]),
      c !== null && c.transformFn !== void 0 ? (r = c.transformFn(r)) : a !== null && (r = a.call(t, r)),
      e.setInput !== null ? e.setInput(t, c, r, n, i) : Cu(t, c, i, r);
  } finally {
    g(o);
  }
}
var To = ((e) => ((e[(e.Important = 1)] = 'Important'), (e[(e.DashCase = 2)] = 'DashCase'), e))(To || {}),
  Rm;
function ka(e, t) {
  return Rm(e, t);
}
var Rn = new Set(),
  Bo = ((e) => (
    (e[(e.CHANGE_DETECTION = 0)] = 'CHANGE_DETECTION'), (e[(e.AFTER_NEXT_RENDER = 1)] = 'AFTER_NEXT_RENDER'), e
  ))(Bo || {}),
  qn = new R(''),
  ou = new Set();
function wt(e) {
  ou.has(e) || (ou.add(e), performance?.mark?.('mark_feature_usage', { detail: { feature: e } }));
}
var Oa = (() => {
    class e {
      impl = null;
      execute() {
        this.impl?.execute();
      }
      static \u0275prov = z({ token: e, providedIn: 'root', factory: () => new e() });
    }
    return e;
  })(),
  Ed = [0, 1, 2, 3],
  Id = (() => {
    class e {
      ngZone = D(ye);
      scheduler = D(Ae);
      errorHandler = D(xe, { optional: !0 });
      sequences = new Set();
      deferredRegistrations = new Set();
      executing = !1;
      constructor() {
        D(qn, { optional: !0 });
      }
      execute() {
        const n = this.sequences.size > 0;
        n && A(_.AfterRenderHooksStart), (this.executing = !0);
        for (const r of Ed)
          for (const o of this.sequences)
            if (!(o.erroredOrDestroyed || !o.hooks[r]))
              try {
                o.pipelinedValue = this.ngZone.runOutsideAngular(() =>
                  this.maybeTrace(() => {
                    const i = o.hooks[r];
                    return i(o.pipelinedValue);
                  }, o.snapshot),
                );
              } catch (i) {
                (o.erroredOrDestroyed = !0), this.errorHandler?.handleError(i);
              }
        this.executing = !1;
        for (const r of this.sequences) r.afterRun(), r.once && (this.sequences.delete(r), r.destroy());
        for (const r of this.deferredRegistrations) this.sequences.add(r);
        this.deferredRegistrations.size > 0 && this.scheduler.notify(7),
          this.deferredRegistrations.clear(),
          n && A(_.AfterRenderHooksEnd);
      }
      register(n) {
        const { view: r } = n;
        r !== void 0
          ? ((r[ht] ??= []).push(n), vt(r), (r[E] |= 8192))
          : this.executing
            ? this.deferredRegistrations.add(n)
            : this.addSequence(n);
      }
      addSequence(n) {
        this.sequences.add(n), this.scheduler.notify(7);
      }
      unregister(n) {
        this.executing && this.sequences.has(n)
          ? ((n.erroredOrDestroyed = !0), (n.pipelinedValue = void 0), (n.once = !0))
          : (this.sequences.delete(n), this.deferredRegistrations.delete(n));
      }
      maybeTrace(n, r) {
        return r ? r.run(Bo.AFTER_NEXT_RENDER, n) : n();
      }
      static \u0275prov = z({ token: e, providedIn: 'root', factory: () => new e() });
    }
    return e;
  })(),
  wo = class {
    impl;
    hooks;
    view;
    once;
    snapshot;
    erroredOrDestroyed = !1;
    pipelinedValue = void 0;
    unregisterOnDestroy;
    constructor(t, n, r, o, i, s = null) {
      (this.impl = t),
        (this.hooks = n),
        (this.view = r),
        (this.once = o),
        (this.snapshot = s),
        (this.unregisterOnDestroy = i?.onDestroy(() => this.destroy()));
    }
    afterRun() {
      (this.erroredOrDestroyed = !1), (this.pipelinedValue = void 0), this.snapshot?.dispose(), (this.snapshot = null);
    }
    destroy() {
      this.impl.unregister(this), this.unregisterOnDestroy?.();
      const t = this.view?.[ht];
      t && (this.view[ht] = t.filter((n) => n !== this));
    }
  };
function km(e, t) {
  const n = t?.injector ?? D(me);
  return wt('NgAfterNextRender'), Pm(e, n, t, !0);
}
function Om(e) {
  return e instanceof Function ? [void 0, void 0, e, void 0] : [e.earlyRead, e.write, e.mixedReadWrite, e.read];
}
function Pm(e, t, n, r) {
  const o = t.get(Oa);
  o.impl ??= t.get(Id);
  const i = t.get(qn, null, { optional: !0 }),
    s = n?.manualCleanup !== !0 ? t.get(Pe) : null,
    a = t.get(Mn, null, { optional: !0 }),
    c = new wo(o.impl, Om(e), a?.view, r, s, i?.snapshot(null));
  return o.impl.register(c), c;
}
var Dd = new R('', { factory: () => ({ queue: new Set(), isScheduled: !1, scheduler: null, injector: D(re) }) });
function Cd(e, t, n) {
  const r = e.get(Dd);
  if (Array.isArray(t)) for (const o of t) r.queue.add(o), n?.detachedLeaveAnimationFns?.push(o);
  else r.queue.add(t), n?.detachedLeaveAnimationFns?.push(t);
  r.scheduler?.(e);
}
function Lm(e, t) {
  const n = e.get(Dd);
  if (t.detachedLeaveAnimationFns) {
    for (const r of t.detachedLeaveAnimationFns) n.queue.delete(r);
    t.detachedLeaveAnimationFns = void 0;
  }
}
function Fm(e, t) {
  for (const [_n, r] of t) Cd(e, r.animateFns);
}
function iu(e, t, n, r) {
  const o = e?.[gt]?.enter;
  t && o?.has(n.index) && Fm(r, o);
}
function Ut(e, t, n, r, o, i, s, a) {
  if (o != null) {
    let c,
      l = !1;
    le(o) ? (c = o) : Ce(o) && ((l = !0), (o = o[ce]));
    const u = ie(o);
    e === 0 && r !== null
      ? (iu(a, r, i, n), s == null ? cd(t, r, u) : bo(t, r, u, s || null, !0))
      : e === 1 && r !== null
        ? (iu(a, r, i, n), bo(t, r, u, s || null, !0))
        : e === 2
          ? su(a, i, n, (d) => {
              ld(t, u, l, d);
            })
          : e === 3 &&
            su(a, i, n, () => {
              t.destroyNode(u);
            }),
      c != null && Qm(t, e, n, c, i, r, s);
  }
}
function jm(e, t) {
  bd(e, t), (t[ce] = null), (t[K] = null);
}
function Vm(e, t, n, r, o, i) {
  (r[ce] = o), (r[K] = t), Uo(e, r, n, 1, o, i);
}
function bd(e, t) {
  t[Ie].changeDetectionScheduler?.notify(9), Uo(e, t, t[k], 2, null, null);
}
function Hm(e) {
  let t = e[Vt];
  if (!t) return Ps(e[y], e);
  for (; t; ) {
    let n = null;
    if (Ce(t)) n = t[Vt];
    else {
      const r = t[F];
      r && (n = r);
    }
    if (!n) {
      for (; t && !t[oe] && t !== e; ) Ce(t) && Ps(t[y], t), (t = t[V]);
      t === null && (t = e), Ce(t) && Ps(t[y], t), (n = t?.[oe]);
    }
    t = n;
  }
}
function Pa(e, t) {
  const n = e[mt],
    r = n.indexOf(t);
  n.splice(r, 1);
}
function $o(e, t) {
  if (yt(t)) return;
  const n = t[k];
  n.destroyNode && Uo(e, t, n, 3, null, null), Hm(t);
}
function Ps(e, t) {
  if (yt(t)) return;
  const n = g(null);
  try {
    (t[E] &= -129), (t[E] |= 256), t[te] && it(t[te]), Um(e, t), $m(e, t), t[y].type === 1 && t[k].destroy();
    const r = t[We];
    if (r !== null && le(t[V])) {
      r !== t[V] && Pa(r, t);
      const o = t[De];
      o?.detachView(e);
    }
    zs(t);
  } finally {
    g(n);
  }
}
function su(e, t, n, r) {
  const o = e?.[gt];
  if (o == null || o.leave == null || !o.leave.has(t.index)) return r(!1);
  e && Rn.add(e[Oe]),
    Cd(
      n,
      () => {
        if (o.leave?.has(t.index)) {
          const s = o.leave.get(t.index),
            a = [];
          if (s) {
            for (let c = 0; c < s.animateFns.length; c++) {
              const l = s.animateFns[c],
                { promise: u } = l();
              a.push(u);
            }
            o.detachedLeaveAnimationFns = void 0;
          }
          (o.running = Promise.allSettled(a)), Bm(e, r);
        } else e && Rn.delete(e[Oe]), r(!1);
      },
      o,
    );
}
function Bm(e, t) {
  const n = e[gt]?.running;
  if (n) {
    n.then(() => {
      (e[gt].running = void 0), Rn.delete(e[Oe]), t(!0);
    });
    return;
  }
  t(!1);
}
function $m(e, t) {
  const n = e.cleanup,
    r = t[jt];
  if (n !== null)
    for (let s = 0; s < n.length - 1; s += 2)
      if (typeof n[s] === 'string') {
        const a = n[s + 3];
        a >= 0 ? r[a]() : r[-a].unsubscribe(), (s += 2);
      } else {
        const a = r[n[s + 1]];
        n[s].call(a);
      }
  r !== null && (t[jt] = null);
  const o = t[Ne];
  if (o !== null) {
    t[Ne] = null;
    for (let s = 0; s < o.length; s++) {
      const a = o[s];
      a();
    }
  }
  const i = t[$e];
  if (i !== null) {
    t[$e] = null;
    for (const s of i) s.destroy();
  }
}
function Um(e, t) {
  let n;
  if (e != null && (n = e.destroyHooks) != null)
    for (let r = 0; r < n.length; r += 2) {
      const o = t[n[r]];
      if (!(o instanceof Dt)) {
        const i = n[r + 1];
        if (Array.isArray(i))
          for (let s = 0; s < i.length; s += 2) {
            const a = o[i[s]],
              c = i[s + 1];
            A(_.LifecycleHookStart, a, c);
            try {
              c.call(a);
            } finally {
              A(_.LifecycleHookEnd, a, c);
            }
          }
        else {
          A(_.LifecycleHookStart, o, i);
          try {
            i.call(o);
          } finally {
            A(_.LifecycleHookEnd, o, i);
          }
        }
      }
    }
}
function Td(e, t, n) {
  return qm(e, t.parent, n);
}
function qm(e, t, n) {
  let r = t;
  for (; r !== null && r.type & 168; ) (t = r), (r = t.parent);
  if (r === null) return n[ce];
  if (ze(r)) {
    const { encapsulation: o } = e.data[r.directiveStart + r.componentOffset];
    if (o === Ct.None || o === Ct.Emulated) return null;
  }
  return ue(r, n);
}
function wd(e, t, n) {
  return Gm(e, t, n);
}
function Wm(e, _t, n) {
  return e.type & 40 ? ue(e, n) : null;
}
var Gm = Wm,
  au;
function La(e, t, n, r) {
  const o = Td(e, r, t),
    i = t[k],
    s = r.parent || t[K],
    a = wd(s, r, t);
  if (o != null)
    if (Array.isArray(n)) for (let c = 0; c < n.length; c++) nu(i, o, n[c], a, !1);
    else nu(i, o, n, a, !1);
  au !== void 0 && au(i, r, t, n, o);
}
function Sn(e, t) {
  if (t !== null) {
    const n = t.type;
    if (n & 3) return ue(t, e);
    if (n & 4) return ia(-1, e[t.index]);
    if (n & 8) {
      const r = t.child;
      if (r !== null) return Sn(e, r);
      {
        const o = e[t.index];
        return le(o) ? ia(-1, o) : ie(o);
      }
    } else {
      if (n & 128) return Sn(e, t.next);
      if (n & 32) return ka(t, e)() || ie(e[t.index]);
      {
        const r = Md(e, t);
        if (r !== null) {
          if (Array.isArray(r)) return r[0];
          const o = Ue(e[J]);
          return Sn(o, r);
        } else return Sn(e, t.next);
      }
    }
  }
  return null;
}
function Md(e, t) {
  if (t !== null) {
    const r = e[J][K],
      o = t.projection;
    return r.projection[o];
  }
  return null;
}
function ia(e, t) {
  const n = F + e + 1;
  if (n < t.length) {
    const r = t[n],
      o = r[y].firstChild;
    if (o !== null) return Sn(r, o);
  }
  return t[Ge];
}
function Fa(e, t, n, r, o, i, s) {
  for (; n != null; ) {
    const a = r[ke];
    if (n.type === 128) {
      n = n.next;
      continue;
    }
    const c = r[n.index],
      l = n.type;
    if ((s && t === 0 && (c && Gt(ie(c), r), (n.flags |= 2)), !Fo(n)))
      if (l & 8) Fa(e, t, n.child, r, o, i, !1), Ut(t, e, a, o, c, n, i, r);
      else if (l & 32) {
        let u = ka(n, r),
          d;
        for (; (d = u()); ) Ut(t, e, a, o, d, n, i, r);
        Ut(t, e, a, o, c, n, i, r);
      } else l & 16 ? _d(e, t, r, n, o, i) : Ut(t, e, a, o, c, n, i, r);
    n = s ? n.projectionNext : n.next;
  }
}
function Uo(e, t, n, r, o, i) {
  Fa(n, r, e.firstChild, t, o, i, !1);
}
function zm(e, t, n) {
  const r = t[k],
    o = Td(e, n, t),
    i = n.parent || t[K],
    s = wd(i, n, t);
  _d(r, 0, t, n, o, s);
}
function _d(e, t, n, r, o, i) {
  const s = n[J],
    c = s[K].projection[r.projection];
  if (Array.isArray(c))
    for (let l = 0; l < c.length; l++) {
      const u = c[l];
      Ut(t, e, n[ke], o, u, r, i, n);
    }
  else {
    const l = c,
      u = s[V];
    Vu(r) && (l.flags |= 128), Fa(e, t, l, u, o, i, !0);
  }
}
function Qm(e, t, n, r, o, i, s) {
  const a = r[Ge],
    c = ie(r);
  a !== c && Ut(t, e, n, i, a, o, s);
  for (let l = F; l < r.length; l++) {
    const u = r[l];
    Uo(u[y], u, e, t, i, a);
  }
}
function Zm(e, t, n, r, o) {
  if (t) o ? e.addClass(n, r) : e.removeClass(n, r);
  else {
    let i = r.indexOf('-') === -1 ? void 0 : To.DashCase;
    o == null
      ? e.removeStyle(n, r, i)
      : (typeof o === 'string' && o.endsWith('!important') && ((o = o.slice(0, -10)), (i |= To.Important)),
        e.setStyle(n, r, o, i));
  }
}
function Nd(e, t, n, r, o) {
  const i = de(),
    s = r & 2;
  try {
    Ze(-1), s && t.length > O && vd(e, t, O, !1);
    const a = s ? _.TemplateUpdateStart : _.TemplateCreateStart;
    A(a, o, n), n(r, o);
  } finally {
    Ze(i);
    const a = s ? _.TemplateUpdateEnd : _.TemplateCreateEnd;
    A(a, o, n);
  }
}
function Sd(e, t, n) {
  ty(e, t, n), (n.flags & 64) === 64 && ny(e, t, n);
}
function ja(e, t, n = ue) {
  const r = t.localNames;
  if (r !== null) {
    let o = t.index + 1;
    for (let i = 0; i < r.length; i += 2) {
      const s = r[i + 1],
        a = s === -1 ? n(t, e) : e[s];
      e[o++] = a;
    }
  }
}
function Ym(e, t, n, r) {
  const i = r.get(Zu, Qu) || n === Ct.ShadowDom || n === Ct.ExperimentalIsolatedShadowDom,
    s = e.selectRootElement(t, i);
  return Km(s), s;
}
function Km(e) {
  Jm(e);
}
var Jm = () => null;
function Xm(e) {
  return e === 'class'
    ? 'className'
    : e === 'for'
      ? 'htmlFor'
      : e === 'formaction'
        ? 'formAction'
        : e === 'innerHtml'
          ? 'innerHTML'
          : e === 'readonly'
            ? 'readOnly'
            : e === 'tabindex'
              ? 'tabIndex'
              : e;
}
function xd(e, t, n, r, o, i) {
  const s = t[y];
  if (Va(e, s, t, n, r)) {
    ze(e) && ey(t, e.index);
    return;
  }
  e.type & 3 && (n = Xm(n)), Ad(e, t, n, r, o, i);
}
function Ad(e, t, n, r, o, i) {
  if (e.type & 3) {
    const s = ue(e, t);
    (r = i != null ? i(r, e.value || '', n) : r), o.setProperty(s, n, r);
  } else e.type & 12;
}
function ey(e, t) {
  const n = se(t, e);
  n[E] & 16 || (n[E] |= 64);
}
function ty(e, t, n) {
  const r = n.directiveStart,
    o = n.directiveEnd;
  ze(n) && xm(t, n, e.data[r + n.componentOffset]), e.firstCreatePass || Do(n, t);
  const i = n.initialInputs;
  for (let s = r; s < o; s++) {
    const a = e.data[s],
      c = An(t, e, s, n);
    if ((Gt(c, t), i !== null && ay(t, s - r, c, a, n, i), be(a))) {
      const l = se(n.index, t);
      l[j] = An(t, e, s, n);
    }
  }
}
function ny(e, t, n) {
  const r = n.directiveStart,
    o = n.directiveEnd,
    i = n.index,
    s = Ml();
  try {
    Ze(i);
    for (let a = r; a < o; a++) {
      const c = e.data[a],
        l = t[a];
      Jr(a), (c.hostBindings !== null || c.hostVars !== 0 || c.hostAttrs !== null) && ry(c, l);
    }
  } finally {
    Ze(-1), Jr(s);
  }
}
function ry(e, t) {
  e.hostBindings?.(1, t);
}
function oy(e, t) {
  let n = e.directiveRegistry,
    r = null;
  if (n)
    for (let o = 0; o < n.length; o++) {
      const i = n[o];
      gd(t, i.selectors, !1) && ((r ??= []), be(i) ? r.unshift(i) : r.push(i));
    }
  return r;
}
function iy(e, t, n, r, o, i) {
  const s = ue(e, t);
  sy(t[k], s, i, e.value, n, r, o);
}
function sy(e, t, n, r, o, i, s) {
  if (i == null) e.removeAttribute(t, o, n);
  else {
    const a = s == null ? Ee(i) : s(i, r || '', o);
    e.setAttribute(t, o, a, n);
  }
}
function ay(_e, t, n, r, _o, i) {
  const s = i[t];
  if (s !== null)
    for (let a = 0; a < s.length; a += 2) {
      const c = s[a],
        l = s[a + 1];
      oa(r, n, c, l);
    }
}
function Rd(e, t, n, r, o) {
  const i = O + n,
    s = t[y],
    a = o(s, t, e, r, n);
  (t[i] = a), Bt(e, !0);
  const c = e.type === 2;
  return (
    c ? (ud(t[k], a, e), (ml() === 0 || Zr(e)) && Gt(a, t), yl()) : Gt(a, t),
    no() && (!c || !Fo(e)) && La(s, t, a, e),
    e
  );
}
function kd(e) {
  let t = e;
  return Es() ? Is() : ((t = t.parent), Bt(t, !1)), t;
}
function cy(e, t) {
  const n = e[ke];
  if (!n) return;
  let r;
  try {
    r = n.get(Ye, null);
  } catch {
    r = null;
  }
  r?.(t);
}
function Va(e, t, n, r, o) {
  let i = e.inputs?.[r],
    s = e.hostDirectiveInputs?.[r],
    a = !1;
  if (s)
    for (let c = 0; c < s.length; c += 2) {
      const l = s[c],
        u = s[c + 1],
        d = t.data[l];
      oa(d, n[l], u, o), (a = !0);
    }
  if (i)
    for (const c of i) {
      const l = n[c],
        u = t.data[c];
      oa(u, l, r, o), (a = !0);
    }
  return a;
}
function ly(e, t) {
  const n = se(t, e),
    r = n[y];
  uy(r, n);
  const o = n[ce];
  o !== null && n[dt] === null && (n[dt] = Yu(o, n[ke])), A(_.ComponentStart);
  try {
    Ha(r, n, n[j]);
  } finally {
    A(_.ComponentEnd, n[j]);
  }
}
function uy(e, t) {
  for (let n = t.length; n < e.blueprint.length; n++) t.push(e.blueprint[n]);
}
function Ha(e, t, n) {
  eo(t);
  try {
    const r = e.viewQuery;
    r !== null && Zs(1, r, n);
    const o = e.template;
    o !== null && Nd(e, t, o, 1, n),
      e.firstCreatePass && (e.firstCreatePass = !1),
      t[De]?.finishViewCreation(e),
      e.staticContentQueries && Ku(e, t),
      e.staticViewQueries && Zs(2, e.viewQuery, n);
    const i = e.components;
    i !== null && dy(t, i);
  } catch (r) {
    throw (e.firstCreatePass && ((e.incompleteFirstPass = !0), (e.firstCreatePass = !1)), r);
  } finally {
    (t[E] &= -5), to();
  }
}
function dy(e, t) {
  for (let n = 0; n < t.length; n++) ly(e, t[n]);
}
function Wn(e, t, n, r) {
  const o = g(null);
  try {
    const i = t.tView,
      a = e[E] & 4096 ? 4096 : 16,
      c = Aa(
        e,
        i,
        n,
        a,
        null,
        t,
        null,
        null,
        r?.injector ?? null,
        r?.embeddedViewInjector ?? null,
        r?.dehydratedView ?? null,
      ),
      l = e[t.index];
    c[We] = l;
    const u = e[De];
    return u !== null && (c[De] = u.createEmbeddedView(i)), Ha(i, c, n), c;
  } finally {
    g(o);
  }
}
function zt(e, t) {
  return !t || t.firstChild === null || Vu(e);
}
function kn(e, t, n, r, o = !1) {
  for (; n !== null; ) {
    if (n.type === 128) {
      n = o ? n.projectionNext : n.next;
      continue;
    }
    const i = t[n.index];
    i !== null && r.push(ie(i)), le(i) && Od(i, r);
    const s = n.type;
    if (s & 8) kn(e, t, n.child, r);
    else if (s & 32) {
      let a = ka(n, t),
        c;
      for (; (c = a()); ) r.push(c);
    } else if (s & 16) {
      const a = Md(t, n);
      if (Array.isArray(a)) r.push(...a);
      else {
        const c = Ue(t[J]);
        kn(c[y], c, a, r, !0);
      }
    }
    n = o ? n.projectionNext : n.next;
  }
  return r;
}
function Od(e, t) {
  for (let n = F; n < e.length; n++) {
    const r = e[n],
      o = r[y].firstChild;
    o !== null && kn(r[y], r, o, t);
  }
  e[Ge] !== e[ce] && t.push(e[Ge]);
}
function Pd(e) {
  if (e[ht] !== null) {
    for (const t of e[ht]) t.impl.addSequence(t);
    e[ht].length = 0;
  }
}
var Ld = [];
function fy(e) {
  return e[te] ?? py(e);
}
function py(e) {
  const t = Ld.pop() ?? Object.create(gy);
  return (t.lView = e), t;
}
function hy(e) {
  e.lView[te] !== e && ((e.lView = null), Ld.push(e));
}
var gy = Z(Q({}, At), {
  consumerIsAlwaysLive: !0,
  kind: 'template',
  consumerMarkedDirty: (e) => {
    vt(e.lView);
  },
  consumerOnSignalRead() {
    this.lView[te] = this;
  },
});
function my(e) {
  const t = e[te] ?? Object.create(yy);
  return (t.lView = e), t;
}
var yy = Z(Q({}, At), {
  consumerIsAlwaysLive: !0,
  kind: 'template',
  consumerMarkedDirty: (e) => {
    let t = Ue(e.lView);
    for (; t && !Fd(t[y]); ) t = Ue(t);
    t && us(t);
  },
  consumerOnSignalRead() {
    this.lView[te] = this;
  },
});
function Fd(e) {
  return e.type !== 2;
}
function jd(e) {
  if (e[$e] === null) return;
  let t = !0;
  for (; t; ) {
    let n = !1;
    for (const r of e[$e])
      r.dirty && ((n = !0), r.zone === null || Zone.current === r.zone ? r.run() : r.zone.run(() => r.run()));
    t = n && !!(e[E] & 8192);
  }
}
var vy = 100;
function Vd(e, t = 0) {
  const r = e[Ie].rendererFactory,
    o = !1;
  o || r.begin?.();
  try {
    Ey(e, t);
  } finally {
    o || r.end?.();
  }
}
function Ey(e, t) {
  const n = Ds();
  try {
    fn(!0), sa(e, t);
    let r = 0;
    for (; Cn(e); ) {
      if (r === vy) throw new b(103, !1);
      r++, sa(e, 1);
    }
  } finally {
    fn(n);
  }
}
function Iy(e, t, n, r) {
  if (yt(t)) return;
  const o = t[E],
    i = !1,
    s = !1;
  eo(t);
  let a = !0,
    c = null,
    l = null;
  i ||
    (Fd(e)
      ? ((l = fy(t)), (c = Rt(l)))
      : Nr() === null
        ? ((a = !1), (l = my(t)), (c = Rt(l)))
        : t[te] && (it(t[te]), (t[te] = null)));
  try {
    ls(t), bl(e.bindingStartIndex), n !== null && Nd(e, t, n, 2, r);
    const u = (o & 3) === 3;
    if (!i)
      if (u) {
        const f = e.preOrderCheckHooks;
        f !== null && fo(t, f, null);
      } else {
        const f = e.preOrderHooks;
        f !== null && po(t, f, 0, null), ks(t, 0);
      }
    if ((s || Dy(t), jd(t), Hd(t, 0), e.contentQueries !== null && Ku(e, t), !i))
      if (u) {
        const f = e.contentCheckHooks;
        f !== null && fo(t, f);
      } else {
        const f = e.contentHooks;
        f !== null && po(t, f, 1), ks(t, 1);
      }
    by(e, t);
    const d = e.components;
    d !== null && $d(t, d, 0);
    const p = e.viewQuery;
    if ((p !== null && Zs(2, p, r), !i))
      if (u) {
        const f = e.viewCheckHooks;
        f !== null && fo(t, f);
      } else {
        const f = e.viewHooks;
        f !== null && po(t, f, 2), ks(t, 2);
      }
    if ((e.firstUpdatePass === !0 && (e.firstUpdatePass = !1), t[Qr])) {
      for (const f of t[Qr]) f();
      t[Qr] = null;
    }
    i || (Pd(t), (t[E] &= -73));
  } catch (u) {
    throw (i || vt(t), u);
  } finally {
    l !== null && (on(l, c), a && hy(l)), to();
  }
}
function Hd(e, t) {
  for (let n = Bu(e); n !== null; n = $u(n))
    for (let r = F; r < n.length; r++) {
      const o = n[r];
      Bd(o, t);
    }
}
function Dy(e) {
  for (let t = Bu(e); t !== null; t = $u(t)) {
    if (!(t[E] & 2)) continue;
    const n = t[mt];
    for (let r = 0; r < n.length; r++) {
      const o = n[r];
      us(o);
    }
  }
}
function Cy(e, t, n) {
  A(_.ComponentStart);
  const r = se(t, e);
  try {
    Bd(r, n);
  } finally {
    A(_.ComponentEnd, r[j]);
  }
}
function Bd(e, t) {
  Yr(e) && sa(e, t);
}
function sa(e, t) {
  let r = e[y],
    o = e[E],
    i = e[te],
    s = !!(t === 0 && o & 16);
  if (
    ((s ||= !!(o & 64 && t === 0)),
    (s ||= !!(o & 1024)),
    (s ||= !!(i?.dirty && sn(i))),
    (s ||= !1),
    i && (i.dirty = !1),
    (e[E] &= -9217),
    s)
  )
    Iy(r, e, r.template, e[j]);
  else if (o & 8192) {
    const a = g(null);
    try {
      jd(e), Hd(e, 1);
      const c = r.components;
      c !== null && $d(e, c, 1), Pd(e);
    } finally {
      g(a);
    }
  }
}
function $d(e, t, n) {
  for (let r = 0; r < t.length; r++) Cy(e, t[r], n);
}
function by(e, t) {
  const n = e.hostBindingOpCodes;
  if (n !== null)
    try {
      for (let r = 0; r < n.length; r++) {
        const o = n[r];
        if (o < 0) Ze(~o);
        else {
          const i = o,
            s = n[++r],
            a = n[++r];
          wl(s, i);
          const c = t[i];
          A(_.HostBindingsUpdateStart, c);
          try {
            a(2, c);
          } finally {
            A(_.HostBindingsUpdateEnd, c);
          }
        }
      }
    } finally {
      Ze(-1);
    }
}
function Ba(e, t) {
  const n = Ds() ? 64 : 1088;
  for (e[Ie].changeDetectionScheduler?.notify(t); e; ) {
    e[E] |= n;
    const r = Ue(e);
    if (Ht(e) && !r) return e;
    e = r;
  }
  return null;
}
function Ud(e, t, n, r) {
  return [e, !0, 0, t, null, r, null, n, null, null];
}
function qd(e, t) {
  const n = F + t;
  if (n < e.length) return e[n];
}
function Gn(e, t, n, r = !0) {
  const o = t[y];
  if ((Ty(o, t, e, n), r)) {
    const s = ia(n, e),
      a = t[k],
      c = a.parentNode(e[Ge]);
    c !== null && Vm(o, e[K], a, t, c, s);
  }
  const i = t[dt];
  i !== null && i.firstChild !== null && (i.firstChild = null);
}
function Wd(e, t) {
  const n = On(e, t);
  return n !== void 0 && $o(n[y], n), n;
}
function On(e, t) {
  if (e.length <= F) return;
  const n = F + t,
    r = e[n];
  if (r) {
    const o = r[We];
    o !== null && o !== e && Pa(o, r), t > 0 && (e[n - 1][oe] = r[oe]);
    const i = yn(e, F + t);
    jm(r[y], r);
    const s = i[De];
    s?.detachView(i[y]), (r[V] = null), (r[oe] = null), (r[E] &= -129);
  }
  return r;
}
function Ty(e, t, n, r) {
  const o = F + r,
    i = n.length;
  r > 0 && (n[o - 1][oe] = t), r < i - F ? ((t[oe] = n[o]), Zi(n, F + r, t)) : (n.push(t), (t[oe] = null)), (t[V] = n);
  const s = t[We];
  s !== null && n !== s && Gd(s, t);
  const a = t[De];
  a?.insertView(e), Kr(t), (t[E] |= 128);
}
function Gd(e, t) {
  const n = e[mt],
    r = t[V];
  if (Ce(r)) e[E] |= 2;
  else {
    const o = r[V][J];
    t[J] !== o && (e[E] |= 2);
  }
  n === null ? (e[mt] = [t]) : n.push(t);
}
var Ke = class {
  _lView;
  _cdRefInjectingView;
  _appRef = null;
  _attachedToViewContainer = !1;
  exhaustive;
  get rootNodes() {
    const t = this._lView,
      n = t[y];
    return kn(n, t, n.firstChild, []);
  }
  constructor(t, n) {
    (this._lView = t), (this._cdRefInjectingView = n);
  }
  get context() {
    return this._lView[j];
  }
  set context(t) {
    this._lView[j] = t;
  }
  get destroyed() {
    return yt(this._lView);
  }
  destroy() {
    if (this._appRef) this._appRef.detachView(this);
    else if (this._attachedToViewContainer) {
      const t = this._lView[V];
      if (le(t)) {
        const n = t[En],
          r = n ? n.indexOf(this) : -1;
        r > -1 && (On(t, r), yn(n, r));
      }
      this._attachedToViewContainer = !1;
    }
    $o(this._lView[y], this._lView);
  }
  onDestroy(t) {
    ds(this._lView, t);
  }
  markForCheck() {
    Ba(this._cdRefInjectingView || this._lView, 4);
  }
  detach() {
    this._lView[E] &= -129;
  }
  reattach() {
    Kr(this._lView), (this._lView[E] |= 128);
  }
  detectChanges() {
    (this._lView[E] |= 1024), Vd(this._lView);
  }
  checkNoChanges() {}
  attachToViewContainerRef() {
    if (this._appRef) throw new b(902, !1);
    this._attachedToViewContainer = !0;
  }
  detachFromAppRef() {
    this._appRef = null;
    const t = Ht(this._lView),
      n = this._lView[We];
    n !== null && !t && Pa(n, this._lView), bd(this._lView[y], this._lView);
  }
  attachToAppRef(t) {
    if (this._attachedToViewContainer) throw new b(902, !1);
    this._appRef = t;
    const n = Ht(this._lView),
      r = this._lView[We];
    r !== null && !n && Gd(r, this._lView), Kr(this._lView);
  }
};
var Pn = (() => {
  class e {
    _declarationLView;
    _declarationTContainer;
    elementRef;
    static __NG_ELEMENT_ID__ = wy;
    constructor(n, r, o) {
      (this._declarationLView = n), (this._declarationTContainer = r), (this.elementRef = o);
    }
    get ssrId() {
      return this._declarationTContainer.tView?.ssrId || null;
    }
    createEmbeddedView(n, r) {
      return this.createEmbeddedViewImpl(n, r);
    }
    createEmbeddedViewImpl(n, r, o) {
      const i = Wn(this._declarationLView, this._declarationTContainer, n, {
        embeddedViewInjector: r,
        dehydratedView: o,
      });
      return new Ke(i);
    }
  }
  return e;
})();
function wy() {
  return $a(H(), m());
}
function $a(e, t) {
  return e.type & 4 ? new Pn(t, e, Yt(e, t)) : null;
}
function zn(e, t, n, r, o) {
  let i = e.data[t];
  if (i === null) (i = My(e, t, n, r, o)), Tl() && (i.flags |= 32);
  else if (i.type & 64) {
    (i.type = n), (i.value = r), (i.attrs = o);
    const s = Dl();
    i.injectorIndex = s === null ? -1 : s.injectorIndex;
  }
  return Bt(i, !0), i;
}
function My(e, t, n, r, o) {
  const i = vs(),
    s = Es(),
    a = s ? i : i?.parent,
    c = (e.data[t] = Ny(e, a, n, t, r, o));
  return _y(e, c, i, s), c;
}
function _y(e, t, n, r) {
  e.firstChild === null && (e.firstChild = t),
    n !== null &&
      (r ? n.child == null && t.parent !== null && (n.child = t) : n.next === null && ((n.next = t), (t.prev = n)));
}
function Ny(_e, t, n, r, o, i) {
  let s = t ? t.injectorIndex : -1,
    a = 0;
  return (
    gs() && (a |= 128),
    {
      type: n,
      index: r,
      insertBeforeIndex: null,
      injectorIndex: s,
      directiveStart: -1,
      directiveEnd: -1,
      directiveStylingLast: -1,
      componentOffset: -1,
      fieldIndex: -1,
      customControlIndex: -1,
      propertyBindings: null,
      flags: a,
      providerIndexes: 0,
      value: o,
      attrs: i,
      mergedAttrs: null,
      localNames: null,
      initialInputs: null,
      inputs: null,
      hostDirectiveInputs: null,
      outputs: null,
      hostDirectiveOutputs: null,
      directiveToIndex: null,
      tView: null,
      next: null,
      prev: null,
      projectionNext: null,
      child: null,
      parent: t,
      projection: null,
      styles: null,
      stylesWithoutHost: null,
      residualStyles: void 0,
      classes: null,
      classesWithoutHost: null,
      residualClasses: void 0,
      classBindings: 0,
      styleBindings: 0,
    }
  );
}
function Sy(e) {
  const t = e[os] ?? [],
    r = e[V][k],
    o = [];
  for (const i of t) i.data[zu] !== void 0 ? o.push(i) : xy(i, r);
  e[os] = o;
}
function xy(e, t) {
  let n = 0,
    r = e.firstChild;
  if (r) {
    const o = e.data[Gu];
    for (; n < o; ) {
      const i = r.nextSibling;
      ld(t, r, !1), (r = i), n++;
    }
  }
}
var Ay = () => null,
  Ry = () => null;
function Mo(e, t) {
  return Ay(e, t);
}
function zd(e, t, n) {
  return Ry(e, t, n);
}
var Qd = class {},
  qo = class {},
  aa = class {
    resolveComponentFactory(_t) {
      throw new b(917, !1);
    }
  },
  Qn = class {
    static NULL = new aa();
  },
  Ln = class {},
  ky = (() => {
    class e {
      destroyNode = null;
      static __NG_ELEMENT_ID__ = () => Oy();
    }
    return e;
  })();
function Oy() {
  const e = m(),
    t = H(),
    n = se(t.index, e);
  return (Ce(n) ? n : e)[k];
}
var Zd = (() => {
  class e {
    static \u0275prov = z({ token: e, providedIn: 'root', factory: () => null });
  }
  return e;
})();
var go = {},
  ca = class {
    injector;
    parentInjector;
    constructor(t, n) {
      (this.injector = t), (this.parentInjector = n);
    }
    get(t, n, r) {
      const o = this.injector.get(t, go, r);
      return o !== go || n === go ? o : this.parentInjector.get(t, n, r);
    }
  };
function _o(e, t, n) {
  let r = n ? e.styles : null,
    o = n ? e.classes : null,
    i = 0;
  if (t !== null)
    for (let s = 0; s < t.length; s++) {
      const a = t[s];
      if (typeof a === 'number') i = a;
      else if (i === 1) o = jr(o, a);
      else if (i === 2) {
        const c = a,
          l = t[++s];
        r = jr(r, `${c}: ${l};`);
      }
    }
  n ? (e.styles = r) : (e.stylesWithoutHost = r), n ? (e.classes = o) : (e.classesWithoutHost = o);
}
function Zn(e, t = 0) {
  const n = m();
  if (n === null) return ge(e, t);
  const r = H();
  return Ou(r, n, U(e), t);
}
function Py() {
  const e = 'invalid';
  throw new Error(e);
}
function Ly(e, t, n, r, o) {
  const i = r === null ? null : { '': -1 },
    s = o(e, n);
  if (s !== null) {
    let a = s,
      c = null,
      l = null;
    for (const u of s)
      if (u.resolveHostDirectives !== null) {
        [a, c, l] = u.resolveHostDirectives(s);
        break;
      }
    Vy(e, t, n, a, i, c, l);
  }
  i !== null && r !== null && Fy(n, r, i);
}
function Fy(e, t, n) {
  const r = (e.localNames = []);
  for (let o = 0; o < t.length; o += 2) {
    const i = n[t[o + 1]];
    if (i == null) throw new b(-301, !1);
    r.push(t[o], i);
  }
}
function jy(e, t, n) {
  (t.componentOffset = n), (e.components ??= []).push(t.index);
}
function Vy(e, t, n, r, o, i, s) {
  let a = r.length,
    c = null;
  for (let p = 0; p < a; p++) {
    const f = r[p];
    c === null && be(f) && ((c = f), jy(e, n, p)), Ws(Do(n, t), e, f.type);
  }
  Wy(n, e.data.length, a), c?.viewProvidersResolver?.(c);
  for (let p = 0; p < a; p++) {
    const f = r[p];
    f.providersResolver?.(f);
  }
  let l = !1,
    u = !1,
    d = yd(e, t, a, null);
  a > 0 && (n.directiveToIndex = new Map());
  for (let p = 0; p < a; p++) {
    const f = r[p];
    if (((n.mergedAttrs = Wt(n.mergedAttrs, f.hostAttrs)), By(e, n, t, d, f), qy(d, f, o), s?.has(f))) {
      const [v, S] = s.get(f);
      n.directiveToIndex.set(f.type, [d, v + n.directiveStart, S + n.directiveStart]);
    } else (i === null || !i.has(f)) && n.directiveToIndex.set(f.type, d);
    f.contentQueries !== null && (n.flags |= 4),
      (f.hostBindings !== null || f.hostAttrs !== null || f.hostVars !== 0) && (n.flags |= 64);
    const h = f.type.prototype;
    !l && (h.ngOnChanges || h.ngOnInit || h.ngDoCheck) && ((e.preOrderHooks ??= []).push(n.index), (l = !0)),
      !u && (h.ngOnChanges || h.ngDoCheck) && ((e.preOrderCheckHooks ??= []).push(n.index), (u = !0)),
      d++;
  }
  Hy(e, n, i);
}
function Hy(e, t, n) {
  for (let r = t.directiveStart; r < t.directiveEnd; r++) {
    const o = e.data[r];
    if (n === null || !n.has(o)) cu(0, t, o, r), cu(1, t, o, r), uu(t, r, !1);
    else {
      const i = n.get(o);
      lu(0, t, i, r), lu(1, t, i, r), uu(t, r, !0);
    }
  }
}
function cu(e, t, n, r) {
  const o = e === 0 ? n.inputs : n.outputs;
  for (const i in o)
    if (Object.hasOwn(o, i)) {
      let s;
      e === 0 ? (s = t.inputs ??= {}) : (s = t.outputs ??= {}), (s[i] ??= []), s[i].push(r), Yd(t, i);
    }
}
function lu(e, t, n, r) {
  const o = e === 0 ? n.inputs : n.outputs;
  for (const i in o)
    if (Object.hasOwn(o, i)) {
      let s = o[i],
        a;
      e === 0 ? (a = t.hostDirectiveInputs ??= {}) : (a = t.hostDirectiveOutputs ??= {}),
        (a[s] ??= []),
        a[s].push(r, i),
        Yd(t, s);
    }
}
function Yd(e, t) {
  t === 'class' ? (e.flags |= 8) : t === 'style' && (e.flags |= 16);
}
function uu(e, t, n) {
  const { attrs: r, inputs: o, hostDirectiveInputs: i } = e;
  if (r === null || (!n && o === null) || (n && i === null) || Sa(e)) {
    (e.initialInputs ??= []), e.initialInputs.push(null);
    return;
  }
  let s = null,
    a = 0;
  for (; a < r.length; ) {
    const c = r[a];
    if (c === 0) {
      a += 4;
      continue;
    } else if (c === 5) {
      a += 2;
      continue;
    } else if (typeof c === 'number') break;
    if (!n && Object.hasOwn(o, c)) {
      const l = o[c];
      for (const u of l)
        if (u === t) {
          (s ??= []), s.push(c, r[a + 1]);
          break;
        }
    } else if (n && Object.hasOwn(i, c)) {
      const l = i[c];
      for (let u = 0; u < l.length; u += 2)
        if (l[u] === t) {
          (s ??= []), s.push(l[u + 1], r[a + 1]);
          break;
        }
    }
    a += 2;
  }
  (e.initialInputs ??= []), e.initialInputs.push(s);
}
function By(e, t, n, r, o) {
  e.data[r] = o;
  const i = o.factory || (o.factory = Be(o.type, !0)),
    s = new Dt(i, be(o), Zn, null);
  (e.blueprint[r] = s), (n[r] = s), $y(e, t, r, yd(e, n, o.hostVars, q), o);
}
function $y(e, t, n, r, o) {
  const i = o.hostBindings;
  if (i) {
    let s = e.hostBindingOpCodes;
    s === null && (s = e.hostBindingOpCodes = []);
    const a = ~t.index;
    Uy(s) !== a && s.push(a), s.push(n, r, i);
  }
}
function Uy(e) {
  let t = e.length;
  for (; t > 0; ) {
    const n = e[--t];
    if (typeof n === 'number' && n < 0) return n;
  }
  return 0;
}
function qy(e, t, n) {
  if (n) {
    if (t.exportAs) for (let r = 0; r < t.exportAs.length; r++) n[t.exportAs[r]] = e;
    be(t) && (n[''] = e);
  }
}
function Wy(e, t, n) {
  (e.flags |= 1), (e.directiveStart = t), (e.directiveEnd = t + n), (e.providerIndexes = t);
}
function Kd(e, t, n, r, o, i, s, a) {
  const c = t[y],
    l = c.consts,
    u = Te(l, s),
    d = zn(c, e, n, r, u);
  return (
    i && Ly(c, t, d, Te(l, a), o),
    (d.mergedAttrs = Wt(d.mergedAttrs, d.attrs)),
    d.attrs !== null && _o(d, d.attrs, !1),
    d.mergedAttrs !== null && _o(d, d.mergedAttrs, !0),
    c.queries?.elementStart(c, d),
    d
  );
}
function Jd(e, t) {
  cg(e, t), is(t) && e.queries.elementEnd(t);
}
function Gy(e, t, n, r, o, i) {
  const s = t.consts,
    a = Te(s, o),
    c = zn(t, e, n, r, a);
  if (((c.mergedAttrs = Wt(c.mergedAttrs, c.attrs)), i != null)) {
    const l = Te(s, i);
    c.localNames = [];
    for (let u = 0; u < l.length; u += 2) c.localNames.push(l[u], -1);
  }
  return (
    c.attrs !== null && _o(c, c.attrs, !1),
    c.mergedAttrs !== null && _o(c, c.mergedAttrs, !0),
    t.queries?.elementStart(t, c),
    c
  );
}
function Wo(e, t, n) {
  return (e[t] = n);
}
function zy(e, t) {
  return e[t];
}
function ne(e, t, n) {
  if (n === q) return !1;
  const r = e[t];
  return Object.is(r, n) ? !1 : ((e[t] = n), !0);
}
function Ua(e, t, n, r) {
  const o = ne(e, t, n);
  return ne(e, t + 1, r) || o;
}
function Xd(e, t, n, r, o) {
  const i = Ua(e, t, n, r);
  return ne(e, t + 2, o) || i;
}
function mo(e, t, n) {
  return function r(o) {
    const i = ze(e) ? se(e.index, t) : t;
    Ba(i, 5);
    let s = t[j],
      a = du(t, s, n, o),
      c = r.__ngNextListenerFn__;
    for (; c; ) (a = du(t, s, c, o) && a), (c = c.__ngNextListenerFn__);
    return a;
  };
}
function du(e, t, n, r) {
  const o = g(null);
  try {
    return A(_.OutputStart, t, n), n(r) !== !1;
  } catch (i) {
    return cy(e, i), !1;
  } finally {
    A(_.OutputEnd, t, n), g(o);
  }
}
function ef(e, t, n, r, o, i, s, a) {
  let c = Zr(e),
    l = !1,
    u = null;
  if ((!r && c && (u = Zy(t, n, i, e.index)), u !== null)) {
    const d = u.__ngLastListenerFn__ || u;
    (d.__ngNextListenerFn__ = s), (u.__ngLastListenerFn__ = s), (l = !0);
  } else {
    const d = ue(e, n),
      p = r ? r(d) : d;
    Lg(n, p, i, a);
    const f = o.listen(p, i, a);
    if (!Qy(i)) {
      const h = r ? (v) => r(ie(v[e.index])) : e.index;
      tf(h, t, n, i, a, f, !1);
    }
  }
  return l;
}
function Qy(e) {
  return e.startsWith('animation') || e.startsWith('transition');
}
function Zy(e, t, n, r) {
  const o = e.cleanup;
  if (o != null)
    for (let i = 0; i < o.length - 1; i += 2) {
      const s = o[i];
      if (s === n && o[i + 1] === r) {
        const a = t[jt],
          c = o[i + 2];
        return a && a.length > c ? a[c] : null;
      }
      typeof s === 'string' && (i += 2);
    }
  return null;
}
function tf(e, t, n, r, o, i, s) {
  const a = t.firstCreatePass ? ps(t) : null,
    c = fs(n),
    l = c.length;
  c.push(o, i), a?.push(r, e, l, (l + 1) * (s ? -1 : 1));
}
function fu(e, t, n, r, o, i) {
  const s = t[n],
    a = t[y],
    l = a.data[n].outputs[r],
    d = s[l].subscribe(i);
  tf(e.index, a, t, o, i, d, !0);
}
var la = Symbol('BINDING');
var No = class extends Qn {
  ngModule;
  constructor(t) {
    super(), (this.ngModule = t);
  }
  resolveComponentFactory(t) {
    const n = Re(t);
    return new bt(n, this.ngModule);
  }
};
function Yy(e) {
  return Object.keys(e).map((t) => {
    const [n, r, o] = e[t],
      i = { propName: n, templateName: t, isSignal: (r & Ho.SignalBased) !== 0 };
    return o && (i.transform = o), i;
  });
}
function Ky(e) {
  return Object.keys(e).map((t) => ({ propName: e[t], templateName: t }));
}
function Jy(e, t, n) {
  let r = t instanceof re ? t : t?.injector;
  return r && e.getStandaloneInjector !== null && (r = e.getStandaloneInjector(r) || r), r ? new ca(n, r) : n;
}
function Xy(e) {
  const t = e.get(Ln, null);
  if (t === null) throw new b(407, !1);
  const n = e.get(Zd, null),
    r = e.get(Ae, null);
  return { rendererFactory: t, sanitizer: n, changeDetectionScheduler: r, ngReflect: !1 };
}
function ev(e, t) {
  const n = nf(e);
  return ad(t, n, n === 'svg' ? ss : n === 'math' ? ul : null);
}
function nf(e) {
  return (e.selectors[0][0] || 'div').toLowerCase();
}
var bt = class extends qo {
  componentDef;
  ngModule;
  selector;
  componentType;
  ngContentSelectors;
  isBoundToModule;
  cachedInputs = null;
  cachedOutputs = null;
  get inputs() {
    return (this.cachedInputs ??= Yy(this.componentDef.inputs)), this.cachedInputs;
  }
  get outputs() {
    return (this.cachedOutputs ??= Ky(this.componentDef.outputs)), this.cachedOutputs;
  }
  constructor(t, n) {
    super(),
      (this.componentDef = t),
      (this.ngModule = n),
      (this.componentType = t.type),
      (this.selector = Mm(t.selectors)),
      (this.ngContentSelectors = t.ngContentSelectors ?? []),
      (this.isBoundToModule = !!n);
  }
  create(t, n, r, o, i, s) {
    A(_.DynamicComponentStart);
    const a = g(null);
    try {
      const c = this.componentDef,
        l = tv(r, c, s, i),
        u = Jy(c, o || this.ngModule, t),
        d = Xy(u),
        p = d.rendererFactory.createRenderer(null, c),
        f = r ? Ym(p, r, c.encapsulation, u) : ev(c, p),
        h = s?.some(pu) || i?.some((T) => typeof T !== 'function' && T.bindings.some(pu)),
        v = Aa(null, l, null, 512 | md(c), null, null, d, p, u, null, Yu(f, u, !0));
      (v[O] = f), eo(v);
      let S = null;
      try {
        const T = Kd(O, v, 2, '#host', () => l.directiveRegistry, !0, 0);
        ud(p, f, T),
          Gt(f, v),
          Sd(l, v, T),
          Ju(l, T, v),
          Jd(l, T),
          n !== void 0 && rv(T, this.ngContentSelectors, n),
          (S = se(T.index, v)),
          (v[j] = S[j]),
          Ha(l, v, null);
      } catch (T) {
        throw (S !== null && zs(S), zs(v), T);
      } finally {
        A(_.DynamicComponentEnd), to();
      }
      return new So(this.componentType, v, !!h);
    } finally {
      g(a);
    }
  }
};
function tv(e, t, n, r) {
  let o = e ? ['ng-version', '21.1.2'] : _m(t.selectors[0]),
    i = null,
    s = null,
    a = 0;
  if (n)
    for (const u of n)
      (a += u[la].requiredVars),
        u.create && ((u.targetIdx = 0), (i ??= []).push(u)),
        u.update && ((u.targetIdx = 0), (s ??= []).push(u));
  if (r)
    for (let u = 0; u < r.length; u++) {
      const d = r[u];
      if (typeof d !== 'function')
        for (const p of d.bindings) {
          a += p[la].requiredVars;
          const f = u + 1;
          p.create && ((p.targetIdx = f), (i ??= []).push(p)), p.update && ((p.targetIdx = f), (s ??= []).push(p));
        }
    }
  const c = [t];
  if (r)
    for (const u of r) {
      const d = typeof u === 'function' ? u : u.type,
        p = Gi(d);
      c.push(p);
    }
  return xa(0, null, nv(i, s), 1, a, c, null, null, null, [o], null);
}
function nv(e, t) {
  return !e && !t
    ? null
    : (n) => {
        if (n & 1 && e) for (const r of e) r.create();
        if (n & 2 && t) for (const r of t) r.update();
      };
}
function pu(e) {
  const t = e[la].kind;
  return t === 'input' || t === 'twoWay';
}
var So = class extends Qd {
  _rootLView;
  _hasInputBindings;
  instance;
  hostView;
  changeDetectorRef;
  componentType;
  location;
  previousInputValues = null;
  _tNode;
  constructor(t, n, r) {
    super(),
      (this._rootLView = n),
      (this._hasInputBindings = r),
      (this._tNode = In(n[y], O)),
      (this.location = Yt(this._tNode, n)),
      (this.instance = se(this._tNode.index, n)[j]),
      (this.hostView = this.changeDetectorRef = new Ke(n, void 0)),
      (this.componentType = t);
  }
  setInput(t, n) {
    this._hasInputBindings;
    const r = this._tNode;
    if (
      ((this.previousInputValues ??= new Map()),
      this.previousInputValues.has(t) && Object.is(this.previousInputValues.get(t), n))
    )
      return;
    const o = this._rootLView,
      _i = Va(r, o[y], o, t, n);
    this.previousInputValues.set(t, n);
    const s = se(r.index, o);
    Ba(s, 1);
  }
  get injector() {
    return new It(this._tNode, this._rootLView);
  }
  destroy() {
    this.hostView.destroy();
  }
  onDestroy(t) {
    this.hostView.onDestroy(t);
  }
};
function rv(e, t, n) {
  const r = (e.projection = []);
  for (let o = 0; o < t.length; o++) {
    const i = n[o];
    r.push(i?.length ? Array.from(i) : null);
  }
}
var Go = (() => {
  class e {
    static __NG_ELEMENT_ID__ = ov;
  }
  return e;
})();
function ov() {
  const e = H();
  return of(e, m());
}
var iv = Go,
  rf = class extends iv {
    _lContainer;
    _hostTNode;
    _hostLView;
    constructor(t, n, r) {
      super(), (this._lContainer = t), (this._hostTNode = n), (this._hostLView = r);
    }
    get element() {
      return Yt(this._hostTNode, this._hostLView);
    }
    get injector() {
      return new It(this._hostTNode, this._hostLView);
    }
    get parentInjector() {
      const t = wa(this._hostTNode, this._hostLView);
      if (Nu(t)) {
        const n = Eo(t, this._hostLView),
          r = vo(t),
          o = n[y].data[r + 8];
        return new It(o, n);
      } else return new It(null, this._hostLView);
    }
    clear() {
      for (; this.length > 0; ) this.remove(this.length - 1);
    }
    get(t) {
      const n = hu(this._lContainer);
      return n?.[t] || null;
    }
    get length() {
      return this._lContainer.length - F;
    }
    createEmbeddedView(t, n, r) {
      let o, i;
      typeof r === 'number' ? (o = r) : r != null && ((o = r.index), (i = r.injector));
      const s = Mo(this._lContainer, t.ssrId),
        a = t.createEmbeddedViewImpl(n || {}, i, s);
      return this.insertImpl(a, o, zt(this._hostTNode, s)), a;
    }
    createComponent(t, n, r, o, i, s, a) {
      let c = t && !ng(t),
        l;
      if (c) l = n;
      else {
        const S = n || {};
        (l = S.index),
          (r = S.injector),
          (o = S.projectableNodes),
          (i = S.environmentInjector || S.ngModuleRef),
          (s = S.directives),
          (a = S.bindings);
      }
      const u = c ? t : new bt(Re(t)),
        d = r || this.parentInjector;
      if (!i && u.ngModule == null) {
        const T = (c ? d : this.parentInjector).get(re, null);
        T && (i = T);
      }
      const p = Re(u.componentType ?? {}),
        f = Mo(this._lContainer, p?.id ?? null),
        h = f?.firstChild ?? null,
        v = u.create(d, o, h, i, s, a);
      return this.insertImpl(v.hostView, l, zt(this._hostTNode, f)), v;
    }
    insert(t, n) {
      return this.insertImpl(t, n, !0);
    }
    insertImpl(t, n, r) {
      const o = t._lView;
      if (fl(o)) {
        const a = this.indexOf(t);
        if (a !== -1) this.detach(a);
        else {
          const c = o[V],
            l = new rf(c, c[K], c[V]);
          l.detach(l.indexOf(t));
        }
      }
      const i = this._adjustIndex(n),
        s = this._lContainer;
      return Gn(s, o, i, r), t.attachToViewContainerRef(), Zi(Ls(s), i, t), t;
    }
    move(t, n) {
      return this.insert(t, n);
    }
    indexOf(t) {
      const n = hu(this._lContainer);
      return n !== null ? n.indexOf(t) : -1;
    }
    remove(t) {
      const n = this._adjustIndex(t, -1),
        r = On(this._lContainer, n);
      r && (yn(Ls(this._lContainer), n), $o(r[y], r));
    }
    detach(t) {
      const n = this._adjustIndex(t, -1),
        r = On(this._lContainer, n);
      return r && yn(Ls(this._lContainer), n) != null ? new Ke(r) : null;
    }
    _adjustIndex(t, n = 0) {
      return t ?? this.length + n;
    }
  };
function hu(e) {
  return e[En];
}
function Ls(e) {
  return e[En] || (e[En] = []);
}
function of(e, t) {
  let n,
    r = t[e.index];
  return le(r) ? (n = r) : ((n = Ud(r, t, null, e)), (t[e.index] = n), Ra(t, n)), av(n, t, e, r), new rf(n, e, t);
}
function sv(e, t) {
  const n = e[k],
    r = n.createComment(''),
    o = ue(t, e),
    i = n.parentNode(o);
  return bo(n, i, r, n.nextSibling(o), !1), r;
}
var av = uv,
  cv = () => !1;
function lv(e, t, n) {
  return cv(e, t, n);
}
function uv(e, t, n, r) {
  if (e[Ge]) return;
  let o;
  n.type & 8 ? (o = ie(r)) : (o = sv(t, n)), (e[Ge] = o);
}
var ua = class e {
    queryList;
    matches = null;
    constructor(t) {
      this.queryList = t;
    }
    clone() {
      return new e(this.queryList);
    }
    setDirty() {
      this.queryList.setDirty();
    }
  },
  da = class e {
    queries;
    constructor(t = []) {
      this.queries = t;
    }
    createEmbeddedView(t) {
      const n = t.queries;
      if (n !== null) {
        const r = t.contentQueries !== null ? t.contentQueries[0] : n.length,
          o = [];
        for (let i = 0; i < r; i++) {
          const s = n.getByIndex(i),
            a = this.queries[s.indexInDeclarationView];
          o.push(a.clone());
        }
        return new e(o);
      }
      return null;
    }
    insertView(t) {
      this.dirtyQueriesWithMatches(t);
    }
    detachView(t) {
      this.dirtyQueriesWithMatches(t);
    }
    finishViewCreation(t) {
      this.dirtyQueriesWithMatches(t);
    }
    dirtyQueriesWithMatches(t) {
      for (let n = 0; n < this.queries.length; n++) Wa(t, n).matches !== null && this.queries[n].setDirty();
    }
  },
  xo = class {
    flags;
    read;
    predicate;
    constructor(t, n, r = null) {
      (this.flags = n), (this.read = r), typeof t === 'string' ? (this.predicate = mv(t)) : (this.predicate = t);
    }
  },
  fa = class e {
    queries;
    constructor(t = []) {
      this.queries = t;
    }
    elementStart(t, n) {
      for (let r = 0; r < this.queries.length; r++) this.queries[r].elementStart(t, n);
    }
    elementEnd(t) {
      for (let n = 0; n < this.queries.length; n++) this.queries[n].elementEnd(t);
    }
    embeddedTView(t) {
      let n = null;
      for (let r = 0; r < this.length; r++) {
        const o = n !== null ? n.length : 0,
          i = this.getByIndex(r).embeddedTView(t, o);
        i && ((i.indexInDeclarationView = r), n !== null ? n.push(i) : (n = [i]));
      }
      return n !== null ? new e(n) : null;
    }
    template(t, n) {
      for (let r = 0; r < this.queries.length; r++) this.queries[r].template(t, n);
    }
    getByIndex(t) {
      return this.queries[t];
    }
    get length() {
      return this.queries.length;
    }
    track(t) {
      this.queries.push(t);
    }
  },
  pa = class e {
    metadata;
    matches = null;
    indexInDeclarationView = -1;
    crossesNgTemplate = !1;
    _declarationNodeIndex;
    _appliesToNextNode = !0;
    constructor(t, n = -1) {
      (this.metadata = t), (this._declarationNodeIndex = n);
    }
    elementStart(t, n) {
      this.isApplyingToNode(n) && this.matchTNode(t, n);
    }
    elementEnd(t) {
      this._declarationNodeIndex === t.index && (this._appliesToNextNode = !1);
    }
    template(t, n) {
      this.elementStart(t, n);
    }
    embeddedTView(t, n) {
      return this.isApplyingToNode(t)
        ? ((this.crossesNgTemplate = !0), this.addMatch(-t.index, n), new e(this.metadata))
        : null;
    }
    isApplyingToNode(t) {
      if (this._appliesToNextNode && (this.metadata.flags & 1) !== 1) {
        let n = this._declarationNodeIndex,
          r = t.parent;
        for (; r !== null && r.type & 8 && r.index !== n; ) r = r.parent;
        return n === (r !== null ? r.index : -1);
      }
      return this._appliesToNextNode;
    }
    matchTNode(t, n) {
      const r = this.metadata.predicate;
      if (Array.isArray(r))
        for (let o = 0; o < r.length; o++) {
          const i = r[o];
          this.matchTNodeWithReadOption(t, n, dv(n, i)), this.matchTNodeWithReadOption(t, n, ho(n, t, i, !1, !1));
        }
      else
        r === Pn
          ? n.type & 4 && this.matchTNodeWithReadOption(t, n, -1)
          : this.matchTNodeWithReadOption(t, n, ho(n, t, r, !1, !1));
    }
    matchTNodeWithReadOption(t, n, r) {
      if (r !== null) {
        const o = this.metadata.read;
        if (o !== null)
          if (o === Bn || o === Go || (o === Pn && n.type & 4)) this.addMatch(n.index, -2);
          else {
            const i = ho(n, t, o, !1, !1);
            i !== null && this.addMatch(n.index, i);
          }
        else this.addMatch(n.index, r);
      }
    }
    addMatch(t, n) {
      this.matches === null ? (this.matches = [t, n]) : this.matches.push(t, n);
    }
  };
function dv(e, t) {
  const n = e.localNames;
  if (n !== null) {
    for (let r = 0; r < n.length; r += 2) if (n[r] === t) return n[r + 1];
  }
  return null;
}
function fv(e, t) {
  return e.type & 11 ? Yt(e, t) : e.type & 4 ? $a(e, t) : null;
}
function pv(e, t, n, r) {
  return n === -1 ? fv(t, e) : n === -2 ? hv(e, t, r) : An(e, e[y], n, t);
}
function hv(e, t, n) {
  if (n === Bn) return Yt(t, e);
  if (n === Pn) return $a(t, e);
  if (n === Go) return of(t, e);
}
function sf(e, t, n, r) {
  const o = t[De].queries[r];
  if (o.matches === null) {
    const i = e.data,
      s = n.matches,
      a = [];
    for (let c = 0; s !== null && c < s.length; c += 2) {
      const l = s[c];
      if (l < 0) a.push(null);
      else {
        const u = i[l];
        a.push(pv(t, u, s[c + 1], n.metadata.read));
      }
    }
    o.matches = a;
  }
  return o.matches;
}
function ha(e, t, n, r) {
  const o = e.queries.getByIndex(n),
    i = o.matches;
  if (i !== null) {
    const s = sf(e, t, o, n);
    for (let a = 0; a < i.length; a += 2) {
      const c = i[a];
      if (c > 0) r.push(s[a / 2]);
      else {
        const l = i[a + 1],
          u = t[-c];
        for (let d = F; d < u.length; d++) {
          const p = u[d];
          p[We] === p[V] && ha(p[y], p, l, r);
        }
        if (u[mt] !== null) {
          const d = u[mt];
          for (let p = 0; p < d.length; p++) {
            const f = d[p];
            ha(f[y], f, l, r);
          }
        }
      }
    }
  }
  return r;
}
function qa(e, t) {
  return e[De].queries[t].queryList;
}
function af(e, t, n) {
  const r = new Co((n & 4) === 4);
  return gl(e, t, r, r.destroy), (t[De] ??= new da()).queries.push(new ua(r)) - 1;
}
function cf(e, t, n) {
  const r = P();
  return r.firstCreatePass && (lf(r, new xo(e, t, n), -1), (t & 2) === 2 && (r.staticViewQueries = !0)), af(r, m(), t);
}
function gv(e, t, n, r) {
  const o = P();
  if (o.firstCreatePass) {
    const i = H();
    lf(o, new xo(t, n, r), i.index), yv(o, e), (n & 2) === 2 && (o.staticContentQueries = !0);
  }
  return af(o, m(), n);
}
function mv(e) {
  return e.split(',').map((t) => t.trim());
}
function lf(e, t, n) {
  e.queries === null && (e.queries = new fa()), e.queries.track(new pa(t, n));
}
function yv(e, t) {
  const n = e.contentQueries || (e.contentQueries = []),
    r = n.length ? n[n.length - 1] : -1;
  t !== r && n.push(e.queries.length - 1, t);
}
function Wa(e, t) {
  return e.queries.getByIndex(t);
}
function uf(e, t) {
  const n = e[y],
    r = Wa(n, t);
  return r.crossesNgTemplate ? ha(n, e, t, []) : sf(n, e, r, t);
}
function df(e, t, _n) {
  let r,
    o = an(() => {
      r._dirtyCounter();
      const i = Ev(r, e);
      if (t && i === void 0) throw new b(-951, !1);
      return i;
    });
  return (r = o[$]), (r._dirtyCounter = io(0)), (r._flatValue = void 0), o;
}
function ff(e) {
  return df(!0, !1, e);
}
function pf(e) {
  return df(!0, !0, e);
}
function vv(e, t) {
  const n = e[$];
  (n._lView = m()),
    (n._queryIndex = t),
    (n._queryList = qa(n._lView, t)),
    n._queryList.onDirty(() => n._dirtyCounter.update((r) => r + 1));
}
function Ev(e, t) {
  const n = e._lView,
    r = e._queryIndex;
  if (n === void 0 || r === void 0 || n[E] & 4) return t ? void 0 : G;
  const o = qa(n, r),
    i = uf(n, r);
  return (
    o.reset(i, ju),
    t ? o.first : o._changesDetected || e._flatValue === void 0 ? (e._flatValue = o.toArray()) : e._flatValue
  );
}
var Qt = class {},
  hf = class {};
var Ao = class extends Qt {
    ngModuleType;
    _parent;
    _bootstrapComponents = [];
    _r3Injector;
    instance;
    destroyCbs = [];
    componentFactoryResolver = new No(this);
    constructor(t, n, r, o = !0) {
      super(), (this.ngModuleType = t), (this._parent = n);
      const i = Wi(t);
      (this._bootstrapComponents = pd(i.bootstrap)),
        (this._r3Injector = ws(
          t,
          n,
          [{ provide: Qt, useValue: this }, { provide: Qn, useValue: this.componentFactoryResolver }, ...r],
          Se(t),
          new Set(['environment']),
        )),
        o && this.resolveInjectorInitializers();
    }
    resolveInjectorInitializers() {
      this._r3Injector.resolveInjectorInitializers(), (this.instance = this._r3Injector.get(this.ngModuleType));
    }
    get injector() {
      return this._r3Injector;
    }
    destroy() {
      const t = this._r3Injector;
      !t.destroyed && t.destroy(), this.destroyCbs.forEach((n) => n()), (this.destroyCbs = null);
    }
    onDestroy(t) {
      this.destroyCbs.push(t);
    }
  },
  Ro = class extends hf {
    moduleType;
    constructor(t) {
      super(), (this.moduleType = t);
    }
    create(t) {
      return new Ao(this.moduleType, t, []);
    }
  };
var Fn = class extends Qt {
  injector;
  componentFactoryResolver = new No(this);
  instance = null;
  constructor(t) {
    super();
    const n = new lt(
      [...t.providers, { provide: Qt, useValue: this }, { provide: Qn, useValue: this.componentFactoryResolver }],
      t.parent || vn(),
      t.debugName,
      new Set(['environment']),
    );
    (this.injector = n), t.runEnvironmentInitializers && n.resolveInjectorInitializers();
  }
  destroy() {
    this.injector.destroy();
  }
  onDestroy(t) {
    this.injector.onDestroy(t);
  }
};
function gf(e, t, n = null) {
  return new Fn({ providers: e, parent: t, debugName: n, runEnvironmentInitializers: !0 }).injector;
}
var Iv = (() => {
  class e {
    _injector;
    cachedInjectors = new Map();
    constructor(n) {
      this._injector = n;
    }
    getOrCreateStandaloneInjector(n) {
      if (!n.standalone) return null;
      if (!this.cachedInjectors.has(n)) {
        const r = Ji(!1, n.type),
          o = r.length > 0 ? gf([r], this._injector, '') : null;
        this.cachedInjectors.set(n, o);
      }
      return this.cachedInjectors.get(n);
    }
    ngOnDestroy() {
      try {
        for (const n of this.cachedInjectors.values()) n?.destroy();
      } finally {
        this.cachedInjectors.clear();
      }
    }
    static \u0275prov = z({ token: e, providedIn: 'environment', factory: () => new e(ge(re)) });
  }
  return e;
})();
function Dv(e) {
  return Hn(() => {
    const t = mf(e),
      n = Z(Q({}, t), {
        decls: e.decls,
        vars: e.vars,
        template: e.template,
        consts: e.consts || null,
        ngContentSelectors: e.ngContentSelectors,
        onPush: e.changeDetection === Ma.OnPush,
        directiveDefs: null,
        pipeDefs: null,
        dependencies: (t.standalone && e.dependencies) || null,
        getStandaloneInjector: t.standalone ? (o) => o.get(Iv).getOrCreateStandaloneInjector(n) : null,
        getExternalStyles: null,
        signals: e.signals ?? !1,
        data: e.data || {},
        encapsulation: e.encapsulation || Ct.Emulated,
        styles: e.styles || G,
        _: null,
        schemas: e.schemas || null,
        tView: null,
        id: '',
      });
    t.standalone && wt('NgStandalone'), yf(n);
    const r = e.dependencies;
    return (n.directiveDefs = gu(r, Cv)), (n.pipeDefs = gu(r, Zc)), (n.id = Nv(n)), n;
  });
}
function Cv(e) {
  return Re(e) || Gi(e);
}
function bv(e) {
  return Hn(() => ({
    type: e.type,
    bootstrap: e.bootstrap || G,
    declarations: e.declarations || G,
    imports: e.imports || G,
    exports: e.exports || G,
    transitiveCompileScopes: null,
    schemas: e.schemas || null,
    id: e.id || null,
  }));
}
function Tv(e, t) {
  if (e == null) return qe;
  const n = {};
  for (const r in e)
    if (Object.hasOwn(e, r)) {
      let o = e[r],
        i,
        s,
        a,
        c;
      Array.isArray(o)
        ? ((a = o[0]), (i = o[1]), (s = o[2] ?? i), (c = o[3] || null))
        : ((i = o), (s = o), (a = Ho.None), (c = null)),
        (n[i] = [r, a, c]),
        (t[i] = s);
    }
  return n;
}
function wv(e) {
  if (e == null) return qe;
  const t = {};
  for (const n in e) Object.hasOwn(e, n) && (t[e[n]] = n);
  return t;
}
function Mv(e) {
  return Hn(() => {
    const t = mf(e);
    return yf(t), t;
  });
}
function _v(e) {
  return {
    type: e.type,
    name: e.name,
    factory: null,
    pure: e.pure !== !1,
    standalone: e.standalone ?? !0,
    onDestroy: e.type.prototype.ngOnDestroy || null,
  };
}
function mf(e) {
  const t = {};
  return {
    type: e.type,
    providersResolver: null,
    viewProvidersResolver: null,
    factory: null,
    hostBindings: e.hostBindings || null,
    hostVars: e.hostVars || 0,
    hostAttrs: e.hostAttrs || null,
    contentQueries: e.contentQueries || null,
    declaredInputs: t,
    inputConfig: e.inputs || qe,
    exportAs: e.exportAs || null,
    standalone: e.standalone ?? !0,
    signals: e.signals === !0,
    selectors: e.selectors || G,
    viewQuery: e.viewQuery || null,
    features: e.features || null,
    setInput: null,
    resolveHostDirectives: null,
    hostDirectives: null,
    inputs: Tv(e.inputs, t),
    outputs: wv(e.outputs),
    debugInfo: null,
  };
}
function yf(e) {
  e.features?.forEach((t) => t(e));
}
function gu(e, t) {
  return e
    ? () => {
        const n = typeof e === 'function' ? e() : e,
          r = [];
        for (const o of n) {
          const i = t(o);
          i !== null && r.push(i);
        }
        return r;
      }
    : null;
}
function Nv(e) {
  let t = 0,
    n = typeof e.consts === 'function' ? '' : e.consts,
    r = [
      e.selectors,
      e.ngContentSelectors,
      e.hostVars,
      e.hostAttrs,
      n,
      e.vars,
      e.decls,
      e.encapsulation,
      e.standalone,
      e.signals,
      e.exportAs,
      JSON.stringify(e.inputs),
      JSON.stringify(e.outputs),
      Object.getOwnPropertyNames(e.type.prototype),
      !!e.contentQueries,
      !!e.viewQuery,
    ];
  for (const i of r.join('|')) t = (Math.imul(31, t) + i.charCodeAt(0)) << 0;
  return (t += 2147483648), `c${t}`;
}
function Sv(e) {
  return Object.getPrototypeOf(e.prototype).constructor;
}
function vf(e) {
  let t = Sv(e.type),
    n = !0,
    r = [e];
  for (; t; ) {
    let o;
    if (be(e)) o = t.\u0275cmp || t.\u0275dir;
    else {
      if (t.\u0275cmp) throw new b(903, !1);
      o = t.\u0275dir;
    }
    if (o) {
      if (n) {
        r.push(o);
        const s = e;
        (s.inputs = Fs(e.inputs)), (s.declaredInputs = Fs(e.declaredInputs)), (s.outputs = Fs(e.outputs));
        const a = o.hostBindings;
        a && Ov(e, a);
        const c = o.viewQuery,
          l = o.contentQueries;
        if ((c && Rv(e, c), l && kv(e, l), xv(e, o), zc(e.outputs, o.outputs), be(o) && o.data.animation)) {
          const u = e.data;
          u.animation = (u.animation || []).concat(o.data.animation);
        }
      }
      const i = o.features;
      if (i)
        for (let s = 0; s < i.length; s++) {
          const a = i[s];
          a?.ngInherit && a(e), a === vf && (n = !1);
        }
    }
    t = Object.getPrototypeOf(t);
  }
  Av(r);
}
function xv(e, t) {
  for (const n in t.inputs) {
    if (!Object.hasOwn(t.inputs, n) || Object.hasOwn(e.inputs, n)) continue;
    const r = t.inputs[n];
    r !== void 0 && ((e.inputs[n] = r), (e.declaredInputs[n] = t.declaredInputs[n]));
  }
}
function Av(e) {
  let t = 0,
    n = null;
  for (let r = e.length - 1; r >= 0; r--) {
    const o = e[r];
    (o.hostVars = t += o.hostVars), (o.hostAttrs = Wt(o.hostAttrs, (n = Wt(n, o.hostAttrs))));
  }
}
function Fs(e) {
  return e === qe ? {} : e === G ? [] : e;
}
function Rv(e, t) {
  const n = e.viewQuery;
  n
    ? (e.viewQuery = (r, o) => {
        t(r, o), n(r, o);
      })
    : (e.viewQuery = t);
}
function kv(e, t) {
  const n = e.contentQueries;
  n
    ? (e.contentQueries = (r, o, i) => {
        t(r, o, i), n(r, o, i);
      })
    : (e.contentQueries = t);
}
function Ov(e, t) {
  const n = e.hostBindings;
  n
    ? (e.hostBindings = (r, o) => {
        t(r, o), n(r, o);
      })
    : (e.hostBindings = t);
}
function Pv(e, t, n, r, o, i, s, a) {
  if (n.firstCreatePass) {
    e.mergedAttrs = Wt(e.mergedAttrs, e.attrs);
    const u = (e.tView = xa(2, e, o, i, s, n.directiveRegistry, n.pipeRegistry, null, n.schemas, n.consts, null));
    n.queries !== null && (n.queries.template(n, e), (u.queries = n.queries.embeddedTView(e)));
  }
  a && (e.flags |= a), Bt(e, !1);
  const c = Lv(n, t, e, r);
  no() && La(n, t, c, e), Gt(c, t);
  const l = Ud(c, t, c, e);
  (t[r + O] = l), Ra(t, l), lv(l, e, t);
}
function jn(e, t, n, r, o, i, s, a, c, l, u) {
  let d = n + O,
    p;
  if (t.firstCreatePass) {
    if (((p = zn(t, d, 4, s || null, a || null)), l != null)) {
      const f = Te(t.consts, l);
      p.localNames = [];
      for (let h = 0; h < f.length; h += 2) p.localNames.push(f[h], -1);
    }
  } else p = t.data[d];
  return Pv(p, e, t, n, r, o, i, c), l != null && ja(e, p, u), p;
}
var Lv = Fv;
function Fv(_e, t, _n, _r) {
  return ro(!0), t[k].createComment('');
}
var jv = (() => {
  class e {
    log(n) {
      console.log(n);
    }
    warn(n) {
      console.warn(n);
    }
    static \u0275fac = (r) => new (r || e)();
    static \u0275prov = z({ token: e, factory: e.\u0275fac, providedIn: 'platform' });
  }
  return e;
})();
function Ef(e) {
  return typeof e === 'function' && e[$] !== void 0;
}
function Ga(e) {
  return Ef(e) && typeof e.set === 'function';
}
var If = new R('');
function za(e) {
  return !!e && typeof e.then === 'function';
}
function Df(e) {
  return !!e && typeof e.subscribe === 'function';
}
var Cf = new R('');
var Qa = (() => {
    class e {
      resolve;
      reject;
      initialized = !1;
      done = !1;
      donePromise = new Promise((n, r) => {
        (this.resolve = n), (this.reject = r);
      });
      appInits = D(Cf, { optional: !0 }) ?? [];
      injector = D(me);
      runInitializers() {
        if (this.initialized) return;
        const n = [];
        for (const o of this.appInits) {
          const i = zr(this.injector, o);
          if (za(i)) n.push(i);
          else if (Df(i)) {
            const s = new Promise((a, c) => {
              i.subscribe({ complete: a, error: c });
            });
            n.push(s);
          }
        }
        const r = () => {
          (this.done = !0), this.resolve();
        };
        Promise.all(n)
          .then(() => {
            r();
          })
          .catch((o) => {
            this.reject(o);
          }),
          n.length === 0 && r(),
          (this.initialized = !0);
      }
      static \u0275fac = (r) => new (r || e)();
      static \u0275prov = z({ token: e, factory: e.\u0275fac, providedIn: 'root' });
    }
    return e;
  })(),
  bf = new R('');
function Tf() {
  Di(() => {
    const e = '';
    throw new b(600, e);
  });
}
function wf(e) {
  return e.isBoundToModule;
}
var Vv = 10;
var zo = (() => {
  class e {
    _runningTick = !1;
    _destroyed = !1;
    _destroyListeners = [];
    _views = [];
    internalErrorHandler = D(Ye);
    afterRenderManager = D(Oa);
    zonelessEnabled = D(_n);
    rootEffectScheduler = D(so);
    dirtyFlags = 0;
    tracingSnapshot = null;
    allTestViews = new Set();
    autoDetectTestViews = new Set();
    includeAllTestViews = !1;
    afterTick = new Me();
    get allViews() {
      return [...(this.includeAllTestViews ? this.allTestViews : this.autoDetectTestViews).keys(), ...this._views];
    }
    get destroyed() {
      return this._destroyed;
    }
    componentTypes = [];
    components = [];
    internalPendingTask = D(Et);
    get isStable() {
      return this.internalPendingTask.hasPendingTasksObservable.pipe(rt((n) => !n));
    }
    constructor() {
      D(qn, { optional: !0 });
    }
    whenStable() {
      let n;
      return new Promise((r) => {
        n = this.isStable.subscribe({
          next: (o) => {
            o && r();
          },
        });
      }).finally(() => {
        n.unsubscribe();
      });
    }
    _injector = D(re);
    _rendererFactory = null;
    get injector() {
      return this._injector;
    }
    bootstrap(n, r) {
      return this.bootstrapImpl(n, r);
    }
    bootstrapImpl(n, r, o = me.NULL) {
      return this._injector.get(ye).run(() => {
        A(_.BootstrapComponentStart);
        const s = n instanceof qo;
        if (!this._injector.get(Qa).done) {
          const h = '';
          throw new b(405, h);
        }
        let c;
        s ? (c = n) : (c = this._injector.get(Qn).resolveComponentFactory(n)),
          this.componentTypes.push(c.componentType);
        const l = wf(c) ? void 0 : this._injector.get(Qt),
          u = r || c.selector,
          d = c.create(o, [], u, l),
          p = d.location.nativeElement,
          f = d.injector.get(If, null);
        return (
          f?.registerApplication(p),
          d.onDestroy(() => {
            this.detachView(d.hostView), xn(this.components, d), f?.unregisterApplication(p);
          }),
          this._loadComponent(d),
          A(_.BootstrapComponentEnd, d),
          d
        );
      });
    }
    tick() {
      this.zonelessEnabled || (this.dirtyFlags |= 1), this._tick();
    }
    _tick() {
      A(_.ChangeDetectionStart),
        this.tracingSnapshot !== null ? this.tracingSnapshot.run(Bo.CHANGE_DETECTION, this.tickImpl) : this.tickImpl();
    }
    tickImpl = () => {
      if (this._runningTick) throw (A(_.ChangeDetectionEnd), new b(101, !1));
      const n = g(null);
      try {
        (this._runningTick = !0), this.synchronize();
      } finally {
        (this._runningTick = !1),
          this.tracingSnapshot?.dispose(),
          (this.tracingSnapshot = null),
          g(n),
          this.afterTick.next(),
          A(_.ChangeDetectionEnd);
      }
    };
    synchronize() {
      this._rendererFactory === null &&
        !this._injector.destroyed &&
        (this._rendererFactory = this._injector.get(Ln, null, { optional: !0 }));
      let n = 0;
      for (; this.dirtyFlags !== 0 && n++ < Vv; ) {
        A(_.ChangeDetectionSyncStart);
        try {
          this.synchronizeOnce();
        } finally {
          A(_.ChangeDetectionSyncEnd);
        }
      }
    }
    synchronizeOnce() {
      this.dirtyFlags & 16 && ((this.dirtyFlags &= -17), this.rootEffectScheduler.flush());
      let n = !1;
      if (this.dirtyFlags & 7) {
        const r = !!(this.dirtyFlags & 1);
        (this.dirtyFlags &= -8), (this.dirtyFlags |= 8);
        for (const { _lView: o } of this.allViews) {
          if (!r && !Cn(o)) continue;
          const i = r && !this.zonelessEnabled ? 0 : 1;
          Vd(o, i), (n = !0);
        }
        if (((this.dirtyFlags &= -5), this.syncDirtyFlagsWithViews(), this.dirtyFlags & 23)) return;
      }
      n || (this._rendererFactory?.begin?.(), this._rendererFactory?.end?.()),
        this.dirtyFlags & 8 && ((this.dirtyFlags &= -9), this.afterRenderManager.execute()),
        this.syncDirtyFlagsWithViews();
    }
    syncDirtyFlagsWithViews() {
      if (this.allViews.some(({ _lView: n }) => Cn(n))) {
        this.dirtyFlags |= 2;
        return;
      } else this.dirtyFlags &= -8;
    }
    attachView(n) {
      const r = n;
      this._views.push(r), r.attachToAppRef(this);
    }
    detachView(n) {
      const r = n;
      xn(this._views, r), r.detachFromAppRef();
    }
    _loadComponent(n) {
      this.attachView(n.hostView);
      try {
        this.tick();
      } catch (o) {
        this.internalErrorHandler(o);
      }
      this.components.push(n), this._injector.get(bf, []).forEach((o) => o(n));
    }
    ngOnDestroy() {
      if (!this._destroyed)
        try {
          this._destroyListeners.forEach((n) => n()), this._views.slice().forEach((n) => n.destroy());
        } finally {
          (this._destroyed = !0), (this._views = []), (this._destroyListeners = []);
        }
    }
    onDestroy(n) {
      return this._destroyListeners.push(n), () => xn(this._destroyListeners, n);
    }
    destroy() {
      if (this._destroyed) throw new b(406, !1);
      const n = this._injector;
      n.destroy && !n.destroyed && n.destroy();
    }
    get viewCount() {
      return this._views.length;
    }
    static \u0275fac = (r) => new (r || e)();
    static \u0275prov = z({ token: e, factory: e.\u0275fac, providedIn: 'root' });
  }
  return e;
})();
function xn(e, t) {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}
function Mf(e, t, n, r) {
  const o = m(),
    i = Qe();
  if (ne(o, i, t)) {
    const _s = P(),
      a = wn();
    iy(a, o, e, t, n, r);
  }
  return Mf;
}
var _Q_ = typeof document < 'u' && typeof document?.documentElement?.getAnimations === 'function';
var ga = class {
  destroy(_t) {}
  updateValue(_t, _n) {}
  swap(t, n) {
    const r = Math.min(t, n),
      o = Math.max(t, n),
      i = this.detach(o);
    if (o - r > 1) {
      const s = this.detach(r);
      this.attach(r, i), this.attach(o, s);
    } else this.attach(r, i);
  }
  move(t, n) {
    this.attach(n, this.detach(t));
  }
};
function js(e, t, n, r, o) {
  return e === n && Object.is(t, r) ? 1 : Object.is(o(e, t), o(n, r)) ? -1 : 0;
}
function Hv(e, t, n, r) {
  let o,
    i,
    s = 0,
    a = e.length - 1,
    _c = void 0;
  if (Array.isArray(t)) {
    g(r);
    let l = t.length - 1;
    for (g(null); s <= a && s <= l; ) {
      const u = e.at(s),
        d = t[s],
        p = js(s, u, s, d, n);
      if (p !== 0) {
        p < 0 && e.updateValue(s, d), s++;
        continue;
      }
      const f = e.at(a),
        h = t[l],
        v = js(a, f, l, h, n);
      if (v !== 0) {
        v < 0 && e.updateValue(a, h), a--, l--;
        continue;
      }
      const S = n(s, u),
        T = n(a, f),
        Jt = n(s, d);
      if (Object.is(Jt, T)) {
        const Yo = n(l, h);
        Object.is(Yo, S) ? (e.swap(s, a), e.updateValue(a, h), l--, a--) : e.move(a, s), e.updateValue(s, d), s++;
        continue;
      }
      if (((o ??= new ko()), (i ??= yu(e, s, a, n)), ma(e, o, s, Jt))) e.updateValue(s, d), s++, a++;
      else if (i.has(Jt)) o.set(S, e.detach(s)), a--;
      else {
        const Yo = e.create(s, t[s]);
        e.attach(s, Yo), s++, a++;
      }
    }
    for (; s <= l; ) mu(e, o, n, s, t[s]), s++;
  } else if (t != null) {
    g(r);
    const l = t[Symbol.iterator]();
    g(null);
    let u = l.next();
    for (; !u.done && s <= a; ) {
      const d = e.at(s),
        p = u.value,
        f = js(s, d, s, p, n);
      if (f !== 0) f < 0 && e.updateValue(s, p), s++, (u = l.next());
      else {
        (o ??= new ko()), (i ??= yu(e, s, a, n));
        const h = n(s, p);
        if (ma(e, o, s, h)) e.updateValue(s, p), s++, a++, (u = l.next());
        else if (!i.has(h)) e.attach(s, e.create(s, p)), s++, a++, (u = l.next());
        else {
          const v = n(s, d);
          o.set(v, e.detach(s)), a--;
        }
      }
    }
    for (; !u.done; ) mu(e, o, n, e.length, u.value), (u = l.next());
  }
  for (; s <= a; ) e.destroy(e.detach(a--));
  o?.forEach((l) => {
    e.destroy(l);
  });
}
function ma(e, t, n, r) {
  return t !== void 0 && t.has(r) ? (e.attach(n, t.get(r)), t.delete(r), !0) : !1;
}
function mu(e, t, n, r, o) {
  if (ma(e, t, r, n(r, o))) e.updateValue(r, o);
  else {
    const i = e.create(r, o);
    e.attach(r, i);
  }
}
function yu(e, t, n, r) {
  const o = new Set();
  for (let i = t; i <= n; i++) o.add(r(i, e.at(i)));
  return o;
}
var ko = class {
  kvMap = new Map();
  _vMap = void 0;
  has(t) {
    return this.kvMap.has(t);
  }
  delete(t) {
    if (!this.has(t)) return !1;
    const n = this.kvMap.get(t);
    return (
      this._vMap !== void 0 && this._vMap.has(n)
        ? (this.kvMap.set(t, this._vMap.get(n)), this._vMap.delete(n))
        : this.kvMap.delete(t),
      !0
    );
  }
  get(t) {
    return this.kvMap.get(t);
  }
  set(t, n) {
    if (this.kvMap.has(t)) {
      let r = this.kvMap.get(t);
      this._vMap === void 0 && (this._vMap = new Map());
      const o = this._vMap;
      for (; o.has(r); ) r = o.get(r);
      o.set(r, n);
    } else this.kvMap.set(t, n);
  }
  forEach(t) {
    for (let [n, r] of this.kvMap)
      if ((t(r, n), this._vMap !== void 0)) {
        const o = this._vMap;
        for (; o.has(r); ) (r = o.get(r)), t(r, n);
      }
  }
};
function Bv(e, t, n, r, o, i, s, a) {
  wt('NgControlFlow');
  const c = m(),
    l = P(),
    u = Te(l.consts, i);
  return jn(c, l, e, t, n, r, o, u, 256, s, a), Za;
}
function Za(e, t, n, r, o, i, s, a) {
  wt('NgControlFlow');
  const c = m(),
    l = P(),
    u = Te(l.consts, i);
  return jn(c, l, e, t, n, r, o, u, 512, s, a), Za;
}
function $v(e, t) {
  wt('NgControlFlow');
  const n = m(),
    r = Qe(),
    o = n[r] !== q ? n[r] : -1,
    i = o !== -1 ? Oo(n, O + o) : void 0,
    s = 0;
  if (ne(n, r, e)) {
    const a = g(null);
    try {
      if ((i !== void 0 && Wd(i, s), e !== -1)) {
        const c = O + e,
          l = Oo(n, c),
          u = Ia(n[y], c),
          d = zd(l, u, n),
          p = Wn(n, u, t, { dehydratedView: d });
        Gn(l, p, s, zt(u, d));
      }
    } finally {
      g(a);
    }
  } else if (i !== void 0) {
    const a = qd(i, s);
    a !== void 0 && (a[j] = t);
  }
}
var ya = class {
  lContainer;
  $implicit;
  $index;
  constructor(t, n, r) {
    (this.lContainer = t), (this.$implicit = n), (this.$index = r);
  }
  get $count() {
    return this.lContainer.length - F;
  }
};
function Uv(e) {
  return e;
}
function qv(_e, t) {
  return t;
}
var va = class {
  hasEmptyBlock;
  trackByFn;
  liveCollection;
  constructor(t, n, r) {
    (this.hasEmptyBlock = t), (this.trackByFn = n), (this.liveCollection = r);
  }
};
function Wv(e, t, n, r, o, i, s, a, c, l, u, d, p) {
  wt('NgControlFlow');
  const f = m(),
    h = P(),
    v = c !== void 0,
    S = m(),
    T = a ? s.bind(S[J][j]) : s,
    Jt = new va(v, T);
  (S[O + e] = Jt),
    jn(f, h, e + 1, t, n, r, o, Te(h.consts, i), 256),
    v && jn(f, h, e + 2, c, l, u, d, Te(h.consts, p), 512);
}
var Ea = class extends ga {
  lContainer;
  hostLView;
  templateTNode;
  operationsCounter = void 0;
  needsIndexUpdate = !1;
  constructor(t, n, r) {
    super(), (this.lContainer = t), (this.hostLView = n), (this.templateTNode = r);
  }
  get length() {
    return this.lContainer.length - F;
  }
  at(t) {
    return this.getLView(t)[j].$implicit;
  }
  attach(t, n) {
    const r = n[dt];
    (this.needsIndexUpdate ||= t !== this.length),
      Gn(this.lContainer, n, t, zt(this.templateTNode, r)),
      zv(this.lContainer, t);
  }
  detach(t) {
    return (this.needsIndexUpdate ||= t !== this.length - 1), Qv(this.lContainer, t), Zv(this.lContainer, t);
  }
  create(t, n) {
    const r = Mo(this.lContainer, this.templateTNode.tView.ssrId);
    return Wn(this.hostLView, this.templateTNode, new ya(this.lContainer, n, t), { dehydratedView: r });
  }
  destroy(t) {
    $o(t[y], t);
  }
  updateValue(t, n) {
    this.getLView(t)[j].$implicit = n;
  }
  reset() {
    this.needsIndexUpdate = !1;
  }
  updateIndexes() {
    if (this.needsIndexUpdate) for (let t = 0; t < this.length; t++) this.getLView(t)[j].$index = t;
  }
  getLView(t) {
    return Yv(this.lContainer, t);
  }
};
function Gv(e) {
  const t = g(null),
    n = de();
  try {
    const r = m(),
      o = r[y],
      i = r[n],
      s = n + 1,
      a = Oo(r, s);
    if (i.liveCollection === void 0) {
      const l = Ia(o, s);
      i.liveCollection = new Ea(a, r, l);
    } else i.liveCollection.reset();
    const c = i.liveCollection;
    if ((Hv(c, e, i.trackByFn, t), c.updateIndexes(), i.hasEmptyBlock)) {
      const l = Qe(),
        u = c.length === 0;
      if (ne(r, l, u)) {
        const d = n + 2,
          p = Oo(r, d);
        if (u) {
          const f = Ia(o, d),
            h = zd(p, f, r),
            v = Wn(r, f, void 0, { dehydratedView: h });
          Gn(p, v, 0, zt(f, h));
        } else o.firstUpdatePass && Sy(p), Wd(p, 0);
      }
    }
  } finally {
    g(t);
  }
}
function Oo(e, t) {
  return e[t];
}
function zv(e, t) {
  if (e.length <= F) return;
  const n = F + t,
    r = e[n],
    o = r ? r[gt] : void 0;
  if (r && o?.detachedLeaveAnimationFns && o.detachedLeaveAnimationFns.length > 0) {
    const i = r[ke];
    Lm(i, o), Rn.delete(r[Oe]), (o.detachedLeaveAnimationFns = void 0);
  }
}
function Qv(e, t) {
  if (e.length <= F) return;
  const n = F + t,
    r = e[n],
    o = r ? r[gt] : void 0;
  o?.leave && o.leave.size > 0 && (o.detachedLeaveAnimationFns = []);
}
function Zv(e, t) {
  return On(e, t);
}
function Yv(e, t) {
  return qd(e, t);
}
function Ia(e, t) {
  return In(e, t);
}
function _f(e, t, n) {
  const r = m(),
    o = Qe();
  if (ne(r, o, t)) {
    const _i = P(),
      s = wn();
    xd(s, r, e, t, r[k], n);
  }
  return _f;
}
function Da(e, t, n, r, o) {
  Va(t, e, n, o ? 'class' : 'style', r);
}
function Ya(e, t, n, r) {
  const o = m(),
    i = o[y],
    s = e + O,
    a = i.firstCreatePass ? Kd(s, o, 2, t, oy, vl(), n, r) : i.data[s];
  if ((Rd(a, o, e, t, xf), Zr(a))) {
    const c = o[y];
    Sd(c, o, a), Ju(c, a, o);
  }
  return r != null && ja(o, a), Ya;
}
function Ka() {
  const e = P(),
    t = H(),
    n = kd(t);
  return (
    e.firstCreatePass && Jd(e, n),
    ms(n) && ys(),
    hs(),
    n.classesWithoutHost != null && ug(n) && Da(e, n, m(), n.classesWithoutHost, !0),
    n.stylesWithoutHost != null && dg(n) && Da(e, n, m(), n.stylesWithoutHost, !1),
    Ka
  );
}
function Nf(e, t, n, r) {
  return Ya(e, t, n, r), Ka(), Nf;
}
function Ja(e, t, n, r) {
  const o = m(),
    i = o[y],
    s = e + O,
    a = i.firstCreatePass ? Gy(s, i, 2, t, n, r) : i.data[s];
  return Rd(a, o, e, t, xf), r != null && ja(o, a), Ja;
}
function Xa() {
  const e = H(),
    t = kd(e);
  return ms(t) && ys(), hs(), Xa;
}
function Sf(e, t, n, r) {
  return Ja(e, t, n, r), Xa(), Sf;
}
var xf = (_e, t, _n, r, _o) => (ro(!0), ad(t[k], r, Ol()));
function Kv() {
  return m();
}
function Af(e, t, n) {
  const r = m(),
    o = Qe();
  if (ne(r, o, t)) {
    const _i = P(),
      s = wn();
    Ad(s, r, e, t, r[k], n);
  }
  return Af;
}
var Nn = void 0;
function Jv(e) {
  const t = Math.floor(Math.abs(e)),
    n = e.toString().replace(/^[^.]*\.?/, '').length;
  return t === 1 && n === 0 ? 1 : 5;
}
var Xv = [
    'en',
    [
      ['a', 'p'],
      ['AM', 'PM'],
    ],
    [['AM', 'PM']],
    [
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    ],
    Nn,
    [
      ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ],
    ],
    Nn,
    [
      ['B', 'A'],
      ['BC', 'AD'],
      ['Before Christ', 'Anno Domini'],
    ],
    0,
    [6, 0],
    ['M/d/yy', 'MMM d, y', 'MMMM d, y', 'EEEE, MMMM d, y'],
    ['h:mm\u202Fa', 'h:mm:ss\u202Fa', 'h:mm:ss\u202Fa z', 'h:mm:ss\u202Fa zzzz'],
    ['{1}, {0}', Nn, Nn, Nn],
    ['.', ',', ';', '%', '+', '-', 'E', '\xD7', '\u2030', '\u221E', 'NaN', ':'],
    ['#,##0.###', '#,##0%', '\xA4#,##0.00', '#E0'],
    'USD',
    '$',
    'US Dollar',
    {},
    'ltr',
    Jv,
  ],
  Vs = {};
function eE(e) {
  let t = tE(e),
    n = vu(t);
  if (n) return n;
  const r = t.split('-')[0];
  if (((n = vu(r)), n)) return n;
  if (r === 'en') return Xv;
  throw new b(701, !1);
}
function vu(e) {
  return e in Vs || (Vs[e] = ve.ng?.common?.locales?.[e]), Vs[e];
}
var Rf = ((e) => (
  (e[(e.LocaleId = 0)] = 'LocaleId'),
  (e[(e.DayPeriodsFormat = 1)] = 'DayPeriodsFormat'),
  (e[(e.DayPeriodsStandalone = 2)] = 'DayPeriodsStandalone'),
  (e[(e.DaysFormat = 3)] = 'DaysFormat'),
  (e[(e.DaysStandalone = 4)] = 'DaysStandalone'),
  (e[(e.MonthsFormat = 5)] = 'MonthsFormat'),
  (e[(e.MonthsStandalone = 6)] = 'MonthsStandalone'),
  (e[(e.Eras = 7)] = 'Eras'),
  (e[(e.FirstDayOfWeek = 8)] = 'FirstDayOfWeek'),
  (e[(e.WeekendRange = 9)] = 'WeekendRange'),
  (e[(e.DateFormat = 10)] = 'DateFormat'),
  (e[(e.TimeFormat = 11)] = 'TimeFormat'),
  (e[(e.DateTimeFormat = 12)] = 'DateTimeFormat'),
  (e[(e.NumberSymbols = 13)] = 'NumberSymbols'),
  (e[(e.NumberFormats = 14)] = 'NumberFormats'),
  (e[(e.CurrencyCode = 15)] = 'CurrencyCode'),
  (e[(e.CurrencySymbol = 16)] = 'CurrencySymbol'),
  (e[(e.CurrencyName = 17)] = 'CurrencyName'),
  (e[(e.Currencies = 18)] = 'Currencies'),
  (e[(e.Directionality = 19)] = 'Directionality'),
  (e[(e.PluralCase = 20)] = 'PluralCase'),
  (e[(e.ExtraData = 21)] = 'ExtraData'),
  e
))(Rf || {});
function tE(e) {
  return e.toLowerCase().replace(/_/g, '-');
}
var Yn = 'en-US';
var nE = Yn;
function kf(e) {
  typeof e === 'string' && (nE = e.toLowerCase().replace(/_/g, '-'));
}
function Of(e, t, n) {
  const r = m(),
    o = P(),
    i = H();
  return Lf(o, r, r[k], i, e, t, n), Of;
}
function Pf(e, t, n) {
  const r = m(),
    o = P(),
    i = H();
  return (i.type & 3 || n) && ef(i, o, r, n, r[k], e, t, mo(i, r, t)), Pf;
}
function Lf(e, t, n, r, o, i, s) {
  let a = !0,
    c = null;
  if (((r.type & 3 || s) && ((c ??= mo(r, t, i)), ef(r, e, t, s, n, o, i, c) && (a = !1)), a)) {
    const l = r.outputs?.[o],
      u = r.hostDirectiveOutputs?.[o];
    if (u?.length)
      for (let d = 0; d < u.length; d += 2) {
        const p = u[d],
          f = u[d + 1];
        (c ??= mo(r, t, i)), fu(r, t, p, f, o, c);
      }
    if (l?.length) for (const d of l) (c ??= mo(r, t, i)), fu(r, t, d, o, o, c);
  }
}
function rE(e = 1) {
  return Al(e);
}
function oE(e, t) {
  let n = null,
    r = Dm(e);
  for (let o = 0; o < t.length; o++) {
    const i = t[o];
    if (i === '*') {
      n = o;
      continue;
    }
    if (r === null ? gd(e, i, !0) : Tm(r, i)) return o;
  }
  return n;
}
function iE(e) {
  const t = m()[J][K];
  if (!t.projection) {
    let n = e ? e.length : 1,
      r = (t.projection = tl(n, null)),
      o = r.slice(),
      i = t.child;
    for (; i !== null; ) {
      if (i.type !== 128) {
        const s = e ? oE(i, e) : 0;
        s !== null && (o[s] ? (o[s].projectionNext = i) : (r[s] = i), (o[s] = i));
      }
      i = i.next;
    }
  }
}
function sE(e, t = 0, n, r, o, i) {
  const s = m(),
    a = P(),
    c = r ? e + 1 : null;
  c !== null && jn(s, a, c, r, o, i, null, n);
  const l = zn(a, O + e, 16, null, n || null);
  l.projection === null && (l.projection = t), Is();
  const d = !s[dt] || gs();
  s[J][K].projection[l.projection] === null && c !== null ? aE(s, a, c) : d && !Fo(l) && zm(a, s, l);
}
function aE(e, t, n) {
  const r = O + n,
    o = t.data[r],
    i = e[r],
    s = Mo(i, o.tView.ssrId),
    a = Wn(e, o, void 0, { dehydratedView: s });
  Gn(i, a, 0, zt(o, s));
}
function Ff(e, t, n, r) {
  return gv(e, t, n, r), Ff;
}
function jf(e, t, n) {
  return cf(e, t, n), jf;
}
function cE(e) {
  const t = m(),
    n = P(),
    r = Xr();
  Tn(r + 1);
  const o = Wa(n, r);
  if (e.dirty && dl(t) === ((o.metadata.flags & 2) === 2)) {
    if (o.matches === null) e.reset([]);
    else {
      const i = uf(t, r);
      e.reset(i, ju), e.notifyOnChanges();
    }
    return !0;
  }
  return !1;
}
function lE() {
  return qa(m(), Xr());
}
function Vf(e, t, n, r) {
  return vv(e, cf(t, n, r)), Vf;
}
function uE(e = 1) {
  Tn(Xr() + e);
}
function dE(e) {
  const t = Cl();
  return Dn(t, O + e);
}
function uo(e, t) {
  return (e << 17) | (t << 2);
}
function Tt(e) {
  return (e >> 17) & 32767;
}
function fE(e) {
  return (e & 2) === 2;
}
function pE(e, t) {
  return (e & 131071) | (t << 17);
}
function Ca(e) {
  return e | 2;
}
function Zt(e) {
  return (e & 131068) >> 2;
}
function Hs(e, t) {
  return (e & -131069) | (t << 2);
}
function hE(e) {
  return (e & 1) === 1;
}
function ba(e) {
  return e | 1;
}
function gE(e, t, n, r, o, i) {
  let s = i ? t.classBindings : t.styleBindings,
    a = Tt(s),
    c = Zt(s);
  e[r] = n;
  let l = !1,
    u;
  if (Array.isArray(n)) {
    const d = n;
    (u = d[1]), (u === null || Lt(d, u) > 0) && (l = !0);
  } else u = n;
  if (o)
    if (c !== 0) {
      const p = Tt(e[a + 1]);
      (e[r + 1] = uo(p, a)), p !== 0 && (e[p + 1] = Hs(e[p + 1], r)), (e[a + 1] = pE(e[a + 1], r));
    } else (e[r + 1] = uo(a, 0)), a !== 0 && (e[a + 1] = Hs(e[a + 1], r)), (a = r);
  else (e[r + 1] = uo(c, 0)), a === 0 ? (a = r) : (e[c + 1] = Hs(e[c + 1], r)), (c = r);
  l && (e[r + 1] = Ca(e[r + 1])),
    Eu(e, u, r, !0),
    Eu(e, u, r, !1),
    mE(t, u, e, r, i),
    (s = uo(a, c)),
    i ? (t.classBindings = s) : (t.styleBindings = s);
}
function mE(e, t, n, r, o) {
  const i = o ? e.residualClasses : e.residualStyles;
  i != null && typeof t === 'string' && Lt(i, t) >= 0 && (n[r + 1] = ba(n[r + 1]));
}
function Eu(e, t, n, r) {
  let o = e[n + 1],
    i = t === null,
    s = r ? Tt(o) : Zt(o),
    a = !1;
  for (; s !== 0 && (a === !1 || i); ) {
    const c = e[s],
      l = e[s + 1];
    yE(c, t) && ((a = !0), (e[s + 1] = r ? ba(l) : Ca(l))), (s = r ? Tt(l) : Zt(l));
  }
  a && (e[n + 1] = r ? Ca(o) : ba(o));
}
function yE(e, t) {
  return e === null || t == null || (Array.isArray(e) ? e[1] : e) === t
    ? !0
    : Array.isArray(e) && typeof t === 'string'
      ? Lt(e, t) >= 0
      : !1;
}
var pe = { textEnd: 0, key: 0, keyEnd: 0, value: 0, valueEnd: 0 };
function vE(e) {
  return e.substring(pe.key, pe.keyEnd);
}
function EE(e) {
  return IE(e), Hf(e, Bf(e, 0, pe.textEnd));
}
function Hf(e, t) {
  const n = pe.textEnd;
  return n === t ? -1 : ((t = pe.keyEnd = DE(e, (pe.key = t), n)), Bf(e, t, n));
}
function IE(e) {
  (pe.key = 0), (pe.keyEnd = 0), (pe.value = 0), (pe.valueEnd = 0), (pe.textEnd = e.length);
}
function Bf(e, t, n) {
  for (; t < n && e.charCodeAt(t) <= 32; ) t++;
  return t;
}
function DE(e, t, n) {
  for (; t < n && e.charCodeAt(t) > 32; ) t++;
  return t;
}
function $f(e, t, n) {
  return qf(e, t, n, !1), $f;
}
function Uf(e, t) {
  return qf(e, t, null, !0), Uf;
}
function CE(e) {
  TE(xE, bE, e, !0);
}
function bE(e, t) {
  for (let n = EE(t); n >= 0; n = Hf(t, n)) qr(e, vE(t), !0);
}
function qf(e, t, n, r) {
  const o = m(),
    i = P(),
    s = bn(2);
  if ((i.firstUpdatePass && Gf(i, e, s, r), t !== q && ne(o, s, t))) {
    const a = i.data[de()];
    zf(i, a, o, o[k], e, (o[s + 1] = RE(t, n)), r, s);
  }
}
function TE(e, t, n, r) {
  const o = P(),
    i = bn(2);
  o.firstUpdatePass && Gf(o, null, i, r);
  const s = m();
  if (n !== q && ne(s, i, n)) {
    const a = o.data[de()];
    if (Qf(a, r) && !Wf(o, i)) {
      const c = r ? a.classesWithoutHost : a.stylesWithoutHost;
      c !== null && (n = jr(c, n || '')), Da(o, a, s, n, r);
    } else AE(o, a, s, s[k], s[i + 1], (s[i + 1] = SE(e, t, n)), r, i);
  }
}
function Wf(e, t) {
  return t >= e.expandoStartIndex;
}
function Gf(e, t, n, r) {
  const o = e.data;
  if (o[n + 1] === null) {
    const i = o[de()],
      s = Wf(e, n);
    Qf(i, r) && t === null && !s && (t = !1), (t = wE(o, i, t, r)), gE(o, i, t, n, s, r);
  }
}
function wE(e, t, n, r) {
  let o = _l(e),
    i = r ? t.residualClasses : t.residualStyles;
  if (o === null)
    (r ? t.classBindings : t.styleBindings) === 0 && ((n = Bs(null, e, t, n, r)), (n = Vn(n, t.attrs, r)), (i = null));
  else {
    const s = t.directiveStylingLast;
    if (s === -1 || e[s] !== o)
      if (((n = Bs(o, e, t, n, r)), i === null)) {
        let c = ME(e, t, r);
        c !== void 0 && Array.isArray(c) && ((c = Bs(null, e, t, c[1], r)), (c = Vn(c, t.attrs, r)), _E(e, t, r, c));
      } else i = NE(e, t, r);
  }
  return i !== void 0 && (r ? (t.residualClasses = i) : (t.residualStyles = i)), n;
}
function ME(e, t, n) {
  const r = n ? t.classBindings : t.styleBindings;
  if (Zt(r) !== 0) return e[Tt(r)];
}
function _E(e, t, n, r) {
  const o = n ? t.classBindings : t.styleBindings;
  e[Tt(o)] = r;
}
function NE(e, t, n) {
  let r,
    o = t.directiveEnd;
  for (let i = 1 + t.directiveStylingLast; i < o; i++) {
    const s = e[i].hostAttrs;
    r = Vn(r, s, n);
  }
  return Vn(r, t.attrs, n);
}
function Bs(e, t, n, r, o) {
  let i = null,
    s = n.directiveEnd,
    a = n.directiveStylingLast;
  for (a === -1 ? (a = n.directiveStart) : a++; a < s && ((i = t[a]), (r = Vn(r, i.hostAttrs, o)), i !== e); ) a++;
  return e !== null && (n.directiveStylingLast = a), r;
}
function Vn(e, t, n) {
  let r = n ? 1 : 2,
    o = -1;
  if (t !== null)
    for (let i = 0; i < t.length; i++) {
      const s = t[i];
      typeof s === 'number'
        ? (o = s)
        : o === r && (Array.isArray(e) || (e = e === void 0 ? [] : ['', e]), qr(e, s, n ? !0 : t[++i]));
    }
  return e === void 0 ? null : e;
}
function SE(e, t, n) {
  if (n == null || n === '') return G;
  const r = [],
    o = Kt(n);
  if (Array.isArray(o)) for (let i = 0; i < o.length; i++) e(r, o[i], !0);
  else if (o instanceof Set) for (const i of o) e(r, i, !0);
  else if (typeof o === 'object') for (const i in o) Object.hasOwn(o, i) && e(r, i, o[i]);
  else typeof o === 'string' && t(r, o);
  return r;
}
function xE(e, t, n) {
  const r = String(t);
  r !== '' && !r.includes(' ') && qr(e, r, n);
}
function AE(e, t, n, r, o, i, s, a) {
  o === q && (o = G);
  let c = 0,
    l = 0,
    u = 0 < o.length ? o[0] : null,
    d = 0 < i.length ? i[0] : null;
  for (; u !== null || d !== null; ) {
    let p = c < o.length ? o[c + 1] : void 0,
      f = l < i.length ? i[l + 1] : void 0,
      h = null,
      v;
    u === d
      ? ((c += 2), (l += 2), p !== f && ((h = d), (v = f)))
      : d === null || (u !== null && u < d)
        ? ((c += 2), (h = u))
        : ((l += 2), (h = d), (v = f)),
      h !== null && zf(e, t, n, r, h, v, s, a),
      (u = c < o.length ? o[c] : null),
      (d = l < i.length ? i[l] : null);
  }
}
function zf(e, t, n, r, o, i, s, a) {
  if (!(t.type & 3)) return;
  const c = e.data,
    l = c[a + 1],
    u = hE(l) ? Iu(c, t, n, o, Zt(l), s) : void 0;
  if (!Po(u)) {
    Po(i) || (fE(l) && (i = Iu(c, null, n, o, a, s)));
    const d = as(de(), n);
    Zm(r, s, d, o, i);
  }
}
function Iu(e, t, n, r, o, i) {
  let s = t === null,
    a;
  for (; o > 0; ) {
    let c = e[o],
      l = Array.isArray(c),
      u = l ? c[1] : c,
      d = u === null,
      p = n[o + 1];
    p === q && (p = d ? G : void 0);
    let f = d ? Wr(p, r) : u === r ? p : void 0;
    if ((l && !Po(f) && (f = Wr(c, r)), Po(f) && ((a = f), s))) return a;
    const h = e[o + 1];
    o = s ? Tt(h) : Zt(h);
  }
  if (t !== null) {
    const c = i ? t.residualClasses : t.residualStyles;
    c != null && (a = Wr(c, r));
  }
  return a;
}
function Po(e) {
  return e !== void 0;
}
function RE(e, t) {
  return e == null || e === '' || (typeof t === 'string' ? (e = e + t) : typeof e === 'object' && (e = Se(Kt(e)))), e;
}
function Qf(e, t) {
  return (e.flags & (t ? 8 : 16)) !== 0;
}
function kE(e, t = '') {
  const n = m(),
    r = P(),
    o = e + O,
    i = r.firstCreatePass ? zn(r, o, 1, t, null) : r.data[o],
    s = OE(r, n, i, t);
  (n[o] = s), no() && La(r, n, s, i), Bt(i, !1);
}
var OE = (_e, t, _n, r) => (ro(!0), sm(t[k], r));
function Zf(e, t, n, r = '') {
  return ne(e, Qe(), n) ? t + Ee(n) + r : q;
}
function Yf(e, t, n, r, o, i = '') {
  const s = Cs(),
    a = Ua(e, s, n, o);
  return bn(2), a ? t + Ee(n) + r + Ee(o) + i : q;
}
function PE(e, t, n, r, o, i, s, a = '') {
  const c = Cs(),
    l = Xd(e, c, n, o, s);
  return bn(3), l ? t + Ee(n) + r + Ee(o) + i + Ee(s) + a : q;
}
function Kf(e) {
  return ec('', e), Kf;
}
function ec(e, t, n) {
  const r = m(),
    o = Zf(r, e, t, n);
  return o !== q && tc(r, de(), o), ec;
}
function Jf(e, t, n, r, o) {
  const i = m(),
    s = Yf(i, e, t, n, r, o);
  return s !== q && tc(i, de(), s), Jf;
}
function Xf(e, t, n, r, o, i, s) {
  const a = m(),
    c = PE(a, e, t, n, r, o, i, s);
  return c !== q && tc(a, de(), c), Xf;
}
function tc(e, t, n) {
  const r = as(t, e);
  am(e[k], r, n);
}
function ep(e, t, n) {
  Ga(t) && (t = t());
  const r = m(),
    o = Qe();
  if (ne(r, o, t)) {
    const _i = P(),
      s = wn();
    xd(s, r, e, t, r[k], n);
  }
  return ep;
}
function LE(e, t) {
  const n = Ga(e);
  return n && e.set(t), n;
}
function tp(e, t) {
  const n = m(),
    r = P(),
    o = H();
  return Lf(r, n, n[k], o, e, t), tp;
}
function FE(e, t, n = '') {
  return Zf(m(), e, t, n);
}
function jE(e, t, n, r, o = '') {
  return Yf(m(), e, t, n, r, o);
}
function Du(e, t, n) {
  const r = P();
  r.firstCreatePass && np(t, r.data, r.blueprint, be(e), n);
}
function np(e, t, n, r, o) {
  if (((e = U(e)), Array.isArray(e))) for (let i = 0; i < e.length; i++) np(e[i], t, n, r, o);
  else {
    const i = P(),
      s = m(),
      a = H(),
      c = ct(e) ? e : U(e.provide),
      l = ts(e),
      u = a.providerIndexes & 1048575,
      d = a.directiveStart,
      p = a.providerIndexes >> 20;
    if (ct(e) || !e.multi) {
      const f = new Dt(l, o, Zn, null),
        h = Us(c, t, o ? u : u + p, d);
      h === -1
        ? (Ws(Do(a, s), i, c),
          $s(i, e, t.length),
          t.push(c),
          a.directiveStart++,
          a.directiveEnd++,
          o && (a.providerIndexes += 1048576),
          n.push(f),
          s.push(f))
        : ((n[h] = f), (s[h] = f));
    } else {
      const f = Us(c, t, u + p, d),
        h = Us(c, t, u, u + p),
        v = f >= 0 && n[f],
        S = h >= 0 && n[h];
      if ((o && !S) || (!o && !v)) {
        Ws(Do(a, s), i, c);
        const T = BE(o ? HE : VE, n.length, o, r, l, e);
        !o && S && (n[h].providerFactory = T),
          $s(i, e, t.length, 0),
          t.push(c),
          a.directiveStart++,
          a.directiveEnd++,
          o && (a.providerIndexes += 1048576),
          n.push(T),
          s.push(T);
      } else {
        const T = rp(n[o ? h : f], l, !o && r);
        $s(i, e, f > -1 ? f : h, T);
      }
      !o && r && S && n[h].componentProviders++;
    }
  }
}
function $s(e, t, n, r) {
  const o = ct(t),
    i = al(t);
  if (o || i) {
    const c = (i ? U(t.useClass) : t).prototype.ngOnDestroy;
    if (c) {
      const l = e.destroyHooks || (e.destroyHooks = []);
      if (!o && t.multi) {
        const u = l.indexOf(n);
        u === -1 ? l.push(n, [r, c]) : l[u + 1].push(r, c);
      } else l.push(n, c);
    }
  }
}
function rp(e, t, n) {
  return n && e.componentProviders++, e.multi.push(t) - 1;
}
function Us(e, t, n, r) {
  for (let o = n; o < r; o++) if (t[o] === e) return o;
  return -1;
}
function VE(_e, _t, _n, _r, _o) {
  return Ta(this.multi, []);
}
function HE(_e, _t, _n, r, o) {
  let i = this.multi,
    s;
  if (this.providerFactory) {
    const a = this.providerFactory.componentProviders,
      c = An(r, r[y], this.providerFactory.index, o);
    (s = c.slice(0, a)), Ta(i, s);
    for (let l = a; l < c.length; l++) s.push(c[l]);
  } else (s = []), Ta(i, s);
  return s;
}
function Ta(e, t) {
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    t.push(r());
  }
  return t;
}
function BE(e, t, n, r, o, _i) {
  const s = new Dt(e, n, Zn, null);
  return (s.multi = []), (s.index = t), (s.componentProviders = 0), rp(s, o, r && !n), s;
}
function $E(e, t) {
  return (n) => {
    (n.providersResolver = (r, o) => Du(r, o ? o(e) : e, !1)),
      t && (n.viewProvidersResolver = (r, o) => Du(r, o ? o(t) : t, !0));
  };
}
function UE(e, t) {
  const n = $t() + e,
    r = m();
  return r[n] === q ? Wo(r, n, t()) : zy(r, n);
}
function qE(e, t, n) {
  return op(m(), $t(), e, t, n);
}
function nc(e, t) {
  const n = e[t];
  return n === q ? void 0 : n;
}
function op(e, t, n, r, o, i) {
  const s = t + n;
  return ne(e, s, o) ? Wo(e, s + 1, i ? r.call(i, o) : r(o)) : nc(e, s + 1);
}
function WE(e, t, n, r, o, i, s) {
  const a = t + n;
  return Ua(e, a, o, i) ? Wo(e, a + 2, s ? r.call(s, o, i) : r(o, i)) : nc(e, a + 2);
}
function GE(e, t, n, r, o, i, s, a) {
  const c = t + n;
  return Xd(e, c, o, i, s) ? Wo(e, c + 3, a ? r.call(a, o, i, s) : r(o, i, s)) : nc(e, c + 3);
}
function zE(e, t) {
  let n = P(),
    r,
    o = e + O;
  n.firstCreatePass
    ? ((r = QE(t, n.pipeRegistry)), (n.data[o] = r), r.onDestroy && (n.destroyHooks ??= []).push(o, r.onDestroy))
    : (r = n.data[o]);
  let i = r.factory || (r.factory = Be(r.type, !0)),
    _s,
    a = Y(Zn);
  try {
    const c = Io(!1),
      l = i();
    return Io(c), cs(n, m(), o, l), l;
  } finally {
    Y(a);
  }
}
function QE(e, t) {
  if (t)
    for (let n = t.length - 1; n >= 0; n--) {
      const r = t[n];
      if (e === r.name) return r;
    }
}
function ZE(e, t, n) {
  const r = e + O,
    o = m(),
    i = Dn(o, r);
  return rc(o, r) ? op(o, $t(), t, i.transform, n, i) : i.transform(n);
}
function YE(e, t, n, r) {
  const o = e + O,
    i = m(),
    s = Dn(i, o);
  return rc(i, o) ? WE(i, $t(), t, s.transform, n, r, s) : s.transform(n, r);
}
function KE(e, t, n, r, o) {
  const i = e + O,
    s = m(),
    a = Dn(s, i);
  return rc(s, i) ? GE(s, $t(), t, a.transform, n, r, o, a) : a.transform(n, r, o);
}
function rc(e, t) {
  return e[y].data[t].pure;
}
var Lo = class {
    ngModuleFactory;
    componentFactories;
    constructor(t, n) {
      (this.ngModuleFactory = t), (this.componentFactories = n);
    }
  },
  JE = (() => {
    class e {
      compileModuleSync(n) {
        return new Ro(n);
      }
      compileModuleAsync(n) {
        return Promise.resolve(this.compileModuleSync(n));
      }
      compileModuleAndAllComponentsSync(n) {
        const r = this.compileModuleSync(n),
          o = Wi(n),
          i = pd(o.declarations).reduce((s, a) => {
            const c = Re(a);
            return c && s.push(new bt(c)), s;
          }, []);
        return new Lo(r, i);
      }
      compileModuleAndAllComponentsAsync(n) {
        return Promise.resolve(this.compileModuleAndAllComponentsSync(n));
      }
      clearCache() {}
      clearCacheFor(_n) {}
      getModuleId(_n) {}
      static \u0275fac = (r) => new (r || e)();
      static \u0275prov = z({ token: e, factory: e.\u0275fac, providedIn: 'root' });
    }
    return e;
  })();
var ip = (() => {
  class e {
    applicationErrorHandler = D(Ye);
    appRef = D(zo);
    taskService = D(Et);
    ngZone = D(ye);
    zonelessEnabled = D(_n);
    tracing = D(qn, { optional: !0 });
    zoneIsDefined = typeof Zone < 'u' && !!Zone.root.run;
    schedulerTickApplyArgs = [{ data: { __scheduler_tick__: !0 } }];
    subscriptions = new B();
    angularZoneId = this.zoneIsDefined ? this.ngZone._inner?.get(pn) : null;
    scheduleInRootZone = !this.zonelessEnabled && this.zoneIsDefined && (D(xs, { optional: !0 }) ?? !1);
    cancelScheduledCallback = null;
    useMicrotaskScheduler = !1;
    runningTick = !1;
    pendingRenderTaskId = null;
    constructor() {
      this.subscriptions.add(
        this.appRef.afterTick.subscribe(() => {
          const n = this.taskService.add();
          if (!this.runningTick && (this.cleanup(), !this.zonelessEnabled || this.appRef.includeAllTestViews)) {
            this.taskService.remove(n);
            return;
          }
          this.switchToMicrotaskScheduler(), this.taskService.remove(n);
        }),
      ),
        this.subscriptions.add(
          this.ngZone.onUnstable.subscribe(() => {
            this.runningTick || this.cleanup();
          }),
        );
    }
    switchToMicrotaskScheduler() {
      this.ngZone.runOutsideAngular(() => {
        const n = this.taskService.add();
        (this.useMicrotaskScheduler = !0),
          queueMicrotask(() => {
            (this.useMicrotaskScheduler = !1), this.taskService.remove(n);
          });
      });
    }
    notify(n) {
      if (!this.zonelessEnabled && n === 5) return;
      switch (n) {
        case 0: {
          this.appRef.dirtyFlags |= 2;
          break;
        }
        case 3:
        case 2:
        case 4:
        case 5:
        case 1: {
          this.appRef.dirtyFlags |= 4;
          break;
        }
        case 6: {
          this.appRef.dirtyFlags |= 2;
          break;
        }
        case 12: {
          this.appRef.dirtyFlags |= 16;
          break;
        }
        case 13: {
          this.appRef.dirtyFlags |= 2;
          break;
        }
        case 11:
          break;
        default:
          this.appRef.dirtyFlags |= 8;
      }
      if (
        ((this.appRef.tracingSnapshot = this.tracing?.snapshot(this.appRef.tracingSnapshot) ?? null),
        !this.shouldScheduleTick())
      )
        return;
      const r = this.useMicrotaskScheduler ? jl : Ms;
      (this.pendingRenderTaskId = this.taskService.add()),
        this.scheduleInRootZone
          ? (this.cancelScheduledCallback = Zone.root.run(() => r(() => this.tick())))
          : (this.cancelScheduledCallback = this.ngZone.runOutsideAngular(() => r(() => this.tick())));
    }
    shouldScheduleTick() {
      return !(
        this.appRef.destroyed ||
        this.pendingRenderTaskId !== null ||
        this.runningTick ||
        this.appRef._runningTick ||
        (!this.zonelessEnabled && this.zoneIsDefined && Zone.current.get(pn + this.angularZoneId))
      );
    }
    tick() {
      if (this.runningTick || this.appRef.destroyed) return;
      if (this.appRef.dirtyFlags === 0) {
        this.cleanup();
        return;
      }
      !this.zonelessEnabled && this.appRef.dirtyFlags & 7 && (this.appRef.dirtyFlags |= 1);
      const n = this.taskService.add();
      try {
        this.ngZone.run(
          () => {
            (this.runningTick = !0), this.appRef._tick();
          },
          void 0,
          this.schedulerTickApplyArgs,
        );
      } catch (r) {
        this.applicationErrorHandler(r);
      } finally {
        this.taskService.remove(n), this.cleanup();
      }
    }
    ngOnDestroy() {
      this.subscriptions.unsubscribe(), this.cleanup();
    }
    cleanup() {
      if (
        ((this.runningTick = !1),
        this.cancelScheduledCallback?.(),
        (this.cancelScheduledCallback = null),
        this.pendingRenderTaskId !== null)
      ) {
        const n = this.pendingRenderTaskId;
        (this.pendingRenderTaskId = null), this.taskService.remove(n);
      }
    }
    static \u0275fac = (r) => new (r || e)();
    static \u0275prov = z({ token: e, factory: e.\u0275fac, providedIn: 'root' });
  }
  return e;
})();
function sp() {
  return [
    { provide: Ae, useExisting: ip },
    { provide: ye, useClass: hn },
    { provide: _n, useValue: !0 },
  ];
}
function XE() {
  return (typeof $localize < 'u' && $localize.locale) || Yn;
}
var oc = new R('', { factory: () => D(oc, { optional: !0, skipSelf: !0 }) || XE() });
var Qo = class {
  destroyed = !1;
  listeners = null;
  errorHandler = D(xe, { optional: !0 });
  destroyRef = D(Pe);
  constructor() {
    this.destroyRef.onDestroy(() => {
      (this.destroyed = !0), (this.listeners = null);
    });
  }
  subscribe(t) {
    if (this.destroyed) throw new b(953, !1);
    return (
      (this.listeners ??= []).push(t),
      {
        unsubscribe: () => {
          const n = this.listeners?.indexOf(t);
          n !== void 0 && n !== -1 && this.listeners?.splice(n, 1);
        },
      }
    );
  }
  emit(t) {
    if (this.destroyed) {
      console.warn(gn(953, !1));
      return;
    }
    if (this.listeners === null) return;
    const n = g(null);
    try {
      for (const r of this.listeners)
        try {
          r(t);
        } catch (o) {
          this.errorHandler?.handleError(o);
        }
    } finally {
      g(n);
    }
  }
};
function eI(e, t) {
  return an(e, t?.equal);
}
var up = Symbol('InputSignalNode#UNSET'),
  nI = Z(Q({}, Sr), {
    transformFn: void 0,
    applyValueToInputSignal(e, t) {
      cn(e, t);
    },
  });
function dp(e, t) {
  const n = Object.create(nI);
  (n.value = e), (n.transformFn = t?.transform);
  function r() {
    if ((rn(n), n.value === up)) {
      const o = null;
      throw new b(-950, o);
    }
    return n.value;
  }
  return (r[$] = n), r;
}
var ap = class {
  attributeName;
  constructor(t) {
    this.attributeName = t;
  }
  __NG_ELEMENT_ID__ = () => Fu(this.attributeName);
  toString() {
    return `HostAttributeToken ${this.attributeName}`;
  }
};
function Yk(_e) {
  return new Qo();
}
function cp(e, t) {
  return dp(e, t);
}
function rI(e) {
  return dp(up, e);
}
var Kk = ((cp.required = rI), cp);
function lp(_e, t) {
  return ff(t);
}
function oI(_e, t) {
  return pf(t);
}
var Jk = ((lp.required = oI), lp);
var ic = new R(''),
  iI = new R('');
function Kn(e) {
  return !e.moduleRef;
}
function sI(e) {
  const t = Kn(e) ? e.r3Injector : e.moduleRef.injector,
    n = t.get(ye);
  return n.run(() => {
    Kn(e) ? e.r3Injector.resolveInjectorInitializers() : e.moduleRef.resolveInjectorInitializers();
    let r = t.get(Ye),
      o;
    if (
      (n.runOutsideAngular(() => {
        o = n.onError.subscribe({ next: r });
      }),
      Kn(e))
    ) {
      const i = () => t.destroy(),
        s = e.platformInjector.get(ic);
      s.add(i),
        t.onDestroy(() => {
          o.unsubscribe(), s.delete(i);
        });
    } else {
      const i = () => e.moduleRef.destroy(),
        s = e.platformInjector.get(ic);
      s.add(i),
        e.moduleRef.onDestroy(() => {
          xn(e.allPlatformModules, e.moduleRef), o.unsubscribe(), s.delete(i);
        });
    }
    return cI(r, n, () => {
      const i = t.get(Et),
        s = i.add(),
        a = t.get(Qa);
      return (
        a.runInitializers(),
        a.donePromise
          .then(() => {
            const c = t.get(oc, Yn);
            if ((kf(c || Yn), !t.get(iI, !0)))
              return Kn(e) ? t.get(zo) : (e.allPlatformModules.push(e.moduleRef), e.moduleRef);
            if (Kn(e)) {
              const u = t.get(zo);
              return e.rootComponent !== void 0 && u.bootstrap(e.rootComponent), u;
            } else return aI?.(e.moduleRef, e.allPlatformModules), e.moduleRef;
          })
          .finally(() => {
            i.remove(s);
          })
      );
    });
  });
}
var aI;
function cI(e, t, n) {
  try {
    const r = n();
    return za(r)
      ? r.catch((o) => {
          throw (t.runOutsideAngular(() => e(o)), o);
        })
      : r;
  } catch (r) {
    throw (t.runOutsideAngular(() => e(r)), r);
  }
}
var Zo = null;
function lI(e = [], t) {
  return me.create({
    name: t,
    providers: [{ provide: es, useValue: 'platform' }, { provide: ic, useValue: new Set([() => (Zo = null)]) }, ...e],
  });
}
function uI(e = []) {
  if (Zo) return Zo;
  const t = lI(e);
  return (Zo = t), Tf(), dI(t), t;
}
function dI(e) {
  const t = e.get(Wu, null);
  zr(e, () => {
    t?.forEach((n) => n());
  });
}
var fI = 1e4;
var _Xk = fI - 1e3;
var eO = (() => {
  class e {
    static __NG_ELEMENT_ID__ = pI;
  }
  return e;
})();
function pI(e) {
  return hI(H(), m(), (e & 16) === 16);
}
function hI(e, t, n) {
  if (ze(e) && !n) {
    const r = se(e.index, t);
    return new Ke(r, r);
  } else if (e.type & 175) {
    const r = t[J];
    return new Ke(r, t);
  }
  return null;
}
function tO(e) {
  const { rootComponent: t, appProviders: n, platformProviders: r, platformRef: o } = e;
  A(_.BootstrapApplicationStart);
  try {
    const i = o?.injector ?? uI(r),
      s = [sp(), Hl, ...(n || [])],
      a = new Fn({ providers: s, parent: i, debugName: '', runEnvironmentInitializers: !1 });
    return sI({ r3Injector: a.injector, platformInjector: i, rootComponent: t });
  } catch (i) {
    return Promise.reject(i);
  } finally {
    A(_.BootstrapApplicationEnd);
  }
}
function nO(e) {
  return typeof e === 'boolean' ? e : e != null && e !== 'false';
}
function rO(e) {
  const t = Re(e);
  if (!t) return null;
  const n = new bt(t);
  return {
    get selector() {
      return n.selector;
    },
    get type() {
      return n.componentType;
    },
    get inputs() {
      return n.inputs;
    },
    get outputs() {
      return n.outputs;
    },
    get ngContentSelectors() {
      return n.ngContentSelectors;
    },
    get isStandalone() {
      return t.standalone;
    },
    get isSignal() {
      return t.signals;
    },
  };
}

export {
  _a as Ga,
  _e as ea,
  _f as ob,
  _v as bb,
  $E as Yb,
  $f as Lb,
  $g as Ea,
  $v as jb,
  Ae as ka,
  Af as wb,
  Am as Na,
  As as la,
  ai as u,
  ap as gc,
  B as f,
  Bg as Da,
  Bl as ma,
  Bn as ra,
  Bv as ib,
  b as L,
  bf as fb,
  bp as g,
  bv as $a,
  CE as Nb,
  Cg as pa,
  Cp as q,
  Ct as ya,
  cE as Gb,
  ci as y,
  D as T,
  Dv as _a,
  dd as Ka,
  dE as Kb,
  El as Y,
  Et as da,
  ec as Qb,
  eE as xb,
  eh as G,
  eI as fc,
  en as j,
  eO as kc,
  ep as Tb,
  es as V,
  FE as Wb,
  Ff as Eb,
  Fp as o,
  Fu as qa,
  Go as Xa,
  Gr as U,
  Gv as nb,
  ge as S,
  gf as Za,
  gI as c,
  gm as Ma,
  gn as M,
  He as l,
  Hg as Ca,
  hf as Ya,
  hh as Q,
  hm as La,
  Il as Z,
  iE as Cb,
  io as ja,
  Ja as sb,
  JE as dc,
  Je as p,
  Jf as Rb,
  Jk as jc,
  Jp as E,
  jE as Xb,
  jf as Fb,
  jv as db,
  Ka as qb,
  KE as cc,
  Kf as Pb,
  Kk as ic,
  Kp as D,
  Kt as za,
  Kv as vb,
  kE as Ob,
  kg as wa,
  kl as $,
  km as Sa,
  ky as Ua,
  LE as Ub,
  Ln as Ta,
  Lp as n,
  lE as Hb,
  li as A,
  Me as i,
  Mf as hb,
  Mv as ab,
  me as aa,
  mI as d,
  Nf as rb,
  nh as I,
  nn as k,
  nO as mc,
  Of as zb,
  Og as xa,
  oc as ec,
  oh as K,
  oo as ba,
  ot as t,
  Pe as ca,
  Pf as Ab,
  Pp as m,
  Py as Wa,
  Q as a,
  Qc as P,
  Qp as x,
  qE as _b,
  qh as ia,
  qn as Qa,
  qv as lb,
  R,
  Rf as yb,
  Rg as va,
  Rl as _,
  Rn as Pa,
  Rs as na,
  rE as Bb,
  re as W,
  rg as oa,
  rh as J,
  rO as nc,
  rt as r,
  Sf as ub,
  Sg as sa,
  sd as Ha,
  sE as Db,
  To as Oa,
  Tr as v,
  th as H,
  tO as lc,
  tp as Vb,
  UE as Zb,
  Uf as Mb,
  Ug as Fa,
  Un as Ia,
  Uv as kb,
  uE as Jb,
  ui as C,
  um as Ja,
  Vf as Ib,
  Vg as Ba,
  Vo as Aa,
  Vr as N,
  vf as cb,
  Wp as s,
  Wu as ua,
  Wv as mb,
  w as h,
  wr as z,
  wt as Ra,
  Xa as tb,
  Xf as Sb,
  Xp as F,
  xe as ga,
  xg as ta,
  Ya as pb,
  YE as bc,
  Ye as ha,
  Yk as hc,
  ye as fa,
  yI as e,
  Z as b,
  ZE as ac,
  Zn as Va,
  Zp as B,
  z as O,
  za as eb,
  zE as $b,
  zo as gb,
  zp as w,
  zr as X,
};
