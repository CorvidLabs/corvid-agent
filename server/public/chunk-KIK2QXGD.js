import {
  hb as As,
  _ as Ba,
  Ab as Ga,
  Mb as Ha,
  hc as Jl,
  ub as ka,
  tb as ki,
  a as Oa,
  O as ql,
  sb as qn,
  Na as Va,
  Ob as Wa,
  ic as Xa,
  b as Xl,
  ja as Yl,
  _a as Zl,
  $ as za,
} from './chunk-LF4EWAJA.js';

var $l = 'view_mode_',
  Kl = class i {
    modes = new Map();
    getMode(e) {
      return this.modes.has(e) || this.modes.set(e, Yl(this.load(e))), this.modes.get(e);
    }
    setMode(e, t) {
      this.getMode(e).set(t), this.save(e, t);
    }
    load(e) {
      return typeof localStorage > 'u' ? 'basic' : localStorage.getItem($l + e) === '3d' ? '3d' : 'basic';
    }
    save(e, t) {
      typeof localStorage < 'u' && localStorage.setItem($l + e, t);
    }
    static \u0275fac = (t) => new (t || i)();
    static \u0275prov = ql({ token: i, factory: i.\u0275fac, providedIn: 'root' });
  };
var Ql = class i {
  mode = Xa.required();
  ariaLabel = Xa('View mode');
  modeChange = Jl();
  static \u0275fac = (t) => new (t || i)();
  static \u0275cmp = Zl({
    type: i,
    selectors: [['app-view-mode-toggle']],
    inputs: { mode: [1, 'mode'], ariaLabel: [1, 'ariaLabel'] },
    outputs: { modeChange: 'modeChange' },
    decls: 15,
    vars: 7,
    consts: [
      ['role', 'tablist', 1, 'view-toggle'],
      ['role', 'tab', 'title', 'Stats view \u2014 lightweight, accessible', 1, 'view-toggle__btn', 3, 'click'],
      ['viewBox', '0 0 16 16', 'fill', 'none', 'stroke', 'currentColor', 'stroke-width', '1.5', 1, 'view-toggle__icon'],
      ['x', '2', 'y', '2', 'width', '5', 'height', '5', 'rx', '1'],
      ['x', '9', 'y', '2', 'width', '5', 'height', '5', 'rx', '1'],
      ['x', '2', 'y', '9', 'width', '5', 'height', '5', 'rx', '1'],
      ['x', '9', 'y', '9', 'width', '5', 'height', '5', 'rx', '1'],
      [1, 'view-toggle__label'],
      ['role', 'tab', 'title', '3D experience \u2014 interactive Three.js scene', 1, 'view-toggle__btn', 3, 'click'],
      ['d', 'M8 1L14.5 4.75V11.25L8 15L1.5 11.25V4.75L8 1Z'],
      ['d', 'M8 1V8M8 8L14.5 4.75M8 8L1.5 4.75M8 8V15', 'opacity', '0.5'],
    ],
    template: (t, n) => {
      t & 1 &&
        (qn(0, 'div', 0)(1, 'button', 1),
        Ga('click', () => n.modeChange.emit('basic')),
        Ba(),
        qn(2, 'svg', 2),
        ka(3, 'rect', 3)(4, 'rect', 4)(5, 'rect', 5)(6, 'rect', 6),
        ki(),
        za(),
        qn(7, 'span', 7),
        Wa(8, 'Basic'),
        ki()(),
        qn(9, 'button', 8),
        Ga('click', () => n.modeChange.emit('3d')),
        Ba(),
        qn(10, 'svg', 2),
        ka(11, 'path', 9)(12, 'path', 10),
        ki(),
        za(),
        qn(13, 'span', 7),
        Wa(14, '3D'),
        ki()()()),
        t & 2 &&
          (As('aria-label', n.ariaLabel()),
          Va(),
          Ha('view-toggle__btn--active', n.mode() === 'basic'),
          As('aria-selected', n.mode() === 'basic'),
          Va(8),
          Ha('view-toggle__btn--active', n.mode() === '3d'),
          As('aria-selected', n.mode() === '3d'));
    },
    styles: [
      '.view-toggle[_ngcontent-%COMP%]{display:inline-flex;gap:0;background:var(--glass-bg-solid, rgba(20, 21, 30, .9));border:1px solid var(--border-subtle, #1a1a2e);border-radius:6px;overflow:hidden}.view-toggle__btn[_ngcontent-%COMP%]{display:flex;align-items:center;gap:4px;padding:.3rem .7rem;font-size:.68rem;font-weight:600;font-family:inherit;letter-spacing:.03em;text-transform:uppercase;background:transparent;border:none;color:var(--text-secondary, #888);cursor:pointer;transition:color .15s,background .15s}.view-toggle__btn[_ngcontent-%COMP%]:hover{color:var(--text-primary, #e0e0e0);background:var(--bg-hover, rgba(255, 255, 255, .04))}.view-toggle__btn--active[_ngcontent-%COMP%]{color:var(--accent-cyan, #00e5ff);background:var(--accent-cyan-subtle, rgba(0, 229, 255, .08));text-shadow:0 0 8px var(--accent-cyan-border, rgba(0, 229, 255, .3))}.view-toggle__icon[_ngcontent-%COMP%]{width:14px;height:14px;flex-shrink:0}.view-toggle__label[_ngcontent-%COMP%]{white-space:nowrap}@media(max-width:480px){.view-toggle__label[_ngcontent-%COMP%]{display:none}.view-toggle__btn[_ngcontent-%COMP%]{padding:.3rem .5rem}}',
    ],
    changeDetection: 0,
  });
};
var Ec = 0,
  $o = 1,
  wc = 2;
var fs = 1,
  Cc = 2,
  Ni = 3,
  yn = 0,
  Ct = 1,
  rn = 2,
  an = 0,
  jn = 1,
  Ko = 2,
  Qo = 3,
  jo = 4,
  Rc = 5;
var Ln = 100,
  Ic = 101,
  Pc = 102,
  Lc = 103,
  Dc = 104,
  Uc = 200,
  Nc = 201,
  Fc = 202,
  Oc = 203,
  er = 204,
  tr = 205,
  Bc = 206,
  zc = 207,
  Vc = 208,
  kc = 209,
  Gc = 210,
  Hc = 211,
  Wc = 212,
  Xc = 213,
  qc = 214,
  nr = 0,
  ir = 1,
  sr = 2,
  ei = 3,
  rr = 4,
  ar = 5,
  or = 6,
  lr = 7,
  el = 0,
  Yc = 1,
  Zc = 2,
  Yt = 0,
  tl = 1,
  nl = 2,
  il = 3,
  sl = 4,
  rl = 5,
  al = 6,
  ol = 7;
var yo = 300,
  Vn = 301,
  ii = 302,
  Vr = 303,
  kr = 304,
  ps = 306,
  cr = 1e3,
  tn = 1001,
  hr = 1002,
  vt = 1003,
  Jc = 1004;
var ms = 1005;
var Mt = 1006,
  Gr = 1007;
var kn = 1008;
var It = 1009,
  ll = 1010,
  cl = 1011,
  Fi = 1012,
  Hr = 1013,
  Zt = 1014,
  Jt = 1015,
  on = 1016,
  Wr = 1017,
  Xr = 1018,
  Oi = 1020,
  hl = 35902,
  ul = 35899,
  dl = 1021,
  fl = 1022,
  Vt = 1023,
  nn = 1026,
  Gn = 1027,
  pl = 1028,
  qr = 1029,
  si = 1030,
  Yr = 1031;
var Zr = 1033,
  gs = 33776,
  _s = 33777,
  xs = 33778,
  vs = 33779,
  Jr = 35840,
  $r = 35841,
  Kr = 35842,
  Qr = 35843,
  jr = 36196,
  ea = 37492,
  ta = 37496,
  na = 37488,
  ia = 37489,
  sa = 37490,
  ra = 37491,
  aa = 37808,
  oa = 37809,
  la = 37810,
  ca = 37811,
  ha = 37812,
  ua = 37813,
  da = 37814,
  fa = 37815,
  pa = 37816,
  ma = 37817,
  ga = 37818,
  _a = 37819,
  xa = 37820,
  va = 37821,
  ya = 36492,
  Ma = 36494,
  Sa = 36495,
  ba = 36283,
  Ta = 36284,
  Aa = 36285,
  Ea = 36286;
var $i = 2300,
  ur = 2301,
  js = 2302,
  Mo = 2303,
  So = 2400,
  bo = 2401,
  To = 2402;
var $c = 3200;
var ml = 0,
  Kc = 1,
  Sn = '',
  Ut = 'srgb',
  ti = 'srgb-linear',
  Ki = 'linear',
  Ye = 'srgb';
var Kn = 7680;
var Ao = 519,
  Qc = 512,
  jc = 513,
  eh = 514,
  wa = 515,
  th = 516,
  nh = 517,
  Ca = 518,
  ih = 519,
  dr = 35044;
var gl = '300 es',
  Xt = 2e3,
  Ci = 2001;
function Yh(i) {
  for (let e = i.length - 1; e >= 0; --e) if (i[e] >= 65535) return !0;
  return !1;
}
function Zh(i) {
  return ArrayBuffer.isView(i) && !(i instanceof DataView);
}
function Qi(i) {
  return document.createElementNS('http://www.w3.org/1999/xhtml', i);
}
function sh() {
  const i = Qi('canvas');
  return (i.style.display = 'block'), i;
}
var jl = {},
  Ri = null;
function ji(...i) {
  const e = `THREE.${i.shift()}`;
  Ri ? Ri('log', e, ...i) : console.log(e, ...i);
}
function rh(i) {
  const e = i[0];
  if (typeof e === 'string' && e.startsWith('TSL:')) {
    const t = i[1];
    t?.isStackTrace
      ? (i[0] += ` ${t.getLocation()}`)
      : (i[1] = 'Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.');
  }
  return i;
}
function Ee(...i) {
  i = rh(i);
  const e = `THREE.${i.shift()}`;
  if (Ri) Ri('warn', e, ...i);
  else {
    const t = i[0];
    t?.isStackTrace ? console.warn(t.getError(e)) : console.warn(e, ...i);
  }
}
function Ae(...i) {
  i = rh(i);
  const e = `THREE.${i.shift()}`;
  if (Ri) Ri('error', e, ...i);
  else {
    const t = i[0];
    t?.isStackTrace ? console.error(t.getError(e)) : console.error(e, ...i);
  }
}
function es(...i) {
  const e = i.join(' ');
  e in jl || ((jl[e] = !0), Ee(...i));
}
function ah(i, e, t) {
  return new Promise((n, s) => {
    function r() {
      switch (i.clientWaitSync(e, i.SYNC_FLUSH_COMMANDS_BIT, 0)) {
        case i.WAIT_FAILED:
          s();
          break;
        case i.TIMEOUT_EXPIRED:
          setTimeout(r, t);
          break;
        default:
          n();
      }
    }
    setTimeout(r, t);
  });
}
var oh = { [nr]: ir, [sr]: or, [rr]: lr, [ei]: ar, [ir]: nr, [or]: sr, [lr]: rr, [ar]: ei },
  Mn = class {
    addEventListener(e, t) {
      this._listeners === void 0 && (this._listeners = {});
      const n = this._listeners;
      n[e] === void 0 && (n[e] = []), n[e].indexOf(t) === -1 && n[e].push(t);
    }
    hasEventListener(e, t) {
      const n = this._listeners;
      return n === void 0 ? !1 : n[e] !== void 0 && n[e].indexOf(t) !== -1;
    }
    removeEventListener(e, t) {
      const n = this._listeners;
      if (n === void 0) return;
      const s = n[e];
      if (s !== void 0) {
        const r = s.indexOf(t);
        r !== -1 && s.splice(r, 1);
      }
    }
    dispatchEvent(e) {
      const t = this._listeners;
      if (t === void 0) return;
      const n = t[e.type];
      if (n !== void 0) {
        e.target = this;
        const s = n.slice(0);
        for (let r = 0, a = s.length; r < a; r++) s[r].call(this, e);
        e.target = null;
      }
    }
  },
  bt = [
    '00',
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '0a',
    '0b',
    '0c',
    '0d',
    '0e',
    '0f',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '1a',
    '1b',
    '1c',
    '1d',
    '1e',
    '1f',
    '20',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
    '29',
    '2a',
    '2b',
    '2c',
    '2d',
    '2e',
    '2f',
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '39',
    '3a',
    '3b',
    '3c',
    '3d',
    '3e',
    '3f',
    '40',
    '41',
    '42',
    '43',
    '44',
    '45',
    '46',
    '47',
    '48',
    '49',
    '4a',
    '4b',
    '4c',
    '4d',
    '4e',
    '4f',
    '50',
    '51',
    '52',
    '53',
    '54',
    '55',
    '56',
    '57',
    '58',
    '59',
    '5a',
    '5b',
    '5c',
    '5d',
    '5e',
    '5f',
    '60',
    '61',
    '62',
    '63',
    '64',
    '65',
    '66',
    '67',
    '68',
    '69',
    '6a',
    '6b',
    '6c',
    '6d',
    '6e',
    '6f',
    '70',
    '71',
    '72',
    '73',
    '74',
    '75',
    '76',
    '77',
    '78',
    '79',
    '7a',
    '7b',
    '7c',
    '7d',
    '7e',
    '7f',
    '80',
    '81',
    '82',
    '83',
    '84',
    '85',
    '86',
    '87',
    '88',
    '89',
    '8a',
    '8b',
    '8c',
    '8d',
    '8e',
    '8f',
    '90',
    '91',
    '92',
    '93',
    '94',
    '95',
    '96',
    '97',
    '98',
    '99',
    '9a',
    '9b',
    '9c',
    '9d',
    '9e',
    '9f',
    'a0',
    'a1',
    'a2',
    'a3',
    'a4',
    'a5',
    'a6',
    'a7',
    'a8',
    'a9',
    'aa',
    'ab',
    'ac',
    'ad',
    'ae',
    'af',
    'b0',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'b6',
    'b7',
    'b8',
    'b9',
    'ba',
    'bb',
    'bc',
    'bd',
    'be',
    'bf',
    'c0',
    'c1',
    'c2',
    'c3',
    'c4',
    'c5',
    'c6',
    'c7',
    'c8',
    'c9',
    'ca',
    'cb',
    'cc',
    'cd',
    'ce',
    'cf',
    'd0',
    'd1',
    'd2',
    'd3',
    'd4',
    'd5',
    'd6',
    'd7',
    'd8',
    'd9',
    'da',
    'db',
    'dc',
    'dd',
    'de',
    'df',
    'e0',
    'e1',
    'e2',
    'e3',
    'e4',
    'e5',
    'e6',
    'e7',
    'e8',
    'e9',
    'ea',
    'eb',
    'ec',
    'ed',
    'ee',
    'ef',
    'f0',
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6',
    'f7',
    'f8',
    'f9',
    'fa',
    'fb',
    'fc',
    'fd',
    'fe',
    'ff',
  ];
var qa = Math.PI / 180,
  fr = 180 / Math.PI;
function Pn() {
  const i = (Math.random() * 4294967295) | 0,
    e = (Math.random() * 4294967295) | 0,
    t = (Math.random() * 4294967295) | 0,
    n = (Math.random() * 4294967295) | 0;
  return (
    bt[i & 255] +
    bt[(i >> 8) & 255] +
    bt[(i >> 16) & 255] +
    bt[(i >> 24) & 255] +
    '-' +
    bt[e & 255] +
    bt[(e >> 8) & 255] +
    '-' +
    bt[((e >> 16) & 15) | 64] +
    bt[(e >> 24) & 255] +
    '-' +
    bt[(t & 63) | 128] +
    bt[(t >> 8) & 255] +
    '-' +
    bt[(t >> 16) & 255] +
    bt[(t >> 24) & 255] +
    bt[n & 255] +
    bt[(n >> 8) & 255] +
    bt[(n >> 16) & 255] +
    bt[(n >> 24) & 255]
  ).toLowerCase();
}
function ke(i, e, t) {
  return Math.max(e, Math.min(t, i));
}
function Jh(i, e) {
  return ((i % e) + e) % e;
}
function Ya(i, e, t) {
  return (1 - t) * i + t * e;
}
function en(i, e) {
  switch (e.constructor) {
    case Float32Array:
      return i;
    case Uint32Array:
      return i / 4294967295;
    case Uint16Array:
      return i / 65535;
    case Uint8Array:
      return i / 255;
    case Int32Array:
      return Math.max(i / 2147483647, -1);
    case Int16Array:
      return Math.max(i / 32767, -1);
    case Int8Array:
      return Math.max(i / 127, -1);
    default:
      throw new Error('Invalid component type.');
  }
}
function Qe(i, e) {
  switch (e.constructor) {
    case Float32Array:
      return i;
    case Uint32Array:
      return Math.round(i * 4294967295);
    case Uint16Array:
      return Math.round(i * 65535);
    case Uint8Array:
      return Math.round(i * 255);
    case Int32Array:
      return Math.round(i * 2147483647);
    case Int16Array:
      return Math.round(i * 32767);
    case Int8Array:
      return Math.round(i * 127);
    default:
      throw new Error('Invalid component type.');
  }
}
var Re = class i {
    constructor(e = 0, t = 0) {
      (i.prototype.isVector2 = !0), (this.x = e), (this.y = t);
    }
    get width() {
      return this.x;
    }
    set width(e) {
      this.x = e;
    }
    get height() {
      return this.y;
    }
    set height(e) {
      this.y = e;
    }
    set(e, t) {
      return (this.x = e), (this.y = t), this;
    }
    setScalar(e) {
      return (this.x = e), (this.y = e), this;
    }
    setX(e) {
      return (this.x = e), this;
    }
    setY(e) {
      return (this.y = e), this;
    }
    setComponent(e, t) {
      switch (e) {
        case 0:
          this.x = t;
          break;
        case 1:
          this.y = t;
          break;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
      return this;
    }
    getComponent(e) {
      switch (e) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
    }
    clone() {
      return new this.constructor(this.x, this.y);
    }
    copy(e) {
      return (this.x = e.x), (this.y = e.y), this;
    }
    add(e) {
      return (this.x += e.x), (this.y += e.y), this;
    }
    addScalar(e) {
      return (this.x += e), (this.y += e), this;
    }
    addVectors(e, t) {
      return (this.x = e.x + t.x), (this.y = e.y + t.y), this;
    }
    addScaledVector(e, t) {
      return (this.x += e.x * t), (this.y += e.y * t), this;
    }
    sub(e) {
      return (this.x -= e.x), (this.y -= e.y), this;
    }
    subScalar(e) {
      return (this.x -= e), (this.y -= e), this;
    }
    subVectors(e, t) {
      return (this.x = e.x - t.x), (this.y = e.y - t.y), this;
    }
    multiply(e) {
      return (this.x *= e.x), (this.y *= e.y), this;
    }
    multiplyScalar(e) {
      return (this.x *= e), (this.y *= e), this;
    }
    divide(e) {
      return (this.x /= e.x), (this.y /= e.y), this;
    }
    divideScalar(e) {
      return this.multiplyScalar(1 / e);
    }
    applyMatrix3(e) {
      const t = this.x,
        n = this.y,
        s = e.elements;
      return (this.x = s[0] * t + s[3] * n + s[6]), (this.y = s[1] * t + s[4] * n + s[7]), this;
    }
    min(e) {
      return (this.x = Math.min(this.x, e.x)), (this.y = Math.min(this.y, e.y)), this;
    }
    max(e) {
      return (this.x = Math.max(this.x, e.x)), (this.y = Math.max(this.y, e.y)), this;
    }
    clamp(e, t) {
      return (this.x = ke(this.x, e.x, t.x)), (this.y = ke(this.y, e.y, t.y)), this;
    }
    clampScalar(e, t) {
      return (this.x = ke(this.x, e, t)), (this.y = ke(this.y, e, t)), this;
    }
    clampLength(e, t) {
      const n = this.length();
      return this.divideScalar(n || 1).multiplyScalar(ke(n, e, t));
    }
    floor() {
      return (this.x = Math.floor(this.x)), (this.y = Math.floor(this.y)), this;
    }
    ceil() {
      return (this.x = Math.ceil(this.x)), (this.y = Math.ceil(this.y)), this;
    }
    round() {
      return (this.x = Math.round(this.x)), (this.y = Math.round(this.y)), this;
    }
    roundToZero() {
      return (this.x = Math.trunc(this.x)), (this.y = Math.trunc(this.y)), this;
    }
    negate() {
      return (this.x = -this.x), (this.y = -this.y), this;
    }
    dot(e) {
      return this.x * e.x + this.y * e.y;
    }
    cross(e) {
      return this.x * e.y - this.y * e.x;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y;
    }
    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y);
    }
    normalize() {
      return this.divideScalar(this.length() || 1);
    }
    angle() {
      return Math.atan2(-this.y, -this.x) + Math.PI;
    }
    angleTo(e) {
      const t = Math.sqrt(this.lengthSq() * e.lengthSq());
      if (t === 0) return Math.PI / 2;
      const n = this.dot(e) / t;
      return Math.acos(ke(n, -1, 1));
    }
    distanceTo(e) {
      return Math.sqrt(this.distanceToSquared(e));
    }
    distanceToSquared(e) {
      const t = this.x - e.x,
        n = this.y - e.y;
      return t * t + n * n;
    }
    manhattanDistanceTo(e) {
      return Math.abs(this.x - e.x) + Math.abs(this.y - e.y);
    }
    setLength(e) {
      return this.normalize().multiplyScalar(e);
    }
    lerp(e, t) {
      return (this.x += (e.x - this.x) * t), (this.y += (e.y - this.y) * t), this;
    }
    lerpVectors(e, t, n) {
      return (this.x = e.x + (t.x - e.x) * n), (this.y = e.y + (t.y - e.y) * n), this;
    }
    equals(e) {
      return e.x === this.x && e.y === this.y;
    }
    fromArray(e, t = 0) {
      return (this.x = e[t]), (this.y = e[t + 1]), this;
    }
    toArray(e = [], t = 0) {
      return (e[t] = this.x), (e[t + 1] = this.y), e;
    }
    fromBufferAttribute(e, t) {
      return (this.x = e.getX(t)), (this.y = e.getY(t)), this;
    }
    rotateAround(e, t) {
      const n = Math.cos(t),
        s = Math.sin(t),
        r = this.x - e.x,
        a = this.y - e.y;
      return (this.x = r * n - a * s + e.x), (this.y = r * s + a * n + e.y), this;
    }
    random() {
      return (this.x = Math.random()), (this.y = Math.random()), this;
    }
    *[Symbol.iterator]() {
      yield this.x, yield this.y;
    }
  },
  sn = class {
    constructor(e = 0, t = 0, n = 0, s = 1) {
      (this.isQuaternion = !0), (this._x = e), (this._y = t), (this._z = n), (this._w = s);
    }
    static slerpFlat(e, t, n, s, r, a, o) {
      let c = n[s + 0],
        l = n[s + 1],
        d = n[s + 2],
        m = n[s + 3],
        h = r[a + 0],
        f = r[a + 1],
        g = r[a + 2],
        y = r[a + 3];
      if (m !== y || c !== h || l !== f || d !== g) {
        let p = c * h + l * f + d * g + m * y;
        p < 0 && ((h = -h), (f = -f), (g = -g), (y = -y), (p = -p));
        let u = 1 - o;
        if (p < 0.9995) {
          const v = Math.acos(p),
            T = Math.sin(v);
          (u = Math.sin(u * v) / T),
            (o = Math.sin(o * v) / T),
            (c = c * u + h * o),
            (l = l * u + f * o),
            (d = d * u + g * o),
            (m = m * u + y * o);
        } else {
          (c = c * u + h * o), (l = l * u + f * o), (d = d * u + g * o), (m = m * u + y * o);
          const v = 1 / Math.sqrt(c * c + l * l + d * d + m * m);
          (c *= v), (l *= v), (d *= v), (m *= v);
        }
      }
      (e[t] = c), (e[t + 1] = l), (e[t + 2] = d), (e[t + 3] = m);
    }
    static multiplyQuaternionsFlat(e, t, n, s, r, a) {
      const o = n[s],
        c = n[s + 1],
        l = n[s + 2],
        d = n[s + 3],
        m = r[a],
        h = r[a + 1],
        f = r[a + 2],
        g = r[a + 3];
      return (
        (e[t] = o * g + d * m + c * f - l * h),
        (e[t + 1] = c * g + d * h + l * m - o * f),
        (e[t + 2] = l * g + d * f + o * h - c * m),
        (e[t + 3] = d * g - o * m - c * h - l * f),
        e
      );
    }
    get x() {
      return this._x;
    }
    set x(e) {
      (this._x = e), this._onChangeCallback();
    }
    get y() {
      return this._y;
    }
    set y(e) {
      (this._y = e), this._onChangeCallback();
    }
    get z() {
      return this._z;
    }
    set z(e) {
      (this._z = e), this._onChangeCallback();
    }
    get w() {
      return this._w;
    }
    set w(e) {
      (this._w = e), this._onChangeCallback();
    }
    set(e, t, n, s) {
      return (this._x = e), (this._y = t), (this._z = n), (this._w = s), this._onChangeCallback(), this;
    }
    clone() {
      return new this.constructor(this._x, this._y, this._z, this._w);
    }
    copy(e) {
      return (this._x = e.x), (this._y = e.y), (this._z = e.z), (this._w = e.w), this._onChangeCallback(), this;
    }
    setFromEuler(e, t = !0) {
      const n = e._x,
        s = e._y,
        r = e._z,
        a = e._order,
        o = Math.cos,
        c = Math.sin,
        l = o(n / 2),
        d = o(s / 2),
        m = o(r / 2),
        h = c(n / 2),
        f = c(s / 2),
        g = c(r / 2);
      switch (a) {
        case 'XYZ':
          (this._x = h * d * m + l * f * g),
            (this._y = l * f * m - h * d * g),
            (this._z = l * d * g + h * f * m),
            (this._w = l * d * m - h * f * g);
          break;
        case 'YXZ':
          (this._x = h * d * m + l * f * g),
            (this._y = l * f * m - h * d * g),
            (this._z = l * d * g - h * f * m),
            (this._w = l * d * m + h * f * g);
          break;
        case 'ZXY':
          (this._x = h * d * m - l * f * g),
            (this._y = l * f * m + h * d * g),
            (this._z = l * d * g + h * f * m),
            (this._w = l * d * m - h * f * g);
          break;
        case 'ZYX':
          (this._x = h * d * m - l * f * g),
            (this._y = l * f * m + h * d * g),
            (this._z = l * d * g - h * f * m),
            (this._w = l * d * m + h * f * g);
          break;
        case 'YZX':
          (this._x = h * d * m + l * f * g),
            (this._y = l * f * m + h * d * g),
            (this._z = l * d * g - h * f * m),
            (this._w = l * d * m - h * f * g);
          break;
        case 'XZY':
          (this._x = h * d * m - l * f * g),
            (this._y = l * f * m - h * d * g),
            (this._z = l * d * g + h * f * m),
            (this._w = l * d * m + h * f * g);
          break;
        default:
          Ee(`Quaternion: .setFromEuler() encountered an unknown order: ${a}`);
      }
      return t === !0 && this._onChangeCallback(), this;
    }
    setFromAxisAngle(e, t) {
      const n = t / 2,
        s = Math.sin(n);
      return (
        (this._x = e.x * s),
        (this._y = e.y * s),
        (this._z = e.z * s),
        (this._w = Math.cos(n)),
        this._onChangeCallback(),
        this
      );
    }
    setFromRotationMatrix(e) {
      const t = e.elements,
        n = t[0],
        s = t[4],
        r = t[8],
        a = t[1],
        o = t[5],
        c = t[9],
        l = t[2],
        d = t[6],
        m = t[10],
        h = n + o + m;
      if (h > 0) {
        const f = 0.5 / Math.sqrt(h + 1);
        (this._w = 0.25 / f), (this._x = (d - c) * f), (this._y = (r - l) * f), (this._z = (a - s) * f);
      } else if (n > o && n > m) {
        const f = 2 * Math.sqrt(1 + n - o - m);
        (this._w = (d - c) / f), (this._x = 0.25 * f), (this._y = (s + a) / f), (this._z = (r + l) / f);
      } else if (o > m) {
        const f = 2 * Math.sqrt(1 + o - n - m);
        (this._w = (r - l) / f), (this._x = (s + a) / f), (this._y = 0.25 * f), (this._z = (c + d) / f);
      } else {
        const f = 2 * Math.sqrt(1 + m - n - o);
        (this._w = (a - s) / f), (this._x = (r + l) / f), (this._y = (c + d) / f), (this._z = 0.25 * f);
      }
      return this._onChangeCallback(), this;
    }
    setFromUnitVectors(e, t) {
      let n = e.dot(t) + 1;
      return (
        n < 1e-8
          ? ((n = 0),
            Math.abs(e.x) > Math.abs(e.z)
              ? ((this._x = -e.y), (this._y = e.x), (this._z = 0), (this._w = n))
              : ((this._x = 0), (this._y = -e.z), (this._z = e.y), (this._w = n)))
          : ((this._x = e.y * t.z - e.z * t.y),
            (this._y = e.z * t.x - e.x * t.z),
            (this._z = e.x * t.y - e.y * t.x),
            (this._w = n)),
        this.normalize()
      );
    }
    angleTo(e) {
      return 2 * Math.acos(Math.abs(ke(this.dot(e), -1, 1)));
    }
    rotateTowards(e, t) {
      const n = this.angleTo(e);
      if (n === 0) return this;
      const s = Math.min(1, t / n);
      return this.slerp(e, s), this;
    }
    identity() {
      return this.set(0, 0, 0, 1);
    }
    invert() {
      return this.conjugate();
    }
    conjugate() {
      return (this._x *= -1), (this._y *= -1), (this._z *= -1), this._onChangeCallback(), this;
    }
    dot(e) {
      return this._x * e._x + this._y * e._y + this._z * e._z + this._w * e._w;
    }
    lengthSq() {
      return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
    }
    length() {
      return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
    }
    normalize() {
      let e = this.length();
      return (
        e === 0
          ? ((this._x = 0), (this._y = 0), (this._z = 0), (this._w = 1))
          : ((e = 1 / e),
            (this._x = this._x * e),
            (this._y = this._y * e),
            (this._z = this._z * e),
            (this._w = this._w * e)),
        this._onChangeCallback(),
        this
      );
    }
    multiply(e) {
      return this.multiplyQuaternions(this, e);
    }
    premultiply(e) {
      return this.multiplyQuaternions(e, this);
    }
    multiplyQuaternions(e, t) {
      const n = e._x,
        s = e._y,
        r = e._z,
        a = e._w,
        o = t._x,
        c = t._y,
        l = t._z,
        d = t._w;
      return (
        (this._x = n * d + a * o + s * l - r * c),
        (this._y = s * d + a * c + r * o - n * l),
        (this._z = r * d + a * l + n * c - s * o),
        (this._w = a * d - n * o - s * c - r * l),
        this._onChangeCallback(),
        this
      );
    }
    slerp(e, t) {
      let n = e._x,
        s = e._y,
        r = e._z,
        a = e._w,
        o = this.dot(e);
      o < 0 && ((n = -n), (s = -s), (r = -r), (a = -a), (o = -o));
      let c = 1 - t;
      if (o < 0.9995) {
        const l = Math.acos(o),
          d = Math.sin(l);
        (c = Math.sin(c * l) / d),
          (t = Math.sin(t * l) / d),
          (this._x = this._x * c + n * t),
          (this._y = this._y * c + s * t),
          (this._z = this._z * c + r * t),
          (this._w = this._w * c + a * t),
          this._onChangeCallback();
      } else
        (this._x = this._x * c + n * t),
          (this._y = this._y * c + s * t),
          (this._z = this._z * c + r * t),
          (this._w = this._w * c + a * t),
          this.normalize();
      return this;
    }
    slerpQuaternions(e, t, n) {
      return this.copy(e).slerp(t, n);
    }
    random() {
      const e = 2 * Math.PI * Math.random(),
        t = 2 * Math.PI * Math.random(),
        n = Math.random(),
        s = Math.sqrt(1 - n),
        r = Math.sqrt(n);
      return this.set(s * Math.sin(e), s * Math.cos(e), r * Math.sin(t), r * Math.cos(t));
    }
    equals(e) {
      return e._x === this._x && e._y === this._y && e._z === this._z && e._w === this._w;
    }
    fromArray(e, t = 0) {
      return (
        (this._x = e[t]),
        (this._y = e[t + 1]),
        (this._z = e[t + 2]),
        (this._w = e[t + 3]),
        this._onChangeCallback(),
        this
      );
    }
    toArray(e = [], t = 0) {
      return (e[t] = this._x), (e[t + 1] = this._y), (e[t + 2] = this._z), (e[t + 3] = this._w), e;
    }
    fromBufferAttribute(e, t) {
      return (
        (this._x = e.getX(t)),
        (this._y = e.getY(t)),
        (this._z = e.getZ(t)),
        (this._w = e.getW(t)),
        this._onChangeCallback(),
        this
      );
    }
    toJSON() {
      return this.toArray();
    }
    _onChange(e) {
      return (this._onChangeCallback = e), this;
    }
    _onChangeCallback() {}
    *[Symbol.iterator]() {
      yield this._x, yield this._y, yield this._z, yield this._w;
    }
  },
  L = class i {
    constructor(e = 0, t = 0, n = 0) {
      (i.prototype.isVector3 = !0), (this.x = e), (this.y = t), (this.z = n);
    }
    set(e, t, n) {
      return n === void 0 && (n = this.z), (this.x = e), (this.y = t), (this.z = n), this;
    }
    setScalar(e) {
      return (this.x = e), (this.y = e), (this.z = e), this;
    }
    setX(e) {
      return (this.x = e), this;
    }
    setY(e) {
      return (this.y = e), this;
    }
    setZ(e) {
      return (this.z = e), this;
    }
    setComponent(e, t) {
      switch (e) {
        case 0:
          this.x = t;
          break;
        case 1:
          this.y = t;
          break;
        case 2:
          this.z = t;
          break;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
      return this;
    }
    getComponent(e) {
      switch (e) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        case 2:
          return this.z;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
    }
    clone() {
      return new this.constructor(this.x, this.y, this.z);
    }
    copy(e) {
      return (this.x = e.x), (this.y = e.y), (this.z = e.z), this;
    }
    add(e) {
      return (this.x += e.x), (this.y += e.y), (this.z += e.z), this;
    }
    addScalar(e) {
      return (this.x += e), (this.y += e), (this.z += e), this;
    }
    addVectors(e, t) {
      return (this.x = e.x + t.x), (this.y = e.y + t.y), (this.z = e.z + t.z), this;
    }
    addScaledVector(e, t) {
      return (this.x += e.x * t), (this.y += e.y * t), (this.z += e.z * t), this;
    }
    sub(e) {
      return (this.x -= e.x), (this.y -= e.y), (this.z -= e.z), this;
    }
    subScalar(e) {
      return (this.x -= e), (this.y -= e), (this.z -= e), this;
    }
    subVectors(e, t) {
      return (this.x = e.x - t.x), (this.y = e.y - t.y), (this.z = e.z - t.z), this;
    }
    multiply(e) {
      return (this.x *= e.x), (this.y *= e.y), (this.z *= e.z), this;
    }
    multiplyScalar(e) {
      return (this.x *= e), (this.y *= e), (this.z *= e), this;
    }
    multiplyVectors(e, t) {
      return (this.x = e.x * t.x), (this.y = e.y * t.y), (this.z = e.z * t.z), this;
    }
    applyEuler(e) {
      return this.applyQuaternion(ec.setFromEuler(e));
    }
    applyAxisAngle(e, t) {
      return this.applyQuaternion(ec.setFromAxisAngle(e, t));
    }
    applyMatrix3(e) {
      const t = this.x,
        n = this.y,
        s = this.z,
        r = e.elements;
      return (
        (this.x = r[0] * t + r[3] * n + r[6] * s),
        (this.y = r[1] * t + r[4] * n + r[7] * s),
        (this.z = r[2] * t + r[5] * n + r[8] * s),
        this
      );
    }
    applyNormalMatrix(e) {
      return this.applyMatrix3(e).normalize();
    }
    applyMatrix4(e) {
      const t = this.x,
        n = this.y,
        s = this.z,
        r = e.elements,
        a = 1 / (r[3] * t + r[7] * n + r[11] * s + r[15]);
      return (
        (this.x = (r[0] * t + r[4] * n + r[8] * s + r[12]) * a),
        (this.y = (r[1] * t + r[5] * n + r[9] * s + r[13]) * a),
        (this.z = (r[2] * t + r[6] * n + r[10] * s + r[14]) * a),
        this
      );
    }
    applyQuaternion(e) {
      const t = this.x,
        n = this.y,
        s = this.z,
        r = e.x,
        a = e.y,
        o = e.z,
        c = e.w,
        l = 2 * (a * s - o * n),
        d = 2 * (o * t - r * s),
        m = 2 * (r * n - a * t);
      return (
        (this.x = t + c * l + a * m - o * d),
        (this.y = n + c * d + o * l - r * m),
        (this.z = s + c * m + r * d - a * l),
        this
      );
    }
    project(e) {
      return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix);
    }
    unproject(e) {
      return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld);
    }
    transformDirection(e) {
      const t = this.x,
        n = this.y,
        s = this.z,
        r = e.elements;
      return (
        (this.x = r[0] * t + r[4] * n + r[8] * s),
        (this.y = r[1] * t + r[5] * n + r[9] * s),
        (this.z = r[2] * t + r[6] * n + r[10] * s),
        this.normalize()
      );
    }
    divide(e) {
      return (this.x /= e.x), (this.y /= e.y), (this.z /= e.z), this;
    }
    divideScalar(e) {
      return this.multiplyScalar(1 / e);
    }
    min(e) {
      return (this.x = Math.min(this.x, e.x)), (this.y = Math.min(this.y, e.y)), (this.z = Math.min(this.z, e.z)), this;
    }
    max(e) {
      return (this.x = Math.max(this.x, e.x)), (this.y = Math.max(this.y, e.y)), (this.z = Math.max(this.z, e.z)), this;
    }
    clamp(e, t) {
      return (this.x = ke(this.x, e.x, t.x)), (this.y = ke(this.y, e.y, t.y)), (this.z = ke(this.z, e.z, t.z)), this;
    }
    clampScalar(e, t) {
      return (this.x = ke(this.x, e, t)), (this.y = ke(this.y, e, t)), (this.z = ke(this.z, e, t)), this;
    }
    clampLength(e, t) {
      const n = this.length();
      return this.divideScalar(n || 1).multiplyScalar(ke(n, e, t));
    }
    floor() {
      return (this.x = Math.floor(this.x)), (this.y = Math.floor(this.y)), (this.z = Math.floor(this.z)), this;
    }
    ceil() {
      return (this.x = Math.ceil(this.x)), (this.y = Math.ceil(this.y)), (this.z = Math.ceil(this.z)), this;
    }
    round() {
      return (this.x = Math.round(this.x)), (this.y = Math.round(this.y)), (this.z = Math.round(this.z)), this;
    }
    roundToZero() {
      return (this.x = Math.trunc(this.x)), (this.y = Math.trunc(this.y)), (this.z = Math.trunc(this.z)), this;
    }
    negate() {
      return (this.x = -this.x), (this.y = -this.y), (this.z = -this.z), this;
    }
    dot(e) {
      return this.x * e.x + this.y * e.y + this.z * e.z;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
    manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
    }
    normalize() {
      return this.divideScalar(this.length() || 1);
    }
    setLength(e) {
      return this.normalize().multiplyScalar(e);
    }
    lerp(e, t) {
      return (this.x += (e.x - this.x) * t), (this.y += (e.y - this.y) * t), (this.z += (e.z - this.z) * t), this;
    }
    lerpVectors(e, t, n) {
      return (this.x = e.x + (t.x - e.x) * n), (this.y = e.y + (t.y - e.y) * n), (this.z = e.z + (t.z - e.z) * n), this;
    }
    cross(e) {
      return this.crossVectors(this, e);
    }
    crossVectors(e, t) {
      const n = e.x,
        s = e.y,
        r = e.z,
        a = t.x,
        o = t.y,
        c = t.z;
      return (this.x = s * c - r * o), (this.y = r * a - n * c), (this.z = n * o - s * a), this;
    }
    projectOnVector(e) {
      const t = e.lengthSq();
      if (t === 0) return this.set(0, 0, 0);
      const n = e.dot(this) / t;
      return this.copy(e).multiplyScalar(n);
    }
    projectOnPlane(e) {
      return Za.copy(this).projectOnVector(e), this.sub(Za);
    }
    reflect(e) {
      return this.sub(Za.copy(e).multiplyScalar(2 * this.dot(e)));
    }
    angleTo(e) {
      const t = Math.sqrt(this.lengthSq() * e.lengthSq());
      if (t === 0) return Math.PI / 2;
      const n = this.dot(e) / t;
      return Math.acos(ke(n, -1, 1));
    }
    distanceTo(e) {
      return Math.sqrt(this.distanceToSquared(e));
    }
    distanceToSquared(e) {
      const t = this.x - e.x,
        n = this.y - e.y,
        s = this.z - e.z;
      return t * t + n * n + s * s;
    }
    manhattanDistanceTo(e) {
      return Math.abs(this.x - e.x) + Math.abs(this.y - e.y) + Math.abs(this.z - e.z);
    }
    setFromSpherical(e) {
      return this.setFromSphericalCoords(e.radius, e.phi, e.theta);
    }
    setFromSphericalCoords(e, t, n) {
      const s = Math.sin(t) * e;
      return (this.x = s * Math.sin(n)), (this.y = Math.cos(t) * e), (this.z = s * Math.cos(n)), this;
    }
    setFromCylindrical(e) {
      return this.setFromCylindricalCoords(e.radius, e.theta, e.y);
    }
    setFromCylindricalCoords(e, t, n) {
      return (this.x = e * Math.sin(t)), (this.y = n), (this.z = e * Math.cos(t)), this;
    }
    setFromMatrixPosition(e) {
      const t = e.elements;
      return (this.x = t[12]), (this.y = t[13]), (this.z = t[14]), this;
    }
    setFromMatrixScale(e) {
      const t = this.setFromMatrixColumn(e, 0).length(),
        n = this.setFromMatrixColumn(e, 1).length(),
        s = this.setFromMatrixColumn(e, 2).length();
      return (this.x = t), (this.y = n), (this.z = s), this;
    }
    setFromMatrixColumn(e, t) {
      return this.fromArray(e.elements, t * 4);
    }
    setFromMatrix3Column(e, t) {
      return this.fromArray(e.elements, t * 3);
    }
    setFromEuler(e) {
      return (this.x = e._x), (this.y = e._y), (this.z = e._z), this;
    }
    setFromColor(e) {
      return (this.x = e.r), (this.y = e.g), (this.z = e.b), this;
    }
    equals(e) {
      return e.x === this.x && e.y === this.y && e.z === this.z;
    }
    fromArray(e, t = 0) {
      return (this.x = e[t]), (this.y = e[t + 1]), (this.z = e[t + 2]), this;
    }
    toArray(e = [], t = 0) {
      return (e[t] = this.x), (e[t + 1] = this.y), (e[t + 2] = this.z), e;
    }
    fromBufferAttribute(e, t) {
      return (this.x = e.getX(t)), (this.y = e.getY(t)), (this.z = e.getZ(t)), this;
    }
    random() {
      return (this.x = Math.random()), (this.y = Math.random()), (this.z = Math.random()), this;
    }
    randomDirection() {
      const e = Math.random() * Math.PI * 2,
        t = Math.random() * 2 - 1,
        n = Math.sqrt(1 - t * t);
      return (this.x = n * Math.cos(e)), (this.y = t), (this.z = n * Math.sin(e)), this;
    }
    *[Symbol.iterator]() {
      yield this.x, yield this.y, yield this.z;
    }
  },
  Za = new L(),
  ec = new sn(),
  De = class i {
    constructor(e, t, n, s, r, a, o, c, l) {
      (i.prototype.isMatrix3 = !0),
        (this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1]),
        e !== void 0 && this.set(e, t, n, s, r, a, o, c, l);
    }
    set(e, t, n, s, r, a, o, c, l) {
      const d = this.elements;
      return (
        (d[0] = e), (d[1] = s), (d[2] = o), (d[3] = t), (d[4] = r), (d[5] = c), (d[6] = n), (d[7] = a), (d[8] = l), this
      );
    }
    identity() {
      return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1), this;
    }
    copy(e) {
      const t = this.elements,
        n = e.elements;
      return (
        (t[0] = n[0]),
        (t[1] = n[1]),
        (t[2] = n[2]),
        (t[3] = n[3]),
        (t[4] = n[4]),
        (t[5] = n[5]),
        (t[6] = n[6]),
        (t[7] = n[7]),
        (t[8] = n[8]),
        this
      );
    }
    extractBasis(e, t, n) {
      return e.setFromMatrix3Column(this, 0), t.setFromMatrix3Column(this, 1), n.setFromMatrix3Column(this, 2), this;
    }
    setFromMatrix4(e) {
      const t = e.elements;
      return this.set(t[0], t[4], t[8], t[1], t[5], t[9], t[2], t[6], t[10]), this;
    }
    multiply(e) {
      return this.multiplyMatrices(this, e);
    }
    premultiply(e) {
      return this.multiplyMatrices(e, this);
    }
    multiplyMatrices(e, t) {
      const n = e.elements,
        s = t.elements,
        r = this.elements,
        a = n[0],
        o = n[3],
        c = n[6],
        l = n[1],
        d = n[4],
        m = n[7],
        h = n[2],
        f = n[5],
        g = n[8],
        y = s[0],
        p = s[3],
        u = s[6],
        v = s[1],
        T = s[4],
        S = s[7],
        w = s[2],
        E = s[5],
        R = s[8];
      return (
        (r[0] = a * y + o * v + c * w),
        (r[3] = a * p + o * T + c * E),
        (r[6] = a * u + o * S + c * R),
        (r[1] = l * y + d * v + m * w),
        (r[4] = l * p + d * T + m * E),
        (r[7] = l * u + d * S + m * R),
        (r[2] = h * y + f * v + g * w),
        (r[5] = h * p + f * T + g * E),
        (r[8] = h * u + f * S + g * R),
        this
      );
    }
    multiplyScalar(e) {
      const t = this.elements;
      return (
        (t[0] *= e),
        (t[3] *= e),
        (t[6] *= e),
        (t[1] *= e),
        (t[4] *= e),
        (t[7] *= e),
        (t[2] *= e),
        (t[5] *= e),
        (t[8] *= e),
        this
      );
    }
    determinant() {
      const e = this.elements,
        t = e[0],
        n = e[1],
        s = e[2],
        r = e[3],
        a = e[4],
        o = e[5],
        c = e[6],
        l = e[7],
        d = e[8];
      return t * a * d - t * o * l - n * r * d + n * o * c + s * r * l - s * a * c;
    }
    invert() {
      const e = this.elements,
        t = e[0],
        n = e[1],
        s = e[2],
        r = e[3],
        a = e[4],
        o = e[5],
        c = e[6],
        l = e[7],
        d = e[8],
        m = d * a - o * l,
        h = o * c - d * r,
        f = l * r - a * c,
        g = t * m + n * h + s * f;
      if (g === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      const y = 1 / g;
      return (
        (e[0] = m * y),
        (e[1] = (s * l - d * n) * y),
        (e[2] = (o * n - s * a) * y),
        (e[3] = h * y),
        (e[4] = (d * t - s * c) * y),
        (e[5] = (s * r - o * t) * y),
        (e[6] = f * y),
        (e[7] = (n * c - l * t) * y),
        (e[8] = (a * t - n * r) * y),
        this
      );
    }
    transpose() {
      let e,
        t = this.elements;
      return (
        (e = t[1]),
        (t[1] = t[3]),
        (t[3] = e),
        (e = t[2]),
        (t[2] = t[6]),
        (t[6] = e),
        (e = t[5]),
        (t[5] = t[7]),
        (t[7] = e),
        this
      );
    }
    getNormalMatrix(e) {
      return this.setFromMatrix4(e).invert().transpose();
    }
    transposeIntoArray(e) {
      const t = this.elements;
      return (
        (e[0] = t[0]),
        (e[1] = t[3]),
        (e[2] = t[6]),
        (e[3] = t[1]),
        (e[4] = t[4]),
        (e[5] = t[7]),
        (e[6] = t[2]),
        (e[7] = t[5]),
        (e[8] = t[8]),
        this
      );
    }
    setUvTransform(e, t, n, s, r, a, o) {
      const c = Math.cos(r),
        l = Math.sin(r);
      return (
        this.set(n * c, n * l, -n * (c * a + l * o) + a + e, -s * l, s * c, -s * (-l * a + c * o) + o + t, 0, 0, 1),
        this
      );
    }
    scale(e, t) {
      return this.premultiply(Ja.makeScale(e, t)), this;
    }
    rotate(e) {
      return this.premultiply(Ja.makeRotation(-e)), this;
    }
    translate(e, t) {
      return this.premultiply(Ja.makeTranslation(e, t)), this;
    }
    makeTranslation(e, t) {
      return e.isVector2 ? this.set(1, 0, e.x, 0, 1, e.y, 0, 0, 1) : this.set(1, 0, e, 0, 1, t, 0, 0, 1), this;
    }
    makeRotation(e) {
      const t = Math.cos(e),
        n = Math.sin(e);
      return this.set(t, -n, 0, n, t, 0, 0, 0, 1), this;
    }
    makeScale(e, t) {
      return this.set(e, 0, 0, 0, t, 0, 0, 0, 1), this;
    }
    equals(e) {
      const t = this.elements,
        n = e.elements;
      for (let s = 0; s < 9; s++) if (t[s] !== n[s]) return !1;
      return !0;
    }
    fromArray(e, t = 0) {
      for (let n = 0; n < 9; n++) this.elements[n] = e[n + t];
      return this;
    }
    toArray(e = [], t = 0) {
      const n = this.elements;
      return (
        (e[t] = n[0]),
        (e[t + 1] = n[1]),
        (e[t + 2] = n[2]),
        (e[t + 3] = n[3]),
        (e[t + 4] = n[4]),
        (e[t + 5] = n[5]),
        (e[t + 6] = n[6]),
        (e[t + 7] = n[7]),
        (e[t + 8] = n[8]),
        e
      );
    }
    clone() {
      return new this.constructor().fromArray(this.elements);
    }
  },
  Ja = new De(),
  tc = new De().set(0.4123908, 0.3575843, 0.1804808, 0.212639, 0.7151687, 0.0721923, 0.0193308, 0.1191948, 0.9505322),
  nc = new De().set(
    3.2409699,
    -1.5373832,
    -0.4986108,
    -0.9692436,
    1.8759675,
    0.0415551,
    0.0556301,
    -0.203977,
    1.0569715,
  );
function $h() {
  const i = {
      enabled: !0,
      workingColorSpace: ti,
      spaces: {},
      convert: function (s, r, a) {
        return (
          this.enabled === !1 ||
            r === a ||
            !r ||
            !a ||
            (this.spaces[r].transfer === Ye && ((s.r = vn(s.r)), (s.g = vn(s.g)), (s.b = vn(s.b))),
            this.spaces[r].primaries !== this.spaces[a].primaries &&
              (s.applyMatrix3(this.spaces[r].toXYZ), s.applyMatrix3(this.spaces[a].fromXYZ)),
            this.spaces[a].transfer === Ye && ((s.r = wi(s.r)), (s.g = wi(s.g)), (s.b = wi(s.b)))),
          s
        );
      },
      workingToColorSpace: function (s, r) {
        return this.convert(s, this.workingColorSpace, r);
      },
      colorSpaceToWorking: function (s, r) {
        return this.convert(s, r, this.workingColorSpace);
      },
      getPrimaries: function (s) {
        return this.spaces[s].primaries;
      },
      getTransfer: function (s) {
        return s === Sn ? Ki : this.spaces[s].transfer;
      },
      getToneMappingMode: function (s) {
        return this.spaces[s].outputColorSpaceConfig.toneMappingMode || 'standard';
      },
      getLuminanceCoefficients: function (s, r = this.workingColorSpace) {
        return s.fromArray(this.spaces[r].luminanceCoefficients);
      },
      define: function (s) {
        Object.assign(this.spaces, s);
      },
      _getMatrix: function (s, r, a) {
        return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ);
      },
      _getDrawingBufferColorSpace: function (s) {
        return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace;
      },
      _getUnpackColorSpace: function (s = this.workingColorSpace) {
        return this.spaces[s].workingColorSpaceConfig.unpackColorSpace;
      },
      fromWorkingColorSpace: (s, r) => (
        es('ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().'),
        i.workingToColorSpace(s, r)
      ),
      toWorkingColorSpace: (s, r) => (
        es('ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().'),
        i.colorSpaceToWorking(s, r)
      ),
    },
    e = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06],
    t = [0.2126, 0.7152, 0.0722],
    n = [0.3127, 0.329];
  return (
    i.define({
      [ti]: {
        primaries: e,
        whitePoint: n,
        transfer: Ki,
        toXYZ: tc,
        fromXYZ: nc,
        luminanceCoefficients: t,
        workingColorSpaceConfig: { unpackColorSpace: Ut },
        outputColorSpaceConfig: { drawingBufferColorSpace: Ut },
      },
      [Ut]: {
        primaries: e,
        whitePoint: n,
        transfer: Ye,
        toXYZ: tc,
        fromXYZ: nc,
        luminanceCoefficients: t,
        outputColorSpaceConfig: { drawingBufferColorSpace: Ut },
      },
    }),
    i
  );
}
var Ge = $h();
function vn(i) {
  return i < 0.04045 ? i * 0.0773993808 : (i * 0.9478672986 + 0.0521327014) ** 2.4;
}
function wi(i) {
  return i < 0.0031308 ? i * 12.92 : 1.055 * i ** 0.41666 - 0.055;
}
var ui,
  pr = class {
    static getDataURL(e, t = 'image/png') {
      if (/^data:/i.test(e.src) || typeof HTMLCanvasElement > 'u') return e.src;
      let n;
      if (e instanceof HTMLCanvasElement) n = e;
      else {
        ui === void 0 && (ui = Qi('canvas')), (ui.width = e.width), (ui.height = e.height);
        const s = ui.getContext('2d');
        e instanceof ImageData ? s.putImageData(e, 0, 0) : s.drawImage(e, 0, 0, e.width, e.height), (n = ui);
      }
      return n.toDataURL(t);
    }
    static sRGBToLinear(e) {
      if (
        (typeof HTMLImageElement < 'u' && e instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement < 'u' && e instanceof HTMLCanvasElement) ||
        (typeof ImageBitmap < 'u' && e instanceof ImageBitmap)
      ) {
        const t = Qi('canvas');
        (t.width = e.width), (t.height = e.height);
        const n = t.getContext('2d');
        n.drawImage(e, 0, 0, e.width, e.height);
        const s = n.getImageData(0, 0, e.width, e.height),
          r = s.data;
        for (let a = 0; a < r.length; a++) r[a] = vn(r[a] / 255) * 255;
        return n.putImageData(s, 0, 0), t;
      } else if (e.data) {
        const t = e.data.slice(0);
        for (let n = 0; n < t.length; n++)
          t instanceof Uint8Array || t instanceof Uint8ClampedArray
            ? (t[n] = Math.floor(vn(t[n] / 255) * 255))
            : (t[n] = vn(t[n]));
        return { data: t, width: e.width, height: e.height };
      } else return Ee('ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.'), e;
    }
  },
  Kh = 0,
  Ii = class {
    constructor(e = null) {
      (this.isSource = !0),
        Object.defineProperty(this, 'id', { value: Kh++ }),
        (this.uuid = Pn()),
        (this.data = e),
        (this.dataReady = !0),
        (this.version = 0);
    }
    getSize(e) {
      const t = this.data;
      return (
        typeof HTMLVideoElement < 'u' && t instanceof HTMLVideoElement
          ? e.set(t.videoWidth, t.videoHeight, 0)
          : typeof VideoFrame < 'u' && t instanceof VideoFrame
            ? e.set(t.displayHeight, t.displayWidth, 0)
            : t !== null
              ? e.set(t.width, t.height, t.depth || 0)
              : e.set(0, 0, 0),
        e
      );
    }
    set needsUpdate(e) {
      e === !0 && this.version++;
    }
    toJSON(e) {
      const t = e === void 0 || typeof e === 'string';
      if (!t && e.images[this.uuid] !== void 0) return e.images[this.uuid];
      const n = { uuid: this.uuid, url: '' },
        s = this.data;
      if (s !== null) {
        let r;
        if (Array.isArray(s)) {
          r = [];
          for (let a = 0, o = s.length; a < o; a++) s[a].isDataTexture ? r.push($a(s[a].image)) : r.push($a(s[a]));
        } else r = $a(s);
        n.url = r;
      }
      return t || (e.images[this.uuid] = n), n;
    }
  };
function $a(i) {
  return (typeof HTMLImageElement < 'u' && i instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement < 'u' && i instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap < 'u' && i instanceof ImageBitmap)
    ? pr.getDataURL(i)
    : i.data
      ? { data: Array.from(i.data), width: i.width, height: i.height, type: i.data.constructor.name }
      : (Ee('Texture: Unable to serialize Texture.'), {});
}
var Qh = 0,
  Ka = new L(),
  ln = (() => {
    class i extends Mn {
      constructor(
        t = i.DEFAULT_IMAGE,
        n = i.DEFAULT_MAPPING,
        s = tn,
        r = tn,
        a = Mt,
        o = kn,
        c = Vt,
        l = It,
        d = i.DEFAULT_ANISOTROPY,
        m = Sn,
      ) {
        super(),
          (this.isTexture = !0),
          Object.defineProperty(this, 'id', { value: Qh++ }),
          (this.uuid = Pn()),
          (this.name = ''),
          (this.source = new Ii(t)),
          (this.mipmaps = []),
          (this.mapping = n),
          (this.channel = 0),
          (this.wrapS = s),
          (this.wrapT = r),
          (this.magFilter = a),
          (this.minFilter = o),
          (this.anisotropy = d),
          (this.format = c),
          (this.internalFormat = null),
          (this.type = l),
          (this.offset = new Re(0, 0)),
          (this.repeat = new Re(1, 1)),
          (this.center = new Re(0, 0)),
          (this.rotation = 0),
          (this.matrixAutoUpdate = !0),
          (this.matrix = new De()),
          (this.generateMipmaps = !0),
          (this.premultiplyAlpha = !1),
          (this.flipY = !0),
          (this.unpackAlignment = 4),
          (this.colorSpace = m),
          (this.userData = {}),
          (this.updateRanges = []),
          (this.version = 0),
          (this.onUpdate = null),
          (this.renderTarget = null),
          (this.isRenderTargetTexture = !1),
          (this.isArrayTexture = !!(t?.depth && t.depth > 1)),
          (this.pmremVersion = 0);
      }
      get width() {
        return this.source.getSize(Ka).x;
      }
      get height() {
        return this.source.getSize(Ka).y;
      }
      get depth() {
        return this.source.getSize(Ka).z;
      }
      get image() {
        return this.source.data;
      }
      set image(t = null) {
        this.source.data = t;
      }
      updateMatrix() {
        this.matrix.setUvTransform(
          this.offset.x,
          this.offset.y,
          this.repeat.x,
          this.repeat.y,
          this.rotation,
          this.center.x,
          this.center.y,
        );
      }
      addUpdateRange(t, n) {
        this.updateRanges.push({ start: t, count: n });
      }
      clearUpdateRanges() {
        this.updateRanges.length = 0;
      }
      clone() {
        return new this.constructor().copy(this);
      }
      copy(t) {
        return (
          (this.name = t.name),
          (this.source = t.source),
          (this.mipmaps = t.mipmaps.slice(0)),
          (this.mapping = t.mapping),
          (this.channel = t.channel),
          (this.wrapS = t.wrapS),
          (this.wrapT = t.wrapT),
          (this.magFilter = t.magFilter),
          (this.minFilter = t.minFilter),
          (this.anisotropy = t.anisotropy),
          (this.format = t.format),
          (this.internalFormat = t.internalFormat),
          (this.type = t.type),
          this.offset.copy(t.offset),
          this.repeat.copy(t.repeat),
          this.center.copy(t.center),
          (this.rotation = t.rotation),
          (this.matrixAutoUpdate = t.matrixAutoUpdate),
          this.matrix.copy(t.matrix),
          (this.generateMipmaps = t.generateMipmaps),
          (this.premultiplyAlpha = t.premultiplyAlpha),
          (this.flipY = t.flipY),
          (this.unpackAlignment = t.unpackAlignment),
          (this.colorSpace = t.colorSpace),
          (this.renderTarget = t.renderTarget),
          (this.isRenderTargetTexture = t.isRenderTargetTexture),
          (this.isArrayTexture = t.isArrayTexture),
          (this.userData = JSON.parse(JSON.stringify(t.userData))),
          (this.needsUpdate = !0),
          this
        );
      }
      setValues(t) {
        for (const n in t) {
          const s = t[n];
          if (s === void 0) {
            Ee(`Texture.setValues(): parameter '${n}' has value of undefined.`);
            continue;
          }
          const r = this[n];
          if (r === void 0) {
            Ee(`Texture.setValues(): property '${n}' does not exist.`);
            continue;
          }
          (r && s && r.isVector2 && s.isVector2) ||
          (r && s && r.isVector3 && s.isVector3) ||
          (r && s && r.isMatrix3 && s.isMatrix3)
            ? r.copy(s)
            : (this[n] = s);
        }
      }
      toJSON(t) {
        const n = t === void 0 || typeof t === 'string';
        if (!n && t.textures[this.uuid] !== void 0) return t.textures[this.uuid];
        const s = {
          metadata: { version: 4.7, type: 'Texture', generator: 'Texture.toJSON' },
          uuid: this.uuid,
          name: this.name,
          image: this.source.toJSON(t).uuid,
          mapping: this.mapping,
          channel: this.channel,
          repeat: [this.repeat.x, this.repeat.y],
          offset: [this.offset.x, this.offset.y],
          center: [this.center.x, this.center.y],
          rotation: this.rotation,
          wrap: [this.wrapS, this.wrapT],
          format: this.format,
          internalFormat: this.internalFormat,
          type: this.type,
          colorSpace: this.colorSpace,
          minFilter: this.minFilter,
          magFilter: this.magFilter,
          anisotropy: this.anisotropy,
          flipY: this.flipY,
          generateMipmaps: this.generateMipmaps,
          premultiplyAlpha: this.premultiplyAlpha,
          unpackAlignment: this.unpackAlignment,
        };
        return (
          Object.keys(this.userData).length > 0 && (s.userData = this.userData), n || (t.textures[this.uuid] = s), s
        );
      }
      dispose() {
        this.dispatchEvent({ type: 'dispose' });
      }
      transformUv(t) {
        if (this.mapping !== yo) return t;
        if ((t.applyMatrix3(this.matrix), t.x < 0 || t.x > 1))
          switch (this.wrapS) {
            case cr:
              t.x = t.x - Math.floor(t.x);
              break;
            case tn:
              t.x = t.x < 0 ? 0 : 1;
              break;
            case hr:
              Math.abs(Math.floor(t.x) % 2) === 1 ? (t.x = Math.ceil(t.x) - t.x) : (t.x = t.x - Math.floor(t.x));
              break;
          }
        if (t.y < 0 || t.y > 1)
          switch (this.wrapT) {
            case cr:
              t.y = t.y - Math.floor(t.y);
              break;
            case tn:
              t.y = t.y < 0 ? 0 : 1;
              break;
            case hr:
              Math.abs(Math.floor(t.y) % 2) === 1 ? (t.y = Math.ceil(t.y) - t.y) : (t.y = t.y - Math.floor(t.y));
              break;
          }
        return this.flipY && (t.y = 1 - t.y), t;
      }
      set needsUpdate(t) {
        t === !0 && (this.version++, (this.source.needsUpdate = !0));
      }
      set needsPMREMUpdate(t) {
        t === !0 && this.pmremVersion++;
      }
    }
    return (i.DEFAULT_IMAGE = null), (i.DEFAULT_MAPPING = yo), (i.DEFAULT_ANISOTROPY = 1), i;
  })(),
  at = class i {
    constructor(e = 0, t = 0, n = 0, s = 1) {
      (i.prototype.isVector4 = !0), (this.x = e), (this.y = t), (this.z = n), (this.w = s);
    }
    get width() {
      return this.z;
    }
    set width(e) {
      this.z = e;
    }
    get height() {
      return this.w;
    }
    set height(e) {
      this.w = e;
    }
    set(e, t, n, s) {
      return (this.x = e), (this.y = t), (this.z = n), (this.w = s), this;
    }
    setScalar(e) {
      return (this.x = e), (this.y = e), (this.z = e), (this.w = e), this;
    }
    setX(e) {
      return (this.x = e), this;
    }
    setY(e) {
      return (this.y = e), this;
    }
    setZ(e) {
      return (this.z = e), this;
    }
    setW(e) {
      return (this.w = e), this;
    }
    setComponent(e, t) {
      switch (e) {
        case 0:
          this.x = t;
          break;
        case 1:
          this.y = t;
          break;
        case 2:
          this.z = t;
          break;
        case 3:
          this.w = t;
          break;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
      return this;
    }
    getComponent(e) {
      switch (e) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        case 2:
          return this.z;
        case 3:
          return this.w;
        default:
          throw new Error(`index is out of range: ${e}`);
      }
    }
    clone() {
      return new this.constructor(this.x, this.y, this.z, this.w);
    }
    copy(e) {
      return (this.x = e.x), (this.y = e.y), (this.z = e.z), (this.w = e.w !== void 0 ? e.w : 1), this;
    }
    add(e) {
      return (this.x += e.x), (this.y += e.y), (this.z += e.z), (this.w += e.w), this;
    }
    addScalar(e) {
      return (this.x += e), (this.y += e), (this.z += e), (this.w += e), this;
    }
    addVectors(e, t) {
      return (this.x = e.x + t.x), (this.y = e.y + t.y), (this.z = e.z + t.z), (this.w = e.w + t.w), this;
    }
    addScaledVector(e, t) {
      return (this.x += e.x * t), (this.y += e.y * t), (this.z += e.z * t), (this.w += e.w * t), this;
    }
    sub(e) {
      return (this.x -= e.x), (this.y -= e.y), (this.z -= e.z), (this.w -= e.w), this;
    }
    subScalar(e) {
      return (this.x -= e), (this.y -= e), (this.z -= e), (this.w -= e), this;
    }
    subVectors(e, t) {
      return (this.x = e.x - t.x), (this.y = e.y - t.y), (this.z = e.z - t.z), (this.w = e.w - t.w), this;
    }
    multiply(e) {
      return (this.x *= e.x), (this.y *= e.y), (this.z *= e.z), (this.w *= e.w), this;
    }
    multiplyScalar(e) {
      return (this.x *= e), (this.y *= e), (this.z *= e), (this.w *= e), this;
    }
    applyMatrix4(e) {
      const t = this.x,
        n = this.y,
        s = this.z,
        r = this.w,
        a = e.elements;
      return (
        (this.x = a[0] * t + a[4] * n + a[8] * s + a[12] * r),
        (this.y = a[1] * t + a[5] * n + a[9] * s + a[13] * r),
        (this.z = a[2] * t + a[6] * n + a[10] * s + a[14] * r),
        (this.w = a[3] * t + a[7] * n + a[11] * s + a[15] * r),
        this
      );
    }
    divide(e) {
      return (this.x /= e.x), (this.y /= e.y), (this.z /= e.z), (this.w /= e.w), this;
    }
    divideScalar(e) {
      return this.multiplyScalar(1 / e);
    }
    setAxisAngleFromQuaternion(e) {
      this.w = 2 * Math.acos(e.w);
      const t = Math.sqrt(1 - e.w * e.w);
      return (
        t < 1e-4
          ? ((this.x = 1), (this.y = 0), (this.z = 0))
          : ((this.x = e.x / t), (this.y = e.y / t), (this.z = e.z / t)),
        this
      );
    }
    setAxisAngleFromRotationMatrix(e) {
      let t,
        n,
        s,
        r,
        c = e.elements,
        l = c[0],
        d = c[4],
        m = c[8],
        h = c[1],
        f = c[5],
        g = c[9],
        y = c[2],
        p = c[6],
        u = c[10];
      if (Math.abs(d - h) < 0.01 && Math.abs(m - y) < 0.01 && Math.abs(g - p) < 0.01) {
        if (Math.abs(d + h) < 0.1 && Math.abs(m + y) < 0.1 && Math.abs(g + p) < 0.1 && Math.abs(l + f + u - 3) < 0.1)
          return this.set(1, 0, 0, 0), this;
        t = Math.PI;
        const T = (l + 1) / 2,
          S = (f + 1) / 2,
          w = (u + 1) / 2,
          E = (d + h) / 4,
          R = (m + y) / 4,
          x = (g + p) / 4;
        return (
          T > S && T > w
            ? T < 0.01
              ? ((n = 0), (s = Math.SQRT1_2), (r = Math.SQRT1_2))
              : ((n = Math.sqrt(T)), (s = E / n), (r = R / n))
            : S > w
              ? S < 0.01
                ? ((n = Math.SQRT1_2), (s = 0), (r = Math.SQRT1_2))
                : ((s = Math.sqrt(S)), (n = E / s), (r = x / s))
              : w < 0.01
                ? ((n = Math.SQRT1_2), (s = Math.SQRT1_2), (r = 0))
                : ((r = Math.sqrt(w)), (n = R / r), (s = x / r)),
          this.set(n, s, r, t),
          this
        );
      }
      let v = Math.sqrt((p - g) * (p - g) + (m - y) * (m - y) + (h - d) * (h - d));
      return (
        Math.abs(v) < 0.001 && (v = 1),
        (this.x = (p - g) / v),
        (this.y = (m - y) / v),
        (this.z = (h - d) / v),
        (this.w = Math.acos((l + f + u - 1) / 2)),
        this
      );
    }
    setFromMatrixPosition(e) {
      const t = e.elements;
      return (this.x = t[12]), (this.y = t[13]), (this.z = t[14]), (this.w = t[15]), this;
    }
    min(e) {
      return (
        (this.x = Math.min(this.x, e.x)),
        (this.y = Math.min(this.y, e.y)),
        (this.z = Math.min(this.z, e.z)),
        (this.w = Math.min(this.w, e.w)),
        this
      );
    }
    max(e) {
      return (
        (this.x = Math.max(this.x, e.x)),
        (this.y = Math.max(this.y, e.y)),
        (this.z = Math.max(this.z, e.z)),
        (this.w = Math.max(this.w, e.w)),
        this
      );
    }
    clamp(e, t) {
      return (
        (this.x = ke(this.x, e.x, t.x)),
        (this.y = ke(this.y, e.y, t.y)),
        (this.z = ke(this.z, e.z, t.z)),
        (this.w = ke(this.w, e.w, t.w)),
        this
      );
    }
    clampScalar(e, t) {
      return (
        (this.x = ke(this.x, e, t)),
        (this.y = ke(this.y, e, t)),
        (this.z = ke(this.z, e, t)),
        (this.w = ke(this.w, e, t)),
        this
      );
    }
    clampLength(e, t) {
      const n = this.length();
      return this.divideScalar(n || 1).multiplyScalar(ke(n, e, t));
    }
    floor() {
      return (
        (this.x = Math.floor(this.x)),
        (this.y = Math.floor(this.y)),
        (this.z = Math.floor(this.z)),
        (this.w = Math.floor(this.w)),
        this
      );
    }
    ceil() {
      return (
        (this.x = Math.ceil(this.x)),
        (this.y = Math.ceil(this.y)),
        (this.z = Math.ceil(this.z)),
        (this.w = Math.ceil(this.w)),
        this
      );
    }
    round() {
      return (
        (this.x = Math.round(this.x)),
        (this.y = Math.round(this.y)),
        (this.z = Math.round(this.z)),
        (this.w = Math.round(this.w)),
        this
      );
    }
    roundToZero() {
      return (
        (this.x = Math.trunc(this.x)),
        (this.y = Math.trunc(this.y)),
        (this.z = Math.trunc(this.z)),
        (this.w = Math.trunc(this.w)),
        this
      );
    }
    negate() {
      return (this.x = -this.x), (this.y = -this.y), (this.z = -this.z), (this.w = -this.w), this;
    }
    dot(e) {
      return this.x * e.x + this.y * e.y + this.z * e.z + this.w * e.w;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }
    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }
    manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
    }
    normalize() {
      return this.divideScalar(this.length() || 1);
    }
    setLength(e) {
      return this.normalize().multiplyScalar(e);
    }
    lerp(e, t) {
      return (
        (this.x += (e.x - this.x) * t),
        (this.y += (e.y - this.y) * t),
        (this.z += (e.z - this.z) * t),
        (this.w += (e.w - this.w) * t),
        this
      );
    }
    lerpVectors(e, t, n) {
      return (
        (this.x = e.x + (t.x - e.x) * n),
        (this.y = e.y + (t.y - e.y) * n),
        (this.z = e.z + (t.z - e.z) * n),
        (this.w = e.w + (t.w - e.w) * n),
        this
      );
    }
    equals(e) {
      return e.x === this.x && e.y === this.y && e.z === this.z && e.w === this.w;
    }
    fromArray(e, t = 0) {
      return (this.x = e[t]), (this.y = e[t + 1]), (this.z = e[t + 2]), (this.w = e[t + 3]), this;
    }
    toArray(e = [], t = 0) {
      return (e[t] = this.x), (e[t + 1] = this.y), (e[t + 2] = this.z), (e[t + 3] = this.w), e;
    }
    fromBufferAttribute(e, t) {
      return (this.x = e.getX(t)), (this.y = e.getY(t)), (this.z = e.getZ(t)), (this.w = e.getW(t)), this;
    }
    random() {
      return (
        (this.x = Math.random()), (this.y = Math.random()), (this.z = Math.random()), (this.w = Math.random()), this
      );
    }
    *[Symbol.iterator]() {
      yield this.x, yield this.y, yield this.z, yield this.w;
    }
  },
  mr = class extends Mn {
    constructor(e = 1, t = 1, n = {}) {
      super(),
        (n = Object.assign(
          {
            generateMipmaps: !1,
            internalFormat: null,
            minFilter: Mt,
            depthBuffer: !0,
            stencilBuffer: !1,
            resolveDepthBuffer: !0,
            resolveStencilBuffer: !0,
            depthTexture: null,
            samples: 0,
            count: 1,
            depth: 1,
            multiview: !1,
          },
          n,
        )),
        (this.isRenderTarget = !0),
        (this.width = e),
        (this.height = t),
        (this.depth = n.depth),
        (this.scissor = new at(0, 0, e, t)),
        (this.scissorTest = !1),
        (this.viewport = new at(0, 0, e, t)),
        (this.textures = []);
      const s = { width: e, height: t, depth: n.depth },
        r = new ln(s),
        a = n.count;
      for (let o = 0; o < a; o++)
        (this.textures[o] = r.clone()),
          (this.textures[o].isRenderTargetTexture = !0),
          (this.textures[o].renderTarget = this);
      this._setTextureOptions(n),
        (this.depthBuffer = n.depthBuffer),
        (this.stencilBuffer = n.stencilBuffer),
        (this.resolveDepthBuffer = n.resolveDepthBuffer),
        (this.resolveStencilBuffer = n.resolveStencilBuffer),
        (this._depthTexture = null),
        (this.depthTexture = n.depthTexture),
        (this.samples = n.samples),
        (this.multiview = n.multiview);
    }
    _setTextureOptions(e = {}) {
      const t = { minFilter: Mt, generateMipmaps: !1, flipY: !1, internalFormat: null };
      e.mapping !== void 0 && (t.mapping = e.mapping),
        e.wrapS !== void 0 && (t.wrapS = e.wrapS),
        e.wrapT !== void 0 && (t.wrapT = e.wrapT),
        e.wrapR !== void 0 && (t.wrapR = e.wrapR),
        e.magFilter !== void 0 && (t.magFilter = e.magFilter),
        e.minFilter !== void 0 && (t.minFilter = e.minFilter),
        e.format !== void 0 && (t.format = e.format),
        e.type !== void 0 && (t.type = e.type),
        e.anisotropy !== void 0 && (t.anisotropy = e.anisotropy),
        e.colorSpace !== void 0 && (t.colorSpace = e.colorSpace),
        e.flipY !== void 0 && (t.flipY = e.flipY),
        e.generateMipmaps !== void 0 && (t.generateMipmaps = e.generateMipmaps),
        e.internalFormat !== void 0 && (t.internalFormat = e.internalFormat);
      for (let n = 0; n < this.textures.length; n++) this.textures[n].setValues(t);
    }
    get texture() {
      return this.textures[0];
    }
    set texture(e) {
      this.textures[0] = e;
    }
    set depthTexture(e) {
      this._depthTexture !== null && (this._depthTexture.renderTarget = null),
        e !== null && (e.renderTarget = this),
        (this._depthTexture = e);
    }
    get depthTexture() {
      return this._depthTexture;
    }
    setSize(e, t, n = 1) {
      if (this.width !== e || this.height !== t || this.depth !== n) {
        (this.width = e), (this.height = t), (this.depth = n);
        for (let s = 0, r = this.textures.length; s < r; s++)
          (this.textures[s].image.width = e),
            (this.textures[s].image.height = t),
            (this.textures[s].image.depth = n),
            this.textures[s].isData3DTexture !== !0 &&
              (this.textures[s].isArrayTexture = this.textures[s].image.depth > 1);
        this.dispose();
      }
      this.viewport.set(0, 0, e, t), this.scissor.set(0, 0, e, t);
    }
    clone() {
      return new this.constructor().copy(this);
    }
    copy(e) {
      (this.width = e.width),
        (this.height = e.height),
        (this.depth = e.depth),
        this.scissor.copy(e.scissor),
        (this.scissorTest = e.scissorTest),
        this.viewport.copy(e.viewport),
        (this.textures.length = 0);
      for (let t = 0, n = e.textures.length; t < n; t++) {
        (this.textures[t] = e.textures[t].clone()),
          (this.textures[t].isRenderTargetTexture = !0),
          (this.textures[t].renderTarget = this);
        const s = Object.assign({}, e.textures[t].image);
        this.textures[t].source = new Ii(s);
      }
      return (
        (this.depthBuffer = e.depthBuffer),
        (this.stencilBuffer = e.stencilBuffer),
        (this.resolveDepthBuffer = e.resolveDepthBuffer),
        (this.resolveStencilBuffer = e.resolveStencilBuffer),
        e.depthTexture !== null && (this.depthTexture = e.depthTexture.clone()),
        (this.samples = e.samples),
        this
      );
    }
    dispose() {
      this.dispatchEvent({ type: 'dispose' });
    }
  },
  Nt = class extends mr {
    constructor(e = 1, t = 1, n = {}) {
      super(e, t, n), (this.isWebGLRenderTarget = !0);
    }
  },
  ts = class extends ln {
    constructor(e = null, t = 1, n = 1, s = 1) {
      super(null),
        (this.isDataArrayTexture = !0),
        (this.image = { data: e, width: t, height: n, depth: s }),
        (this.magFilter = vt),
        (this.minFilter = vt),
        (this.wrapR = tn),
        (this.generateMipmaps = !1),
        (this.flipY = !1),
        (this.unpackAlignment = 1),
        (this.layerUpdates = new Set());
    }
    addLayerUpdate(e) {
      this.layerUpdates.add(e);
    }
    clearLayerUpdates() {
      this.layerUpdates.clear();
    }
  };
var gr = class extends ln {
  constructor(e = null, t = 1, n = 1, s = 1) {
    super(null),
      (this.isData3DTexture = !0),
      (this.image = { data: e, width: t, height: n, depth: s }),
      (this.magFilter = vt),
      (this.minFilter = vt),
      (this.wrapR = tn),
      (this.generateMipmaps = !1),
      (this.flipY = !1),
      (this.unpackAlignment = 1);
  }
};
var tt = class i {
    constructor(e, t, n, s, r, a, o, c, l, d, m, h, f, g, y, p) {
      (i.prototype.isMatrix4 = !0),
        (this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        e !== void 0 && this.set(e, t, n, s, r, a, o, c, l, d, m, h, f, g, y, p);
    }
    set(e, t, n, s, r, a, o, c, l, d, m, h, f, g, y, p) {
      const u = this.elements;
      return (
        (u[0] = e),
        (u[4] = t),
        (u[8] = n),
        (u[12] = s),
        (u[1] = r),
        (u[5] = a),
        (u[9] = o),
        (u[13] = c),
        (u[2] = l),
        (u[6] = d),
        (u[10] = m),
        (u[14] = h),
        (u[3] = f),
        (u[7] = g),
        (u[11] = y),
        (u[15] = p),
        this
      );
    }
    identity() {
      return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1), this;
    }
    clone() {
      return new i().fromArray(this.elements);
    }
    copy(e) {
      const t = this.elements,
        n = e.elements;
      return (
        (t[0] = n[0]),
        (t[1] = n[1]),
        (t[2] = n[2]),
        (t[3] = n[3]),
        (t[4] = n[4]),
        (t[5] = n[5]),
        (t[6] = n[6]),
        (t[7] = n[7]),
        (t[8] = n[8]),
        (t[9] = n[9]),
        (t[10] = n[10]),
        (t[11] = n[11]),
        (t[12] = n[12]),
        (t[13] = n[13]),
        (t[14] = n[14]),
        (t[15] = n[15]),
        this
      );
    }
    copyPosition(e) {
      const t = this.elements,
        n = e.elements;
      return (t[12] = n[12]), (t[13] = n[13]), (t[14] = n[14]), this;
    }
    setFromMatrix3(e) {
      const t = e.elements;
      return this.set(t[0], t[3], t[6], 0, t[1], t[4], t[7], 0, t[2], t[5], t[8], 0, 0, 0, 0, 1), this;
    }
    extractBasis(e, t, n) {
      return this.determinant() === 0
        ? (e.set(1, 0, 0), t.set(0, 1, 0), n.set(0, 0, 1), this)
        : (e.setFromMatrixColumn(this, 0), t.setFromMatrixColumn(this, 1), n.setFromMatrixColumn(this, 2), this);
    }
    makeBasis(e, t, n) {
      return this.set(e.x, t.x, n.x, 0, e.y, t.y, n.y, 0, e.z, t.z, n.z, 0, 0, 0, 0, 1), this;
    }
    extractRotation(e) {
      if (e.determinant() === 0) return this.identity();
      const t = this.elements,
        n = e.elements,
        s = 1 / di.setFromMatrixColumn(e, 0).length(),
        r = 1 / di.setFromMatrixColumn(e, 1).length(),
        a = 1 / di.setFromMatrixColumn(e, 2).length();
      return (
        (t[0] = n[0] * s),
        (t[1] = n[1] * s),
        (t[2] = n[2] * s),
        (t[3] = 0),
        (t[4] = n[4] * r),
        (t[5] = n[5] * r),
        (t[6] = n[6] * r),
        (t[7] = 0),
        (t[8] = n[8] * a),
        (t[9] = n[9] * a),
        (t[10] = n[10] * a),
        (t[11] = 0),
        (t[12] = 0),
        (t[13] = 0),
        (t[14] = 0),
        (t[15] = 1),
        this
      );
    }
    makeRotationFromEuler(e) {
      const t = this.elements,
        n = e.x,
        s = e.y,
        r = e.z,
        a = Math.cos(n),
        o = Math.sin(n),
        c = Math.cos(s),
        l = Math.sin(s),
        d = Math.cos(r),
        m = Math.sin(r);
      if (e.order === 'XYZ') {
        const h = a * d,
          f = a * m,
          g = o * d,
          y = o * m;
        (t[0] = c * d),
          (t[4] = -c * m),
          (t[8] = l),
          (t[1] = f + g * l),
          (t[5] = h - y * l),
          (t[9] = -o * c),
          (t[2] = y - h * l),
          (t[6] = g + f * l),
          (t[10] = a * c);
      } else if (e.order === 'YXZ') {
        const h = c * d,
          f = c * m,
          g = l * d,
          y = l * m;
        (t[0] = h + y * o),
          (t[4] = g * o - f),
          (t[8] = a * l),
          (t[1] = a * m),
          (t[5] = a * d),
          (t[9] = -o),
          (t[2] = f * o - g),
          (t[6] = y + h * o),
          (t[10] = a * c);
      } else if (e.order === 'ZXY') {
        const h = c * d,
          f = c * m,
          g = l * d,
          y = l * m;
        (t[0] = h - y * o),
          (t[4] = -a * m),
          (t[8] = g + f * o),
          (t[1] = f + g * o),
          (t[5] = a * d),
          (t[9] = y - h * o),
          (t[2] = -a * l),
          (t[6] = o),
          (t[10] = a * c);
      } else if (e.order === 'ZYX') {
        const h = a * d,
          f = a * m,
          g = o * d,
          y = o * m;
        (t[0] = c * d),
          (t[4] = g * l - f),
          (t[8] = h * l + y),
          (t[1] = c * m),
          (t[5] = y * l + h),
          (t[9] = f * l - g),
          (t[2] = -l),
          (t[6] = o * c),
          (t[10] = a * c);
      } else if (e.order === 'YZX') {
        const h = a * c,
          f = a * l,
          g = o * c,
          y = o * l;
        (t[0] = c * d),
          (t[4] = y - h * m),
          (t[8] = g * m + f),
          (t[1] = m),
          (t[5] = a * d),
          (t[9] = -o * d),
          (t[2] = -l * d),
          (t[6] = f * m + g),
          (t[10] = h - y * m);
      } else if (e.order === 'XZY') {
        const h = a * c,
          f = a * l,
          g = o * c,
          y = o * l;
        (t[0] = c * d),
          (t[4] = -m),
          (t[8] = l * d),
          (t[1] = h * m + y),
          (t[5] = a * d),
          (t[9] = f * m - g),
          (t[2] = g * m - f),
          (t[6] = o * d),
          (t[10] = y * m + h);
      }
      return (t[3] = 0), (t[7] = 0), (t[11] = 0), (t[12] = 0), (t[13] = 0), (t[14] = 0), (t[15] = 1), this;
    }
    makeRotationFromQuaternion(e) {
      return this.compose(jh, e, eu);
    }
    lookAt(e, t, n) {
      const s = this.elements;
      return (
        Lt.subVectors(e, t),
        Lt.lengthSq() === 0 && (Lt.z = 1),
        Lt.normalize(),
        An.crossVectors(n, Lt),
        An.lengthSq() === 0 &&
          (Math.abs(n.z) === 1 ? (Lt.x += 1e-4) : (Lt.z += 1e-4), Lt.normalize(), An.crossVectors(n, Lt)),
        An.normalize(),
        Es.crossVectors(Lt, An),
        (s[0] = An.x),
        (s[4] = Es.x),
        (s[8] = Lt.x),
        (s[1] = An.y),
        (s[5] = Es.y),
        (s[9] = Lt.y),
        (s[2] = An.z),
        (s[6] = Es.z),
        (s[10] = Lt.z),
        this
      );
    }
    multiply(e) {
      return this.multiplyMatrices(this, e);
    }
    premultiply(e) {
      return this.multiplyMatrices(e, this);
    }
    multiplyMatrices(e, t) {
      const n = e.elements,
        s = t.elements,
        r = this.elements,
        a = n[0],
        o = n[4],
        c = n[8],
        l = n[12],
        d = n[1],
        m = n[5],
        h = n[9],
        f = n[13],
        g = n[2],
        y = n[6],
        p = n[10],
        u = n[14],
        v = n[3],
        T = n[7],
        S = n[11],
        w = n[15],
        E = s[0],
        R = s[4],
        x = s[8],
        b = s[12],
        k = s[1],
        C = s[5],
        N = s[9],
        O = s[13],
        W = s[2],
        z = s[6],
        G = s[10],
        F = s[14],
        j = s[3],
        $ = s[7],
        ce = s[11],
        pe = s[15];
      return (
        (r[0] = a * E + o * k + c * W + l * j),
        (r[4] = a * R + o * C + c * z + l * $),
        (r[8] = a * x + o * N + c * G + l * ce),
        (r[12] = a * b + o * O + c * F + l * pe),
        (r[1] = d * E + m * k + h * W + f * j),
        (r[5] = d * R + m * C + h * z + f * $),
        (r[9] = d * x + m * N + h * G + f * ce),
        (r[13] = d * b + m * O + h * F + f * pe),
        (r[2] = g * E + y * k + p * W + u * j),
        (r[6] = g * R + y * C + p * z + u * $),
        (r[10] = g * x + y * N + p * G + u * ce),
        (r[14] = g * b + y * O + p * F + u * pe),
        (r[3] = v * E + T * k + S * W + w * j),
        (r[7] = v * R + T * C + S * z + w * $),
        (r[11] = v * x + T * N + S * G + w * ce),
        (r[15] = v * b + T * O + S * F + w * pe),
        this
      );
    }
    multiplyScalar(e) {
      const t = this.elements;
      return (
        (t[0] *= e),
        (t[4] *= e),
        (t[8] *= e),
        (t[12] *= e),
        (t[1] *= e),
        (t[5] *= e),
        (t[9] *= e),
        (t[13] *= e),
        (t[2] *= e),
        (t[6] *= e),
        (t[10] *= e),
        (t[14] *= e),
        (t[3] *= e),
        (t[7] *= e),
        (t[11] *= e),
        (t[15] *= e),
        this
      );
    }
    determinant() {
      const e = this.elements,
        t = e[0],
        n = e[4],
        s = e[8],
        r = e[12],
        a = e[1],
        o = e[5],
        c = e[9],
        l = e[13],
        d = e[2],
        m = e[6],
        h = e[10],
        f = e[14],
        g = e[3],
        y = e[7],
        p = e[11],
        u = e[15],
        v = c * f - l * h,
        T = o * f - l * m,
        S = o * h - c * m,
        w = a * f - l * d,
        E = a * h - c * d,
        R = a * m - o * d;
      return (
        t * (y * v - p * T + u * S) -
        n * (g * v - p * w + u * E) +
        s * (g * T - y * w + u * R) -
        r * (g * S - y * E + p * R)
      );
    }
    transpose() {
      let e = this.elements,
        t;
      return (
        (t = e[1]),
        (e[1] = e[4]),
        (e[4] = t),
        (t = e[2]),
        (e[2] = e[8]),
        (e[8] = t),
        (t = e[6]),
        (e[6] = e[9]),
        (e[9] = t),
        (t = e[3]),
        (e[3] = e[12]),
        (e[12] = t),
        (t = e[7]),
        (e[7] = e[13]),
        (e[13] = t),
        (t = e[11]),
        (e[11] = e[14]),
        (e[14] = t),
        this
      );
    }
    setPosition(e, t, n) {
      const s = this.elements;
      return (
        e.isVector3 ? ((s[12] = e.x), (s[13] = e.y), (s[14] = e.z)) : ((s[12] = e), (s[13] = t), (s[14] = n)), this
      );
    }
    invert() {
      const e = this.elements,
        t = e[0],
        n = e[1],
        s = e[2],
        r = e[3],
        a = e[4],
        o = e[5],
        c = e[6],
        l = e[7],
        d = e[8],
        m = e[9],
        h = e[10],
        f = e[11],
        g = e[12],
        y = e[13],
        p = e[14],
        u = e[15],
        v = t * o - n * a,
        T = t * c - s * a,
        S = t * l - r * a,
        w = n * c - s * o,
        E = n * l - r * o,
        R = s * l - r * c,
        x = d * y - m * g,
        b = d * p - h * g,
        k = d * u - f * g,
        C = m * p - h * y,
        N = m * u - f * y,
        O = h * u - f * p,
        W = v * O - T * N + S * C + w * k - E * b + R * x;
      if (W === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      const z = 1 / W;
      return (
        (e[0] = (o * O - c * N + l * C) * z),
        (e[1] = (s * N - n * O - r * C) * z),
        (e[2] = (y * R - p * E + u * w) * z),
        (e[3] = (h * E - m * R - f * w) * z),
        (e[4] = (c * k - a * O - l * b) * z),
        (e[5] = (t * O - s * k + r * b) * z),
        (e[6] = (p * S - g * R - u * T) * z),
        (e[7] = (d * R - h * S + f * T) * z),
        (e[8] = (a * N - o * k + l * x) * z),
        (e[9] = (n * k - t * N - r * x) * z),
        (e[10] = (g * E - y * S + u * v) * z),
        (e[11] = (m * S - d * E - f * v) * z),
        (e[12] = (o * b - a * C - c * x) * z),
        (e[13] = (t * C - n * b + s * x) * z),
        (e[14] = (y * T - g * w - p * v) * z),
        (e[15] = (d * w - m * T + h * v) * z),
        this
      );
    }
    scale(e) {
      const t = this.elements,
        n = e.x,
        s = e.y,
        r = e.z;
      return (
        (t[0] *= n),
        (t[4] *= s),
        (t[8] *= r),
        (t[1] *= n),
        (t[5] *= s),
        (t[9] *= r),
        (t[2] *= n),
        (t[6] *= s),
        (t[10] *= r),
        (t[3] *= n),
        (t[7] *= s),
        (t[11] *= r),
        this
      );
    }
    getMaxScaleOnAxis() {
      const e = this.elements,
        t = e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
        n = e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
        s = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
      return Math.sqrt(Math.max(t, n, s));
    }
    makeTranslation(e, t, n) {
      return (
        e.isVector3
          ? this.set(1, 0, 0, e.x, 0, 1, 0, e.y, 0, 0, 1, e.z, 0, 0, 0, 1)
          : this.set(1, 0, 0, e, 0, 1, 0, t, 0, 0, 1, n, 0, 0, 0, 1),
        this
      );
    }
    makeRotationX(e) {
      const t = Math.cos(e),
        n = Math.sin(e);
      return this.set(1, 0, 0, 0, 0, t, -n, 0, 0, n, t, 0, 0, 0, 0, 1), this;
    }
    makeRotationY(e) {
      const t = Math.cos(e),
        n = Math.sin(e);
      return this.set(t, 0, n, 0, 0, 1, 0, 0, -n, 0, t, 0, 0, 0, 0, 1), this;
    }
    makeRotationZ(e) {
      const t = Math.cos(e),
        n = Math.sin(e);
      return this.set(t, -n, 0, 0, n, t, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1), this;
    }
    makeRotationAxis(e, t) {
      const n = Math.cos(t),
        s = Math.sin(t),
        r = 1 - n,
        a = e.x,
        o = e.y,
        c = e.z,
        l = r * a,
        d = r * o;
      return (
        this.set(
          l * a + n,
          l * o - s * c,
          l * c + s * o,
          0,
          l * o + s * c,
          d * o + n,
          d * c - s * a,
          0,
          l * c - s * o,
          d * c + s * a,
          r * c * c + n,
          0,
          0,
          0,
          0,
          1,
        ),
        this
      );
    }
    makeScale(e, t, n) {
      return this.set(e, 0, 0, 0, 0, t, 0, 0, 0, 0, n, 0, 0, 0, 0, 1), this;
    }
    makeShear(e, t, n, s, r, a) {
      return this.set(1, n, r, 0, e, 1, a, 0, t, s, 1, 0, 0, 0, 0, 1), this;
    }
    compose(e, t, n) {
      const s = this.elements,
        r = t._x,
        a = t._y,
        o = t._z,
        c = t._w,
        l = r + r,
        d = a + a,
        m = o + o,
        h = r * l,
        f = r * d,
        g = r * m,
        y = a * d,
        p = a * m,
        u = o * m,
        v = c * l,
        T = c * d,
        S = c * m,
        w = n.x,
        E = n.y,
        R = n.z;
      return (
        (s[0] = (1 - (y + u)) * w),
        (s[1] = (f + S) * w),
        (s[2] = (g - T) * w),
        (s[3] = 0),
        (s[4] = (f - S) * E),
        (s[5] = (1 - (h + u)) * E),
        (s[6] = (p + v) * E),
        (s[7] = 0),
        (s[8] = (g + T) * R),
        (s[9] = (p - v) * R),
        (s[10] = (1 - (h + y)) * R),
        (s[11] = 0),
        (s[12] = e.x),
        (s[13] = e.y),
        (s[14] = e.z),
        (s[15] = 1),
        this
      );
    }
    decompose(e, t, n) {
      const s = this.elements;
      (e.x = s[12]), (e.y = s[13]), (e.z = s[14]);
      const r = this.determinant();
      if (r === 0) return n.set(1, 1, 1), t.identity(), this;
      let a = di.set(s[0], s[1], s[2]).length(),
        o = di.set(s[4], s[5], s[6]).length(),
        c = di.set(s[8], s[9], s[10]).length();
      r < 0 && (a = -a), Gt.copy(this);
      const l = 1 / a,
        d = 1 / o,
        m = 1 / c;
      return (
        (Gt.elements[0] *= l),
        (Gt.elements[1] *= l),
        (Gt.elements[2] *= l),
        (Gt.elements[4] *= d),
        (Gt.elements[5] *= d),
        (Gt.elements[6] *= d),
        (Gt.elements[8] *= m),
        (Gt.elements[9] *= m),
        (Gt.elements[10] *= m),
        t.setFromRotationMatrix(Gt),
        (n.x = a),
        (n.y = o),
        (n.z = c),
        this
      );
    }
    makePerspective(e, t, n, s, r, a, o = Xt, c = !1) {
      let l = this.elements,
        d = (2 * r) / (t - e),
        m = (2 * r) / (n - s),
        h = (t + e) / (t - e),
        f = (n + s) / (n - s),
        g,
        y;
      if (c) (g = r / (a - r)), (y = (a * r) / (a - r));
      else if (o === Xt) (g = -(a + r) / (a - r)), (y = (-2 * a * r) / (a - r));
      else if (o === Ci) (g = -a / (a - r)), (y = (-a * r) / (a - r));
      else throw new Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: ${o}`);
      return (
        (l[0] = d),
        (l[4] = 0),
        (l[8] = h),
        (l[12] = 0),
        (l[1] = 0),
        (l[5] = m),
        (l[9] = f),
        (l[13] = 0),
        (l[2] = 0),
        (l[6] = 0),
        (l[10] = g),
        (l[14] = y),
        (l[3] = 0),
        (l[7] = 0),
        (l[11] = -1),
        (l[15] = 0),
        this
      );
    }
    makeOrthographic(e, t, n, s, r, a, o = Xt, c = !1) {
      let l = this.elements,
        d = 2 / (t - e),
        m = 2 / (n - s),
        h = -(t + e) / (t - e),
        f = -(n + s) / (n - s),
        g,
        y;
      if (c) (g = 1 / (a - r)), (y = a / (a - r));
      else if (o === Xt) (g = -2 / (a - r)), (y = -(a + r) / (a - r));
      else if (o === Ci) (g = -1 / (a - r)), (y = -r / (a - r));
      else throw new Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: ${o}`);
      return (
        (l[0] = d),
        (l[4] = 0),
        (l[8] = 0),
        (l[12] = h),
        (l[1] = 0),
        (l[5] = m),
        (l[9] = 0),
        (l[13] = f),
        (l[2] = 0),
        (l[6] = 0),
        (l[10] = g),
        (l[14] = y),
        (l[3] = 0),
        (l[7] = 0),
        (l[11] = 0),
        (l[15] = 1),
        this
      );
    }
    equals(e) {
      const t = this.elements,
        n = e.elements;
      for (let s = 0; s < 16; s++) if (t[s] !== n[s]) return !1;
      return !0;
    }
    fromArray(e, t = 0) {
      for (let n = 0; n < 16; n++) this.elements[n] = e[n + t];
      return this;
    }
    toArray(e = [], t = 0) {
      const n = this.elements;
      return (
        (e[t] = n[0]),
        (e[t + 1] = n[1]),
        (e[t + 2] = n[2]),
        (e[t + 3] = n[3]),
        (e[t + 4] = n[4]),
        (e[t + 5] = n[5]),
        (e[t + 6] = n[6]),
        (e[t + 7] = n[7]),
        (e[t + 8] = n[8]),
        (e[t + 9] = n[9]),
        (e[t + 10] = n[10]),
        (e[t + 11] = n[11]),
        (e[t + 12] = n[12]),
        (e[t + 13] = n[13]),
        (e[t + 14] = n[14]),
        (e[t + 15] = n[15]),
        e
      );
    }
  },
  di = new L(),
  Gt = new tt(),
  jh = new L(0, 0, 0),
  eu = new L(1, 1, 1),
  An = new L(),
  Es = new L(),
  Lt = new L(),
  ic = new tt(),
  sc = new sn(),
  Dn = (() => {
    class i {
      constructor(t = 0, n = 0, s = 0, r = i.DEFAULT_ORDER) {
        (this.isEuler = !0), (this._x = t), (this._y = n), (this._z = s), (this._order = r);
      }
      get x() {
        return this._x;
      }
      set x(t) {
        (this._x = t), this._onChangeCallback();
      }
      get y() {
        return this._y;
      }
      set y(t) {
        (this._y = t), this._onChangeCallback();
      }
      get z() {
        return this._z;
      }
      set z(t) {
        (this._z = t), this._onChangeCallback();
      }
      get order() {
        return this._order;
      }
      set order(t) {
        (this._order = t), this._onChangeCallback();
      }
      set(t, n, s, r = this._order) {
        return (this._x = t), (this._y = n), (this._z = s), (this._order = r), this._onChangeCallback(), this;
      }
      clone() {
        return new this.constructor(this._x, this._y, this._z, this._order);
      }
      copy(t) {
        return (
          (this._x = t._x), (this._y = t._y), (this._z = t._z), (this._order = t._order), this._onChangeCallback(), this
        );
      }
      setFromRotationMatrix(t, n = this._order, s = !0) {
        const r = t.elements,
          a = r[0],
          o = r[4],
          c = r[8],
          l = r[1],
          d = r[5],
          m = r[9],
          h = r[2],
          f = r[6],
          g = r[10];
        switch (n) {
          case 'XYZ':
            (this._y = Math.asin(ke(c, -1, 1))),
              Math.abs(c) < 0.9999999
                ? ((this._x = Math.atan2(-m, g)), (this._z = Math.atan2(-o, a)))
                : ((this._x = Math.atan2(f, d)), (this._z = 0));
            break;
          case 'YXZ':
            (this._x = Math.asin(-ke(m, -1, 1))),
              Math.abs(m) < 0.9999999
                ? ((this._y = Math.atan2(c, g)), (this._z = Math.atan2(l, d)))
                : ((this._y = Math.atan2(-h, a)), (this._z = 0));
            break;
          case 'ZXY':
            (this._x = Math.asin(ke(f, -1, 1))),
              Math.abs(f) < 0.9999999
                ? ((this._y = Math.atan2(-h, g)), (this._z = Math.atan2(-o, d)))
                : ((this._y = 0), (this._z = Math.atan2(l, a)));
            break;
          case 'ZYX':
            (this._y = Math.asin(-ke(h, -1, 1))),
              Math.abs(h) < 0.9999999
                ? ((this._x = Math.atan2(f, g)), (this._z = Math.atan2(l, a)))
                : ((this._x = 0), (this._z = Math.atan2(-o, d)));
            break;
          case 'YZX':
            (this._z = Math.asin(ke(l, -1, 1))),
              Math.abs(l) < 0.9999999
                ? ((this._x = Math.atan2(-m, d)), (this._y = Math.atan2(-h, a)))
                : ((this._x = 0), (this._y = Math.atan2(c, g)));
            break;
          case 'XZY':
            (this._z = Math.asin(-ke(o, -1, 1))),
              Math.abs(o) < 0.9999999
                ? ((this._x = Math.atan2(f, d)), (this._y = Math.atan2(c, a)))
                : ((this._x = Math.atan2(-m, g)), (this._y = 0));
            break;
          default:
            Ee(`Euler: .setFromRotationMatrix() encountered an unknown order: ${n}`);
        }
        return (this._order = n), s === !0 && this._onChangeCallback(), this;
      }
      setFromQuaternion(t, n, s) {
        return ic.makeRotationFromQuaternion(t), this.setFromRotationMatrix(ic, n, s);
      }
      setFromVector3(t, n = this._order) {
        return this.set(t.x, t.y, t.z, n);
      }
      reorder(t) {
        return sc.setFromEuler(this), this.setFromQuaternion(sc, t);
      }
      equals(t) {
        return t._x === this._x && t._y === this._y && t._z === this._z && t._order === this._order;
      }
      fromArray(t) {
        return (
          (this._x = t[0]),
          (this._y = t[1]),
          (this._z = t[2]),
          t[3] !== void 0 && (this._order = t[3]),
          this._onChangeCallback(),
          this
        );
      }
      toArray(t = [], n = 0) {
        return (t[n] = this._x), (t[n + 1] = this._y), (t[n + 2] = this._z), (t[n + 3] = this._order), t;
      }
      _onChange(t) {
        return (this._onChangeCallback = t), this;
      }
      _onChangeCallback() {}
      *[Symbol.iterator]() {
        yield this._x, yield this._y, yield this._z, yield this._order;
      }
    }
    return (i.DEFAULT_ORDER = 'XYZ'), i;
  })(),
  Pi = class {
    constructor() {
      this.mask = 1;
    }
    set(e) {
      this.mask = ((1 << e) | 0) >>> 0;
    }
    enable(e) {
      this.mask |= (1 << e) | 0;
    }
    enableAll() {
      this.mask = -1;
    }
    toggle(e) {
      this.mask ^= (1 << e) | 0;
    }
    disable(e) {
      this.mask &= ~((1 << e) | 0);
    }
    disableAll() {
      this.mask = 0;
    }
    test(e) {
      return (this.mask & e.mask) !== 0;
    }
    isEnabled(e) {
      return (this.mask & ((1 << e) | 0)) !== 0;
    }
  },
  tu = 0,
  rc = new L(),
  fi = new sn(),
  fn = new tt(),
  ws = new L(),
  Gi = new L(),
  nu = new L(),
  iu = new sn(),
  ac = new L(1, 0, 0),
  oc = new L(0, 1, 0),
  lc = new L(0, 0, 1),
  cc = { type: 'added' },
  su = { type: 'removed' },
  pi = { type: 'childadded', child: null },
  Qa = { type: 'childremoved', child: null },
  $t = (() => {
    class i extends Mn {
      constructor() {
        super(),
          (this.isObject3D = !0),
          Object.defineProperty(this, 'id', { value: tu++ }),
          (this.uuid = Pn()),
          (this.name = ''),
          (this.type = 'Object3D'),
          (this.parent = null),
          (this.children = []),
          (this.up = i.DEFAULT_UP.clone());
        const t = new L(),
          n = new Dn(),
          s = new sn(),
          r = new L(1, 1, 1);
        function a() {
          s.setFromEuler(n, !1);
        }
        function o() {
          n.setFromQuaternion(s, void 0, !1);
        }
        n._onChange(a),
          s._onChange(o),
          Object.defineProperties(this, {
            position: { configurable: !0, enumerable: !0, value: t },
            rotation: { configurable: !0, enumerable: !0, value: n },
            quaternion: { configurable: !0, enumerable: !0, value: s },
            scale: { configurable: !0, enumerable: !0, value: r },
            modelViewMatrix: { value: new tt() },
            normalMatrix: { value: new De() },
          }),
          (this.matrix = new tt()),
          (this.matrixWorld = new tt()),
          (this.matrixAutoUpdate = i.DEFAULT_MATRIX_AUTO_UPDATE),
          (this.matrixWorldAutoUpdate = i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE),
          (this.matrixWorldNeedsUpdate = !1),
          (this.layers = new Pi()),
          (this.visible = !0),
          (this.castShadow = !1),
          (this.receiveShadow = !1),
          (this.frustumCulled = !0),
          (this.renderOrder = 0),
          (this.animations = []),
          (this.customDepthMaterial = void 0),
          (this.customDistanceMaterial = void 0),
          (this.static = !1),
          (this.userData = {}),
          (this.pivot = null);
      }
      onBeforeShadow() {}
      onAfterShadow() {}
      onBeforeRender() {}
      onAfterRender() {}
      applyMatrix4(t) {
        this.matrixAutoUpdate && this.updateMatrix(),
          this.matrix.premultiply(t),
          this.matrix.decompose(this.position, this.quaternion, this.scale);
      }
      applyQuaternion(t) {
        return this.quaternion.premultiply(t), this;
      }
      setRotationFromAxisAngle(t, n) {
        this.quaternion.setFromAxisAngle(t, n);
      }
      setRotationFromEuler(t) {
        this.quaternion.setFromEuler(t, !0);
      }
      setRotationFromMatrix(t) {
        this.quaternion.setFromRotationMatrix(t);
      }
      setRotationFromQuaternion(t) {
        this.quaternion.copy(t);
      }
      rotateOnAxis(t, n) {
        return fi.setFromAxisAngle(t, n), this.quaternion.multiply(fi), this;
      }
      rotateOnWorldAxis(t, n) {
        return fi.setFromAxisAngle(t, n), this.quaternion.premultiply(fi), this;
      }
      rotateX(t) {
        return this.rotateOnAxis(ac, t);
      }
      rotateY(t) {
        return this.rotateOnAxis(oc, t);
      }
      rotateZ(t) {
        return this.rotateOnAxis(lc, t);
      }
      translateOnAxis(t, n) {
        return rc.copy(t).applyQuaternion(this.quaternion), this.position.add(rc.multiplyScalar(n)), this;
      }
      translateX(t) {
        return this.translateOnAxis(ac, t);
      }
      translateY(t) {
        return this.translateOnAxis(oc, t);
      }
      translateZ(t) {
        return this.translateOnAxis(lc, t);
      }
      localToWorld(t) {
        return this.updateWorldMatrix(!0, !1), t.applyMatrix4(this.matrixWorld);
      }
      worldToLocal(t) {
        return this.updateWorldMatrix(!0, !1), t.applyMatrix4(fn.copy(this.matrixWorld).invert());
      }
      lookAt(t, n, s) {
        t.isVector3 ? ws.copy(t) : ws.set(t, n, s);
        const r = this.parent;
        this.updateWorldMatrix(!0, !1),
          Gi.setFromMatrixPosition(this.matrixWorld),
          this.isCamera || this.isLight ? fn.lookAt(Gi, ws, this.up) : fn.lookAt(ws, Gi, this.up),
          this.quaternion.setFromRotationMatrix(fn),
          r &&
            (fn.extractRotation(r.matrixWorld), fi.setFromRotationMatrix(fn), this.quaternion.premultiply(fi.invert()));
      }
      add(t) {
        if (arguments.length > 1) {
          for (let n = 0; n < arguments.length; n++) this.add(arguments[n]);
          return this;
        }
        return t === this
          ? (Ae("Object3D.add: object can't be added as a child of itself.", t), this)
          : (t?.isObject3D
              ? (t.removeFromParent(),
                (t.parent = this),
                this.children.push(t),
                t.dispatchEvent(cc),
                (pi.child = t),
                this.dispatchEvent(pi),
                (pi.child = null))
              : Ae('Object3D.add: object not an instance of THREE.Object3D.', t),
            this);
      }
      remove(t) {
        if (arguments.length > 1) {
          for (let s = 0; s < arguments.length; s++) this.remove(arguments[s]);
          return this;
        }
        const n = this.children.indexOf(t);
        return (
          n !== -1 &&
            ((t.parent = null),
            this.children.splice(n, 1),
            t.dispatchEvent(su),
            (Qa.child = t),
            this.dispatchEvent(Qa),
            (Qa.child = null)),
          this
        );
      }
      removeFromParent() {
        const t = this.parent;
        return t?.remove(this), this;
      }
      clear() {
        return this.remove(...this.children);
      }
      attach(t) {
        return (
          this.updateWorldMatrix(!0, !1),
          fn.copy(this.matrixWorld).invert(),
          t.parent !== null && (t.parent.updateWorldMatrix(!0, !1), fn.multiply(t.parent.matrixWorld)),
          t.applyMatrix4(fn),
          t.removeFromParent(),
          (t.parent = this),
          this.children.push(t),
          t.updateWorldMatrix(!1, !0),
          t.dispatchEvent(cc),
          (pi.child = t),
          this.dispatchEvent(pi),
          (pi.child = null),
          this
        );
      }
      getObjectById(t) {
        return this.getObjectByProperty('id', t);
      }
      getObjectByName(t) {
        return this.getObjectByProperty('name', t);
      }
      getObjectByProperty(t, n) {
        if (this[t] === n) return this;
        for (let s = 0, r = this.children.length; s < r; s++) {
          const o = this.children[s].getObjectByProperty(t, n);
          if (o !== void 0) return o;
        }
      }
      getObjectsByProperty(t, n, s = []) {
        this[t] === n && s.push(this);
        const r = this.children;
        for (let a = 0, o = r.length; a < o; a++) r[a].getObjectsByProperty(t, n, s);
        return s;
      }
      getWorldPosition(t) {
        return this.updateWorldMatrix(!0, !1), t.setFromMatrixPosition(this.matrixWorld);
      }
      getWorldQuaternion(t) {
        return this.updateWorldMatrix(!0, !1), this.matrixWorld.decompose(Gi, t, nu), t;
      }
      getWorldScale(t) {
        return this.updateWorldMatrix(!0, !1), this.matrixWorld.decompose(Gi, iu, t), t;
      }
      getWorldDirection(t) {
        this.updateWorldMatrix(!0, !1);
        const n = this.matrixWorld.elements;
        return t.set(n[8], n[9], n[10]).normalize();
      }
      raycast() {}
      traverse(t) {
        t(this);
        const n = this.children;
        for (let s = 0, r = n.length; s < r; s++) n[s].traverse(t);
      }
      traverseVisible(t) {
        if (this.visible === !1) return;
        t(this);
        const n = this.children;
        for (let s = 0, r = n.length; s < r; s++) n[s].traverseVisible(t);
      }
      traverseAncestors(t) {
        const n = this.parent;
        n !== null && (t(n), n.traverseAncestors(t));
      }
      updateMatrix() {
        this.matrix.compose(this.position, this.quaternion, this.scale);
        const t = this.pivot;
        if (t !== null) {
          const n = t.x,
            s = t.y,
            r = t.z,
            a = this.matrix.elements;
          (a[12] += n - a[0] * n - a[4] * s - a[8] * r),
            (a[13] += s - a[1] * n - a[5] * s - a[9] * r),
            (a[14] += r - a[2] * n - a[6] * s - a[10] * r);
        }
        this.matrixWorldNeedsUpdate = !0;
      }
      updateMatrixWorld(t) {
        this.matrixAutoUpdate && this.updateMatrix(),
          (this.matrixWorldNeedsUpdate || t) &&
            (this.matrixWorldAutoUpdate === !0 &&
              (this.parent === null
                ? this.matrixWorld.copy(this.matrix)
                : this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)),
            (this.matrixWorldNeedsUpdate = !1),
            (t = !0));
        const n = this.children;
        for (let s = 0, r = n.length; s < r; s++) n[s].updateMatrixWorld(t);
      }
      updateWorldMatrix(t, n) {
        const s = this.parent;
        if (
          (t === !0 && s !== null && s.updateWorldMatrix(!0, !1),
          this.matrixAutoUpdate && this.updateMatrix(),
          this.matrixWorldAutoUpdate === !0 &&
            (this.parent === null
              ? this.matrixWorld.copy(this.matrix)
              : this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix)),
          n === !0)
        ) {
          const r = this.children;
          for (let a = 0, o = r.length; a < o; a++) r[a].updateWorldMatrix(!1, !0);
        }
      }
      toJSON(t) {
        const n = t === void 0 || typeof t === 'string',
          s = {};
        n &&
          ((t = {
            geometries: {},
            materials: {},
            textures: {},
            images: {},
            shapes: {},
            skeletons: {},
            animations: {},
            nodes: {},
          }),
          (s.metadata = { version: 4.7, type: 'Object', generator: 'Object3D.toJSON' }));
        const r = {};
        (r.uuid = this.uuid),
          (r.type = this.type),
          this.name !== '' && (r.name = this.name),
          this.castShadow === !0 && (r.castShadow = !0),
          this.receiveShadow === !0 && (r.receiveShadow = !0),
          this.visible === !1 && (r.visible = !1),
          this.frustumCulled === !1 && (r.frustumCulled = !1),
          this.renderOrder !== 0 && (r.renderOrder = this.renderOrder),
          this.static !== !1 && (r.static = this.static),
          Object.keys(this.userData).length > 0 && (r.userData = this.userData),
          (r.layers = this.layers.mask),
          (r.matrix = this.matrix.toArray()),
          (r.up = this.up.toArray()),
          this.pivot !== null && (r.pivot = this.pivot.toArray()),
          this.matrixAutoUpdate === !1 && (r.matrixAutoUpdate = !1),
          this.morphTargetDictionary !== void 0 &&
            (r.morphTargetDictionary = Object.assign({}, this.morphTargetDictionary)),
          this.morphTargetInfluences !== void 0 && (r.morphTargetInfluences = this.morphTargetInfluences.slice()),
          this.isInstancedMesh &&
            ((r.type = 'InstancedMesh'),
            (r.count = this.count),
            (r.instanceMatrix = this.instanceMatrix.toJSON()),
            this.instanceColor !== null && (r.instanceColor = this.instanceColor.toJSON())),
          this.isBatchedMesh &&
            ((r.type = 'BatchedMesh'),
            (r.perObjectFrustumCulled = this.perObjectFrustumCulled),
            (r.sortObjects = this.sortObjects),
            (r.drawRanges = this._drawRanges),
            (r.reservedRanges = this._reservedRanges),
            (r.geometryInfo = this._geometryInfo.map((c) =>
              Xl(Oa({}, c), {
                boundingBox: c.boundingBox ? c.boundingBox.toJSON() : void 0,
                boundingSphere: c.boundingSphere ? c.boundingSphere.toJSON() : void 0,
              }),
            )),
            (r.instanceInfo = this._instanceInfo.map((c) => Oa({}, c))),
            (r.availableInstanceIds = this._availableInstanceIds.slice()),
            (r.availableGeometryIds = this._availableGeometryIds.slice()),
            (r.nextIndexStart = this._nextIndexStart),
            (r.nextVertexStart = this._nextVertexStart),
            (r.geometryCount = this._geometryCount),
            (r.maxInstanceCount = this._maxInstanceCount),
            (r.maxVertexCount = this._maxVertexCount),
            (r.maxIndexCount = this._maxIndexCount),
            (r.geometryInitialized = this._geometryInitialized),
            (r.matricesTexture = this._matricesTexture.toJSON(t)),
            (r.indirectTexture = this._indirectTexture.toJSON(t)),
            this._colorsTexture !== null && (r.colorsTexture = this._colorsTexture.toJSON(t)),
            this.boundingSphere !== null && (r.boundingSphere = this.boundingSphere.toJSON()),
            this.boundingBox !== null && (r.boundingBox = this.boundingBox.toJSON()));
        function a(c, l) {
          return c[l.uuid] === void 0 && (c[l.uuid] = l.toJSON(t)), l.uuid;
        }
        if (this.isScene)
          this.background &&
            (this.background.isColor
              ? (r.background = this.background.toJSON())
              : this.background.isTexture && (r.background = this.background.toJSON(t).uuid)),
            this.environment?.isTexture &&
              this.environment.isRenderTargetTexture !== !0 &&
              (r.environment = this.environment.toJSON(t).uuid);
        else if (this.isMesh || this.isLine || this.isPoints) {
          r.geometry = a(t.geometries, this.geometry);
          const c = this.geometry.parameters;
          if (c !== void 0 && c.shapes !== void 0) {
            const l = c.shapes;
            if (Array.isArray(l))
              for (let d = 0, m = l.length; d < m; d++) {
                const h = l[d];
                a(t.shapes, h);
              }
            else a(t.shapes, l);
          }
        }
        if (
          (this.isSkinnedMesh &&
            ((r.bindMode = this.bindMode),
            (r.bindMatrix = this.bindMatrix.toArray()),
            this.skeleton !== void 0 && (a(t.skeletons, this.skeleton), (r.skeleton = this.skeleton.uuid))),
          this.material !== void 0)
        )
          if (Array.isArray(this.material)) {
            const c = [];
            for (let l = 0, d = this.material.length; l < d; l++) c.push(a(t.materials, this.material[l]));
            r.material = c;
          } else r.material = a(t.materials, this.material);
        if (this.children.length > 0) {
          r.children = [];
          for (let c = 0; c < this.children.length; c++) r.children.push(this.children[c].toJSON(t).object);
        }
        if (this.animations.length > 0) {
          r.animations = [];
          for (let c = 0; c < this.animations.length; c++) {
            const l = this.animations[c];
            r.animations.push(a(t.animations, l));
          }
        }
        if (n) {
          const c = o(t.geometries),
            l = o(t.materials),
            d = o(t.textures),
            m = o(t.images),
            h = o(t.shapes),
            f = o(t.skeletons),
            g = o(t.animations),
            y = o(t.nodes);
          c.length > 0 && (s.geometries = c),
            l.length > 0 && (s.materials = l),
            d.length > 0 && (s.textures = d),
            m.length > 0 && (s.images = m),
            h.length > 0 && (s.shapes = h),
            f.length > 0 && (s.skeletons = f),
            g.length > 0 && (s.animations = g),
            y.length > 0 && (s.nodes = y);
        }
        return (s.object = r), s;
        function o(c) {
          const l = [];
          for (const d in c) {
            const m = c[d];
            delete m.metadata, l.push(m);
          }
          return l;
        }
      }
      clone(t) {
        return new this.constructor().copy(this, t);
      }
      copy(t, n = !0) {
        if (
          ((this.name = t.name),
          this.up.copy(t.up),
          this.position.copy(t.position),
          (this.rotation.order = t.rotation.order),
          this.quaternion.copy(t.quaternion),
          this.scale.copy(t.scale),
          t.pivot !== null && (this.pivot = t.pivot.clone()),
          this.matrix.copy(t.matrix),
          this.matrixWorld.copy(t.matrixWorld),
          (this.matrixAutoUpdate = t.matrixAutoUpdate),
          (this.matrixWorldAutoUpdate = t.matrixWorldAutoUpdate),
          (this.matrixWorldNeedsUpdate = t.matrixWorldNeedsUpdate),
          (this.layers.mask = t.layers.mask),
          (this.visible = t.visible),
          (this.castShadow = t.castShadow),
          (this.receiveShadow = t.receiveShadow),
          (this.frustumCulled = t.frustumCulled),
          (this.renderOrder = t.renderOrder),
          (this.static = t.static),
          (this.animations = t.animations.slice()),
          (this.userData = JSON.parse(JSON.stringify(t.userData))),
          n === !0)
        )
          for (let s = 0; s < t.children.length; s++) {
            const r = t.children[s];
            this.add(r.clone());
          }
        return this;
      }
    }
    return (
      (i.DEFAULT_UP = new L(0, 1, 0)), (i.DEFAULT_MATRIX_AUTO_UPDATE = !0), (i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = !0), i
    );
  })(),
  Qn = class extends $t {
    constructor() {
      super(), (this.isGroup = !0), (this.type = 'Group');
    }
  },
  ru = { type: 'move' },
  Li = class {
    constructor() {
      (this._targetRay = null), (this._grip = null), (this._hand = null);
    }
    getHandSpace() {
      return (
        this._hand === null &&
          ((this._hand = new Qn()),
          (this._hand.matrixAutoUpdate = !1),
          (this._hand.visible = !1),
          (this._hand.joints = {}),
          (this._hand.inputState = { pinching: !1 })),
        this._hand
      );
    }
    getTargetRaySpace() {
      return (
        this._targetRay === null &&
          ((this._targetRay = new Qn()),
          (this._targetRay.matrixAutoUpdate = !1),
          (this._targetRay.visible = !1),
          (this._targetRay.hasLinearVelocity = !1),
          (this._targetRay.linearVelocity = new L()),
          (this._targetRay.hasAngularVelocity = !1),
          (this._targetRay.angularVelocity = new L())),
        this._targetRay
      );
    }
    getGripSpace() {
      return (
        this._grip === null &&
          ((this._grip = new Qn()),
          (this._grip.matrixAutoUpdate = !1),
          (this._grip.visible = !1),
          (this._grip.hasLinearVelocity = !1),
          (this._grip.linearVelocity = new L()),
          (this._grip.hasAngularVelocity = !1),
          (this._grip.angularVelocity = new L())),
        this._grip
      );
    }
    dispatchEvent(e) {
      return this._targetRay?.dispatchEvent(e), this._grip?.dispatchEvent(e), this._hand?.dispatchEvent(e), this;
    }
    connect(e) {
      if (e?.hand) {
        const t = this._hand;
        if (t) for (const n of e.hand.values()) this._getHandJoint(t, n);
      }
      return this.dispatchEvent({ type: 'connected', data: e }), this;
    }
    disconnect(e) {
      return (
        this.dispatchEvent({ type: 'disconnected', data: e }),
        this._targetRay !== null && (this._targetRay.visible = !1),
        this._grip !== null && (this._grip.visible = !1),
        this._hand !== null && (this._hand.visible = !1),
        this
      );
    }
    update(e, t, n) {
      let s = null,
        r = null,
        a = null,
        o = this._targetRay,
        c = this._grip,
        l = this._hand;
      if (e && t.session.visibilityState !== 'visible-blurred') {
        if (l && e.hand) {
          a = !0;
          for (const y of e.hand.values()) {
            const p = t.getJointPose(y, n),
              u = this._getHandJoint(l, y);
            p !== null &&
              (u.matrix.fromArray(p.transform.matrix),
              u.matrix.decompose(u.position, u.rotation, u.scale),
              (u.matrixWorldNeedsUpdate = !0),
              (u.jointRadius = p.radius)),
              (u.visible = p !== null);
          }
          const d = l.joints['index-finger-tip'],
            m = l.joints['thumb-tip'],
            h = d.position.distanceTo(m.position),
            f = 0.02,
            g = 0.005;
          l.inputState.pinching && h > f + g
            ? ((l.inputState.pinching = !1),
              this.dispatchEvent({ type: 'pinchend', handedness: e.handedness, target: this }))
            : !l.inputState.pinching &&
              h <= f - g &&
              ((l.inputState.pinching = !0),
              this.dispatchEvent({ type: 'pinchstart', handedness: e.handedness, target: this }));
        } else
          c !== null &&
            e.gripSpace &&
            ((r = t.getPose(e.gripSpace, n)),
            r !== null &&
              (c.matrix.fromArray(r.transform.matrix),
              c.matrix.decompose(c.position, c.rotation, c.scale),
              (c.matrixWorldNeedsUpdate = !0),
              r.linearVelocity
                ? ((c.hasLinearVelocity = !0), c.linearVelocity.copy(r.linearVelocity))
                : (c.hasLinearVelocity = !1),
              r.angularVelocity
                ? ((c.hasAngularVelocity = !0), c.angularVelocity.copy(r.angularVelocity))
                : (c.hasAngularVelocity = !1)));
        o !== null &&
          ((s = t.getPose(e.targetRaySpace, n)),
          s === null && r !== null && (s = r),
          s !== null &&
            (o.matrix.fromArray(s.transform.matrix),
            o.matrix.decompose(o.position, o.rotation, o.scale),
            (o.matrixWorldNeedsUpdate = !0),
            s.linearVelocity
              ? ((o.hasLinearVelocity = !0), o.linearVelocity.copy(s.linearVelocity))
              : (o.hasLinearVelocity = !1),
            s.angularVelocity
              ? ((o.hasAngularVelocity = !0), o.angularVelocity.copy(s.angularVelocity))
              : (o.hasAngularVelocity = !1),
            this.dispatchEvent(ru)));
      }
      return (
        o !== null && (o.visible = s !== null),
        c !== null && (c.visible = r !== null),
        l !== null && (l.visible = a !== null),
        this
      );
    }
    _getHandJoint(e, t) {
      if (e.joints[t.jointName] === void 0) {
        const n = new Qn();
        (n.matrixAutoUpdate = !1), (n.visible = !1), (e.joints[t.jointName] = n), e.add(n);
      }
      return e.joints[t.jointName];
    }
  },
  lh = {
    aliceblue: 15792383,
    antiquewhite: 16444375,
    aqua: 65535,
    aquamarine: 8388564,
    azure: 15794175,
    beige: 16119260,
    bisque: 16770244,
    black: 0,
    blanchedalmond: 16772045,
    blue: 255,
    blueviolet: 9055202,
    brown: 10824234,
    burlywood: 14596231,
    cadetblue: 6266528,
    chartreuse: 8388352,
    chocolate: 13789470,
    coral: 16744272,
    cornflowerblue: 6591981,
    cornsilk: 16775388,
    crimson: 14423100,
    cyan: 65535,
    darkblue: 139,
    darkcyan: 35723,
    darkgoldenrod: 12092939,
    darkgray: 11119017,
    darkgreen: 25600,
    darkgrey: 11119017,
    darkkhaki: 12433259,
    darkmagenta: 9109643,
    darkolivegreen: 5597999,
    darkorange: 16747520,
    darkorchid: 10040012,
    darkred: 9109504,
    darksalmon: 15308410,
    darkseagreen: 9419919,
    darkslateblue: 4734347,
    darkslategray: 3100495,
    darkslategrey: 3100495,
    darkturquoise: 52945,
    darkviolet: 9699539,
    deeppink: 16716947,
    deepskyblue: 49151,
    dimgray: 6908265,
    dimgrey: 6908265,
    dodgerblue: 2003199,
    firebrick: 11674146,
    floralwhite: 16775920,
    forestgreen: 2263842,
    fuchsia: 16711935,
    gainsboro: 14474460,
    ghostwhite: 16316671,
    gold: 16766720,
    goldenrod: 14329120,
    gray: 8421504,
    green: 32768,
    greenyellow: 11403055,
    grey: 8421504,
    honeydew: 15794160,
    hotpink: 16738740,
    indianred: 13458524,
    indigo: 4915330,
    ivory: 16777200,
    khaki: 15787660,
    lavender: 15132410,
    lavenderblush: 16773365,
    lawngreen: 8190976,
    lemonchiffon: 16775885,
    lightblue: 11393254,
    lightcoral: 15761536,
    lightcyan: 14745599,
    lightgoldenrodyellow: 16448210,
    lightgray: 13882323,
    lightgreen: 9498256,
    lightgrey: 13882323,
    lightpink: 16758465,
    lightsalmon: 16752762,
    lightseagreen: 2142890,
    lightskyblue: 8900346,
    lightslategray: 7833753,
    lightslategrey: 7833753,
    lightsteelblue: 11584734,
    lightyellow: 16777184,
    lime: 65280,
    limegreen: 3329330,
    linen: 16445670,
    magenta: 16711935,
    maroon: 8388608,
    mediumaquamarine: 6737322,
    mediumblue: 205,
    mediumorchid: 12211667,
    mediumpurple: 9662683,
    mediumseagreen: 3978097,
    mediumslateblue: 8087790,
    mediumspringgreen: 64154,
    mediumturquoise: 4772300,
    mediumvioletred: 13047173,
    midnightblue: 1644912,
    mintcream: 16121850,
    mistyrose: 16770273,
    moccasin: 16770229,
    navajowhite: 16768685,
    navy: 128,
    oldlace: 16643558,
    olive: 8421376,
    olivedrab: 7048739,
    orange: 16753920,
    orangered: 16729344,
    orchid: 14315734,
    palegoldenrod: 15657130,
    palegreen: 10025880,
    paleturquoise: 11529966,
    palevioletred: 14381203,
    papayawhip: 16773077,
    peachpuff: 16767673,
    peru: 13468991,
    pink: 16761035,
    plum: 14524637,
    powderblue: 11591910,
    purple: 8388736,
    rebeccapurple: 6697881,
    red: 16711680,
    rosybrown: 12357519,
    royalblue: 4286945,
    saddlebrown: 9127187,
    salmon: 16416882,
    sandybrown: 16032864,
    seagreen: 3050327,
    seashell: 16774638,
    sienna: 10506797,
    silver: 12632256,
    skyblue: 8900331,
    slateblue: 6970061,
    slategray: 7372944,
    slategrey: 7372944,
    snow: 16775930,
    springgreen: 65407,
    steelblue: 4620980,
    tan: 13808780,
    teal: 32896,
    thistle: 14204888,
    tomato: 16737095,
    turquoise: 4251856,
    violet: 15631086,
    wheat: 16113331,
    white: 16777215,
    whitesmoke: 16119285,
    yellow: 16776960,
    yellowgreen: 10145074,
  },
  En = { h: 0, s: 0, l: 0 },
  Cs = { h: 0, s: 0, l: 0 };
function ja(i, e, t) {
  return (
    t < 0 && (t += 1),
    t > 1 && (t -= 1),
    t < 1 / 6 ? i + (e - i) * 6 * t : t < 1 / 2 ? e : t < 2 / 3 ? i + (e - i) * 6 * (2 / 3 - t) : i
  );
}
var Ve = class {
    constructor(e, t, n) {
      return (this.isColor = !0), (this.r = 1), (this.g = 1), (this.b = 1), this.set(e, t, n);
    }
    set(e, t, n) {
      if (t === void 0 && n === void 0) {
        const s = e;
        s?.isColor ? this.copy(s) : typeof s === 'number' ? this.setHex(s) : typeof s === 'string' && this.setStyle(s);
      } else this.setRGB(e, t, n);
      return this;
    }
    setScalar(e) {
      return (this.r = e), (this.g = e), (this.b = e), this;
    }
    setHex(e, t = Ut) {
      return (
        (e = Math.floor(e)),
        (this.r = ((e >> 16) & 255) / 255),
        (this.g = ((e >> 8) & 255) / 255),
        (this.b = (e & 255) / 255),
        Ge.colorSpaceToWorking(this, t),
        this
      );
    }
    setRGB(e, t, n, s = Ge.workingColorSpace) {
      return (this.r = e), (this.g = t), (this.b = n), Ge.colorSpaceToWorking(this, s), this;
    }
    setHSL(e, t, n, s = Ge.workingColorSpace) {
      if (((e = Jh(e, 1)), (t = ke(t, 0, 1)), (n = ke(n, 0, 1)), t === 0)) this.r = this.g = this.b = n;
      else {
        const r = n <= 0.5 ? n * (1 + t) : n + t - n * t,
          a = 2 * n - r;
        (this.r = ja(a, r, e + 1 / 3)), (this.g = ja(a, r, e)), (this.b = ja(a, r, e - 1 / 3));
      }
      return Ge.colorSpaceToWorking(this, s), this;
    }
    setStyle(e, t = Ut) {
      function n(r) {
        r !== void 0 && parseFloat(r) < 1 && Ee(`Color: Alpha component of ${e} will be ignored.`);
      }
      let s;
      if ((s = /^(\w+)\(([^)]*)\)/.exec(e))) {
        let r,
          a = s[1],
          o = s[2];
        switch (a) {
          case 'rgb':
          case 'rgba':
            if ((r = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o)))
              return (
                n(r[4]),
                this.setRGB(
                  Math.min(255, parseInt(r[1], 10)) / 255,
                  Math.min(255, parseInt(r[2], 10)) / 255,
                  Math.min(255, parseInt(r[3], 10)) / 255,
                  t,
                )
              );
            if ((r = /^\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o)))
              return (
                n(r[4]),
                this.setRGB(
                  Math.min(100, parseInt(r[1], 10)) / 100,
                  Math.min(100, parseInt(r[2], 10)) / 100,
                  Math.min(100, parseInt(r[3], 10)) / 100,
                  t,
                )
              );
            break;
          case 'hsl':
          case 'hsla':
            if ((r = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o)))
              return n(r[4]), this.setHSL(parseFloat(r[1]) / 360, parseFloat(r[2]) / 100, parseFloat(r[3]) / 100, t);
            break;
          default:
            Ee(`Color: Unknown color model ${e}`);
        }
      } else if ((s = /^#([A-Fa-f\d]+)$/.exec(e))) {
        const r = s[1],
          a = r.length;
        if (a === 3)
          return this.setRGB(
            parseInt(r.charAt(0), 16) / 15,
            parseInt(r.charAt(1), 16) / 15,
            parseInt(r.charAt(2), 16) / 15,
            t,
          );
        if (a === 6) return this.setHex(parseInt(r, 16), t);
        Ee(`Color: Invalid hex color ${e}`);
      } else if (e && e.length > 0) return this.setColorName(e, t);
      return this;
    }
    setColorName(e, t = Ut) {
      const n = lh[e.toLowerCase()];
      return n !== void 0 ? this.setHex(n, t) : Ee(`Color: Unknown color ${e}`), this;
    }
    clone() {
      return new this.constructor(this.r, this.g, this.b);
    }
    copy(e) {
      return (this.r = e.r), (this.g = e.g), (this.b = e.b), this;
    }
    copySRGBToLinear(e) {
      return (this.r = vn(e.r)), (this.g = vn(e.g)), (this.b = vn(e.b)), this;
    }
    copyLinearToSRGB(e) {
      return (this.r = wi(e.r)), (this.g = wi(e.g)), (this.b = wi(e.b)), this;
    }
    convertSRGBToLinear() {
      return this.copySRGBToLinear(this), this;
    }
    convertLinearToSRGB() {
      return this.copyLinearToSRGB(this), this;
    }
    getHex(e = Ut) {
      return (
        Ge.workingToColorSpace(Tt.copy(this), e),
        Math.round(ke(Tt.r * 255, 0, 255)) * 65536 +
          Math.round(ke(Tt.g * 255, 0, 255)) * 256 +
          Math.round(ke(Tt.b * 255, 0, 255))
      );
    }
    getHexString(e = Ut) {
      return `000000${this.getHex(e).toString(16)}`.slice(-6);
    }
    getHSL(e, t = Ge.workingColorSpace) {
      Ge.workingToColorSpace(Tt.copy(this), t);
      let n = Tt.r,
        s = Tt.g,
        r = Tt.b,
        a = Math.max(n, s, r),
        o = Math.min(n, s, r),
        c,
        l,
        d = (o + a) / 2;
      if (o === a) (c = 0), (l = 0);
      else {
        const m = a - o;
        switch (((l = d <= 0.5 ? m / (a + o) : m / (2 - a - o)), a)) {
          case n:
            c = (s - r) / m + (s < r ? 6 : 0);
            break;
          case s:
            c = (r - n) / m + 2;
            break;
          case r:
            c = (n - s) / m + 4;
            break;
        }
        c /= 6;
      }
      return (e.h = c), (e.s = l), (e.l = d), e;
    }
    getRGB(e, t = Ge.workingColorSpace) {
      return Ge.workingToColorSpace(Tt.copy(this), t), (e.r = Tt.r), (e.g = Tt.g), (e.b = Tt.b), e;
    }
    getStyle(e = Ut) {
      Ge.workingToColorSpace(Tt.copy(this), e);
      const t = Tt.r,
        n = Tt.g,
        s = Tt.b;
      return e !== Ut
        ? `color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`
        : `rgb(${Math.round(t * 255)},${Math.round(n * 255)},${Math.round(s * 255)})`;
    }
    offsetHSL(e, t, n) {
      return this.getHSL(En), this.setHSL(En.h + e, En.s + t, En.l + n);
    }
    add(e) {
      return (this.r += e.r), (this.g += e.g), (this.b += e.b), this;
    }
    addColors(e, t) {
      return (this.r = e.r + t.r), (this.g = e.g + t.g), (this.b = e.b + t.b), this;
    }
    addScalar(e) {
      return (this.r += e), (this.g += e), (this.b += e), this;
    }
    sub(e) {
      return (
        (this.r = Math.max(0, this.r - e.r)),
        (this.g = Math.max(0, this.g - e.g)),
        (this.b = Math.max(0, this.b - e.b)),
        this
      );
    }
    multiply(e) {
      return (this.r *= e.r), (this.g *= e.g), (this.b *= e.b), this;
    }
    multiplyScalar(e) {
      return (this.r *= e), (this.g *= e), (this.b *= e), this;
    }
    lerp(e, t) {
      return (this.r += (e.r - this.r) * t), (this.g += (e.g - this.g) * t), (this.b += (e.b - this.b) * t), this;
    }
    lerpColors(e, t, n) {
      return (this.r = e.r + (t.r - e.r) * n), (this.g = e.g + (t.g - e.g) * n), (this.b = e.b + (t.b - e.b) * n), this;
    }
    lerpHSL(e, t) {
      this.getHSL(En), e.getHSL(Cs);
      const n = Ya(En.h, Cs.h, t),
        s = Ya(En.s, Cs.s, t),
        r = Ya(En.l, Cs.l, t);
      return this.setHSL(n, s, r), this;
    }
    setFromVector3(e) {
      return (this.r = e.x), (this.g = e.y), (this.b = e.z), this;
    }
    applyMatrix3(e) {
      const t = this.r,
        n = this.g,
        s = this.b,
        r = e.elements;
      return (
        (this.r = r[0] * t + r[3] * n + r[6] * s),
        (this.g = r[1] * t + r[4] * n + r[7] * s),
        (this.b = r[2] * t + r[5] * n + r[8] * s),
        this
      );
    }
    equals(e) {
      return e.r === this.r && e.g === this.g && e.b === this.b;
    }
    fromArray(e, t = 0) {
      return (this.r = e[t]), (this.g = e[t + 1]), (this.b = e[t + 2]), this;
    }
    toArray(e = [], t = 0) {
      return (e[t] = this.r), (e[t + 1] = this.g), (e[t + 2] = this.b), e;
    }
    fromBufferAttribute(e, t) {
      return (this.r = e.getX(t)), (this.g = e.getY(t)), (this.b = e.getZ(t)), this;
    }
    toJSON() {
      return this.getHex();
    }
    *[Symbol.iterator]() {
      yield this.r, yield this.g, yield this.b;
    }
  },
  Tt = new Ve();
Ve.NAMES = lh;
var Eo = class i {
    constructor(e, t = 25e-5) {
      (this.isFogExp2 = !0), (this.name = ''), (this.color = new Ve(e)), (this.density = t);
    }
    clone() {
      return new i(this.color, this.density);
    }
    toJSON() {
      return { type: 'FogExp2', name: this.name, color: this.color.getHex(), density: this.density };
    }
  },
  wo = class i {
    constructor(e, t = 1, n = 1e3) {
      (this.isFog = !0), (this.name = ''), (this.color = new Ve(e)), (this.near = t), (this.far = n);
    }
    clone() {
      return new i(this.color, this.near, this.far);
    }
    toJSON() {
      return { type: 'Fog', name: this.name, color: this.color.getHex(), near: this.near, far: this.far };
    }
  },
  Co = class extends $t {
    constructor() {
      super(),
        (this.isScene = !0),
        (this.type = 'Scene'),
        (this.background = null),
        (this.environment = null),
        (this.fog = null),
        (this.backgroundBlurriness = 0),
        (this.backgroundIntensity = 1),
        (this.backgroundRotation = new Dn()),
        (this.environmentIntensity = 1),
        (this.environmentRotation = new Dn()),
        (this.overrideMaterial = null),
        typeof __THREE_DEVTOOLS__ < 'u' &&
          __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent('observe', { detail: this }));
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        e.background !== null && (this.background = e.background.clone()),
        e.environment !== null && (this.environment = e.environment.clone()),
        e.fog !== null && (this.fog = e.fog.clone()),
        (this.backgroundBlurriness = e.backgroundBlurriness),
        (this.backgroundIntensity = e.backgroundIntensity),
        this.backgroundRotation.copy(e.backgroundRotation),
        (this.environmentIntensity = e.environmentIntensity),
        this.environmentRotation.copy(e.environmentRotation),
        e.overrideMaterial !== null && (this.overrideMaterial = e.overrideMaterial.clone()),
        (this.matrixAutoUpdate = e.matrixAutoUpdate),
        this
      );
    }
    toJSON(e) {
      const t = super.toJSON(e);
      return (
        this.fog !== null && (t.object.fog = this.fog.toJSON()),
        this.backgroundBlurriness > 0 && (t.object.backgroundBlurriness = this.backgroundBlurriness),
        this.backgroundIntensity !== 1 && (t.object.backgroundIntensity = this.backgroundIntensity),
        (t.object.backgroundRotation = this.backgroundRotation.toArray()),
        this.environmentIntensity !== 1 && (t.object.environmentIntensity = this.environmentIntensity),
        (t.object.environmentRotation = this.environmentRotation.toArray()),
        t
      );
    }
  },
  Ht = new L(),
  pn = new L(),
  eo = new L(),
  mn = new L(),
  mi = new L(),
  gi = new L(),
  hc = new L(),
  to = new L(),
  no = new L(),
  io = new L(),
  so = new at(),
  ro = new at(),
  ao = new at(),
  xn = class i {
    constructor(e = new L(), t = new L(), n = new L()) {
      (this.a = e), (this.b = t), (this.c = n);
    }
    static getNormal(e, t, n, s) {
      s.subVectors(n, t), Ht.subVectors(e, t), s.cross(Ht);
      const r = s.lengthSq();
      return r > 0 ? s.multiplyScalar(1 / Math.sqrt(r)) : s.set(0, 0, 0);
    }
    static getBarycoord(e, t, n, s, r) {
      Ht.subVectors(s, t), pn.subVectors(n, t), eo.subVectors(e, t);
      const a = Ht.dot(Ht),
        o = Ht.dot(pn),
        c = Ht.dot(eo),
        l = pn.dot(pn),
        d = pn.dot(eo),
        m = a * l - o * o;
      if (m === 0) return r.set(0, 0, 0), null;
      const h = 1 / m,
        f = (l * c - o * d) * h,
        g = (a * d - o * c) * h;
      return r.set(1 - f - g, g, f);
    }
    static containsPoint(e, t, n, s) {
      return i.getBarycoord(e, t, n, s, mn) === null ? !1 : mn.x >= 0 && mn.y >= 0 && mn.x + mn.y <= 1;
    }
    static getInterpolation(e, t, n, s, r, a, o, c) {
      return i.getBarycoord(e, t, n, s, mn) === null
        ? ((c.x = 0), (c.y = 0), 'z' in c && (c.z = 0), 'w' in c && (c.w = 0), null)
        : (c.setScalar(0), c.addScaledVector(r, mn.x), c.addScaledVector(a, mn.y), c.addScaledVector(o, mn.z), c);
    }
    static getInterpolatedAttribute(e, t, n, s, r, a) {
      return (
        so.setScalar(0),
        ro.setScalar(0),
        ao.setScalar(0),
        so.fromBufferAttribute(e, t),
        ro.fromBufferAttribute(e, n),
        ao.fromBufferAttribute(e, s),
        a.setScalar(0),
        a.addScaledVector(so, r.x),
        a.addScaledVector(ro, r.y),
        a.addScaledVector(ao, r.z),
        a
      );
    }
    static isFrontFacing(e, t, n, s) {
      return Ht.subVectors(n, t), pn.subVectors(e, t), Ht.cross(pn).dot(s) < 0;
    }
    set(e, t, n) {
      return this.a.copy(e), this.b.copy(t), this.c.copy(n), this;
    }
    setFromPointsAndIndices(e, t, n, s) {
      return this.a.copy(e[t]), this.b.copy(e[n]), this.c.copy(e[s]), this;
    }
    setFromAttributeAndIndices(e, t, n, s) {
      return this.a.fromBufferAttribute(e, t), this.b.fromBufferAttribute(e, n), this.c.fromBufferAttribute(e, s), this;
    }
    clone() {
      return new this.constructor().copy(this);
    }
    copy(e) {
      return this.a.copy(e.a), this.b.copy(e.b), this.c.copy(e.c), this;
    }
    getArea() {
      return Ht.subVectors(this.c, this.b), pn.subVectors(this.a, this.b), Ht.cross(pn).length() * 0.5;
    }
    getMidpoint(e) {
      return e
        .addVectors(this.a, this.b)
        .add(this.c)
        .multiplyScalar(1 / 3);
    }
    getNormal(e) {
      return i.getNormal(this.a, this.b, this.c, e);
    }
    getPlane(e) {
      return e.setFromCoplanarPoints(this.a, this.b, this.c);
    }
    getBarycoord(e, t) {
      return i.getBarycoord(e, this.a, this.b, this.c, t);
    }
    getInterpolation(e, t, n, s, r) {
      return i.getInterpolation(e, this.a, this.b, this.c, t, n, s, r);
    }
    containsPoint(e) {
      return i.containsPoint(e, this.a, this.b, this.c);
    }
    isFrontFacing(e) {
      return i.isFrontFacing(this.a, this.b, this.c, e);
    }
    intersectsBox(e) {
      return e.intersectsTriangle(this);
    }
    closestPointToPoint(e, t) {
      let n = this.a,
        s = this.b,
        r = this.c,
        a,
        o;
      mi.subVectors(s, n), gi.subVectors(r, n), to.subVectors(e, n);
      const c = mi.dot(to),
        l = gi.dot(to);
      if (c <= 0 && l <= 0) return t.copy(n);
      no.subVectors(e, s);
      const d = mi.dot(no),
        m = gi.dot(no);
      if (d >= 0 && m <= d) return t.copy(s);
      const h = c * m - d * l;
      if (h <= 0 && c >= 0 && d <= 0) return (a = c / (c - d)), t.copy(n).addScaledVector(mi, a);
      io.subVectors(e, r);
      const f = mi.dot(io),
        g = gi.dot(io);
      if (g >= 0 && f <= g) return t.copy(r);
      const y = f * l - c * g;
      if (y <= 0 && l >= 0 && g <= 0) return (o = l / (l - g)), t.copy(n).addScaledVector(gi, o);
      const p = d * g - f * m;
      if (p <= 0 && m - d >= 0 && f - g >= 0)
        return hc.subVectors(r, s), (o = (m - d) / (m - d + (f - g))), t.copy(s).addScaledVector(hc, o);
      const u = 1 / (p + y + h);
      return (a = y * u), (o = h * u), t.copy(n).addScaledVector(mi, a).addScaledVector(gi, o);
    }
    equals(e) {
      return e.a.equals(this.a) && e.b.equals(this.b) && e.c.equals(this.c);
    }
  },
  Un = class {
    constructor(e = new L(1 / 0, 1 / 0, 1 / 0), t = new L(-1 / 0, -1 / 0, -1 / 0)) {
      (this.isBox3 = !0), (this.min = e), (this.max = t);
    }
    set(e, t) {
      return this.min.copy(e), this.max.copy(t), this;
    }
    setFromArray(e) {
      this.makeEmpty();
      for (let t = 0, n = e.length; t < n; t += 3) this.expandByPoint(Wt.fromArray(e, t));
      return this;
    }
    setFromBufferAttribute(e) {
      this.makeEmpty();
      for (let t = 0, n = e.count; t < n; t++) this.expandByPoint(Wt.fromBufferAttribute(e, t));
      return this;
    }
    setFromPoints(e) {
      this.makeEmpty();
      for (let t = 0, n = e.length; t < n; t++) this.expandByPoint(e[t]);
      return this;
    }
    setFromCenterAndSize(e, t) {
      const n = Wt.copy(t).multiplyScalar(0.5);
      return this.min.copy(e).sub(n), this.max.copy(e).add(n), this;
    }
    setFromObject(e, t = !1) {
      return this.makeEmpty(), this.expandByObject(e, t);
    }
    clone() {
      return new this.constructor().copy(this);
    }
    copy(e) {
      return this.min.copy(e.min), this.max.copy(e.max), this;
    }
    makeEmpty() {
      return (this.min.x = this.min.y = this.min.z = 1 / 0), (this.max.x = this.max.y = this.max.z = -1 / 0), this;
    }
    isEmpty() {
      return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
    }
    getCenter(e) {
      return this.isEmpty() ? e.set(0, 0, 0) : e.addVectors(this.min, this.max).multiplyScalar(0.5);
    }
    getSize(e) {
      return this.isEmpty() ? e.set(0, 0, 0) : e.subVectors(this.max, this.min);
    }
    expandByPoint(e) {
      return this.min.min(e), this.max.max(e), this;
    }
    expandByVector(e) {
      return this.min.sub(e), this.max.add(e), this;
    }
    expandByScalar(e) {
      return this.min.addScalar(-e), this.max.addScalar(e), this;
    }
    expandByObject(e, t = !1) {
      e.updateWorldMatrix(!1, !1);
      const n = e.geometry;
      if (n !== void 0) {
        const r = n.getAttribute('position');
        if (t === !0 && r !== void 0 && e.isInstancedMesh !== !0)
          for (let a = 0, o = r.count; a < o; a++)
            e.isMesh === !0 ? e.getVertexPosition(a, Wt) : Wt.fromBufferAttribute(r, a),
              Wt.applyMatrix4(e.matrixWorld),
              this.expandByPoint(Wt);
        else
          e.boundingBox !== void 0
            ? (e.boundingBox === null && e.computeBoundingBox(), Rs.copy(e.boundingBox))
            : (n.boundingBox === null && n.computeBoundingBox(), Rs.copy(n.boundingBox)),
            Rs.applyMatrix4(e.matrixWorld),
            this.union(Rs);
      }
      const s = e.children;
      for (let r = 0, a = s.length; r < a; r++) this.expandByObject(s[r], t);
      return this;
    }
    containsPoint(e) {
      return (
        e.x >= this.min.x &&
        e.x <= this.max.x &&
        e.y >= this.min.y &&
        e.y <= this.max.y &&
        e.z >= this.min.z &&
        e.z <= this.max.z
      );
    }
    containsBox(e) {
      return (
        this.min.x <= e.min.x &&
        e.max.x <= this.max.x &&
        this.min.y <= e.min.y &&
        e.max.y <= this.max.y &&
        this.min.z <= e.min.z &&
        e.max.z <= this.max.z
      );
    }
    getParameter(e, t) {
      return t.set(
        (e.x - this.min.x) / (this.max.x - this.min.x),
        (e.y - this.min.y) / (this.max.y - this.min.y),
        (e.z - this.min.z) / (this.max.z - this.min.z),
      );
    }
    intersectsBox(e) {
      return (
        e.max.x >= this.min.x &&
        e.min.x <= this.max.x &&
        e.max.y >= this.min.y &&
        e.min.y <= this.max.y &&
        e.max.z >= this.min.z &&
        e.min.z <= this.max.z
      );
    }
    intersectsSphere(e) {
      return this.clampPoint(e.center, Wt), Wt.distanceToSquared(e.center) <= e.radius * e.radius;
    }
    intersectsPlane(e) {
      let t, n;
      return (
        e.normal.x > 0
          ? ((t = e.normal.x * this.min.x), (n = e.normal.x * this.max.x))
          : ((t = e.normal.x * this.max.x), (n = e.normal.x * this.min.x)),
        e.normal.y > 0
          ? ((t += e.normal.y * this.min.y), (n += e.normal.y * this.max.y))
          : ((t += e.normal.y * this.max.y), (n += e.normal.y * this.min.y)),
        e.normal.z > 0
          ? ((t += e.normal.z * this.min.z), (n += e.normal.z * this.max.z))
          : ((t += e.normal.z * this.max.z), (n += e.normal.z * this.min.z)),
        t <= -e.constant && n >= -e.constant
      );
    }
    intersectsTriangle(e) {
      if (this.isEmpty()) return !1;
      this.getCenter(Hi),
        Is.subVectors(this.max, Hi),
        _i.subVectors(e.a, Hi),
        xi.subVectors(e.b, Hi),
        vi.subVectors(e.c, Hi),
        wn.subVectors(xi, _i),
        Cn.subVectors(vi, xi),
        Yn.subVectors(_i, vi);
      let t = [
        0,
        -wn.z,
        wn.y,
        0,
        -Cn.z,
        Cn.y,
        0,
        -Yn.z,
        Yn.y,
        wn.z,
        0,
        -wn.x,
        Cn.z,
        0,
        -Cn.x,
        Yn.z,
        0,
        -Yn.x,
        -wn.y,
        wn.x,
        0,
        -Cn.y,
        Cn.x,
        0,
        -Yn.y,
        Yn.x,
        0,
      ];
      return !oo(t, _i, xi, vi, Is) || ((t = [1, 0, 0, 0, 1, 0, 0, 0, 1]), !oo(t, _i, xi, vi, Is))
        ? !1
        : (Ps.crossVectors(wn, Cn), (t = [Ps.x, Ps.y, Ps.z]), oo(t, _i, xi, vi, Is));
    }
    clampPoint(e, t) {
      return t.copy(e).clamp(this.min, this.max);
    }
    distanceToPoint(e) {
      return this.clampPoint(e, Wt).distanceTo(e);
    }
    getBoundingSphere(e) {
      return (
        this.isEmpty() ? e.makeEmpty() : (this.getCenter(e.center), (e.radius = this.getSize(Wt).length() * 0.5)), e
      );
    }
    intersect(e) {
      return this.min.max(e.min), this.max.min(e.max), this.isEmpty() && this.makeEmpty(), this;
    }
    union(e) {
      return this.min.min(e.min), this.max.max(e.max), this;
    }
    applyMatrix4(e) {
      return this.isEmpty()
        ? this
        : (gn[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(e),
          gn[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(e),
          gn[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(e),
          gn[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(e),
          gn[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(e),
          gn[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(e),
          gn[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(e),
          gn[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(e),
          this.setFromPoints(gn),
          this);
    }
    translate(e) {
      return this.min.add(e), this.max.add(e), this;
    }
    equals(e) {
      return e.min.equals(this.min) && e.max.equals(this.max);
    }
    toJSON() {
      return { min: this.min.toArray(), max: this.max.toArray() };
    }
    fromJSON(e) {
      return this.min.fromArray(e.min), this.max.fromArray(e.max), this;
    }
  },
  gn = [new L(), new L(), new L(), new L(), new L(), new L(), new L(), new L()],
  Wt = new L(),
  Rs = new Un(),
  _i = new L(),
  xi = new L(),
  vi = new L(),
  wn = new L(),
  Cn = new L(),
  Yn = new L(),
  Hi = new L(),
  Is = new L(),
  Ps = new L(),
  Zn = new L();
function oo(i, e, t, n, s) {
  for (let r = 0, a = i.length - 3; r <= a; r += 3) {
    Zn.fromArray(i, r);
    const o = s.x * Math.abs(Zn.x) + s.y * Math.abs(Zn.y) + s.z * Math.abs(Zn.z),
      c = e.dot(Zn),
      l = t.dot(Zn),
      d = n.dot(Zn);
    if (Math.max(-Math.max(c, l, d), Math.min(c, l, d)) > o) return !1;
  }
  return !0;
}
var dt = new L(),
  Ls = new Re(),
  au = 0,
  Rt = class {
    constructor(e, t, n = !1) {
      if (Array.isArray(e)) throw new TypeError('THREE.BufferAttribute: array should be a Typed Array.');
      (this.isBufferAttribute = !0),
        Object.defineProperty(this, 'id', { value: au++ }),
        (this.name = ''),
        (this.array = e),
        (this.itemSize = t),
        (this.count = e !== void 0 ? e.length / t : 0),
        (this.normalized = n),
        (this.usage = dr),
        (this.updateRanges = []),
        (this.gpuType = Jt),
        (this.version = 0);
    }
    onUploadCallback() {}
    set needsUpdate(e) {
      e === !0 && this.version++;
    }
    setUsage(e) {
      return (this.usage = e), this;
    }
    addUpdateRange(e, t) {
      this.updateRanges.push({ start: e, count: t });
    }
    clearUpdateRanges() {
      this.updateRanges.length = 0;
    }
    copy(e) {
      return (
        (this.name = e.name),
        (this.array = new e.array.constructor(e.array)),
        (this.itemSize = e.itemSize),
        (this.count = e.count),
        (this.normalized = e.normalized),
        (this.usage = e.usage),
        (this.gpuType = e.gpuType),
        this
      );
    }
    copyAt(e, t, n) {
      (e *= this.itemSize), (n *= t.itemSize);
      for (let s = 0, r = this.itemSize; s < r; s++) this.array[e + s] = t.array[n + s];
      return this;
    }
    copyArray(e) {
      return this.array.set(e), this;
    }
    applyMatrix3(e) {
      if (this.itemSize === 2)
        for (let t = 0, n = this.count; t < n; t++)
          Ls.fromBufferAttribute(this, t), Ls.applyMatrix3(e), this.setXY(t, Ls.x, Ls.y);
      else if (this.itemSize === 3)
        for (let t = 0, n = this.count; t < n; t++)
          dt.fromBufferAttribute(this, t), dt.applyMatrix3(e), this.setXYZ(t, dt.x, dt.y, dt.z);
      return this;
    }
    applyMatrix4(e) {
      for (let t = 0, n = this.count; t < n; t++)
        dt.fromBufferAttribute(this, t), dt.applyMatrix4(e), this.setXYZ(t, dt.x, dt.y, dt.z);
      return this;
    }
    applyNormalMatrix(e) {
      for (let t = 0, n = this.count; t < n; t++)
        dt.fromBufferAttribute(this, t), dt.applyNormalMatrix(e), this.setXYZ(t, dt.x, dt.y, dt.z);
      return this;
    }
    transformDirection(e) {
      for (let t = 0, n = this.count; t < n; t++)
        dt.fromBufferAttribute(this, t), dt.transformDirection(e), this.setXYZ(t, dt.x, dt.y, dt.z);
      return this;
    }
    set(e, t = 0) {
      return this.array.set(e, t), this;
    }
    getComponent(e, t) {
      let n = this.array[e * this.itemSize + t];
      return this.normalized && (n = en(n, this.array)), n;
    }
    setComponent(e, t, n) {
      return this.normalized && (n = Qe(n, this.array)), (this.array[e * this.itemSize + t] = n), this;
    }
    getX(e) {
      let t = this.array[e * this.itemSize];
      return this.normalized && (t = en(t, this.array)), t;
    }
    setX(e, t) {
      return this.normalized && (t = Qe(t, this.array)), (this.array[e * this.itemSize] = t), this;
    }
    getY(e) {
      let t = this.array[e * this.itemSize + 1];
      return this.normalized && (t = en(t, this.array)), t;
    }
    setY(e, t) {
      return this.normalized && (t = Qe(t, this.array)), (this.array[e * this.itemSize + 1] = t), this;
    }
    getZ(e) {
      let t = this.array[e * this.itemSize + 2];
      return this.normalized && (t = en(t, this.array)), t;
    }
    setZ(e, t) {
      return this.normalized && (t = Qe(t, this.array)), (this.array[e * this.itemSize + 2] = t), this;
    }
    getW(e) {
      let t = this.array[e * this.itemSize + 3];
      return this.normalized && (t = en(t, this.array)), t;
    }
    setW(e, t) {
      return this.normalized && (t = Qe(t, this.array)), (this.array[e * this.itemSize + 3] = t), this;
    }
    setXY(e, t, n) {
      return (
        (e *= this.itemSize),
        this.normalized && ((t = Qe(t, this.array)), (n = Qe(n, this.array))),
        (this.array[e + 0] = t),
        (this.array[e + 1] = n),
        this
      );
    }
    setXYZ(e, t, n, s) {
      return (
        (e *= this.itemSize),
        this.normalized && ((t = Qe(t, this.array)), (n = Qe(n, this.array)), (s = Qe(s, this.array))),
        (this.array[e + 0] = t),
        (this.array[e + 1] = n),
        (this.array[e + 2] = s),
        this
      );
    }
    setXYZW(e, t, n, s, r) {
      return (
        (e *= this.itemSize),
        this.normalized &&
          ((t = Qe(t, this.array)), (n = Qe(n, this.array)), (s = Qe(s, this.array)), (r = Qe(r, this.array))),
        (this.array[e + 0] = t),
        (this.array[e + 1] = n),
        (this.array[e + 2] = s),
        (this.array[e + 3] = r),
        this
      );
    }
    onUpload(e) {
      return (this.onUploadCallback = e), this;
    }
    clone() {
      return new this.constructor(this.array, this.itemSize).copy(this);
    }
    toJSON() {
      const e = {
        itemSize: this.itemSize,
        type: this.array.constructor.name,
        array: Array.from(this.array),
        normalized: this.normalized,
      };
      return this.name !== '' && (e.name = this.name), this.usage !== dr && (e.usage = this.usage), e;
    }
  };
var ns = class extends Rt {
  constructor(e, t, n) {
    super(new Uint16Array(e), t, n);
  }
};
var is = class extends Rt {
  constructor(e, t, n) {
    super(new Uint32Array(e), t, n);
  }
};
var Xe = class extends Rt {
    constructor(e, t, n) {
      super(new Float32Array(e), t, n);
    }
  },
  ou = new Un(),
  Wi = new L(),
  lo = new L(),
  Nn = class {
    constructor(e = new L(), t = -1) {
      (this.isSphere = !0), (this.center = e), (this.radius = t);
    }
    set(e, t) {
      return this.center.copy(e), (this.radius = t), this;
    }
    setFromPoints(e, t) {
      const n = this.center;
      t !== void 0 ? n.copy(t) : ou.setFromPoints(e).getCenter(n);
      let s = 0;
      for (let r = 0, a = e.length; r < a; r++) s = Math.max(s, n.distanceToSquared(e[r]));
      return (this.radius = Math.sqrt(s)), this;
    }
    copy(e) {
      return this.center.copy(e.center), (this.radius = e.radius), this;
    }
    isEmpty() {
      return this.radius < 0;
    }
    makeEmpty() {
      return this.center.set(0, 0, 0), (this.radius = -1), this;
    }
    containsPoint(e) {
      return e.distanceToSquared(this.center) <= this.radius * this.radius;
    }
    distanceToPoint(e) {
      return e.distanceTo(this.center) - this.radius;
    }
    intersectsSphere(e) {
      const t = this.radius + e.radius;
      return e.center.distanceToSquared(this.center) <= t * t;
    }
    intersectsBox(e) {
      return e.intersectsSphere(this);
    }
    intersectsPlane(e) {
      return Math.abs(e.distanceToPoint(this.center)) <= this.radius;
    }
    clampPoint(e, t) {
      const n = this.center.distanceToSquared(e);
      return (
        t.copy(e),
        n > this.radius * this.radius &&
          (t.sub(this.center).normalize(), t.multiplyScalar(this.radius).add(this.center)),
        t
      );
    }
    getBoundingBox(e) {
      return this.isEmpty() ? (e.makeEmpty(), e) : (e.set(this.center, this.center), e.expandByScalar(this.radius), e);
    }
    applyMatrix4(e) {
      return this.center.applyMatrix4(e), (this.radius = this.radius * e.getMaxScaleOnAxis()), this;
    }
    translate(e) {
      return this.center.add(e), this;
    }
    expandByPoint(e) {
      if (this.isEmpty()) return this.center.copy(e), (this.radius = 0), this;
      Wi.subVectors(e, this.center);
      const t = Wi.lengthSq();
      if (t > this.radius * this.radius) {
        const n = Math.sqrt(t),
          s = (n - this.radius) * 0.5;
        this.center.addScaledVector(Wi, s / n), (this.radius += s);
      }
      return this;
    }
    union(e) {
      return e.isEmpty()
        ? this
        : this.isEmpty()
          ? (this.copy(e), this)
          : (this.center.equals(e.center) === !0
              ? (this.radius = Math.max(this.radius, e.radius))
              : (lo.subVectors(e.center, this.center).setLength(e.radius),
                this.expandByPoint(Wi.copy(e.center).add(lo)),
                this.expandByPoint(Wi.copy(e.center).sub(lo))),
            this);
    }
    equals(e) {
      return e.center.equals(this.center) && e.radius === this.radius;
    }
    clone() {
      return new this.constructor().copy(this);
    }
    toJSON() {
      return { radius: this.radius, center: this.center.toArray() };
    }
    fromJSON(e) {
      return (this.radius = e.radius), this.center.fromArray(e.center), this;
    }
  },
  lu = 0,
  Bt = new tt(),
  co = new $t(),
  yi = new L(),
  Dt = new Un(),
  Xi = new Un(),
  xt = new L(),
  ft = class i extends Mn {
    constructor() {
      super(),
        (this.isBufferGeometry = !0),
        Object.defineProperty(this, 'id', { value: lu++ }),
        (this.uuid = Pn()),
        (this.name = ''),
        (this.type = 'BufferGeometry'),
        (this.index = null),
        (this.indirect = null),
        (this.indirectOffset = 0),
        (this.attributes = {}),
        (this.morphAttributes = {}),
        (this.morphTargetsRelative = !1),
        (this.groups = []),
        (this.boundingBox = null),
        (this.boundingSphere = null),
        (this.drawRange = { start: 0, count: 1 / 0 }),
        (this.userData = {});
    }
    getIndex() {
      return this.index;
    }
    setIndex(e) {
      return Array.isArray(e) ? (this.index = new (Yh(e) ? is : ns)(e, 1)) : (this.index = e), this;
    }
    setIndirect(e, t = 0) {
      return (this.indirect = e), (this.indirectOffset = t), this;
    }
    getIndirect() {
      return this.indirect;
    }
    getAttribute(e) {
      return this.attributes[e];
    }
    setAttribute(e, t) {
      return (this.attributes[e] = t), this;
    }
    deleteAttribute(e) {
      return delete this.attributes[e], this;
    }
    hasAttribute(e) {
      return this.attributes[e] !== void 0;
    }
    addGroup(e, t, n = 0) {
      this.groups.push({ start: e, count: t, materialIndex: n });
    }
    clearGroups() {
      this.groups = [];
    }
    setDrawRange(e, t) {
      (this.drawRange.start = e), (this.drawRange.count = t);
    }
    applyMatrix4(e) {
      const t = this.attributes.position;
      t !== void 0 && (t.applyMatrix4(e), (t.needsUpdate = !0));
      const n = this.attributes.normal;
      if (n !== void 0) {
        const r = new De().getNormalMatrix(e);
        n.applyNormalMatrix(r), (n.needsUpdate = !0);
      }
      const s = this.attributes.tangent;
      return (
        s !== void 0 && (s.transformDirection(e), (s.needsUpdate = !0)),
        this.boundingBox !== null && this.computeBoundingBox(),
        this.boundingSphere !== null && this.computeBoundingSphere(),
        this
      );
    }
    applyQuaternion(e) {
      return Bt.makeRotationFromQuaternion(e), this.applyMatrix4(Bt), this;
    }
    rotateX(e) {
      return Bt.makeRotationX(e), this.applyMatrix4(Bt), this;
    }
    rotateY(e) {
      return Bt.makeRotationY(e), this.applyMatrix4(Bt), this;
    }
    rotateZ(e) {
      return Bt.makeRotationZ(e), this.applyMatrix4(Bt), this;
    }
    translate(e, t, n) {
      return Bt.makeTranslation(e, t, n), this.applyMatrix4(Bt), this;
    }
    scale(e, t, n) {
      return Bt.makeScale(e, t, n), this.applyMatrix4(Bt), this;
    }
    lookAt(e) {
      return co.lookAt(e), co.updateMatrix(), this.applyMatrix4(co.matrix), this;
    }
    center() {
      return this.computeBoundingBox(), this.boundingBox.getCenter(yi).negate(), this.translate(yi.x, yi.y, yi.z), this;
    }
    setFromPoints(e) {
      const t = this.getAttribute('position');
      if (t === void 0) {
        const n = [];
        for (let s = 0, r = e.length; s < r; s++) {
          const a = e[s];
          n.push(a.x, a.y, a.z || 0);
        }
        this.setAttribute('position', new Xe(n, 3));
      } else {
        const n = Math.min(e.length, t.count);
        for (let s = 0; s < n; s++) {
          const r = e[s];
          t.setXYZ(s, r.x, r.y, r.z || 0);
        }
        e.length > t.count &&
          Ee('BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.'),
          (t.needsUpdate = !0);
      }
      return this;
    }
    computeBoundingBox() {
      this.boundingBox === null && (this.boundingBox = new Un());
      const e = this.attributes.position,
        t = this.morphAttributes.position;
      if (e?.isGLBufferAttribute) {
        Ae('BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.', this),
          this.boundingBox.set(new L(-1 / 0, -1 / 0, -1 / 0), new L(1 / 0, 1 / 0, 1 / 0));
        return;
      }
      if (e !== void 0) {
        if ((this.boundingBox.setFromBufferAttribute(e), t))
          for (let n = 0, s = t.length; n < s; n++) {
            const r = t[n];
            Dt.setFromBufferAttribute(r),
              this.morphTargetsRelative
                ? (xt.addVectors(this.boundingBox.min, Dt.min),
                  this.boundingBox.expandByPoint(xt),
                  xt.addVectors(this.boundingBox.max, Dt.max),
                  this.boundingBox.expandByPoint(xt))
                : (this.boundingBox.expandByPoint(Dt.min), this.boundingBox.expandByPoint(Dt.max));
          }
      } else this.boundingBox.makeEmpty();
      (Number.isNaN(this.boundingBox.min.x) ||
        Number.isNaN(this.boundingBox.min.y) ||
        Number.isNaN(this.boundingBox.min.z)) &&
        Ae(
          'BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',
          this,
        );
    }
    computeBoundingSphere() {
      this.boundingSphere === null && (this.boundingSphere = new Nn());
      const e = this.attributes.position,
        t = this.morphAttributes.position;
      if (e?.isGLBufferAttribute) {
        Ae('BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.', this),
          this.boundingSphere.set(new L(), 1 / 0);
        return;
      }
      if (e) {
        const n = this.boundingSphere.center;
        if ((Dt.setFromBufferAttribute(e), t))
          for (let r = 0, a = t.length; r < a; r++) {
            const o = t[r];
            Xi.setFromBufferAttribute(o),
              this.morphTargetsRelative
                ? (xt.addVectors(Dt.min, Xi.min),
                  Dt.expandByPoint(xt),
                  xt.addVectors(Dt.max, Xi.max),
                  Dt.expandByPoint(xt))
                : (Dt.expandByPoint(Xi.min), Dt.expandByPoint(Xi.max));
          }
        Dt.getCenter(n);
        let s = 0;
        for (let r = 0, a = e.count; r < a; r++)
          xt.fromBufferAttribute(e, r), (s = Math.max(s, n.distanceToSquared(xt)));
        if (t)
          for (let r = 0, a = t.length; r < a; r++) {
            const o = t[r],
              c = this.morphTargetsRelative;
            for (let l = 0, d = o.count; l < d; l++)
              xt.fromBufferAttribute(o, l),
                c && (yi.fromBufferAttribute(e, l), xt.add(yi)),
                (s = Math.max(s, n.distanceToSquared(xt)));
          }
        (this.boundingSphere.radius = Math.sqrt(s)),
          Number.isNaN(this.boundingSphere.radius) &&
            Ae(
              'BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',
              this,
            );
      }
    }
    computeTangents() {
      const e = this.index,
        t = this.attributes;
      if (e === null || t.position === void 0 || t.normal === void 0 || t.uv === void 0) {
        Ae('BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)');
        return;
      }
      const n = t.position,
        s = t.normal,
        r = t.uv;
      this.hasAttribute('tangent') === !1 && this.setAttribute('tangent', new Rt(new Float32Array(4 * n.count), 4));
      const a = this.getAttribute('tangent'),
        o = [],
        c = [];
      for (let x = 0; x < n.count; x++) (o[x] = new L()), (c[x] = new L());
      const l = new L(),
        d = new L(),
        m = new L(),
        h = new Re(),
        f = new Re(),
        g = new Re(),
        y = new L(),
        p = new L();
      function u(x, b, k) {
        l.fromBufferAttribute(n, x),
          d.fromBufferAttribute(n, b),
          m.fromBufferAttribute(n, k),
          h.fromBufferAttribute(r, x),
          f.fromBufferAttribute(r, b),
          g.fromBufferAttribute(r, k),
          d.sub(l),
          m.sub(l),
          f.sub(h),
          g.sub(h);
        const C = 1 / (f.x * g.y - g.x * f.y);
        Number.isFinite(C) &&
          (y.copy(d).multiplyScalar(g.y).addScaledVector(m, -f.y).multiplyScalar(C),
          p.copy(m).multiplyScalar(f.x).addScaledVector(d, -g.x).multiplyScalar(C),
          o[x].add(y),
          o[b].add(y),
          o[k].add(y),
          c[x].add(p),
          c[b].add(p),
          c[k].add(p));
      }
      let v = this.groups;
      v.length === 0 && (v = [{ start: 0, count: e.count }]);
      for (let x = 0, b = v.length; x < b; ++x) {
        const k = v[x],
          C = k.start,
          N = k.count;
        for (let O = C, W = C + N; O < W; O += 3) u(e.getX(O + 0), e.getX(O + 1), e.getX(O + 2));
      }
      const T = new L(),
        S = new L(),
        w = new L(),
        E = new L();
      function R(x) {
        w.fromBufferAttribute(s, x), E.copy(w);
        const b = o[x];
        T.copy(b), T.sub(w.multiplyScalar(w.dot(b))).normalize(), S.crossVectors(E, b);
        const C = S.dot(c[x]) < 0 ? -1 : 1;
        a.setXYZW(x, T.x, T.y, T.z, C);
      }
      for (let x = 0, b = v.length; x < b; ++x) {
        const k = v[x],
          C = k.start,
          N = k.count;
        for (let O = C, W = C + N; O < W; O += 3) R(e.getX(O + 0)), R(e.getX(O + 1)), R(e.getX(O + 2));
      }
    }
    computeVertexNormals() {
      const e = this.index,
        t = this.getAttribute('position');
      if (t !== void 0) {
        let n = this.getAttribute('normal');
        if (n === void 0) (n = new Rt(new Float32Array(t.count * 3), 3)), this.setAttribute('normal', n);
        else for (let h = 0, f = n.count; h < f; h++) n.setXYZ(h, 0, 0, 0);
        const s = new L(),
          r = new L(),
          a = new L(),
          o = new L(),
          c = new L(),
          l = new L(),
          d = new L(),
          m = new L();
        if (e)
          for (let h = 0, f = e.count; h < f; h += 3) {
            const g = e.getX(h + 0),
              y = e.getX(h + 1),
              p = e.getX(h + 2);
            s.fromBufferAttribute(t, g),
              r.fromBufferAttribute(t, y),
              a.fromBufferAttribute(t, p),
              d.subVectors(a, r),
              m.subVectors(s, r),
              d.cross(m),
              o.fromBufferAttribute(n, g),
              c.fromBufferAttribute(n, y),
              l.fromBufferAttribute(n, p),
              o.add(d),
              c.add(d),
              l.add(d),
              n.setXYZ(g, o.x, o.y, o.z),
              n.setXYZ(y, c.x, c.y, c.z),
              n.setXYZ(p, l.x, l.y, l.z);
          }
        else
          for (let h = 0, f = t.count; h < f; h += 3)
            s.fromBufferAttribute(t, h + 0),
              r.fromBufferAttribute(t, h + 1),
              a.fromBufferAttribute(t, h + 2),
              d.subVectors(a, r),
              m.subVectors(s, r),
              d.cross(m),
              n.setXYZ(h + 0, d.x, d.y, d.z),
              n.setXYZ(h + 1, d.x, d.y, d.z),
              n.setXYZ(h + 2, d.x, d.y, d.z);
        this.normalizeNormals(), (n.needsUpdate = !0);
      }
    }
    normalizeNormals() {
      const e = this.attributes.normal;
      for (let t = 0, n = e.count; t < n; t++)
        xt.fromBufferAttribute(e, t), xt.normalize(), e.setXYZ(t, xt.x, xt.y, xt.z);
    }
    toNonIndexed() {
      function e(o, c) {
        let l = o.array,
          d = o.itemSize,
          m = o.normalized,
          h = new l.constructor(c.length * d),
          f = 0,
          g = 0;
        for (let y = 0, p = c.length; y < p; y++) {
          o.isInterleavedBufferAttribute ? (f = c[y] * o.data.stride + o.offset) : (f = c[y] * d);
          for (let u = 0; u < d; u++) h[g++] = l[f++];
        }
        return new Rt(h, d, m);
      }
      if (this.index === null) return Ee('BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.'), this;
      const t = new i(),
        n = this.index.array,
        s = this.attributes;
      for (const o in s) {
        const c = s[o],
          l = e(c, n);
        t.setAttribute(o, l);
      }
      const r = this.morphAttributes;
      for (const o in r) {
        const c = [],
          l = r[o];
        for (let d = 0, m = l.length; d < m; d++) {
          const h = l[d],
            f = e(h, n);
          c.push(f);
        }
        t.morphAttributes[o] = c;
      }
      t.morphTargetsRelative = this.morphTargetsRelative;
      const a = this.groups;
      for (let o = 0, c = a.length; o < c; o++) {
        const l = a[o];
        t.addGroup(l.start, l.count, l.materialIndex);
      }
      return t;
    }
    toJSON() {
      const e = { metadata: { version: 4.7, type: 'BufferGeometry', generator: 'BufferGeometry.toJSON' } };
      if (
        ((e.uuid = this.uuid),
        (e.type = this.type),
        this.name !== '' && (e.name = this.name),
        Object.keys(this.userData).length > 0 && (e.userData = this.userData),
        this.parameters !== void 0)
      ) {
        const c = this.parameters;
        for (const l in c) c[l] !== void 0 && (e[l] = c[l]);
        return e;
      }
      e.data = { attributes: {} };
      const t = this.index;
      t !== null && (e.data.index = { type: t.array.constructor.name, array: Array.prototype.slice.call(t.array) });
      const n = this.attributes;
      for (const c in n) {
        const l = n[c];
        e.data.attributes[c] = l.toJSON(e.data);
      }
      let s = {},
        r = !1;
      for (const c in this.morphAttributes) {
        const l = this.morphAttributes[c],
          d = [];
        for (let m = 0, h = l.length; m < h; m++) {
          const f = l[m];
          d.push(f.toJSON(e.data));
        }
        d.length > 0 && ((s[c] = d), (r = !0));
      }
      r && ((e.data.morphAttributes = s), (e.data.morphTargetsRelative = this.morphTargetsRelative));
      const a = this.groups;
      a.length > 0 && (e.data.groups = JSON.parse(JSON.stringify(a)));
      const o = this.boundingSphere;
      return o !== null && (e.data.boundingSphere = o.toJSON()), e;
    }
    clone() {
      return new this.constructor().copy(this);
    }
    copy(e) {
      (this.index = null),
        (this.attributes = {}),
        (this.morphAttributes = {}),
        (this.groups = []),
        (this.boundingBox = null),
        (this.boundingSphere = null);
      const t = {};
      this.name = e.name;
      const n = e.index;
      n !== null && this.setIndex(n.clone());
      const s = e.attributes;
      for (const l in s) {
        const d = s[l];
        this.setAttribute(l, d.clone(t));
      }
      const r = e.morphAttributes;
      for (const l in r) {
        const d = [],
          m = r[l];
        for (let h = 0, f = m.length; h < f; h++) d.push(m[h].clone(t));
        this.morphAttributes[l] = d;
      }
      this.morphTargetsRelative = e.morphTargetsRelative;
      const a = e.groups;
      for (let l = 0, d = a.length; l < d; l++) {
        const m = a[l];
        this.addGroup(m.start, m.count, m.materialIndex);
      }
      const o = e.boundingBox;
      o !== null && (this.boundingBox = o.clone());
      const c = e.boundingSphere;
      return (
        c !== null && (this.boundingSphere = c.clone()),
        (this.drawRange.start = e.drawRange.start),
        (this.drawRange.count = e.drawRange.count),
        (this.userData = e.userData),
        this
      );
    }
    dispose() {
      this.dispatchEvent({ type: 'dispose' });
    }
  },
  _r = class {
    constructor(e, t) {
      (this.isInterleavedBuffer = !0),
        (this.array = e),
        (this.stride = t),
        (this.count = e !== void 0 ? e.length / t : 0),
        (this.usage = dr),
        (this.updateRanges = []),
        (this.version = 0),
        (this.uuid = Pn());
    }
    onUploadCallback() {}
    set needsUpdate(e) {
      e === !0 && this.version++;
    }
    setUsage(e) {
      return (this.usage = e), this;
    }
    addUpdateRange(e, t) {
      this.updateRanges.push({ start: e, count: t });
    }
    clearUpdateRanges() {
      this.updateRanges.length = 0;
    }
    copy(e) {
      return (
        (this.array = new e.array.constructor(e.array)),
        (this.count = e.count),
        (this.stride = e.stride),
        (this.usage = e.usage),
        this
      );
    }
    copyAt(e, t, n) {
      (e *= this.stride), (n *= t.stride);
      for (let s = 0, r = this.stride; s < r; s++) this.array[e + s] = t.array[n + s];
      return this;
    }
    set(e, t = 0) {
      return this.array.set(e, t), this;
    }
    clone(e) {
      e.arrayBuffers === void 0 && (e.arrayBuffers = {}),
        this.array.buffer._uuid === void 0 && (this.array.buffer._uuid = Pn()),
        e.arrayBuffers[this.array.buffer._uuid] === void 0 &&
          (e.arrayBuffers[this.array.buffer._uuid] = this.array.slice(0).buffer);
      const t = new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),
        n = new this.constructor(t, this.stride);
      return n.setUsage(this.usage), n;
    }
    onUpload(e) {
      return (this.onUploadCallback = e), this;
    }
    toJSON(e) {
      return (
        e.arrayBuffers === void 0 && (e.arrayBuffers = {}),
        this.array.buffer._uuid === void 0 && (this.array.buffer._uuid = Pn()),
        e.arrayBuffers[this.array.buffer._uuid] === void 0 &&
          (e.arrayBuffers[this.array.buffer._uuid] = Array.from(new Uint32Array(this.array.buffer))),
        { uuid: this.uuid, buffer: this.array.buffer._uuid, type: this.array.constructor.name, stride: this.stride }
      );
    }
  },
  Et = new L(),
  ss = class i {
    constructor(e, t, n, s = !1) {
      (this.isInterleavedBufferAttribute = !0),
        (this.name = ''),
        (this.data = e),
        (this.itemSize = t),
        (this.offset = n),
        (this.normalized = s);
    }
    get count() {
      return this.data.count;
    }
    get array() {
      return this.data.array;
    }
    set needsUpdate(e) {
      this.data.needsUpdate = e;
    }
    applyMatrix4(e) {
      for (let t = 0, n = this.data.count; t < n; t++)
        Et.fromBufferAttribute(this, t), Et.applyMatrix4(e), this.setXYZ(t, Et.x, Et.y, Et.z);
      return this;
    }
    applyNormalMatrix(e) {
      for (let t = 0, n = this.count; t < n; t++)
        Et.fromBufferAttribute(this, t), Et.applyNormalMatrix(e), this.setXYZ(t, Et.x, Et.y, Et.z);
      return this;
    }
    transformDirection(e) {
      for (let t = 0, n = this.count; t < n; t++)
        Et.fromBufferAttribute(this, t), Et.transformDirection(e), this.setXYZ(t, Et.x, Et.y, Et.z);
      return this;
    }
    getComponent(e, t) {
      let n = this.array[e * this.data.stride + this.offset + t];
      return this.normalized && (n = en(n, this.array)), n;
    }
    setComponent(e, t, n) {
      return (
        this.normalized && (n = Qe(n, this.array)), (this.data.array[e * this.data.stride + this.offset + t] = n), this
      );
    }
    setX(e, t) {
      return (
        this.normalized && (t = Qe(t, this.array)), (this.data.array[e * this.data.stride + this.offset] = t), this
      );
    }
    setY(e, t) {
      return (
        this.normalized && (t = Qe(t, this.array)), (this.data.array[e * this.data.stride + this.offset + 1] = t), this
      );
    }
    setZ(e, t) {
      return (
        this.normalized && (t = Qe(t, this.array)), (this.data.array[e * this.data.stride + this.offset + 2] = t), this
      );
    }
    setW(e, t) {
      return (
        this.normalized && (t = Qe(t, this.array)), (this.data.array[e * this.data.stride + this.offset + 3] = t), this
      );
    }
    getX(e) {
      let t = this.data.array[e * this.data.stride + this.offset];
      return this.normalized && (t = en(t, this.array)), t;
    }
    getY(e) {
      let t = this.data.array[e * this.data.stride + this.offset + 1];
      return this.normalized && (t = en(t, this.array)), t;
    }
    getZ(e) {
      let t = this.data.array[e * this.data.stride + this.offset + 2];
      return this.normalized && (t = en(t, this.array)), t;
    }
    getW(e) {
      let t = this.data.array[e * this.data.stride + this.offset + 3];
      return this.normalized && (t = en(t, this.array)), t;
    }
    setXY(e, t, n) {
      return (
        (e = e * this.data.stride + this.offset),
        this.normalized && ((t = Qe(t, this.array)), (n = Qe(n, this.array))),
        (this.data.array[e + 0] = t),
        (this.data.array[e + 1] = n),
        this
      );
    }
    setXYZ(e, t, n, s) {
      return (
        (e = e * this.data.stride + this.offset),
        this.normalized && ((t = Qe(t, this.array)), (n = Qe(n, this.array)), (s = Qe(s, this.array))),
        (this.data.array[e + 0] = t),
        (this.data.array[e + 1] = n),
        (this.data.array[e + 2] = s),
        this
      );
    }
    setXYZW(e, t, n, s, r) {
      return (
        (e = e * this.data.stride + this.offset),
        this.normalized &&
          ((t = Qe(t, this.array)), (n = Qe(n, this.array)), (s = Qe(s, this.array)), (r = Qe(r, this.array))),
        (this.data.array[e + 0] = t),
        (this.data.array[e + 1] = n),
        (this.data.array[e + 2] = s),
        (this.data.array[e + 3] = r),
        this
      );
    }
    clone(e) {
      if (e === void 0) {
        ji(
          'InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.',
        );
        const t = [];
        for (let n = 0; n < this.count; n++) {
          const s = n * this.data.stride + this.offset;
          for (let r = 0; r < this.itemSize; r++) t.push(this.data.array[s + r]);
        }
        return new Rt(new this.array.constructor(t), this.itemSize, this.normalized);
      } else
        return (
          e.interleavedBuffers === void 0 && (e.interleavedBuffers = {}),
          e.interleavedBuffers[this.data.uuid] === void 0 &&
            (e.interleavedBuffers[this.data.uuid] = this.data.clone(e)),
          new i(e.interleavedBuffers[this.data.uuid], this.itemSize, this.offset, this.normalized)
        );
    }
    toJSON(e) {
      if (e === void 0) {
        ji(
          'InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.',
        );
        const t = [];
        for (let n = 0; n < this.count; n++) {
          const s = n * this.data.stride + this.offset;
          for (let r = 0; r < this.itemSize; r++) t.push(this.data.array[s + r]);
        }
        return { itemSize: this.itemSize, type: this.array.constructor.name, array: t, normalized: this.normalized };
      } else
        return (
          e.interleavedBuffers === void 0 && (e.interleavedBuffers = {}),
          e.interleavedBuffers[this.data.uuid] === void 0 &&
            (e.interleavedBuffers[this.data.uuid] = this.data.toJSON(e)),
          {
            isInterleavedBufferAttribute: !0,
            itemSize: this.itemSize,
            data: this.data.uuid,
            offset: this.offset,
            normalized: this.normalized,
          }
        );
    }
  },
  cu = 0,
  qt = class extends Mn {
    constructor() {
      super(),
        (this.isMaterial = !0),
        Object.defineProperty(this, 'id', { value: cu++ }),
        (this.uuid = Pn()),
        (this.name = ''),
        (this.type = 'Material'),
        (this.blending = jn),
        (this.side = yn),
        (this.vertexColors = !1),
        (this.opacity = 1),
        (this.transparent = !1),
        (this.alphaHash = !1),
        (this.blendSrc = er),
        (this.blendDst = tr),
        (this.blendEquation = Ln),
        (this.blendSrcAlpha = null),
        (this.blendDstAlpha = null),
        (this.blendEquationAlpha = null),
        (this.blendColor = new Ve(0, 0, 0)),
        (this.blendAlpha = 0),
        (this.depthFunc = ei),
        (this.depthTest = !0),
        (this.depthWrite = !0),
        (this.stencilWriteMask = 255),
        (this.stencilFunc = Ao),
        (this.stencilRef = 0),
        (this.stencilFuncMask = 255),
        (this.stencilFail = Kn),
        (this.stencilZFail = Kn),
        (this.stencilZPass = Kn),
        (this.stencilWrite = !1),
        (this.clippingPlanes = null),
        (this.clipIntersection = !1),
        (this.clipShadows = !1),
        (this.shadowSide = null),
        (this.colorWrite = !0),
        (this.precision = null),
        (this.polygonOffset = !1),
        (this.polygonOffsetFactor = 0),
        (this.polygonOffsetUnits = 0),
        (this.dithering = !1),
        (this.alphaToCoverage = !1),
        (this.premultipliedAlpha = !1),
        (this.forceSinglePass = !1),
        (this.allowOverride = !0),
        (this.visible = !0),
        (this.toneMapped = !0),
        (this.userData = {}),
        (this.version = 0),
        (this._alphaTest = 0);
    }
    get alphaTest() {
      return this._alphaTest;
    }
    set alphaTest(e) {
      this._alphaTest > 0 !== e > 0 && this.version++, (this._alphaTest = e);
    }
    onBeforeRender() {}
    onBeforeCompile() {}
    customProgramCacheKey() {
      return this.onBeforeCompile.toString();
    }
    setValues(e) {
      if (e !== void 0)
        for (const t in e) {
          const n = e[t];
          if (n === void 0) {
            Ee(`Material: parameter '${t}' has value of undefined.`);
            continue;
          }
          const s = this[t];
          if (s === void 0) {
            Ee(`Material: '${t}' is not a property of THREE.${this.type}.`);
            continue;
          }
          s?.isColor ? s.set(n) : s?.isVector3 && n?.isVector3 ? s.copy(n) : (this[t] = n);
        }
    }
    toJSON(e) {
      const t = e === void 0 || typeof e === 'string';
      t && (e = { textures: {}, images: {} });
      const n = { metadata: { version: 4.7, type: 'Material', generator: 'Material.toJSON' } };
      (n.uuid = this.uuid),
        (n.type = this.type),
        this.name !== '' && (n.name = this.name),
        this.color?.isColor && (n.color = this.color.getHex()),
        this.roughness !== void 0 && (n.roughness = this.roughness),
        this.metalness !== void 0 && (n.metalness = this.metalness),
        this.sheen !== void 0 && (n.sheen = this.sheen),
        this.sheenColor?.isColor && (n.sheenColor = this.sheenColor.getHex()),
        this.sheenRoughness !== void 0 && (n.sheenRoughness = this.sheenRoughness),
        this.emissive?.isColor && (n.emissive = this.emissive.getHex()),
        this.emissiveIntensity !== void 0 &&
          this.emissiveIntensity !== 1 &&
          (n.emissiveIntensity = this.emissiveIntensity),
        this.specular?.isColor && (n.specular = this.specular.getHex()),
        this.specularIntensity !== void 0 && (n.specularIntensity = this.specularIntensity),
        this.specularColor?.isColor && (n.specularColor = this.specularColor.getHex()),
        this.shininess !== void 0 && (n.shininess = this.shininess),
        this.clearcoat !== void 0 && (n.clearcoat = this.clearcoat),
        this.clearcoatRoughness !== void 0 && (n.clearcoatRoughness = this.clearcoatRoughness),
        this.clearcoatMap?.isTexture && (n.clearcoatMap = this.clearcoatMap.toJSON(e).uuid),
        this.clearcoatRoughnessMap?.isTexture && (n.clearcoatRoughnessMap = this.clearcoatRoughnessMap.toJSON(e).uuid),
        this.clearcoatNormalMap?.isTexture &&
          ((n.clearcoatNormalMap = this.clearcoatNormalMap.toJSON(e).uuid),
          (n.clearcoatNormalScale = this.clearcoatNormalScale.toArray())),
        this.sheenColorMap?.isTexture && (n.sheenColorMap = this.sheenColorMap.toJSON(e).uuid),
        this.sheenRoughnessMap?.isTexture && (n.sheenRoughnessMap = this.sheenRoughnessMap.toJSON(e).uuid),
        this.dispersion !== void 0 && (n.dispersion = this.dispersion),
        this.iridescence !== void 0 && (n.iridescence = this.iridescence),
        this.iridescenceIOR !== void 0 && (n.iridescenceIOR = this.iridescenceIOR),
        this.iridescenceThicknessRange !== void 0 && (n.iridescenceThicknessRange = this.iridescenceThicknessRange),
        this.iridescenceMap?.isTexture && (n.iridescenceMap = this.iridescenceMap.toJSON(e).uuid),
        this.iridescenceThicknessMap?.isTexture &&
          (n.iridescenceThicknessMap = this.iridescenceThicknessMap.toJSON(e).uuid),
        this.anisotropy !== void 0 && (n.anisotropy = this.anisotropy),
        this.anisotropyRotation !== void 0 && (n.anisotropyRotation = this.anisotropyRotation),
        this.anisotropyMap?.isTexture && (n.anisotropyMap = this.anisotropyMap.toJSON(e).uuid),
        this.map?.isTexture && (n.map = this.map.toJSON(e).uuid),
        this.matcap?.isTexture && (n.matcap = this.matcap.toJSON(e).uuid),
        this.alphaMap?.isTexture && (n.alphaMap = this.alphaMap.toJSON(e).uuid),
        this.lightMap?.isTexture &&
          ((n.lightMap = this.lightMap.toJSON(e).uuid), (n.lightMapIntensity = this.lightMapIntensity)),
        this.aoMap?.isTexture && ((n.aoMap = this.aoMap.toJSON(e).uuid), (n.aoMapIntensity = this.aoMapIntensity)),
        this.bumpMap?.isTexture && ((n.bumpMap = this.bumpMap.toJSON(e).uuid), (n.bumpScale = this.bumpScale)),
        this.normalMap?.isTexture &&
          ((n.normalMap = this.normalMap.toJSON(e).uuid),
          (n.normalMapType = this.normalMapType),
          (n.normalScale = this.normalScale.toArray())),
        this.displacementMap?.isTexture &&
          ((n.displacementMap = this.displacementMap.toJSON(e).uuid),
          (n.displacementScale = this.displacementScale),
          (n.displacementBias = this.displacementBias)),
        this.roughnessMap?.isTexture && (n.roughnessMap = this.roughnessMap.toJSON(e).uuid),
        this.metalnessMap?.isTexture && (n.metalnessMap = this.metalnessMap.toJSON(e).uuid),
        this.emissiveMap?.isTexture && (n.emissiveMap = this.emissiveMap.toJSON(e).uuid),
        this.specularMap?.isTexture && (n.specularMap = this.specularMap.toJSON(e).uuid),
        this.specularIntensityMap?.isTexture && (n.specularIntensityMap = this.specularIntensityMap.toJSON(e).uuid),
        this.specularColorMap?.isTexture && (n.specularColorMap = this.specularColorMap.toJSON(e).uuid),
        this.envMap?.isTexture &&
          ((n.envMap = this.envMap.toJSON(e).uuid), this.combine !== void 0 && (n.combine = this.combine)),
        this.envMapRotation !== void 0 && (n.envMapRotation = this.envMapRotation.toArray()),
        this.envMapIntensity !== void 0 && (n.envMapIntensity = this.envMapIntensity),
        this.reflectivity !== void 0 && (n.reflectivity = this.reflectivity),
        this.refractionRatio !== void 0 && (n.refractionRatio = this.refractionRatio),
        this.gradientMap?.isTexture && (n.gradientMap = this.gradientMap.toJSON(e).uuid),
        this.transmission !== void 0 && (n.transmission = this.transmission),
        this.transmissionMap?.isTexture && (n.transmissionMap = this.transmissionMap.toJSON(e).uuid),
        this.thickness !== void 0 && (n.thickness = this.thickness),
        this.thicknessMap?.isTexture && (n.thicknessMap = this.thicknessMap.toJSON(e).uuid),
        this.attenuationDistance !== void 0 &&
          this.attenuationDistance !== 1 / 0 &&
          (n.attenuationDistance = this.attenuationDistance),
        this.attenuationColor !== void 0 && (n.attenuationColor = this.attenuationColor.getHex()),
        this.size !== void 0 && (n.size = this.size),
        this.shadowSide !== null && (n.shadowSide = this.shadowSide),
        this.sizeAttenuation !== void 0 && (n.sizeAttenuation = this.sizeAttenuation),
        this.blending !== jn && (n.blending = this.blending),
        this.side !== yn && (n.side = this.side),
        this.vertexColors === !0 && (n.vertexColors = !0),
        this.opacity < 1 && (n.opacity = this.opacity),
        this.transparent === !0 && (n.transparent = !0),
        this.blendSrc !== er && (n.blendSrc = this.blendSrc),
        this.blendDst !== tr && (n.blendDst = this.blendDst),
        this.blendEquation !== Ln && (n.blendEquation = this.blendEquation),
        this.blendSrcAlpha !== null && (n.blendSrcAlpha = this.blendSrcAlpha),
        this.blendDstAlpha !== null && (n.blendDstAlpha = this.blendDstAlpha),
        this.blendEquationAlpha !== null && (n.blendEquationAlpha = this.blendEquationAlpha),
        this.blendColor?.isColor && (n.blendColor = this.blendColor.getHex()),
        this.blendAlpha !== 0 && (n.blendAlpha = this.blendAlpha),
        this.depthFunc !== ei && (n.depthFunc = this.depthFunc),
        this.depthTest === !1 && (n.depthTest = this.depthTest),
        this.depthWrite === !1 && (n.depthWrite = this.depthWrite),
        this.colorWrite === !1 && (n.colorWrite = this.colorWrite),
        this.stencilWriteMask !== 255 && (n.stencilWriteMask = this.stencilWriteMask),
        this.stencilFunc !== Ao && (n.stencilFunc = this.stencilFunc),
        this.stencilRef !== 0 && (n.stencilRef = this.stencilRef),
        this.stencilFuncMask !== 255 && (n.stencilFuncMask = this.stencilFuncMask),
        this.stencilFail !== Kn && (n.stencilFail = this.stencilFail),
        this.stencilZFail !== Kn && (n.stencilZFail = this.stencilZFail),
        this.stencilZPass !== Kn && (n.stencilZPass = this.stencilZPass),
        this.stencilWrite === !0 && (n.stencilWrite = this.stencilWrite),
        this.rotation !== void 0 && this.rotation !== 0 && (n.rotation = this.rotation),
        this.polygonOffset === !0 && (n.polygonOffset = !0),
        this.polygonOffsetFactor !== 0 && (n.polygonOffsetFactor = this.polygonOffsetFactor),
        this.polygonOffsetUnits !== 0 && (n.polygonOffsetUnits = this.polygonOffsetUnits),
        this.linewidth !== void 0 && this.linewidth !== 1 && (n.linewidth = this.linewidth),
        this.dashSize !== void 0 && (n.dashSize = this.dashSize),
        this.gapSize !== void 0 && (n.gapSize = this.gapSize),
        this.scale !== void 0 && (n.scale = this.scale),
        this.dithering === !0 && (n.dithering = !0),
        this.alphaTest > 0 && (n.alphaTest = this.alphaTest),
        this.alphaHash === !0 && (n.alphaHash = !0),
        this.alphaToCoverage === !0 && (n.alphaToCoverage = !0),
        this.premultipliedAlpha === !0 && (n.premultipliedAlpha = !0),
        this.forceSinglePass === !0 && (n.forceSinglePass = !0),
        this.allowOverride === !1 && (n.allowOverride = !1),
        this.wireframe === !0 && (n.wireframe = !0),
        this.wireframeLinewidth > 1 && (n.wireframeLinewidth = this.wireframeLinewidth),
        this.wireframeLinecap !== 'round' && (n.wireframeLinecap = this.wireframeLinecap),
        this.wireframeLinejoin !== 'round' && (n.wireframeLinejoin = this.wireframeLinejoin),
        this.flatShading === !0 && (n.flatShading = !0),
        this.visible === !1 && (n.visible = !1),
        this.toneMapped === !1 && (n.toneMapped = !1),
        this.fog === !1 && (n.fog = !1),
        Object.keys(this.userData).length > 0 && (n.userData = this.userData);
      function s(r) {
        const a = [];
        for (const o in r) {
          const c = r[o];
          delete c.metadata, a.push(c);
        }
        return a;
      }
      if (t) {
        const r = s(e.textures),
          a = s(e.images);
        r.length > 0 && (n.textures = r), a.length > 0 && (n.images = a);
      }
      return n;
    }
    clone() {
      return new this.constructor().copy(this);
    }
    copy(e) {
      (this.name = e.name),
        (this.blending = e.blending),
        (this.side = e.side),
        (this.vertexColors = e.vertexColors),
        (this.opacity = e.opacity),
        (this.transparent = e.transparent),
        (this.blendSrc = e.blendSrc),
        (this.blendDst = e.blendDst),
        (this.blendEquation = e.blendEquation),
        (this.blendSrcAlpha = e.blendSrcAlpha),
        (this.blendDstAlpha = e.blendDstAlpha),
        (this.blendEquationAlpha = e.blendEquationAlpha),
        this.blendColor.copy(e.blendColor),
        (this.blendAlpha = e.blendAlpha),
        (this.depthFunc = e.depthFunc),
        (this.depthTest = e.depthTest),
        (this.depthWrite = e.depthWrite),
        (this.stencilWriteMask = e.stencilWriteMask),
        (this.stencilFunc = e.stencilFunc),
        (this.stencilRef = e.stencilRef),
        (this.stencilFuncMask = e.stencilFuncMask),
        (this.stencilFail = e.stencilFail),
        (this.stencilZFail = e.stencilZFail),
        (this.stencilZPass = e.stencilZPass),
        (this.stencilWrite = e.stencilWrite);
      let t = e.clippingPlanes,
        n = null;
      if (t !== null) {
        const s = t.length;
        n = new Array(s);
        for (let r = 0; r !== s; ++r) n[r] = t[r].clone();
      }
      return (
        (this.clippingPlanes = n),
        (this.clipIntersection = e.clipIntersection),
        (this.clipShadows = e.clipShadows),
        (this.shadowSide = e.shadowSide),
        (this.colorWrite = e.colorWrite),
        (this.precision = e.precision),
        (this.polygonOffset = e.polygonOffset),
        (this.polygonOffsetFactor = e.polygonOffsetFactor),
        (this.polygonOffsetUnits = e.polygonOffsetUnits),
        (this.dithering = e.dithering),
        (this.alphaTest = e.alphaTest),
        (this.alphaHash = e.alphaHash),
        (this.alphaToCoverage = e.alphaToCoverage),
        (this.premultipliedAlpha = e.premultipliedAlpha),
        (this.forceSinglePass = e.forceSinglePass),
        (this.allowOverride = e.allowOverride),
        (this.visible = e.visible),
        (this.toneMapped = e.toneMapped),
        (this.userData = JSON.parse(JSON.stringify(e.userData))),
        this
      );
    }
    dispose() {
      this.dispatchEvent({ type: 'dispose' });
    }
    set needsUpdate(e) {
      e === !0 && this.version++;
    }
  },
  xr = class extends qt {
    constructor(e) {
      super(),
        (this.isSpriteMaterial = !0),
        (this.type = 'SpriteMaterial'),
        (this.color = new Ve(16777215)),
        (this.map = null),
        (this.alphaMap = null),
        (this.rotation = 0),
        (this.sizeAttenuation = !0),
        (this.transparent = !0),
        (this.fog = !0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        this.color.copy(e.color),
        (this.map = e.map),
        (this.alphaMap = e.alphaMap),
        (this.rotation = e.rotation),
        (this.sizeAttenuation = e.sizeAttenuation),
        (this.fog = e.fog),
        this
      );
    }
  },
  Mi,
  qi = new L(),
  Si = new L(),
  bi = new L(),
  Ti = new Re(),
  Yi = new Re(),
  ch = new tt(),
  Ds = new L(),
  Zi = new L(),
  Us = new L(),
  uc = new Re(),
  ho = new Re(),
  dc = new Re(),
  Ro = class extends $t {
    constructor(e = new xr()) {
      if ((super(), (this.isSprite = !0), (this.type = 'Sprite'), Mi === void 0)) {
        Mi = new ft();
        const t = new Float32Array([-0.5, -0.5, 0, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 1, 1, -0.5, 0.5, 0, 0, 1]),
          n = new _r(t, 5);
        Mi.setIndex([0, 1, 2, 0, 2, 3]),
          Mi.setAttribute('position', new ss(n, 3, 0, !1)),
          Mi.setAttribute('uv', new ss(n, 2, 3, !1));
      }
      (this.geometry = Mi), (this.material = e), (this.center = new Re(0.5, 0.5)), (this.count = 1);
    }
    raycast(e, t) {
      e.camera === null && Ae('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),
        Si.setFromMatrixScale(this.matrixWorld),
        ch.copy(e.camera.matrixWorld),
        this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse, this.matrixWorld),
        bi.setFromMatrixPosition(this.modelViewMatrix),
        e.camera.isPerspectiveCamera && this.material.sizeAttenuation === !1 && Si.multiplyScalar(-bi.z);
      let n = this.material.rotation,
        s,
        r;
      n !== 0 && ((r = Math.cos(n)), (s = Math.sin(n)));
      const a = this.center;
      Ns(Ds.set(-0.5, -0.5, 0), bi, a, Si, s, r),
        Ns(Zi.set(0.5, -0.5, 0), bi, a, Si, s, r),
        Ns(Us.set(0.5, 0.5, 0), bi, a, Si, s, r),
        uc.set(0, 0),
        ho.set(1, 0),
        dc.set(1, 1);
      let o = e.ray.intersectTriangle(Ds, Zi, Us, !1, qi);
      if (
        o === null &&
        (Ns(Zi.set(-0.5, 0.5, 0), bi, a, Si, s, r),
        ho.set(0, 1),
        (o = e.ray.intersectTriangle(Ds, Us, Zi, !1, qi)),
        o === null)
      )
        return;
      const c = e.ray.origin.distanceTo(qi);
      c < e.near ||
        c > e.far ||
        t.push({
          distance: c,
          point: qi.clone(),
          uv: xn.getInterpolation(qi, Ds, Zi, Us, uc, ho, dc, new Re()),
          face: null,
          object: this,
        });
    }
    copy(e, t) {
      return super.copy(e, t), e.center !== void 0 && this.center.copy(e.center), (this.material = e.material), this;
    }
  };
function Ns(i, e, t, n, s, r) {
  Ti.subVectors(i, t).addScalar(0.5).multiply(n),
    s !== void 0 ? ((Yi.x = r * Ti.x - s * Ti.y), (Yi.y = s * Ti.x + r * Ti.y)) : Yi.copy(Ti),
    i.copy(e),
    (i.x += Yi.x),
    (i.y += Yi.y),
    i.applyMatrix4(ch);
}
var _n = new L(),
  uo = new L(),
  Fs = new L(),
  Rn = new L(),
  fo = new L(),
  Os = new L(),
  po = new L(),
  ni = class {
    constructor(e = new L(), t = new L(0, 0, -1)) {
      (this.origin = e), (this.direction = t);
    }
    set(e, t) {
      return this.origin.copy(e), this.direction.copy(t), this;
    }
    copy(e) {
      return this.origin.copy(e.origin), this.direction.copy(e.direction), this;
    }
    at(e, t) {
      return t.copy(this.origin).addScaledVector(this.direction, e);
    }
    lookAt(e) {
      return this.direction.copy(e).sub(this.origin).normalize(), this;
    }
    recast(e) {
      return this.origin.copy(this.at(e, _n)), this;
    }
    closestPointToPoint(e, t) {
      t.subVectors(e, this.origin);
      const n = t.dot(this.direction);
      return n < 0 ? t.copy(this.origin) : t.copy(this.origin).addScaledVector(this.direction, n);
    }
    distanceToPoint(e) {
      return Math.sqrt(this.distanceSqToPoint(e));
    }
    distanceSqToPoint(e) {
      const t = _n.subVectors(e, this.origin).dot(this.direction);
      return t < 0
        ? this.origin.distanceToSquared(e)
        : (_n.copy(this.origin).addScaledVector(this.direction, t), _n.distanceToSquared(e));
    }
    distanceSqToSegment(e, t, n, s) {
      uo.copy(e).add(t).multiplyScalar(0.5), Fs.copy(t).sub(e).normalize(), Rn.copy(this.origin).sub(uo);
      let r = e.distanceTo(t) * 0.5,
        a = -this.direction.dot(Fs),
        o = Rn.dot(this.direction),
        c = -Rn.dot(Fs),
        l = Rn.lengthSq(),
        d = Math.abs(1 - a * a),
        m,
        h,
        f,
        g;
      if (d > 0)
        if (((m = a * c - o), (h = a * o - c), (g = r * d), m >= 0))
          if (h >= -g)
            if (h <= g) {
              const y = 1 / d;
              (m *= y), (h *= y), (f = m * (m + a * h + 2 * o) + h * (a * m + h + 2 * c) + l);
            } else (h = r), (m = Math.max(0, -(a * h + o))), (f = -m * m + h * (h + 2 * c) + l);
          else (h = -r), (m = Math.max(0, -(a * h + o))), (f = -m * m + h * (h + 2 * c) + l);
        else
          h <= -g
            ? ((m = Math.max(0, -(-a * r + o))),
              (h = m > 0 ? -r : Math.min(Math.max(-r, -c), r)),
              (f = -m * m + h * (h + 2 * c) + l))
            : h <= g
              ? ((m = 0), (h = Math.min(Math.max(-r, -c), r)), (f = h * (h + 2 * c) + l))
              : ((m = Math.max(0, -(a * r + o))),
                (h = m > 0 ? r : Math.min(Math.max(-r, -c), r)),
                (f = -m * m + h * (h + 2 * c) + l));
      else (h = a > 0 ? -r : r), (m = Math.max(0, -(a * h + o))), (f = -m * m + h * (h + 2 * c) + l);
      return n?.copy(this.origin).addScaledVector(this.direction, m), s?.copy(uo).addScaledVector(Fs, h), f;
    }
    intersectSphere(e, t) {
      _n.subVectors(e.center, this.origin);
      const n = _n.dot(this.direction),
        s = _n.dot(_n) - n * n,
        r = e.radius * e.radius;
      if (s > r) return null;
      const a = Math.sqrt(r - s),
        o = n - a,
        c = n + a;
      return c < 0 ? null : o < 0 ? this.at(c, t) : this.at(o, t);
    }
    intersectsSphere(e) {
      return e.radius < 0 ? !1 : this.distanceSqToPoint(e.center) <= e.radius * e.radius;
    }
    distanceToPlane(e) {
      const t = e.normal.dot(this.direction);
      if (t === 0) return e.distanceToPoint(this.origin) === 0 ? 0 : null;
      const n = -(this.origin.dot(e.normal) + e.constant) / t;
      return n >= 0 ? n : null;
    }
    intersectPlane(e, t) {
      const n = this.distanceToPlane(e);
      return n === null ? null : this.at(n, t);
    }
    intersectsPlane(e) {
      const t = e.distanceToPoint(this.origin);
      return t === 0 || e.normal.dot(this.direction) * t < 0;
    }
    intersectBox(e, t) {
      let n,
        s,
        r,
        a,
        o,
        c,
        l = 1 / this.direction.x,
        d = 1 / this.direction.y,
        m = 1 / this.direction.z,
        h = this.origin;
      return (
        l >= 0
          ? ((n = (e.min.x - h.x) * l), (s = (e.max.x - h.x) * l))
          : ((n = (e.max.x - h.x) * l), (s = (e.min.x - h.x) * l)),
        d >= 0
          ? ((r = (e.min.y - h.y) * d), (a = (e.max.y - h.y) * d))
          : ((r = (e.max.y - h.y) * d), (a = (e.min.y - h.y) * d)),
        n > a ||
        r > s ||
        ((r > n || Number.isNaN(n)) && (n = r),
        (a < s || Number.isNaN(s)) && (s = a),
        m >= 0
          ? ((o = (e.min.z - h.z) * m), (c = (e.max.z - h.z) * m))
          : ((o = (e.max.z - h.z) * m), (c = (e.min.z - h.z) * m)),
        n > c || o > s) ||
        ((o > n || n !== n) && (n = o), (c < s || s !== s) && (s = c), s < 0)
          ? null
          : this.at(n >= 0 ? n : s, t)
      );
    }
    intersectsBox(e) {
      return this.intersectBox(e, _n) !== null;
    }
    intersectTriangle(e, t, n, s, r) {
      fo.subVectors(t, e), Os.subVectors(n, e), po.crossVectors(fo, Os);
      let a = this.direction.dot(po),
        o;
      if (a > 0) {
        if (s) return null;
        o = 1;
      } else if (a < 0) (o = -1), (a = -a);
      else return null;
      Rn.subVectors(this.origin, e);
      const c = o * this.direction.dot(Os.crossVectors(Rn, Os));
      if (c < 0) return null;
      const l = o * this.direction.dot(fo.cross(Rn));
      if (l < 0 || c + l > a) return null;
      const d = -o * Rn.dot(po);
      return d < 0 ? null : this.at(d / a, r);
    }
    applyMatrix4(e) {
      return this.origin.applyMatrix4(e), this.direction.transformDirection(e), this;
    }
    equals(e) {
      return e.origin.equals(this.origin) && e.direction.equals(this.direction);
    }
    clone() {
      return new this.constructor().copy(this);
    }
  },
  rs = class extends qt {
    constructor(e) {
      super(),
        (this.isMeshBasicMaterial = !0),
        (this.type = 'MeshBasicMaterial'),
        (this.color = new Ve(16777215)),
        (this.map = null),
        (this.lightMap = null),
        (this.lightMapIntensity = 1),
        (this.aoMap = null),
        (this.aoMapIntensity = 1),
        (this.specularMap = null),
        (this.alphaMap = null),
        (this.envMap = null),
        (this.envMapRotation = new Dn()),
        (this.combine = el),
        (this.reflectivity = 1),
        (this.refractionRatio = 0.98),
        (this.wireframe = !1),
        (this.wireframeLinewidth = 1),
        (this.wireframeLinecap = 'round'),
        (this.wireframeLinejoin = 'round'),
        (this.fog = !0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        this.color.copy(e.color),
        (this.map = e.map),
        (this.lightMap = e.lightMap),
        (this.lightMapIntensity = e.lightMapIntensity),
        (this.aoMap = e.aoMap),
        (this.aoMapIntensity = e.aoMapIntensity),
        (this.specularMap = e.specularMap),
        (this.alphaMap = e.alphaMap),
        (this.envMap = e.envMap),
        this.envMapRotation.copy(e.envMapRotation),
        (this.combine = e.combine),
        (this.reflectivity = e.reflectivity),
        (this.refractionRatio = e.refractionRatio),
        (this.wireframe = e.wireframe),
        (this.wireframeLinewidth = e.wireframeLinewidth),
        (this.wireframeLinecap = e.wireframeLinecap),
        (this.wireframeLinejoin = e.wireframeLinejoin),
        (this.fog = e.fog),
        this
      );
    }
  },
  fc = new tt(),
  Jn = new ni(),
  Bs = new Nn(),
  pc = new L(),
  zs = new L(),
  Vs = new L(),
  ks = new L(),
  mo = new L(),
  Gs = new L(),
  mc = new L(),
  Hs = new L(),
  zt = class extends $t {
    constructor(e = new ft(), t = new rs()) {
      super(),
        (this.isMesh = !0),
        (this.type = 'Mesh'),
        (this.geometry = e),
        (this.material = t),
        (this.morphTargetDictionary = void 0),
        (this.morphTargetInfluences = void 0),
        (this.count = 1),
        this.updateMorphTargets();
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        e.morphTargetInfluences !== void 0 && (this.morphTargetInfluences = e.morphTargetInfluences.slice()),
        e.morphTargetDictionary !== void 0 && (this.morphTargetDictionary = Object.assign({}, e.morphTargetDictionary)),
        (this.material = Array.isArray(e.material) ? e.material.slice() : e.material),
        (this.geometry = e.geometry),
        this
      );
    }
    updateMorphTargets() {
      const t = this.geometry.morphAttributes,
        n = Object.keys(t);
      if (n.length > 0) {
        const s = t[n[0]];
        if (s !== void 0) {
          (this.morphTargetInfluences = []), (this.morphTargetDictionary = {});
          for (let r = 0, a = s.length; r < a; r++) {
            const o = s[r].name || String(r);
            this.morphTargetInfluences.push(0), (this.morphTargetDictionary[o] = r);
          }
        }
      }
    }
    getVertexPosition(e, t) {
      const n = this.geometry,
        s = n.attributes.position,
        r = n.morphAttributes.position,
        a = n.morphTargetsRelative;
      t.fromBufferAttribute(s, e);
      const o = this.morphTargetInfluences;
      if (r && o) {
        Gs.set(0, 0, 0);
        for (let c = 0, l = r.length; c < l; c++) {
          const d = o[c],
            m = r[c];
          d !== 0 && (mo.fromBufferAttribute(m, e), a ? Gs.addScaledVector(mo, d) : Gs.addScaledVector(mo.sub(t), d));
        }
        t.add(Gs);
      }
      return t;
    }
    raycast(e, t) {
      const n = this.geometry,
        s = this.material,
        r = this.matrixWorld;
      s !== void 0 &&
        (n.boundingSphere === null && n.computeBoundingSphere(),
        Bs.copy(n.boundingSphere),
        Bs.applyMatrix4(r),
        Jn.copy(e.ray).recast(e.near),
        !(
          Bs.containsPoint(Jn.origin) === !1 &&
          (Jn.intersectSphere(Bs, pc) === null || Jn.origin.distanceToSquared(pc) > (e.far - e.near) ** 2)
        ) &&
          (fc.copy(r).invert(),
          Jn.copy(e.ray).applyMatrix4(fc),
          !(n.boundingBox !== null && Jn.intersectsBox(n.boundingBox) === !1) && this._computeIntersections(e, t, Jn)));
    }
    _computeIntersections(e, t, n) {
      let s,
        r = this.geometry,
        a = this.material,
        o = r.index,
        c = r.attributes.position,
        l = r.attributes.uv,
        d = r.attributes.uv1,
        m = r.attributes.normal,
        h = r.groups,
        f = r.drawRange;
      if (o !== null)
        if (Array.isArray(a))
          for (let g = 0, y = h.length; g < y; g++) {
            const p = h[g],
              u = a[p.materialIndex],
              v = Math.max(p.start, f.start),
              T = Math.min(o.count, Math.min(p.start + p.count, f.start + f.count));
            for (let S = v, w = T; S < w; S += 3) {
              const E = o.getX(S),
                R = o.getX(S + 1),
                x = o.getX(S + 2);
              (s = Ws(this, u, e, n, l, d, m, E, R, x)),
                s && ((s.faceIndex = Math.floor(S / 3)), (s.face.materialIndex = p.materialIndex), t.push(s));
            }
          }
        else {
          const g = Math.max(0, f.start),
            y = Math.min(o.count, f.start + f.count);
          for (let p = g, u = y; p < u; p += 3) {
            const v = o.getX(p),
              T = o.getX(p + 1),
              S = o.getX(p + 2);
            (s = Ws(this, a, e, n, l, d, m, v, T, S)), s && ((s.faceIndex = Math.floor(p / 3)), t.push(s));
          }
        }
      else if (c !== void 0)
        if (Array.isArray(a))
          for (let g = 0, y = h.length; g < y; g++) {
            const p = h[g],
              u = a[p.materialIndex],
              v = Math.max(p.start, f.start),
              T = Math.min(c.count, Math.min(p.start + p.count, f.start + f.count));
            for (let S = v, w = T; S < w; S += 3) {
              const E = S,
                R = S + 1,
                x = S + 2;
              (s = Ws(this, u, e, n, l, d, m, E, R, x)),
                s && ((s.faceIndex = Math.floor(S / 3)), (s.face.materialIndex = p.materialIndex), t.push(s));
            }
          }
        else {
          const g = Math.max(0, f.start),
            y = Math.min(c.count, f.start + f.count);
          for (let p = g, u = y; p < u; p += 3) {
            const v = p,
              T = p + 1,
              S = p + 2;
            (s = Ws(this, a, e, n, l, d, m, v, T, S)), s && ((s.faceIndex = Math.floor(p / 3)), t.push(s));
          }
        }
    }
  };
function hu(i, e, t, n, s, r, a, o) {
  let c;
  if (
    (e.side === Ct ? (c = n.intersectTriangle(a, r, s, !0, o)) : (c = n.intersectTriangle(s, r, a, e.side === yn, o)),
    c === null)
  )
    return null;
  Hs.copy(o), Hs.applyMatrix4(i.matrixWorld);
  const l = t.ray.origin.distanceTo(Hs);
  return l < t.near || l > t.far ? null : { distance: l, point: Hs.clone(), object: i };
}
function Ws(i, e, t, n, s, r, a, o, c, l) {
  i.getVertexPosition(o, zs), i.getVertexPosition(c, Vs), i.getVertexPosition(l, ks);
  const d = hu(i, e, t, n, zs, Vs, ks, mc);
  if (d) {
    const m = new L();
    xn.getBarycoord(mc, zs, Vs, ks, m),
      s && (d.uv = xn.getInterpolatedAttribute(s, o, c, l, m, new Re())),
      r && (d.uv1 = xn.getInterpolatedAttribute(r, o, c, l, m, new Re())),
      a &&
        ((d.normal = xn.getInterpolatedAttribute(a, o, c, l, m, new L())),
        d.normal.dot(n.direction) > 0 && d.normal.multiplyScalar(-1));
    const h = { a: o, b: c, c: l, normal: new L(), materialIndex: 0 };
    xn.getNormal(zs, Vs, ks, h.normal), (d.face = h), (d.barycoord = m);
  }
  return d;
}
var vr = class extends ln {
  constructor(e = null, t = 1, n = 1, s, r, a, o, c, l = vt, d = vt, m, h) {
    super(null, a, o, c, l, d, s, r, m, h),
      (this.isDataTexture = !0),
      (this.image = { data: e, width: t, height: n }),
      (this.generateMipmaps = !1),
      (this.flipY = !1),
      (this.unpackAlignment = 1);
  }
};
var go = new L(),
  uu = new L(),
  du = new De(),
  jt = class {
    constructor(e = new L(1, 0, 0), t = 0) {
      (this.isPlane = !0), (this.normal = e), (this.constant = t);
    }
    set(e, t) {
      return this.normal.copy(e), (this.constant = t), this;
    }
    setComponents(e, t, n, s) {
      return this.normal.set(e, t, n), (this.constant = s), this;
    }
    setFromNormalAndCoplanarPoint(e, t) {
      return this.normal.copy(e), (this.constant = -t.dot(this.normal)), this;
    }
    setFromCoplanarPoints(e, t, n) {
      const s = go.subVectors(n, t).cross(uu.subVectors(e, t)).normalize();
      return this.setFromNormalAndCoplanarPoint(s, e), this;
    }
    copy(e) {
      return this.normal.copy(e.normal), (this.constant = e.constant), this;
    }
    normalize() {
      const e = 1 / this.normal.length();
      return this.normal.multiplyScalar(e), (this.constant *= e), this;
    }
    negate() {
      return (this.constant *= -1), this.normal.negate(), this;
    }
    distanceToPoint(e) {
      return this.normal.dot(e) + this.constant;
    }
    distanceToSphere(e) {
      return this.distanceToPoint(e.center) - e.radius;
    }
    projectPoint(e, t) {
      return t.copy(e).addScaledVector(this.normal, -this.distanceToPoint(e));
    }
    intersectLine(e, t) {
      const n = e.delta(go),
        s = this.normal.dot(n);
      if (s === 0) return this.distanceToPoint(e.start) === 0 ? t.copy(e.start) : null;
      const r = -(e.start.dot(this.normal) + this.constant) / s;
      return r < 0 || r > 1 ? null : t.copy(e.start).addScaledVector(n, r);
    }
    intersectsLine(e) {
      const t = this.distanceToPoint(e.start),
        n = this.distanceToPoint(e.end);
      return (t < 0 && n > 0) || (n < 0 && t > 0);
    }
    intersectsBox(e) {
      return e.intersectsPlane(this);
    }
    intersectsSphere(e) {
      return e.intersectsPlane(this);
    }
    coplanarPoint(e) {
      return e.copy(this.normal).multiplyScalar(-this.constant);
    }
    applyMatrix4(e, t) {
      const n = t || du.getNormalMatrix(e),
        s = this.coplanarPoint(go).applyMatrix4(e),
        r = this.normal.applyMatrix3(n).normalize();
      return (this.constant = -s.dot(r)), this;
    }
    translate(e) {
      return (this.constant -= e.dot(this.normal)), this;
    }
    equals(e) {
      return e.normal.equals(this.normal) && e.constant === this.constant;
    }
    clone() {
      return new this.constructor().copy(this);
    }
  },
  $n = new Nn(),
  fu = new Re(0.5, 0.5),
  Xs = new L(),
  Di = class {
    constructor(e = new jt(), t = new jt(), n = new jt(), s = new jt(), r = new jt(), a = new jt()) {
      this.planes = [e, t, n, s, r, a];
    }
    set(e, t, n, s, r, a) {
      const o = this.planes;
      return o[0].copy(e), o[1].copy(t), o[2].copy(n), o[3].copy(s), o[4].copy(r), o[5].copy(a), this;
    }
    copy(e) {
      const t = this.planes;
      for (let n = 0; n < 6; n++) t[n].copy(e.planes[n]);
      return this;
    }
    setFromProjectionMatrix(e, t = Xt, n = !1) {
      const s = this.planes,
        r = e.elements,
        a = r[0],
        o = r[1],
        c = r[2],
        l = r[3],
        d = r[4],
        m = r[5],
        h = r[6],
        f = r[7],
        g = r[8],
        y = r[9],
        p = r[10],
        u = r[11],
        v = r[12],
        T = r[13],
        S = r[14],
        w = r[15];
      if (
        (s[0].setComponents(l - a, f - d, u - g, w - v).normalize(),
        s[1].setComponents(l + a, f + d, u + g, w + v).normalize(),
        s[2].setComponents(l + o, f + m, u + y, w + T).normalize(),
        s[3].setComponents(l - o, f - m, u - y, w - T).normalize(),
        n)
      )
        s[4].setComponents(c, h, p, S).normalize(), s[5].setComponents(l - c, f - h, u - p, w - S).normalize();
      else if ((s[4].setComponents(l - c, f - h, u - p, w - S).normalize(), t === Xt))
        s[5].setComponents(l + c, f + h, u + p, w + S).normalize();
      else if (t === Ci) s[5].setComponents(c, h, p, S).normalize();
      else throw new Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: ${t}`);
      return this;
    }
    intersectsObject(e) {
      if (e.boundingSphere !== void 0)
        e.boundingSphere === null && e.computeBoundingSphere(), $n.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);
      else {
        const t = e.geometry;
        t.boundingSphere === null && t.computeBoundingSphere(), $n.copy(t.boundingSphere).applyMatrix4(e.matrixWorld);
      }
      return this.intersectsSphere($n);
    }
    intersectsSprite(e) {
      $n.center.set(0, 0, 0);
      const t = fu.distanceTo(e.center);
      return ($n.radius = Math.SQRT1_2 + t), $n.applyMatrix4(e.matrixWorld), this.intersectsSphere($n);
    }
    intersectsSphere(e) {
      const t = this.planes,
        n = e.center,
        s = -e.radius;
      for (let r = 0; r < 6; r++) if (t[r].distanceToPoint(n) < s) return !1;
      return !0;
    }
    intersectsBox(e) {
      const t = this.planes;
      for (let n = 0; n < 6; n++) {
        const s = t[n];
        if (
          ((Xs.x = s.normal.x > 0 ? e.max.x : e.min.x),
          (Xs.y = s.normal.y > 0 ? e.max.y : e.min.y),
          (Xs.z = s.normal.z > 0 ? e.max.z : e.min.z),
          s.distanceToPoint(Xs) < 0)
        )
          return !1;
      }
      return !0;
    }
    containsPoint(e) {
      const t = this.planes;
      for (let n = 0; n < 6; n++) if (t[n].distanceToPoint(e) < 0) return !1;
      return !0;
    }
    clone() {
      return new this.constructor().copy(this);
    }
  };
var yr = class extends qt {
    constructor(e) {
      super(),
        (this.isLineBasicMaterial = !0),
        (this.type = 'LineBasicMaterial'),
        (this.color = new Ve(16777215)),
        (this.map = null),
        (this.linewidth = 1),
        (this.linecap = 'round'),
        (this.linejoin = 'round'),
        (this.fog = !0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        this.color.copy(e.color),
        (this.map = e.map),
        (this.linewidth = e.linewidth),
        (this.linecap = e.linecap),
        (this.linejoin = e.linejoin),
        (this.fog = e.fog),
        this
      );
    }
  },
  Mr = new L(),
  Sr = new L(),
  gc = new tt(),
  Ji = new ni(),
  qs = new Nn(),
  _o = new L(),
  _c = new L(),
  Io = class extends $t {
    constructor(e = new ft(), t = new yr()) {
      super(),
        (this.isLine = !0),
        (this.type = 'Line'),
        (this.geometry = e),
        (this.material = t),
        (this.morphTargetDictionary = void 0),
        (this.morphTargetInfluences = void 0),
        this.updateMorphTargets();
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        (this.material = Array.isArray(e.material) ? e.material.slice() : e.material),
        (this.geometry = e.geometry),
        this
      );
    }
    computeLineDistances() {
      const e = this.geometry;
      if (e.index === null) {
        const t = e.attributes.position,
          n = [0];
        for (let s = 1, r = t.count; s < r; s++)
          Mr.fromBufferAttribute(t, s - 1),
            Sr.fromBufferAttribute(t, s),
            (n[s] = n[s - 1]),
            (n[s] += Mr.distanceTo(Sr));
        e.setAttribute('lineDistance', new Xe(n, 1));
      } else Ee('Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.');
      return this;
    }
    raycast(e, t) {
      const n = this.geometry,
        s = this.matrixWorld,
        r = e.params.Line.threshold,
        a = n.drawRange;
      if (
        (n.boundingSphere === null && n.computeBoundingSphere(),
        qs.copy(n.boundingSphere),
        qs.applyMatrix4(s),
        (qs.radius += r),
        e.ray.intersectsSphere(qs) === !1)
      )
        return;
      gc.copy(s).invert(), Ji.copy(e.ray).applyMatrix4(gc);
      const o = r / ((this.scale.x + this.scale.y + this.scale.z) / 3),
        c = o * o,
        l = this.isLineSegments ? 2 : 1,
        d = n.index,
        h = n.attributes.position;
      if (d !== null) {
        const f = Math.max(0, a.start),
          g = Math.min(d.count, a.start + a.count);
        for (let y = f, p = g - 1; y < p; y += l) {
          const u = d.getX(y),
            v = d.getX(y + 1),
            T = Ys(this, e, Ji, c, u, v, y);
          T && t.push(T);
        }
        if (this.isLineLoop) {
          const y = d.getX(g - 1),
            p = d.getX(f),
            u = Ys(this, e, Ji, c, y, p, g - 1);
          u && t.push(u);
        }
      } else {
        const f = Math.max(0, a.start),
          g = Math.min(h.count, a.start + a.count);
        for (let y = f, p = g - 1; y < p; y += l) {
          const u = Ys(this, e, Ji, c, y, y + 1, y);
          u && t.push(u);
        }
        if (this.isLineLoop) {
          const y = Ys(this, e, Ji, c, g - 1, f, g - 1);
          y && t.push(y);
        }
      }
    }
    updateMorphTargets() {
      const t = this.geometry.morphAttributes,
        n = Object.keys(t);
      if (n.length > 0) {
        const s = t[n[0]];
        if (s !== void 0) {
          (this.morphTargetInfluences = []), (this.morphTargetDictionary = {});
          for (let r = 0, a = s.length; r < a; r++) {
            const o = s[r].name || String(r);
            this.morphTargetInfluences.push(0), (this.morphTargetDictionary[o] = r);
          }
        }
      }
    }
  };
function Ys(i, e, t, n, s, r, a) {
  const o = i.geometry.attributes.position;
  if ((Mr.fromBufferAttribute(o, s), Sr.fromBufferAttribute(o, r), t.distanceSqToSegment(Mr, Sr, _o, _c) > n)) return;
  _o.applyMatrix4(i.matrixWorld);
  const l = e.ray.origin.distanceTo(_o);
  if (!(l < e.near || l > e.far))
    return {
      distance: l,
      point: _c.clone().applyMatrix4(i.matrixWorld),
      index: a,
      face: null,
      faceIndex: null,
      barycoord: null,
      object: i,
    };
}
var br = class extends qt {
    constructor(e) {
      super(),
        (this.isPointsMaterial = !0),
        (this.type = 'PointsMaterial'),
        (this.color = new Ve(16777215)),
        (this.map = null),
        (this.alphaMap = null),
        (this.size = 1),
        (this.sizeAttenuation = !0),
        (this.fog = !0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        this.color.copy(e.color),
        (this.map = e.map),
        (this.alphaMap = e.alphaMap),
        (this.size = e.size),
        (this.sizeAttenuation = e.sizeAttenuation),
        (this.fog = e.fog),
        this
      );
    }
  },
  xc = new tt(),
  Po = new ni(),
  Zs = new Nn(),
  Js = new L(),
  Lo = class extends $t {
    constructor(e = new ft(), t = new br()) {
      super(),
        (this.isPoints = !0),
        (this.type = 'Points'),
        (this.geometry = e),
        (this.material = t),
        (this.morphTargetDictionary = void 0),
        (this.morphTargetInfluences = void 0),
        this.updateMorphTargets();
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        (this.material = Array.isArray(e.material) ? e.material.slice() : e.material),
        (this.geometry = e.geometry),
        this
      );
    }
    raycast(e, t) {
      const n = this.geometry,
        s = this.matrixWorld,
        r = e.params.Points.threshold,
        a = n.drawRange;
      if (
        (n.boundingSphere === null && n.computeBoundingSphere(),
        Zs.copy(n.boundingSphere),
        Zs.applyMatrix4(s),
        (Zs.radius += r),
        e.ray.intersectsSphere(Zs) === !1)
      )
        return;
      xc.copy(s).invert(), Po.copy(e.ray).applyMatrix4(xc);
      const o = r / ((this.scale.x + this.scale.y + this.scale.z) / 3),
        c = o * o,
        l = n.index,
        m = n.attributes.position;
      if (l !== null) {
        const h = Math.max(0, a.start),
          f = Math.min(l.count, a.start + a.count);
        for (let g = h, y = f; g < y; g++) {
          const p = l.getX(g);
          Js.fromBufferAttribute(m, p), vc(Js, p, c, s, e, t, this);
        }
      } else {
        const h = Math.max(0, a.start),
          f = Math.min(m.count, a.start + a.count);
        for (let g = h, y = f; g < y; g++) Js.fromBufferAttribute(m, g), vc(Js, g, c, s, e, t, this);
      }
    }
    updateMorphTargets() {
      const t = this.geometry.morphAttributes,
        n = Object.keys(t);
      if (n.length > 0) {
        const s = t[n[0]];
        if (s !== void 0) {
          (this.morphTargetInfluences = []), (this.morphTargetDictionary = {});
          for (let r = 0, a = s.length; r < a; r++) {
            const o = s[r].name || String(r);
            this.morphTargetInfluences.push(0), (this.morphTargetDictionary[o] = r);
          }
        }
      }
    }
  };
function vc(i, e, t, n, s, r, a) {
  const o = Po.distanceSqToPoint(i);
  if (o < t) {
    const c = new L();
    Po.closestPointToPoint(i, c), c.applyMatrix4(n);
    const l = s.ray.origin.distanceTo(c);
    if (l < s.near || l > s.far) return;
    r.push({
      distance: l,
      distanceToRay: Math.sqrt(o),
      point: c,
      index: e,
      face: null,
      faceIndex: null,
      barycoord: null,
      object: a,
    });
  }
}
var as = class extends ln {
    constructor(e = [], t = Vn, n, s, r, a, o, c, l, d) {
      super(e, t, n, s, r, a, o, c, l, d), (this.isCubeTexture = !0), (this.flipY = !1);
    }
    get images() {
      return this.image;
    }
    set images(e) {
      this.image = e;
    }
  },
  Do = class extends ln {
    constructor(e, t, n, s, r, a, o, c, l) {
      super(e, t, n, s, r, a, o, c, l), (this.isCanvasTexture = !0), (this.needsUpdate = !0);
    }
  },
  Fn = class extends ln {
    constructor(e, t, n = Zt, s, r, a, o = vt, c = vt, l, d = nn, m = 1) {
      if (d !== nn && d !== Gn)
        throw new Error('DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat');
      const h = { width: e, height: t, depth: m };
      super(h, s, r, a, o, c, d, n, l),
        (this.isDepthTexture = !0),
        (this.flipY = !1),
        (this.generateMipmaps = !1),
        (this.compareFunction = null);
    }
    copy(e) {
      return (
        super.copy(e),
        (this.source = new Ii(Object.assign({}, e.image))),
        (this.compareFunction = e.compareFunction),
        this
      );
    }
    toJSON(e) {
      const t = super.toJSON(e);
      return this.compareFunction !== null && (t.compareFunction = this.compareFunction), t;
    }
  },
  Tr = class extends Fn {
    constructor(e, t = Zt, n = Vn, s, r, a = vt, o = vt, c, l = nn) {
      const d = { width: e, height: e, depth: 1 },
        m = [d, d, d, d, d, d];
      super(e, e, t, n, s, r, a, o, c, l), (this.image = m), (this.isCubeDepthTexture = !0), (this.isCubeTexture = !0);
    }
    get images() {
      return this.image;
    }
    set images(e) {
      this.image = e;
    }
  },
  os = class extends ln {
    constructor(e = null) {
      super(), (this.sourceTexture = e), (this.isExternalTexture = !0);
    }
    copy(e) {
      return super.copy(e), (this.sourceTexture = e.sourceTexture), this;
    }
  },
  Ui = class i extends ft {
    constructor(e = 1, t = 1, n = 1, s = 1, r = 1, a = 1) {
      super(),
        (this.type = 'BoxGeometry'),
        (this.parameters = { width: e, height: t, depth: n, widthSegments: s, heightSegments: r, depthSegments: a });
      const o = this;
      (s = Math.floor(s)), (r = Math.floor(r)), (a = Math.floor(a));
      let c = [],
        l = [],
        d = [],
        m = [],
        h = 0,
        f = 0;
      g('z', 'y', 'x', -1, -1, n, t, e, a, r, 0),
        g('z', 'y', 'x', 1, -1, n, t, -e, a, r, 1),
        g('x', 'z', 'y', 1, 1, e, n, t, s, a, 2),
        g('x', 'z', 'y', 1, -1, e, n, -t, s, a, 3),
        g('x', 'y', 'z', 1, -1, e, t, n, s, r, 4),
        g('x', 'y', 'z', -1, -1, e, t, -n, s, r, 5),
        this.setIndex(c),
        this.setAttribute('position', new Xe(l, 3)),
        this.setAttribute('normal', new Xe(d, 3)),
        this.setAttribute('uv', new Xe(m, 2));
      function g(y, p, u, v, T, S, w, E, R, x, b) {
        let k = S / R,
          C = w / x,
          N = S / 2,
          O = w / 2,
          W = E / 2,
          z = R + 1,
          G = x + 1,
          F = 0,
          j = 0,
          $ = new L();
        for (let ce = 0; ce < G; ce++) {
          const pe = ce * C - O;
          for (let ue = 0; ue < z; ue++) {
            const Ne = ue * k - N;
            ($[y] = Ne * v),
              ($[p] = pe * T),
              ($[u] = W),
              l.push($.x, $.y, $.z),
              ($[y] = 0),
              ($[p] = 0),
              ($[u] = E > 0 ? 1 : -1),
              d.push($.x, $.y, $.z),
              m.push(ue / R),
              m.push(1 - ce / x),
              (F += 1);
          }
        }
        for (let ce = 0; ce < x; ce++)
          for (let pe = 0; pe < R; pe++) {
            const ue = h + pe + z * ce,
              Ne = h + pe + z * (ce + 1),
              rt = h + (pe + 1) + z * (ce + 1),
              st = h + (pe + 1) + z * ce;
            c.push(ue, Ne, st), c.push(Ne, rt, st), (j += 6);
          }
        o.addGroup(f, j, b), (f += j), (h += F);
      }
    }
    copy(e) {
      return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
    }
    static fromJSON(e) {
      return new i(e.width, e.height, e.depth, e.widthSegments, e.heightSegments, e.depthSegments);
    }
  };
var Uo = class i extends ft {
    constructor(e = 1, t = 32, n = 0, s = Math.PI * 2) {
      super(),
        (this.type = 'CircleGeometry'),
        (this.parameters = { radius: e, segments: t, thetaStart: n, thetaLength: s }),
        (t = Math.max(3, t));
      const r = [],
        a = [],
        o = [],
        c = [],
        l = new L(),
        d = new Re();
      a.push(0, 0, 0), o.push(0, 0, 1), c.push(0.5, 0.5);
      for (let m = 0, h = 3; m <= t; m++, h += 3) {
        const f = n + (m / t) * s;
        (l.x = e * Math.cos(f)),
          (l.y = e * Math.sin(f)),
          a.push(l.x, l.y, l.z),
          o.push(0, 0, 1),
          (d.x = (a[h] / e + 1) / 2),
          (d.y = (a[h + 1] / e + 1) / 2),
          c.push(d.x, d.y);
      }
      for (let m = 1; m <= t; m++) r.push(m, m + 1, 0);
      this.setIndex(r),
        this.setAttribute('position', new Xe(a, 3)),
        this.setAttribute('normal', new Xe(o, 3)),
        this.setAttribute('uv', new Xe(c, 2));
    }
    copy(e) {
      return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
    }
    static fromJSON(e) {
      return new i(e.radius, e.segments, e.thetaStart, e.thetaLength);
    }
  },
  No = class i extends ft {
    constructor(e = 1, t = 1, n = 1, s = 32, r = 1, a = !1, o = 0, c = Math.PI * 2) {
      super(),
        (this.type = 'CylinderGeometry'),
        (this.parameters = {
          radiusTop: e,
          radiusBottom: t,
          height: n,
          radialSegments: s,
          heightSegments: r,
          openEnded: a,
          thetaStart: o,
          thetaLength: c,
        });
      const l = this;
      (s = Math.floor(s)), (r = Math.floor(r));
      let d = [],
        m = [],
        h = [],
        f = [],
        g = 0,
        y = [],
        p = n / 2,
        u = 0;
      v(),
        a === !1 && (e > 0 && T(!0), t > 0 && T(!1)),
        this.setIndex(d),
        this.setAttribute('position', new Xe(m, 3)),
        this.setAttribute('normal', new Xe(h, 3)),
        this.setAttribute('uv', new Xe(f, 2));
      function v() {
        let S = new L(),
          w = new L(),
          E = 0,
          R = (t - e) / n;
        for (let x = 0; x <= r; x++) {
          const b = [],
            k = x / r,
            C = k * (t - e) + e;
          for (let N = 0; N <= s; N++) {
            const O = N / s,
              W = O * c + o,
              z = Math.sin(W),
              G = Math.cos(W);
            (w.x = C * z),
              (w.y = -k * n + p),
              (w.z = C * G),
              m.push(w.x, w.y, w.z),
              S.set(z, R, G).normalize(),
              h.push(S.x, S.y, S.z),
              f.push(O, 1 - k),
              b.push(g++);
          }
          y.push(b);
        }
        for (let x = 0; x < s; x++)
          for (let b = 0; b < r; b++) {
            const k = y[b][x],
              C = y[b + 1][x],
              N = y[b + 1][x + 1],
              O = y[b][x + 1];
            (e > 0 || b !== 0) && (d.push(k, C, O), (E += 3)), (t > 0 || b !== r - 1) && (d.push(C, N, O), (E += 3));
          }
        l.addGroup(u, E, 0), (u += E);
      }
      function T(S) {
        let w = g,
          E = new Re(),
          R = new L(),
          x = 0,
          b = S === !0 ? e : t,
          k = S === !0 ? 1 : -1;
        for (let N = 1; N <= s; N++) m.push(0, p * k, 0), h.push(0, k, 0), f.push(0.5, 0.5), g++;
        const C = g;
        for (let N = 0; N <= s; N++) {
          const W = (N / s) * c + o,
            z = Math.cos(W),
            G = Math.sin(W);
          (R.x = b * G),
            (R.y = p * k),
            (R.z = b * z),
            m.push(R.x, R.y, R.z),
            h.push(0, k, 0),
            (E.x = z * 0.5 + 0.5),
            (E.y = G * 0.5 * k + 0.5),
            f.push(E.x, E.y),
            g++;
        }
        for (let N = 0; N < s; N++) {
          const O = w + N,
            W = C + N;
          S === !0 ? d.push(W, W + 1, O) : d.push(W + 1, W, O), (x += 3);
        }
        l.addGroup(u, x, S === !0 ? 1 : 2), (u += x);
      }
    }
    copy(e) {
      return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
    }
    static fromJSON(e) {
      return new i(
        e.radiusTop,
        e.radiusBottom,
        e.height,
        e.radialSegments,
        e.heightSegments,
        e.openEnded,
        e.thetaStart,
        e.thetaLength,
      );
    }
  };
var Ar = class i extends ft {
  constructor(e = [], t = [], n = 1, s = 0) {
    super(), (this.type = 'PolyhedronGeometry'), (this.parameters = { vertices: e, indices: t, radius: n, detail: s });
    const r = [],
      a = [];
    o(s),
      l(n),
      d(),
      this.setAttribute('position', new Xe(r, 3)),
      this.setAttribute('normal', new Xe(r.slice(), 3)),
      this.setAttribute('uv', new Xe(a, 2)),
      s === 0 ? this.computeVertexNormals() : this.normalizeNormals();
    function o(v) {
      const T = new L(),
        S = new L(),
        w = new L();
      for (let E = 0; E < t.length; E += 3) f(t[E + 0], T), f(t[E + 1], S), f(t[E + 2], w), c(T, S, w, v);
    }
    function c(v, T, S, w) {
      const E = w + 1,
        R = [];
      for (let x = 0; x <= E; x++) {
        R[x] = [];
        const b = v.clone().lerp(S, x / E),
          k = T.clone().lerp(S, x / E),
          C = E - x;
        for (let N = 0; N <= C; N++) N === 0 && x === E ? (R[x][N] = b) : (R[x][N] = b.clone().lerp(k, N / C));
      }
      for (let x = 0; x < E; x++)
        for (let b = 0; b < 2 * (E - x) - 1; b++) {
          const k = Math.floor(b / 2);
          b % 2 === 0
            ? (h(R[x][k + 1]), h(R[x + 1][k]), h(R[x][k]))
            : (h(R[x][k + 1]), h(R[x + 1][k + 1]), h(R[x + 1][k]));
        }
    }
    function l(v) {
      const T = new L();
      for (let S = 0; S < r.length; S += 3)
        (T.x = r[S + 0]),
          (T.y = r[S + 1]),
          (T.z = r[S + 2]),
          T.normalize().multiplyScalar(v),
          (r[S + 0] = T.x),
          (r[S + 1] = T.y),
          (r[S + 2] = T.z);
    }
    function d() {
      const v = new L();
      for (let T = 0; T < r.length; T += 3) {
        (v.x = r[T + 0]), (v.y = r[T + 1]), (v.z = r[T + 2]);
        const S = p(v) / 2 / Math.PI + 0.5,
          w = u(v) / Math.PI + 0.5;
        a.push(S, 1 - w);
      }
      g(), m();
    }
    function m() {
      for (let v = 0; v < a.length; v += 6) {
        const T = a[v + 0],
          S = a[v + 2],
          w = a[v + 4],
          E = Math.max(T, S, w),
          R = Math.min(T, S, w);
        E > 0.9 && R < 0.1 && (T < 0.2 && (a[v + 0] += 1), S < 0.2 && (a[v + 2] += 1), w < 0.2 && (a[v + 4] += 1));
      }
    }
    function h(v) {
      r.push(v.x, v.y, v.z);
    }
    function f(v, T) {
      const S = v * 3;
      (T.x = e[S + 0]), (T.y = e[S + 1]), (T.z = e[S + 2]);
    }
    function g() {
      const v = new L(),
        T = new L(),
        S = new L(),
        w = new L(),
        E = new Re(),
        R = new Re(),
        x = new Re();
      for (let b = 0, k = 0; b < r.length; b += 9, k += 6) {
        v.set(r[b + 0], r[b + 1], r[b + 2]),
          T.set(r[b + 3], r[b + 4], r[b + 5]),
          S.set(r[b + 6], r[b + 7], r[b + 8]),
          E.set(a[k + 0], a[k + 1]),
          R.set(a[k + 2], a[k + 3]),
          x.set(a[k + 4], a[k + 5]),
          w.copy(v).add(T).add(S).divideScalar(3);
        const C = p(w);
        y(E, k + 0, v, C), y(R, k + 2, T, C), y(x, k + 4, S, C);
      }
    }
    function y(v, T, S, w) {
      w < 0 && v.x === 1 && (a[T] = v.x - 1), S.x === 0 && S.z === 0 && (a[T] = w / 2 / Math.PI + 0.5);
    }
    function p(v) {
      return Math.atan2(v.z, -v.x);
    }
    function u(v) {
      return Math.atan2(-v.y, Math.sqrt(v.x * v.x + v.z * v.z));
    }
  }
  copy(e) {
    return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
  }
  static fromJSON(e) {
    return new i(e.vertices, e.indices, e.radius, e.detail);
  }
};
var Er = class {
  constructor() {
    (this.type = 'Curve'), (this.arcLengthDivisions = 200), (this.needsUpdate = !1), (this.cacheArcLengths = null);
  }
  getPoint() {
    Ee('Curve: .getPoint() not implemented.');
  }
  getPointAt(e, t) {
    const n = this.getUtoTmapping(e);
    return this.getPoint(n, t);
  }
  getPoints(e = 5) {
    const t = [];
    for (let n = 0; n <= e; n++) t.push(this.getPoint(n / e));
    return t;
  }
  getSpacedPoints(e = 5) {
    const t = [];
    for (let n = 0; n <= e; n++) t.push(this.getPointAt(n / e));
    return t;
  }
  getLength() {
    const e = this.getLengths();
    return e[e.length - 1];
  }
  getLengths(e = this.arcLengthDivisions) {
    if (this.cacheArcLengths && this.cacheArcLengths.length === e + 1 && !this.needsUpdate) return this.cacheArcLengths;
    this.needsUpdate = !1;
    let t = [],
      n,
      s = this.getPoint(0),
      r = 0;
    t.push(0);
    for (let a = 1; a <= e; a++) (n = this.getPoint(a / e)), (r += n.distanceTo(s)), t.push(r), (s = n);
    return (this.cacheArcLengths = t), t;
  }
  updateArcLengths() {
    (this.needsUpdate = !0), this.getLengths();
  }
  getUtoTmapping(e, t = null) {
    let n = this.getLengths(),
      s = 0,
      r = n.length,
      a;
    t ? (a = t) : (a = e * n[r - 1]);
    let o = 0,
      c = r - 1,
      l;
    for (; o <= c; )
      if (((s = Math.floor(o + (c - o) / 2)), (l = n[s] - a), l < 0)) o = s + 1;
      else if (l > 0) c = s - 1;
      else {
        c = s;
        break;
      }
    if (((s = c), n[s] === a)) return s / (r - 1);
    const d = n[s],
      h = n[s + 1] - d,
      f = (a - d) / h;
    return (s + f) / (r - 1);
  }
  getTangent(e, t) {
    let s = e - 1e-4,
      r = e + 1e-4;
    s < 0 && (s = 0), r > 1 && (r = 1);
    const a = this.getPoint(s),
      o = this.getPoint(r),
      c = t || (a.isVector2 ? new Re() : new L());
    return c.copy(o).sub(a).normalize(), c;
  }
  getTangentAt(e, t) {
    const n = this.getUtoTmapping(e);
    return this.getTangent(n, t);
  }
  computeFrenetFrames(e, t = !1) {
    const n = new L(),
      s = [],
      r = [],
      a = [],
      o = new L(),
      c = new tt();
    for (let f = 0; f <= e; f++) {
      const g = f / e;
      s[f] = this.getTangentAt(g, new L());
    }
    (r[0] = new L()), (a[0] = new L());
    let l = Number.MAX_VALUE,
      d = Math.abs(s[0].x),
      m = Math.abs(s[0].y),
      h = Math.abs(s[0].z);
    d <= l && ((l = d), n.set(1, 0, 0)),
      m <= l && ((l = m), n.set(0, 1, 0)),
      h <= l && n.set(0, 0, 1),
      o.crossVectors(s[0], n).normalize(),
      r[0].crossVectors(s[0], o),
      a[0].crossVectors(s[0], r[0]);
    for (let f = 1; f <= e; f++) {
      if (
        ((r[f] = r[f - 1].clone()),
        (a[f] = a[f - 1].clone()),
        o.crossVectors(s[f - 1], s[f]),
        o.length() > Number.EPSILON)
      ) {
        o.normalize();
        const g = Math.acos(ke(s[f - 1].dot(s[f]), -1, 1));
        r[f].applyMatrix4(c.makeRotationAxis(o, g));
      }
      a[f].crossVectors(s[f], r[f]);
    }
    if (t === !0) {
      let f = Math.acos(ke(r[0].dot(r[e]), -1, 1));
      (f /= e), s[0].dot(o.crossVectors(r[0], r[e])) > 0 && (f = -f);
      for (let g = 1; g <= e; g++) r[g].applyMatrix4(c.makeRotationAxis(s[g], f * g)), a[g].crossVectors(s[g], r[g]);
    }
    return { tangents: s, normals: r, binormals: a };
  }
  clone() {
    return new this.constructor().copy(this);
  }
  copy(e) {
    return (this.arcLengthDivisions = e.arcLengthDivisions), this;
  }
  toJSON() {
    const e = { metadata: { version: 4.7, type: 'Curve', generator: 'Curve.toJSON' } };
    return (e.arcLengthDivisions = this.arcLengthDivisions), (e.type = this.type), e;
  }
  fromJSON(e) {
    return (this.arcLengthDivisions = e.arcLengthDivisions), this;
  }
};
function pu(i, e) {
  const t = 1 - i;
  return t * t * e;
}
function mu(i, e) {
  return 2 * (1 - i) * i * e;
}
function gu(i, e) {
  return i * i * e;
}
function xo(i, e, t, n) {
  return pu(i, e) + mu(i, t) + gu(i, n);
}
var Fo = class extends Er {
  constructor(e = new L(), t = new L(), n = new L()) {
    super(),
      (this.isQuadraticBezierCurve3 = !0),
      (this.type = 'QuadraticBezierCurve3'),
      (this.v0 = e),
      (this.v1 = t),
      (this.v2 = n);
  }
  getPoint(e, t = new L()) {
    const n = t,
      s = this.v0,
      r = this.v1,
      a = this.v2;
    return n.set(xo(e, s.x, r.x, a.x), xo(e, s.y, r.y, a.y), xo(e, s.z, r.z, a.z)), n;
  }
  copy(e) {
    return super.copy(e), this.v0.copy(e.v0), this.v1.copy(e.v1), this.v2.copy(e.v2), this;
  }
  toJSON() {
    const e = super.toJSON();
    return (e.v0 = this.v0.toArray()), (e.v1 = this.v1.toArray()), (e.v2 = this.v2.toArray()), e;
  }
  fromJSON(e) {
    return super.fromJSON(e), this.v0.fromArray(e.v0), this.v1.fromArray(e.v1), this.v2.fromArray(e.v2), this;
  }
};
var Oo = class i extends Ar {
  constructor(e = 1, t = 0) {
    const n = (1 + Math.sqrt(5)) / 2,
      s = [
        -1,
        n,
        0,
        1,
        n,
        0,
        -1,
        -n,
        0,
        1,
        -n,
        0,
        0,
        -1,
        n,
        0,
        1,
        n,
        0,
        -1,
        -n,
        0,
        1,
        -n,
        n,
        0,
        -1,
        n,
        0,
        1,
        -n,
        0,
        -1,
        -n,
        0,
        1,
      ],
      r = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4,
        2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
      ];
    super(s, r, e, t), (this.type = 'IcosahedronGeometry'), (this.parameters = { radius: e, detail: t });
  }
  static fromJSON(e) {
    return new i(e.radius, e.detail);
  }
};
var ls = class i extends ft {
    constructor(e = 1, t = 1, n = 1, s = 1) {
      super(),
        (this.type = 'PlaneGeometry'),
        (this.parameters = { width: e, height: t, widthSegments: n, heightSegments: s });
      const r = e / 2,
        a = t / 2,
        o = Math.floor(n),
        c = Math.floor(s),
        l = o + 1,
        d = c + 1,
        m = e / o,
        h = t / c,
        f = [],
        g = [],
        y = [],
        p = [];
      for (let u = 0; u < d; u++) {
        const v = u * h - a;
        for (let T = 0; T < l; T++) {
          const S = T * m - r;
          g.push(S, -v, 0), y.push(0, 0, 1), p.push(T / o), p.push(1 - u / c);
        }
      }
      for (let u = 0; u < c; u++)
        for (let v = 0; v < o; v++) {
          const T = v + l * u,
            S = v + l * (u + 1),
            w = v + 1 + l * (u + 1),
            E = v + 1 + l * u;
          f.push(T, S, E), f.push(S, w, E);
        }
      this.setIndex(f),
        this.setAttribute('position', new Xe(g, 3)),
        this.setAttribute('normal', new Xe(y, 3)),
        this.setAttribute('uv', new Xe(p, 2));
    }
    copy(e) {
      return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
    }
    static fromJSON(e) {
      return new i(e.width, e.height, e.widthSegments, e.heightSegments);
    }
  },
  Bo = class i extends ft {
    constructor(e = 0.5, t = 1, n = 32, s = 1, r = 0, a = Math.PI * 2) {
      super(),
        (this.type = 'RingGeometry'),
        (this.parameters = {
          innerRadius: e,
          outerRadius: t,
          thetaSegments: n,
          phiSegments: s,
          thetaStart: r,
          thetaLength: a,
        }),
        (n = Math.max(3, n)),
        (s = Math.max(1, s));
      let o = [],
        c = [],
        l = [],
        d = [],
        m = e,
        h = (t - e) / s,
        f = new L(),
        g = new Re();
      for (let y = 0; y <= s; y++) {
        for (let p = 0; p <= n; p++) {
          const u = r + (p / n) * a;
          (f.x = m * Math.cos(u)),
            (f.y = m * Math.sin(u)),
            c.push(f.x, f.y, f.z),
            l.push(0, 0, 1),
            (g.x = (f.x / t + 1) / 2),
            (g.y = (f.y / t + 1) / 2),
            d.push(g.x, g.y);
        }
        m += h;
      }
      for (let y = 0; y < s; y++) {
        const p = y * (n + 1);
        for (let u = 0; u < n; u++) {
          const v = u + p,
            T = v,
            S = v + n + 1,
            w = v + n + 2,
            E = v + 1;
          o.push(T, S, E), o.push(S, w, E);
        }
      }
      this.setIndex(o),
        this.setAttribute('position', new Xe(c, 3)),
        this.setAttribute('normal', new Xe(l, 3)),
        this.setAttribute('uv', new Xe(d, 2));
    }
    copy(e) {
      return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
    }
    static fromJSON(e) {
      return new i(e.innerRadius, e.outerRadius, e.thetaSegments, e.phiSegments, e.thetaStart, e.thetaLength);
    }
  };
var zo = class i extends ft {
  constructor(e = 1, t = 32, n = 16, s = 0, r = Math.PI * 2, a = 0, o = Math.PI) {
    super(),
      (this.type = 'SphereGeometry'),
      (this.parameters = {
        radius: e,
        widthSegments: t,
        heightSegments: n,
        phiStart: s,
        phiLength: r,
        thetaStart: a,
        thetaLength: o,
      }),
      (t = Math.max(3, Math.floor(t))),
      (n = Math.max(2, Math.floor(n)));
    let c = Math.min(a + o, Math.PI),
      l = 0,
      d = [],
      m = new L(),
      h = new L(),
      f = [],
      g = [],
      y = [],
      p = [];
    for (let u = 0; u <= n; u++) {
      let v = [],
        T = u / n,
        S = 0;
      u === 0 && a === 0 ? (S = 0.5 / t) : u === n && c === Math.PI && (S = -0.5 / t);
      for (let w = 0; w <= t; w++) {
        const E = w / t;
        (m.x = -e * Math.cos(s + E * r) * Math.sin(a + T * o)),
          (m.y = e * Math.cos(a + T * o)),
          (m.z = e * Math.sin(s + E * r) * Math.sin(a + T * o)),
          g.push(m.x, m.y, m.z),
          h.copy(m).normalize(),
          y.push(h.x, h.y, h.z),
          p.push(E + S, 1 - T),
          v.push(l++);
      }
      d.push(v);
    }
    for (let u = 0; u < n; u++)
      for (let v = 0; v < t; v++) {
        const T = d[u][v + 1],
          S = d[u][v],
          w = d[u + 1][v],
          E = d[u + 1][v + 1];
        (u !== 0 || a > 0) && f.push(T, S, E), (u !== n - 1 || c < Math.PI) && f.push(S, w, E);
      }
    this.setIndex(f),
      this.setAttribute('position', new Xe(g, 3)),
      this.setAttribute('normal', new Xe(y, 3)),
      this.setAttribute('uv', new Xe(p, 2));
  }
  copy(e) {
    return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
  }
  static fromJSON(e) {
    return new i(e.radius, e.widthSegments, e.heightSegments, e.phiStart, e.phiLength, e.thetaStart, e.thetaLength);
  }
};
var Vo = class i extends ft {
  constructor(e = 1, t = 0.4, n = 12, s = 48, r = Math.PI * 2, a = 0, o = Math.PI * 2) {
    super(),
      (this.type = 'TorusGeometry'),
      (this.parameters = {
        radius: e,
        tube: t,
        radialSegments: n,
        tubularSegments: s,
        arc: r,
        thetaStart: a,
        thetaLength: o,
      }),
      (n = Math.floor(n)),
      (s = Math.floor(s));
    const c = [],
      l = [],
      d = [],
      m = [],
      h = new L(),
      f = new L(),
      g = new L();
    for (let y = 0; y <= n; y++) {
      const p = a + (y / n) * o;
      for (let u = 0; u <= s; u++) {
        const v = (u / s) * r;
        (f.x = (e + t * Math.cos(p)) * Math.cos(v)),
          (f.y = (e + t * Math.cos(p)) * Math.sin(v)),
          (f.z = t * Math.sin(p)),
          l.push(f.x, f.y, f.z),
          (h.x = e * Math.cos(v)),
          (h.y = e * Math.sin(v)),
          g.subVectors(f, h).normalize(),
          d.push(g.x, g.y, g.z),
          m.push(u / s),
          m.push(y / n);
      }
    }
    for (let y = 1; y <= n; y++)
      for (let p = 1; p <= s; p++) {
        const u = (s + 1) * y + p - 1,
          v = (s + 1) * (y - 1) + p - 1,
          T = (s + 1) * (y - 1) + p,
          S = (s + 1) * y + p;
        c.push(u, v, S), c.push(v, T, S);
      }
    this.setIndex(c),
      this.setAttribute('position', new Xe(l, 3)),
      this.setAttribute('normal', new Xe(d, 3)),
      this.setAttribute('uv', new Xe(m, 2));
  }
  copy(e) {
    return super.copy(e), (this.parameters = Object.assign({}, e.parameters)), this;
  }
  static fromJSON(e) {
    return new i(e.radius, e.tube, e.radialSegments, e.tubularSegments, e.arc);
  }
};
function ri(i) {
  const e = {};
  for (const t in i) {
    e[t] = {};
    for (const n in i[t]) {
      const s = i[t][n];
      s &&
      (s.isColor ||
        s.isMatrix3 ||
        s.isMatrix4 ||
        s.isVector2 ||
        s.isVector3 ||
        s.isVector4 ||
        s.isTexture ||
        s.isQuaternion)
        ? s.isRenderTargetTexture
          ? (Ee('UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().'),
            (e[t][n] = null))
          : (e[t][n] = s.clone())
        : Array.isArray(s)
          ? (e[t][n] = s.slice())
          : (e[t][n] = s);
    }
  }
  return e;
}
function At(i) {
  const e = {};
  for (let t = 0; t < i.length; t++) {
    const n = ri(i[t]);
    for (const s in n) e[s] = n[s];
  }
  return e;
}
function _u(i) {
  const e = [];
  for (let t = 0; t < i.length; t++) e.push(i[t].clone());
  return e;
}
function _l(i) {
  const e = i.getRenderTarget();
  return e === null ? i.outputColorSpace : e.isXRRenderTarget === !0 ? e.texture.colorSpace : Ge.workingColorSpace;
}
var hh = { clone: ri, merge: At },
  xu = `void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
  vu = `void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,
  Ft = class extends qt {
    constructor(e) {
      super(),
        (this.isShaderMaterial = !0),
        (this.type = 'ShaderMaterial'),
        (this.defines = {}),
        (this.uniforms = {}),
        (this.uniformsGroups = []),
        (this.vertexShader = xu),
        (this.fragmentShader = vu),
        (this.linewidth = 1),
        (this.wireframe = !1),
        (this.wireframeLinewidth = 1),
        (this.fog = !1),
        (this.lights = !1),
        (this.clipping = !1),
        (this.forceSinglePass = !0),
        (this.extensions = { clipCullDistance: !1, multiDraw: !1 }),
        (this.defaultAttributeValues = { color: [1, 1, 1], uv: [0, 0], uv1: [0, 0] }),
        (this.index0AttributeName = void 0),
        (this.uniformsNeedUpdate = !1),
        (this.glslVersion = null),
        e !== void 0 && this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        (this.fragmentShader = e.fragmentShader),
        (this.vertexShader = e.vertexShader),
        (this.uniforms = ri(e.uniforms)),
        (this.uniformsGroups = _u(e.uniformsGroups)),
        (this.defines = Object.assign({}, e.defines)),
        (this.wireframe = e.wireframe),
        (this.wireframeLinewidth = e.wireframeLinewidth),
        (this.fog = e.fog),
        (this.lights = e.lights),
        (this.clipping = e.clipping),
        (this.extensions = Object.assign({}, e.extensions)),
        (this.glslVersion = e.glslVersion),
        (this.defaultAttributeValues = Object.assign({}, e.defaultAttributeValues)),
        (this.index0AttributeName = e.index0AttributeName),
        (this.uniformsNeedUpdate = e.uniformsNeedUpdate),
        this
      );
    }
    toJSON(e) {
      const t = super.toJSON(e);
      (t.glslVersion = this.glslVersion), (t.uniforms = {});
      for (const s in this.uniforms) {
        const a = this.uniforms[s].value;
        a?.isTexture
          ? (t.uniforms[s] = { type: 't', value: a.toJSON(e).uuid })
          : a?.isColor
            ? (t.uniforms[s] = { type: 'c', value: a.getHex() })
            : a?.isVector2
              ? (t.uniforms[s] = { type: 'v2', value: a.toArray() })
              : a?.isVector3
                ? (t.uniforms[s] = { type: 'v3', value: a.toArray() })
                : a?.isVector4
                  ? (t.uniforms[s] = { type: 'v4', value: a.toArray() })
                  : a?.isMatrix3
                    ? (t.uniforms[s] = { type: 'm3', value: a.toArray() })
                    : a?.isMatrix4
                      ? (t.uniforms[s] = { type: 'm4', value: a.toArray() })
                      : (t.uniforms[s] = { value: a });
      }
      Object.keys(this.defines).length > 0 && (t.defines = this.defines),
        (t.vertexShader = this.vertexShader),
        (t.fragmentShader = this.fragmentShader),
        (t.lights = this.lights),
        (t.clipping = this.clipping);
      const n = {};
      for (const s in this.extensions) this.extensions[s] === !0 && (n[s] = !0);
      return Object.keys(n).length > 0 && (t.extensions = n), t;
    }
  },
  wr = class extends Ft {
    constructor(e) {
      super(e), (this.isRawShaderMaterial = !0), (this.type = 'RawShaderMaterial');
    }
  },
  ko = class extends qt {
    constructor(e) {
      super(),
        (this.isMeshStandardMaterial = !0),
        (this.type = 'MeshStandardMaterial'),
        (this.defines = { STANDARD: '' }),
        (this.color = new Ve(16777215)),
        (this.roughness = 1),
        (this.metalness = 0),
        (this.map = null),
        (this.lightMap = null),
        (this.lightMapIntensity = 1),
        (this.aoMap = null),
        (this.aoMapIntensity = 1),
        (this.emissive = new Ve(0)),
        (this.emissiveIntensity = 1),
        (this.emissiveMap = null),
        (this.bumpMap = null),
        (this.bumpScale = 1),
        (this.normalMap = null),
        (this.normalMapType = ml),
        (this.normalScale = new Re(1, 1)),
        (this.displacementMap = null),
        (this.displacementScale = 1),
        (this.displacementBias = 0),
        (this.roughnessMap = null),
        (this.metalnessMap = null),
        (this.alphaMap = null),
        (this.envMap = null),
        (this.envMapRotation = new Dn()),
        (this.envMapIntensity = 1),
        (this.wireframe = !1),
        (this.wireframeLinewidth = 1),
        (this.wireframeLinecap = 'round'),
        (this.wireframeLinejoin = 'round'),
        (this.flatShading = !1),
        (this.fog = !0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        (this.defines = { STANDARD: '' }),
        this.color.copy(e.color),
        (this.roughness = e.roughness),
        (this.metalness = e.metalness),
        (this.map = e.map),
        (this.lightMap = e.lightMap),
        (this.lightMapIntensity = e.lightMapIntensity),
        (this.aoMap = e.aoMap),
        (this.aoMapIntensity = e.aoMapIntensity),
        this.emissive.copy(e.emissive),
        (this.emissiveMap = e.emissiveMap),
        (this.emissiveIntensity = e.emissiveIntensity),
        (this.bumpMap = e.bumpMap),
        (this.bumpScale = e.bumpScale),
        (this.normalMap = e.normalMap),
        (this.normalMapType = e.normalMapType),
        this.normalScale.copy(e.normalScale),
        (this.displacementMap = e.displacementMap),
        (this.displacementScale = e.displacementScale),
        (this.displacementBias = e.displacementBias),
        (this.roughnessMap = e.roughnessMap),
        (this.metalnessMap = e.metalnessMap),
        (this.alphaMap = e.alphaMap),
        (this.envMap = e.envMap),
        this.envMapRotation.copy(e.envMapRotation),
        (this.envMapIntensity = e.envMapIntensity),
        (this.wireframe = e.wireframe),
        (this.wireframeLinewidth = e.wireframeLinewidth),
        (this.wireframeLinecap = e.wireframeLinecap),
        (this.wireframeLinejoin = e.wireframeLinejoin),
        (this.flatShading = e.flatShading),
        (this.fog = e.fog),
        this
      );
    }
  };
var Cr = class extends qt {
    constructor(e) {
      super(),
        (this.isMeshDepthMaterial = !0),
        (this.type = 'MeshDepthMaterial'),
        (this.depthPacking = $c),
        (this.map = null),
        (this.alphaMap = null),
        (this.displacementMap = null),
        (this.displacementScale = 1),
        (this.displacementBias = 0),
        (this.wireframe = !1),
        (this.wireframeLinewidth = 1),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        (this.depthPacking = e.depthPacking),
        (this.map = e.map),
        (this.alphaMap = e.alphaMap),
        (this.displacementMap = e.displacementMap),
        (this.displacementScale = e.displacementScale),
        (this.displacementBias = e.displacementBias),
        (this.wireframe = e.wireframe),
        (this.wireframeLinewidth = e.wireframeLinewidth),
        this
      );
    }
  },
  Rr = class extends qt {
    constructor(e) {
      super(),
        (this.isMeshDistanceMaterial = !0),
        (this.type = 'MeshDistanceMaterial'),
        (this.map = null),
        (this.alphaMap = null),
        (this.displacementMap = null),
        (this.displacementScale = 1),
        (this.displacementBias = 0),
        this.setValues(e);
    }
    copy(e) {
      return (
        super.copy(e),
        (this.map = e.map),
        (this.alphaMap = e.alphaMap),
        (this.displacementMap = e.displacementMap),
        (this.displacementScale = e.displacementScale),
        (this.displacementBias = e.displacementBias),
        this
      );
    }
  };
function $s(i, e) {
  return !i || i.constructor === e
    ? i
    : typeof e.BYTES_PER_ELEMENT === 'number'
      ? new e(i)
      : Array.prototype.slice.call(i);
}
var On = class {
    constructor(e, t, n, s) {
      (this.parameterPositions = e),
        (this._cachedIndex = 0),
        (this.resultBuffer = s !== void 0 ? s : new t.constructor(n)),
        (this.sampleValues = t),
        (this.valueSize = n),
        (this.settings = null),
        (this.DefaultSettings_ = {});
    }
    evaluate(e) {
      let t = this.parameterPositions,
        n = this._cachedIndex,
        s = t[n],
        r = t[n - 1];
      n: {
        e: {
          let a;
          t: {
            i: if (!(e < s)) {
              for (let o = n + 2; ; ) {
                if (s === void 0) {
                  if (e < r) break i;
                  return (n = t.length), (this._cachedIndex = n), this.copySampleValue_(n - 1);
                }
                if (n === o) break;
                if (((r = s), (s = t[++n]), e < s)) break e;
              }
              a = t.length;
              break t;
            }
            if (!(e >= r)) {
              const o = t[1];
              e < o && ((n = 2), (r = o));
              for (let c = n - 2; ; ) {
                if (r === void 0) return (this._cachedIndex = 0), this.copySampleValue_(0);
                if (n === c) break;
                if (((s = r), (r = t[--n - 1]), e >= r)) break e;
              }
              (a = n), (n = 0);
              break t;
            }
            break n;
          }
          for (; n < a; ) {
            const o = (n + a) >>> 1;
            e < t[o] ? (a = o) : (n = o + 1);
          }
          if (((s = t[n]), (r = t[n - 1]), r === void 0)) return (this._cachedIndex = 0), this.copySampleValue_(0);
          if (s === void 0) return (n = t.length), (this._cachedIndex = n), this.copySampleValue_(n - 1);
        }
        (this._cachedIndex = n), this.intervalChanged_(n, r, s);
      }
      return this.interpolate_(n, r, e, s);
    }
    getSettings_() {
      return this.settings || this.DefaultSettings_;
    }
    copySampleValue_(e) {
      const t = this.resultBuffer,
        n = this.sampleValues,
        s = this.valueSize,
        r = e * s;
      for (let a = 0; a !== s; ++a) t[a] = n[r + a];
      return t;
    }
    interpolate_() {
      throw new Error('call to abstract method');
    }
    intervalChanged_() {}
  },
  Ir = class extends On {
    constructor(e, t, n, s) {
      super(e, t, n, s),
        (this._weightPrev = -0),
        (this._offsetPrev = -0),
        (this._weightNext = -0),
        (this._offsetNext = -0),
        (this.DefaultSettings_ = { endingStart: So, endingEnd: So });
    }
    intervalChanged_(e, t, n) {
      let s = this.parameterPositions,
        r = e - 2,
        a = e + 1,
        o = s[r],
        c = s[a];
      if (o === void 0)
        switch (this.getSettings_().endingStart) {
          case bo:
            (r = e), (o = 2 * t - n);
            break;
          case To:
            (r = s.length - 2), (o = t + s[r] - s[r + 1]);
            break;
          default:
            (r = e), (o = n);
        }
      if (c === void 0)
        switch (this.getSettings_().endingEnd) {
          case bo:
            (a = e), (c = 2 * n - t);
            break;
          case To:
            (a = 1), (c = n + s[1] - s[0]);
            break;
          default:
            (a = e - 1), (c = t);
        }
      const l = (n - t) * 0.5,
        d = this.valueSize;
      (this._weightPrev = l / (t - o)),
        (this._weightNext = l / (c - n)),
        (this._offsetPrev = r * d),
        (this._offsetNext = a * d);
    }
    interpolate_(e, t, n, s) {
      const r = this.resultBuffer,
        a = this.sampleValues,
        o = this.valueSize,
        c = e * o,
        l = c - o,
        d = this._offsetPrev,
        m = this._offsetNext,
        h = this._weightPrev,
        f = this._weightNext,
        g = (n - t) / (s - t),
        y = g * g,
        p = y * g,
        u = -h * p + 2 * h * y - h * g,
        v = (1 + h) * p + (-1.5 - 2 * h) * y + (-0.5 + h) * g + 1,
        T = (-1 - f) * p + (1.5 + f) * y + 0.5 * g,
        S = f * p - f * y;
      for (let w = 0; w !== o; ++w) r[w] = u * a[d + w] + v * a[l + w] + T * a[c + w] + S * a[m + w];
      return r;
    }
  },
  Pr = class extends On {
    interpolate_(e, t, n, s) {
      const r = this.resultBuffer,
        a = this.sampleValues,
        o = this.valueSize,
        c = e * o,
        l = c - o,
        d = (n - t) / (s - t),
        m = 1 - d;
      for (let h = 0; h !== o; ++h) r[h] = a[l + h] * m + a[c + h] * d;
      return r;
    }
  },
  Lr = class extends On {
    interpolate_(e) {
      return this.copySampleValue_(e - 1);
    }
  },
  Dr = class extends On {
    interpolate_(e, t, n, s) {
      const r = this.resultBuffer,
        a = this.sampleValues,
        o = this.valueSize,
        c = e * o,
        l = c - o,
        d = this.settings || this.DefaultSettings_,
        m = d.inTangents,
        h = d.outTangents;
      if (!m || !h) {
        const y = (n - t) / (s - t),
          p = 1 - y;
        for (let u = 0; u !== o; ++u) r[u] = a[l + u] * p + a[c + u] * y;
        return r;
      }
      const f = o * 2,
        g = e - 1;
      for (let y = 0; y !== o; ++y) {
        let p = a[l + y],
          u = a[c + y],
          v = g * f + y * 2,
          T = h[v],
          S = h[v + 1],
          w = e * f + y * 2,
          E = m[w],
          R = m[w + 1],
          x = (n - t) / (s - t),
          b,
          k,
          C,
          N,
          O;
        for (let W = 0; W < 8; W++) {
          (b = x * x), (k = b * x), (C = 1 - x), (N = C * C), (O = N * C);
          const G = O * t + 3 * N * x * T + 3 * C * b * E + k * s - n;
          if (Math.abs(G) < 1e-10) break;
          const F = 3 * N * (T - t) + 6 * C * x * (E - T) + 3 * b * (s - E);
          if (Math.abs(F) < 1e-10) break;
          (x = x - G / F), (x = Math.max(0, Math.min(1, x)));
        }
        r[y] = O * p + 3 * N * x * S + 3 * C * b * R + k * u;
      }
      return r;
    }
  },
  Ot = class {
    constructor(e, t, n, s) {
      if (e === void 0) throw new Error('THREE.KeyframeTrack: track name is undefined');
      if (t === void 0 || t.length === 0) throw new Error(`THREE.KeyframeTrack: no keyframes in track named ${e}`);
      (this.name = e),
        (this.times = $s(t, this.TimeBufferType)),
        (this.values = $s(n, this.ValueBufferType)),
        this.setInterpolation(s || this.DefaultInterpolation);
    }
    static toJSON(e) {
      let t = e.constructor,
        n;
      if (t.toJSON !== this.toJSON) n = t.toJSON(e);
      else {
        n = { name: e.name, times: $s(e.times, Array), values: $s(e.values, Array) };
        const s = e.getInterpolation();
        s !== e.DefaultInterpolation && (n.interpolation = s);
      }
      return (n.type = e.ValueTypeName), n;
    }
    InterpolantFactoryMethodDiscrete(e) {
      return new Lr(this.times, this.values, this.getValueSize(), e);
    }
    InterpolantFactoryMethodLinear(e) {
      return new Pr(this.times, this.values, this.getValueSize(), e);
    }
    InterpolantFactoryMethodSmooth(e) {
      return new Ir(this.times, this.values, this.getValueSize(), e);
    }
    InterpolantFactoryMethodBezier(e) {
      const t = new Dr(this.times, this.values, this.getValueSize(), e);
      return this.settings && (t.settings = this.settings), t;
    }
    setInterpolation(e) {
      let t;
      switch (e) {
        case $i:
          t = this.InterpolantFactoryMethodDiscrete;
          break;
        case ur:
          t = this.InterpolantFactoryMethodLinear;
          break;
        case js:
          t = this.InterpolantFactoryMethodSmooth;
          break;
        case Mo:
          t = this.InterpolantFactoryMethodBezier;
          break;
      }
      if (t === void 0) {
        const n = `unsupported interpolation for ${this.ValueTypeName} keyframe track named ${this.name}`;
        if (this.createInterpolant === void 0)
          if (e !== this.DefaultInterpolation) this.setInterpolation(this.DefaultInterpolation);
          else throw new Error(n);
        return Ee('KeyframeTrack:', n), this;
      }
      return (this.createInterpolant = t), this;
    }
    getInterpolation() {
      switch (this.createInterpolant) {
        case this.InterpolantFactoryMethodDiscrete:
          return $i;
        case this.InterpolantFactoryMethodLinear:
          return ur;
        case this.InterpolantFactoryMethodSmooth:
          return js;
        case this.InterpolantFactoryMethodBezier:
          return Mo;
      }
    }
    getValueSize() {
      return this.values.length / this.times.length;
    }
    shift(e) {
      if (e !== 0) {
        const t = this.times;
        for (let n = 0, s = t.length; n !== s; ++n) t[n] += e;
      }
      return this;
    }
    scale(e) {
      if (e !== 1) {
        const t = this.times;
        for (let n = 0, s = t.length; n !== s; ++n) t[n] *= e;
      }
      return this;
    }
    trim(e, t) {
      let n = this.times,
        s = n.length,
        r = 0,
        a = s - 1;
      for (; r !== s && n[r] < e; ) ++r;
      for (; a !== -1 && n[a] > t; ) --a;
      if ((++a, r !== 0 || a !== s)) {
        r >= a && ((a = Math.max(a, 1)), (r = a - 1));
        const o = this.getValueSize();
        (this.times = n.slice(r, a)), (this.values = this.values.slice(r * o, a * o));
      }
      return this;
    }
    validate() {
      let e = !0,
        t = this.getValueSize();
      t - Math.floor(t) !== 0 && (Ae('KeyframeTrack: Invalid value size in track.', this), (e = !1));
      const n = this.times,
        s = this.values,
        r = n.length;
      r === 0 && (Ae('KeyframeTrack: Track is empty.', this), (e = !1));
      let a = null;
      for (let o = 0; o !== r; o++) {
        const c = n[o];
        if (typeof c === 'number' && Number.isNaN(c)) {
          Ae('KeyframeTrack: Time is not a valid number.', this, o, c), (e = !1);
          break;
        }
        if (a !== null && a > c) {
          Ae('KeyframeTrack: Out of order keys.', this, o, c, a), (e = !1);
          break;
        }
        a = c;
      }
      if (s !== void 0 && Zh(s))
        for (let o = 0, c = s.length; o !== c; ++o) {
          const l = s[o];
          if (Number.isNaN(l)) {
            Ae('KeyframeTrack: Value is not a valid number.', this, o, l), (e = !1);
            break;
          }
        }
      return e;
    }
    optimize() {
      let e = this.times.slice(),
        t = this.values.slice(),
        n = this.getValueSize(),
        s = this.getInterpolation() === js,
        r = e.length - 1,
        a = 1;
      for (let o = 1; o < r; ++o) {
        let c = !1,
          l = e[o],
          d = e[o + 1];
        if (l !== d && (o !== 1 || l !== e[0]))
          if (s) c = !0;
          else {
            const m = o * n,
              h = m - n,
              f = m + n;
            for (let g = 0; g !== n; ++g) {
              const y = t[m + g];
              if (y !== t[h + g] || y !== t[f + g]) {
                c = !0;
                break;
              }
            }
          }
        if (c) {
          if (o !== a) {
            e[a] = e[o];
            const m = o * n,
              h = a * n;
            for (let f = 0; f !== n; ++f) t[h + f] = t[m + f];
          }
          ++a;
        }
      }
      if (r > 0) {
        e[a] = e[r];
        for (let o = r * n, c = a * n, l = 0; l !== n; ++l) t[c + l] = t[o + l];
        ++a;
      }
      return (
        a !== e.length
          ? ((this.times = e.slice(0, a)), (this.values = t.slice(0, a * n)))
          : ((this.times = e), (this.values = t)),
        this
      );
    }
    clone() {
      const e = this.times.slice(),
        t = this.values.slice(),
        n = this.constructor,
        s = new n(this.name, e, t);
      return (s.createInterpolant = this.createInterpolant), s;
    }
  };
Ot.prototype.ValueTypeName = '';
Ot.prototype.TimeBufferType = Float32Array;
Ot.prototype.ValueBufferType = Float32Array;
Ot.prototype.DefaultInterpolation = ur;
var Bn = class extends Ot {};
Bn.prototype.ValueTypeName = 'bool';
Bn.prototype.ValueBufferType = Array;
Bn.prototype.DefaultInterpolation = $i;
Bn.prototype.InterpolantFactoryMethodLinear = void 0;
Bn.prototype.InterpolantFactoryMethodSmooth = void 0;
var Ur = class extends Ot {};
Ur.prototype.ValueTypeName = 'color';
var Nr = class extends Ot {};
Nr.prototype.ValueTypeName = 'number';
var Fr = class extends On {
    interpolate_(e, t, n, s) {
      let r = this.resultBuffer,
        a = this.sampleValues,
        o = this.valueSize,
        c = (n - t) / (s - t),
        l = e * o;
      for (let d = l + o; l !== d; l += 4) sn.slerpFlat(r, 0, a, l - o, a, l, c);
      return r;
    }
  },
  cs = class extends Ot {
    InterpolantFactoryMethodLinear(e) {
      return new Fr(this.times, this.values, this.getValueSize(), e);
    }
  };
cs.prototype.ValueTypeName = 'quaternion';
cs.prototype.InterpolantFactoryMethodSmooth = void 0;
var zn = class extends Ot {};
zn.prototype.ValueTypeName = 'string';
zn.prototype.ValueBufferType = Array;
zn.prototype.DefaultInterpolation = $i;
zn.prototype.InterpolantFactoryMethodLinear = void 0;
zn.prototype.InterpolantFactoryMethodSmooth = void 0;
var Or = class extends Ot {};
Or.prototype.ValueTypeName = 'vector';
var hs = class extends $t {
  constructor(e, t = 1) {
    super(), (this.isLight = !0), (this.type = 'Light'), (this.color = new Ve(e)), (this.intensity = t);
  }
  dispose() {
    this.dispatchEvent({ type: 'dispose' });
  }
  copy(e, t) {
    return super.copy(e, t), this.color.copy(e.color), (this.intensity = e.intensity), this;
  }
  toJSON(e) {
    const t = super.toJSON(e);
    return (t.object.color = this.color.getHex()), (t.object.intensity = this.intensity), t;
  }
};
var vo = new tt(),
  yc = new L(),
  Mc = new L(),
  Go = class {
    constructor(e) {
      (this.camera = e),
        (this.intensity = 1),
        (this.bias = 0),
        (this.biasNode = null),
        (this.normalBias = 0),
        (this.radius = 1),
        (this.blurSamples = 8),
        (this.mapSize = new Re(512, 512)),
        (this.mapType = It),
        (this.map = null),
        (this.mapPass = null),
        (this.matrix = new tt()),
        (this.autoUpdate = !0),
        (this.needsUpdate = !1),
        (this._frustum = new Di()),
        (this._frameExtents = new Re(1, 1)),
        (this._viewportCount = 1),
        (this._viewports = [new at(0, 0, 1, 1)]);
    }
    getViewportCount() {
      return this._viewportCount;
    }
    getFrustum() {
      return this._frustum;
    }
    updateMatrices(e) {
      const t = this.camera,
        n = this.matrix;
      yc.setFromMatrixPosition(e.matrixWorld),
        t.position.copy(yc),
        Mc.setFromMatrixPosition(e.target.matrixWorld),
        t.lookAt(Mc),
        t.updateMatrixWorld(),
        vo.multiplyMatrices(t.projectionMatrix, t.matrixWorldInverse),
        this._frustum.setFromProjectionMatrix(vo, t.coordinateSystem, t.reversedDepth),
        t.coordinateSystem === Ci || t.reversedDepth
          ? n.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1)
          : n.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1),
        n.multiply(vo);
    }
    getViewport(e) {
      return this._viewports[e];
    }
    getFrameExtents() {
      return this._frameExtents;
    }
    dispose() {
      this.map?.dispose(), this.mapPass?.dispose();
    }
    copy(e) {
      return (
        (this.camera = e.camera.clone()),
        (this.intensity = e.intensity),
        (this.bias = e.bias),
        (this.radius = e.radius),
        (this.autoUpdate = e.autoUpdate),
        (this.needsUpdate = e.needsUpdate),
        (this.normalBias = e.normalBias),
        (this.blurSamples = e.blurSamples),
        this.mapSize.copy(e.mapSize),
        (this.biasNode = e.biasNode),
        this
      );
    }
    clone() {
      return new this.constructor().copy(this);
    }
    toJSON() {
      const e = {};
      return (
        this.intensity !== 1 && (e.intensity = this.intensity),
        this.bias !== 0 && (e.bias = this.bias),
        this.normalBias !== 0 && (e.normalBias = this.normalBias),
        this.radius !== 1 && (e.radius = this.radius),
        (this.mapSize.x !== 512 || this.mapSize.y !== 512) && (e.mapSize = this.mapSize.toArray()),
        (e.camera = this.camera.toJSON(!1).object),
        delete e.camera.matrix,
        e
      );
    }
  },
  Ks = new L(),
  Qs = new sn(),
  Qt = new L(),
  us = class extends $t {
    constructor() {
      super(),
        (this.isCamera = !0),
        (this.type = 'Camera'),
        (this.matrixWorldInverse = new tt()),
        (this.projectionMatrix = new tt()),
        (this.projectionMatrixInverse = new tt()),
        (this.coordinateSystem = Xt),
        (this._reversedDepth = !1);
    }
    get reversedDepth() {
      return this._reversedDepth;
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        this.matrixWorldInverse.copy(e.matrixWorldInverse),
        this.projectionMatrix.copy(e.projectionMatrix),
        this.projectionMatrixInverse.copy(e.projectionMatrixInverse),
        (this.coordinateSystem = e.coordinateSystem),
        this
      );
    }
    getWorldDirection(e) {
      return super.getWorldDirection(e).negate();
    }
    updateMatrixWorld(e) {
      super.updateMatrixWorld(e),
        this.matrixWorld.decompose(Ks, Qs, Qt),
        Qt.x === 1 && Qt.y === 1 && Qt.z === 1
          ? this.matrixWorldInverse.copy(this.matrixWorld).invert()
          : this.matrixWorldInverse.compose(Ks, Qs, Qt.set(1, 1, 1)).invert();
    }
    updateWorldMatrix(e, t) {
      super.updateWorldMatrix(e, t),
        this.matrixWorld.decompose(Ks, Qs, Qt),
        Qt.x === 1 && Qt.y === 1 && Qt.z === 1
          ? this.matrixWorldInverse.copy(this.matrixWorld).invert()
          : this.matrixWorldInverse.compose(Ks, Qs, Qt.set(1, 1, 1)).invert();
    }
    clone() {
      return new this.constructor().copy(this);
    }
  },
  In = new L(),
  Sc = new Re(),
  bc = new Re(),
  wt = class extends us {
    constructor(e = 50, t = 1, n = 0.1, s = 2e3) {
      super(),
        (this.isPerspectiveCamera = !0),
        (this.type = 'PerspectiveCamera'),
        (this.fov = e),
        (this.zoom = 1),
        (this.near = n),
        (this.far = s),
        (this.focus = 10),
        (this.aspect = t),
        (this.view = null),
        (this.filmGauge = 35),
        (this.filmOffset = 0),
        this.updateProjectionMatrix();
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        (this.fov = e.fov),
        (this.zoom = e.zoom),
        (this.near = e.near),
        (this.far = e.far),
        (this.focus = e.focus),
        (this.aspect = e.aspect),
        (this.view = e.view === null ? null : Object.assign({}, e.view)),
        (this.filmGauge = e.filmGauge),
        (this.filmOffset = e.filmOffset),
        this
      );
    }
    setFocalLength(e) {
      const t = (0.5 * this.getFilmHeight()) / e;
      (this.fov = fr * 2 * Math.atan(t)), this.updateProjectionMatrix();
    }
    getFocalLength() {
      const e = Math.tan(qa * 0.5 * this.fov);
      return (0.5 * this.getFilmHeight()) / e;
    }
    getEffectiveFOV() {
      return fr * 2 * Math.atan(Math.tan(qa * 0.5 * this.fov) / this.zoom);
    }
    getFilmWidth() {
      return this.filmGauge * Math.min(this.aspect, 1);
    }
    getFilmHeight() {
      return this.filmGauge / Math.max(this.aspect, 1);
    }
    getViewBounds(e, t, n) {
      In.set(-1, -1, 0.5).applyMatrix4(this.projectionMatrixInverse),
        t.set(In.x, In.y).multiplyScalar(-e / In.z),
        In.set(1, 1, 0.5).applyMatrix4(this.projectionMatrixInverse),
        n.set(In.x, In.y).multiplyScalar(-e / In.z);
    }
    getViewSize(e, t) {
      return this.getViewBounds(e, Sc, bc), t.subVectors(bc, Sc);
    }
    setViewOffset(e, t, n, s, r, a) {
      (this.aspect = e / t),
        this.view === null &&
          (this.view = { enabled: !0, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 }),
        (this.view.enabled = !0),
        (this.view.fullWidth = e),
        (this.view.fullHeight = t),
        (this.view.offsetX = n),
        (this.view.offsetY = s),
        (this.view.width = r),
        (this.view.height = a),
        this.updateProjectionMatrix();
    }
    clearViewOffset() {
      this.view !== null && (this.view.enabled = !1), this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
      let e = this.near,
        t = (e * Math.tan(qa * 0.5 * this.fov)) / this.zoom,
        n = 2 * t,
        s = this.aspect * n,
        r = -0.5 * s,
        a = this.view;
      if (this.view?.enabled) {
        const c = a.fullWidth,
          l = a.fullHeight;
        (r += (a.offsetX * s) / c), (t -= (a.offsetY * n) / l), (s *= a.width / c), (n *= a.height / l);
      }
      const o = this.filmOffset;
      o !== 0 && (r += (e * o) / this.getFilmWidth()),
        this.projectionMatrix.makePerspective(
          r,
          r + s,
          t,
          t - n,
          e,
          this.far,
          this.coordinateSystem,
          this.reversedDepth,
        ),
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
    toJSON(e) {
      const t = super.toJSON(e);
      return (
        (t.object.fov = this.fov),
        (t.object.zoom = this.zoom),
        (t.object.near = this.near),
        (t.object.far = this.far),
        (t.object.focus = this.focus),
        (t.object.aspect = this.aspect),
        this.view !== null && (t.object.view = Object.assign({}, this.view)),
        (t.object.filmGauge = this.filmGauge),
        (t.object.filmOffset = this.filmOffset),
        t
      );
    }
  };
var Ho = class extends Go {
    constructor() {
      super(new wt(90, 1, 0.5, 500)), (this.isPointLightShadow = !0);
    }
  },
  Wo = class extends hs {
    constructor(e, t, n = 0, s = 2) {
      super(e, t),
        (this.isPointLight = !0),
        (this.type = 'PointLight'),
        (this.distance = n),
        (this.decay = s),
        (this.shadow = new Ho());
    }
    get power() {
      return this.intensity * 4 * Math.PI;
    }
    set power(e) {
      this.intensity = e / (4 * Math.PI);
    }
    dispose() {
      super.dispose(), this.shadow.dispose();
    }
    copy(e, t) {
      return (
        super.copy(e, t), (this.distance = e.distance), (this.decay = e.decay), (this.shadow = e.shadow.clone()), this
      );
    }
    toJSON(e) {
      const t = super.toJSON(e);
      return (
        (t.object.distance = this.distance), (t.object.decay = this.decay), (t.object.shadow = this.shadow.toJSON()), t
      );
    }
  },
  ds = class extends us {
    constructor(e = -1, t = 1, n = 1, s = -1, r = 0.1, a = 2e3) {
      super(),
        (this.isOrthographicCamera = !0),
        (this.type = 'OrthographicCamera'),
        (this.zoom = 1),
        (this.view = null),
        (this.left = e),
        (this.right = t),
        (this.top = n),
        (this.bottom = s),
        (this.near = r),
        (this.far = a),
        this.updateProjectionMatrix();
    }
    copy(e, t) {
      return (
        super.copy(e, t),
        (this.left = e.left),
        (this.right = e.right),
        (this.top = e.top),
        (this.bottom = e.bottom),
        (this.near = e.near),
        (this.far = e.far),
        (this.zoom = e.zoom),
        (this.view = e.view === null ? null : Object.assign({}, e.view)),
        this
      );
    }
    setViewOffset(e, t, n, s, r, a) {
      this.view === null &&
        (this.view = { enabled: !0, fullWidth: 1, fullHeight: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 }),
        (this.view.enabled = !0),
        (this.view.fullWidth = e),
        (this.view.fullHeight = t),
        (this.view.offsetX = n),
        (this.view.offsetY = s),
        (this.view.width = r),
        (this.view.height = a),
        this.updateProjectionMatrix();
    }
    clearViewOffset() {
      this.view !== null && (this.view.enabled = !1), this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
      let e = (this.right - this.left) / (2 * this.zoom),
        t = (this.top - this.bottom) / (2 * this.zoom),
        n = (this.right + this.left) / 2,
        s = (this.top + this.bottom) / 2,
        r = n - e,
        a = n + e,
        o = s + t,
        c = s - t;
      if (this.view?.enabled) {
        const l = (this.right - this.left) / this.view.fullWidth / this.zoom,
          d = (this.top - this.bottom) / this.view.fullHeight / this.zoom;
        (r += l * this.view.offsetX),
          (a = r + l * this.view.width),
          (o -= d * this.view.offsetY),
          (c = o - d * this.view.height);
      }
      this.projectionMatrix.makeOrthographic(
        r,
        a,
        o,
        c,
        this.near,
        this.far,
        this.coordinateSystem,
        this.reversedDepth,
      ),
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
    toJSON(e) {
      const t = super.toJSON(e);
      return (
        (t.object.zoom = this.zoom),
        (t.object.left = this.left),
        (t.object.right = this.right),
        (t.object.top = this.top),
        (t.object.bottom = this.bottom),
        (t.object.near = this.near),
        (t.object.far = this.far),
        this.view !== null && (t.object.view = Object.assign({}, this.view)),
        t
      );
    }
  };
var Xo = class extends hs {
  constructor(e, t) {
    super(e, t), (this.isAmbientLight = !0), (this.type = 'AmbientLight');
  }
};
var Ai = -90,
  Ei = 1,
  Br = class extends $t {
    constructor(e, t, n) {
      super(),
        (this.type = 'CubeCamera'),
        (this.renderTarget = n),
        (this.coordinateSystem = null),
        (this.activeMipmapLevel = 0);
      const s = new wt(Ai, Ei, e, t);
      (s.layers = this.layers), this.add(s);
      const r = new wt(Ai, Ei, e, t);
      (r.layers = this.layers), this.add(r);
      const a = new wt(Ai, Ei, e, t);
      (a.layers = this.layers), this.add(a);
      const o = new wt(Ai, Ei, e, t);
      (o.layers = this.layers), this.add(o);
      const c = new wt(Ai, Ei, e, t);
      (c.layers = this.layers), this.add(c);
      const l = new wt(Ai, Ei, e, t);
      (l.layers = this.layers), this.add(l);
    }
    updateCoordinateSystem() {
      const e = this.coordinateSystem,
        t = this.children.concat(),
        [n, s, r, a, o, c] = t;
      for (const l of t) this.remove(l);
      if (e === Xt)
        n.up.set(0, 1, 0),
          n.lookAt(1, 0, 0),
          s.up.set(0, 1, 0),
          s.lookAt(-1, 0, 0),
          r.up.set(0, 0, -1),
          r.lookAt(0, 1, 0),
          a.up.set(0, 0, 1),
          a.lookAt(0, -1, 0),
          o.up.set(0, 1, 0),
          o.lookAt(0, 0, 1),
          c.up.set(0, 1, 0),
          c.lookAt(0, 0, -1);
      else if (e === Ci)
        n.up.set(0, -1, 0),
          n.lookAt(-1, 0, 0),
          s.up.set(0, -1, 0),
          s.lookAt(1, 0, 0),
          r.up.set(0, 0, 1),
          r.lookAt(0, 1, 0),
          a.up.set(0, 0, -1),
          a.lookAt(0, -1, 0),
          o.up.set(0, -1, 0),
          o.lookAt(0, 0, 1),
          c.up.set(0, -1, 0),
          c.lookAt(0, 0, -1);
      else throw new Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: ${e}`);
      for (const l of t) this.add(l), l.updateMatrixWorld();
    }
    update(e, t) {
      this.parent === null && this.updateMatrixWorld();
      const { renderTarget: n, activeMipmapLevel: s } = this;
      this.coordinateSystem !== e.coordinateSystem &&
        ((this.coordinateSystem = e.coordinateSystem), this.updateCoordinateSystem());
      const [r, a, o, c, l, d] = this.children,
        m = e.getRenderTarget(),
        h = e.getActiveCubeFace(),
        f = e.getActiveMipmapLevel(),
        g = e.xr.enabled;
      e.xr.enabled = !1;
      const y = n.texture.generateMipmaps;
      n.texture.generateMipmaps = !1;
      let p = !1;
      e.isWebGLRenderer === !0 ? (p = e.state.buffers.depth.getReversed()) : (p = e.reversedDepthBuffer),
        e.setRenderTarget(n, 0, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, r),
        e.setRenderTarget(n, 1, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, a),
        e.setRenderTarget(n, 2, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, o),
        e.setRenderTarget(n, 3, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, c),
        e.setRenderTarget(n, 4, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, l),
        (n.texture.generateMipmaps = y),
        e.setRenderTarget(n, 5, s),
        p && e.autoClear === !1 && e.clearDepth(),
        e.render(t, d),
        e.setRenderTarget(m, h, f),
        (e.xr.enabled = g),
        (n.texture.needsPMREMUpdate = !0);
    }
  },
  zr = class extends wt {
    constructor(e = []) {
      super(), (this.isArrayCamera = !0), (this.isMultiViewCamera = !1), (this.cameras = e);
    }
  };
var xl = '\\[\\]\\.:\\/',
  yu = new RegExp(`[${xl}]`, 'g'),
  vl = `[^${xl}]`,
  Mu = `[^${xl.replace('\\.', '')}]`,
  Su = /((?:WC+[/:])*)/.source.replace('WC', vl),
  bu = /(WCOD+)?/.source.replace('WCOD', Mu),
  Tu = /(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace('WC', vl),
  Au = /\.(WC+)(?:\[(.+)\])?/.source.replace('WC', vl),
  Eu = new RegExp(`^${Su}${bu}${Tu}${Au}$`),
  wu = ['material', 'materials', 'bones', 'map'],
  qo = class {
    constructor(e, t, n) {
      const s = n || lt.parseTrackName(t);
      (this._targetGroup = e), (this._bindings = e.subscribe_(t, s));
    }
    getValue(e, t) {
      this.bind();
      const n = this._targetGroup.nCachedObjects_,
        s = this._bindings[n];
      s !== void 0 && s.getValue(e, t);
    }
    setValue(e, t) {
      const n = this._bindings;
      for (let s = this._targetGroup.nCachedObjects_, r = n.length; s !== r; ++s) n[s].setValue(e, t);
    }
    bind() {
      const e = this._bindings;
      for (let t = this._targetGroup.nCachedObjects_, n = e.length; t !== n; ++t) e[t].bind();
    }
    unbind() {
      const e = this._bindings;
      for (let t = this._targetGroup.nCachedObjects_, n = e.length; t !== n; ++t) e[t].unbind();
    }
  },
  lt = (() => {
    class i {
      constructor(t, n, s) {
        (this.path = n),
          (this.parsedPath = s || i.parseTrackName(n)),
          (this.node = i.findNode(t, this.parsedPath.nodeName)),
          (this.rootNode = t),
          (this.getValue = this._getValue_unbound),
          (this.setValue = this._setValue_unbound);
      }
      static create(t, n, s) {
        return t?.isAnimationObjectGroup ? new i.Composite(t, n, s) : new i(t, n, s);
      }
      static sanitizeNodeName(t) {
        return t.replace(/\s/g, '_').replace(yu, '');
      }
      static parseTrackName(t) {
        const n = Eu.exec(t);
        if (n === null) throw new Error(`PropertyBinding: Cannot parse trackName: ${t}`);
        const s = { nodeName: n[2], objectName: n[3], objectIndex: n[4], propertyName: n[5], propertyIndex: n[6] },
          r = s.nodeName?.lastIndexOf('.');
        if (r !== void 0 && r !== -1) {
          const a = s.nodeName.substring(r + 1);
          wu.indexOf(a) !== -1 && ((s.nodeName = s.nodeName.substring(0, r)), (s.objectName = a));
        }
        if (s.propertyName === null || s.propertyName.length === 0)
          throw new Error(`PropertyBinding: can not parse propertyName from trackName: ${t}`);
        return s;
      }
      static findNode(t, n) {
        if (n === void 0 || n === '' || n === '.' || n === -1 || n === t.name || n === t.uuid) return t;
        if (t.skeleton) {
          const s = t.skeleton.getBoneByName(n);
          if (s !== void 0) return s;
        }
        if (t.children) {
          const s = (a) => {
              for (let o = 0; o < a.length; o++) {
                const c = a[o];
                if (c.name === n || c.uuid === n) return c;
                const l = s(c.children);
                if (l) return l;
              }
              return null;
            },
            r = s(t.children);
          if (r) return r;
        }
        return null;
      }
      _getValue_unavailable() {}
      _setValue_unavailable() {}
      _getValue_direct(t, n) {
        t[n] = this.targetObject[this.propertyName];
      }
      _getValue_array(t, n) {
        const s = this.resolvedProperty;
        for (let r = 0, a = s.length; r !== a; ++r) t[n++] = s[r];
      }
      _getValue_arrayElement(t, n) {
        t[n] = this.resolvedProperty[this.propertyIndex];
      }
      _getValue_toArray(t, n) {
        this.resolvedProperty.toArray(t, n);
      }
      _setValue_direct(t, n) {
        this.targetObject[this.propertyName] = t[n];
      }
      _setValue_direct_setNeedsUpdate(t, n) {
        (this.targetObject[this.propertyName] = t[n]), (this.targetObject.needsUpdate = !0);
      }
      _setValue_direct_setMatrixWorldNeedsUpdate(t, n) {
        (this.targetObject[this.propertyName] = t[n]), (this.targetObject.matrixWorldNeedsUpdate = !0);
      }
      _setValue_array(t, n) {
        const s = this.resolvedProperty;
        for (let r = 0, a = s.length; r !== a; ++r) s[r] = t[n++];
      }
      _setValue_array_setNeedsUpdate(t, n) {
        const s = this.resolvedProperty;
        for (let r = 0, a = s.length; r !== a; ++r) s[r] = t[n++];
        this.targetObject.needsUpdate = !0;
      }
      _setValue_array_setMatrixWorldNeedsUpdate(t, n) {
        const s = this.resolvedProperty;
        for (let r = 0, a = s.length; r !== a; ++r) s[r] = t[n++];
        this.targetObject.matrixWorldNeedsUpdate = !0;
      }
      _setValue_arrayElement(t, n) {
        this.resolvedProperty[this.propertyIndex] = t[n];
      }
      _setValue_arrayElement_setNeedsUpdate(t, n) {
        (this.resolvedProperty[this.propertyIndex] = t[n]), (this.targetObject.needsUpdate = !0);
      }
      _setValue_arrayElement_setMatrixWorldNeedsUpdate(t, n) {
        (this.resolvedProperty[this.propertyIndex] = t[n]), (this.targetObject.matrixWorldNeedsUpdate = !0);
      }
      _setValue_fromArray(t, n) {
        this.resolvedProperty.fromArray(t, n);
      }
      _setValue_fromArray_setNeedsUpdate(t, n) {
        this.resolvedProperty.fromArray(t, n), (this.targetObject.needsUpdate = !0);
      }
      _setValue_fromArray_setMatrixWorldNeedsUpdate(t, n) {
        this.resolvedProperty.fromArray(t, n), (this.targetObject.matrixWorldNeedsUpdate = !0);
      }
      _getValue_unbound(t, n) {
        this.bind(), this.getValue(t, n);
      }
      _setValue_unbound(t, n) {
        this.bind(), this.setValue(t, n);
      }
      bind() {
        let t = this.node,
          n = this.parsedPath,
          s = n.objectName,
          r = n.propertyName,
          a = n.propertyIndex;
        if (
          (t || ((t = i.findNode(this.rootNode, n.nodeName)), (this.node = t)),
          (this.getValue = this._getValue_unavailable),
          (this.setValue = this._setValue_unavailable),
          !t)
        ) {
          Ee(`PropertyBinding: No target node found for track: ${this.path}.`);
          return;
        }
        if (s) {
          let d = n.objectIndex;
          switch (s) {
            case 'materials':
              if (!t.material) {
                Ae('PropertyBinding: Can not bind to material as node does not have a material.', this);
                return;
              }
              if (!t.material.materials) {
                Ae(
                  'PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.',
                  this,
                );
                return;
              }
              t = t.material.materials;
              break;
            case 'bones':
              if (!t.skeleton) {
                Ae('PropertyBinding: Can not bind to bones as node does not have a skeleton.', this);
                return;
              }
              t = t.skeleton.bones;
              for (let m = 0; m < t.length; m++)
                if (t[m].name === d) {
                  d = m;
                  break;
                }
              break;
            case 'map':
              if ('map' in t) {
                t = t.map;
                break;
              }
              if (!t.material) {
                Ae('PropertyBinding: Can not bind to material as node does not have a material.', this);
                return;
              }
              if (!t.material.map) {
                Ae('PropertyBinding: Can not bind to material.map as node.material does not have a map.', this);
                return;
              }
              t = t.material.map;
              break;
            default:
              if (t[s] === void 0) {
                Ae('PropertyBinding: Can not bind to objectName of node undefined.', this);
                return;
              }
              t = t[s];
          }
          if (d !== void 0) {
            if (t[d] === void 0) {
              Ae('PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.', this, t);
              return;
            }
            t = t[d];
          }
        }
        const o = t[r];
        if (o === void 0) {
          const d = n.nodeName;
          Ae(`PropertyBinding: Trying to update property for track: ${d}.${r} but it wasn't found.`, t);
          return;
        }
        let c = this.Versioning.None;
        (this.targetObject = t),
          t.isMaterial === !0
            ? (c = this.Versioning.NeedsUpdate)
            : t.isObject3D === !0 && (c = this.Versioning.MatrixWorldNeedsUpdate);
        let l = this.BindingType.Direct;
        if (a !== void 0) {
          if (r === 'morphTargetInfluences') {
            if (!t.geometry) {
              Ae('PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.', this);
              return;
            }
            if (!t.geometry.morphAttributes) {
              Ae(
                'PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.',
                this,
              );
              return;
            }
            t.morphTargetDictionary[a] !== void 0 && (a = t.morphTargetDictionary[a]);
          }
          (l = this.BindingType.ArrayElement), (this.resolvedProperty = o), (this.propertyIndex = a);
        } else
          o.fromArray !== void 0 && o.toArray !== void 0
            ? ((l = this.BindingType.HasFromToArray), (this.resolvedProperty = o))
            : Array.isArray(o)
              ? ((l = this.BindingType.EntireArray), (this.resolvedProperty = o))
              : (this.propertyName = r);
        (this.getValue = this.GetterByBindingType[l]), (this.setValue = this.SetterByBindingTypeAndVersioning[l][c]);
      }
      unbind() {
        (this.node = null), (this.getValue = this._getValue_unbound), (this.setValue = this._setValue_unbound);
      }
    }
    return (i.Composite = qo), i;
  })();
lt.prototype.BindingType = { Direct: 0, EntireArray: 1, ArrayElement: 2, HasFromToArray: 3 };
lt.prototype.Versioning = { None: 0, NeedsUpdate: 1, MatrixWorldNeedsUpdate: 2 };
lt.prototype.GetterByBindingType = [
  lt.prototype._getValue_direct,
  lt.prototype._getValue_array,
  lt.prototype._getValue_arrayElement,
  lt.prototype._getValue_toArray,
];
lt.prototype.SetterByBindingTypeAndVersioning = [
  [
    lt.prototype._setValue_direct,
    lt.prototype._setValue_direct_setNeedsUpdate,
    lt.prototype._setValue_direct_setMatrixWorldNeedsUpdate,
  ],
  [
    lt.prototype._setValue_array,
    lt.prototype._setValue_array_setNeedsUpdate,
    lt.prototype._setValue_array_setMatrixWorldNeedsUpdate,
  ],
  [
    lt.prototype._setValue_arrayElement,
    lt.prototype._setValue_arrayElement_setNeedsUpdate,
    lt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate,
  ],
  [
    lt.prototype._setValue_fromArray,
    lt.prototype._setValue_fromArray_setNeedsUpdate,
    lt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate,
  ],
];
var _Tg = new Float32Array(1);
var Tc = new tt(),
  Yo = class {
    constructor(e, t, n = 0, s = 1 / 0) {
      (this.ray = new ni(e, t)),
        (this.near = n),
        (this.far = s),
        (this.camera = null),
        (this.layers = new Pi()),
        (this.params = { Mesh: {}, Line: { threshold: 1 }, LOD: {}, Points: { threshold: 1 }, Sprite: {} });
    }
    set(e, t) {
      this.ray.set(e, t);
    }
    setFromCamera(e, t) {
      t.isPerspectiveCamera
        ? (this.ray.origin.setFromMatrixPosition(t.matrixWorld),
          this.ray.direction.set(e.x, e.y, 0.5).unproject(t).sub(this.ray.origin).normalize(),
          (this.camera = t))
        : t.isOrthographicCamera
          ? (this.ray.origin.set(e.x, e.y, (t.near + t.far) / (t.near - t.far)).unproject(t),
            this.ray.direction.set(0, 0, -1).transformDirection(t.matrixWorld),
            (this.camera = t))
          : Ae(`Raycaster: Unsupported camera type: ${t.type}`);
    }
    setFromXRController(e) {
      return (
        Tc.identity().extractRotation(e.matrixWorld),
        this.ray.origin.setFromMatrixPosition(e.matrixWorld),
        this.ray.direction.set(0, 0, -1).applyMatrix4(Tc),
        this
      );
    }
    intersectObject(e, t = !0, n = []) {
      return Zo(e, this, n, t), n.sort(Ac), n;
    }
    intersectObjects(e, t = !0, n = []) {
      for (let s = 0, r = e.length; s < r; s++) Zo(e[s], this, n, t);
      return n.sort(Ac), n;
    }
  };
function Ac(i, e) {
  return i.distance - e.distance;
}
function Zo(i, e, t, n) {
  let s = !0;
  if ((i.layers.test(e.layers) && i.raycast(e, t) === !1 && (s = !1), s === !0 && n === !0)) {
    const r = i.children;
    for (let a = 0, o = r.length; a < o; a++) Zo(r[a], e, t, !0);
  }
}
var Jo = class {
  constructor(e = !0) {
    (this.autoStart = e),
      (this.startTime = 0),
      (this.oldTime = 0),
      (this.elapsedTime = 0),
      (this.running = !1),
      Ee('THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.');
  }
  start() {
    (this.startTime = performance.now()), (this.oldTime = this.startTime), (this.elapsedTime = 0), (this.running = !0);
  }
  stop() {
    this.getElapsedTime(), (this.running = !1), (this.autoStart = !1);
  }
  getElapsedTime() {
    return this.getDelta(), this.elapsedTime;
  }
  getDelta() {
    let e = 0;
    if (this.autoStart && !this.running) return this.start(), 0;
    if (this.running) {
      const t = performance.now();
      (e = (t - this.oldTime) / 1e3), (this.oldTime = t), (this.elapsedTime += e);
    }
    return e;
  }
};
function yl(i, e, t, n) {
  const s = Cu(n);
  switch (t) {
    case dl:
      return i * e;
    case pl:
      return ((i * e) / s.components) * s.byteLength;
    case qr:
      return ((i * e) / s.components) * s.byteLength;
    case si:
      return ((i * e * 2) / s.components) * s.byteLength;
    case Yr:
      return ((i * e * 2) / s.components) * s.byteLength;
    case fl:
      return ((i * e * 3) / s.components) * s.byteLength;
    case Vt:
      return ((i * e * 4) / s.components) * s.byteLength;
    case Zr:
      return ((i * e * 4) / s.components) * s.byteLength;
    case gs:
    case _s:
      return Math.floor((i + 3) / 4) * Math.floor((e + 3) / 4) * 8;
    case xs:
    case vs:
      return Math.floor((i + 3) / 4) * Math.floor((e + 3) / 4) * 16;
    case $r:
    case Qr:
      return (Math.max(i, 16) * Math.max(e, 8)) / 4;
    case Jr:
    case Kr:
      return (Math.max(i, 8) * Math.max(e, 8)) / 2;
    case jr:
    case ea:
    case na:
    case ia:
      return Math.floor((i + 3) / 4) * Math.floor((e + 3) / 4) * 8;
    case ta:
    case sa:
    case ra:
      return Math.floor((i + 3) / 4) * Math.floor((e + 3) / 4) * 16;
    case aa:
      return Math.floor((i + 3) / 4) * Math.floor((e + 3) / 4) * 16;
    case oa:
      return Math.floor((i + 4) / 5) * Math.floor((e + 3) / 4) * 16;
    case la:
      return Math.floor((i + 4) / 5) * Math.floor((e + 4) / 5) * 16;
    case ca:
      return Math.floor((i + 5) / 6) * Math.floor((e + 4) / 5) * 16;
    case ha:
      return Math.floor((i + 5) / 6) * Math.floor((e + 5) / 6) * 16;
    case ua:
      return Math.floor((i + 7) / 8) * Math.floor((e + 4) / 5) * 16;
    case da:
      return Math.floor((i + 7) / 8) * Math.floor((e + 5) / 6) * 16;
    case fa:
      return Math.floor((i + 7) / 8) * Math.floor((e + 7) / 8) * 16;
    case pa:
      return Math.floor((i + 9) / 10) * Math.floor((e + 4) / 5) * 16;
    case ma:
      return Math.floor((i + 9) / 10) * Math.floor((e + 5) / 6) * 16;
    case ga:
      return Math.floor((i + 9) / 10) * Math.floor((e + 7) / 8) * 16;
    case _a:
      return Math.floor((i + 9) / 10) * Math.floor((e + 9) / 10) * 16;
    case xa:
      return Math.floor((i + 11) / 12) * Math.floor((e + 9) / 10) * 16;
    case va:
      return Math.floor((i + 11) / 12) * Math.floor((e + 11) / 12) * 16;
    case ya:
    case Ma:
    case Sa:
      return Math.ceil(i / 4) * Math.ceil(e / 4) * 16;
    case ba:
    case Ta:
      return Math.ceil(i / 4) * Math.ceil(e / 4) * 8;
    case Aa:
    case Ea:
      return Math.ceil(i / 4) * Math.ceil(e / 4) * 16;
  }
  throw new Error(`Unable to determine texture byte length for ${t} format.`);
}
function Cu(i) {
  switch (i) {
    case It:
    case ll:
      return { byteLength: 1, components: 1 };
    case Fi:
    case cl:
    case on:
      return { byteLength: 2, components: 1 };
    case Wr:
    case Xr:
      return { byteLength: 2, components: 4 };
    case Zt:
    case Hr:
    case Jt:
      return { byteLength: 4, components: 1 };
    case hl:
    case ul:
      return { byteLength: 4, components: 3 };
  }
  throw new Error(`Unknown texture type ${i}.`);
}
typeof __THREE_DEVTOOLS__ < 'u' &&
  __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent('register', { detail: { revision: '183' } }));
typeof window < 'u' &&
  (window.__THREE__ ? Ee('WARNING: Multiple instances of Three.js being imported.') : (window.__THREE__ = '183'));
function Uh() {
  let i = null,
    e = !1,
    t = null,
    n = null;
  function s(r, a) {
    t(r, a), (n = i.requestAnimationFrame(s));
  }
  return {
    start: () => {
      e !== !0 && t !== null && ((n = i.requestAnimationFrame(s)), (e = !0));
    },
    stop: () => {
      i.cancelAnimationFrame(n), (e = !1);
    },
    setAnimationLoop: (r) => {
      t = r;
    },
    setContext: (r) => {
      i = r;
    },
  };
}
function Iu(i) {
  const e = new WeakMap();
  function t(o, c) {
    const l = o.array,
      d = o.usage,
      m = l.byteLength,
      h = i.createBuffer();
    i.bindBuffer(c, h), i.bufferData(c, l, d), o.onUploadCallback();
    let f;
    if (l instanceof Float32Array) f = i.FLOAT;
    else if (typeof Float16Array < 'u' && l instanceof Float16Array) f = i.HALF_FLOAT;
    else if (l instanceof Uint16Array) o.isFloat16BufferAttribute ? (f = i.HALF_FLOAT) : (f = i.UNSIGNED_SHORT);
    else if (l instanceof Int16Array) f = i.SHORT;
    else if (l instanceof Uint32Array) f = i.UNSIGNED_INT;
    else if (l instanceof Int32Array) f = i.INT;
    else if (l instanceof Int8Array) f = i.BYTE;
    else if (l instanceof Uint8Array) f = i.UNSIGNED_BYTE;
    else if (l instanceof Uint8ClampedArray) f = i.UNSIGNED_BYTE;
    else throw new Error(`THREE.WebGLAttributes: Unsupported buffer data format: ${l}`);
    return { buffer: h, type: f, bytesPerElement: l.BYTES_PER_ELEMENT, version: o.version, size: m };
  }
  function n(o, c, l) {
    const d = c.array,
      m = c.updateRanges;
    if ((i.bindBuffer(l, o), m.length === 0)) i.bufferSubData(l, 0, d);
    else {
      m.sort((f, g) => f.start - g.start);
      let h = 0;
      for (let f = 1; f < m.length; f++) {
        const g = m[h],
          y = m[f];
        y.start <= g.start + g.count + 1
          ? (g.count = Math.max(g.count, y.start + y.count - g.start))
          : (++h, (m[h] = y));
      }
      m.length = h + 1;
      for (let f = 0, g = m.length; f < g; f++) {
        const y = m[f];
        i.bufferSubData(l, y.start * d.BYTES_PER_ELEMENT, d, y.start, y.count);
      }
      c.clearUpdateRanges();
    }
    c.onUploadCallback();
  }
  function s(o) {
    return o.isInterleavedBufferAttribute && (o = o.data), e.get(o);
  }
  function r(o) {
    o.isInterleavedBufferAttribute && (o = o.data);
    const c = e.get(o);
    c && (i.deleteBuffer(c.buffer), e.delete(o));
  }
  function a(o, c) {
    if ((o.isInterleavedBufferAttribute && (o = o.data), o.isGLBufferAttribute)) {
      const d = e.get(o);
      (!d || d.version < o.version) &&
        e.set(o, { buffer: o.buffer, type: o.type, bytesPerElement: o.elementSize, version: o.version });
      return;
    }
    const l = e.get(o);
    if (l === void 0) e.set(o, t(o, c));
    else if (l.version < o.version) {
      if (l.size !== o.array.byteLength)
        throw new Error(
          "THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.",
        );
      n(l.buffer, o, c), (l.version = o.version);
    }
  }
  return { get: s, remove: r, update: a };
}
var Pu = `#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,
  Lu = `#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,
  Du = `#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,
  Uu = `#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,
  Nu = `#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,
  Fu = `#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,
  Ou = `#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,
  Bu = `#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,
  zu = `#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,
  Vu = `#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,
  ku = `vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,
  Gu = `vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,
  Hu = `float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,
  Wu = `#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,
  Xu = `#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,
  qu = `#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,
  Yu = `#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,
  Zu = `#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,
  Ju = `#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,
  $u = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,
  Ku = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,
  Qu = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,
  ju = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,
  ed = `#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,
  td = `#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,
  nd = `vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,
  id = `#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,
  sd = `#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,
  rd = `#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,
  ad = `#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,
  od = 'gl_FragColor = linearToOutputTexel( gl_FragColor );',
  ld = `vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,
  cd = `#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,
  hd = `#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,
  ud = `#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,
  dd = `#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,
  fd = `#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,
  pd = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,
  md = `#ifdef USE_FOG
	varying float vFogDepth;
#endif`,
  gd = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,
  _d = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,
  xd = `#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,
  vd = `#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,
  yd = `LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,
  Md = `varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,
  Sd = `uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,
  bd = `#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,
  Td = `ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,
  Ad = `varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,
  Ed = `BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,
  wd = `varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,
  Cd = `PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,
  Rd = `uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return v;
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,
  Id = `
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,
  Pd = `#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,
  Ld = `#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,
  Dd = `#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,
  Ud = `#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,
  Nd = `#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,
  Fd = `#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,
  Od = `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,
  Bd = `#ifdef USE_MAP
	uniform sampler2D map;
#endif`,
  zd = `#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,
  Vd = `#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,
  kd = `float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,
  Gd = `#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,
  Hd = `#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,
  Wd = `#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,
  Xd = `#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,
  qd = `#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,
  Yd = `#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,
  Zd = `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,
  Jd = `#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,
  $d = `#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,
  Kd = `#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,
  Qd = `#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,
  jd = `#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,
  ef = `#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,
  tf = `#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,
  nf = `#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,
  sf = `#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,
  rf = `#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
  af = `vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,
  of = `#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,
  lf = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
  cf = `#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,
  hf = `#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,
  uf = `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,
  df = `#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,
  ff = `#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,
  pf = `#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,
  mf = `#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,
  gf = `float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,
  _f = `#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,
  xf = `#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,
  vf = `#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,
  yf = `#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,
  Mf = `float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,
  Sf = `#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,
  bf = `#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,
  Tf = `#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,
  Af = `#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,
  Ef = `#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,
  wf = `#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,
  Cf = `#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,
  Rf = `#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,
  If = `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,
  Pf = `varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,
  Lf = `uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,
  Df = `varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,
  Uf = `#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,
  Nf = `varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,
  Ff = `uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,
  Of = `#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,
  Bf = `#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,
  zf = `#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,
  Vf = `#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,
  kf = `varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,
  Gf = `uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,
  Hf = `uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,
  Wf = `uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,
  Xf = `#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,
  qf = `uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  Yf = `#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,
  Zf = `#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  Jf = `#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,
  $f = `#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  Kf = `#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,
  Qf = `#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,
  jf = `#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,
  ep = `#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  tp = `#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,
  np = `#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  ip = `#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,
  sp = `#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,
  rp = `uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,
  ap = `uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,
  op = `#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,
  lp = `uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,
  cp = `uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,
  hp = `uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,
  Fe = {
    alphahash_fragment: Pu,
    alphahash_pars_fragment: Lu,
    alphamap_fragment: Du,
    alphamap_pars_fragment: Uu,
    alphatest_fragment: Nu,
    alphatest_pars_fragment: Fu,
    aomap_fragment: Ou,
    aomap_pars_fragment: Bu,
    batching_pars_vertex: zu,
    batching_vertex: Vu,
    begin_vertex: ku,
    beginnormal_vertex: Gu,
    bsdfs: Hu,
    iridescence_fragment: Wu,
    bumpmap_pars_fragment: Xu,
    clipping_planes_fragment: qu,
    clipping_planes_pars_fragment: Yu,
    clipping_planes_pars_vertex: Zu,
    clipping_planes_vertex: Ju,
    color_fragment: $u,
    color_pars_fragment: Ku,
    color_pars_vertex: Qu,
    color_vertex: ju,
    common: ed,
    cube_uv_reflection_fragment: td,
    defaultnormal_vertex: nd,
    displacementmap_pars_vertex: id,
    displacementmap_vertex: sd,
    emissivemap_fragment: rd,
    emissivemap_pars_fragment: ad,
    colorspace_fragment: od,
    colorspace_pars_fragment: ld,
    envmap_fragment: cd,
    envmap_common_pars_fragment: hd,
    envmap_pars_fragment: ud,
    envmap_pars_vertex: dd,
    envmap_physical_pars_fragment: bd,
    envmap_vertex: fd,
    fog_vertex: pd,
    fog_pars_vertex: md,
    fog_fragment: gd,
    fog_pars_fragment: _d,
    gradientmap_pars_fragment: xd,
    lightmap_pars_fragment: vd,
    lights_lambert_fragment: yd,
    lights_lambert_pars_fragment: Md,
    lights_pars_begin: Sd,
    lights_toon_fragment: Td,
    lights_toon_pars_fragment: Ad,
    lights_phong_fragment: Ed,
    lights_phong_pars_fragment: wd,
    lights_physical_fragment: Cd,
    lights_physical_pars_fragment: Rd,
    lights_fragment_begin: Id,
    lights_fragment_maps: Pd,
    lights_fragment_end: Ld,
    logdepthbuf_fragment: Dd,
    logdepthbuf_pars_fragment: Ud,
    logdepthbuf_pars_vertex: Nd,
    logdepthbuf_vertex: Fd,
    map_fragment: Od,
    map_pars_fragment: Bd,
    map_particle_fragment: zd,
    map_particle_pars_fragment: Vd,
    metalnessmap_fragment: kd,
    metalnessmap_pars_fragment: Gd,
    morphinstance_vertex: Hd,
    morphcolor_vertex: Wd,
    morphnormal_vertex: Xd,
    morphtarget_pars_vertex: qd,
    morphtarget_vertex: Yd,
    normal_fragment_begin: Zd,
    normal_fragment_maps: Jd,
    normal_pars_fragment: $d,
    normal_pars_vertex: Kd,
    normal_vertex: Qd,
    normalmap_pars_fragment: jd,
    clearcoat_normal_fragment_begin: ef,
    clearcoat_normal_fragment_maps: tf,
    clearcoat_pars_fragment: nf,
    iridescence_pars_fragment: sf,
    opaque_fragment: rf,
    packing: af,
    premultiplied_alpha_fragment: of,
    project_vertex: lf,
    dithering_fragment: cf,
    dithering_pars_fragment: hf,
    roughnessmap_fragment: uf,
    roughnessmap_pars_fragment: df,
    shadowmap_pars_fragment: ff,
    shadowmap_pars_vertex: pf,
    shadowmap_vertex: mf,
    shadowmask_pars_fragment: gf,
    skinbase_vertex: _f,
    skinning_pars_vertex: xf,
    skinning_vertex: vf,
    skinnormal_vertex: yf,
    specularmap_fragment: Mf,
    specularmap_pars_fragment: Sf,
    tonemapping_fragment: bf,
    tonemapping_pars_fragment: Tf,
    transmission_fragment: Af,
    transmission_pars_fragment: Ef,
    uv_pars_fragment: wf,
    uv_pars_vertex: Cf,
    uv_vertex: Rf,
    worldpos_vertex: If,
    background_vert: Pf,
    background_frag: Lf,
    backgroundCube_vert: Df,
    backgroundCube_frag: Uf,
    cube_vert: Nf,
    cube_frag: Ff,
    depth_vert: Of,
    depth_frag: Bf,
    distance_vert: zf,
    distance_frag: Vf,
    equirect_vert: kf,
    equirect_frag: Gf,
    linedashed_vert: Hf,
    linedashed_frag: Wf,
    meshbasic_vert: Xf,
    meshbasic_frag: qf,
    meshlambert_vert: Yf,
    meshlambert_frag: Zf,
    meshmatcap_vert: Jf,
    meshmatcap_frag: $f,
    meshnormal_vert: Kf,
    meshnormal_frag: Qf,
    meshphong_vert: jf,
    meshphong_frag: ep,
    meshphysical_vert: tp,
    meshphysical_frag: np,
    meshtoon_vert: ip,
    meshtoon_frag: sp,
    points_vert: rp,
    points_frag: ap,
    shadow_vert: op,
    shadow_frag: lp,
    sprite_vert: cp,
    sprite_frag: hp,
  },
  ae = {
    common: {
      diffuse: { value: new Ve(16777215) },
      opacity: { value: 1 },
      map: { value: null },
      mapTransform: { value: new De() },
      alphaMap: { value: null },
      alphaMapTransform: { value: new De() },
      alphaTest: { value: 0 },
    },
    specularmap: { specularMap: { value: null }, specularMapTransform: { value: new De() } },
    envmap: {
      envMap: { value: null },
      envMapRotation: { value: new De() },
      flipEnvMap: { value: -1 },
      reflectivity: { value: 1 },
      ior: { value: 1.5 },
      refractionRatio: { value: 0.98 },
      dfgLUT: { value: null },
    },
    aomap: { aoMap: { value: null }, aoMapIntensity: { value: 1 }, aoMapTransform: { value: new De() } },
    lightmap: { lightMap: { value: null }, lightMapIntensity: { value: 1 }, lightMapTransform: { value: new De() } },
    bumpmap: { bumpMap: { value: null }, bumpMapTransform: { value: new De() }, bumpScale: { value: 1 } },
    normalmap: {
      normalMap: { value: null },
      normalMapTransform: { value: new De() },
      normalScale: { value: new Re(1, 1) },
    },
    displacementmap: {
      displacementMap: { value: null },
      displacementMapTransform: { value: new De() },
      displacementScale: { value: 1 },
      displacementBias: { value: 0 },
    },
    emissivemap: { emissiveMap: { value: null }, emissiveMapTransform: { value: new De() } },
    metalnessmap: { metalnessMap: { value: null }, metalnessMapTransform: { value: new De() } },
    roughnessmap: { roughnessMap: { value: null }, roughnessMapTransform: { value: new De() } },
    gradientmap: { gradientMap: { value: null } },
    fog: {
      fogDensity: { value: 25e-5 },
      fogNear: { value: 1 },
      fogFar: { value: 2e3 },
      fogColor: { value: new Ve(16777215) },
    },
    lights: {
      ambientLightColor: { value: [] },
      lightProbe: { value: [] },
      directionalLights: { value: [], properties: { direction: {}, color: {} } },
      directionalLightShadows: {
        value: [],
        properties: { shadowIntensity: 1, shadowBias: {}, shadowNormalBias: {}, shadowRadius: {}, shadowMapSize: {} },
      },
      directionalShadowMatrix: { value: [] },
      spotLights: {
        value: [],
        properties: { color: {}, position: {}, direction: {}, distance: {}, coneCos: {}, penumbraCos: {}, decay: {} },
      },
      spotLightShadows: {
        value: [],
        properties: { shadowIntensity: 1, shadowBias: {}, shadowNormalBias: {}, shadowRadius: {}, shadowMapSize: {} },
      },
      spotLightMap: { value: [] },
      spotLightMatrix: { value: [] },
      pointLights: { value: [], properties: { color: {}, position: {}, decay: {}, distance: {} } },
      pointLightShadows: {
        value: [],
        properties: {
          shadowIntensity: 1,
          shadowBias: {},
          shadowNormalBias: {},
          shadowRadius: {},
          shadowMapSize: {},
          shadowCameraNear: {},
          shadowCameraFar: {},
        },
      },
      pointShadowMatrix: { value: [] },
      hemisphereLights: { value: [], properties: { direction: {}, skyColor: {}, groundColor: {} } },
      rectAreaLights: { value: [], properties: { color: {}, position: {}, width: {}, height: {} } },
      ltc_1: { value: null },
      ltc_2: { value: null },
    },
    points: {
      diffuse: { value: new Ve(16777215) },
      opacity: { value: 1 },
      size: { value: 1 },
      scale: { value: 1 },
      map: { value: null },
      alphaMap: { value: null },
      alphaMapTransform: { value: new De() },
      alphaTest: { value: 0 },
      uvTransform: { value: new De() },
    },
    sprite: {
      diffuse: { value: new Ve(16777215) },
      opacity: { value: 1 },
      center: { value: new Re(0.5, 0.5) },
      rotation: { value: 0 },
      map: { value: null },
      mapTransform: { value: new De() },
      alphaMap: { value: null },
      alphaMapTransform: { value: new De() },
      alphaTest: { value: 0 },
    },
  },
  hn = {
    basic: {
      uniforms: At([ae.common, ae.specularmap, ae.envmap, ae.aomap, ae.lightmap, ae.fog]),
      vertexShader: Fe.meshbasic_vert,
      fragmentShader: Fe.meshbasic_frag,
    },
    lambert: {
      uniforms: At([
        ae.common,
        ae.specularmap,
        ae.envmap,
        ae.aomap,
        ae.lightmap,
        ae.emissivemap,
        ae.bumpmap,
        ae.normalmap,
        ae.displacementmap,
        ae.fog,
        ae.lights,
        { emissive: { value: new Ve(0) }, envMapIntensity: { value: 1 } },
      ]),
      vertexShader: Fe.meshlambert_vert,
      fragmentShader: Fe.meshlambert_frag,
    },
    phong: {
      uniforms: At([
        ae.common,
        ae.specularmap,
        ae.envmap,
        ae.aomap,
        ae.lightmap,
        ae.emissivemap,
        ae.bumpmap,
        ae.normalmap,
        ae.displacementmap,
        ae.fog,
        ae.lights,
        {
          emissive: { value: new Ve(0) },
          specular: { value: new Ve(1118481) },
          shininess: { value: 30 },
          envMapIntensity: { value: 1 },
        },
      ]),
      vertexShader: Fe.meshphong_vert,
      fragmentShader: Fe.meshphong_frag,
    },
    standard: {
      uniforms: At([
        ae.common,
        ae.envmap,
        ae.aomap,
        ae.lightmap,
        ae.emissivemap,
        ae.bumpmap,
        ae.normalmap,
        ae.displacementmap,
        ae.roughnessmap,
        ae.metalnessmap,
        ae.fog,
        ae.lights,
        {
          emissive: { value: new Ve(0) },
          roughness: { value: 1 },
          metalness: { value: 0 },
          envMapIntensity: { value: 1 },
        },
      ]),
      vertexShader: Fe.meshphysical_vert,
      fragmentShader: Fe.meshphysical_frag,
    },
    toon: {
      uniforms: At([
        ae.common,
        ae.aomap,
        ae.lightmap,
        ae.emissivemap,
        ae.bumpmap,
        ae.normalmap,
        ae.displacementmap,
        ae.gradientmap,
        ae.fog,
        ae.lights,
        { emissive: { value: new Ve(0) } },
      ]),
      vertexShader: Fe.meshtoon_vert,
      fragmentShader: Fe.meshtoon_frag,
    },
    matcap: {
      uniforms: At([ae.common, ae.bumpmap, ae.normalmap, ae.displacementmap, ae.fog, { matcap: { value: null } }]),
      vertexShader: Fe.meshmatcap_vert,
      fragmentShader: Fe.meshmatcap_frag,
    },
    points: { uniforms: At([ae.points, ae.fog]), vertexShader: Fe.points_vert, fragmentShader: Fe.points_frag },
    dashed: {
      uniforms: At([ae.common, ae.fog, { scale: { value: 1 }, dashSize: { value: 1 }, totalSize: { value: 2 } }]),
      vertexShader: Fe.linedashed_vert,
      fragmentShader: Fe.linedashed_frag,
    },
    depth: {
      uniforms: At([ae.common, ae.displacementmap]),
      vertexShader: Fe.depth_vert,
      fragmentShader: Fe.depth_frag,
    },
    normal: {
      uniforms: At([ae.common, ae.bumpmap, ae.normalmap, ae.displacementmap, { opacity: { value: 1 } }]),
      vertexShader: Fe.meshnormal_vert,
      fragmentShader: Fe.meshnormal_frag,
    },
    sprite: { uniforms: At([ae.sprite, ae.fog]), vertexShader: Fe.sprite_vert, fragmentShader: Fe.sprite_frag },
    background: {
      uniforms: { uvTransform: { value: new De() }, t2D: { value: null }, backgroundIntensity: { value: 1 } },
      vertexShader: Fe.background_vert,
      fragmentShader: Fe.background_frag,
    },
    backgroundCube: {
      uniforms: {
        envMap: { value: null },
        flipEnvMap: { value: -1 },
        backgroundBlurriness: { value: 0 },
        backgroundIntensity: { value: 1 },
        backgroundRotation: { value: new De() },
      },
      vertexShader: Fe.backgroundCube_vert,
      fragmentShader: Fe.backgroundCube_frag,
    },
    cube: {
      uniforms: { tCube: { value: null }, tFlip: { value: -1 }, opacity: { value: 1 } },
      vertexShader: Fe.cube_vert,
      fragmentShader: Fe.cube_frag,
    },
    equirect: {
      uniforms: { tEquirect: { value: null } },
      vertexShader: Fe.equirect_vert,
      fragmentShader: Fe.equirect_frag,
    },
    distance: {
      uniforms: At([
        ae.common,
        ae.displacementmap,
        { referencePosition: { value: new L() }, nearDistance: { value: 1 }, farDistance: { value: 1e3 } },
      ]),
      vertexShader: Fe.distance_vert,
      fragmentShader: Fe.distance_frag,
    },
    shadow: {
      uniforms: At([ae.lights, ae.fog, { color: { value: new Ve(0) }, opacity: { value: 1 } }]),
      vertexShader: Fe.shadow_vert,
      fragmentShader: Fe.shadow_frag,
    },
  };
hn.physical = {
  uniforms: At([
    hn.standard.uniforms,
    {
      clearcoat: { value: 0 },
      clearcoatMap: { value: null },
      clearcoatMapTransform: { value: new De() },
      clearcoatNormalMap: { value: null },
      clearcoatNormalMapTransform: { value: new De() },
      clearcoatNormalScale: { value: new Re(1, 1) },
      clearcoatRoughness: { value: 0 },
      clearcoatRoughnessMap: { value: null },
      clearcoatRoughnessMapTransform: { value: new De() },
      dispersion: { value: 0 },
      iridescence: { value: 0 },
      iridescenceMap: { value: null },
      iridescenceMapTransform: { value: new De() },
      iridescenceIOR: { value: 1.3 },
      iridescenceThicknessMinimum: { value: 100 },
      iridescenceThicknessMaximum: { value: 400 },
      iridescenceThicknessMap: { value: null },
      iridescenceThicknessMapTransform: { value: new De() },
      sheen: { value: 0 },
      sheenColor: { value: new Ve(0) },
      sheenColorMap: { value: null },
      sheenColorMapTransform: { value: new De() },
      sheenRoughness: { value: 1 },
      sheenRoughnessMap: { value: null },
      sheenRoughnessMapTransform: { value: new De() },
      transmission: { value: 0 },
      transmissionMap: { value: null },
      transmissionMapTransform: { value: new De() },
      transmissionSamplerSize: { value: new Re() },
      transmissionSamplerMap: { value: null },
      thickness: { value: 0 },
      thicknessMap: { value: null },
      thicknessMapTransform: { value: new De() },
      attenuationDistance: { value: 0 },
      attenuationColor: { value: new Ve(0) },
      specularColor: { value: new Ve(1, 1, 1) },
      specularColorMap: { value: null },
      specularColorMapTransform: { value: new De() },
      specularIntensity: { value: 1 },
      specularIntensityMap: { value: null },
      specularIntensityMapTransform: { value: new De() },
      anisotropyVector: { value: new Re() },
      anisotropyMap: { value: null },
      anisotropyMapTransform: { value: new De() },
    },
  ]),
  vertexShader: Fe.meshphysical_vert,
  fragmentShader: Fe.meshphysical_frag,
};
var Ra = { r: 0, b: 0, g: 0 },
  ai = new Dn(),
  up = new tt();
function dp(i, e, t, n, s, r) {
  let a = new Ve(0),
    o = s === !0 ? 0 : 1,
    c,
    l,
    d = null,
    m = 0,
    h = null;
  function f(v) {
    let T = v.isScene === !0 ? v.background : null;
    if (T?.isTexture) {
      const S = v.backgroundBlurriness > 0;
      T = e.get(T, S);
    }
    return T;
  }
  function g(v) {
    let T = !1,
      S = f(v);
    S === null ? p(a, o) : S?.isColor && (p(S, 1), (T = !0));
    const w = i.xr.getEnvironmentBlendMode();
    w === 'additive'
      ? t.buffers.color.setClear(0, 0, 0, 1, r)
      : w === 'alpha-blend' && t.buffers.color.setClear(0, 0, 0, 0, r),
      (i.autoClear || T) &&
        (t.buffers.depth.setTest(!0),
        t.buffers.depth.setMask(!0),
        t.buffers.color.setMask(!0),
        i.clear(i.autoClearColor, i.autoClearDepth, i.autoClearStencil));
  }
  function y(v, T) {
    const S = f(T);
    S && (S.isCubeTexture || S.mapping === ps)
      ? (l === void 0 &&
          ((l = new zt(
            new Ui(1, 1, 1),
            new Ft({
              name: 'BackgroundCubeMaterial',
              uniforms: ri(hn.backgroundCube.uniforms),
              vertexShader: hn.backgroundCube.vertexShader,
              fragmentShader: hn.backgroundCube.fragmentShader,
              side: Ct,
              depthTest: !1,
              depthWrite: !1,
              fog: !1,
              allowOverride: !1,
            }),
          )),
          l.geometry.deleteAttribute('normal'),
          l.geometry.deleteAttribute('uv'),
          (l.onBeforeRender = function (_w, _E, R) {
            this.matrixWorld.copyPosition(R.matrixWorld);
          }),
          Object.defineProperty(l.material, 'envMap', {
            get: function () {
              return this.uniforms.envMap.value;
            },
          }),
          n.update(l)),
        ai.copy(T.backgroundRotation),
        (ai.x *= -1),
        (ai.y *= -1),
        (ai.z *= -1),
        S.isCubeTexture && S.isRenderTargetTexture === !1 && ((ai.y *= -1), (ai.z *= -1)),
        (l.material.uniforms.envMap.value = S),
        (l.material.uniforms.flipEnvMap.value = S.isCubeTexture && S.isRenderTargetTexture === !1 ? -1 : 1),
        (l.material.uniforms.backgroundBlurriness.value = T.backgroundBlurriness),
        (l.material.uniforms.backgroundIntensity.value = T.backgroundIntensity),
        l.material.uniforms.backgroundRotation.value.setFromMatrix4(up.makeRotationFromEuler(ai)),
        (l.material.toneMapped = Ge.getTransfer(S.colorSpace) !== Ye),
        (d !== S || m !== S.version || h !== i.toneMapping) &&
          ((l.material.needsUpdate = !0), (d = S), (m = S.version), (h = i.toneMapping)),
        l.layers.enableAll(),
        v.unshift(l, l.geometry, l.material, 0, 0, null))
      : S?.isTexture &&
        (c === void 0 &&
          ((c = new zt(
            new ls(2, 2),
            new Ft({
              name: 'BackgroundMaterial',
              uniforms: ri(hn.background.uniforms),
              vertexShader: hn.background.vertexShader,
              fragmentShader: hn.background.fragmentShader,
              side: yn,
              depthTest: !1,
              depthWrite: !1,
              fog: !1,
              allowOverride: !1,
            }),
          )),
          c.geometry.deleteAttribute('normal'),
          Object.defineProperty(c.material, 'map', {
            get: function () {
              return this.uniforms.t2D.value;
            },
          }),
          n.update(c)),
        (c.material.uniforms.t2D.value = S),
        (c.material.uniforms.backgroundIntensity.value = T.backgroundIntensity),
        (c.material.toneMapped = Ge.getTransfer(S.colorSpace) !== Ye),
        S.matrixAutoUpdate === !0 && S.updateMatrix(),
        c.material.uniforms.uvTransform.value.copy(S.matrix),
        (d !== S || m !== S.version || h !== i.toneMapping) &&
          ((c.material.needsUpdate = !0), (d = S), (m = S.version), (h = i.toneMapping)),
        c.layers.enableAll(),
        v.unshift(c, c.geometry, c.material, 0, 0, null));
  }
  function p(v, T) {
    v.getRGB(Ra, _l(i)), t.buffers.color.setClear(Ra.r, Ra.g, Ra.b, T, r);
  }
  function u() {
    l !== void 0 && (l.geometry.dispose(), l.material.dispose(), (l = void 0)),
      c !== void 0 && (c.geometry.dispose(), c.material.dispose(), (c = void 0));
  }
  return {
    getClearColor: () => a,
    setClearColor: (v, T = 1) => {
      a.set(v), (o = T), p(a, o);
    },
    getClearAlpha: () => o,
    setClearAlpha: (v) => {
      (o = v), p(a, o);
    },
    render: g,
    addToRenderList: y,
    dispose: u,
  };
}
function fp(i, e) {
  let t = i.getParameter(i.MAX_VERTEX_ATTRIBS),
    n = {},
    s = h(null),
    r = s,
    a = !1;
  function o(C, N, O, W, z) {
    let G = !1,
      F = m(C, W, O, N);
    r !== F && ((r = F), l(r.object)),
      (G = f(C, W, O, z)),
      G && g(C, W, O, z),
      z !== null && e.update(z, i.ELEMENT_ARRAY_BUFFER),
      (G || a) && ((a = !1), S(C, N, O, W), z !== null && i.bindBuffer(i.ELEMENT_ARRAY_BUFFER, e.get(z).buffer));
  }
  function c() {
    return i.createVertexArray();
  }
  function l(C) {
    return i.bindVertexArray(C);
  }
  function d(C) {
    return i.deleteVertexArray(C);
  }
  function m(C, N, O, W) {
    let z = W.wireframe === !0,
      G = n[N.id];
    G === void 0 && ((G = {}), (n[N.id] = G));
    let F = C.isInstancedMesh === !0 ? C.id : 0,
      j = G[F];
    j === void 0 && ((j = {}), (G[F] = j));
    let $ = j[O.id];
    $ === void 0 && (($ = {}), (j[O.id] = $));
    let ce = $[z];
    return ce === void 0 && ((ce = h(c())), ($[z] = ce)), ce;
  }
  function h(C) {
    const N = [],
      O = [],
      W = [];
    for (let z = 0; z < t; z++) (N[z] = 0), (O[z] = 0), (W[z] = 0);
    return {
      geometry: null,
      program: null,
      wireframe: !1,
      newAttributes: N,
      enabledAttributes: O,
      attributeDivisors: W,
      object: C,
      attributes: {},
      index: null,
    };
  }
  function f(C, N, O, W) {
    let z = r.attributes,
      G = N.attributes,
      F = 0,
      j = O.getAttributes();
    for (const $ in j)
      if (j[$].location >= 0) {
        let pe = z[$],
          ue = G[$];
        if (
          (ue === void 0 &&
            ($ === 'instanceMatrix' && C.instanceMatrix && (ue = C.instanceMatrix),
            $ === 'instanceColor' && C.instanceColor && (ue = C.instanceColor)),
          pe === void 0 || pe.attribute !== ue || (ue && pe.data !== ue.data))
        )
          return !0;
        F++;
      }
    return r.attributesNum !== F || r.index !== W;
  }
  function g(C, N, O, W) {
    let z = {},
      G = N.attributes,
      F = 0,
      j = O.getAttributes();
    for (const $ in j)
      if (j[$].location >= 0) {
        let pe = G[$];
        pe === void 0 &&
          ($ === 'instanceMatrix' && C.instanceMatrix && (pe = C.instanceMatrix),
          $ === 'instanceColor' && C.instanceColor && (pe = C.instanceColor));
        const ue = {};
        (ue.attribute = pe), pe?.data && (ue.data = pe.data), (z[$] = ue), F++;
      }
    (r.attributes = z), (r.attributesNum = F), (r.index = W);
  }
  function y() {
    const C = r.newAttributes;
    for (let N = 0, O = C.length; N < O; N++) C[N] = 0;
  }
  function p(C) {
    u(C, 0);
  }
  function u(C, N) {
    const O = r.newAttributes,
      W = r.enabledAttributes,
      z = r.attributeDivisors;
    (O[C] = 1),
      W[C] === 0 && (i.enableVertexAttribArray(C), (W[C] = 1)),
      z[C] !== N && (i.vertexAttribDivisor(C, N), (z[C] = N));
  }
  function v() {
    const C = r.newAttributes,
      N = r.enabledAttributes;
    for (let O = 0, W = N.length; O < W; O++) N[O] !== C[O] && (i.disableVertexAttribArray(O), (N[O] = 0));
  }
  function T(C, N, O, W, z, G, F) {
    F === !0 ? i.vertexAttribIPointer(C, N, O, z, G) : i.vertexAttribPointer(C, N, O, W, z, G);
  }
  function S(C, N, O, W) {
    y();
    const z = W.attributes,
      G = O.getAttributes(),
      F = N.defaultAttributeValues;
    for (const j in G) {
      const $ = G[j];
      if ($.location >= 0) {
        let ce = z[j];
        if (
          (ce === void 0 &&
            (j === 'instanceMatrix' && C.instanceMatrix && (ce = C.instanceMatrix),
            j === 'instanceColor' && C.instanceColor && (ce = C.instanceColor)),
          ce !== void 0)
        ) {
          const pe = ce.normalized,
            ue = ce.itemSize,
            Ne = e.get(ce);
          if (Ne === void 0) continue;
          const rt = Ne.buffer,
            st = Ne.type,
            Z = Ne.bytesPerElement,
            ne = st === i.INT || st === i.UNSIGNED_INT || ce.gpuType === Hr;
          if (ce.isInterleavedBufferAttribute) {
            const re = ce.data,
              Ue = re.stride,
              we = ce.offset;
            if (re.isInstancedInterleavedBuffer) {
              for (let Ie = 0; Ie < $.locationSize; Ie++) u($.location + Ie, re.meshPerAttribute);
              C.isInstancedMesh !== !0 &&
                W._maxInstanceCount === void 0 &&
                (W._maxInstanceCount = re.meshPerAttribute * re.count);
            } else for (let Ie = 0; Ie < $.locationSize; Ie++) p($.location + Ie);
            i.bindBuffer(i.ARRAY_BUFFER, rt);
            for (let Ie = 0; Ie < $.locationSize; Ie++)
              T($.location + Ie, ue / $.locationSize, st, pe, Ue * Z, (we + (ue / $.locationSize) * Ie) * Z, ne);
          } else {
            if (ce.isInstancedBufferAttribute) {
              for (let re = 0; re < $.locationSize; re++) u($.location + re, ce.meshPerAttribute);
              C.isInstancedMesh !== !0 &&
                W._maxInstanceCount === void 0 &&
                (W._maxInstanceCount = ce.meshPerAttribute * ce.count);
            } else for (let re = 0; re < $.locationSize; re++) p($.location + re);
            i.bindBuffer(i.ARRAY_BUFFER, rt);
            for (let re = 0; re < $.locationSize; re++)
              T($.location + re, ue / $.locationSize, st, pe, ue * Z, (ue / $.locationSize) * re * Z, ne);
          }
        } else if (F !== void 0) {
          const pe = F[j];
          if (pe !== void 0)
            switch (pe.length) {
              case 2:
                i.vertexAttrib2fv($.location, pe);
                break;
              case 3:
                i.vertexAttrib3fv($.location, pe);
                break;
              case 4:
                i.vertexAttrib4fv($.location, pe);
                break;
              default:
                i.vertexAttrib1fv($.location, pe);
            }
        }
      }
    }
    v();
  }
  function w() {
    b();
    for (const C in n) {
      const N = n[C];
      for (const O in N) {
        const W = N[O];
        for (const z in W) {
          const G = W[z];
          for (const F in G) d(G[F].object), delete G[F];
          delete W[z];
        }
      }
      delete n[C];
    }
  }
  function E(C) {
    if (n[C.id] === void 0) return;
    const N = n[C.id];
    for (const O in N) {
      const W = N[O];
      for (const z in W) {
        const G = W[z];
        for (const F in G) d(G[F].object), delete G[F];
        delete W[z];
      }
    }
    delete n[C.id];
  }
  function R(C) {
    for (const N in n) {
      const O = n[N];
      for (const W in O) {
        const z = O[W];
        if (z[C.id] === void 0) continue;
        const G = z[C.id];
        for (const F in G) d(G[F].object), delete G[F];
        delete z[C.id];
      }
    }
  }
  function x(C) {
    for (const N in n) {
      const O = n[N],
        W = C.isInstancedMesh === !0 ? C.id : 0,
        z = O[W];
      if (z !== void 0) {
        for (const G in z) {
          const F = z[G];
          for (const j in F) d(F[j].object), delete F[j];
          delete z[G];
        }
        delete O[W], Object.keys(O).length === 0 && delete n[N];
      }
    }
  }
  function b() {
    k(), (a = !0), r !== s && ((r = s), l(r.object));
  }
  function k() {
    (s.geometry = null), (s.program = null), (s.wireframe = !1);
  }
  return {
    setup: o,
    reset: b,
    resetDefaultState: k,
    dispose: w,
    releaseStatesOfGeometry: E,
    releaseStatesOfObject: x,
    releaseStatesOfProgram: R,
    initAttributes: y,
    enableAttribute: p,
    disableUnusedAttributes: v,
  };
}
function pp(i, e, t) {
  let n;
  function s(l) {
    n = l;
  }
  function r(l, d) {
    i.drawArrays(n, l, d), t.update(d, n, 1);
  }
  function a(l, d, m) {
    m !== 0 && (i.drawArraysInstanced(n, l, d, m), t.update(d, n, m));
  }
  function o(l, d, m) {
    if (m === 0) return;
    e.get('WEBGL_multi_draw').multiDrawArraysWEBGL(n, l, 0, d, 0, m);
    let f = 0;
    for (let g = 0; g < m; g++) f += d[g];
    t.update(f, n, 1);
  }
  function c(l, d, m, h) {
    if (m === 0) return;
    const f = e.get('WEBGL_multi_draw');
    if (f === null) for (let g = 0; g < l.length; g++) a(l[g], d[g], h[g]);
    else {
      f.multiDrawArraysInstancedWEBGL(n, l, 0, d, 0, h, 0, m);
      let g = 0;
      for (let y = 0; y < m; y++) g += d[y] * h[y];
      t.update(g, n, 1);
    }
  }
  (this.setMode = s),
    (this.render = r),
    (this.renderInstances = a),
    (this.renderMultiDraw = o),
    (this.renderMultiDrawInstances = c);
}
function mp(i, e, t, n) {
  let s;
  function r() {
    if (s !== void 0) return s;
    if (e.has('EXT_texture_filter_anisotropic') === !0) {
      const R = e.get('EXT_texture_filter_anisotropic');
      s = i.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    } else s = 0;
    return s;
  }
  function a(R) {
    return !(R !== Vt && n.convert(R) !== i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT));
  }
  function o(R) {
    const x = R === on && (e.has('EXT_color_buffer_half_float') || e.has('EXT_color_buffer_float'));
    return !(R !== It && n.convert(R) !== i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE) && R !== Jt && !x);
  }
  function c(R) {
    if (R === 'highp') {
      if (
        i.getShaderPrecisionFormat(i.VERTEX_SHADER, i.HIGH_FLOAT).precision > 0 &&
        i.getShaderPrecisionFormat(i.FRAGMENT_SHADER, i.HIGH_FLOAT).precision > 0
      )
        return 'highp';
      R = 'mediump';
    }
    return R === 'mediump' &&
      i.getShaderPrecisionFormat(i.VERTEX_SHADER, i.MEDIUM_FLOAT).precision > 0 &&
      i.getShaderPrecisionFormat(i.FRAGMENT_SHADER, i.MEDIUM_FLOAT).precision > 0
      ? 'mediump'
      : 'lowp';
  }
  let l = t.precision !== void 0 ? t.precision : 'highp',
    d = c(l);
  d !== l && (Ee('WebGLRenderer:', l, 'not supported, using', d, 'instead.'), (l = d));
  const m = t.logarithmicDepthBuffer === !0,
    h = t.reversedDepthBuffer === !0 && e.has('EXT_clip_control'),
    f = i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),
    g = i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    y = i.getParameter(i.MAX_TEXTURE_SIZE),
    p = i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),
    u = i.getParameter(i.MAX_VERTEX_ATTRIBS),
    v = i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),
    T = i.getParameter(i.MAX_VARYING_VECTORS),
    S = i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),
    w = i.getParameter(i.MAX_SAMPLES),
    E = i.getParameter(i.SAMPLES);
  return {
    isWebGL2: !0,
    getMaxAnisotropy: r,
    getMaxPrecision: c,
    textureFormatReadable: a,
    textureTypeReadable: o,
    precision: l,
    logarithmicDepthBuffer: m,
    reversedDepthBuffer: h,
    maxTextures: f,
    maxVertexTextures: g,
    maxTextureSize: y,
    maxCubemapSize: p,
    maxAttributes: u,
    maxVertexUniforms: v,
    maxVaryings: T,
    maxFragmentUniforms: S,
    maxSamples: w,
    samples: E,
  };
}
function gp(i) {
  let e = this,
    t = null,
    n = 0,
    s = !1,
    r = !1,
    a = new jt(),
    o = new De(),
    c = { value: null, needsUpdate: !1 };
  (this.uniform = c),
    (this.numPlanes = 0),
    (this.numIntersection = 0),
    (this.init = (m, h) => {
      const f = m.length !== 0 || h || n !== 0 || s;
      return (s = h), (n = m.length), f;
    }),
    (this.beginShadows = () => {
      (r = !0), d(null);
    }),
    (this.endShadows = () => {
      r = !1;
    }),
    (this.setGlobalState = (m, h) => {
      t = d(m, h, 0);
    }),
    (this.setState = function (m, h, f) {
      const g = m.clippingPlanes,
        y = m.clipIntersection,
        p = m.clipShadows,
        u = i.get(m);
      if (!s || g === null || g.length === 0 || (r && !p)) r ? d(null) : l();
      else {
        let v = r ? 0 : n,
          T = v * 4,
          S = u.clippingState || null;
        (c.value = S), (S = d(g, h, T, f));
        for (let w = 0; w !== T; ++w) S[w] = t[w];
        (u.clippingState = S), (this.numIntersection = y ? this.numPlanes : 0), (this.numPlanes += v);
      }
    });
  function l() {
    c.value !== t && ((c.value = t), (c.needsUpdate = n > 0)), (e.numPlanes = n), (e.numIntersection = 0);
  }
  function d(m, h, f, g) {
    let y = m !== null ? m.length : 0,
      p = null;
    if (y !== 0) {
      if (((p = c.value), g !== !0 || p === null)) {
        const u = f + y * 4,
          v = h.matrixWorldInverse;
        o.getNormalMatrix(v), (p === null || p.length < u) && (p = new Float32Array(u));
        for (let T = 0, S = f; T !== y; ++T, S += 4)
          a.copy(m[T]).applyMatrix4(v, o), a.normal.toArray(p, S), (p[S + 3] = a.constant);
      }
      (c.value = p), (c.needsUpdate = !0);
    }
    return (e.numPlanes = y), (e.numIntersection = 0), p;
  }
}
var Hn = 4,
  uh = [0.125, 0.215, 0.35, 0.446, 0.526, 0.582],
  li = 20,
  _p = 256,
  ys = new ds(),
  dh = new Ve(),
  Ml = null,
  Sl = 0,
  bl = 0,
  Tl = !1,
  xp = new L(),
  Pa = class {
    constructor(e) {
      (this._renderer = e),
        (this._pingPongRenderTarget = null),
        (this._lodMax = 0),
        (this._cubeSize = 0),
        (this._sizeLods = []),
        (this._sigmas = []),
        (this._lodMeshes = []),
        (this._backgroundBox = null),
        (this._cubemapMaterial = null),
        (this._equirectMaterial = null),
        (this._blurMaterial = null),
        (this._ggxMaterial = null);
    }
    fromScene(e, t = 0, n = 0.1, s = 100, r = {}) {
      const { size: a = 256, position: o = xp } = r;
      (Ml = this._renderer.getRenderTarget()),
        (Sl = this._renderer.getActiveCubeFace()),
        (bl = this._renderer.getActiveMipmapLevel()),
        (Tl = this._renderer.xr.enabled),
        (this._renderer.xr.enabled = !1),
        this._setSize(a);
      const c = this._allocateTargets();
      return (
        (c.depthBuffer = !0),
        this._sceneToCubeUV(e, n, s, c, o),
        t > 0 && this._blur(c, 0, 0, t),
        this._applyPMREM(c),
        this._cleanup(c),
        c
      );
    }
    fromEquirectangular(e, t = null) {
      return this._fromTexture(e, t);
    }
    fromCubemap(e, t = null) {
      return this._fromTexture(e, t);
    }
    compileCubemapShader() {
      this._cubemapMaterial === null && ((this._cubemapMaterial = mh()), this._compileMaterial(this._cubemapMaterial));
    }
    compileEquirectangularShader() {
      this._equirectMaterial === null &&
        ((this._equirectMaterial = ph()), this._compileMaterial(this._equirectMaterial));
    }
    dispose() {
      this._dispose(),
        this._cubemapMaterial?.dispose(),
        this._equirectMaterial?.dispose(),
        this._backgroundBox !== null &&
          (this._backgroundBox.geometry.dispose(), this._backgroundBox.material.dispose());
    }
    _setSize(e) {
      (this._lodMax = Math.floor(Math.log2(e))), (this._cubeSize = 2 ** this._lodMax);
    }
    _dispose() {
      this._blurMaterial?.dispose(), this._ggxMaterial?.dispose(), this._pingPongRenderTarget?.dispose();
      for (let e = 0; e < this._lodMeshes.length; e++) this._lodMeshes[e].geometry.dispose();
    }
    _cleanup(e) {
      this._renderer.setRenderTarget(Ml, Sl, bl),
        (this._renderer.xr.enabled = Tl),
        (e.scissorTest = !1),
        Bi(e, 0, 0, e.width, e.height);
    }
    _fromTexture(e, t) {
      e.mapping === Vn || e.mapping === ii
        ? this._setSize(e.image.length === 0 ? 16 : e.image[0].width || e.image[0].image.width)
        : this._setSize(e.image.width / 4),
        (Ml = this._renderer.getRenderTarget()),
        (Sl = this._renderer.getActiveCubeFace()),
        (bl = this._renderer.getActiveMipmapLevel()),
        (Tl = this._renderer.xr.enabled),
        (this._renderer.xr.enabled = !1);
      const n = t || this._allocateTargets();
      return this._textureToCubeUV(e, n), this._applyPMREM(n), this._cleanup(n), n;
    }
    _allocateTargets() {
      const e = 3 * Math.max(this._cubeSize, 112),
        t = 4 * this._cubeSize,
        n = {
          magFilter: Mt,
          minFilter: Mt,
          generateMipmaps: !1,
          type: on,
          format: Vt,
          colorSpace: ti,
          depthBuffer: !1,
        },
        s = fh(e, t, n);
      if (
        this._pingPongRenderTarget === null ||
        this._pingPongRenderTarget.width !== e ||
        this._pingPongRenderTarget.height !== t
      ) {
        this._pingPongRenderTarget !== null && this._dispose(), (this._pingPongRenderTarget = fh(e, t, n));
        const { _lodMax: r } = this;
        ({ lodMeshes: this._lodMeshes, sizeLods: this._sizeLods, sigmas: this._sigmas } = vp(r)),
          (this._blurMaterial = Mp(r, e, t)),
          (this._ggxMaterial = yp(r, e, t));
      }
      return s;
    }
    _compileMaterial(e) {
      const t = new zt(new ft(), e);
      this._renderer.compile(t, ys);
    }
    _sceneToCubeUV(e, t, n, s, r) {
      const c = new wt(90, 1, t, n),
        l = [1, -1, 1, 1, 1, 1],
        d = [1, 1, 1, -1, -1, -1],
        m = this._renderer,
        h = m.autoClear,
        f = m.toneMapping;
      m.getClearColor(dh),
        (m.toneMapping = Yt),
        (m.autoClear = !1),
        m.state.buffers.depth.getReversed() && (m.setRenderTarget(s), m.clearDepth(), m.setRenderTarget(null)),
        this._backgroundBox === null &&
          (this._backgroundBox = new zt(
            new Ui(),
            new rs({ name: 'PMREM.Background', side: Ct, depthWrite: !1, depthTest: !1 }),
          ));
      let y = this._backgroundBox,
        p = y.material,
        u = !1,
        v = e.background;
      v ? v.isColor && (p.color.copy(v), (e.background = null), (u = !0)) : (p.color.copy(dh), (u = !0));
      for (let T = 0; T < 6; T++) {
        const S = T % 3;
        S === 0
          ? (c.up.set(0, l[T], 0), c.position.set(r.x, r.y, r.z), c.lookAt(r.x + d[T], r.y, r.z))
          : S === 1
            ? (c.up.set(0, 0, l[T]), c.position.set(r.x, r.y, r.z), c.lookAt(r.x, r.y + d[T], r.z))
            : (c.up.set(0, l[T], 0), c.position.set(r.x, r.y, r.z), c.lookAt(r.x, r.y, r.z + d[T]));
        const w = this._cubeSize;
        Bi(s, S * w, T > 2 ? w : 0, w, w), m.setRenderTarget(s), u && m.render(y, c), m.render(e, c);
      }
      (m.toneMapping = f), (m.autoClear = h), (e.background = v);
    }
    _textureToCubeUV(e, t) {
      const n = this._renderer,
        s = e.mapping === Vn || e.mapping === ii;
      s
        ? (this._cubemapMaterial === null && (this._cubemapMaterial = mh()),
          (this._cubemapMaterial.uniforms.flipEnvMap.value = e.isRenderTargetTexture === !1 ? -1 : 1))
        : this._equirectMaterial === null && (this._equirectMaterial = ph());
      const r = s ? this._cubemapMaterial : this._equirectMaterial,
        a = this._lodMeshes[0];
      a.material = r;
      const o = r.uniforms;
      o.envMap.value = e;
      const c = this._cubeSize;
      Bi(t, 0, 0, 3 * c, 2 * c), n.setRenderTarget(t), n.render(a, ys);
    }
    _applyPMREM(e) {
      const t = this._renderer,
        n = t.autoClear;
      t.autoClear = !1;
      const s = this._lodMeshes.length;
      for (let r = 1; r < s; r++) this._applyGGXFilter(e, r - 1, r);
      t.autoClear = n;
    }
    _applyGGXFilter(e, t, n) {
      const s = this._renderer,
        r = this._pingPongRenderTarget,
        a = this._ggxMaterial,
        o = this._lodMeshes[n];
      o.material = a;
      const c = a.uniforms,
        l = n / (this._lodMeshes.length - 1),
        d = t / (this._lodMeshes.length - 1),
        m = Math.sqrt(l * l - d * d),
        h = 0 + l * 1.25,
        f = m * h,
        { _lodMax: g } = this,
        y = this._sizeLods[n],
        p = 3 * y * (n > g - Hn ? n - g + Hn : 0),
        u = 4 * (this._cubeSize - y);
      (c.envMap.value = e.texture),
        (c.roughness.value = f),
        (c.mipInt.value = g - t),
        Bi(r, p, u, 3 * y, 2 * y),
        s.setRenderTarget(r),
        s.render(o, ys),
        (c.envMap.value = r.texture),
        (c.roughness.value = 0),
        (c.mipInt.value = g - n),
        Bi(e, p, u, 3 * y, 2 * y),
        s.setRenderTarget(e),
        s.render(o, ys);
    }
    _blur(e, t, n, s, r) {
      const a = this._pingPongRenderTarget;
      this._halfBlur(e, a, t, n, s, 'latitudinal', r), this._halfBlur(a, e, n, n, s, 'longitudinal', r);
    }
    _halfBlur(e, t, n, s, r, a, o) {
      const c = this._renderer,
        l = this._blurMaterial;
      a !== 'latitudinal' && a !== 'longitudinal' && Ae('blur direction must be either latitudinal or longitudinal!');
      const d = 3,
        m = this._lodMeshes[s];
      m.material = l;
      const h = l.uniforms,
        f = this._sizeLods[n] - 1,
        g = Number.isFinite(r) ? Math.PI / (2 * f) : (2 * Math.PI) / (2 * li - 1),
        y = r / g,
        p = Number.isFinite(r) ? 1 + Math.floor(d * y) : li;
      p > li &&
        Ee(
          `sigmaRadians, ${r}, is too large and will clip, as it requested ${p} samples when the maximum is set to ${li}`,
        );
      let u = [],
        v = 0;
      for (let R = 0; R < li; ++R) {
        const x = R / y,
          b = Math.exp((-x * x) / 2);
        u.push(b), R === 0 ? (v += b) : R < p && (v += 2 * b);
      }
      for (let R = 0; R < u.length; R++) u[R] = u[R] / v;
      (h.envMap.value = e.texture),
        (h.samples.value = p),
        (h.weights.value = u),
        (h.latitudinal.value = a === 'latitudinal'),
        o && (h.poleAxis.value = o);
      const { _lodMax: T } = this;
      (h.dTheta.value = g), (h.mipInt.value = T - n);
      const S = this._sizeLods[s],
        w = 3 * S * (s > T - Hn ? s - T + Hn : 0),
        E = 4 * (this._cubeSize - S);
      Bi(t, w, E, 3 * S, 2 * S), c.setRenderTarget(t), c.render(m, ys);
    }
  };
function vp(i) {
  let e = [],
    t = [],
    n = [],
    s = i,
    r = i - Hn + 1 + uh.length;
  for (let a = 0; a < r; a++) {
    const o = 2 ** s;
    e.push(o);
    let c = 1 / o;
    a > i - Hn ? (c = uh[a - i + Hn - 1]) : a === 0 && (c = 0), t.push(c);
    const l = 1 / (o - 2),
      d = -l,
      m = 1 + l,
      h = [d, d, m, d, m, m, d, d, m, m, d, m],
      f = 6,
      g = 6,
      y = 3,
      p = 2,
      u = 1,
      v = new Float32Array(y * g * f),
      T = new Float32Array(p * g * f),
      S = new Float32Array(u * g * f);
    for (let E = 0; E < f; E++) {
      const R = ((E % 3) * 2) / 3 - 1,
        x = E > 2 ? 0 : -1,
        b = [R, x, 0, R + 2 / 3, x, 0, R + 2 / 3, x + 1, 0, R, x, 0, R + 2 / 3, x + 1, 0, R, x + 1, 0];
      v.set(b, y * g * E), T.set(h, p * g * E);
      const k = [E, E, E, E, E, E];
      S.set(k, u * g * E);
    }
    const w = new ft();
    w.setAttribute('position', new Rt(v, y)),
      w.setAttribute('uv', new Rt(T, p)),
      w.setAttribute('faceIndex', new Rt(S, u)),
      n.push(new zt(w, null)),
      s > Hn && s--;
  }
  return { lodMeshes: n, sizeLods: e, sigmas: t };
}
function fh(i, e, t) {
  const n = new Nt(i, e, t);
  return (n.texture.mapping = ps), (n.texture.name = 'PMREM.cubeUv'), (n.scissorTest = !0), n;
}
function Bi(i, e, t, n, s) {
  i.viewport.set(e, t, n, s), i.scissor.set(e, t, n, s);
}
function yp(i, e, t) {
  return new Ft({
    name: 'PMREMGGXConvolution',
    defines: { GGX_SAMPLES: _p, CUBEUV_TEXEL_WIDTH: 1 / e, CUBEUV_TEXEL_HEIGHT: 1 / t, CUBEUV_MAX_MIP: `${i}.0` },
    uniforms: { envMap: { value: null }, roughness: { value: 0 }, mipInt: { value: 0 } },
    vertexShader: Da(),
    fragmentShader: `

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,
    blending: an,
    depthTest: !1,
    depthWrite: !1,
  });
}
function Mp(i, e, t) {
  const n = new Float32Array(li),
    s = new L(0, 1, 0);
  return new Ft({
    name: 'SphericalGaussianBlur',
    defines: { n: li, CUBEUV_TEXEL_WIDTH: 1 / e, CUBEUV_TEXEL_HEIGHT: 1 / t, CUBEUV_MAX_MIP: `${i}.0` },
    uniforms: {
      envMap: { value: null },
      samples: { value: 1 },
      weights: { value: n },
      latitudinal: { value: !1 },
      dTheta: { value: 0 },
      mipInt: { value: 0 },
      poleAxis: { value: s },
    },
    vertexShader: Da(),
    fragmentShader: `

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,
    blending: an,
    depthTest: !1,
    depthWrite: !1,
  });
}
function ph() {
  return new Ft({
    name: 'EquirectangularToCubeUV',
    uniforms: { envMap: { value: null } },
    vertexShader: Da(),
    fragmentShader: `

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,
    blending: an,
    depthTest: !1,
    depthWrite: !1,
  });
}
function mh() {
  return new Ft({
    name: 'CubemapToCubeUV',
    uniforms: { envMap: { value: null }, flipEnvMap: { value: -1 } },
    vertexShader: Da(),
    fragmentShader: `

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,
    blending: an,
    depthTest: !1,
    depthWrite: !1,
  });
}
function Da() {
  return `

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`;
}
var La = class extends Nt {
  constructor(e = 1, t = {}) {
    super(e, e, t), (this.isWebGLCubeRenderTarget = !0);
    const n = { width: e, height: e, depth: 1 },
      s = [n, n, n, n, n, n];
    (this.texture = new as(s)), this._setTextureOptions(t), (this.texture.isRenderTargetTexture = !0);
  }
  fromEquirectangularTexture(e, t) {
    (this.texture.type = t.type),
      (this.texture.colorSpace = t.colorSpace),
      (this.texture.generateMipmaps = t.generateMipmaps),
      (this.texture.minFilter = t.minFilter),
      (this.texture.magFilter = t.magFilter);
    const n = {
        uniforms: { tEquirect: { value: null } },
        vertexShader: `

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,
        fragmentShader: `

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`,
      },
      s = new Ui(5, 5, 5),
      r = new Ft({
        name: 'CubemapFromEquirect',
        uniforms: ri(n.uniforms),
        vertexShader: n.vertexShader,
        fragmentShader: n.fragmentShader,
        side: Ct,
        blending: an,
      });
    r.uniforms.tEquirect.value = t;
    const a = new zt(s, r),
      o = t.minFilter;
    return (
      t.minFilter === kn && (t.minFilter = Mt),
      new Br(1, 10, this).update(e, a),
      (t.minFilter = o),
      a.geometry.dispose(),
      a.material.dispose(),
      this
    );
  }
  clear(e, t = !0, n = !0, s = !0) {
    const r = e.getRenderTarget();
    for (let a = 0; a < 6; a++) e.setRenderTarget(this, a), e.clear(t, n, s);
    e.setRenderTarget(r);
  }
};
function Sp(i) {
  let e = new WeakMap(),
    t = new WeakMap(),
    n = null;
  function s(h, f = !1) {
    return h == null ? null : f ? a(h) : r(h);
  }
  function r(h) {
    if (h?.isTexture) {
      const f = h.mapping;
      if (f === Vr || f === kr)
        if (e.has(h)) {
          const g = e.get(h).texture;
          return o(g, h.mapping);
        } else {
          const g = h.image;
          if (g && g.height > 0) {
            const y = new La(g.height);
            return (
              y.fromEquirectangularTexture(i, h), e.set(h, y), h.addEventListener('dispose', l), o(y.texture, h.mapping)
            );
          } else return null;
        }
    }
    return h;
  }
  function a(h) {
    if (h?.isTexture) {
      const f = h.mapping,
        g = f === Vr || f === kr,
        y = f === Vn || f === ii;
      if (g || y) {
        let p = t.get(h),
          u = p !== void 0 ? p.texture.pmremVersion : 0;
        if (h.isRenderTargetTexture && h.pmremVersion !== u)
          return (
            n === null && (n = new Pa(i)),
            (p = g ? n.fromEquirectangular(h, p) : n.fromCubemap(h, p)),
            (p.texture.pmremVersion = h.pmremVersion),
            t.set(h, p),
            p.texture
          );
        if (p !== void 0) return p.texture;
        {
          const v = h.image;
          return (g && v && v.height > 0) || (y && v && c(v))
            ? (n === null && (n = new Pa(i)),
              (p = g ? n.fromEquirectangular(h) : n.fromCubemap(h)),
              (p.texture.pmremVersion = h.pmremVersion),
              t.set(h, p),
              h.addEventListener('dispose', d),
              p.texture)
            : null;
        }
      }
    }
    return h;
  }
  function o(h, f) {
    return f === Vr ? (h.mapping = Vn) : f === kr && (h.mapping = ii), h;
  }
  function c(h) {
    let f = 0,
      g = 6;
    for (let y = 0; y < g; y++) h[y] !== void 0 && f++;
    return f === g;
  }
  function l(h) {
    const f = h.target;
    f.removeEventListener('dispose', l);
    const g = e.get(f);
    g !== void 0 && (e.delete(f), g.dispose());
  }
  function d(h) {
    const f = h.target;
    f.removeEventListener('dispose', d);
    const g = t.get(f);
    g !== void 0 && (t.delete(f), g.dispose());
  }
  function m() {
    (e = new WeakMap()), (t = new WeakMap()), n !== null && (n.dispose(), (n = null));
  }
  return { get: s, dispose: m };
}
function bp(i) {
  const e = {};
  function t(n) {
    if (e[n] !== void 0) return e[n];
    const s = i.getExtension(n);
    return (e[n] = s), s;
  }
  return {
    has: (n) => t(n) !== null,
    init: () => {
      t('EXT_color_buffer_float'),
        t('WEBGL_clip_cull_distance'),
        t('OES_texture_float_linear'),
        t('EXT_color_buffer_half_float'),
        t('WEBGL_multisampled_render_to_texture'),
        t('WEBGL_render_shared_exponent');
    },
    get: (n) => {
      const s = t(n);
      return s === null && es(`WebGLRenderer: ${n} extension not supported.`), s;
    },
  };
}
function Tp(i, e, t, n) {
  const s = {},
    r = new WeakMap();
  function a(m) {
    const h = m.target;
    h.index !== null && e.remove(h.index);
    for (const g in h.attributes) e.remove(h.attributes[g]);
    h.removeEventListener('dispose', a), delete s[h.id];
    const f = r.get(h);
    f && (e.remove(f), r.delete(h)),
      n.releaseStatesOfGeometry(h),
      h.isInstancedBufferGeometry === !0 && delete h._maxInstanceCount,
      t.memory.geometries--;
  }
  function o(_m, h) {
    return s[h.id] === !0 || (h.addEventListener('dispose', a), (s[h.id] = !0), t.memory.geometries++), h;
  }
  function c(m) {
    const h = m.attributes;
    for (const f in h) e.update(h[f], i.ARRAY_BUFFER);
  }
  function l(m) {
    let h = [],
      f = m.index,
      g = m.attributes.position,
      y = 0;
    if (g === void 0) return;
    if (f !== null) {
      const v = f.array;
      y = f.version;
      for (let T = 0, S = v.length; T < S; T += 3) {
        const w = v[T + 0],
          E = v[T + 1],
          R = v[T + 2];
        h.push(w, E, E, R, R, w);
      }
    } else {
      const v = g.array;
      y = g.version;
      for (let T = 0, S = v.length / 3 - 1; T < S; T += 3) {
        const w = T + 0,
          E = T + 1,
          R = T + 2;
        h.push(w, E, E, R, R, w);
      }
    }
    const p = new (g.count >= 65535 ? is : ns)(h, 1);
    p.version = y;
    const u = r.get(m);
    u && e.remove(u), r.set(m, p);
  }
  function d(m) {
    const h = r.get(m);
    if (h) {
      const f = m.index;
      f !== null && h.version < f.version && l(m);
    } else l(m);
    return r.get(m);
  }
  return { get: o, update: c, getWireframeAttribute: d };
}
function Ap(i, e, t) {
  let n;
  function s(h) {
    n = h;
  }
  let r, a;
  function o(h) {
    (r = h.type), (a = h.bytesPerElement);
  }
  function c(h, f) {
    i.drawElements(n, f, r, h * a), t.update(f, n, 1);
  }
  function l(h, f, g) {
    g !== 0 && (i.drawElementsInstanced(n, f, r, h * a, g), t.update(f, n, g));
  }
  function d(h, f, g) {
    if (g === 0) return;
    e.get('WEBGL_multi_draw').multiDrawElementsWEBGL(n, f, 0, r, h, 0, g);
    let p = 0;
    for (let u = 0; u < g; u++) p += f[u];
    t.update(p, n, 1);
  }
  function m(h, f, g, y) {
    if (g === 0) return;
    const p = e.get('WEBGL_multi_draw');
    if (p === null) for (let u = 0; u < h.length; u++) l(h[u] / a, f[u], y[u]);
    else {
      p.multiDrawElementsInstancedWEBGL(n, f, 0, r, h, 0, y, 0, g);
      let u = 0;
      for (let v = 0; v < g; v++) u += f[v] * y[v];
      t.update(u, n, 1);
    }
  }
  (this.setMode = s),
    (this.setIndex = o),
    (this.render = c),
    (this.renderInstances = l),
    (this.renderMultiDraw = d),
    (this.renderMultiDrawInstances = m);
}
function Ep(i) {
  const e = { geometries: 0, textures: 0 },
    t = { frame: 0, calls: 0, triangles: 0, points: 0, lines: 0 };
  function n(r, a, o) {
    switch ((t.calls++, a)) {
      case i.TRIANGLES:
        t.triangles += o * (r / 3);
        break;
      case i.LINES:
        t.lines += o * (r / 2);
        break;
      case i.LINE_STRIP:
        t.lines += o * (r - 1);
        break;
      case i.LINE_LOOP:
        t.lines += o * r;
        break;
      case i.POINTS:
        t.points += o * r;
        break;
      default:
        Ae('WebGLInfo: Unknown draw mode:', a);
        break;
    }
  }
  function s() {
    (t.calls = 0), (t.triangles = 0), (t.points = 0), (t.lines = 0);
  }
  return { memory: e, render: t, programs: null, autoReset: !0, reset: s, update: n };
}
function wp(i, e, t) {
  const n = new WeakMap(),
    s = new at();
  function r(a, o, c) {
    let l = a.morphTargetInfluences,
      d = o.morphAttributes.position || o.morphAttributes.normal || o.morphAttributes.color,
      m = d !== void 0 ? d.length : 0,
      h = n.get(o);
    if (h === void 0 || h.count !== m) {
      const k = () => {
        x.dispose(), n.delete(o), o.removeEventListener('dispose', k);
      };
      var _f = k;
      h !== void 0 && h.texture.dispose();
      let g = o.morphAttributes.position !== void 0,
        y = o.morphAttributes.normal !== void 0,
        p = o.morphAttributes.color !== void 0,
        u = o.morphAttributes.position || [],
        v = o.morphAttributes.normal || [],
        T = o.morphAttributes.color || [],
        S = 0;
      g === !0 && (S = 1), y === !0 && (S = 2), p === !0 && (S = 3);
      let w = o.attributes.position.count * S,
        E = 1;
      w > e.maxTextureSize && ((E = Math.ceil(w / e.maxTextureSize)), (w = e.maxTextureSize));
      const R = new Float32Array(w * E * 4 * m),
        x = new ts(R, w, E, m);
      (x.type = Jt), (x.needsUpdate = !0);
      const b = S * 4;
      for (let C = 0; C < m; C++) {
        const N = u[C],
          O = v[C],
          W = T[C],
          z = w * E * 4 * C;
        for (let G = 0; G < N.count; G++) {
          const F = G * b;
          g === !0 &&
            (s.fromBufferAttribute(N, G),
            (R[z + F + 0] = s.x),
            (R[z + F + 1] = s.y),
            (R[z + F + 2] = s.z),
            (R[z + F + 3] = 0)),
            y === !0 &&
              (s.fromBufferAttribute(O, G),
              (R[z + F + 4] = s.x),
              (R[z + F + 5] = s.y),
              (R[z + F + 6] = s.z),
              (R[z + F + 7] = 0)),
            p === !0 &&
              (s.fromBufferAttribute(W, G),
              (R[z + F + 8] = s.x),
              (R[z + F + 9] = s.y),
              (R[z + F + 10] = s.z),
              (R[z + F + 11] = W.itemSize === 4 ? s.w : 1));
        }
      }
      (h = { count: m, texture: x, size: new Re(w, E) }), n.set(o, h), o.addEventListener('dispose', k);
    }
    if (a.isInstancedMesh === !0 && a.morphTexture !== null)
      c.getUniforms().setValue(i, 'morphTexture', a.morphTexture, t);
    else {
      let g = 0;
      for (let p = 0; p < l.length; p++) g += l[p];
      const y = o.morphTargetsRelative ? 1 : 1 - g;
      c.getUniforms().setValue(i, 'morphTargetBaseInfluence', y),
        c.getUniforms().setValue(i, 'morphTargetInfluences', l);
    }
    c.getUniforms().setValue(i, 'morphTargetsTexture', h.texture, t),
      c.getUniforms().setValue(i, 'morphTargetsTextureSize', h.size);
  }
  return { update: r };
}
function Cp(i, e, t, n, s) {
  let r = new WeakMap();
  function a(l) {
    const d = s.render.frame,
      m = l.geometry,
      h = e.get(l, m);
    if (
      (r.get(h) !== d && (e.update(h), r.set(h, d)),
      l.isInstancedMesh &&
        (l.hasEventListener('dispose', c) === !1 && l.addEventListener('dispose', c),
        r.get(l) !== d &&
          (t.update(l.instanceMatrix, i.ARRAY_BUFFER),
          l.instanceColor !== null && t.update(l.instanceColor, i.ARRAY_BUFFER),
          r.set(l, d))),
      l.isSkinnedMesh)
    ) {
      const f = l.skeleton;
      r.get(f) !== d && (f.update(), r.set(f, d));
    }
    return h;
  }
  function o() {
    r = new WeakMap();
  }
  function c(l) {
    const d = l.target;
    d.removeEventListener('dispose', c),
      n.releaseStatesOfObject(d),
      t.remove(d.instanceMatrix),
      d.instanceColor !== null && t.remove(d.instanceColor);
  }
  return { update: a, dispose: o };
}
var Rp = {
  [tl]: 'LINEAR_TONE_MAPPING',
  [nl]: 'REINHARD_TONE_MAPPING',
  [il]: 'CINEON_TONE_MAPPING',
  [sl]: 'ACES_FILMIC_TONE_MAPPING',
  [al]: 'AGX_TONE_MAPPING',
  [ol]: 'NEUTRAL_TONE_MAPPING',
  [rl]: 'CUSTOM_TONE_MAPPING',
};
function Ip(i, e, t, n, s) {
  const r = new Nt(e, t, { type: i, depthBuffer: n, stencilBuffer: s }),
    a = new Nt(e, t, { type: on, depthBuffer: !1, stencilBuffer: !1 }),
    o = new ft();
  o.setAttribute('position', new Xe([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)),
    o.setAttribute('uv', new Xe([0, 2, 0, 0, 2, 0], 2));
  let c = new wr({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
      fragmentShader: `
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,
      depthTest: !1,
      depthWrite: !1,
    }),
    l = new zt(o, c),
    d = new ds(-1, 1, 1, -1, 0, 1),
    m = null,
    h = null,
    f = !1,
    g,
    y = null,
    p = [],
    u = !1;
  (this.setSize = (v, T) => {
    r.setSize(v, T), a.setSize(v, T);
    for (let S = 0; S < p.length; S++) {
      const w = p[S];
      w.setSize?.(v, T);
    }
  }),
    (this.setEffects = (v) => {
      (p = v), (u = p.length > 0 && p[0].isRenderPass === !0);
      const T = r.width,
        S = r.height;
      for (let w = 0; w < p.length; w++) {
        const E = p[w];
        E.setSize?.(T, S);
      }
    }),
    (this.begin = function (v, T) {
      if (f || (v.toneMapping === Yt && p.length === 0)) return !1;
      if (((y = T), T !== null)) {
        const S = T.width,
          w = T.height;
        (r.width !== S || r.height !== w) && this.setSize(S, w);
      }
      return u === !1 && v.setRenderTarget(r), (g = v.toneMapping), (v.toneMapping = Yt), !0;
    }),
    (this.hasRenderPass = () => u),
    (this.end = (v, T) => {
      (v.toneMapping = g), (f = !0);
      let S = r,
        w = a;
      for (let E = 0; E < p.length; E++) {
        const R = p[E];
        if (R.enabled !== !1 && (R.render(v, w, S, T), R.needsSwap !== !1)) {
          const x = S;
          (S = w), (w = x);
        }
      }
      if (m !== v.outputColorSpace || h !== v.toneMapping) {
        (m = v.outputColorSpace),
          (h = v.toneMapping),
          (c.defines = {}),
          Ge.getTransfer(m) === Ye && (c.defines.SRGB_TRANSFER = '');
        const E = Rp[h];
        E && (c.defines[E] = ''), (c.needsUpdate = !0);
      }
      (c.uniforms.tDiffuse.value = S.texture), v.setRenderTarget(y), v.render(l, d), (y = null), (f = !1);
    }),
    (this.isCompositing = () => f),
    (this.dispose = () => {
      r.dispose(), a.dispose(), o.dispose(), c.dispose();
    });
}
var Nh = new ln(),
  wl = new Fn(1, 1),
  Fh = new ts(),
  Oh = new gr(),
  Bh = new as(),
  gh = [],
  _h = [],
  xh = new Float32Array(16),
  vh = new Float32Array(9),
  yh = new Float32Array(4);
function Vi(i, e, t) {
  const n = i[0];
  if (n <= 0 || n > 0) return i;
  let s = e * t,
    r = gh[s];
  if ((r === void 0 && ((r = new Float32Array(s)), (gh[s] = r)), e !== 0)) {
    n.toArray(r, 0);
    for (let a = 1, o = 0; a !== e; ++a) (o += t), i[a].toArray(r, o);
  }
  return r;
}
function pt(i, e) {
  if (i.length !== e.length) return !1;
  for (let t = 0, n = i.length; t < n; t++) if (i[t] !== e[t]) return !1;
  return !0;
}
function mt(i, e) {
  for (let t = 0, n = e.length; t < n; t++) i[t] = e[t];
}
function Ua(i, e) {
  let t = _h[e];
  t === void 0 && ((t = new Int32Array(e)), (_h[e] = t));
  for (let n = 0; n !== e; ++n) t[n] = i.allocateTextureUnit();
  return t;
}
function Pp(i, e) {
  const t = this.cache;
  t[0] !== e && (i.uniform1f(this.addr, e), (t[0] = e));
}
function Lp(i, e) {
  const t = this.cache;
  if (e.x !== void 0) (t[0] !== e.x || t[1] !== e.y) && (i.uniform2f(this.addr, e.x, e.y), (t[0] = e.x), (t[1] = e.y));
  else {
    if (pt(t, e)) return;
    i.uniform2fv(this.addr, e), mt(t, e);
  }
}
function Dp(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z) &&
      (i.uniform3f(this.addr, e.x, e.y, e.z), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z));
  else if (e.r !== void 0)
    (t[0] !== e.r || t[1] !== e.g || t[2] !== e.b) &&
      (i.uniform3f(this.addr, e.r, e.g, e.b), (t[0] = e.r), (t[1] = e.g), (t[2] = e.b));
  else {
    if (pt(t, e)) return;
    i.uniform3fv(this.addr, e), mt(t, e);
  }
}
function Up(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z || t[3] !== e.w) &&
      (i.uniform4f(this.addr, e.x, e.y, e.z, e.w), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z), (t[3] = e.w));
  else {
    if (pt(t, e)) return;
    i.uniform4fv(this.addr, e), mt(t, e);
  }
}
function Np(i, e) {
  const t = this.cache,
    n = e.elements;
  if (n === void 0) {
    if (pt(t, e)) return;
    i.uniformMatrix2fv(this.addr, !1, e), mt(t, e);
  } else {
    if (pt(t, n)) return;
    yh.set(n), i.uniformMatrix2fv(this.addr, !1, yh), mt(t, n);
  }
}
function Fp(i, e) {
  const t = this.cache,
    n = e.elements;
  if (n === void 0) {
    if (pt(t, e)) return;
    i.uniformMatrix3fv(this.addr, !1, e), mt(t, e);
  } else {
    if (pt(t, n)) return;
    vh.set(n), i.uniformMatrix3fv(this.addr, !1, vh), mt(t, n);
  }
}
function Op(i, e) {
  const t = this.cache,
    n = e.elements;
  if (n === void 0) {
    if (pt(t, e)) return;
    i.uniformMatrix4fv(this.addr, !1, e), mt(t, e);
  } else {
    if (pt(t, n)) return;
    xh.set(n), i.uniformMatrix4fv(this.addr, !1, xh), mt(t, n);
  }
}
function Bp(i, e) {
  const t = this.cache;
  t[0] !== e && (i.uniform1i(this.addr, e), (t[0] = e));
}
function zp(i, e) {
  const t = this.cache;
  if (e.x !== void 0) (t[0] !== e.x || t[1] !== e.y) && (i.uniform2i(this.addr, e.x, e.y), (t[0] = e.x), (t[1] = e.y));
  else {
    if (pt(t, e)) return;
    i.uniform2iv(this.addr, e), mt(t, e);
  }
}
function Vp(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z) &&
      (i.uniform3i(this.addr, e.x, e.y, e.z), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z));
  else {
    if (pt(t, e)) return;
    i.uniform3iv(this.addr, e), mt(t, e);
  }
}
function kp(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z || t[3] !== e.w) &&
      (i.uniform4i(this.addr, e.x, e.y, e.z, e.w), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z), (t[3] = e.w));
  else {
    if (pt(t, e)) return;
    i.uniform4iv(this.addr, e), mt(t, e);
  }
}
function Gp(i, e) {
  const t = this.cache;
  t[0] !== e && (i.uniform1ui(this.addr, e), (t[0] = e));
}
function Hp(i, e) {
  const t = this.cache;
  if (e.x !== void 0) (t[0] !== e.x || t[1] !== e.y) && (i.uniform2ui(this.addr, e.x, e.y), (t[0] = e.x), (t[1] = e.y));
  else {
    if (pt(t, e)) return;
    i.uniform2uiv(this.addr, e), mt(t, e);
  }
}
function Wp(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z) &&
      (i.uniform3ui(this.addr, e.x, e.y, e.z), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z));
  else {
    if (pt(t, e)) return;
    i.uniform3uiv(this.addr, e), mt(t, e);
  }
}
function Xp(i, e) {
  const t = this.cache;
  if (e.x !== void 0)
    (t[0] !== e.x || t[1] !== e.y || t[2] !== e.z || t[3] !== e.w) &&
      (i.uniform4ui(this.addr, e.x, e.y, e.z, e.w), (t[0] = e.x), (t[1] = e.y), (t[2] = e.z), (t[3] = e.w));
  else {
    if (pt(t, e)) return;
    i.uniform4uiv(this.addr, e), mt(t, e);
  }
}
function qp(i, e, t) {
  const n = this.cache,
    s = t.allocateTextureUnit();
  n[0] !== s && (i.uniform1i(this.addr, s), (n[0] = s));
  let r;
  this.type === i.SAMPLER_2D_SHADOW ? ((wl.compareFunction = t.isReversedDepthBuffer() ? Ca : wa), (r = wl)) : (r = Nh),
    t.setTexture2D(e || r, s);
}
function Yp(i, e, t) {
  const n = this.cache,
    s = t.allocateTextureUnit();
  n[0] !== s && (i.uniform1i(this.addr, s), (n[0] = s)), t.setTexture3D(e || Oh, s);
}
function Zp(i, e, t) {
  const n = this.cache,
    s = t.allocateTextureUnit();
  n[0] !== s && (i.uniform1i(this.addr, s), (n[0] = s)), t.setTextureCube(e || Bh, s);
}
function Jp(i, e, t) {
  const n = this.cache,
    s = t.allocateTextureUnit();
  n[0] !== s && (i.uniform1i(this.addr, s), (n[0] = s)), t.setTexture2DArray(e || Fh, s);
}
function $p(i) {
  switch (i) {
    case 5126:
      return Pp;
    case 35664:
      return Lp;
    case 35665:
      return Dp;
    case 35666:
      return Up;
    case 35674:
      return Np;
    case 35675:
      return Fp;
    case 35676:
      return Op;
    case 5124:
    case 35670:
      return Bp;
    case 35667:
    case 35671:
      return zp;
    case 35668:
    case 35672:
      return Vp;
    case 35669:
    case 35673:
      return kp;
    case 5125:
      return Gp;
    case 36294:
      return Hp;
    case 36295:
      return Wp;
    case 36296:
      return Xp;
    case 35678:
    case 36198:
    case 36298:
    case 36306:
    case 35682:
      return qp;
    case 35679:
    case 36299:
    case 36307:
      return Yp;
    case 35680:
    case 36300:
    case 36308:
    case 36293:
      return Zp;
    case 36289:
    case 36303:
    case 36311:
    case 36292:
      return Jp;
  }
}
function Kp(i, e) {
  i.uniform1fv(this.addr, e);
}
function Qp(i, e) {
  const t = Vi(e, this.size, 2);
  i.uniform2fv(this.addr, t);
}
function jp(i, e) {
  const t = Vi(e, this.size, 3);
  i.uniform3fv(this.addr, t);
}
function em(i, e) {
  const t = Vi(e, this.size, 4);
  i.uniform4fv(this.addr, t);
}
function tm(i, e) {
  const t = Vi(e, this.size, 4);
  i.uniformMatrix2fv(this.addr, !1, t);
}
function nm(i, e) {
  const t = Vi(e, this.size, 9);
  i.uniformMatrix3fv(this.addr, !1, t);
}
function im(i, e) {
  const t = Vi(e, this.size, 16);
  i.uniformMatrix4fv(this.addr, !1, t);
}
function sm(i, e) {
  i.uniform1iv(this.addr, e);
}
function rm(i, e) {
  i.uniform2iv(this.addr, e);
}
function am(i, e) {
  i.uniform3iv(this.addr, e);
}
function om(i, e) {
  i.uniform4iv(this.addr, e);
}
function lm(i, e) {
  i.uniform1uiv(this.addr, e);
}
function cm(i, e) {
  i.uniform2uiv(this.addr, e);
}
function hm(i, e) {
  i.uniform3uiv(this.addr, e);
}
function um(i, e) {
  i.uniform4uiv(this.addr, e);
}
function dm(i, e, t) {
  const n = this.cache,
    s = e.length,
    r = Ua(t, s);
  pt(n, r) || (i.uniform1iv(this.addr, r), mt(n, r));
  let a;
  this.type === i.SAMPLER_2D_SHADOW ? (a = wl) : (a = Nh);
  for (let o = 0; o !== s; ++o) t.setTexture2D(e[o] || a, r[o]);
}
function fm(i, e, t) {
  const n = this.cache,
    s = e.length,
    r = Ua(t, s);
  pt(n, r) || (i.uniform1iv(this.addr, r), mt(n, r));
  for (let a = 0; a !== s; ++a) t.setTexture3D(e[a] || Oh, r[a]);
}
function pm(i, e, t) {
  const n = this.cache,
    s = e.length,
    r = Ua(t, s);
  pt(n, r) || (i.uniform1iv(this.addr, r), mt(n, r));
  for (let a = 0; a !== s; ++a) t.setTextureCube(e[a] || Bh, r[a]);
}
function mm(i, e, t) {
  const n = this.cache,
    s = e.length,
    r = Ua(t, s);
  pt(n, r) || (i.uniform1iv(this.addr, r), mt(n, r));
  for (let a = 0; a !== s; ++a) t.setTexture2DArray(e[a] || Fh, r[a]);
}
function gm(i) {
  switch (i) {
    case 5126:
      return Kp;
    case 35664:
      return Qp;
    case 35665:
      return jp;
    case 35666:
      return em;
    case 35674:
      return tm;
    case 35675:
      return nm;
    case 35676:
      return im;
    case 5124:
    case 35670:
      return sm;
    case 35667:
    case 35671:
      return rm;
    case 35668:
    case 35672:
      return am;
    case 35669:
    case 35673:
      return om;
    case 5125:
      return lm;
    case 36294:
      return cm;
    case 36295:
      return hm;
    case 36296:
      return um;
    case 35678:
    case 36198:
    case 36298:
    case 36306:
    case 35682:
      return dm;
    case 35679:
    case 36299:
    case 36307:
      return fm;
    case 35680:
    case 36300:
    case 36308:
    case 36293:
      return pm;
    case 36289:
    case 36303:
    case 36311:
    case 36292:
      return mm;
  }
}
var Cl = class {
    constructor(e, t, n) {
      (this.id = e), (this.addr = n), (this.cache = []), (this.type = t.type), (this.setValue = $p(t.type));
    }
  },
  Rl = class {
    constructor(e, t, n) {
      (this.id = e),
        (this.addr = n),
        (this.cache = []),
        (this.type = t.type),
        (this.size = t.size),
        (this.setValue = gm(t.type));
    }
  },
  Il = class {
    constructor(e) {
      (this.id = e), (this.seq = []), (this.map = {});
    }
    setValue(e, t, n) {
      const s = this.seq;
      for (let r = 0, a = s.length; r !== a; ++r) {
        const o = s[r];
        o.setValue(e, t[o.id], n);
      }
    }
  },
  Al = /(\w+)(\])?(\[|\.)?/g;
function Mh(i, e) {
  i.seq.push(e), (i.map[e.id] = e);
}
function _m(i, e, t) {
  const n = i.name,
    s = n.length;
  for (Al.lastIndex = 0; ; ) {
    let r = Al.exec(n),
      a = Al.lastIndex,
      o = r[1],
      c = r[2] === ']',
      l = r[3];
    if ((c && (o = o | 0), l === void 0 || (l === '[' && a + 2 === s))) {
      Mh(t, l === void 0 ? new Cl(o, i, e) : new Rl(o, i, e));
      break;
    } else {
      let m = t.map[o];
      m === void 0 && ((m = new Il(o)), Mh(t, m)), (t = m);
    }
  }
}
var zi = class {
  constructor(e, t) {
    (this.seq = []), (this.map = {});
    const n = e.getProgramParameter(t, e.ACTIVE_UNIFORMS);
    for (let a = 0; a < n; ++a) {
      const o = e.getActiveUniform(t, a),
        c = e.getUniformLocation(t, o.name);
      _m(o, c, this);
    }
    const s = [],
      r = [];
    for (const a of this.seq)
      a.type === e.SAMPLER_2D_SHADOW || a.type === e.SAMPLER_CUBE_SHADOW || a.type === e.SAMPLER_2D_ARRAY_SHADOW
        ? s.push(a)
        : r.push(a);
    s.length > 0 && (this.seq = s.concat(r));
  }
  setValue(e, t, n, s) {
    const r = this.map[t];
    r !== void 0 && r.setValue(e, n, s);
  }
  setOptional(e, t, n) {
    const s = t[n];
    s !== void 0 && this.setValue(e, n, s);
  }
  static upload(e, t, n, s) {
    for (let r = 0, a = t.length; r !== a; ++r) {
      const o = t[r],
        c = n[o.id];
      c.needsUpdate !== !1 && o.setValue(e, c.value, s);
    }
  }
  static seqWithValue(e, t) {
    const n = [];
    for (let s = 0, r = e.length; s !== r; ++s) {
      const a = e[s];
      a.id in t && n.push(a);
    }
    return n;
  }
};
function Sh(i, e, t) {
  const n = i.createShader(e);
  return i.shaderSource(n, t), i.compileShader(n), n;
}
var xm = 37297,
  vm = 0;
function ym(i, e) {
  const t = i.split(`
`),
    n = [],
    s = Math.max(e - 6, 0),
    r = Math.min(e + 6, t.length);
  for (let a = s; a < r; a++) {
    const o = a + 1;
    n.push(`${o === e ? '>' : ' '} ${o}: ${t[a]}`);
  }
  return n.join(`
`);
}
var bh = new De();
function Mm(i) {
  Ge._getMatrix(bh, Ge.workingColorSpace, i);
  const e = `mat3( ${bh.elements.map((t) => t.toFixed(4))} )`;
  switch (Ge.getTransfer(i)) {
    case Ki:
      return [e, 'LinearTransferOETF'];
    case Ye:
      return [e, 'sRGBTransferOETF'];
    default:
      return Ee('WebGLProgram: Unsupported color space: ', i), [e, 'LinearTransferOETF'];
  }
}
function Th(i, e, t) {
  const n = i.getShaderParameter(e, i.COMPILE_STATUS),
    r = (i.getShaderInfoLog(e) || '').trim();
  if (n && r === '') return '';
  const a = /ERROR: 0:(\d+)/.exec(r);
  if (a) {
    const o = parseInt(a[1], 10);
    return (
      t.toUpperCase() +
      `

` +
      r +
      `

` +
      ym(i.getShaderSource(e), o)
    );
  } else return r;
}
function Sm(i, e) {
  const t = Mm(e);
  return [`vec4 ${i}( vec4 value ) {`, `	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`, '}'].join(`
`);
}
var bm = {
  [tl]: 'Linear',
  [nl]: 'Reinhard',
  [il]: 'Cineon',
  [sl]: 'ACESFilmic',
  [al]: 'AgX',
  [ol]: 'Neutral',
  [rl]: 'Custom',
};
function Tm(i, e) {
  const t = bm[e];
  return t === void 0
    ? (Ee('WebGLProgram: Unsupported toneMapping:', e),
      `vec3 ${i}( vec3 color ) { return LinearToneMapping( color ); }`)
    : `vec3 ${i}( vec3 color ) { return ${t}ToneMapping( color ); }`;
}
var Ia = new L();
function Am() {
  Ge.getLuminanceCoefficients(Ia);
  const i = Ia.x.toFixed(4),
    e = Ia.y.toFixed(4),
    t = Ia.z.toFixed(4);
  return [
    'float luminance( const in vec3 rgb ) {',
    `	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,
    '	return dot( weights, rgb );',
    '}',
  ].join(`
`);
}
function Em(i) {
  return [
    i.extensionClipCullDistance ? '#extension GL_ANGLE_clip_cull_distance : require' : '',
    i.extensionMultiDraw ? '#extension GL_ANGLE_multi_draw : require' : '',
  ]
    .filter(Ss)
    .join(`
`);
}
function wm(i) {
  const e = [];
  for (const t in i) {
    const n = i[t];
    n !== !1 && e.push(`#define ${t} ${n}`);
  }
  return e.join(`
`);
}
function Cm(i, e) {
  const t = {},
    n = i.getProgramParameter(e, i.ACTIVE_ATTRIBUTES);
  for (let s = 0; s < n; s++) {
    let r = i.getActiveAttrib(e, s),
      a = r.name,
      o = 1;
    r.type === i.FLOAT_MAT2 && (o = 2),
      r.type === i.FLOAT_MAT3 && (o = 3),
      r.type === i.FLOAT_MAT4 && (o = 4),
      (t[a] = { type: r.type, location: i.getAttribLocation(e, a), locationSize: o });
  }
  return t;
}
function Ss(i) {
  return i !== '';
}
function Ah(i, e) {
  const t = e.numSpotLightShadows + e.numSpotLightMaps - e.numSpotLightShadowsWithMaps;
  return i
    .replace(/NUM_DIR_LIGHTS/g, e.numDirLights)
    .replace(/NUM_SPOT_LIGHTS/g, e.numSpotLights)
    .replace(/NUM_SPOT_LIGHT_MAPS/g, e.numSpotLightMaps)
    .replace(/NUM_SPOT_LIGHT_COORDS/g, t)
    .replace(/NUM_RECT_AREA_LIGHTS/g, e.numRectAreaLights)
    .replace(/NUM_POINT_LIGHTS/g, e.numPointLights)
    .replace(/NUM_HEMI_LIGHTS/g, e.numHemiLights)
    .replace(/NUM_DIR_LIGHT_SHADOWS/g, e.numDirLightShadows)
    .replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g, e.numSpotLightShadowsWithMaps)
    .replace(/NUM_SPOT_LIGHT_SHADOWS/g, e.numSpotLightShadows)
    .replace(/NUM_POINT_LIGHT_SHADOWS/g, e.numPointLightShadows);
}
function Eh(i, e) {
  return i
    .replace(/NUM_CLIPPING_PLANES/g, e.numClippingPlanes)
    .replace(/UNION_CLIPPING_PLANES/g, e.numClippingPlanes - e.numClipIntersection);
}
var Rm = /^[ \t]*#include +<([\w\d./]+)>/gm;
function Pl(i) {
  return i.replace(Rm, Pm);
}
var Im = new Map();
function Pm(_i, e) {
  let t = Fe[e];
  if (t === void 0) {
    const n = Im.get(e);
    if (n !== void 0) (t = Fe[n]), Ee('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.', e, n);
    else throw new Error(`Can not resolve #include <${e}>`);
  }
  return Pl(t);
}
var Lm =
  /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;
function wh(i) {
  return i.replace(Lm, Dm);
}
function Dm(_i, e, t, n) {
  let s = '';
  for (let r = parseInt(e, 10); r < parseInt(t, 10); r++)
    s += n.replace(/\[\s*i\s*\]/g, `[ ${r} ]`).replace(/UNROLLED_LOOP_INDEX/g, r);
  return s;
}
function Ch(i) {
  let e = `precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;
  return (
    i.precision === 'highp'
      ? (e += `
#define HIGH_PRECISION`)
      : i.precision === 'mediump'
        ? (e += `
#define MEDIUM_PRECISION`)
        : i.precision === 'lowp' &&
          (e += `
#define LOW_PRECISION`),
    e
  );
}
var Um = { [fs]: 'SHADOWMAP_TYPE_PCF', [Ni]: 'SHADOWMAP_TYPE_VSM' };
function Nm(i) {
  return Um[i.shadowMapType] || 'SHADOWMAP_TYPE_BASIC';
}
var Fm = { [Vn]: 'ENVMAP_TYPE_CUBE', [ii]: 'ENVMAP_TYPE_CUBE', [ps]: 'ENVMAP_TYPE_CUBE_UV' };
function Om(i) {
  return i.envMap === !1 ? 'ENVMAP_TYPE_CUBE' : Fm[i.envMapMode] || 'ENVMAP_TYPE_CUBE';
}
var Bm = { [ii]: 'ENVMAP_MODE_REFRACTION' };
function zm(i) {
  return i.envMap === !1 ? 'ENVMAP_MODE_REFLECTION' : Bm[i.envMapMode] || 'ENVMAP_MODE_REFLECTION';
}
var Vm = { [el]: 'ENVMAP_BLENDING_MULTIPLY', [Yc]: 'ENVMAP_BLENDING_MIX', [Zc]: 'ENVMAP_BLENDING_ADD' };
function km(i) {
  return i.envMap === !1 ? 'ENVMAP_BLENDING_NONE' : Vm[i.combine] || 'ENVMAP_BLENDING_NONE';
}
function Gm(i) {
  const e = i.envMapCubeUVHeight;
  if (e === null) return null;
  const t = Math.log2(e) - 2,
    n = 1 / e;
  return { texelWidth: 1 / (3 * Math.max(2 ** t, 112)), texelHeight: n, maxMip: t };
}
function Hm(i, e, t, n) {
  let s = i.getContext(),
    r = t.defines,
    a = t.vertexShader,
    o = t.fragmentShader,
    c = Nm(t),
    l = Om(t),
    d = zm(t),
    m = km(t),
    h = Gm(t),
    f = Em(t),
    g = wm(r),
    y = s.createProgram(),
    p,
    u,
    v = t.glslVersion
      ? '#version ' +
        t.glslVersion +
        `
`
      : '';
  t.isRawShaderMaterial
    ? ((p = [`#define SHADER_TYPE ${t.shaderType}`, `#define SHADER_NAME ${t.shaderName}`, g].filter(Ss).join(`
`)),
      p.length > 0 &&
        (p += `
`),
      (u = [`#define SHADER_TYPE ${t.shaderType}`, `#define SHADER_NAME ${t.shaderName}`, g].filter(Ss).join(`
`)),
      u.length > 0 &&
        (u += `
`))
    : ((p = [
        Ch(t),
        `#define SHADER_TYPE ${t.shaderType}`,
        `#define SHADER_NAME ${t.shaderName}`,
        g,
        t.extensionClipCullDistance ? '#define USE_CLIP_DISTANCE' : '',
        t.batching ? '#define USE_BATCHING' : '',
        t.batchingColor ? '#define USE_BATCHING_COLOR' : '',
        t.instancing ? '#define USE_INSTANCING' : '',
        t.instancingColor ? '#define USE_INSTANCING_COLOR' : '',
        t.instancingMorph ? '#define USE_INSTANCING_MORPH' : '',
        t.useFog && t.fog ? '#define USE_FOG' : '',
        t.useFog && t.fogExp2 ? '#define FOG_EXP2' : '',
        t.map ? '#define USE_MAP' : '',
        t.envMap ? '#define USE_ENVMAP' : '',
        t.envMap ? `#define ${d}` : '',
        t.lightMap ? '#define USE_LIGHTMAP' : '',
        t.aoMap ? '#define USE_AOMAP' : '',
        t.bumpMap ? '#define USE_BUMPMAP' : '',
        t.normalMap ? '#define USE_NORMALMAP' : '',
        t.normalMapObjectSpace ? '#define USE_NORMALMAP_OBJECTSPACE' : '',
        t.normalMapTangentSpace ? '#define USE_NORMALMAP_TANGENTSPACE' : '',
        t.displacementMap ? '#define USE_DISPLACEMENTMAP' : '',
        t.emissiveMap ? '#define USE_EMISSIVEMAP' : '',
        t.anisotropy ? '#define USE_ANISOTROPY' : '',
        t.anisotropyMap ? '#define USE_ANISOTROPYMAP' : '',
        t.clearcoatMap ? '#define USE_CLEARCOATMAP' : '',
        t.clearcoatRoughnessMap ? '#define USE_CLEARCOAT_ROUGHNESSMAP' : '',
        t.clearcoatNormalMap ? '#define USE_CLEARCOAT_NORMALMAP' : '',
        t.iridescenceMap ? '#define USE_IRIDESCENCEMAP' : '',
        t.iridescenceThicknessMap ? '#define USE_IRIDESCENCE_THICKNESSMAP' : '',
        t.specularMap ? '#define USE_SPECULARMAP' : '',
        t.specularColorMap ? '#define USE_SPECULAR_COLORMAP' : '',
        t.specularIntensityMap ? '#define USE_SPECULAR_INTENSITYMAP' : '',
        t.roughnessMap ? '#define USE_ROUGHNESSMAP' : '',
        t.metalnessMap ? '#define USE_METALNESSMAP' : '',
        t.alphaMap ? '#define USE_ALPHAMAP' : '',
        t.alphaHash ? '#define USE_ALPHAHASH' : '',
        t.transmission ? '#define USE_TRANSMISSION' : '',
        t.transmissionMap ? '#define USE_TRANSMISSIONMAP' : '',
        t.thicknessMap ? '#define USE_THICKNESSMAP' : '',
        t.sheenColorMap ? '#define USE_SHEEN_COLORMAP' : '',
        t.sheenRoughnessMap ? '#define USE_SHEEN_ROUGHNESSMAP' : '',
        t.mapUv ? `#define MAP_UV ${t.mapUv}` : '',
        t.alphaMapUv ? `#define ALPHAMAP_UV ${t.alphaMapUv}` : '',
        t.lightMapUv ? `#define LIGHTMAP_UV ${t.lightMapUv}` : '',
        t.aoMapUv ? `#define AOMAP_UV ${t.aoMapUv}` : '',
        t.emissiveMapUv ? `#define EMISSIVEMAP_UV ${t.emissiveMapUv}` : '',
        t.bumpMapUv ? `#define BUMPMAP_UV ${t.bumpMapUv}` : '',
        t.normalMapUv ? `#define NORMALMAP_UV ${t.normalMapUv}` : '',
        t.displacementMapUv ? `#define DISPLACEMENTMAP_UV ${t.displacementMapUv}` : '',
        t.metalnessMapUv ? `#define METALNESSMAP_UV ${t.metalnessMapUv}` : '',
        t.roughnessMapUv ? `#define ROUGHNESSMAP_UV ${t.roughnessMapUv}` : '',
        t.anisotropyMapUv ? `#define ANISOTROPYMAP_UV ${t.anisotropyMapUv}` : '',
        t.clearcoatMapUv ? `#define CLEARCOATMAP_UV ${t.clearcoatMapUv}` : '',
        t.clearcoatNormalMapUv ? `#define CLEARCOAT_NORMALMAP_UV ${t.clearcoatNormalMapUv}` : '',
        t.clearcoatRoughnessMapUv ? `#define CLEARCOAT_ROUGHNESSMAP_UV ${t.clearcoatRoughnessMapUv}` : '',
        t.iridescenceMapUv ? `#define IRIDESCENCEMAP_UV ${t.iridescenceMapUv}` : '',
        t.iridescenceThicknessMapUv ? `#define IRIDESCENCE_THICKNESSMAP_UV ${t.iridescenceThicknessMapUv}` : '',
        t.sheenColorMapUv ? `#define SHEEN_COLORMAP_UV ${t.sheenColorMapUv}` : '',
        t.sheenRoughnessMapUv ? `#define SHEEN_ROUGHNESSMAP_UV ${t.sheenRoughnessMapUv}` : '',
        t.specularMapUv ? `#define SPECULARMAP_UV ${t.specularMapUv}` : '',
        t.specularColorMapUv ? `#define SPECULAR_COLORMAP_UV ${t.specularColorMapUv}` : '',
        t.specularIntensityMapUv ? `#define SPECULAR_INTENSITYMAP_UV ${t.specularIntensityMapUv}` : '',
        t.transmissionMapUv ? `#define TRANSMISSIONMAP_UV ${t.transmissionMapUv}` : '',
        t.thicknessMapUv ? `#define THICKNESSMAP_UV ${t.thicknessMapUv}` : '',
        t.vertexTangents && t.flatShading === !1 ? '#define USE_TANGENT' : '',
        t.vertexColors ? '#define USE_COLOR' : '',
        t.vertexAlphas ? '#define USE_COLOR_ALPHA' : '',
        t.vertexUv1s ? '#define USE_UV1' : '',
        t.vertexUv2s ? '#define USE_UV2' : '',
        t.vertexUv3s ? '#define USE_UV3' : '',
        t.pointsUvs ? '#define USE_POINTS_UV' : '',
        t.flatShading ? '#define FLAT_SHADED' : '',
        t.skinning ? '#define USE_SKINNING' : '',
        t.morphTargets ? '#define USE_MORPHTARGETS' : '',
        t.morphNormals && t.flatShading === !1 ? '#define USE_MORPHNORMALS' : '',
        t.morphColors ? '#define USE_MORPHCOLORS' : '',
        t.morphTargetsCount > 0 ? `#define MORPHTARGETS_TEXTURE_STRIDE ${t.morphTextureStride}` : '',
        t.morphTargetsCount > 0 ? `#define MORPHTARGETS_COUNT ${t.morphTargetsCount}` : '',
        t.doubleSided ? '#define DOUBLE_SIDED' : '',
        t.flipSided ? '#define FLIP_SIDED' : '',
        t.shadowMapEnabled ? '#define USE_SHADOWMAP' : '',
        t.shadowMapEnabled ? `#define ${c}` : '',
        t.sizeAttenuation ? '#define USE_SIZEATTENUATION' : '',
        t.numLightProbes > 0 ? '#define USE_LIGHT_PROBES' : '',
        t.logarithmicDepthBuffer ? '#define USE_LOGARITHMIC_DEPTH_BUFFER' : '',
        t.reversedDepthBuffer ? '#define USE_REVERSED_DEPTH_BUFFER' : '',
        'uniform mat4 modelMatrix;',
        'uniform mat4 modelViewMatrix;',
        'uniform mat4 projectionMatrix;',
        'uniform mat4 viewMatrix;',
        'uniform mat3 normalMatrix;',
        'uniform vec3 cameraPosition;',
        'uniform bool isOrthographic;',
        '#ifdef USE_INSTANCING',
        '	attribute mat4 instanceMatrix;',
        '#endif',
        '#ifdef USE_INSTANCING_COLOR',
        '	attribute vec3 instanceColor;',
        '#endif',
        '#ifdef USE_INSTANCING_MORPH',
        '	uniform sampler2D morphTexture;',
        '#endif',
        'attribute vec3 position;',
        'attribute vec3 normal;',
        'attribute vec2 uv;',
        '#ifdef USE_UV1',
        '	attribute vec2 uv1;',
        '#endif',
        '#ifdef USE_UV2',
        '	attribute vec2 uv2;',
        '#endif',
        '#ifdef USE_UV3',
        '	attribute vec2 uv3;',
        '#endif',
        '#ifdef USE_TANGENT',
        '	attribute vec4 tangent;',
        '#endif',
        '#if defined( USE_COLOR_ALPHA )',
        '	attribute vec4 color;',
        '#elif defined( USE_COLOR )',
        '	attribute vec3 color;',
        '#endif',
        '#ifdef USE_SKINNING',
        '	attribute vec4 skinIndex;',
        '	attribute vec4 skinWeight;',
        '#endif',
        `
`,
      ]
        .filter(Ss)
        .join(`
`)),
      (u = [
        Ch(t),
        `#define SHADER_TYPE ${t.shaderType}`,
        `#define SHADER_NAME ${t.shaderName}`,
        g,
        t.useFog && t.fog ? '#define USE_FOG' : '',
        t.useFog && t.fogExp2 ? '#define FOG_EXP2' : '',
        t.alphaToCoverage ? '#define ALPHA_TO_COVERAGE' : '',
        t.map ? '#define USE_MAP' : '',
        t.matcap ? '#define USE_MATCAP' : '',
        t.envMap ? '#define USE_ENVMAP' : '',
        t.envMap ? `#define ${l}` : '',
        t.envMap ? `#define ${d}` : '',
        t.envMap ? `#define ${m}` : '',
        h ? `#define CUBEUV_TEXEL_WIDTH ${h.texelWidth}` : '',
        h ? `#define CUBEUV_TEXEL_HEIGHT ${h.texelHeight}` : '',
        h ? `#define CUBEUV_MAX_MIP ${h.maxMip}.0` : '',
        t.lightMap ? '#define USE_LIGHTMAP' : '',
        t.aoMap ? '#define USE_AOMAP' : '',
        t.bumpMap ? '#define USE_BUMPMAP' : '',
        t.normalMap ? '#define USE_NORMALMAP' : '',
        t.normalMapObjectSpace ? '#define USE_NORMALMAP_OBJECTSPACE' : '',
        t.normalMapTangentSpace ? '#define USE_NORMALMAP_TANGENTSPACE' : '',
        t.emissiveMap ? '#define USE_EMISSIVEMAP' : '',
        t.anisotropy ? '#define USE_ANISOTROPY' : '',
        t.anisotropyMap ? '#define USE_ANISOTROPYMAP' : '',
        t.clearcoat ? '#define USE_CLEARCOAT' : '',
        t.clearcoatMap ? '#define USE_CLEARCOATMAP' : '',
        t.clearcoatRoughnessMap ? '#define USE_CLEARCOAT_ROUGHNESSMAP' : '',
        t.clearcoatNormalMap ? '#define USE_CLEARCOAT_NORMALMAP' : '',
        t.dispersion ? '#define USE_DISPERSION' : '',
        t.iridescence ? '#define USE_IRIDESCENCE' : '',
        t.iridescenceMap ? '#define USE_IRIDESCENCEMAP' : '',
        t.iridescenceThicknessMap ? '#define USE_IRIDESCENCE_THICKNESSMAP' : '',
        t.specularMap ? '#define USE_SPECULARMAP' : '',
        t.specularColorMap ? '#define USE_SPECULAR_COLORMAP' : '',
        t.specularIntensityMap ? '#define USE_SPECULAR_INTENSITYMAP' : '',
        t.roughnessMap ? '#define USE_ROUGHNESSMAP' : '',
        t.metalnessMap ? '#define USE_METALNESSMAP' : '',
        t.alphaMap ? '#define USE_ALPHAMAP' : '',
        t.alphaTest ? '#define USE_ALPHATEST' : '',
        t.alphaHash ? '#define USE_ALPHAHASH' : '',
        t.sheen ? '#define USE_SHEEN' : '',
        t.sheenColorMap ? '#define USE_SHEEN_COLORMAP' : '',
        t.sheenRoughnessMap ? '#define USE_SHEEN_ROUGHNESSMAP' : '',
        t.transmission ? '#define USE_TRANSMISSION' : '',
        t.transmissionMap ? '#define USE_TRANSMISSIONMAP' : '',
        t.thicknessMap ? '#define USE_THICKNESSMAP' : '',
        t.vertexTangents && t.flatShading === !1 ? '#define USE_TANGENT' : '',
        t.vertexColors || t.instancingColor ? '#define USE_COLOR' : '',
        t.vertexAlphas || t.batchingColor ? '#define USE_COLOR_ALPHA' : '',
        t.vertexUv1s ? '#define USE_UV1' : '',
        t.vertexUv2s ? '#define USE_UV2' : '',
        t.vertexUv3s ? '#define USE_UV3' : '',
        t.pointsUvs ? '#define USE_POINTS_UV' : '',
        t.gradientMap ? '#define USE_GRADIENTMAP' : '',
        t.flatShading ? '#define FLAT_SHADED' : '',
        t.doubleSided ? '#define DOUBLE_SIDED' : '',
        t.flipSided ? '#define FLIP_SIDED' : '',
        t.shadowMapEnabled ? '#define USE_SHADOWMAP' : '',
        t.shadowMapEnabled ? `#define ${c}` : '',
        t.premultipliedAlpha ? '#define PREMULTIPLIED_ALPHA' : '',
        t.numLightProbes > 0 ? '#define USE_LIGHT_PROBES' : '',
        t.decodeVideoTexture ? '#define DECODE_VIDEO_TEXTURE' : '',
        t.decodeVideoTextureEmissive ? '#define DECODE_VIDEO_TEXTURE_EMISSIVE' : '',
        t.logarithmicDepthBuffer ? '#define USE_LOGARITHMIC_DEPTH_BUFFER' : '',
        t.reversedDepthBuffer ? '#define USE_REVERSED_DEPTH_BUFFER' : '',
        'uniform mat4 viewMatrix;',
        'uniform vec3 cameraPosition;',
        'uniform bool isOrthographic;',
        t.toneMapping !== Yt ? '#define TONE_MAPPING' : '',
        t.toneMapping !== Yt ? Fe.tonemapping_pars_fragment : '',
        t.toneMapping !== Yt ? Tm('toneMapping', t.toneMapping) : '',
        t.dithering ? '#define DITHERING' : '',
        t.opaque ? '#define OPAQUE' : '',
        Fe.colorspace_pars_fragment,
        Sm('linearToOutputTexel', t.outputColorSpace),
        Am(),
        t.useDepthPacking ? `#define DEPTH_PACKING ${t.depthPacking}` : '',
        `
`,
      ]
        .filter(Ss)
        .join(`
`))),
    (a = Pl(a)),
    (a = Ah(a, t)),
    (a = Eh(a, t)),
    (o = Pl(o)),
    (o = Ah(o, t)),
    (o = Eh(o, t)),
    (a = wh(a)),
    (o = wh(o)),
    t.isRawShaderMaterial !== !0 &&
      ((v = `#version 300 es
`),
      (p =
        [f, '#define attribute in', '#define varying out', '#define texture2D texture'].join(`
`) +
        `
` +
        p),
      (u =
        [
          '#define varying in',
          t.glslVersion === gl ? '' : 'layout(location = 0) out highp vec4 pc_fragColor;',
          t.glslVersion === gl ? '' : '#define gl_FragColor pc_fragColor',
          '#define gl_FragDepthEXT gl_FragDepth',
          '#define texture2D texture',
          '#define textureCube texture',
          '#define texture2DProj textureProj',
          '#define texture2DLodEXT textureLod',
          '#define texture2DProjLodEXT textureProjLod',
          '#define textureCubeLodEXT textureLod',
          '#define texture2DGradEXT textureGrad',
          '#define texture2DProjGradEXT textureProjGrad',
          '#define textureCubeGradEXT textureGrad',
        ].join(`
`) +
        `
` +
        u));
  const T = v + p + a,
    S = v + u + o,
    w = Sh(s, s.VERTEX_SHADER, T),
    E = Sh(s, s.FRAGMENT_SHADER, S);
  s.attachShader(y, w),
    s.attachShader(y, E),
    t.index0AttributeName !== void 0
      ? s.bindAttribLocation(y, 0, t.index0AttributeName)
      : t.morphTargets === !0 && s.bindAttribLocation(y, 0, 'position'),
    s.linkProgram(y);
  function R(C) {
    if (i.debug.checkShaderErrors) {
      let N = s.getProgramInfoLog(y) || '',
        O = s.getShaderInfoLog(w) || '',
        W = s.getShaderInfoLog(E) || '',
        z = N.trim(),
        G = O.trim(),
        F = W.trim(),
        j = !0,
        $ = !0;
      if (s.getProgramParameter(y, s.LINK_STATUS) === !1)
        if (((j = !1), typeof i.debug.onShaderError === 'function')) i.debug.onShaderError(s, y, w, E);
        else {
          const ce = Th(s, w, 'vertex'),
            pe = Th(s, E, 'fragment');
          Ae(
            'THREE.WebGLProgram: Shader Error ' +
              s.getError() +
              ' - VALIDATE_STATUS ' +
              s.getProgramParameter(y, s.VALIDATE_STATUS) +
              `

Material Name: ` +
              C.name +
              `
Material Type: ` +
              C.type +
              `

Program Info Log: ` +
              z +
              `
` +
              ce +
              `
` +
              pe,
          );
        }
      else z !== '' ? Ee('WebGLProgram: Program Info Log:', z) : (G === '' || F === '') && ($ = !1);
      $ &&
        (C.diagnostics = {
          runnable: j,
          programLog: z,
          vertexShader: { log: G, prefix: p },
          fragmentShader: { log: F, prefix: u },
        });
    }
    s.deleteShader(w), s.deleteShader(E), (x = new zi(s, y)), (b = Cm(s, y));
  }
  let x;
  this.getUniforms = function () {
    return x === void 0 && R(this), x;
  };
  let b;
  this.getAttributes = function () {
    return b === void 0 && R(this), b;
  };
  let k = t.rendererExtensionParallelShaderCompile === !1;
  return (
    (this.isReady = () => (k === !1 && (k = s.getProgramParameter(y, xm)), k)),
    (this.destroy = function () {
      n.releaseStatesOfProgram(this), s.deleteProgram(y), (this.program = void 0);
    }),
    (this.type = t.shaderType),
    (this.name = t.shaderName),
    (this.id = vm++),
    (this.cacheKey = e),
    (this.usedTimes = 1),
    (this.program = y),
    (this.vertexShader = w),
    (this.fragmentShader = E),
    this
  );
}
var Wm = 0,
  Ll = class {
    constructor() {
      (this.shaderCache = new Map()), (this.materialCache = new Map());
    }
    update(e) {
      const t = e.vertexShader,
        n = e.fragmentShader,
        s = this._getShaderStage(t),
        r = this._getShaderStage(n),
        a = this._getShaderCacheForMaterial(e);
      return a.has(s) === !1 && (a.add(s), s.usedTimes++), a.has(r) === !1 && (a.add(r), r.usedTimes++), this;
    }
    remove(e) {
      const t = this.materialCache.get(e);
      for (const n of t) n.usedTimes--, n.usedTimes === 0 && this.shaderCache.delete(n.code);
      return this.materialCache.delete(e), this;
    }
    getVertexShaderID(e) {
      return this._getShaderStage(e.vertexShader).id;
    }
    getFragmentShaderID(e) {
      return this._getShaderStage(e.fragmentShader).id;
    }
    dispose() {
      this.shaderCache.clear(), this.materialCache.clear();
    }
    _getShaderCacheForMaterial(e) {
      let t = this.materialCache,
        n = t.get(e);
      return n === void 0 && ((n = new Set()), t.set(e, n)), n;
    }
    _getShaderStage(e) {
      let t = this.shaderCache,
        n = t.get(e);
      return n === void 0 && ((n = new Dl(e)), t.set(e, n)), n;
    }
  },
  Dl = class {
    constructor(e) {
      (this.id = Wm++), (this.code = e), (this.usedTimes = 0);
    }
  };
function Xm(i, e, t, n, s, r) {
  let a = new Pi(),
    o = new Ll(),
    c = new Set(),
    l = [],
    d = new Map(),
    m = n.logarithmicDepthBuffer,
    h = n.precision,
    f = {
      MeshDepthMaterial: 'depth',
      MeshDistanceMaterial: 'distance',
      MeshNormalMaterial: 'normal',
      MeshBasicMaterial: 'basic',
      MeshLambertMaterial: 'lambert',
      MeshPhongMaterial: 'phong',
      MeshToonMaterial: 'toon',
      MeshStandardMaterial: 'physical',
      MeshPhysicalMaterial: 'physical',
      MeshMatcapMaterial: 'matcap',
      LineBasicMaterial: 'basic',
      LineDashedMaterial: 'dashed',
      PointsMaterial: 'points',
      ShadowMaterial: 'shadow',
      SpriteMaterial: 'sprite',
    };
  function g(x) {
    return c.add(x), x === 0 ? 'uv' : `uv${x}`;
  }
  function y(x, b, k, C, N) {
    const O = C.fog,
      W = N.geometry,
      z = x.isMeshStandardMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial ? C.environment : null,
      G = x.isMeshStandardMaterial || (x.isMeshLambertMaterial && !x.envMap) || (x.isMeshPhongMaterial && !x.envMap),
      F = e.get(x.envMap || z, G),
      j = F && F.mapping === ps ? F.image.height : null,
      $ = f[x.type];
    x.precision !== null &&
      ((h = n.getMaxPrecision(x.precision)),
      h !== x.precision && Ee('WebGLProgram.getParameters:', x.precision, 'not supported, using', h, 'instead.'));
    let ce = W.morphAttributes.position || W.morphAttributes.normal || W.morphAttributes.color,
      pe = ce !== void 0 ? ce.length : 0,
      ue = 0;
    W.morphAttributes.position !== void 0 && (ue = 1),
      W.morphAttributes.normal !== void 0 && (ue = 2),
      W.morphAttributes.color !== void 0 && (ue = 3);
    let Ne, rt, st, Z;
    if ($) {
      const Je = hn[$];
      (Ne = Je.vertexShader), (rt = Je.fragmentShader);
    } else
      (Ne = x.vertexShader),
        (rt = x.fragmentShader),
        o.update(x),
        (st = o.getVertexShaderID(x)),
        (Z = o.getFragmentShaderID(x));
    let ne = i.getRenderTarget(),
      re = i.state.buffers.depth.getReversed(),
      Ue = N.isInstancedMesh === !0,
      we = N.isBatchedMesh === !0,
      Ie = !!x.map,
      gt = !!x.matcap,
      He = !!F,
      Ze = !!x.aoMap,
      je = !!x.lightMap,
      Oe = !!x.bumpMap,
      ct = !!x.normalMap,
      I = !!x.displacementMap,
      ut = !!x.emissiveMap,
      qe = !!x.metalnessMap,
      nt = !!x.roughnessMap,
      ye = x.anisotropy > 0,
      A = x.clearcoat > 0,
      _ = x.dispersion > 0,
      D = x.iridescence > 0,
      Y = x.sheen > 0,
      J = x.transmission > 0,
      q = ye && !!x.anisotropyMap,
      me = A && !!x.clearcoatMap,
      ie = A && !!x.clearcoatNormalMap,
      Te = A && !!x.clearcoatRoughnessMap,
      Ce = D && !!x.iridescenceMap,
      K = D && !!x.iridescenceThicknessMap,
      ee = Y && !!x.sheenColorMap,
      ge = Y && !!x.sheenRoughnessMap,
      xe = !!x.specularMap,
      he = !!x.specularColorMap,
      Be = !!x.specularIntensityMap,
      P = J && !!x.transmissionMap,
      se = J && !!x.thicknessMap,
      te = !!x.gradientMap,
      fe = !!x.alphaMap,
      Q = x.alphaTest > 0,
      X = !!x.alphaHash,
      _e = !!x.extensions,
      Pe = Yt;
    x.toneMapped && (ne === null || ne.isXRRenderTarget === !0) && (Pe = i.toneMapping);
    const it = {
      shaderID: $,
      shaderType: x.type,
      shaderName: x.name,
      vertexShader: Ne,
      fragmentShader: rt,
      defines: x.defines,
      customVertexShaderID: st,
      customFragmentShaderID: Z,
      isRawShaderMaterial: x.isRawShaderMaterial === !0,
      glslVersion: x.glslVersion,
      precision: h,
      batching: we,
      batchingColor: we && N._colorsTexture !== null,
      instancing: Ue,
      instancingColor: Ue && N.instanceColor !== null,
      instancingMorph: Ue && N.morphTexture !== null,
      outputColorSpace: ne === null ? i.outputColorSpace : ne.isXRRenderTarget === !0 ? ne.texture.colorSpace : ti,
      alphaToCoverage: !!x.alphaToCoverage,
      map: Ie,
      matcap: gt,
      envMap: He,
      envMapMode: He && F.mapping,
      envMapCubeUVHeight: j,
      aoMap: Ze,
      lightMap: je,
      bumpMap: Oe,
      normalMap: ct,
      displacementMap: I,
      emissiveMap: ut,
      normalMapObjectSpace: ct && x.normalMapType === Kc,
      normalMapTangentSpace: ct && x.normalMapType === ml,
      metalnessMap: qe,
      roughnessMap: nt,
      anisotropy: ye,
      anisotropyMap: q,
      clearcoat: A,
      clearcoatMap: me,
      clearcoatNormalMap: ie,
      clearcoatRoughnessMap: Te,
      dispersion: _,
      iridescence: D,
      iridescenceMap: Ce,
      iridescenceThicknessMap: K,
      sheen: Y,
      sheenColorMap: ee,
      sheenRoughnessMap: ge,
      specularMap: xe,
      specularColorMap: he,
      specularIntensityMap: Be,
      transmission: J,
      transmissionMap: P,
      thicknessMap: se,
      gradientMap: te,
      opaque: x.transparent === !1 && x.blending === jn && x.alphaToCoverage === !1,
      alphaMap: fe,
      alphaTest: Q,
      alphaHash: X,
      combine: x.combine,
      mapUv: Ie && g(x.map.channel),
      aoMapUv: Ze && g(x.aoMap.channel),
      lightMapUv: je && g(x.lightMap.channel),
      bumpMapUv: Oe && g(x.bumpMap.channel),
      normalMapUv: ct && g(x.normalMap.channel),
      displacementMapUv: I && g(x.displacementMap.channel),
      emissiveMapUv: ut && g(x.emissiveMap.channel),
      metalnessMapUv: qe && g(x.metalnessMap.channel),
      roughnessMapUv: nt && g(x.roughnessMap.channel),
      anisotropyMapUv: q && g(x.anisotropyMap.channel),
      clearcoatMapUv: me && g(x.clearcoatMap.channel),
      clearcoatNormalMapUv: ie && g(x.clearcoatNormalMap.channel),
      clearcoatRoughnessMapUv: Te && g(x.clearcoatRoughnessMap.channel),
      iridescenceMapUv: Ce && g(x.iridescenceMap.channel),
      iridescenceThicknessMapUv: K && g(x.iridescenceThicknessMap.channel),
      sheenColorMapUv: ee && g(x.sheenColorMap.channel),
      sheenRoughnessMapUv: ge && g(x.sheenRoughnessMap.channel),
      specularMapUv: xe && g(x.specularMap.channel),
      specularColorMapUv: he && g(x.specularColorMap.channel),
      specularIntensityMapUv: Be && g(x.specularIntensityMap.channel),
      transmissionMapUv: P && g(x.transmissionMap.channel),
      thicknessMapUv: se && g(x.thicknessMap.channel),
      alphaMapUv: fe && g(x.alphaMap.channel),
      vertexTangents: !!W.attributes.tangent && (ct || ye),
      vertexColors: x.vertexColors,
      vertexAlphas: x.vertexColors === !0 && !!W.attributes.color && W.attributes.color.itemSize === 4,
      pointsUvs: N.isPoints === !0 && !!W.attributes.uv && (Ie || fe),
      fog: !!O,
      useFog: x.fog === !0,
      fogExp2: !!O && O.isFogExp2,
      flatShading:
        x.wireframe === !1 &&
        (x.flatShading === !0 ||
          (W.attributes.normal === void 0 &&
            ct === !1 &&
            (x.isMeshLambertMaterial ||
              x.isMeshPhongMaterial ||
              x.isMeshStandardMaterial ||
              x.isMeshPhysicalMaterial))),
      sizeAttenuation: x.sizeAttenuation === !0,
      logarithmicDepthBuffer: m,
      reversedDepthBuffer: re,
      skinning: N.isSkinnedMesh === !0,
      morphTargets: W.morphAttributes.position !== void 0,
      morphNormals: W.morphAttributes.normal !== void 0,
      morphColors: W.morphAttributes.color !== void 0,
      morphTargetsCount: pe,
      morphTextureStride: ue,
      numDirLights: b.directional.length,
      numPointLights: b.point.length,
      numSpotLights: b.spot.length,
      numSpotLightMaps: b.spotLightMap.length,
      numRectAreaLights: b.rectArea.length,
      numHemiLights: b.hemi.length,
      numDirLightShadows: b.directionalShadowMap.length,
      numPointLightShadows: b.pointShadowMap.length,
      numSpotLightShadows: b.spotShadowMap.length,
      numSpotLightShadowsWithMaps: b.numSpotLightShadowsWithMaps,
      numLightProbes: b.numLightProbes,
      numClippingPlanes: r.numPlanes,
      numClipIntersection: r.numIntersection,
      dithering: x.dithering,
      shadowMapEnabled: i.shadowMap.enabled && k.length > 0,
      shadowMapType: i.shadowMap.type,
      toneMapping: Pe,
      decodeVideoTexture: Ie && x.map.isVideoTexture === !0 && Ge.getTransfer(x.map.colorSpace) === Ye,
      decodeVideoTextureEmissive:
        ut && x.emissiveMap.isVideoTexture === !0 && Ge.getTransfer(x.emissiveMap.colorSpace) === Ye,
      premultipliedAlpha: x.premultipliedAlpha,
      doubleSided: x.side === rn,
      flipSided: x.side === Ct,
      useDepthPacking: x.depthPacking >= 0,
      depthPacking: x.depthPacking || 0,
      index0AttributeName: x.index0AttributeName,
      extensionClipCullDistance: _e && x.extensions.clipCullDistance === !0 && t.has('WEBGL_clip_cull_distance'),
      extensionMultiDraw: ((_e && x.extensions.multiDraw === !0) || we) && t.has('WEBGL_multi_draw'),
      rendererExtensionParallelShaderCompile: t.has('KHR_parallel_shader_compile'),
      customProgramCacheKey: x.customProgramCacheKey(),
    };
    return (it.vertexUv1s = c.has(1)), (it.vertexUv2s = c.has(2)), (it.vertexUv3s = c.has(3)), c.clear(), it;
  }
  function p(x) {
    const b = [];
    if (
      (x.shaderID ? b.push(x.shaderID) : (b.push(x.customVertexShaderID), b.push(x.customFragmentShaderID)),
      x.defines !== void 0)
    )
      for (const k in x.defines) b.push(k), b.push(x.defines[k]);
    return (
      x.isRawShaderMaterial === !1 && (u(b, x), v(b, x), b.push(i.outputColorSpace)),
      b.push(x.customProgramCacheKey),
      b.join()
    );
  }
  function u(x, b) {
    x.push(b.precision),
      x.push(b.outputColorSpace),
      x.push(b.envMapMode),
      x.push(b.envMapCubeUVHeight),
      x.push(b.mapUv),
      x.push(b.alphaMapUv),
      x.push(b.lightMapUv),
      x.push(b.aoMapUv),
      x.push(b.bumpMapUv),
      x.push(b.normalMapUv),
      x.push(b.displacementMapUv),
      x.push(b.emissiveMapUv),
      x.push(b.metalnessMapUv),
      x.push(b.roughnessMapUv),
      x.push(b.anisotropyMapUv),
      x.push(b.clearcoatMapUv),
      x.push(b.clearcoatNormalMapUv),
      x.push(b.clearcoatRoughnessMapUv),
      x.push(b.iridescenceMapUv),
      x.push(b.iridescenceThicknessMapUv),
      x.push(b.sheenColorMapUv),
      x.push(b.sheenRoughnessMapUv),
      x.push(b.specularMapUv),
      x.push(b.specularColorMapUv),
      x.push(b.specularIntensityMapUv),
      x.push(b.transmissionMapUv),
      x.push(b.thicknessMapUv),
      x.push(b.combine),
      x.push(b.fogExp2),
      x.push(b.sizeAttenuation),
      x.push(b.morphTargetsCount),
      x.push(b.morphAttributeCount),
      x.push(b.numDirLights),
      x.push(b.numPointLights),
      x.push(b.numSpotLights),
      x.push(b.numSpotLightMaps),
      x.push(b.numHemiLights),
      x.push(b.numRectAreaLights),
      x.push(b.numDirLightShadows),
      x.push(b.numPointLightShadows),
      x.push(b.numSpotLightShadows),
      x.push(b.numSpotLightShadowsWithMaps),
      x.push(b.numLightProbes),
      x.push(b.shadowMapType),
      x.push(b.toneMapping),
      x.push(b.numClippingPlanes),
      x.push(b.numClipIntersection),
      x.push(b.depthPacking);
  }
  function v(x, b) {
    a.disableAll(),
      b.instancing && a.enable(0),
      b.instancingColor && a.enable(1),
      b.instancingMorph && a.enable(2),
      b.matcap && a.enable(3),
      b.envMap && a.enable(4),
      b.normalMapObjectSpace && a.enable(5),
      b.normalMapTangentSpace && a.enable(6),
      b.clearcoat && a.enable(7),
      b.iridescence && a.enable(8),
      b.alphaTest && a.enable(9),
      b.vertexColors && a.enable(10),
      b.vertexAlphas && a.enable(11),
      b.vertexUv1s && a.enable(12),
      b.vertexUv2s && a.enable(13),
      b.vertexUv3s && a.enable(14),
      b.vertexTangents && a.enable(15),
      b.anisotropy && a.enable(16),
      b.alphaHash && a.enable(17),
      b.batching && a.enable(18),
      b.dispersion && a.enable(19),
      b.batchingColor && a.enable(20),
      b.gradientMap && a.enable(21),
      x.push(a.mask),
      a.disableAll(),
      b.fog && a.enable(0),
      b.useFog && a.enable(1),
      b.flatShading && a.enable(2),
      b.logarithmicDepthBuffer && a.enable(3),
      b.reversedDepthBuffer && a.enable(4),
      b.skinning && a.enable(5),
      b.morphTargets && a.enable(6),
      b.morphNormals && a.enable(7),
      b.morphColors && a.enable(8),
      b.premultipliedAlpha && a.enable(9),
      b.shadowMapEnabled && a.enable(10),
      b.doubleSided && a.enable(11),
      b.flipSided && a.enable(12),
      b.useDepthPacking && a.enable(13),
      b.dithering && a.enable(14),
      b.transmission && a.enable(15),
      b.sheen && a.enable(16),
      b.opaque && a.enable(17),
      b.pointsUvs && a.enable(18),
      b.decodeVideoTexture && a.enable(19),
      b.decodeVideoTextureEmissive && a.enable(20),
      b.alphaToCoverage && a.enable(21),
      x.push(a.mask);
  }
  function T(x) {
    let b = f[x.type],
      k;
    if (b) {
      const C = hn[b];
      k = hh.clone(C.uniforms);
    } else k = x.uniforms;
    return k;
  }
  function S(x, b) {
    let k = d.get(b);
    return k !== void 0 ? ++k.usedTimes : ((k = new Hm(i, b, x, s)), l.push(k), d.set(b, k)), k;
  }
  function w(x) {
    if (--x.usedTimes === 0) {
      const b = l.indexOf(x);
      (l[b] = l[l.length - 1]), l.pop(), d.delete(x.cacheKey), x.destroy();
    }
  }
  function E(x) {
    o.remove(x);
  }
  function R() {
    o.dispose();
  }
  return {
    getParameters: y,
    getProgramCacheKey: p,
    getUniforms: T,
    acquireProgram: S,
    releaseProgram: w,
    releaseShaderCache: E,
    programs: l,
    dispose: R,
  };
}
function qm() {
  let i = new WeakMap();
  function e(a) {
    return i.has(a);
  }
  function t(a) {
    let o = i.get(a);
    return o === void 0 && ((o = {}), i.set(a, o)), o;
  }
  function n(a) {
    i.delete(a);
  }
  function s(a, o, c) {
    i.get(a)[o] = c;
  }
  function r() {
    i = new WeakMap();
  }
  return { has: e, get: t, remove: n, update: s, dispose: r };
}
function Ym(i, e) {
  return i.groupOrder !== e.groupOrder
    ? i.groupOrder - e.groupOrder
    : i.renderOrder !== e.renderOrder
      ? i.renderOrder - e.renderOrder
      : i.material.id !== e.material.id
        ? i.material.id - e.material.id
        : i.materialVariant !== e.materialVariant
          ? i.materialVariant - e.materialVariant
          : i.z !== e.z
            ? i.z - e.z
            : i.id - e.id;
}
function Rh(i, e) {
  return i.groupOrder !== e.groupOrder
    ? i.groupOrder - e.groupOrder
    : i.renderOrder !== e.renderOrder
      ? i.renderOrder - e.renderOrder
      : i.z !== e.z
        ? e.z - i.z
        : i.id - e.id;
}
function Ih() {
  let i = [],
    e = 0,
    t = [],
    n = [],
    s = [];
  function r() {
    (e = 0), (t.length = 0), (n.length = 0), (s.length = 0);
  }
  function a(h) {
    let f = 0;
    return h.isInstancedMesh && (f += 2), h.isSkinnedMesh && (f += 1), f;
  }
  function o(h, f, g, y, p, u) {
    let v = i[e];
    return (
      v === void 0
        ? ((v = {
            id: h.id,
            object: h,
            geometry: f,
            material: g,
            materialVariant: a(h),
            groupOrder: y,
            renderOrder: h.renderOrder,
            z: p,
            group: u,
          }),
          (i[e] = v))
        : ((v.id = h.id),
          (v.object = h),
          (v.geometry = f),
          (v.material = g),
          (v.materialVariant = a(h)),
          (v.groupOrder = y),
          (v.renderOrder = h.renderOrder),
          (v.z = p),
          (v.group = u)),
      e++,
      v
    );
  }
  function c(h, f, g, y, p, u) {
    const v = o(h, f, g, y, p, u);
    g.transmission > 0 ? n.push(v) : g.transparent === !0 ? s.push(v) : t.push(v);
  }
  function l(h, f, g, y, p, u) {
    const v = o(h, f, g, y, p, u);
    g.transmission > 0 ? n.unshift(v) : g.transparent === !0 ? s.unshift(v) : t.unshift(v);
  }
  function d(h, f) {
    t.length > 1 && t.sort(h || Ym), n.length > 1 && n.sort(f || Rh), s.length > 1 && s.sort(f || Rh);
  }
  function m() {
    for (let h = e, f = i.length; h < f; h++) {
      const g = i[h];
      if (g.id === null) break;
      (g.id = null), (g.object = null), (g.geometry = null), (g.material = null), (g.group = null);
    }
  }
  return { opaque: t, transmissive: n, transparent: s, init: r, push: c, unshift: l, finish: m, sort: d };
}
function Zm() {
  let i = new WeakMap();
  function e(n, s) {
    let r = i.get(n),
      a;
    return r === void 0 ? ((a = new Ih()), i.set(n, [a])) : s >= r.length ? ((a = new Ih()), r.push(a)) : (a = r[s]), a;
  }
  function t() {
    i = new WeakMap();
  }
  return { get: e, dispose: t };
}
function Jm() {
  const i = {};
  return {
    get: (e) => {
      if (i[e.id] !== void 0) return i[e.id];
      let t;
      switch (e.type) {
        case 'DirectionalLight':
          t = { direction: new L(), color: new Ve() };
          break;
        case 'SpotLight':
          t = {
            position: new L(),
            direction: new L(),
            color: new Ve(),
            distance: 0,
            coneCos: 0,
            penumbraCos: 0,
            decay: 0,
          };
          break;
        case 'PointLight':
          t = { position: new L(), color: new Ve(), distance: 0, decay: 0 };
          break;
        case 'HemisphereLight':
          t = { direction: new L(), skyColor: new Ve(), groundColor: new Ve() };
          break;
        case 'RectAreaLight':
          t = { color: new Ve(), position: new L(), halfWidth: new L(), halfHeight: new L() };
          break;
      }
      return (i[e.id] = t), t;
    },
  };
}
function $m() {
  const i = {};
  return {
    get: (e) => {
      if (i[e.id] !== void 0) return i[e.id];
      let t;
      switch (e.type) {
        case 'DirectionalLight':
          t = { shadowIntensity: 1, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 1, shadowMapSize: new Re() };
          break;
        case 'SpotLight':
          t = { shadowIntensity: 1, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 1, shadowMapSize: new Re() };
          break;
        case 'PointLight':
          t = {
            shadowIntensity: 1,
            shadowBias: 0,
            shadowNormalBias: 0,
            shadowRadius: 1,
            shadowMapSize: new Re(),
            shadowCameraNear: 1,
            shadowCameraFar: 1e3,
          };
          break;
      }
      return (i[e.id] = t), t;
    },
  };
}
var Km = 0;
function Qm(i, e) {
  return (e.castShadow ? 2 : 0) - (i.castShadow ? 2 : 0) + (e.map ? 1 : 0) - (i.map ? 1 : 0);
}
function jm(i) {
  const e = new Jm(),
    t = $m(),
    n = {
      version: 0,
      hash: {
        directionalLength: -1,
        pointLength: -1,
        spotLength: -1,
        rectAreaLength: -1,
        hemiLength: -1,
        numDirectionalShadows: -1,
        numPointShadows: -1,
        numSpotShadows: -1,
        numSpotMaps: -1,
        numLightProbes: -1,
      },
      ambient: [0, 0, 0],
      probe: [],
      directional: [],
      directionalShadow: [],
      directionalShadowMap: [],
      directionalShadowMatrix: [],
      spot: [],
      spotLightMap: [],
      spotShadow: [],
      spotShadowMap: [],
      spotLightMatrix: [],
      rectArea: [],
      rectAreaLTC1: null,
      rectAreaLTC2: null,
      point: [],
      pointShadow: [],
      pointShadowMap: [],
      pointShadowMatrix: [],
      hemi: [],
      numSpotLightShadowsWithMaps: 0,
      numLightProbes: 0,
    };
  for (let l = 0; l < 9; l++) n.probe.push(new L());
  const s = new L(),
    r = new tt(),
    a = new tt();
  function o(l) {
    let d = 0,
      m = 0,
      h = 0;
    for (let b = 0; b < 9; b++) n.probe[b].set(0, 0, 0);
    let f = 0,
      g = 0,
      y = 0,
      p = 0,
      u = 0,
      v = 0,
      T = 0,
      S = 0,
      w = 0,
      E = 0,
      R = 0;
    l.sort(Qm);
    for (let b = 0, k = l.length; b < k; b++) {
      let C = l[b],
        N = C.color,
        O = C.intensity,
        W = C.distance,
        z = null;
      if (
        (C.shadow?.map &&
          (C.shadow.map.texture.format === si
            ? (z = C.shadow.map.texture)
            : (z = C.shadow.map.depthTexture || C.shadow.map.texture)),
        C.isAmbientLight)
      )
        (d += N.r * O), (m += N.g * O), (h += N.b * O);
      else if (C.isLightProbe) {
        for (let G = 0; G < 9; G++) n.probe[G].addScaledVector(C.sh.coefficients[G], O);
        R++;
      } else if (C.isDirectionalLight) {
        const G = e.get(C);
        if ((G.color.copy(C.color).multiplyScalar(C.intensity), C.castShadow)) {
          const F = C.shadow,
            j = t.get(C);
          (j.shadowIntensity = F.intensity),
            (j.shadowBias = F.bias),
            (j.shadowNormalBias = F.normalBias),
            (j.shadowRadius = F.radius),
            (j.shadowMapSize = F.mapSize),
            (n.directionalShadow[f] = j),
            (n.directionalShadowMap[f] = z),
            (n.directionalShadowMatrix[f] = C.shadow.matrix),
            v++;
        }
        (n.directional[f] = G), f++;
      } else if (C.isSpotLight) {
        const G = e.get(C);
        G.position.setFromMatrixPosition(C.matrixWorld),
          G.color.copy(N).multiplyScalar(O),
          (G.distance = W),
          (G.coneCos = Math.cos(C.angle)),
          (G.penumbraCos = Math.cos(C.angle * (1 - C.penumbra))),
          (G.decay = C.decay),
          (n.spot[y] = G);
        const F = C.shadow;
        if (
          (C.map && ((n.spotLightMap[w] = C.map), w++, F.updateMatrices(C), C.castShadow && E++),
          (n.spotLightMatrix[y] = F.matrix),
          C.castShadow)
        ) {
          const j = t.get(C);
          (j.shadowIntensity = F.intensity),
            (j.shadowBias = F.bias),
            (j.shadowNormalBias = F.normalBias),
            (j.shadowRadius = F.radius),
            (j.shadowMapSize = F.mapSize),
            (n.spotShadow[y] = j),
            (n.spotShadowMap[y] = z),
            S++;
        }
        y++;
      } else if (C.isRectAreaLight) {
        const G = e.get(C);
        G.color.copy(N).multiplyScalar(O),
          G.halfWidth.set(C.width * 0.5, 0, 0),
          G.halfHeight.set(0, C.height * 0.5, 0),
          (n.rectArea[p] = G),
          p++;
      } else if (C.isPointLight) {
        const G = e.get(C);
        if (
          (G.color.copy(C.color).multiplyScalar(C.intensity),
          (G.distance = C.distance),
          (G.decay = C.decay),
          C.castShadow)
        ) {
          const F = C.shadow,
            j = t.get(C);
          (j.shadowIntensity = F.intensity),
            (j.shadowBias = F.bias),
            (j.shadowNormalBias = F.normalBias),
            (j.shadowRadius = F.radius),
            (j.shadowMapSize = F.mapSize),
            (j.shadowCameraNear = F.camera.near),
            (j.shadowCameraFar = F.camera.far),
            (n.pointShadow[g] = j),
            (n.pointShadowMap[g] = z),
            (n.pointShadowMatrix[g] = C.shadow.matrix),
            T++;
        }
        (n.point[g] = G), g++;
      } else if (C.isHemisphereLight) {
        const G = e.get(C);
        G.skyColor.copy(C.color).multiplyScalar(O),
          G.groundColor.copy(C.groundColor).multiplyScalar(O),
          (n.hemi[u] = G),
          u++;
      }
    }
    p > 0 &&
      (i.has('OES_texture_float_linear') === !0
        ? ((n.rectAreaLTC1 = ae.LTC_FLOAT_1), (n.rectAreaLTC2 = ae.LTC_FLOAT_2))
        : ((n.rectAreaLTC1 = ae.LTC_HALF_1), (n.rectAreaLTC2 = ae.LTC_HALF_2))),
      (n.ambient[0] = d),
      (n.ambient[1] = m),
      (n.ambient[2] = h);
    const x = n.hash;
    (x.directionalLength !== f ||
      x.pointLength !== g ||
      x.spotLength !== y ||
      x.rectAreaLength !== p ||
      x.hemiLength !== u ||
      x.numDirectionalShadows !== v ||
      x.numPointShadows !== T ||
      x.numSpotShadows !== S ||
      x.numSpotMaps !== w ||
      x.numLightProbes !== R) &&
      ((n.directional.length = f),
      (n.spot.length = y),
      (n.rectArea.length = p),
      (n.point.length = g),
      (n.hemi.length = u),
      (n.directionalShadow.length = v),
      (n.directionalShadowMap.length = v),
      (n.pointShadow.length = T),
      (n.pointShadowMap.length = T),
      (n.spotShadow.length = S),
      (n.spotShadowMap.length = S),
      (n.directionalShadowMatrix.length = v),
      (n.pointShadowMatrix.length = T),
      (n.spotLightMatrix.length = S + w - E),
      (n.spotLightMap.length = w),
      (n.numSpotLightShadowsWithMaps = E),
      (n.numLightProbes = R),
      (x.directionalLength = f),
      (x.pointLength = g),
      (x.spotLength = y),
      (x.rectAreaLength = p),
      (x.hemiLength = u),
      (x.numDirectionalShadows = v),
      (x.numPointShadows = T),
      (x.numSpotShadows = S),
      (x.numSpotMaps = w),
      (x.numLightProbes = R),
      (n.version = Km++));
  }
  function c(l, d) {
    let m = 0,
      h = 0,
      f = 0,
      g = 0,
      y = 0,
      p = d.matrixWorldInverse;
    for (let u = 0, v = l.length; u < v; u++) {
      const T = l[u];
      if (T.isDirectionalLight) {
        const S = n.directional[m];
        S.direction.setFromMatrixPosition(T.matrixWorld),
          s.setFromMatrixPosition(T.target.matrixWorld),
          S.direction.sub(s),
          S.direction.transformDirection(p),
          m++;
      } else if (T.isSpotLight) {
        const S = n.spot[f];
        S.position.setFromMatrixPosition(T.matrixWorld),
          S.position.applyMatrix4(p),
          S.direction.setFromMatrixPosition(T.matrixWorld),
          s.setFromMatrixPosition(T.target.matrixWorld),
          S.direction.sub(s),
          S.direction.transformDirection(p),
          f++;
      } else if (T.isRectAreaLight) {
        const S = n.rectArea[g];
        S.position.setFromMatrixPosition(T.matrixWorld),
          S.position.applyMatrix4(p),
          a.identity(),
          r.copy(T.matrixWorld),
          r.premultiply(p),
          a.extractRotation(r),
          S.halfWidth.set(T.width * 0.5, 0, 0),
          S.halfHeight.set(0, T.height * 0.5, 0),
          S.halfWidth.applyMatrix4(a),
          S.halfHeight.applyMatrix4(a),
          g++;
      } else if (T.isPointLight) {
        const S = n.point[h];
        S.position.setFromMatrixPosition(T.matrixWorld), S.position.applyMatrix4(p), h++;
      } else if (T.isHemisphereLight) {
        const S = n.hemi[y];
        S.direction.setFromMatrixPosition(T.matrixWorld), S.direction.transformDirection(p), y++;
      }
    }
  }
  return { setup: o, setupView: c, state: n };
}
function Ph(i) {
  const e = new jm(i),
    t = [],
    n = [];
  function s(d) {
    (l.camera = d), (t.length = 0), (n.length = 0);
  }
  function r(d) {
    t.push(d);
  }
  function a(d) {
    n.push(d);
  }
  function o() {
    e.setup(t);
  }
  function c(d) {
    e.setupView(t, d);
  }
  const l = { lightsArray: t, shadowsArray: n, camera: null, lights: e, transmissionRenderTarget: {} };
  return { init: s, state: l, setupLights: o, setupLightsView: c, pushLight: r, pushShadow: a };
}
function eg(i) {
  let e = new WeakMap();
  function t(s, r = 0) {
    let a = e.get(s),
      o;
    return (
      a === void 0 ? ((o = new Ph(i)), e.set(s, [o])) : r >= a.length ? ((o = new Ph(i)), a.push(o)) : (o = a[r]), o
    );
  }
  function n() {
    e = new WeakMap();
  }
  return { get: t, dispose: n };
}
var tg = `void main() {
	gl_Position = vec4( position, 1.0 );
}`,
  ng = `uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,
  ig = [new L(1, 0, 0), new L(-1, 0, 0), new L(0, 1, 0), new L(0, -1, 0), new L(0, 0, 1), new L(0, 0, -1)],
  sg = [new L(0, -1, 0), new L(0, -1, 0), new L(0, 0, 1), new L(0, 0, -1), new L(0, -1, 0), new L(0, -1, 0)],
  Lh = new tt(),
  Ms = new L(),
  El = new L();
function rg(i, e, t) {
  let n = new Di(),
    s = new Re(),
    r = new Re(),
    a = new at(),
    o = new Cr(),
    c = new Rr(),
    l = {},
    d = t.maxTextureSize,
    m = { [yn]: Ct, [Ct]: yn, [rn]: rn },
    h = new Ft({
      defines: { VSM_SAMPLES: 8 },
      uniforms: { shadow_pass: { value: null }, resolution: { value: new Re() }, radius: { value: 4 } },
      vertexShader: tg,
      fragmentShader: ng,
    }),
    f = h.clone();
  f.defines.HORIZONTAL_PASS = 1;
  const g = new ft();
  g.setAttribute('position', new Rt(new Float32Array([-1, -1, 0.5, 3, -1, 0.5, -1, 3, 0.5]), 3));
  const y = new zt(g, h),
    p = this;
  (this.enabled = !1), (this.autoUpdate = !0), (this.needsUpdate = !1), (this.type = fs);
  let u = this.type;
  this.render = function (E, R, x) {
    if (p.enabled === !1 || (p.autoUpdate === !1 && p.needsUpdate === !1) || E.length === 0) return;
    this.type === Cc &&
      (Ee('WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.'), (this.type = fs));
    const b = i.getRenderTarget(),
      k = i.getActiveCubeFace(),
      C = i.getActiveMipmapLevel(),
      N = i.state;
    N.setBlending(an),
      N.buffers.depth.getReversed() === !0
        ? N.buffers.color.setClear(0, 0, 0, 0)
        : N.buffers.color.setClear(1, 1, 1, 1),
      N.buffers.depth.setTest(!0),
      N.setScissorTest(!1);
    const O = u !== this.type;
    O &&
      R.traverse((W) => {
        W.material &&
          (Array.isArray(W.material) ? W.material.forEach((z) => (z.needsUpdate = !0)) : (W.material.needsUpdate = !0));
      });
    for (let W = 0, z = E.length; W < z; W++) {
      const G = E[W],
        F = G.shadow;
      if (F === void 0) {
        Ee('WebGLShadowMap:', G, 'has no shadow.');
        continue;
      }
      if (F.autoUpdate === !1 && F.needsUpdate === !1) continue;
      s.copy(F.mapSize);
      const j = F.getFrameExtents();
      s.multiply(j),
        r.copy(F.mapSize),
        (s.x > d || s.y > d) &&
          (s.x > d && ((r.x = Math.floor(d / j.x)), (s.x = r.x * j.x), (F.mapSize.x = r.x)),
          s.y > d && ((r.y = Math.floor(d / j.y)), (s.y = r.y * j.y), (F.mapSize.y = r.y)));
      const $ = i.state.buffers.depth.getReversed();
      if (((F.camera._reversedDepth = $), F.map === null || O === !0)) {
        if (
          (F.map !== null &&
            (F.map.depthTexture !== null && (F.map.depthTexture.dispose(), (F.map.depthTexture = null)),
            F.map.dispose()),
          this.type === Ni)
        ) {
          if (G.isPointLight) {
            Ee('WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.');
            continue;
          }
          (F.map = new Nt(s.x, s.y, { format: si, type: on, minFilter: Mt, magFilter: Mt, generateMipmaps: !1 })),
            (F.map.texture.name = `${G.name}.shadowMap`),
            (F.map.depthTexture = new Fn(s.x, s.y, Jt)),
            (F.map.depthTexture.name = `${G.name}.shadowMapDepth`),
            (F.map.depthTexture.format = nn),
            (F.map.depthTexture.compareFunction = null),
            (F.map.depthTexture.minFilter = vt),
            (F.map.depthTexture.magFilter = vt);
        } else
          G.isPointLight
            ? ((F.map = new La(s.x)), (F.map.depthTexture = new Tr(s.x, Zt)))
            : ((F.map = new Nt(s.x, s.y)), (F.map.depthTexture = new Fn(s.x, s.y, Zt))),
            (F.map.depthTexture.name = `${G.name}.shadowMap`),
            (F.map.depthTexture.format = nn),
            this.type === fs
              ? ((F.map.depthTexture.compareFunction = $ ? Ca : wa),
                (F.map.depthTexture.minFilter = Mt),
                (F.map.depthTexture.magFilter = Mt))
              : ((F.map.depthTexture.compareFunction = null),
                (F.map.depthTexture.minFilter = vt),
                (F.map.depthTexture.magFilter = vt));
        F.camera.updateProjectionMatrix();
      }
      const ce = F.map.isWebGLCubeRenderTarget ? 6 : 1;
      for (let pe = 0; pe < ce; pe++) {
        if (F.map.isWebGLCubeRenderTarget) i.setRenderTarget(F.map, pe), i.clear();
        else {
          pe === 0 && (i.setRenderTarget(F.map), i.clear());
          const ue = F.getViewport(pe);
          a.set(r.x * ue.x, r.y * ue.y, r.x * ue.z, r.y * ue.w), N.viewport(a);
        }
        if (G.isPointLight) {
          const ue = F.camera,
            Ne = F.matrix,
            rt = G.distance || ue.far;
          rt !== ue.far && ((ue.far = rt), ue.updateProjectionMatrix()),
            Ms.setFromMatrixPosition(G.matrixWorld),
            ue.position.copy(Ms),
            El.copy(ue.position),
            El.add(ig[pe]),
            ue.up.copy(sg[pe]),
            ue.lookAt(El),
            ue.updateMatrixWorld(),
            Ne.makeTranslation(-Ms.x, -Ms.y, -Ms.z),
            Lh.multiplyMatrices(ue.projectionMatrix, ue.matrixWorldInverse),
            F._frustum.setFromProjectionMatrix(Lh, ue.coordinateSystem, ue.reversedDepth);
        } else F.updateMatrices(G);
        (n = F.getFrustum()), S(R, x, F.camera, G, this.type);
      }
      F.isPointLightShadow !== !0 && this.type === Ni && v(F, x), (F.needsUpdate = !1);
    }
    (u = this.type), (p.needsUpdate = !1), i.setRenderTarget(b, k, C);
  };
  function v(E, R) {
    const x = e.update(y);
    h.defines.VSM_SAMPLES !== E.blurSamples &&
      ((h.defines.VSM_SAMPLES = E.blurSamples),
      (f.defines.VSM_SAMPLES = E.blurSamples),
      (h.needsUpdate = !0),
      (f.needsUpdate = !0)),
      E.mapPass === null && (E.mapPass = new Nt(s.x, s.y, { format: si, type: on })),
      (h.uniforms.shadow_pass.value = E.map.depthTexture),
      (h.uniforms.resolution.value = E.mapSize),
      (h.uniforms.radius.value = E.radius),
      i.setRenderTarget(E.mapPass),
      i.clear(),
      i.renderBufferDirect(R, null, x, h, y, null),
      (f.uniforms.shadow_pass.value = E.mapPass.texture),
      (f.uniforms.resolution.value = E.mapSize),
      (f.uniforms.radius.value = E.radius),
      i.setRenderTarget(E.map),
      i.clear(),
      i.renderBufferDirect(R, null, x, f, y, null);
  }
  function T(E, R, x, b) {
    let k = null,
      C = x.isPointLight === !0 ? E.customDistanceMaterial : E.customDepthMaterial;
    if (C !== void 0) k = C;
    else if (
      ((k = x.isPointLight === !0 ? c : o),
      (i.localClippingEnabled &&
        R.clipShadows === !0 &&
        Array.isArray(R.clippingPlanes) &&
        R.clippingPlanes.length !== 0) ||
        (R.displacementMap && R.displacementScale !== 0) ||
        (R.alphaMap && R.alphaTest > 0) ||
        (R.map && R.alphaTest > 0) ||
        R.alphaToCoverage === !0)
    ) {
      let N = k.uuid,
        O = R.uuid,
        W = l[N];
      W === void 0 && ((W = {}), (l[N] = W));
      let z = W[O];
      z === void 0 && ((z = k.clone()), (W[O] = z), R.addEventListener('dispose', w)), (k = z);
    }
    if (
      ((k.visible = R.visible),
      (k.wireframe = R.wireframe),
      b === Ni
        ? (k.side = R.shadowSide !== null ? R.shadowSide : R.side)
        : (k.side = R.shadowSide !== null ? R.shadowSide : m[R.side]),
      (k.alphaMap = R.alphaMap),
      (k.alphaTest = R.alphaToCoverage === !0 ? 0.5 : R.alphaTest),
      (k.map = R.map),
      (k.clipShadows = R.clipShadows),
      (k.clippingPlanes = R.clippingPlanes),
      (k.clipIntersection = R.clipIntersection),
      (k.displacementMap = R.displacementMap),
      (k.displacementScale = R.displacementScale),
      (k.displacementBias = R.displacementBias),
      (k.wireframeLinewidth = R.wireframeLinewidth),
      (k.linewidth = R.linewidth),
      x.isPointLight === !0 && k.isMeshDistanceMaterial === !0)
    ) {
      const N = i.properties.get(k);
      N.light = x;
    }
    return k;
  }
  function S(E, R, x, b, k) {
    if (E.visible === !1) return;
    if (
      E.layers.test(R.layers) &&
      (E.isMesh || E.isLine || E.isPoints) &&
      (E.castShadow || (E.receiveShadow && k === Ni)) &&
      (!E.frustumCulled || n.intersectsObject(E))
    ) {
      E.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse, E.matrixWorld);
      const O = e.update(E),
        W = E.material;
      if (Array.isArray(W)) {
        const z = O.groups;
        for (let G = 0, F = z.length; G < F; G++) {
          const j = z[G],
            $ = W[j.materialIndex];
          if ($?.visible) {
            const ce = T(E, $, b, k);
            E.onBeforeShadow(i, E, R, x, O, ce, j),
              i.renderBufferDirect(x, null, O, ce, E, j),
              E.onAfterShadow(i, E, R, x, O, ce, j);
          }
        }
      } else if (W.visible) {
        const z = T(E, W, b, k);
        E.onBeforeShadow(i, E, R, x, O, z, null),
          i.renderBufferDirect(x, null, O, z, E, null),
          E.onAfterShadow(i, E, R, x, O, z, null);
      }
    }
    const N = E.children;
    for (let O = 0, W = N.length; O < W; O++) S(N[O], R, x, b, k);
  }
  function w(E) {
    E.target.removeEventListener('dispose', w);
    for (const x in l) {
      const b = l[x],
        k = E.target.uuid;
      k in b && (b[k].dispose(), delete b[k]);
    }
  }
}
function ag(i, e) {
  function t() {
    let P = !1,
      se = new at(),
      te = null,
      fe = new at(0, 0, 0, 0);
    return {
      setMask: (Q) => {
        te !== Q && !P && (i.colorMask(Q, Q, Q, Q), (te = Q));
      },
      setLocked: (Q) => {
        P = Q;
      },
      setClear: (Q, X, _e, Pe, it) => {
        it === !0 && ((Q *= Pe), (X *= Pe), (_e *= Pe)),
          se.set(Q, X, _e, Pe),
          fe.equals(se) === !1 && (i.clearColor(Q, X, _e, Pe), fe.copy(se));
      },
      reset: () => {
        (P = !1), (te = null), fe.set(-1, 0, 0, 0);
      },
    };
  }
  function n() {
    let P = !1,
      se = !1,
      te = null,
      fe = null,
      Q = null;
    return {
      setReversed: function (X) {
        if (se !== X) {
          const _e = e.get('EXT_clip_control');
          X
            ? _e.clipControlEXT(_e.LOWER_LEFT_EXT, _e.ZERO_TO_ONE_EXT)
            : _e.clipControlEXT(_e.LOWER_LEFT_EXT, _e.NEGATIVE_ONE_TO_ONE_EXT),
            (se = X);
          const Pe = Q;
          (Q = null), this.setClear(Pe);
        }
      },
      getReversed: () => se,
      setTest: (X) => {
        X ? ne(i.DEPTH_TEST) : re(i.DEPTH_TEST);
      },
      setMask: (X) => {
        te !== X && !P && (i.depthMask(X), (te = X));
      },
      setFunc: (X) => {
        if ((se && (X = oh[X]), fe !== X)) {
          switch (X) {
            case nr:
              i.depthFunc(i.NEVER);
              break;
            case ir:
              i.depthFunc(i.ALWAYS);
              break;
            case sr:
              i.depthFunc(i.LESS);
              break;
            case ei:
              i.depthFunc(i.LEQUAL);
              break;
            case rr:
              i.depthFunc(i.EQUAL);
              break;
            case ar:
              i.depthFunc(i.GEQUAL);
              break;
            case or:
              i.depthFunc(i.GREATER);
              break;
            case lr:
              i.depthFunc(i.NOTEQUAL);
              break;
            default:
              i.depthFunc(i.LEQUAL);
          }
          fe = X;
        }
      },
      setLocked: (X) => {
        P = X;
      },
      setClear: (X) => {
        Q !== X && ((Q = X), se && (X = 1 - X), i.clearDepth(X));
      },
      reset: () => {
        (P = !1), (te = null), (fe = null), (Q = null), (se = !1);
      },
    };
  }
  function s() {
    let P = !1,
      se = null,
      te = null,
      fe = null,
      Q = null,
      X = null,
      _e = null,
      Pe = null,
      it = null;
    return {
      setTest: (Je) => {
        P || (Je ? ne(i.STENCIL_TEST) : re(i.STENCIL_TEST));
      },
      setMask: (Je) => {
        se !== Je && !P && (i.stencilMask(Je), (se = Je));
      },
      setFunc: (Je, un, dn) => {
        (te !== Je || fe !== un || Q !== dn) && (i.stencilFunc(Je, un, dn), (te = Je), (fe = un), (Q = dn));
      },
      setOp: (Je, un, dn) => {
        (X !== Je || _e !== un || Pe !== dn) && (i.stencilOp(Je, un, dn), (X = Je), (_e = un), (Pe = dn));
      },
      setLocked: (Je) => {
        P = Je;
      },
      setClear: (Je) => {
        it !== Je && (i.clearStencil(Je), (it = Je));
      },
      reset: () => {
        (P = !1), (se = null), (te = null), (fe = null), (Q = null), (X = null), (_e = null), (Pe = null), (it = null);
      },
    };
  }
  let r = new t(),
    a = new n(),
    o = new s(),
    c = new WeakMap(),
    l = new WeakMap(),
    d = {},
    m = {},
    h = new WeakMap(),
    f = [],
    g = null,
    y = !1,
    p = null,
    u = null,
    v = null,
    T = null,
    S = null,
    w = null,
    E = null,
    R = new Ve(0, 0, 0),
    x = 0,
    b = !1,
    k = null,
    C = null,
    N = null,
    O = null,
    W = null,
    z = i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    G = !1,
    F = 0,
    j = i.getParameter(i.VERSION);
  j.indexOf('WebGL') !== -1
    ? ((F = parseFloat(/^WebGL (\d)/.exec(j)[1])), (G = F >= 1))
    : j.indexOf('OpenGL ES') !== -1 && ((F = parseFloat(/^OpenGL ES (\d)/.exec(j)[1])), (G = F >= 2));
  let $ = null,
    ce = {},
    pe = i.getParameter(i.SCISSOR_BOX),
    ue = i.getParameter(i.VIEWPORT),
    Ne = new at().fromArray(pe),
    rt = new at().fromArray(ue);
  function st(P, se, te, fe) {
    const Q = new Uint8Array(4),
      X = i.createTexture();
    i.bindTexture(P, X),
      i.texParameteri(P, i.TEXTURE_MIN_FILTER, i.NEAREST),
      i.texParameteri(P, i.TEXTURE_MAG_FILTER, i.NEAREST);
    for (let _e = 0; _e < te; _e++)
      P === i.TEXTURE_3D || P === i.TEXTURE_2D_ARRAY
        ? i.texImage3D(se, 0, i.RGBA, 1, 1, fe, 0, i.RGBA, i.UNSIGNED_BYTE, Q)
        : i.texImage2D(se + _e, 0, i.RGBA, 1, 1, 0, i.RGBA, i.UNSIGNED_BYTE, Q);
    return X;
  }
  const Z = {};
  (Z[i.TEXTURE_2D] = st(i.TEXTURE_2D, i.TEXTURE_2D, 1)),
    (Z[i.TEXTURE_CUBE_MAP] = st(i.TEXTURE_CUBE_MAP, i.TEXTURE_CUBE_MAP_POSITIVE_X, 6)),
    (Z[i.TEXTURE_2D_ARRAY] = st(i.TEXTURE_2D_ARRAY, i.TEXTURE_2D_ARRAY, 1, 1)),
    (Z[i.TEXTURE_3D] = st(i.TEXTURE_3D, i.TEXTURE_3D, 1, 1)),
    r.setClear(0, 0, 0, 1),
    a.setClear(1),
    o.setClear(0),
    ne(i.DEPTH_TEST),
    a.setFunc(ei),
    Oe(!1),
    ct($o),
    ne(i.CULL_FACE),
    Ze(an);
  function ne(P) {
    d[P] !== !0 && (i.enable(P), (d[P] = !0));
  }
  function re(P) {
    d[P] !== !1 && (i.disable(P), (d[P] = !1));
  }
  function Ue(P, se) {
    return m[P] !== se
      ? (i.bindFramebuffer(P, se),
        (m[P] = se),
        P === i.DRAW_FRAMEBUFFER && (m[i.FRAMEBUFFER] = se),
        P === i.FRAMEBUFFER && (m[i.DRAW_FRAMEBUFFER] = se),
        !0)
      : !1;
  }
  function we(P, se) {
    let te = f,
      fe = !1;
    if (P) {
      (te = h.get(se)), te === void 0 && ((te = []), h.set(se, te));
      const Q = P.textures;
      if (te.length !== Q.length || te[0] !== i.COLOR_ATTACHMENT0) {
        for (let X = 0, _e = Q.length; X < _e; X++) te[X] = i.COLOR_ATTACHMENT0 + X;
        (te.length = Q.length), (fe = !0);
      }
    } else te[0] !== i.BACK && ((te[0] = i.BACK), (fe = !0));
    fe && i.drawBuffers(te);
  }
  function Ie(P) {
    return g !== P ? (i.useProgram(P), (g = P), !0) : !1;
  }
  const gt = { [Ln]: i.FUNC_ADD, [Ic]: i.FUNC_SUBTRACT, [Pc]: i.FUNC_REVERSE_SUBTRACT };
  (gt[Lc] = i.MIN), (gt[Dc] = i.MAX);
  const He = {
    [Uc]: i.ZERO,
    [Nc]: i.ONE,
    [Fc]: i.SRC_COLOR,
    [er]: i.SRC_ALPHA,
    [Gc]: i.SRC_ALPHA_SATURATE,
    [Vc]: i.DST_COLOR,
    [Bc]: i.DST_ALPHA,
    [Oc]: i.ONE_MINUS_SRC_COLOR,
    [tr]: i.ONE_MINUS_SRC_ALPHA,
    [kc]: i.ONE_MINUS_DST_COLOR,
    [zc]: i.ONE_MINUS_DST_ALPHA,
    [Hc]: i.CONSTANT_COLOR,
    [Wc]: i.ONE_MINUS_CONSTANT_COLOR,
    [Xc]: i.CONSTANT_ALPHA,
    [qc]: i.ONE_MINUS_CONSTANT_ALPHA,
  };
  function Ze(P, se, te, fe, Q, X, _e, Pe, it, Je) {
    if (P === an) {
      y === !0 && (re(i.BLEND), (y = !1));
      return;
    }
    if ((y === !1 && (ne(i.BLEND), (y = !0)), P !== Rc)) {
      if (P !== p || Je !== b) {
        if (((u !== Ln || S !== Ln) && (i.blendEquation(i.FUNC_ADD), (u = Ln), (S = Ln)), Je))
          switch (P) {
            case jn:
              i.blendFuncSeparate(i.ONE, i.ONE_MINUS_SRC_ALPHA, i.ONE, i.ONE_MINUS_SRC_ALPHA);
              break;
            case Ko:
              i.blendFunc(i.ONE, i.ONE);
              break;
            case Qo:
              i.blendFuncSeparate(i.ZERO, i.ONE_MINUS_SRC_COLOR, i.ZERO, i.ONE);
              break;
            case jo:
              i.blendFuncSeparate(i.DST_COLOR, i.ONE_MINUS_SRC_ALPHA, i.ZERO, i.ONE);
              break;
            default:
              Ae('WebGLState: Invalid blending: ', P);
              break;
          }
        else
          switch (P) {
            case jn:
              i.blendFuncSeparate(i.SRC_ALPHA, i.ONE_MINUS_SRC_ALPHA, i.ONE, i.ONE_MINUS_SRC_ALPHA);
              break;
            case Ko:
              i.blendFuncSeparate(i.SRC_ALPHA, i.ONE, i.ONE, i.ONE);
              break;
            case Qo:
              Ae('WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true');
              break;
            case jo:
              Ae('WebGLState: MultiplyBlending requires material.premultipliedAlpha = true');
              break;
            default:
              Ae('WebGLState: Invalid blending: ', P);
              break;
          }
        (v = null), (T = null), (w = null), (E = null), R.set(0, 0, 0), (x = 0), (p = P), (b = Je);
      }
      return;
    }
    (Q = Q || se),
      (X = X || te),
      (_e = _e || fe),
      (se !== u || Q !== S) && (i.blendEquationSeparate(gt[se], gt[Q]), (u = se), (S = Q)),
      (te !== v || fe !== T || X !== w || _e !== E) &&
        (i.blendFuncSeparate(He[te], He[fe], He[X], He[_e]), (v = te), (T = fe), (w = X), (E = _e)),
      (Pe.equals(R) === !1 || it !== x) && (i.blendColor(Pe.r, Pe.g, Pe.b, it), R.copy(Pe), (x = it)),
      (p = P),
      (b = !1);
  }
  function je(P, se) {
    P.side === rn ? re(i.CULL_FACE) : ne(i.CULL_FACE);
    let te = P.side === Ct;
    se && (te = !te),
      Oe(te),
      P.blending === jn && P.transparent === !1
        ? Ze(an)
        : Ze(
            P.blending,
            P.blendEquation,
            P.blendSrc,
            P.blendDst,
            P.blendEquationAlpha,
            P.blendSrcAlpha,
            P.blendDstAlpha,
            P.blendColor,
            P.blendAlpha,
            P.premultipliedAlpha,
          ),
      a.setFunc(P.depthFunc),
      a.setTest(P.depthTest),
      a.setMask(P.depthWrite),
      r.setMask(P.colorWrite);
    const fe = P.stencilWrite;
    o.setTest(fe),
      fe &&
        (o.setMask(P.stencilWriteMask),
        o.setFunc(P.stencilFunc, P.stencilRef, P.stencilFuncMask),
        o.setOp(P.stencilFail, P.stencilZFail, P.stencilZPass)),
      ut(P.polygonOffset, P.polygonOffsetFactor, P.polygonOffsetUnits),
      P.alphaToCoverage === !0 ? ne(i.SAMPLE_ALPHA_TO_COVERAGE) : re(i.SAMPLE_ALPHA_TO_COVERAGE);
  }
  function Oe(P) {
    k !== P && (P ? i.frontFace(i.CW) : i.frontFace(i.CCW), (k = P));
  }
  function ct(P) {
    P !== Ec
      ? (ne(i.CULL_FACE),
        P !== C && (P === $o ? i.cullFace(i.BACK) : P === wc ? i.cullFace(i.FRONT) : i.cullFace(i.FRONT_AND_BACK)))
      : re(i.CULL_FACE),
      (C = P);
  }
  function I(P) {
    P !== N && (G && i.lineWidth(P), (N = P));
  }
  function ut(P, se, te) {
    P
      ? (ne(i.POLYGON_OFFSET_FILL),
        (O !== se || W !== te) && ((O = se), (W = te), a.getReversed() && (se = -se), i.polygonOffset(se, te)))
      : re(i.POLYGON_OFFSET_FILL);
  }
  function qe(P) {
    P ? ne(i.SCISSOR_TEST) : re(i.SCISSOR_TEST);
  }
  function nt(P) {
    P === void 0 && (P = i.TEXTURE0 + z - 1), $ !== P && (i.activeTexture(P), ($ = P));
  }
  function ye(P, se, te) {
    te === void 0 && ($ === null ? (te = i.TEXTURE0 + z - 1) : (te = $));
    let fe = ce[te];
    fe === void 0 && ((fe = { type: void 0, texture: void 0 }), (ce[te] = fe)),
      (fe.type !== P || fe.texture !== se) &&
        ($ !== te && (i.activeTexture(te), ($ = te)), i.bindTexture(P, se || Z[P]), (fe.type = P), (fe.texture = se));
  }
  function A() {
    const P = ce[$];
    P !== void 0 && P.type !== void 0 && (i.bindTexture(P.type, null), (P.type = void 0), (P.texture = void 0));
  }
  function _() {
    try {
      i.compressedTexImage2D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function D() {
    try {
      i.compressedTexImage3D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function Y() {
    try {
      i.texSubImage2D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function J() {
    try {
      i.texSubImage3D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function q() {
    try {
      i.compressedTexSubImage2D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function me() {
    try {
      i.compressedTexSubImage3D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function ie() {
    try {
      i.texStorage2D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function Te() {
    try {
      i.texStorage3D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function Ce() {
    try {
      i.texImage2D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function K() {
    try {
      i.texImage3D(...arguments);
    } catch (P) {
      Ae('WebGLState:', P);
    }
  }
  function ee(P) {
    Ne.equals(P) === !1 && (i.scissor(P.x, P.y, P.z, P.w), Ne.copy(P));
  }
  function ge(P) {
    rt.equals(P) === !1 && (i.viewport(P.x, P.y, P.z, P.w), rt.copy(P));
  }
  function xe(P, se) {
    let te = l.get(se);
    te === void 0 && ((te = new WeakMap()), l.set(se, te));
    let fe = te.get(P);
    fe === void 0 && ((fe = i.getUniformBlockIndex(se, P.name)), te.set(P, fe));
  }
  function he(P, se) {
    const fe = l.get(se).get(P);
    c.get(se) !== fe && (i.uniformBlockBinding(se, fe, P.__bindingPointIndex), c.set(se, fe));
  }
  function Be() {
    i.disable(i.BLEND),
      i.disable(i.CULL_FACE),
      i.disable(i.DEPTH_TEST),
      i.disable(i.POLYGON_OFFSET_FILL),
      i.disable(i.SCISSOR_TEST),
      i.disable(i.STENCIL_TEST),
      i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),
      i.blendEquation(i.FUNC_ADD),
      i.blendFunc(i.ONE, i.ZERO),
      i.blendFuncSeparate(i.ONE, i.ZERO, i.ONE, i.ZERO),
      i.blendColor(0, 0, 0, 0),
      i.colorMask(!0, !0, !0, !0),
      i.clearColor(0, 0, 0, 0),
      i.depthMask(!0),
      i.depthFunc(i.LESS),
      a.setReversed(!1),
      i.clearDepth(1),
      i.stencilMask(4294967295),
      i.stencilFunc(i.ALWAYS, 0, 4294967295),
      i.stencilOp(i.KEEP, i.KEEP, i.KEEP),
      i.clearStencil(0),
      i.cullFace(i.BACK),
      i.frontFace(i.CCW),
      i.polygonOffset(0, 0),
      i.activeTexture(i.TEXTURE0),
      i.bindFramebuffer(i.FRAMEBUFFER, null),
      i.bindFramebuffer(i.DRAW_FRAMEBUFFER, null),
      i.bindFramebuffer(i.READ_FRAMEBUFFER, null),
      i.useProgram(null),
      i.lineWidth(1),
      i.scissor(0, 0, i.canvas.width, i.canvas.height),
      i.viewport(0, 0, i.canvas.width, i.canvas.height),
      (d = {}),
      ($ = null),
      (ce = {}),
      (m = {}),
      (h = new WeakMap()),
      (f = []),
      (g = null),
      (y = !1),
      (p = null),
      (u = null),
      (v = null),
      (T = null),
      (S = null),
      (w = null),
      (E = null),
      (R = new Ve(0, 0, 0)),
      (x = 0),
      (b = !1),
      (k = null),
      (C = null),
      (N = null),
      (O = null),
      (W = null),
      Ne.set(0, 0, i.canvas.width, i.canvas.height),
      rt.set(0, 0, i.canvas.width, i.canvas.height),
      r.reset(),
      a.reset(),
      o.reset();
  }
  return {
    buffers: { color: r, depth: a, stencil: o },
    enable: ne,
    disable: re,
    bindFramebuffer: Ue,
    drawBuffers: we,
    useProgram: Ie,
    setBlending: Ze,
    setMaterial: je,
    setFlipSided: Oe,
    setCullFace: ct,
    setLineWidth: I,
    setPolygonOffset: ut,
    setScissorTest: qe,
    activeTexture: nt,
    bindTexture: ye,
    unbindTexture: A,
    compressedTexImage2D: _,
    compressedTexImage3D: D,
    texImage2D: Ce,
    texImage3D: K,
    updateUBOMapping: xe,
    uniformBlockBinding: he,
    texStorage2D: ie,
    texStorage3D: Te,
    texSubImage2D: Y,
    texSubImage3D: J,
    compressedTexSubImage2D: q,
    compressedTexSubImage3D: me,
    scissor: ee,
    viewport: ge,
    reset: Be,
  };
}
function og(i, e, t, n, s, r, a) {
  let o = e.has('WEBGL_multisampled_render_to_texture') ? e.get('WEBGL_multisampled_render_to_texture') : null,
    c = typeof navigator > 'u' ? !1 : /OculusBrowser/g.test(navigator.userAgent),
    l = new Re(),
    d = new WeakMap(),
    m,
    h = new WeakMap(),
    f = !1;
  try {
    f = typeof OffscreenCanvas < 'u' && new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {}
  function g(A, _) {
    return f ? new OffscreenCanvas(A, _) : Qi('canvas');
  }
  function y(A, _, D) {
    let Y = 1,
      J = ye(A);
    if (((J.width > D || J.height > D) && (Y = D / Math.max(J.width, J.height)), Y < 1))
      if (
        (typeof HTMLImageElement < 'u' && A instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement < 'u' && A instanceof HTMLCanvasElement) ||
        (typeof ImageBitmap < 'u' && A instanceof ImageBitmap) ||
        (typeof VideoFrame < 'u' && A instanceof VideoFrame)
      ) {
        const q = Math.floor(Y * J.width),
          me = Math.floor(Y * J.height);
        m === void 0 && (m = g(q, me));
        const ie = _ ? g(q, me) : m;
        return (
          (ie.width = q),
          (ie.height = me),
          ie.getContext('2d').drawImage(A, 0, 0, q, me),
          Ee(
            'WebGLRenderer: Texture has been resized from (' +
              J.width +
              'x' +
              J.height +
              ') to (' +
              q +
              'x' +
              me +
              ').',
          ),
          ie
        );
      } else return 'data' in A && Ee(`WebGLRenderer: Image in DataTexture is too big (${J.width}x${J.height}).`), A;
    return A;
  }
  function p(A) {
    return A.generateMipmaps;
  }
  function u(A) {
    i.generateMipmap(A);
  }
  function v(A) {
    return A.isWebGLCubeRenderTarget
      ? i.TEXTURE_CUBE_MAP
      : A.isWebGL3DRenderTarget
        ? i.TEXTURE_3D
        : A.isWebGLArrayRenderTarget || A.isCompressedArrayTexture
          ? i.TEXTURE_2D_ARRAY
          : i.TEXTURE_2D;
  }
  function T(A, _, D, Y, J = !1) {
    if (A !== null) {
      if (i[A] !== void 0) return i[A];
      Ee(`WebGLRenderer: Attempt to use non-existing WebGL internal format '${A}'`);
    }
    let q = _;
    if (
      (_ === i.RED &&
        (D === i.FLOAT && (q = i.R32F), D === i.HALF_FLOAT && (q = i.R16F), D === i.UNSIGNED_BYTE && (q = i.R8)),
      _ === i.RED_INTEGER &&
        (D === i.UNSIGNED_BYTE && (q = i.R8UI),
        D === i.UNSIGNED_SHORT && (q = i.R16UI),
        D === i.UNSIGNED_INT && (q = i.R32UI),
        D === i.BYTE && (q = i.R8I),
        D === i.SHORT && (q = i.R16I),
        D === i.INT && (q = i.R32I)),
      _ === i.RG &&
        (D === i.FLOAT && (q = i.RG32F), D === i.HALF_FLOAT && (q = i.RG16F), D === i.UNSIGNED_BYTE && (q = i.RG8)),
      _ === i.RG_INTEGER &&
        (D === i.UNSIGNED_BYTE && (q = i.RG8UI),
        D === i.UNSIGNED_SHORT && (q = i.RG16UI),
        D === i.UNSIGNED_INT && (q = i.RG32UI),
        D === i.BYTE && (q = i.RG8I),
        D === i.SHORT && (q = i.RG16I),
        D === i.INT && (q = i.RG32I)),
      _ === i.RGB_INTEGER &&
        (D === i.UNSIGNED_BYTE && (q = i.RGB8UI),
        D === i.UNSIGNED_SHORT && (q = i.RGB16UI),
        D === i.UNSIGNED_INT && (q = i.RGB32UI),
        D === i.BYTE && (q = i.RGB8I),
        D === i.SHORT && (q = i.RGB16I),
        D === i.INT && (q = i.RGB32I)),
      _ === i.RGBA_INTEGER &&
        (D === i.UNSIGNED_BYTE && (q = i.RGBA8UI),
        D === i.UNSIGNED_SHORT && (q = i.RGBA16UI),
        D === i.UNSIGNED_INT && (q = i.RGBA32UI),
        D === i.BYTE && (q = i.RGBA8I),
        D === i.SHORT && (q = i.RGBA16I),
        D === i.INT && (q = i.RGBA32I)),
      _ === i.RGB &&
        (D === i.UNSIGNED_INT_5_9_9_9_REV && (q = i.RGB9_E5),
        D === i.UNSIGNED_INT_10F_11F_11F_REV && (q = i.R11F_G11F_B10F)),
      _ === i.RGBA)
    ) {
      const me = J ? Ki : Ge.getTransfer(Y);
      D === i.FLOAT && (q = i.RGBA32F),
        D === i.HALF_FLOAT && (q = i.RGBA16F),
        D === i.UNSIGNED_BYTE && (q = me === Ye ? i.SRGB8_ALPHA8 : i.RGBA8),
        D === i.UNSIGNED_SHORT_4_4_4_4 && (q = i.RGBA4),
        D === i.UNSIGNED_SHORT_5_5_5_1 && (q = i.RGB5_A1);
    }
    return (
      (q === i.R16F || q === i.R32F || q === i.RG16F || q === i.RG32F || q === i.RGBA16F || q === i.RGBA32F) &&
        e.get('EXT_color_buffer_float'),
      q
    );
  }
  function S(A, _) {
    let D;
    return (
      A
        ? _ === null || _ === Zt || _ === Oi
          ? (D = i.DEPTH24_STENCIL8)
          : _ === Jt
            ? (D = i.DEPTH32F_STENCIL8)
            : _ === Fi &&
              ((D = i.DEPTH24_STENCIL8),
              Ee('DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.'))
        : _ === null || _ === Zt || _ === Oi
          ? (D = i.DEPTH_COMPONENT24)
          : _ === Jt
            ? (D = i.DEPTH_COMPONENT32F)
            : _ === Fi && (D = i.DEPTH_COMPONENT16),
      D
    );
  }
  function w(A, _) {
    return p(A) === !0 || (A.isFramebufferTexture && A.minFilter !== vt && A.minFilter !== Mt)
      ? Math.log2(Math.max(_.width, _.height)) + 1
      : A.mipmaps !== void 0 && A.mipmaps.length > 0
        ? A.mipmaps.length
        : A.isCompressedTexture && Array.isArray(A.image)
          ? _.mipmaps.length
          : 1;
  }
  function E(A) {
    const _ = A.target;
    _.removeEventListener('dispose', E), x(_), _.isVideoTexture && d.delete(_);
  }
  function R(A) {
    const _ = A.target;
    _.removeEventListener('dispose', R), k(_);
  }
  function x(A) {
    const _ = n.get(A);
    if (_.__webglInit === void 0) return;
    const D = A.source,
      Y = h.get(D);
    if (Y) {
      const J = Y[_.__cacheKey];
      J.usedTimes--, J.usedTimes === 0 && b(A), Object.keys(Y).length === 0 && h.delete(D);
    }
    n.remove(A);
  }
  function b(A) {
    const _ = n.get(A);
    i.deleteTexture(_.__webglTexture);
    const D = A.source,
      Y = h.get(D);
    delete Y[_.__cacheKey], a.memory.textures--;
  }
  function k(A) {
    const _ = n.get(A);
    if ((A.depthTexture && (A.depthTexture.dispose(), n.remove(A.depthTexture)), A.isWebGLCubeRenderTarget))
      for (let Y = 0; Y < 6; Y++) {
        if (Array.isArray(_.__webglFramebuffer[Y]))
          for (let J = 0; J < _.__webglFramebuffer[Y].length; J++) i.deleteFramebuffer(_.__webglFramebuffer[Y][J]);
        else i.deleteFramebuffer(_.__webglFramebuffer[Y]);
        _.__webglDepthbuffer && i.deleteRenderbuffer(_.__webglDepthbuffer[Y]);
      }
    else {
      if (Array.isArray(_.__webglFramebuffer))
        for (let Y = 0; Y < _.__webglFramebuffer.length; Y++) i.deleteFramebuffer(_.__webglFramebuffer[Y]);
      else i.deleteFramebuffer(_.__webglFramebuffer);
      if (
        (_.__webglDepthbuffer && i.deleteRenderbuffer(_.__webglDepthbuffer),
        _.__webglMultisampledFramebuffer && i.deleteFramebuffer(_.__webglMultisampledFramebuffer),
        _.__webglColorRenderbuffer)
      )
        for (let Y = 0; Y < _.__webglColorRenderbuffer.length; Y++)
          _.__webglColorRenderbuffer[Y] && i.deleteRenderbuffer(_.__webglColorRenderbuffer[Y]);
      _.__webglDepthRenderbuffer && i.deleteRenderbuffer(_.__webglDepthRenderbuffer);
    }
    const D = A.textures;
    for (let Y = 0, J = D.length; Y < J; Y++) {
      const q = n.get(D[Y]);
      q.__webglTexture && (i.deleteTexture(q.__webglTexture), a.memory.textures--), n.remove(D[Y]);
    }
    n.remove(A);
  }
  let C = 0;
  function N() {
    C = 0;
  }
  function O() {
    const A = C;
    return (
      A >= s.maxTextures &&
        Ee(`WebGLTextures: Trying to use ${A} texture units while this GPU supports only ${s.maxTextures}`),
      (C += 1),
      A
    );
  }
  function W(A) {
    const _ = [];
    return (
      _.push(A.wrapS),
      _.push(A.wrapT),
      _.push(A.wrapR || 0),
      _.push(A.magFilter),
      _.push(A.minFilter),
      _.push(A.anisotropy),
      _.push(A.internalFormat),
      _.push(A.format),
      _.push(A.type),
      _.push(A.generateMipmaps),
      _.push(A.premultiplyAlpha),
      _.push(A.flipY),
      _.push(A.unpackAlignment),
      _.push(A.colorSpace),
      _.join()
    );
  }
  function z(A, _) {
    const D = n.get(A);
    if (
      (A.isVideoTexture && qe(A),
      A.isRenderTargetTexture === !1 && A.isExternalTexture !== !0 && A.version > 0 && D.__version !== A.version)
    ) {
      const Y = A.image;
      if (Y === null) Ee('WebGLRenderer: Texture marked for update but no image data found.');
      else if (Y.complete === !1) Ee('WebGLRenderer: Texture marked for update but image is incomplete');
      else {
        Z(D, A, _);
        return;
      }
    } else A.isExternalTexture && (D.__webglTexture = A.sourceTexture ? A.sourceTexture : null);
    t.bindTexture(i.TEXTURE_2D, D.__webglTexture, i.TEXTURE0 + _);
  }
  function G(A, _) {
    const D = n.get(A);
    if (A.isRenderTargetTexture === !1 && A.version > 0 && D.__version !== A.version) {
      Z(D, A, _);
      return;
    } else A.isExternalTexture && (D.__webglTexture = A.sourceTexture ? A.sourceTexture : null);
    t.bindTexture(i.TEXTURE_2D_ARRAY, D.__webglTexture, i.TEXTURE0 + _);
  }
  function F(A, _) {
    const D = n.get(A);
    if (A.isRenderTargetTexture === !1 && A.version > 0 && D.__version !== A.version) {
      Z(D, A, _);
      return;
    }
    t.bindTexture(i.TEXTURE_3D, D.__webglTexture, i.TEXTURE0 + _);
  }
  function j(A, _) {
    const D = n.get(A);
    if (A.isCubeDepthTexture !== !0 && A.version > 0 && D.__version !== A.version) {
      ne(D, A, _);
      return;
    }
    t.bindTexture(i.TEXTURE_CUBE_MAP, D.__webglTexture, i.TEXTURE0 + _);
  }
  const $ = { [cr]: i.REPEAT, [tn]: i.CLAMP_TO_EDGE, [hr]: i.MIRRORED_REPEAT },
    ce = {
      [vt]: i.NEAREST,
      [Jc]: i.NEAREST_MIPMAP_NEAREST,
      [ms]: i.NEAREST_MIPMAP_LINEAR,
      [Mt]: i.LINEAR,
      [Gr]: i.LINEAR_MIPMAP_NEAREST,
      [kn]: i.LINEAR_MIPMAP_LINEAR,
    },
    pe = {
      [Qc]: i.NEVER,
      [ih]: i.ALWAYS,
      [jc]: i.LESS,
      [wa]: i.LEQUAL,
      [eh]: i.EQUAL,
      [Ca]: i.GEQUAL,
      [th]: i.GREATER,
      [nh]: i.NOTEQUAL,
    };
  function ue(A, _) {
    if (
      (_.type === Jt &&
        e.has('OES_texture_float_linear') === !1 &&
        (_.magFilter === Mt ||
          _.magFilter === Gr ||
          _.magFilter === ms ||
          _.magFilter === kn ||
          _.minFilter === Mt ||
          _.minFilter === Gr ||
          _.minFilter === ms ||
          _.minFilter === kn) &&
        Ee(
          'WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.',
        ),
      i.texParameteri(A, i.TEXTURE_WRAP_S, $[_.wrapS]),
      i.texParameteri(A, i.TEXTURE_WRAP_T, $[_.wrapT]),
      (A === i.TEXTURE_3D || A === i.TEXTURE_2D_ARRAY) && i.texParameteri(A, i.TEXTURE_WRAP_R, $[_.wrapR]),
      i.texParameteri(A, i.TEXTURE_MAG_FILTER, ce[_.magFilter]),
      i.texParameteri(A, i.TEXTURE_MIN_FILTER, ce[_.minFilter]),
      _.compareFunction &&
        (i.texParameteri(A, i.TEXTURE_COMPARE_MODE, i.COMPARE_REF_TO_TEXTURE),
        i.texParameteri(A, i.TEXTURE_COMPARE_FUNC, pe[_.compareFunction])),
      e.has('EXT_texture_filter_anisotropic') === !0)
    ) {
      if (
        _.magFilter === vt ||
        (_.minFilter !== ms && _.minFilter !== kn) ||
        (_.type === Jt && e.has('OES_texture_float_linear') === !1)
      )
        return;
      if (_.anisotropy > 1 || n.get(_).__currentAnisotropy) {
        const D = e.get('EXT_texture_filter_anisotropic');
        i.texParameterf(A, D.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(_.anisotropy, s.getMaxAnisotropy())),
          (n.get(_).__currentAnisotropy = _.anisotropy);
      }
    }
  }
  function Ne(A, _) {
    let D = !1;
    A.__webglInit === void 0 && ((A.__webglInit = !0), _.addEventListener('dispose', E));
    let Y = _.source,
      J = h.get(Y);
    J === void 0 && ((J = {}), h.set(Y, J));
    const q = W(_);
    if (q !== A.__cacheKey) {
      J[q] === void 0 && ((J[q] = { texture: i.createTexture(), usedTimes: 0 }), a.memory.textures++, (D = !0)),
        J[q].usedTimes++;
      const me = J[A.__cacheKey];
      me !== void 0 && (J[A.__cacheKey].usedTimes--, me.usedTimes === 0 && b(_)),
        (A.__cacheKey = q),
        (A.__webglTexture = J[q].texture);
    }
    return D;
  }
  function rt(A, _, D) {
    return Math.floor(Math.floor(A / D) / _);
  }
  function st(A, _, D, Y) {
    const q = A.updateRanges;
    if (q.length === 0) t.texSubImage2D(i.TEXTURE_2D, 0, 0, 0, _.width, _.height, D, Y, _.data);
    else {
      q.sort((K, ee) => K.start - ee.start);
      let me = 0;
      for (let K = 1; K < q.length; K++) {
        const ee = q[me],
          ge = q[K],
          xe = ee.start + ee.count,
          he = rt(ge.start, _.width, 4),
          Be = rt(ee.start, _.width, 4);
        ge.start <= xe + 1 && he === Be && rt(ge.start + ge.count - 1, _.width, 4) === he
          ? (ee.count = Math.max(ee.count, ge.start + ge.count - ee.start))
          : (++me, (q[me] = ge));
      }
      q.length = me + 1;
      const ie = i.getParameter(i.UNPACK_ROW_LENGTH),
        Te = i.getParameter(i.UNPACK_SKIP_PIXELS),
        Ce = i.getParameter(i.UNPACK_SKIP_ROWS);
      i.pixelStorei(i.UNPACK_ROW_LENGTH, _.width);
      for (let K = 0, ee = q.length; K < ee; K++) {
        const ge = q[K],
          xe = Math.floor(ge.start / 4),
          he = Math.ceil(ge.count / 4),
          Be = xe % _.width,
          P = Math.floor(xe / _.width),
          se = he,
          te = 1;
        i.pixelStorei(i.UNPACK_SKIP_PIXELS, Be),
          i.pixelStorei(i.UNPACK_SKIP_ROWS, P),
          t.texSubImage2D(i.TEXTURE_2D, 0, Be, P, se, te, D, Y, _.data);
      }
      A.clearUpdateRanges(),
        i.pixelStorei(i.UNPACK_ROW_LENGTH, ie),
        i.pixelStorei(i.UNPACK_SKIP_PIXELS, Te),
        i.pixelStorei(i.UNPACK_SKIP_ROWS, Ce);
    }
  }
  function Z(A, _, D) {
    let Y = i.TEXTURE_2D;
    (_.isDataArrayTexture || _.isCompressedArrayTexture) && (Y = i.TEXTURE_2D_ARRAY),
      _.isData3DTexture && (Y = i.TEXTURE_3D);
    const J = Ne(A, _),
      q = _.source;
    t.bindTexture(Y, A.__webglTexture, i.TEXTURE0 + D);
    const me = n.get(q);
    if (q.version !== me.__version || J === !0) {
      t.activeTexture(i.TEXTURE0 + D);
      const ie = Ge.getPrimaries(Ge.workingColorSpace),
        Te = _.colorSpace === Sn ? null : Ge.getPrimaries(_.colorSpace),
        Ce = _.colorSpace === Sn || ie === Te ? i.NONE : i.BROWSER_DEFAULT_WEBGL;
      i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL, _.flipY),
        i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL, _.premultiplyAlpha),
        i.pixelStorei(i.UNPACK_ALIGNMENT, _.unpackAlignment),
        i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL, Ce);
      let K = y(_.image, !1, s.maxTextureSize);
      K = nt(_, K);
      let ee = r.convert(_.format, _.colorSpace),
        ge = r.convert(_.type),
        xe = T(_.internalFormat, ee, ge, _.colorSpace, _.isVideoTexture);
      ue(Y, _);
      let he,
        Be = _.mipmaps,
        P = _.isVideoTexture !== !0,
        se = me.__version === void 0 || J === !0,
        te = q.dataReady,
        fe = w(_, K);
      if (_.isDepthTexture)
        (xe = S(_.format === Gn, _.type)),
          se &&
            (P
              ? t.texStorage2D(i.TEXTURE_2D, 1, xe, K.width, K.height)
              : t.texImage2D(i.TEXTURE_2D, 0, xe, K.width, K.height, 0, ee, ge, null));
      else if (_.isDataTexture)
        if (Be.length > 0) {
          P && se && t.texStorage2D(i.TEXTURE_2D, fe, xe, Be[0].width, Be[0].height);
          for (let Q = 0, X = Be.length; Q < X; Q++)
            (he = Be[Q]),
              P
                ? te && t.texSubImage2D(i.TEXTURE_2D, Q, 0, 0, he.width, he.height, ee, ge, he.data)
                : t.texImage2D(i.TEXTURE_2D, Q, xe, he.width, he.height, 0, ee, ge, he.data);
          _.generateMipmaps = !1;
        } else
          P
            ? (se && t.texStorage2D(i.TEXTURE_2D, fe, xe, K.width, K.height), te && st(_, K, ee, ge))
            : t.texImage2D(i.TEXTURE_2D, 0, xe, K.width, K.height, 0, ee, ge, K.data);
      else if (_.isCompressedTexture)
        if (_.isCompressedArrayTexture) {
          P && se && t.texStorage3D(i.TEXTURE_2D_ARRAY, fe, xe, Be[0].width, Be[0].height, K.depth);
          for (let Q = 0, X = Be.length; Q < X; Q++)
            if (((he = Be[Q]), _.format !== Vt))
              if (ee !== null)
                if (P) {
                  if (te)
                    if (_.layerUpdates.size > 0) {
                      const _e = yl(he.width, he.height, _.format, _.type);
                      for (const Pe of _.layerUpdates) {
                        const it = he.data.subarray(
                          (Pe * _e) / he.data.BYTES_PER_ELEMENT,
                          ((Pe + 1) * _e) / he.data.BYTES_PER_ELEMENT,
                        );
                        t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY, Q, 0, 0, Pe, he.width, he.height, 1, ee, it);
                      }
                      _.clearLayerUpdates();
                    } else
                      t.compressedTexSubImage3D(
                        i.TEXTURE_2D_ARRAY,
                        Q,
                        0,
                        0,
                        0,
                        he.width,
                        he.height,
                        K.depth,
                        ee,
                        he.data,
                      );
                } else
                  t.compressedTexImage3D(i.TEXTURE_2D_ARRAY, Q, xe, he.width, he.height, K.depth, 0, he.data, 0, 0);
              else Ee('WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()');
            else
              P
                ? te && t.texSubImage3D(i.TEXTURE_2D_ARRAY, Q, 0, 0, 0, he.width, he.height, K.depth, ee, ge, he.data)
                : t.texImage3D(i.TEXTURE_2D_ARRAY, Q, xe, he.width, he.height, K.depth, 0, ee, ge, he.data);
        } else {
          P && se && t.texStorage2D(i.TEXTURE_2D, fe, xe, Be[0].width, Be[0].height);
          for (let Q = 0, X = Be.length; Q < X; Q++)
            (he = Be[Q]),
              _.format !== Vt
                ? ee !== null
                  ? P
                    ? te && t.compressedTexSubImage2D(i.TEXTURE_2D, Q, 0, 0, he.width, he.height, ee, he.data)
                    : t.compressedTexImage2D(i.TEXTURE_2D, Q, xe, he.width, he.height, 0, he.data)
                  : Ee('WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()')
                : P
                  ? te && t.texSubImage2D(i.TEXTURE_2D, Q, 0, 0, he.width, he.height, ee, ge, he.data)
                  : t.texImage2D(i.TEXTURE_2D, Q, xe, he.width, he.height, 0, ee, ge, he.data);
        }
      else if (_.isDataArrayTexture)
        if (P) {
          if ((se && t.texStorage3D(i.TEXTURE_2D_ARRAY, fe, xe, K.width, K.height, K.depth), te))
            if (_.layerUpdates.size > 0) {
              const Q = yl(K.width, K.height, _.format, _.type);
              for (const X of _.layerUpdates) {
                const _e = K.data.subarray(
                  (X * Q) / K.data.BYTES_PER_ELEMENT,
                  ((X + 1) * Q) / K.data.BYTES_PER_ELEMENT,
                );
                t.texSubImage3D(i.TEXTURE_2D_ARRAY, 0, 0, 0, X, K.width, K.height, 1, ee, ge, _e);
              }
              _.clearLayerUpdates();
            } else t.texSubImage3D(i.TEXTURE_2D_ARRAY, 0, 0, 0, 0, K.width, K.height, K.depth, ee, ge, K.data);
        } else t.texImage3D(i.TEXTURE_2D_ARRAY, 0, xe, K.width, K.height, K.depth, 0, ee, ge, K.data);
      else if (_.isData3DTexture)
        P
          ? (se && t.texStorage3D(i.TEXTURE_3D, fe, xe, K.width, K.height, K.depth),
            te && t.texSubImage3D(i.TEXTURE_3D, 0, 0, 0, 0, K.width, K.height, K.depth, ee, ge, K.data))
          : t.texImage3D(i.TEXTURE_3D, 0, xe, K.width, K.height, K.depth, 0, ee, ge, K.data);
      else if (_.isFramebufferTexture) {
        if (se)
          if (P) t.texStorage2D(i.TEXTURE_2D, fe, xe, K.width, K.height);
          else {
            let Q = K.width,
              X = K.height;
            for (let _e = 0; _e < fe; _e++)
              t.texImage2D(i.TEXTURE_2D, _e, xe, Q, X, 0, ee, ge, null), (Q >>= 1), (X >>= 1);
          }
      } else if (Be.length > 0) {
        if (P && se) {
          const Q = ye(Be[0]);
          t.texStorage2D(i.TEXTURE_2D, fe, xe, Q.width, Q.height);
        }
        for (let Q = 0, X = Be.length; Q < X; Q++)
          (he = Be[Q]),
            P
              ? te && t.texSubImage2D(i.TEXTURE_2D, Q, 0, 0, ee, ge, he)
              : t.texImage2D(i.TEXTURE_2D, Q, xe, ee, ge, he);
        _.generateMipmaps = !1;
      } else if (P) {
        if (se) {
          const Q = ye(K);
          t.texStorage2D(i.TEXTURE_2D, fe, xe, Q.width, Q.height);
        }
        te && t.texSubImage2D(i.TEXTURE_2D, 0, 0, 0, ee, ge, K);
      } else t.texImage2D(i.TEXTURE_2D, 0, xe, ee, ge, K);
      p(_) && u(Y), (me.__version = q.version), _.onUpdate?.(_);
    }
    A.__version = _.version;
  }
  function ne(A, _, D) {
    if (_.image.length !== 6) return;
    const Y = Ne(A, _),
      J = _.source;
    t.bindTexture(i.TEXTURE_CUBE_MAP, A.__webglTexture, i.TEXTURE0 + D);
    const q = n.get(J);
    if (J.version !== q.__version || Y === !0) {
      t.activeTexture(i.TEXTURE0 + D);
      const me = Ge.getPrimaries(Ge.workingColorSpace),
        ie = _.colorSpace === Sn ? null : Ge.getPrimaries(_.colorSpace),
        Te = _.colorSpace === Sn || me === ie ? i.NONE : i.BROWSER_DEFAULT_WEBGL;
      i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL, _.flipY),
        i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL, _.premultiplyAlpha),
        i.pixelStorei(i.UNPACK_ALIGNMENT, _.unpackAlignment),
        i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL, Te);
      const Ce = _.isCompressedTexture || _.image[0].isCompressedTexture,
        K = _.image[0]?.isDataTexture,
        ee = [];
      for (let X = 0; X < 6; X++)
        !Ce && !K ? (ee[X] = y(_.image[X], !0, s.maxCubemapSize)) : (ee[X] = K ? _.image[X].image : _.image[X]),
          (ee[X] = nt(_, ee[X]));
      let ge = ee[0],
        xe = r.convert(_.format, _.colorSpace),
        he = r.convert(_.type),
        Be = T(_.internalFormat, xe, he, _.colorSpace),
        P = _.isVideoTexture !== !0,
        se = q.__version === void 0 || Y === !0,
        te = J.dataReady,
        fe = w(_, ge);
      ue(i.TEXTURE_CUBE_MAP, _);
      let Q;
      if (Ce) {
        P && se && t.texStorage2D(i.TEXTURE_CUBE_MAP, fe, Be, ge.width, ge.height);
        for (let X = 0; X < 6; X++) {
          Q = ee[X].mipmaps;
          for (let _e = 0; _e < Q.length; _e++) {
            const Pe = Q[_e];
            _.format !== Vt
              ? xe !== null
                ? P
                  ? te &&
                    t.compressedTexSubImage2D(
                      i.TEXTURE_CUBE_MAP_POSITIVE_X + X,
                      _e,
                      0,
                      0,
                      Pe.width,
                      Pe.height,
                      xe,
                      Pe.data,
                    )
                  : t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e, Be, Pe.width, Pe.height, 0, Pe.data)
                : Ee('WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()')
              : P
                ? te &&
                  t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e, 0, 0, Pe.width, Pe.height, xe, he, Pe.data)
                : t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e, Be, Pe.width, Pe.height, 0, xe, he, Pe.data);
          }
        }
      } else {
        if (((Q = _.mipmaps), P && se)) {
          Q.length > 0 && fe++;
          const X = ye(ee[0]);
          t.texStorage2D(i.TEXTURE_CUBE_MAP, fe, Be, X.width, X.height);
        }
        for (let X = 0; X < 6; X++)
          if (K) {
            P
              ? te &&
                t.texSubImage2D(
                  i.TEXTURE_CUBE_MAP_POSITIVE_X + X,
                  0,
                  0,
                  0,
                  ee[X].width,
                  ee[X].height,
                  xe,
                  he,
                  ee[X].data,
                )
              : t.texImage2D(
                  i.TEXTURE_CUBE_MAP_POSITIVE_X + X,
                  0,
                  Be,
                  ee[X].width,
                  ee[X].height,
                  0,
                  xe,
                  he,
                  ee[X].data,
                );
            for (let _e = 0; _e < Q.length; _e++) {
              const it = Q[_e].image[X].image;
              P
                ? te &&
                  t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e + 1, 0, 0, it.width, it.height, xe, he, it.data)
                : t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e + 1, Be, it.width, it.height, 0, xe, he, it.data);
            }
          } else {
            P
              ? te && t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, 0, 0, 0, xe, he, ee[X])
              : t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, 0, Be, xe, he, ee[X]);
            for (let _e = 0; _e < Q.length; _e++) {
              const Pe = Q[_e];
              P
                ? te && t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e + 1, 0, 0, xe, he, Pe.image[X])
                : t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + X, _e + 1, Be, xe, he, Pe.image[X]);
            }
          }
      }
      p(_) && u(i.TEXTURE_CUBE_MAP), (q.__version = J.version), _.onUpdate?.(_);
    }
    A.__version = _.version;
  }
  function re(A, _, D, Y, J, q) {
    const me = r.convert(D.format, D.colorSpace),
      ie = r.convert(D.type),
      Te = T(D.internalFormat, me, ie, D.colorSpace),
      Ce = n.get(_),
      K = n.get(D);
    if (((K.__renderTarget = _), !Ce.__hasExternalTextures)) {
      const ee = Math.max(1, _.width >> q),
        ge = Math.max(1, _.height >> q);
      J === i.TEXTURE_3D || J === i.TEXTURE_2D_ARRAY
        ? t.texImage3D(J, q, Te, ee, ge, _.depth, 0, me, ie, null)
        : t.texImage2D(J, q, Te, ee, ge, 0, me, ie, null);
    }
    t.bindFramebuffer(i.FRAMEBUFFER, A),
      ut(_)
        ? o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER, Y, J, K.__webglTexture, 0, I(_))
        : (J === i.TEXTURE_2D || (J >= i.TEXTURE_CUBE_MAP_POSITIVE_X && J <= i.TEXTURE_CUBE_MAP_NEGATIVE_Z)) &&
          i.framebufferTexture2D(i.FRAMEBUFFER, Y, J, K.__webglTexture, q),
      t.bindFramebuffer(i.FRAMEBUFFER, null);
  }
  function Ue(A, _, D) {
    if ((i.bindRenderbuffer(i.RENDERBUFFER, A), _.depthBuffer)) {
      const Y = _.depthTexture,
        J = Y?.isDepthTexture ? Y.type : null,
        q = S(_.stencilBuffer, J),
        me = _.stencilBuffer ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT;
      ut(_)
        ? o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER, I(_), q, _.width, _.height)
        : D
          ? i.renderbufferStorageMultisample(i.RENDERBUFFER, I(_), q, _.width, _.height)
          : i.renderbufferStorage(i.RENDERBUFFER, q, _.width, _.height),
        i.framebufferRenderbuffer(i.FRAMEBUFFER, me, i.RENDERBUFFER, A);
    } else {
      const Y = _.textures;
      for (let J = 0; J < Y.length; J++) {
        const q = Y[J],
          me = r.convert(q.format, q.colorSpace),
          ie = r.convert(q.type),
          Te = T(q.internalFormat, me, ie, q.colorSpace);
        ut(_)
          ? o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER, I(_), Te, _.width, _.height)
          : D
            ? i.renderbufferStorageMultisample(i.RENDERBUFFER, I(_), Te, _.width, _.height)
            : i.renderbufferStorage(i.RENDERBUFFER, Te, _.width, _.height);
      }
    }
    i.bindRenderbuffer(i.RENDERBUFFER, null);
  }
  function we(A, _, D) {
    const Y = _.isWebGLCubeRenderTarget === !0;
    if ((t.bindFramebuffer(i.FRAMEBUFFER, A), !_.depthTexture?.isDepthTexture))
      throw new Error('renderTarget.depthTexture must be an instance of THREE.DepthTexture');
    const J = n.get(_.depthTexture);
    if (
      ((J.__renderTarget = _),
      (!J.__webglTexture || _.depthTexture.image.width !== _.width || _.depthTexture.image.height !== _.height) &&
        ((_.depthTexture.image.width = _.width),
        (_.depthTexture.image.height = _.height),
        (_.depthTexture.needsUpdate = !0)),
      Y)
    ) {
      if (
        (J.__webglInit === void 0 && ((J.__webglInit = !0), _.depthTexture.addEventListener('dispose', E)),
        J.__webglTexture === void 0)
      ) {
        (J.__webglTexture = i.createTexture()),
          t.bindTexture(i.TEXTURE_CUBE_MAP, J.__webglTexture),
          ue(i.TEXTURE_CUBE_MAP, _.depthTexture);
        let Ce = r.convert(_.depthTexture.format),
          K = r.convert(_.depthTexture.type),
          ee;
        _.depthTexture.format === nn
          ? (ee = i.DEPTH_COMPONENT24)
          : _.depthTexture.format === Gn && (ee = i.DEPTH24_STENCIL8);
        for (let ge = 0; ge < 6; ge++)
          i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X + ge, 0, ee, _.width, _.height, 0, Ce, K, null);
      }
    } else z(_.depthTexture, 0);
    const q = J.__webglTexture,
      me = I(_),
      ie = Y ? i.TEXTURE_CUBE_MAP_POSITIVE_X + D : i.TEXTURE_2D,
      Te = _.depthTexture.format === Gn ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT;
    if (_.depthTexture.format === nn)
      ut(_)
        ? o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER, Te, ie, q, 0, me)
        : i.framebufferTexture2D(i.FRAMEBUFFER, Te, ie, q, 0);
    else if (_.depthTexture.format === Gn)
      ut(_)
        ? o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER, Te, ie, q, 0, me)
        : i.framebufferTexture2D(i.FRAMEBUFFER, Te, ie, q, 0);
    else throw new Error('Unknown depthTexture format');
  }
  function Ie(A) {
    const _ = n.get(A),
      D = A.isWebGLCubeRenderTarget === !0;
    if (_.__boundDepthTexture !== A.depthTexture) {
      const Y = A.depthTexture;
      if ((_.__depthDisposeCallback?.(), Y)) {
        const J = () => {
          delete _.__boundDepthTexture, delete _.__depthDisposeCallback, Y.removeEventListener('dispose', J);
        };
        Y.addEventListener('dispose', J), (_.__depthDisposeCallback = J);
      }
      _.__boundDepthTexture = Y;
    }
    if (A.depthTexture && !_.__autoAllocateDepthBuffer)
      if (D) for (let Y = 0; Y < 6; Y++) we(_.__webglFramebuffer[Y], A, Y);
      else {
        const Y = A.texture.mipmaps;
        Y && Y.length > 0 ? we(_.__webglFramebuffer[0], A, 0) : we(_.__webglFramebuffer, A, 0);
      }
    else if (D) {
      _.__webglDepthbuffer = [];
      for (let Y = 0; Y < 6; Y++)
        if ((t.bindFramebuffer(i.FRAMEBUFFER, _.__webglFramebuffer[Y]), _.__webglDepthbuffer[Y] === void 0))
          (_.__webglDepthbuffer[Y] = i.createRenderbuffer()), Ue(_.__webglDepthbuffer[Y], A, !1);
        else {
          const J = A.stencilBuffer ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT,
            q = _.__webglDepthbuffer[Y];
          i.bindRenderbuffer(i.RENDERBUFFER, q), i.framebufferRenderbuffer(i.FRAMEBUFFER, J, i.RENDERBUFFER, q);
        }
    } else {
      const Y = A.texture.mipmaps;
      if (
        (Y && Y.length > 0
          ? t.bindFramebuffer(i.FRAMEBUFFER, _.__webglFramebuffer[0])
          : t.bindFramebuffer(i.FRAMEBUFFER, _.__webglFramebuffer),
        _.__webglDepthbuffer === void 0)
      )
        (_.__webglDepthbuffer = i.createRenderbuffer()), Ue(_.__webglDepthbuffer, A, !1);
      else {
        const J = A.stencilBuffer ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT,
          q = _.__webglDepthbuffer;
        i.bindRenderbuffer(i.RENDERBUFFER, q), i.framebufferRenderbuffer(i.FRAMEBUFFER, J, i.RENDERBUFFER, q);
      }
    }
    t.bindFramebuffer(i.FRAMEBUFFER, null);
  }
  function gt(A, _, D) {
    const Y = n.get(A);
    _ !== void 0 && re(Y.__webglFramebuffer, A, A.texture, i.COLOR_ATTACHMENT0, i.TEXTURE_2D, 0), D !== void 0 && Ie(A);
  }
  function He(A) {
    const _ = A.texture,
      D = n.get(A),
      Y = n.get(_);
    A.addEventListener('dispose', R);
    const J = A.textures,
      q = A.isWebGLCubeRenderTarget === !0,
      me = J.length > 1;
    if (
      (me ||
        (Y.__webglTexture === void 0 && (Y.__webglTexture = i.createTexture()),
        (Y.__version = _.version),
        a.memory.textures++),
      q)
    ) {
      D.__webglFramebuffer = [];
      for (let ie = 0; ie < 6; ie++)
        if (_.mipmaps && _.mipmaps.length > 0) {
          D.__webglFramebuffer[ie] = [];
          for (let Te = 0; Te < _.mipmaps.length; Te++) D.__webglFramebuffer[ie][Te] = i.createFramebuffer();
        } else D.__webglFramebuffer[ie] = i.createFramebuffer();
    } else {
      if (_.mipmaps && _.mipmaps.length > 0) {
        D.__webglFramebuffer = [];
        for (let ie = 0; ie < _.mipmaps.length; ie++) D.__webglFramebuffer[ie] = i.createFramebuffer();
      } else D.__webglFramebuffer = i.createFramebuffer();
      if (me)
        for (let ie = 0, Te = J.length; ie < Te; ie++) {
          const Ce = n.get(J[ie]);
          Ce.__webglTexture === void 0 && ((Ce.__webglTexture = i.createTexture()), a.memory.textures++);
        }
      if (A.samples > 0 && ut(A) === !1) {
        (D.__webglMultisampledFramebuffer = i.createFramebuffer()),
          (D.__webglColorRenderbuffer = []),
          t.bindFramebuffer(i.FRAMEBUFFER, D.__webglMultisampledFramebuffer);
        for (let ie = 0; ie < J.length; ie++) {
          const Te = J[ie];
          (D.__webglColorRenderbuffer[ie] = i.createRenderbuffer()),
            i.bindRenderbuffer(i.RENDERBUFFER, D.__webglColorRenderbuffer[ie]);
          const Ce = r.convert(Te.format, Te.colorSpace),
            K = r.convert(Te.type),
            ee = T(Te.internalFormat, Ce, K, Te.colorSpace, A.isXRRenderTarget === !0),
            ge = I(A);
          i.renderbufferStorageMultisample(i.RENDERBUFFER, ge, ee, A.width, A.height),
            i.framebufferRenderbuffer(
              i.FRAMEBUFFER,
              i.COLOR_ATTACHMENT0 + ie,
              i.RENDERBUFFER,
              D.__webglColorRenderbuffer[ie],
            );
        }
        i.bindRenderbuffer(i.RENDERBUFFER, null),
          A.depthBuffer &&
            ((D.__webglDepthRenderbuffer = i.createRenderbuffer()), Ue(D.__webglDepthRenderbuffer, A, !0)),
          t.bindFramebuffer(i.FRAMEBUFFER, null);
      }
    }
    if (q) {
      t.bindTexture(i.TEXTURE_CUBE_MAP, Y.__webglTexture), ue(i.TEXTURE_CUBE_MAP, _);
      for (let ie = 0; ie < 6; ie++)
        if (_.mipmaps && _.mipmaps.length > 0)
          for (let Te = 0; Te < _.mipmaps.length; Te++)
            re(D.__webglFramebuffer[ie][Te], A, _, i.COLOR_ATTACHMENT0, i.TEXTURE_CUBE_MAP_POSITIVE_X + ie, Te);
        else re(D.__webglFramebuffer[ie], A, _, i.COLOR_ATTACHMENT0, i.TEXTURE_CUBE_MAP_POSITIVE_X + ie, 0);
      p(_) && u(i.TEXTURE_CUBE_MAP), t.unbindTexture();
    } else if (me) {
      for (let ie = 0, Te = J.length; ie < Te; ie++) {
        let Ce = J[ie],
          K = n.get(Ce),
          ee = i.TEXTURE_2D;
        (A.isWebGL3DRenderTarget || A.isWebGLArrayRenderTarget) &&
          (ee = A.isWebGL3DRenderTarget ? i.TEXTURE_3D : i.TEXTURE_2D_ARRAY),
          t.bindTexture(ee, K.__webglTexture),
          ue(ee, Ce),
          re(D.__webglFramebuffer, A, Ce, i.COLOR_ATTACHMENT0 + ie, ee, 0),
          p(Ce) && u(ee);
      }
      t.unbindTexture();
    } else {
      let ie = i.TEXTURE_2D;
      if (
        ((A.isWebGL3DRenderTarget || A.isWebGLArrayRenderTarget) &&
          (ie = A.isWebGL3DRenderTarget ? i.TEXTURE_3D : i.TEXTURE_2D_ARRAY),
        t.bindTexture(ie, Y.__webglTexture),
        ue(ie, _),
        _.mipmaps && _.mipmaps.length > 0)
      )
        for (let Te = 0; Te < _.mipmaps.length; Te++) re(D.__webglFramebuffer[Te], A, _, i.COLOR_ATTACHMENT0, ie, Te);
      else re(D.__webglFramebuffer, A, _, i.COLOR_ATTACHMENT0, ie, 0);
      p(_) && u(ie), t.unbindTexture();
    }
    A.depthBuffer && Ie(A);
  }
  function Ze(A) {
    const _ = A.textures;
    for (let D = 0, Y = _.length; D < Y; D++) {
      const J = _[D];
      if (p(J)) {
        const q = v(A),
          me = n.get(J).__webglTexture;
        t.bindTexture(q, me), u(q), t.unbindTexture();
      }
    }
  }
  const je = [],
    Oe = [];
  function ct(A) {
    if (A.samples > 0) {
      if (ut(A) === !1) {
        let _ = A.textures,
          D = A.width,
          Y = A.height,
          J = i.COLOR_BUFFER_BIT,
          q = A.stencilBuffer ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT,
          me = n.get(A),
          ie = _.length > 1;
        if (ie)
          for (let Ce = 0; Ce < _.length; Ce++)
            t.bindFramebuffer(i.FRAMEBUFFER, me.__webglMultisampledFramebuffer),
              i.framebufferRenderbuffer(i.FRAMEBUFFER, i.COLOR_ATTACHMENT0 + Ce, i.RENDERBUFFER, null),
              t.bindFramebuffer(i.FRAMEBUFFER, me.__webglFramebuffer),
              i.framebufferTexture2D(i.DRAW_FRAMEBUFFER, i.COLOR_ATTACHMENT0 + Ce, i.TEXTURE_2D, null, 0);
        t.bindFramebuffer(i.READ_FRAMEBUFFER, me.__webglMultisampledFramebuffer);
        const Te = A.texture.mipmaps;
        Te && Te.length > 0
          ? t.bindFramebuffer(i.DRAW_FRAMEBUFFER, me.__webglFramebuffer[0])
          : t.bindFramebuffer(i.DRAW_FRAMEBUFFER, me.__webglFramebuffer);
        for (let Ce = 0; Ce < _.length; Ce++) {
          if (
            (A.resolveDepthBuffer &&
              (A.depthBuffer && (J |= i.DEPTH_BUFFER_BIT),
              A.stencilBuffer && A.resolveStencilBuffer && (J |= i.STENCIL_BUFFER_BIT)),
            ie)
          ) {
            i.framebufferRenderbuffer(
              i.READ_FRAMEBUFFER,
              i.COLOR_ATTACHMENT0,
              i.RENDERBUFFER,
              me.__webglColorRenderbuffer[Ce],
            );
            const K = n.get(_[Ce]).__webglTexture;
            i.framebufferTexture2D(i.DRAW_FRAMEBUFFER, i.COLOR_ATTACHMENT0, i.TEXTURE_2D, K, 0);
          }
          i.blitFramebuffer(0, 0, D, Y, 0, 0, D, Y, J, i.NEAREST),
            c === !0 &&
              ((je.length = 0),
              (Oe.length = 0),
              je.push(i.COLOR_ATTACHMENT0 + Ce),
              A.depthBuffer &&
                A.resolveDepthBuffer === !1 &&
                (je.push(q), Oe.push(q), i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER, Oe)),
              i.invalidateFramebuffer(i.READ_FRAMEBUFFER, je));
        }
        if ((t.bindFramebuffer(i.READ_FRAMEBUFFER, null), t.bindFramebuffer(i.DRAW_FRAMEBUFFER, null), ie))
          for (let Ce = 0; Ce < _.length; Ce++) {
            t.bindFramebuffer(i.FRAMEBUFFER, me.__webglMultisampledFramebuffer),
              i.framebufferRenderbuffer(
                i.FRAMEBUFFER,
                i.COLOR_ATTACHMENT0 + Ce,
                i.RENDERBUFFER,
                me.__webglColorRenderbuffer[Ce],
              );
            const K = n.get(_[Ce]).__webglTexture;
            t.bindFramebuffer(i.FRAMEBUFFER, me.__webglFramebuffer),
              i.framebufferTexture2D(i.DRAW_FRAMEBUFFER, i.COLOR_ATTACHMENT0 + Ce, i.TEXTURE_2D, K, 0);
          }
        t.bindFramebuffer(i.DRAW_FRAMEBUFFER, me.__webglMultisampledFramebuffer);
      } else if (A.depthBuffer && A.resolveDepthBuffer === !1 && c) {
        const _ = A.stencilBuffer ? i.DEPTH_STENCIL_ATTACHMENT : i.DEPTH_ATTACHMENT;
        i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER, [_]);
      }
    }
  }
  function I(A) {
    return Math.min(s.maxSamples, A.samples);
  }
  function ut(A) {
    const _ = n.get(A);
    return A.samples > 0 && e.has('WEBGL_multisampled_render_to_texture') === !0 && _.__useRenderToTexture !== !1;
  }
  function qe(A) {
    const _ = a.render.frame;
    d.get(A) !== _ && (d.set(A, _), A.update());
  }
  function nt(A, _) {
    const D = A.colorSpace,
      Y = A.format,
      J = A.type;
    return (
      A.isCompressedTexture === !0 ||
        A.isVideoTexture === !0 ||
        (D !== ti &&
          D !== Sn &&
          (Ge.getTransfer(D) === Ye
            ? (Y !== Vt || J !== It) &&
              Ee('WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.')
            : Ae('WebGLTextures: Unsupported texture color space:', D))),
      _
    );
  }
  function ye(A) {
    return (
      typeof HTMLImageElement < 'u' && A instanceof HTMLImageElement
        ? ((l.width = A.naturalWidth || A.width), (l.height = A.naturalHeight || A.height))
        : typeof VideoFrame < 'u' && A instanceof VideoFrame
          ? ((l.width = A.displayWidth), (l.height = A.displayHeight))
          : ((l.width = A.width), (l.height = A.height)),
      l
    );
  }
  (this.allocateTextureUnit = O),
    (this.resetTextureUnits = N),
    (this.setTexture2D = z),
    (this.setTexture2DArray = G),
    (this.setTexture3D = F),
    (this.setTextureCube = j),
    (this.rebindTextures = gt),
    (this.setupRenderTarget = He),
    (this.updateRenderTargetMipmap = Ze),
    (this.updateMultisampleRenderTarget = ct),
    (this.setupDepthRenderbuffer = Ie),
    (this.setupFrameBufferTexture = re),
    (this.useMultisampledRTT = ut),
    (this.isReversedDepthBuffer = () => t.buffers.depth.getReversed());
}
function lg(i, e) {
  function t(n, s = Sn) {
    let r,
      a = Ge.getTransfer(s);
    if (n === It) return i.UNSIGNED_BYTE;
    if (n === Wr) return i.UNSIGNED_SHORT_4_4_4_4;
    if (n === Xr) return i.UNSIGNED_SHORT_5_5_5_1;
    if (n === hl) return i.UNSIGNED_INT_5_9_9_9_REV;
    if (n === ul) return i.UNSIGNED_INT_10F_11F_11F_REV;
    if (n === ll) return i.BYTE;
    if (n === cl) return i.SHORT;
    if (n === Fi) return i.UNSIGNED_SHORT;
    if (n === Hr) return i.INT;
    if (n === Zt) return i.UNSIGNED_INT;
    if (n === Jt) return i.FLOAT;
    if (n === on) return i.HALF_FLOAT;
    if (n === dl) return i.ALPHA;
    if (n === fl) return i.RGB;
    if (n === Vt) return i.RGBA;
    if (n === nn) return i.DEPTH_COMPONENT;
    if (n === Gn) return i.DEPTH_STENCIL;
    if (n === pl) return i.RED;
    if (n === qr) return i.RED_INTEGER;
    if (n === si) return i.RG;
    if (n === Yr) return i.RG_INTEGER;
    if (n === Zr) return i.RGBA_INTEGER;
    if (n === gs || n === _s || n === xs || n === vs)
      if (a === Ye)
        if (((r = e.get('WEBGL_compressed_texture_s3tc_srgb')), r !== null)) {
          if (n === gs) return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;
          if (n === _s) return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;
          if (n === xs) return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;
          if (n === vs) return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT;
        } else return null;
      else if (((r = e.get('WEBGL_compressed_texture_s3tc')), r !== null)) {
        if (n === gs) return r.COMPRESSED_RGB_S3TC_DXT1_EXT;
        if (n === _s) return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;
        if (n === xs) return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;
        if (n === vs) return r.COMPRESSED_RGBA_S3TC_DXT5_EXT;
      } else return null;
    if (n === Jr || n === $r || n === Kr || n === Qr)
      if (((r = e.get('WEBGL_compressed_texture_pvrtc')), r !== null)) {
        if (n === Jr) return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
        if (n === $r) return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;
        if (n === Kr) return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
        if (n === Qr) return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;
      } else return null;
    if (n === jr || n === ea || n === ta || n === na || n === ia || n === sa || n === ra)
      if (((r = e.get('WEBGL_compressed_texture_etc')), r !== null)) {
        if (n === jr || n === ea) return a === Ye ? r.COMPRESSED_SRGB8_ETC2 : r.COMPRESSED_RGB8_ETC2;
        if (n === ta) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC : r.COMPRESSED_RGBA8_ETC2_EAC;
        if (n === na) return r.COMPRESSED_R11_EAC;
        if (n === ia) return r.COMPRESSED_SIGNED_R11_EAC;
        if (n === sa) return r.COMPRESSED_RG11_EAC;
        if (n === ra) return r.COMPRESSED_SIGNED_RG11_EAC;
      } else return null;
    if (
      n === aa ||
      n === oa ||
      n === la ||
      n === ca ||
      n === ha ||
      n === ua ||
      n === da ||
      n === fa ||
      n === pa ||
      n === ma ||
      n === ga ||
      n === _a ||
      n === xa ||
      n === va
    )
      if (((r = e.get('WEBGL_compressed_texture_astc')), r !== null)) {
        if (n === aa) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR : r.COMPRESSED_RGBA_ASTC_4x4_KHR;
        if (n === oa) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR : r.COMPRESSED_RGBA_ASTC_5x4_KHR;
        if (n === la) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR : r.COMPRESSED_RGBA_ASTC_5x5_KHR;
        if (n === ca) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR : r.COMPRESSED_RGBA_ASTC_6x5_KHR;
        if (n === ha) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR : r.COMPRESSED_RGBA_ASTC_6x6_KHR;
        if (n === ua) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR : r.COMPRESSED_RGBA_ASTC_8x5_KHR;
        if (n === da) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR : r.COMPRESSED_RGBA_ASTC_8x6_KHR;
        if (n === fa) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR : r.COMPRESSED_RGBA_ASTC_8x8_KHR;
        if (n === pa) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR : r.COMPRESSED_RGBA_ASTC_10x5_KHR;
        if (n === ma) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR : r.COMPRESSED_RGBA_ASTC_10x6_KHR;
        if (n === ga) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR : r.COMPRESSED_RGBA_ASTC_10x8_KHR;
        if (n === _a) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR : r.COMPRESSED_RGBA_ASTC_10x10_KHR;
        if (n === xa) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR : r.COMPRESSED_RGBA_ASTC_12x10_KHR;
        if (n === va) return a === Ye ? r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR : r.COMPRESSED_RGBA_ASTC_12x12_KHR;
      } else return null;
    if (n === ya || n === Ma || n === Sa)
      if (((r = e.get('EXT_texture_compression_bptc')), r !== null)) {
        if (n === ya) return a === Ye ? r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT : r.COMPRESSED_RGBA_BPTC_UNORM_EXT;
        if (n === Ma) return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;
        if (n === Sa) return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT;
      } else return null;
    if (n === ba || n === Ta || n === Aa || n === Ea)
      if (((r = e.get('EXT_texture_compression_rgtc')), r !== null)) {
        if (n === ba) return r.COMPRESSED_RED_RGTC1_EXT;
        if (n === Ta) return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;
        if (n === Aa) return r.COMPRESSED_RED_GREEN_RGTC2_EXT;
        if (n === Ea) return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT;
      } else return null;
    return n === Oi ? i.UNSIGNED_INT_24_8 : i[n] !== void 0 ? i[n] : null;
  }
  return { convert: t };
}
var cg = `
void main() {

	gl_Position = vec4( position, 1.0 );

}`,
  hg = `
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,
  Ul = class {
    constructor() {
      (this.texture = null), (this.mesh = null), (this.depthNear = 0), (this.depthFar = 0);
    }
    init(e, t) {
      if (this.texture === null) {
        const n = new os(e.texture);
        (e.depthNear !== t.depthNear || e.depthFar !== t.depthFar) &&
          ((this.depthNear = e.depthNear), (this.depthFar = e.depthFar)),
          (this.texture = n);
      }
    }
    getMesh(e) {
      if (this.texture !== null && this.mesh === null) {
        const t = e.cameras[0].viewport,
          n = new Ft({
            vertexShader: cg,
            fragmentShader: hg,
            uniforms: { depthColor: { value: this.texture }, depthWidth: { value: t.z }, depthHeight: { value: t.w } },
          });
        this.mesh = new zt(new ls(20, 20), n);
      }
      return this.mesh;
    }
    reset() {
      (this.texture = null), (this.mesh = null);
    }
    getDepthTexture() {
      return this.texture;
    }
  },
  Nl = class extends Mn {
    constructor(e, t) {
      super();
      let n = this,
        s = null,
        r = 1,
        a = null,
        o = 'local-floor',
        c = 1,
        l = null,
        d = null,
        m = null,
        h = null,
        f = null,
        g = null,
        y = typeof XRWebGLBinding < 'u',
        p = new Ul(),
        u = {},
        v = t.getContextAttributes(),
        T = null,
        S = null,
        w = [],
        E = [],
        R = new Re(),
        x = null,
        b = new wt();
      b.viewport = new at();
      const k = new wt();
      k.viewport = new at();
      let C = [b, k],
        N = new zr(),
        O = null,
        W = null;
      (this.cameraAutoUpdate = !0),
        (this.enabled = !1),
        (this.isPresenting = !1),
        (this.getController = (Z) => {
          let ne = w[Z];
          return ne === void 0 && ((ne = new Li()), (w[Z] = ne)), ne.getTargetRaySpace();
        }),
        (this.getControllerGrip = (Z) => {
          let ne = w[Z];
          return ne === void 0 && ((ne = new Li()), (w[Z] = ne)), ne.getGripSpace();
        }),
        (this.getHand = (Z) => {
          let ne = w[Z];
          return ne === void 0 && ((ne = new Li()), (w[Z] = ne)), ne.getHandSpace();
        });
      function z(Z) {
        const ne = E.indexOf(Z.inputSource);
        if (ne === -1) return;
        const re = w[ne];
        re !== void 0 &&
          (re.update(Z.inputSource, Z.frame, l || a), re.dispatchEvent({ type: Z.type, data: Z.inputSource }));
      }
      function G() {
        s.removeEventListener('select', z),
          s.removeEventListener('selectstart', z),
          s.removeEventListener('selectend', z),
          s.removeEventListener('squeeze', z),
          s.removeEventListener('squeezestart', z),
          s.removeEventListener('squeezeend', z),
          s.removeEventListener('end', G),
          s.removeEventListener('inputsourceschange', F);
        for (let Z = 0; Z < w.length; Z++) {
          const ne = E[Z];
          ne !== null && ((E[Z] = null), w[Z].disconnect(ne));
        }
        (O = null), (W = null), p.reset();
        for (const Z in u) delete u[Z];
        e.setRenderTarget(T),
          (f = null),
          (h = null),
          (m = null),
          (s = null),
          (S = null),
          st.stop(),
          (n.isPresenting = !1),
          e.setPixelRatio(x),
          e.setSize(R.width, R.height, !1),
          n.dispatchEvent({ type: 'sessionend' });
      }
      (this.setFramebufferScaleFactor = (Z) => {
        (r = Z), n.isPresenting === !0 && Ee('WebXRManager: Cannot change framebuffer scale while presenting.');
      }),
        (this.setReferenceSpaceType = (Z) => {
          (o = Z), n.isPresenting === !0 && Ee('WebXRManager: Cannot change reference space type while presenting.');
        }),
        (this.getReferenceSpace = () => l || a),
        (this.setReferenceSpace = (Z) => {
          l = Z;
        }),
        (this.getBaseLayer = () => (h !== null ? h : f)),
        (this.getBinding = () => (m === null && y && (m = new XRWebGLBinding(s, t)), m)),
        (this.getFrame = () => g),
        (this.getSession = () => s),
        (this.setSession = async function (Z) {
          if (((s = Z), s !== null)) {
            if (
              ((T = e.getRenderTarget()),
              s.addEventListener('select', z),
              s.addEventListener('selectstart', z),
              s.addEventListener('selectend', z),
              s.addEventListener('squeeze', z),
              s.addEventListener('squeezestart', z),
              s.addEventListener('squeezeend', z),
              s.addEventListener('end', G),
              s.addEventListener('inputsourceschange', F),
              v.xrCompatible !== !0 && (await t.makeXRCompatible()),
              (x = e.getPixelRatio()),
              e.getSize(R),
              y && 'createProjectionLayer' in XRWebGLBinding.prototype)
            ) {
              let re = null,
                Ue = null,
                we = null;
              v.depth &&
                ((we = v.stencil ? t.DEPTH24_STENCIL8 : t.DEPTH_COMPONENT24),
                (re = v.stencil ? Gn : nn),
                (Ue = v.stencil ? Oi : Zt));
              const Ie = { colorFormat: t.RGBA8, depthFormat: we, scaleFactor: r };
              (m = this.getBinding()),
                (h = m.createProjectionLayer(Ie)),
                s.updateRenderState({ layers: [h] }),
                e.setPixelRatio(1),
                e.setSize(h.textureWidth, h.textureHeight, !1),
                (S = new Nt(h.textureWidth, h.textureHeight, {
                  format: Vt,
                  type: It,
                  depthTexture: new Fn(
                    h.textureWidth,
                    h.textureHeight,
                    Ue,
                    void 0,
                    void 0,
                    void 0,
                    void 0,
                    void 0,
                    void 0,
                    re,
                  ),
                  stencilBuffer: v.stencil,
                  colorSpace: e.outputColorSpace,
                  samples: v.antialias ? 4 : 0,
                  resolveDepthBuffer: h.ignoreDepthValues === !1,
                  resolveStencilBuffer: h.ignoreDepthValues === !1,
                }));
            } else {
              const re = {
                antialias: v.antialias,
                alpha: !0,
                depth: v.depth,
                stencil: v.stencil,
                framebufferScaleFactor: r,
              };
              (f = new XRWebGLLayer(s, t, re)),
                s.updateRenderState({ baseLayer: f }),
                e.setPixelRatio(1),
                e.setSize(f.framebufferWidth, f.framebufferHeight, !1),
                (S = new Nt(f.framebufferWidth, f.framebufferHeight, {
                  format: Vt,
                  type: It,
                  colorSpace: e.outputColorSpace,
                  stencilBuffer: v.stencil,
                  resolveDepthBuffer: f.ignoreDepthValues === !1,
                  resolveStencilBuffer: f.ignoreDepthValues === !1,
                }));
            }
            (S.isXRRenderTarget = !0),
              this.setFoveation(c),
              (l = null),
              (a = await s.requestReferenceSpace(o)),
              st.setContext(s),
              st.start(),
              (n.isPresenting = !0),
              n.dispatchEvent({ type: 'sessionstart' });
          }
        }),
        (this.getEnvironmentBlendMode = () => {
          if (s !== null) return s.environmentBlendMode;
        }),
        (this.getDepthTexture = () => p.getDepthTexture());
      function F(Z) {
        for (let ne = 0; ne < Z.removed.length; ne++) {
          const re = Z.removed[ne],
            Ue = E.indexOf(re);
          Ue >= 0 && ((E[Ue] = null), w[Ue].disconnect(re));
        }
        for (let ne = 0; ne < Z.added.length; ne++) {
          let re = Z.added[ne],
            Ue = E.indexOf(re);
          if (Ue === -1) {
            for (let Ie = 0; Ie < w.length; Ie++)
              if (Ie >= E.length) {
                E.push(re), (Ue = Ie);
                break;
              } else if (E[Ie] === null) {
                (E[Ie] = re), (Ue = Ie);
                break;
              }
            if (Ue === -1) break;
          }
          const we = w[Ue];
          we?.connect(re);
        }
      }
      const j = new L(),
        $ = new L();
      function ce(Z, ne, re) {
        j.setFromMatrixPosition(ne.matrixWorld), $.setFromMatrixPosition(re.matrixWorld);
        const Ue = j.distanceTo($),
          we = ne.projectionMatrix.elements,
          Ie = re.projectionMatrix.elements,
          gt = we[14] / (we[10] - 1),
          He = we[14] / (we[10] + 1),
          Ze = (we[9] + 1) / we[5],
          je = (we[9] - 1) / we[5],
          Oe = (we[8] - 1) / we[0],
          ct = (Ie[8] + 1) / Ie[0],
          I = gt * Oe,
          ut = gt * ct,
          qe = Ue / (-Oe + ct),
          nt = qe * -Oe;
        if (
          (ne.matrixWorld.decompose(Z.position, Z.quaternion, Z.scale),
          Z.translateX(nt),
          Z.translateZ(qe),
          Z.matrixWorld.compose(Z.position, Z.quaternion, Z.scale),
          Z.matrixWorldInverse.copy(Z.matrixWorld).invert(),
          we[10] === -1)
        )
          Z.projectionMatrix.copy(ne.projectionMatrix), Z.projectionMatrixInverse.copy(ne.projectionMatrixInverse);
        else {
          const ye = gt + qe,
            A = He + qe,
            _ = I - nt,
            D = ut + (Ue - nt),
            Y = ((Ze * He) / A) * ye,
            J = ((je * He) / A) * ye;
          Z.projectionMatrix.makePerspective(_, D, Y, J, ye, A),
            Z.projectionMatrixInverse.copy(Z.projectionMatrix).invert();
        }
      }
      function pe(Z, ne) {
        ne === null ? Z.matrixWorld.copy(Z.matrix) : Z.matrixWorld.multiplyMatrices(ne.matrixWorld, Z.matrix),
          Z.matrixWorldInverse.copy(Z.matrixWorld).invert();
      }
      this.updateCamera = (Z) => {
        if (s === null) return;
        let ne = Z.near,
          re = Z.far;
        p.texture !== null && (p.depthNear > 0 && (ne = p.depthNear), p.depthFar > 0 && (re = p.depthFar)),
          (N.near = k.near = b.near = ne),
          (N.far = k.far = b.far = re),
          (O !== N.near || W !== N.far) &&
            (s.updateRenderState({ depthNear: N.near, depthFar: N.far }), (O = N.near), (W = N.far)),
          (N.layers.mask = Z.layers.mask | 6),
          (b.layers.mask = N.layers.mask & -5),
          (k.layers.mask = N.layers.mask & -3);
        const Ue = Z.parent,
          we = N.cameras;
        pe(N, Ue);
        for (let Ie = 0; Ie < we.length; Ie++) pe(we[Ie], Ue);
        we.length === 2 ? ce(N, b, k) : N.projectionMatrix.copy(b.projectionMatrix), ue(Z, N, Ue);
      };
      function ue(Z, ne, re) {
        re === null
          ? Z.matrix.copy(ne.matrixWorld)
          : (Z.matrix.copy(re.matrixWorld), Z.matrix.invert(), Z.matrix.multiply(ne.matrixWorld)),
          Z.matrix.decompose(Z.position, Z.quaternion, Z.scale),
          Z.updateMatrixWorld(!0),
          Z.projectionMatrix.copy(ne.projectionMatrix),
          Z.projectionMatrixInverse.copy(ne.projectionMatrixInverse),
          Z.isPerspectiveCamera && ((Z.fov = fr * 2 * Math.atan(1 / Z.projectionMatrix.elements[5])), (Z.zoom = 1));
      }
      (this.getCamera = () => N),
        (this.getFoveation = () => {
          if (!(h === null && f === null)) return c;
        }),
        (this.setFoveation = (Z) => {
          (c = Z),
            h !== null && (h.fixedFoveation = Z),
            f !== null && f.fixedFoveation !== void 0 && (f.fixedFoveation = Z);
        }),
        (this.hasDepthSensing = () => p.texture !== null),
        (this.getDepthSensingMesh = () => p.getMesh(N)),
        (this.getCameraTexture = (Z) => u[Z]);
      let Ne = null;
      function rt(Z, ne) {
        if (((d = ne.getViewerPose(l || a)), (g = ne), d !== null)) {
          const re = d.views;
          f !== null && (e.setRenderTargetFramebuffer(S, f.framebuffer), e.setRenderTarget(S));
          let Ue = !1;
          re.length !== N.cameras.length && ((N.cameras.length = 0), (Ue = !0));
          for (let He = 0; He < re.length; He++) {
            let Ze = re[He],
              je = null;
            if (f !== null) je = f.getViewport(Ze);
            else {
              const ct = m.getViewSubImage(h, Ze);
              (je = ct.viewport),
                He === 0 &&
                  (e.setRenderTargetTextures(S, ct.colorTexture, ct.depthStencilTexture), e.setRenderTarget(S));
            }
            let Oe = C[He];
            Oe === void 0 && ((Oe = new wt()), Oe.layers.enable(He), (Oe.viewport = new at()), (C[He] = Oe)),
              Oe.matrix.fromArray(Ze.transform.matrix),
              Oe.matrix.decompose(Oe.position, Oe.quaternion, Oe.scale),
              Oe.projectionMatrix.fromArray(Ze.projectionMatrix),
              Oe.projectionMatrixInverse.copy(Oe.projectionMatrix).invert(),
              Oe.viewport.set(je.x, je.y, je.width, je.height),
              He === 0 && (N.matrix.copy(Oe.matrix), N.matrix.decompose(N.position, N.quaternion, N.scale)),
              Ue === !0 && N.cameras.push(Oe);
          }
          const we = s.enabledFeatures;
          if (we?.includes('depth-sensing') && s.depthUsage === 'gpu-optimized' && y) {
            m = n.getBinding();
            const He = m.getDepthInformation(re[0]);
            He?.isValid && He.texture && p.init(He, s.renderState);
          }
          if (we?.includes('camera-access') && y) {
            e.state.unbindTexture(), (m = n.getBinding());
            for (let He = 0; He < re.length; He++) {
              const Ze = re[He].camera;
              if (Ze) {
                let je = u[Ze];
                je || ((je = new os()), (u[Ze] = je));
                const Oe = m.getCameraImage(Ze);
                je.sourceTexture = Oe;
              }
            }
          }
        }
        for (let re = 0; re < w.length; re++) {
          const Ue = E[re],
            we = w[re];
          Ue !== null && we !== void 0 && we.update(Ue, ne, l || a);
        }
        Ne?.(Z, ne), ne.detectedPlanes && n.dispatchEvent({ type: 'planesdetected', data: ne }), (g = null);
      }
      const st = new Uh();
      st.setAnimationLoop(rt),
        (this.setAnimationLoop = (Z) => {
          Ne = Z;
        }),
        (this.dispose = () => {});
    }
  },
  oi = new Dn(),
  ug = new tt();
function dg(i, e) {
  function t(p, u) {
    p.matrixAutoUpdate === !0 && p.updateMatrix(), u.value.copy(p.matrix);
  }
  function n(p, u) {
    u.color.getRGB(p.fogColor.value, _l(i)),
      u.isFog
        ? ((p.fogNear.value = u.near), (p.fogFar.value = u.far))
        : u.isFogExp2 && (p.fogDensity.value = u.density);
  }
  function s(p, u, v, T, S) {
    u.isMeshBasicMaterial
      ? r(p, u)
      : u.isMeshLambertMaterial
        ? (r(p, u), u.envMap && (p.envMapIntensity.value = u.envMapIntensity))
        : u.isMeshToonMaterial
          ? (r(p, u), m(p, u))
          : u.isMeshPhongMaterial
            ? (r(p, u), d(p, u), u.envMap && (p.envMapIntensity.value = u.envMapIntensity))
            : u.isMeshStandardMaterial
              ? (r(p, u), h(p, u), u.isMeshPhysicalMaterial && f(p, u, S))
              : u.isMeshMatcapMaterial
                ? (r(p, u), g(p, u))
                : u.isMeshDepthMaterial
                  ? r(p, u)
                  : u.isMeshDistanceMaterial
                    ? (r(p, u), y(p, u))
                    : u.isMeshNormalMaterial
                      ? r(p, u)
                      : u.isLineBasicMaterial
                        ? (a(p, u), u.isLineDashedMaterial && o(p, u))
                        : u.isPointsMaterial
                          ? c(p, u, v, T)
                          : u.isSpriteMaterial
                            ? l(p, u)
                            : u.isShadowMaterial
                              ? (p.color.value.copy(u.color), (p.opacity.value = u.opacity))
                              : u.isShaderMaterial && (u.uniformsNeedUpdate = !1);
  }
  function r(p, u) {
    (p.opacity.value = u.opacity),
      u.color && p.diffuse.value.copy(u.color),
      u.emissive && p.emissive.value.copy(u.emissive).multiplyScalar(u.emissiveIntensity),
      u.map && ((p.map.value = u.map), t(u.map, p.mapTransform)),
      u.alphaMap && ((p.alphaMap.value = u.alphaMap), t(u.alphaMap, p.alphaMapTransform)),
      u.bumpMap &&
        ((p.bumpMap.value = u.bumpMap),
        t(u.bumpMap, p.bumpMapTransform),
        (p.bumpScale.value = u.bumpScale),
        u.side === Ct && (p.bumpScale.value *= -1)),
      u.normalMap &&
        ((p.normalMap.value = u.normalMap),
        t(u.normalMap, p.normalMapTransform),
        p.normalScale.value.copy(u.normalScale),
        u.side === Ct && p.normalScale.value.negate()),
      u.displacementMap &&
        ((p.displacementMap.value = u.displacementMap),
        t(u.displacementMap, p.displacementMapTransform),
        (p.displacementScale.value = u.displacementScale),
        (p.displacementBias.value = u.displacementBias)),
      u.emissiveMap && ((p.emissiveMap.value = u.emissiveMap), t(u.emissiveMap, p.emissiveMapTransform)),
      u.specularMap && ((p.specularMap.value = u.specularMap), t(u.specularMap, p.specularMapTransform)),
      u.alphaTest > 0 && (p.alphaTest.value = u.alphaTest);
    const v = e.get(u),
      T = v.envMap,
      S = v.envMapRotation;
    T &&
      ((p.envMap.value = T),
      oi.copy(S),
      (oi.x *= -1),
      (oi.y *= -1),
      (oi.z *= -1),
      T.isCubeTexture && T.isRenderTargetTexture === !1 && ((oi.y *= -1), (oi.z *= -1)),
      p.envMapRotation.value.setFromMatrix4(ug.makeRotationFromEuler(oi)),
      (p.flipEnvMap.value = T.isCubeTexture && T.isRenderTargetTexture === !1 ? -1 : 1),
      (p.reflectivity.value = u.reflectivity),
      (p.ior.value = u.ior),
      (p.refractionRatio.value = u.refractionRatio)),
      u.lightMap &&
        ((p.lightMap.value = u.lightMap),
        (p.lightMapIntensity.value = u.lightMapIntensity),
        t(u.lightMap, p.lightMapTransform)),
      u.aoMap && ((p.aoMap.value = u.aoMap), (p.aoMapIntensity.value = u.aoMapIntensity), t(u.aoMap, p.aoMapTransform));
  }
  function a(p, u) {
    p.diffuse.value.copy(u.color),
      (p.opacity.value = u.opacity),
      u.map && ((p.map.value = u.map), t(u.map, p.mapTransform));
  }
  function o(p, u) {
    (p.dashSize.value = u.dashSize), (p.totalSize.value = u.dashSize + u.gapSize), (p.scale.value = u.scale);
  }
  function c(p, u, v, T) {
    p.diffuse.value.copy(u.color),
      (p.opacity.value = u.opacity),
      (p.size.value = u.size * v),
      (p.scale.value = T * 0.5),
      u.map && ((p.map.value = u.map), t(u.map, p.uvTransform)),
      u.alphaMap && ((p.alphaMap.value = u.alphaMap), t(u.alphaMap, p.alphaMapTransform)),
      u.alphaTest > 0 && (p.alphaTest.value = u.alphaTest);
  }
  function l(p, u) {
    p.diffuse.value.copy(u.color),
      (p.opacity.value = u.opacity),
      (p.rotation.value = u.rotation),
      u.map && ((p.map.value = u.map), t(u.map, p.mapTransform)),
      u.alphaMap && ((p.alphaMap.value = u.alphaMap), t(u.alphaMap, p.alphaMapTransform)),
      u.alphaTest > 0 && (p.alphaTest.value = u.alphaTest);
  }
  function d(p, u) {
    p.specular.value.copy(u.specular), (p.shininess.value = Math.max(u.shininess, 1e-4));
  }
  function m(p, u) {
    u.gradientMap && (p.gradientMap.value = u.gradientMap);
  }
  function h(p, u) {
    (p.metalness.value = u.metalness),
      u.metalnessMap && ((p.metalnessMap.value = u.metalnessMap), t(u.metalnessMap, p.metalnessMapTransform)),
      (p.roughness.value = u.roughness),
      u.roughnessMap && ((p.roughnessMap.value = u.roughnessMap), t(u.roughnessMap, p.roughnessMapTransform)),
      u.envMap && (p.envMapIntensity.value = u.envMapIntensity);
  }
  function f(p, u, v) {
    (p.ior.value = u.ior),
      u.sheen > 0 &&
        (p.sheenColor.value.copy(u.sheenColor).multiplyScalar(u.sheen),
        (p.sheenRoughness.value = u.sheenRoughness),
        u.sheenColorMap && ((p.sheenColorMap.value = u.sheenColorMap), t(u.sheenColorMap, p.sheenColorMapTransform)),
        u.sheenRoughnessMap &&
          ((p.sheenRoughnessMap.value = u.sheenRoughnessMap), t(u.sheenRoughnessMap, p.sheenRoughnessMapTransform))),
      u.clearcoat > 0 &&
        ((p.clearcoat.value = u.clearcoat),
        (p.clearcoatRoughness.value = u.clearcoatRoughness),
        u.clearcoatMap && ((p.clearcoatMap.value = u.clearcoatMap), t(u.clearcoatMap, p.clearcoatMapTransform)),
        u.clearcoatRoughnessMap &&
          ((p.clearcoatRoughnessMap.value = u.clearcoatRoughnessMap),
          t(u.clearcoatRoughnessMap, p.clearcoatRoughnessMapTransform)),
        u.clearcoatNormalMap &&
          ((p.clearcoatNormalMap.value = u.clearcoatNormalMap),
          t(u.clearcoatNormalMap, p.clearcoatNormalMapTransform),
          p.clearcoatNormalScale.value.copy(u.clearcoatNormalScale),
          u.side === Ct && p.clearcoatNormalScale.value.negate())),
      u.dispersion > 0 && (p.dispersion.value = u.dispersion),
      u.iridescence > 0 &&
        ((p.iridescence.value = u.iridescence),
        (p.iridescenceIOR.value = u.iridescenceIOR),
        (p.iridescenceThicknessMinimum.value = u.iridescenceThicknessRange[0]),
        (p.iridescenceThicknessMaximum.value = u.iridescenceThicknessRange[1]),
        u.iridescenceMap &&
          ((p.iridescenceMap.value = u.iridescenceMap), t(u.iridescenceMap, p.iridescenceMapTransform)),
        u.iridescenceThicknessMap &&
          ((p.iridescenceThicknessMap.value = u.iridescenceThicknessMap),
          t(u.iridescenceThicknessMap, p.iridescenceThicknessMapTransform))),
      u.transmission > 0 &&
        ((p.transmission.value = u.transmission),
        (p.transmissionSamplerMap.value = v.texture),
        p.transmissionSamplerSize.value.set(v.width, v.height),
        u.transmissionMap &&
          ((p.transmissionMap.value = u.transmissionMap), t(u.transmissionMap, p.transmissionMapTransform)),
        (p.thickness.value = u.thickness),
        u.thicknessMap && ((p.thicknessMap.value = u.thicknessMap), t(u.thicknessMap, p.thicknessMapTransform)),
        (p.attenuationDistance.value = u.attenuationDistance),
        p.attenuationColor.value.copy(u.attenuationColor)),
      u.anisotropy > 0 &&
        (p.anisotropyVector.value.set(
          u.anisotropy * Math.cos(u.anisotropyRotation),
          u.anisotropy * Math.sin(u.anisotropyRotation),
        ),
        u.anisotropyMap && ((p.anisotropyMap.value = u.anisotropyMap), t(u.anisotropyMap, p.anisotropyMapTransform))),
      (p.specularIntensity.value = u.specularIntensity),
      p.specularColor.value.copy(u.specularColor),
      u.specularColorMap &&
        ((p.specularColorMap.value = u.specularColorMap), t(u.specularColorMap, p.specularColorMapTransform)),
      u.specularIntensityMap &&
        ((p.specularIntensityMap.value = u.specularIntensityMap),
        t(u.specularIntensityMap, p.specularIntensityMapTransform));
  }
  function g(p, u) {
    u.matcap && (p.matcap.value = u.matcap);
  }
  function y(p, u) {
    const v = e.get(u).light;
    p.referencePosition.value.setFromMatrixPosition(v.matrixWorld),
      (p.nearDistance.value = v.shadow.camera.near),
      (p.farDistance.value = v.shadow.camera.far);
  }
  return { refreshFogUniforms: n, refreshMaterialUniforms: s };
}
function fg(i, e, _t, n) {
  let s = {},
    r = {},
    a = [],
    o = i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);
  function c(v, T) {
    const S = T.program;
    n.uniformBlockBinding(v, S);
  }
  function l(v, T) {
    let S = s[v.id];
    S === void 0 && (g(v), (S = d(v)), (s[v.id] = S), v.addEventListener('dispose', p));
    const w = T.program;
    n.updateUBOMapping(v, w);
    const E = e.render.frame;
    r[v.id] !== E && (h(v), (r[v.id] = E));
  }
  function d(v) {
    const T = m();
    v.__bindingPointIndex = T;
    const S = i.createBuffer(),
      w = v.__size,
      E = v.usage;
    return (
      i.bindBuffer(i.UNIFORM_BUFFER, S),
      i.bufferData(i.UNIFORM_BUFFER, w, E),
      i.bindBuffer(i.UNIFORM_BUFFER, null),
      i.bindBufferBase(i.UNIFORM_BUFFER, T, S),
      S
    );
  }
  function m() {
    for (let v = 0; v < o; v++) if (a.indexOf(v) === -1) return a.push(v), v;
    return Ae('WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.'), 0;
  }
  function h(v) {
    const T = s[v.id],
      S = v.uniforms,
      w = v.__cache;
    i.bindBuffer(i.UNIFORM_BUFFER, T);
    for (let E = 0, R = S.length; E < R; E++) {
      const x = Array.isArray(S[E]) ? S[E] : [S[E]];
      for (let b = 0, k = x.length; b < k; b++) {
        const C = x[b];
        if (f(C, E, b, w) === !0) {
          let N = C.__offset,
            O = Array.isArray(C.value) ? C.value : [C.value],
            W = 0;
          for (let z = 0; z < O.length; z++) {
            const G = O[z],
              F = y(G);
            typeof G === 'number' || typeof G === 'boolean'
              ? ((C.__data[0] = G), i.bufferSubData(i.UNIFORM_BUFFER, N + W, C.__data))
              : G.isMatrix3
                ? ((C.__data[0] = G.elements[0]),
                  (C.__data[1] = G.elements[1]),
                  (C.__data[2] = G.elements[2]),
                  (C.__data[3] = 0),
                  (C.__data[4] = G.elements[3]),
                  (C.__data[5] = G.elements[4]),
                  (C.__data[6] = G.elements[5]),
                  (C.__data[7] = 0),
                  (C.__data[8] = G.elements[6]),
                  (C.__data[9] = G.elements[7]),
                  (C.__data[10] = G.elements[8]),
                  (C.__data[11] = 0))
                : (G.toArray(C.__data, W), (W += F.storage / Float32Array.BYTES_PER_ELEMENT));
          }
          i.bufferSubData(i.UNIFORM_BUFFER, N, C.__data);
        }
      }
    }
    i.bindBuffer(i.UNIFORM_BUFFER, null);
  }
  function f(v, T, S, w) {
    const E = v.value,
      R = `${T}_${S}`;
    if (w[R] === void 0) return typeof E === 'number' || typeof E === 'boolean' ? (w[R] = E) : (w[R] = E.clone()), !0;
    {
      const x = w[R];
      if (typeof E === 'number' || typeof E === 'boolean') {
        if (x !== E) return (w[R] = E), !0;
      } else if (x.equals(E) === !1) return x.copy(E), !0;
    }
    return !1;
  }
  function g(v) {
    let T = v.uniforms,
      S = 0,
      w = 16;
    for (let R = 0, x = T.length; R < x; R++) {
      const b = Array.isArray(T[R]) ? T[R] : [T[R]];
      for (let k = 0, C = b.length; k < C; k++) {
        const N = b[k],
          O = Array.isArray(N.value) ? N.value : [N.value];
        for (let W = 0, z = O.length; W < z; W++) {
          const G = O[W],
            F = y(G),
            j = S % w,
            $ = j % F.boundary,
            ce = j + $;
          (S += $),
            ce !== 0 && w - ce < F.storage && (S += w - ce),
            (N.__data = new Float32Array(F.storage / Float32Array.BYTES_PER_ELEMENT)),
            (N.__offset = S),
            (S += F.storage);
        }
      }
    }
    const E = S % w;
    return E > 0 && (S += w - E), (v.__size = S), (v.__cache = {}), this;
  }
  function y(v) {
    const T = { boundary: 0, storage: 0 };
    return (
      typeof v === 'number' || typeof v === 'boolean'
        ? ((T.boundary = 4), (T.storage = 4))
        : v.isVector2
          ? ((T.boundary = 8), (T.storage = 8))
          : v.isVector3 || v.isColor
            ? ((T.boundary = 16), (T.storage = 12))
            : v.isVector4
              ? ((T.boundary = 16), (T.storage = 16))
              : v.isMatrix3
                ? ((T.boundary = 48), (T.storage = 48))
                : v.isMatrix4
                  ? ((T.boundary = 64), (T.storage = 64))
                  : v.isTexture
                    ? Ee('WebGLRenderer: Texture samplers can not be part of an uniforms group.')
                    : Ee('WebGLRenderer: Unsupported uniform value type.', v),
      T
    );
  }
  function p(v) {
    const T = v.target;
    T.removeEventListener('dispose', p);
    const S = a.indexOf(T.__bindingPointIndex);
    a.splice(S, 1), i.deleteBuffer(s[T.id]), delete s[T.id], delete r[T.id];
  }
  function u() {
    for (const v in s) i.deleteBuffer(s[v]);
    (a = []), (s = {}), (r = {});
  }
  return { bind: c, update: l, dispose: u };
}
var pg = new Uint16Array([
    12469, 15057, 12620, 14925, 13266, 14620, 13807, 14376, 14323, 13990, 14545, 13625, 14713, 13328, 14840, 12882,
    14931, 12528, 14996, 12233, 15039, 11829, 15066, 11525, 15080, 11295, 15085, 10976, 15082, 10705, 15073, 10495,
    13880, 14564, 13898, 14542, 13977, 14430, 14158, 14124, 14393, 13732, 14556, 13410, 14702, 12996, 14814, 12596,
    14891, 12291, 14937, 11834, 14957, 11489, 14958, 11194, 14943, 10803, 14921, 10506, 14893, 10278, 14858, 9960,
    14484, 14039, 14487, 14025, 14499, 13941, 14524, 13740, 14574, 13468, 14654, 13106, 14743, 12678, 14818, 12344,
    14867, 11893, 14889, 11509, 14893, 11180, 14881, 10751, 14852, 10428, 14812, 10128, 14765, 9754, 14712, 9466, 14764,
    13480, 14764, 13475, 14766, 13440, 14766, 13347, 14769, 13070, 14786, 12713, 14816, 12387, 14844, 11957, 14860,
    11549, 14868, 11215, 14855, 10751, 14825, 10403, 14782, 10044, 14729, 9651, 14666, 9352, 14599, 9029, 14967, 12835,
    14966, 12831, 14963, 12804, 14954, 12723, 14936, 12564, 14917, 12347, 14900, 11958, 14886, 11569, 14878, 11247,
    14859, 10765, 14828, 10401, 14784, 10011, 14727, 9600, 14660, 9289, 14586, 8893, 14508, 8533, 15111, 12234, 15110,
    12234, 15104, 12216, 15092, 12156, 15067, 12010, 15028, 11776, 14981, 11500, 14942, 11205, 14902, 10752, 14861,
    10393, 14812, 9991, 14752, 9570, 14682, 9252, 14603, 8808, 14519, 8445, 14431, 8145, 15209, 11449, 15208, 11451,
    15202, 11451, 15190, 11438, 15163, 11384, 15117, 11274, 15055, 10979, 14994, 10648, 14932, 10343, 14871, 9936,
    14803, 9532, 14729, 9218, 14645, 8742, 14556, 8381, 14461, 8020, 14365, 7603, 15273, 10603, 15272, 10607, 15267,
    10619, 15256, 10631, 15231, 10614, 15182, 10535, 15118, 10389, 15042, 10167, 14963, 9787, 14883, 9447, 14800, 9115,
    14710, 8665, 14615, 8318, 14514, 7911, 14411, 7507, 14279, 7198, 15314, 9675, 15313, 9683, 15309, 9712, 15298, 9759,
    15277, 9797, 15229, 9773, 15166, 9668, 15084, 9487, 14995, 9274, 14898, 8910, 14800, 8539, 14697, 8234, 14590, 7790,
    14479, 7409, 14367, 7067, 14178, 6621, 15337, 8619, 15337, 8631, 15333, 8677, 15325, 8769, 15305, 8871, 15264, 8940,
    15202, 8909, 15119, 8775, 15022, 8565, 14916, 8328, 14804, 8009, 14688, 7614, 14569, 7287, 14448, 6888, 14321, 6483,
    14088, 6171, 15350, 7402, 15350, 7419, 15347, 7480, 15340, 7613, 15322, 7804, 15287, 7973, 15229, 8057, 15148, 8012,
    15046, 7846, 14933, 7611, 14810, 7357, 14682, 7069, 14552, 6656, 14421, 6316, 14251, 5948, 14007, 5528, 15356, 5942,
    15356, 5977, 15353, 6119, 15348, 6294, 15332, 6551, 15302, 6824, 15249, 7044, 15171, 7122, 15070, 7050, 14949, 6861,
    14818, 6611, 14679, 6349, 14538, 6067, 14398, 5651, 14189, 5311, 13935, 4958, 15359, 4123, 15359, 4153, 15356, 4296,
    15353, 4646, 15338, 5160, 15311, 5508, 15263, 5829, 15188, 6042, 15088, 6094, 14966, 6001, 14826, 5796, 14678, 5543,
    14527, 5287, 14377, 4985, 14133, 4586, 13869, 4257, 15360, 1563, 15360, 1642, 15358, 2076, 15354, 2636, 15341, 3350,
    15317, 4019, 15273, 4429, 15203, 4732, 15105, 4911, 14981, 4932, 14836, 4818, 14679, 4621, 14517, 4386, 14359, 4156,
    14083, 3795, 13808, 3437, 15360, 122, 15360, 137, 15358, 285, 15355, 636, 15344, 1274, 15322, 2177, 15281, 2765,
    15215, 3223, 15120, 3451, 14995, 3569, 14846, 3567, 14681, 3466, 14511, 3305, 14344, 3121, 14037, 2800, 13753, 2467,
    15360, 0, 15360, 1, 15359, 21, 15355, 89, 15346, 253, 15325, 479, 15287, 796, 15225, 1148, 15133, 1492, 15008, 1749,
    14856, 1882, 14685, 1886, 14506, 1783, 14324, 1608, 13996, 1398, 13702, 1183,
  ]),
  cn = null;
function mg() {
  return (
    cn === null &&
      ((cn = new vr(pg, 16, 16, si, on)),
      (cn.name = 'DFG_LUT'),
      (cn.minFilter = Mt),
      (cn.magFilter = Mt),
      (cn.wrapS = tn),
      (cn.wrapT = tn),
      (cn.generateMipmaps = !1),
      (cn.needsUpdate = !0)),
    cn
  );
}
var Dh = class {
  constructor(e = {}) {
    const {
      canvas: t = sh(),
      context: n = null,
      depth: s = !0,
      stencil: r = !1,
      alpha: a = !1,
      antialias: o = !1,
      premultipliedAlpha: c = !0,
      preserveDrawingBuffer: l = !1,
      powerPreference: d = 'default',
      failIfMajorPerformanceCaveat: m = !1,
      reversedDepthBuffer: h = !1,
      outputBufferType: f = It,
    } = e;
    this.isWebGLRenderer = !0;
    let g;
    if (n !== null) {
      if (typeof WebGLRenderingContext < 'u' && n instanceof WebGLRenderingContext)
        throw new Error('THREE.WebGLRenderer: WebGL 1 is not supported since r163.');
      g = n.getContextAttributes().alpha;
    } else g = a;
    let y = f,
      p = new Set([Zr, Yr, qr]),
      u = new Set([It, Zt, Fi, Oi, Wr, Xr]),
      v = new Uint32Array(4),
      T = new Int32Array(4),
      S = null,
      w = null,
      E = [],
      R = [],
      x = null;
    (this.domElement = t),
      (this.debug = { checkShaderErrors: !0, onShaderError: null }),
      (this.autoClear = !0),
      (this.autoClearColor = !0),
      (this.autoClearDepth = !0),
      (this.autoClearStencil = !0),
      (this.sortObjects = !0),
      (this.clippingPlanes = []),
      (this.localClippingEnabled = !1),
      (this.toneMapping = Yt),
      (this.toneMappingExposure = 1),
      (this.transmissionResolutionScale = 1);
    let b = this,
      k = !1;
    this._outputColorSpace = Ut;
    let C = 0,
      N = 0,
      O = null,
      W = -1,
      z = null,
      G = new at(),
      F = new at(),
      j = null,
      $ = new Ve(0),
      ce = 0,
      pe = t.width,
      ue = t.height,
      Ne = 1,
      rt = null,
      st = null,
      Z = new at(0, 0, pe, ue),
      ne = new at(0, 0, pe, ue),
      re = !1,
      Ue = new Di(),
      we = !1,
      Ie = !1,
      gt = new tt(),
      He = new L(),
      Ze = new at(),
      je = { background: null, fog: null, environment: null, overrideMaterial: null, isScene: !0 },
      Oe = !1;
    function ct() {
      return O === null ? Ne : 1;
    }
    let I = n;
    function ut(M, U) {
      return t.getContext(M, U);
    }
    try {
      const M = {
        alpha: !0,
        depth: s,
        stencil: r,
        antialias: o,
        premultipliedAlpha: c,
        preserveDrawingBuffer: l,
        powerPreference: d,
        failIfMajorPerformanceCaveat: m,
      };
      if (
        ('setAttribute' in t && t.setAttribute('data-engine', `three.js r${'183'}`),
        t.addEventListener('webglcontextlost', _e, !1),
        t.addEventListener('webglcontextrestored', Pe, !1),
        t.addEventListener('webglcontextcreationerror', it, !1),
        I === null)
      ) {
        const U = 'webgl2';
        if (((I = ut(U, M)), I === null))
          throw ut(U)
            ? new Error('Error creating WebGL context with your selected attributes.')
            : new Error('Error creating WebGL context.');
      }
    } catch (M) {
      throw (Ae(`WebGLRenderer: ${M.message}`), M);
    }
    let qe, nt, ye, A, _, D, Y, J, q, me, ie, Te, Ce, K, ee, ge, xe, he, Be, P, se, te, fe;
    function Q() {
      (qe = new bp(I)),
        qe.init(),
        (se = new lg(I, qe)),
        (nt = new mp(I, qe, e, se)),
        (ye = new ag(I, qe)),
        nt.reversedDepthBuffer && h && ye.buffers.depth.setReversed(!0),
        (A = new Ep(I)),
        (_ = new qm()),
        (D = new og(I, qe, ye, _, nt, se, A)),
        (Y = new Sp(b)),
        (J = new Iu(I)),
        (te = new fp(I, J)),
        (q = new Tp(I, J, A, te)),
        (me = new Cp(I, q, J, te, A)),
        (he = new wp(I, nt, D)),
        (ee = new gp(_)),
        (ie = new Xm(b, Y, qe, nt, te, ee)),
        (Te = new dg(b, _)),
        (Ce = new Zm()),
        (K = new eg(qe)),
        (xe = new dp(b, Y, ye, me, g, c)),
        (ge = new rg(b, me, nt)),
        (fe = new fg(I, A, nt, ye)),
        (Be = new pp(I, qe, A)),
        (P = new Ap(I, qe, A)),
        (A.programs = ie.programs),
        (b.capabilities = nt),
        (b.extensions = qe),
        (b.properties = _),
        (b.renderLists = Ce),
        (b.shadowMap = ge),
        (b.state = ye),
        (b.info = A);
    }
    Q(), y !== It && (x = new Ip(y, t.width, t.height, s, r));
    const X = new Nl(b, I);
    (this.xr = X),
      (this.getContext = () => I),
      (this.getContextAttributes = () => I.getContextAttributes()),
      (this.forceContextLoss = () => {
        const M = qe.get('WEBGL_lose_context');
        M?.loseContext();
      }),
      (this.forceContextRestore = () => {
        const M = qe.get('WEBGL_lose_context');
        M?.restoreContext();
      }),
      (this.getPixelRatio = () => Ne),
      (this.setPixelRatio = function (M) {
        M !== void 0 && ((Ne = M), this.setSize(pe, ue, !1));
      }),
      (this.getSize = (M) => M.set(pe, ue)),
      (this.setSize = function (M, U, H = !0) {
        if (X.isPresenting) {
          Ee("WebGLRenderer: Can't change size while VR device is presenting.");
          return;
        }
        (pe = M),
          (ue = U),
          (t.width = Math.floor(M * Ne)),
          (t.height = Math.floor(U * Ne)),
          H === !0 && ((t.style.width = `${M}px`), (t.style.height = `${U}px`)),
          x?.setSize(t.width, t.height),
          this.setViewport(0, 0, M, U);
      }),
      (this.getDrawingBufferSize = (M) => M.set(pe * Ne, ue * Ne).floor()),
      (this.setDrawingBufferSize = function (M, U, H) {
        (pe = M),
          (ue = U),
          (Ne = H),
          (t.width = Math.floor(M * H)),
          (t.height = Math.floor(U * H)),
          this.setViewport(0, 0, M, U);
      }),
      (this.setEffects = (M) => {
        if (y === It) {
          console.error(
            'THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.',
          );
          return;
        }
        if (M) {
          for (let U = 0; U < M.length; U++)
            if (M[U].isOutputPass === !0) {
              console.warn(
                'THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.',
              );
              break;
            }
        }
        x.setEffects(M || []);
      }),
      (this.getCurrentViewport = (M) => M.copy(G)),
      (this.getViewport = (M) => M.copy(Z)),
      (this.setViewport = (M, U, H, V) => {
        M.isVector4 ? Z.set(M.x, M.y, M.z, M.w) : Z.set(M, U, H, V), ye.viewport(G.copy(Z).multiplyScalar(Ne).round());
      }),
      (this.getScissor = (M) => M.copy(ne)),
      (this.setScissor = (M, U, H, V) => {
        M.isVector4 ? ne.set(M.x, M.y, M.z, M.w) : ne.set(M, U, H, V),
          ye.scissor(F.copy(ne).multiplyScalar(Ne).round());
      }),
      (this.getScissorTest = () => re),
      (this.setScissorTest = (M) => {
        ye.setScissorTest((re = M));
      }),
      (this.setOpaqueSort = (M) => {
        rt = M;
      }),
      (this.setTransparentSort = (M) => {
        st = M;
      }),
      (this.getClearColor = (M) => M.copy(xe.getClearColor())),
      (this.setClearColor = function () {
        xe.setClearColor(...arguments);
      }),
      (this.getClearAlpha = () => xe.getClearAlpha()),
      (this.setClearAlpha = function () {
        xe.setClearAlpha(...arguments);
      }),
      (this.clear = function (M = !0, U = !0, H = !0) {
        let V = 0;
        if (M) {
          let B = !1;
          if (O !== null) {
            const oe = O.texture.format;
            B = p.has(oe);
          }
          if (B) {
            const oe = O.texture.type,
              de = u.has(oe),
              le = xe.getClearColor(),
              ve = xe.getClearAlpha(),
              Se = le.r,
              Le = le.g,
              ze = le.b;
            de
              ? ((v[0] = Se), (v[1] = Le), (v[2] = ze), (v[3] = ve), I.clearBufferuiv(I.COLOR, 0, v))
              : ((T[0] = Se), (T[1] = Le), (T[2] = ze), (T[3] = ve), I.clearBufferiv(I.COLOR, 0, T));
          } else V |= I.COLOR_BUFFER_BIT;
        }
        U && (V |= I.DEPTH_BUFFER_BIT),
          H && ((V |= I.STENCIL_BUFFER_BIT), this.state.buffers.stencil.setMask(4294967295)),
          V !== 0 && I.clear(V);
      }),
      (this.clearColor = function () {
        this.clear(!0, !1, !1);
      }),
      (this.clearDepth = function () {
        this.clear(!1, !0, !1);
      }),
      (this.clearStencil = function () {
        this.clear(!1, !1, !0);
      }),
      (this.dispose = () => {
        t.removeEventListener('webglcontextlost', _e, !1),
          t.removeEventListener('webglcontextrestored', Pe, !1),
          t.removeEventListener('webglcontextcreationerror', it, !1),
          xe.dispose(),
          Ce.dispose(),
          K.dispose(),
          _.dispose(),
          Y.dispose(),
          me.dispose(),
          te.dispose(),
          fe.dispose(),
          ie.dispose(),
          X.dispose(),
          X.removeEventListener('sessionstart', Ol),
          X.removeEventListener('sessionend', Bl),
          Wn.stop();
      });
    function _e(M) {
      M.preventDefault(), ji('WebGLRenderer: Context Lost.'), (k = !0);
    }
    function Pe() {
      ji('WebGLRenderer: Context Restored.'), (k = !1);
      const M = A.autoReset,
        U = ge.enabled,
        H = ge.autoUpdate,
        V = ge.needsUpdate,
        B = ge.type;
      Q(), (A.autoReset = M), (ge.enabled = U), (ge.autoUpdate = H), (ge.needsUpdate = V), (ge.type = B);
    }
    function it(M) {
      Ae('WebGLRenderer: A WebGL context could not be created. Reason: ', M.statusMessage);
    }
    function Je(M) {
      const U = M.target;
      U.removeEventListener('dispose', Je), un(U);
    }
    function un(M) {
      dn(M), _.remove(M);
    }
    function dn(M) {
      const U = _.get(M).programs;
      U !== void 0 &&
        (U.forEach((H) => {
          ie.releaseProgram(H);
        }),
        M.isShaderMaterial && ie.releaseShaderCache(M));
    }
    this.renderBufferDirect = (M, U, H, V, B, oe) => {
      U === null && (U = je);
      const de = B.isMesh && B.matrixWorld.determinant() < 0,
        le = Vh(M, U, H, V, B);
      ye.setMaterial(V, de);
      let ve = H.index,
        Se = 1;
      if (V.wireframe === !0) {
        if (((ve = q.getWireframeAttribute(H)), ve === void 0)) return;
        Se = 2;
      }
      let Le = H.drawRange,
        ze = H.attributes.position,
        be = Le.start * Se,
        $e = (Le.start + Le.count) * Se;
      oe !== null && ((be = Math.max(be, oe.start * Se)), ($e = Math.min($e, (oe.start + oe.count) * Se))),
        ve !== null
          ? ((be = Math.max(be, 0)), ($e = Math.min($e, ve.count)))
          : ze != null && ((be = Math.max(be, 0)), ($e = Math.min($e, ze.count)));
      const ht = $e - be;
      if (ht < 0 || ht === 1 / 0) return;
      te.setup(B, V, le, H, ve);
      let ot,
        Ke = Be;
      if ((ve !== null && ((ot = J.get(ve)), (Ke = P), Ke.setIndex(ot)), B.isMesh))
        V.wireframe === !0
          ? (ye.setLineWidth(V.wireframeLinewidth * ct()), Ke.setMode(I.LINES))
          : Ke.setMode(I.TRIANGLES);
      else if (B.isLine) {
        let St = V.linewidth;
        St === void 0 && (St = 1),
          ye.setLineWidth(St * ct()),
          B.isLineSegments ? Ke.setMode(I.LINES) : B.isLineLoop ? Ke.setMode(I.LINE_LOOP) : Ke.setMode(I.LINE_STRIP);
      } else B.isPoints ? Ke.setMode(I.POINTS) : B.isSprite && Ke.setMode(I.TRIANGLES);
      if (B.isBatchedMesh)
        if (B._multiDrawInstances !== null)
          es(
            'WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection.',
          ),
            Ke.renderMultiDrawInstances(
              B._multiDrawStarts,
              B._multiDrawCounts,
              B._multiDrawCount,
              B._multiDrawInstances,
            );
        else if (qe.get('WEBGL_multi_draw'))
          Ke.renderMultiDraw(B._multiDrawStarts, B._multiDrawCounts, B._multiDrawCount);
        else {
          const St = B._multiDrawStarts,
            Me = B._multiDrawCounts,
            Pt = B._multiDrawCount,
            We = ve ? J.get(ve).bytesPerElement : 1,
            kt = _.get(V).currentProgram.getUniforms();
          for (let Kt = 0; Kt < Pt; Kt++) kt.setValue(I, '_gl_DrawID', Kt), Ke.render(St[Kt] / We, Me[Kt]);
        }
      else if (B.isInstancedMesh) Ke.renderInstances(be, ht, B.count);
      else if (H.isInstancedBufferGeometry) {
        const St = H._maxInstanceCount !== void 0 ? H._maxInstanceCount : 1 / 0,
          Me = Math.min(H.instanceCount, St);
        Ke.renderInstances(be, ht, Me);
      } else Ke.render(be, ht);
    };
    function Fl(M, U, H) {
      M.transparent === !0 && M.side === rn && M.forceSinglePass === !1
        ? ((M.side = Ct),
          (M.needsUpdate = !0),
          Ts(M, U, H),
          (M.side = yn),
          (M.needsUpdate = !0),
          Ts(M, U, H),
          (M.side = rn))
        : Ts(M, U, H);
    }
    (this.compile = (M, U, H = null) => {
      H === null && (H = M),
        (w = K.get(H)),
        w.init(U),
        R.push(w),
        H.traverseVisible((B) => {
          B.isLight && B.layers.test(U.layers) && (w.pushLight(B), B.castShadow && w.pushShadow(B));
        }),
        M !== H &&
          M.traverseVisible((B) => {
            B.isLight && B.layers.test(U.layers) && (w.pushLight(B), B.castShadow && w.pushShadow(B));
          }),
        w.setupLights();
      const V = new Set();
      return (
        M.traverse((B) => {
          if (!(B.isMesh || B.isPoints || B.isLine || B.isSprite)) return;
          const oe = B.material;
          if (oe)
            if (Array.isArray(oe))
              for (let de = 0; de < oe.length; de++) {
                const le = oe[de];
                Fl(le, H, B), V.add(le);
              }
            else Fl(oe, H, B), V.add(oe);
        }),
        (w = R.pop()),
        V
      );
    }),
      (this.compileAsync = function (M, U, H = null) {
        const V = this.compile(M, U, H);
        return new Promise((B) => {
          function oe() {
            if (
              (V.forEach((de) => {
                _.get(de).currentProgram.isReady() && V.delete(de);
              }),
              V.size === 0)
            ) {
              B(M);
              return;
            }
            setTimeout(oe, 10);
          }
          qe.get('KHR_parallel_shader_compile') !== null ? oe() : setTimeout(oe, 10);
        });
      });
    let Na = null;
    function zh(M) {
      Na?.(M);
    }
    function Ol() {
      Wn.stop();
    }
    function Bl() {
      Wn.start();
    }
    const Wn = new Uh();
    Wn.setAnimationLoop(zh),
      typeof self < 'u' && Wn.setContext(self),
      (this.setAnimationLoop = (M) => {
        (Na = M), X.setAnimationLoop(M), M === null ? Wn.stop() : Wn.start();
      }),
      X.addEventListener('sessionstart', Ol),
      X.addEventListener('sessionend', Bl),
      (this.render = function (M, U) {
        if (U !== void 0 && U.isCamera !== !0) {
          Ae('WebGLRenderer.render: camera is not an instance of THREE.Camera.');
          return;
        }
        if (k === !0) return;
        const H = X.enabled === !0 && X.isPresenting === !0,
          V = x !== null && (O === null || H) && x.begin(b, O);
        if (
          (M.matrixWorldAutoUpdate === !0 && M.updateMatrixWorld(),
          U.parent === null && U.matrixWorldAutoUpdate === !0 && U.updateMatrixWorld(),
          X.enabled === !0 &&
            X.isPresenting === !0 &&
            (x === null || x.isCompositing() === !1) &&
            (X.cameraAutoUpdate === !0 && X.updateCamera(U), (U = X.getCamera())),
          M.isScene === !0 && M.onBeforeRender(b, M, U, O),
          (w = K.get(M, R.length)),
          w.init(U),
          R.push(w),
          gt.multiplyMatrices(U.projectionMatrix, U.matrixWorldInverse),
          Ue.setFromProjectionMatrix(gt, Xt, U.reversedDepth),
          (Ie = this.localClippingEnabled),
          (we = ee.init(this.clippingPlanes, Ie)),
          (S = Ce.get(M, E.length)),
          S.init(),
          E.push(S),
          X.enabled === !0 && X.isPresenting === !0)
        ) {
          const de = b.xr.getDepthSensingMesh();
          de !== null && Fa(de, U, -1 / 0, b.sortObjects);
        }
        Fa(M, U, 0, b.sortObjects),
          S.finish(),
          b.sortObjects === !0 && S.sort(rt, st),
          (Oe = X.enabled === !1 || X.isPresenting === !1 || X.hasDepthSensing() === !1),
          Oe && xe.addToRenderList(S, M),
          this.info.render.frame++,
          we === !0 && ee.beginShadows();
        const B = w.state.shadowsArray;
        if (
          (ge.render(B, M, U),
          we === !0 && ee.endShadows(),
          this.info.autoReset === !0 && this.info.reset(),
          (V && x.hasRenderPass()) === !1)
        ) {
          const de = S.opaque,
            le = S.transmissive;
          if ((w.setupLights(), U.isArrayCamera)) {
            const ve = U.cameras;
            if (le.length > 0)
              for (let Se = 0, Le = ve.length; Se < Le; Se++) {
                const ze = ve[Se];
                Vl(de, le, M, ze);
              }
            Oe && xe.render(M);
            for (let Se = 0, Le = ve.length; Se < Le; Se++) {
              const ze = ve[Se];
              zl(S, M, ze, ze.viewport);
            }
          } else le.length > 0 && Vl(de, le, M, U), Oe && xe.render(M), zl(S, M, U);
        }
        O !== null && N === 0 && (D.updateMultisampleRenderTarget(O), D.updateRenderTargetMipmap(O)),
          V && x.end(b),
          M.isScene === !0 && M.onAfterRender(b, M, U),
          te.resetDefaultState(),
          (W = -1),
          (z = null),
          R.pop(),
          R.length > 0
            ? ((w = R[R.length - 1]), we === !0 && ee.setGlobalState(b.clippingPlanes, w.state.camera))
            : (w = null),
          E.pop(),
          E.length > 0 ? (S = E[E.length - 1]) : (S = null);
      });
    function Fa(M, U, H, V) {
      if (M.visible === !1) return;
      if (M.layers.test(U.layers)) {
        if (M.isGroup) H = M.renderOrder;
        else if (M.isLOD) M.autoUpdate === !0 && M.update(U);
        else if (M.isLight) w.pushLight(M), M.castShadow && w.pushShadow(M);
        else if (M.isSprite) {
          if (!M.frustumCulled || Ue.intersectsSprite(M)) {
            V && Ze.setFromMatrixPosition(M.matrixWorld).applyMatrix4(gt);
            const de = me.update(M),
              le = M.material;
            le.visible && S.push(M, de, le, H, Ze.z, null);
          }
        } else if ((M.isMesh || M.isLine || M.isPoints) && (!M.frustumCulled || Ue.intersectsObject(M))) {
          const de = me.update(M),
            le = M.material;
          if (
            (V &&
              (M.boundingSphere !== void 0
                ? (M.boundingSphere === null && M.computeBoundingSphere(), Ze.copy(M.boundingSphere.center))
                : (de.boundingSphere === null && de.computeBoundingSphere(), Ze.copy(de.boundingSphere.center)),
              Ze.applyMatrix4(M.matrixWorld).applyMatrix4(gt)),
            Array.isArray(le))
          ) {
            const ve = de.groups;
            for (let Se = 0, Le = ve.length; Se < Le; Se++) {
              const ze = ve[Se],
                be = le[ze.materialIndex];
              be?.visible && S.push(M, de, be, H, Ze.z, ze);
            }
          } else le.visible && S.push(M, de, le, H, Ze.z, null);
        }
      }
      const oe = M.children;
      for (let de = 0, le = oe.length; de < le; de++) Fa(oe[de], U, H, V);
    }
    function zl(M, U, H, V) {
      const { opaque: B, transmissive: oe, transparent: de } = M;
      w.setupLightsView(H),
        we === !0 && ee.setGlobalState(b.clippingPlanes, H),
        V && ye.viewport(G.copy(V)),
        B.length > 0 && bs(B, U, H),
        oe.length > 0 && bs(oe, U, H),
        de.length > 0 && bs(de, U, H),
        ye.buffers.depth.setTest(!0),
        ye.buffers.depth.setMask(!0),
        ye.buffers.color.setMask(!0),
        ye.setPolygonOffset(!1);
    }
    function Vl(M, U, H, V) {
      if ((H.isScene === !0 ? H.overrideMaterial : null) !== null) return;
      if (w.state.transmissionRenderTarget[V.id] === void 0) {
        const be = qe.has('EXT_color_buffer_half_float') || qe.has('EXT_color_buffer_float');
        w.state.transmissionRenderTarget[V.id] = new Nt(1, 1, {
          generateMipmaps: !0,
          type: be ? on : It,
          minFilter: kn,
          samples: Math.max(4, nt.samples),
          stencilBuffer: r,
          resolveDepthBuffer: !1,
          resolveStencilBuffer: !1,
          colorSpace: Ge.workingColorSpace,
        });
      }
      const oe = w.state.transmissionRenderTarget[V.id],
        de = V.viewport || G;
      oe.setSize(de.z * b.transmissionResolutionScale, de.w * b.transmissionResolutionScale);
      const le = b.getRenderTarget(),
        ve = b.getActiveCubeFace(),
        Se = b.getActiveMipmapLevel();
      b.setRenderTarget(oe),
        b.getClearColor($),
        (ce = b.getClearAlpha()),
        ce < 1 && b.setClearColor(16777215, 0.5),
        b.clear(),
        Oe && xe.render(H);
      const Le = b.toneMapping;
      b.toneMapping = Yt;
      const ze = V.viewport;
      if (
        (V.viewport !== void 0 && (V.viewport = void 0),
        w.setupLightsView(V),
        we === !0 && ee.setGlobalState(b.clippingPlanes, V),
        bs(M, H, V),
        D.updateMultisampleRenderTarget(oe),
        D.updateRenderTargetMipmap(oe),
        qe.has('WEBGL_multisampled_render_to_texture') === !1)
      ) {
        let be = !1;
        for (let $e = 0, ht = U.length; $e < ht; $e++) {
          const ot = U[$e],
            { object: Ke, geometry: St, material: Me, group: Pt } = ot;
          if (Me.side === rn && Ke.layers.test(V.layers)) {
            const We = Me.side;
            (Me.side = Ct),
              (Me.needsUpdate = !0),
              kl(Ke, H, V, St, Me, Pt),
              (Me.side = We),
              (Me.needsUpdate = !0),
              (be = !0);
          }
        }
        be === !0 && (D.updateMultisampleRenderTarget(oe), D.updateRenderTargetMipmap(oe));
      }
      b.setRenderTarget(le, ve, Se), b.setClearColor($, ce), ze !== void 0 && (V.viewport = ze), (b.toneMapping = Le);
    }
    function bs(M, U, H) {
      const V = U.isScene === !0 ? U.overrideMaterial : null;
      for (let B = 0, oe = M.length; B < oe; B++) {
        let de = M[B],
          { object: le, geometry: ve, group: Se } = de,
          Le = de.material;
        Le.allowOverride === !0 && V !== null && (Le = V), le.layers.test(H.layers) && kl(le, U, H, ve, Le, Se);
      }
    }
    function kl(M, U, H, V, B, oe) {
      M.onBeforeRender(b, U, H, V, B, oe),
        M.modelViewMatrix.multiplyMatrices(H.matrixWorldInverse, M.matrixWorld),
        M.normalMatrix.getNormalMatrix(M.modelViewMatrix),
        B.onBeforeRender(b, U, H, V, M, oe),
        B.transparent === !0 && B.side === rn && B.forceSinglePass === !1
          ? ((B.side = Ct),
            (B.needsUpdate = !0),
            b.renderBufferDirect(H, U, V, B, M, oe),
            (B.side = yn),
            (B.needsUpdate = !0),
            b.renderBufferDirect(H, U, V, B, M, oe),
            (B.side = rn))
          : b.renderBufferDirect(H, U, V, B, M, oe),
        M.onAfterRender(b, U, H, V, B, oe);
    }
    function Ts(M, U, H) {
      U.isScene !== !0 && (U = je);
      let V = _.get(M),
        B = w.state.lights,
        oe = w.state.shadowsArray,
        de = B.state.version,
        le = ie.getParameters(M, B.state, oe, U, H),
        ve = ie.getProgramCacheKey(le),
        Se = V.programs;
      (V.environment =
        M.isMeshStandardMaterial || M.isMeshLambertMaterial || M.isMeshPhongMaterial ? U.environment : null),
        (V.fog = U.fog);
      const Le =
        M.isMeshStandardMaterial || (M.isMeshLambertMaterial && !M.envMap) || (M.isMeshPhongMaterial && !M.envMap);
      (V.envMap = Y.get(M.envMap || V.environment, Le)),
        (V.envMapRotation = V.environment !== null && M.envMap === null ? U.environmentRotation : M.envMapRotation),
        Se === void 0 && (M.addEventListener('dispose', Je), (Se = new Map()), (V.programs = Se));
      let ze = Se.get(ve);
      if (ze !== void 0) {
        if (V.currentProgram === ze && V.lightsStateVersion === de) return Hl(M, le), ze;
      } else
        (le.uniforms = ie.getUniforms(M)),
          M.onBeforeCompile(le, b),
          (ze = ie.acquireProgram(le, ve)),
          Se.set(ve, ze),
          (V.uniforms = le.uniforms);
      const be = V.uniforms;
      return (
        ((!M.isShaderMaterial && !M.isRawShaderMaterial) || M.clipping === !0) && (be.clippingPlanes = ee.uniform),
        Hl(M, le),
        (V.needsLights = Gh(M)),
        (V.lightsStateVersion = de),
        V.needsLights &&
          ((be.ambientLightColor.value = B.state.ambient),
          (be.lightProbe.value = B.state.probe),
          (be.directionalLights.value = B.state.directional),
          (be.directionalLightShadows.value = B.state.directionalShadow),
          (be.spotLights.value = B.state.spot),
          (be.spotLightShadows.value = B.state.spotShadow),
          (be.rectAreaLights.value = B.state.rectArea),
          (be.ltc_1.value = B.state.rectAreaLTC1),
          (be.ltc_2.value = B.state.rectAreaLTC2),
          (be.pointLights.value = B.state.point),
          (be.pointLightShadows.value = B.state.pointShadow),
          (be.hemisphereLights.value = B.state.hemi),
          (be.directionalShadowMatrix.value = B.state.directionalShadowMatrix),
          (be.spotLightMatrix.value = B.state.spotLightMatrix),
          (be.spotLightMap.value = B.state.spotLightMap),
          (be.pointShadowMatrix.value = B.state.pointShadowMatrix)),
        (V.currentProgram = ze),
        (V.uniformsList = null),
        ze
      );
    }
    function Gl(M) {
      if (M.uniformsList === null) {
        const U = M.currentProgram.getUniforms();
        M.uniformsList = zi.seqWithValue(U.seq, M.uniforms);
      }
      return M.uniformsList;
    }
    function Hl(M, U) {
      const H = _.get(M);
      (H.outputColorSpace = U.outputColorSpace),
        (H.batching = U.batching),
        (H.batchingColor = U.batchingColor),
        (H.instancing = U.instancing),
        (H.instancingColor = U.instancingColor),
        (H.instancingMorph = U.instancingMorph),
        (H.skinning = U.skinning),
        (H.morphTargets = U.morphTargets),
        (H.morphNormals = U.morphNormals),
        (H.morphColors = U.morphColors),
        (H.morphTargetsCount = U.morphTargetsCount),
        (H.numClippingPlanes = U.numClippingPlanes),
        (H.numIntersection = U.numClipIntersection),
        (H.vertexAlphas = U.vertexAlphas),
        (H.vertexTangents = U.vertexTangents),
        (H.toneMapping = U.toneMapping);
    }
    function Vh(M, U, H, V, B) {
      U.isScene !== !0 && (U = je), D.resetTextureUnits();
      let oe = U.fog,
        de = V.isMeshStandardMaterial || V.isMeshLambertMaterial || V.isMeshPhongMaterial ? U.environment : null,
        le = O === null ? b.outputColorSpace : O.isXRRenderTarget === !0 ? O.texture.colorSpace : ti,
        ve = V.isMeshStandardMaterial || (V.isMeshLambertMaterial && !V.envMap) || (V.isMeshPhongMaterial && !V.envMap),
        Se = Y.get(V.envMap || de, ve),
        Le = V.vertexColors === !0 && !!H.attributes.color && H.attributes.color.itemSize === 4,
        ze = !!H.attributes.tangent && (!!V.normalMap || V.anisotropy > 0),
        be = !!H.morphAttributes.position,
        $e = !!H.morphAttributes.normal,
        ht = !!H.morphAttributes.color,
        ot = Yt;
      V.toneMapped && (O === null || O.isXRRenderTarget === !0) && (ot = b.toneMapping);
      const Ke = H.morphAttributes.position || H.morphAttributes.normal || H.morphAttributes.color,
        St = Ke !== void 0 ? Ke.length : 0,
        Me = _.get(V),
        Pt = w.state.lights;
      if (we === !0 && (Ie === !0 || M !== z)) {
        const _t = M === z && V.id === W;
        ee.setState(V, M, _t);
      }
      let We = !1;
      V.version === Me.__version
        ? ((Me.needsLights && Me.lightsStateVersion !== Pt.state.version) ||
            Me.outputColorSpace !== le ||
            (B.isBatchedMesh && Me.batching === !1) ||
            (!B.isBatchedMesh && Me.batching === !0) ||
            (B.isBatchedMesh && Me.batchingColor === !0 && B.colorTexture === null) ||
            (B.isBatchedMesh && Me.batchingColor === !1 && B.colorTexture !== null) ||
            (B.isInstancedMesh && Me.instancing === !1) ||
            (!B.isInstancedMesh && Me.instancing === !0) ||
            (B.isSkinnedMesh && Me.skinning === !1) ||
            (!B.isSkinnedMesh && Me.skinning === !0) ||
            (B.isInstancedMesh && Me.instancingColor === !0 && B.instanceColor === null) ||
            (B.isInstancedMesh && Me.instancingColor === !1 && B.instanceColor !== null) ||
            (B.isInstancedMesh && Me.instancingMorph === !0 && B.morphTexture === null) ||
            (B.isInstancedMesh && Me.instancingMorph === !1 && B.morphTexture !== null) ||
            Me.envMap !== Se ||
            (V.fog === !0 && Me.fog !== oe) ||
            (Me.numClippingPlanes !== void 0 &&
              (Me.numClippingPlanes !== ee.numPlanes || Me.numIntersection !== ee.numIntersection)) ||
            Me.vertexAlphas !== Le ||
            Me.vertexTangents !== ze ||
            Me.morphTargets !== be ||
            Me.morphNormals !== $e ||
            Me.morphColors !== ht ||
            Me.toneMapping !== ot ||
            Me.morphTargetsCount !== St) &&
          (We = !0)
        : ((We = !0), (Me.__version = V.version));
      let kt = Me.currentProgram;
      We === !0 && (kt = Ts(V, U, B));
      let Kt = !1,
        Xn = !1,
        ci = !1,
        et = kt.getUniforms(),
        yt = Me.uniforms;
      if (
        (ye.useProgram(kt.program) && ((Kt = !0), (Xn = !0), (ci = !0)),
        V.id !== W && ((W = V.id), (Xn = !0)),
        Kt || z !== M)
      ) {
        ye.buffers.depth.getReversed() &&
          M.reversedDepth !== !0 &&
          ((M._reversedDepth = !0), M.updateProjectionMatrix()),
          et.setValue(I, 'projectionMatrix', M.projectionMatrix),
          et.setValue(I, 'viewMatrix', M.matrixWorldInverse);
        const Tn = et.map.cameraPosition;
        Tn !== void 0 && Tn.setValue(I, He.setFromMatrixPosition(M.matrixWorld)),
          nt.logarithmicDepthBuffer && et.setValue(I, 'logDepthBufFC', 2 / (Math.log(M.far + 1) / Math.LN2)),
          (V.isMeshPhongMaterial ||
            V.isMeshToonMaterial ||
            V.isMeshLambertMaterial ||
            V.isMeshBasicMaterial ||
            V.isMeshStandardMaterial ||
            V.isShaderMaterial) &&
            et.setValue(I, 'isOrthographic', M.isOrthographicCamera === !0),
          z !== M && ((z = M), (Xn = !0), (ci = !0));
      }
      if (
        (Me.needsLights &&
          (Pt.state.directionalShadowMap.length > 0 &&
            et.setValue(I, 'directionalShadowMap', Pt.state.directionalShadowMap, D),
          Pt.state.spotShadowMap.length > 0 && et.setValue(I, 'spotShadowMap', Pt.state.spotShadowMap, D),
          Pt.state.pointShadowMap.length > 0 && et.setValue(I, 'pointShadowMap', Pt.state.pointShadowMap, D)),
        B.isSkinnedMesh)
      ) {
        et.setOptional(I, B, 'bindMatrix'), et.setOptional(I, B, 'bindMatrixInverse');
        const _t = B.skeleton;
        _t && (_t.boneTexture === null && _t.computeBoneTexture(), et.setValue(I, 'boneTexture', _t.boneTexture, D));
      }
      B.isBatchedMesh &&
        (et.setOptional(I, B, 'batchingTexture'),
        et.setValue(I, 'batchingTexture', B._matricesTexture, D),
        et.setOptional(I, B, 'batchingIdTexture'),
        et.setValue(I, 'batchingIdTexture', B._indirectTexture, D),
        et.setOptional(I, B, 'batchingColorTexture'),
        B._colorsTexture !== null && et.setValue(I, 'batchingColorTexture', B._colorsTexture, D));
      const bn = H.morphAttributes;
      if (
        ((bn.position !== void 0 || bn.normal !== void 0 || bn.color !== void 0) && he.update(B, H, kt),
        (Xn || Me.receiveShadow !== B.receiveShadow) &&
          ((Me.receiveShadow = B.receiveShadow), et.setValue(I, 'receiveShadow', B.receiveShadow)),
        (V.isMeshStandardMaterial || V.isMeshLambertMaterial || V.isMeshPhongMaterial) &&
          V.envMap === null &&
          U.environment !== null &&
          (yt.envMapIntensity.value = U.environmentIntensity),
        yt.dfgLUT !== void 0 && (yt.dfgLUT.value = mg()),
        Xn &&
          (et.setValue(I, 'toneMappingExposure', b.toneMappingExposure),
          Me.needsLights && kh(yt, ci),
          oe && V.fog === !0 && Te.refreshFogUniforms(yt, oe),
          Te.refreshMaterialUniforms(yt, V, Ne, ue, w.state.transmissionRenderTarget[M.id]),
          zi.upload(I, Gl(Me), yt, D)),
        V.isShaderMaterial && V.uniformsNeedUpdate === !0 && (zi.upload(I, Gl(Me), yt, D), (V.uniformsNeedUpdate = !1)),
        V.isSpriteMaterial && et.setValue(I, 'center', B.center),
        et.setValue(I, 'modelViewMatrix', B.modelViewMatrix),
        et.setValue(I, 'normalMatrix', B.normalMatrix),
        et.setValue(I, 'modelMatrix', B.matrixWorld),
        V.isShaderMaterial || V.isRawShaderMaterial)
      ) {
        const _t = V.uniformsGroups;
        for (let Tn = 0, hi = _t.length; Tn < hi; Tn++) {
          const Wl = _t[Tn];
          fe.update(Wl, kt), fe.bind(Wl, kt);
        }
      }
      return kt;
    }
    function kh(M, U) {
      (M.ambientLightColor.needsUpdate = U),
        (M.lightProbe.needsUpdate = U),
        (M.directionalLights.needsUpdate = U),
        (M.directionalLightShadows.needsUpdate = U),
        (M.pointLights.needsUpdate = U),
        (M.pointLightShadows.needsUpdate = U),
        (M.spotLights.needsUpdate = U),
        (M.spotLightShadows.needsUpdate = U),
        (M.rectAreaLights.needsUpdate = U),
        (M.hemisphereLights.needsUpdate = U);
    }
    function Gh(M) {
      return (
        M.isMeshLambertMaterial ||
        M.isMeshToonMaterial ||
        M.isMeshPhongMaterial ||
        M.isMeshStandardMaterial ||
        M.isShadowMaterial ||
        (M.isShaderMaterial && M.lights === !0)
      );
    }
    (this.getActiveCubeFace = () => C),
      (this.getActiveMipmapLevel = () => N),
      (this.getRenderTarget = () => O),
      (this.setRenderTargetTextures = (M, U, H) => {
        const V = _.get(M);
        (V.__autoAllocateDepthBuffer = M.resolveDepthBuffer === !1),
          V.__autoAllocateDepthBuffer === !1 && (V.__useRenderToTexture = !1),
          (_.get(M.texture).__webglTexture = U),
          (_.get(M.depthTexture).__webglTexture = V.__autoAllocateDepthBuffer ? void 0 : H),
          (V.__hasExternalTextures = !0);
      }),
      (this.setRenderTargetFramebuffer = (M, U) => {
        const H = _.get(M);
        (H.__webglFramebuffer = U), (H.__useDefaultFramebuffer = U === void 0);
      });
    const Hh = I.createFramebuffer();
    (this.setRenderTarget = (M, U = 0, H = 0) => {
      (O = M), (C = U), (N = H);
      let V = null,
        B = !1,
        oe = !1;
      if (M) {
        const le = _.get(M);
        if (le.__useDefaultFramebuffer !== void 0) {
          ye.bindFramebuffer(I.FRAMEBUFFER, le.__webglFramebuffer),
            G.copy(M.viewport),
            F.copy(M.scissor),
            (j = M.scissorTest),
            ye.viewport(G),
            ye.scissor(F),
            ye.setScissorTest(j),
            (W = -1);
          return;
        } else if (le.__webglFramebuffer === void 0) D.setupRenderTarget(M);
        else if (le.__hasExternalTextures)
          D.rebindTextures(M, _.get(M.texture).__webglTexture, _.get(M.depthTexture).__webglTexture);
        else if (M.depthBuffer) {
          const Le = M.depthTexture;
          if (le.__boundDepthTexture !== Le) {
            if (Le !== null && _.has(Le) && (M.width !== Le.image.width || M.height !== Le.image.height))
              throw new Error('WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.');
            D.setupDepthRenderbuffer(M);
          }
        }
        const ve = M.texture;
        (ve.isData3DTexture || ve.isDataArrayTexture || ve.isCompressedArrayTexture) && (oe = !0);
        const Se = _.get(M).__webglFramebuffer;
        M.isWebGLCubeRenderTarget
          ? (Array.isArray(Se[U]) ? (V = Se[U][H]) : (V = Se[U]), (B = !0))
          : M.samples > 0 && D.useMultisampledRTT(M) === !1
            ? (V = _.get(M).__webglMultisampledFramebuffer)
            : Array.isArray(Se)
              ? (V = Se[H])
              : (V = Se),
          G.copy(M.viewport),
          F.copy(M.scissor),
          (j = M.scissorTest);
      } else G.copy(Z).multiplyScalar(Ne).floor(), F.copy(ne).multiplyScalar(Ne).floor(), (j = re);
      if (
        (H !== 0 && (V = Hh),
        ye.bindFramebuffer(I.FRAMEBUFFER, V) && ye.drawBuffers(M, V),
        ye.viewport(G),
        ye.scissor(F),
        ye.setScissorTest(j),
        B)
      ) {
        const le = _.get(M.texture);
        I.framebufferTexture2D(
          I.FRAMEBUFFER,
          I.COLOR_ATTACHMENT0,
          I.TEXTURE_CUBE_MAP_POSITIVE_X + U,
          le.__webglTexture,
          H,
        );
      } else if (oe) {
        const le = U;
        for (let ve = 0; ve < M.textures.length; ve++) {
          const Se = _.get(M.textures[ve]);
          I.framebufferTextureLayer(I.FRAMEBUFFER, I.COLOR_ATTACHMENT0 + ve, Se.__webglTexture, H, le);
        }
      } else if (M !== null && H !== 0) {
        const le = _.get(M.texture);
        I.framebufferTexture2D(I.FRAMEBUFFER, I.COLOR_ATTACHMENT0, I.TEXTURE_2D, le.__webglTexture, H);
      }
      W = -1;
    }),
      (this.readRenderTargetPixels = (M, U, H, V, B, oe, de, le = 0) => {
        if (!M?.isWebGLRenderTarget) {
          Ae('WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.');
          return;
        }
        let ve = _.get(M).__webglFramebuffer;
        if ((M.isWebGLCubeRenderTarget && de !== void 0 && (ve = ve[de]), ve)) {
          ye.bindFramebuffer(I.FRAMEBUFFER, ve);
          try {
            const Se = M.textures[le],
              Le = Se.format,
              ze = Se.type;
            if ((M.textures.length > 1 && I.readBuffer(I.COLOR_ATTACHMENT0 + le), !nt.textureFormatReadable(Le))) {
              Ae('WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.');
              return;
            }
            if (!nt.textureTypeReadable(ze)) {
              Ae(
                'WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.',
              );
              return;
            }
            U >= 0 &&
              U <= M.width - V &&
              H >= 0 &&
              H <= M.height - B &&
              I.readPixels(U, H, V, B, se.convert(Le), se.convert(ze), oe);
          } finally {
            const Se = O !== null ? _.get(O).__webglFramebuffer : null;
            ye.bindFramebuffer(I.FRAMEBUFFER, Se);
          }
        }
      }),
      (this.readRenderTargetPixelsAsync = async (M, U, H, V, B, oe, de, le = 0) => {
        if (!M?.isWebGLRenderTarget)
          throw new Error('THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.');
        let ve = _.get(M).__webglFramebuffer;
        if ((M.isWebGLCubeRenderTarget && de !== void 0 && (ve = ve[de]), ve))
          if (U >= 0 && U <= M.width - V && H >= 0 && H <= M.height - B) {
            ye.bindFramebuffer(I.FRAMEBUFFER, ve);
            const Se = M.textures[le],
              Le = Se.format,
              ze = Se.type;
            if ((M.textures.length > 1 && I.readBuffer(I.COLOR_ATTACHMENT0 + le), !nt.textureFormatReadable(Le)))
              throw new Error(
                'THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.',
              );
            if (!nt.textureTypeReadable(ze))
              throw new Error(
                'THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.',
              );
            const be = I.createBuffer();
            I.bindBuffer(I.PIXEL_PACK_BUFFER, be),
              I.bufferData(I.PIXEL_PACK_BUFFER, oe.byteLength, I.STREAM_READ),
              I.readPixels(U, H, V, B, se.convert(Le), se.convert(ze), 0);
            const $e = O !== null ? _.get(O).__webglFramebuffer : null;
            ye.bindFramebuffer(I.FRAMEBUFFER, $e);
            const ht = I.fenceSync(I.SYNC_GPU_COMMANDS_COMPLETE, 0);
            return (
              I.flush(),
              await ah(I, ht, 4),
              I.bindBuffer(I.PIXEL_PACK_BUFFER, be),
              I.getBufferSubData(I.PIXEL_PACK_BUFFER, 0, oe),
              I.deleteBuffer(be),
              I.deleteSync(ht),
              oe
            );
          } else
            throw new Error('THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.');
      }),
      (this.copyFramebufferToTexture = (M, U = null, H = 0) => {
        const V = 2 ** -H,
          B = Math.floor(M.image.width * V),
          oe = Math.floor(M.image.height * V),
          de = U !== null ? U.x : 0,
          le = U !== null ? U.y : 0;
        D.setTexture2D(M, 0), I.copyTexSubImage2D(I.TEXTURE_2D, H, 0, 0, de, le, B, oe), ye.unbindTexture();
      });
    const Wh = I.createFramebuffer(),
      Xh = I.createFramebuffer();
    (this.copyTextureToTexture = (M, U, H = null, V = null, B = 0, oe = 0) => {
      let de,
        le,
        ve,
        Se,
        Le,
        ze,
        be,
        $e,
        ht,
        ot = M.isCompressedTexture ? M.mipmaps[oe] : M.image;
      if (H !== null)
        (de = H.max.x - H.min.x),
          (le = H.max.y - H.min.y),
          (ve = H.isBox3 ? H.max.z - H.min.z : 1),
          (Se = H.min.x),
          (Le = H.min.y),
          (ze = H.isBox3 ? H.min.z : 0);
      else {
        const yt = 2 ** -B;
        (de = Math.floor(ot.width * yt)),
          (le = Math.floor(ot.height * yt)),
          M.isDataArrayTexture ? (ve = ot.depth) : M.isData3DTexture ? (ve = Math.floor(ot.depth * yt)) : (ve = 1),
          (Se = 0),
          (Le = 0),
          (ze = 0);
      }
      V !== null ? ((be = V.x), ($e = V.y), (ht = V.z)) : ((be = 0), ($e = 0), (ht = 0));
      let Ke = se.convert(U.format),
        St = se.convert(U.type),
        Me;
      U.isData3DTexture
        ? (D.setTexture3D(U, 0), (Me = I.TEXTURE_3D))
        : U.isDataArrayTexture || U.isCompressedArrayTexture
          ? (D.setTexture2DArray(U, 0), (Me = I.TEXTURE_2D_ARRAY))
          : (D.setTexture2D(U, 0), (Me = I.TEXTURE_2D)),
        I.pixelStorei(I.UNPACK_FLIP_Y_WEBGL, U.flipY),
        I.pixelStorei(I.UNPACK_PREMULTIPLY_ALPHA_WEBGL, U.premultiplyAlpha),
        I.pixelStorei(I.UNPACK_ALIGNMENT, U.unpackAlignment);
      const Pt = I.getParameter(I.UNPACK_ROW_LENGTH),
        We = I.getParameter(I.UNPACK_IMAGE_HEIGHT),
        kt = I.getParameter(I.UNPACK_SKIP_PIXELS),
        Kt = I.getParameter(I.UNPACK_SKIP_ROWS),
        Xn = I.getParameter(I.UNPACK_SKIP_IMAGES);
      I.pixelStorei(I.UNPACK_ROW_LENGTH, ot.width),
        I.pixelStorei(I.UNPACK_IMAGE_HEIGHT, ot.height),
        I.pixelStorei(I.UNPACK_SKIP_PIXELS, Se),
        I.pixelStorei(I.UNPACK_SKIP_ROWS, Le),
        I.pixelStorei(I.UNPACK_SKIP_IMAGES, ze);
      const ci = M.isDataArrayTexture || M.isData3DTexture,
        et = U.isDataArrayTexture || U.isData3DTexture;
      if (M.isDepthTexture) {
        const yt = _.get(M),
          bn = _.get(U),
          _t = _.get(yt.__renderTarget),
          Tn = _.get(bn.__renderTarget);
        ye.bindFramebuffer(I.READ_FRAMEBUFFER, _t.__webglFramebuffer),
          ye.bindFramebuffer(I.DRAW_FRAMEBUFFER, Tn.__webglFramebuffer);
        for (let hi = 0; hi < ve; hi++)
          ci &&
            (I.framebufferTextureLayer(I.READ_FRAMEBUFFER, I.COLOR_ATTACHMENT0, _.get(M).__webglTexture, B, ze + hi),
            I.framebufferTextureLayer(I.DRAW_FRAMEBUFFER, I.COLOR_ATTACHMENT0, _.get(U).__webglTexture, oe, ht + hi)),
            I.blitFramebuffer(Se, Le, de, le, be, $e, de, le, I.DEPTH_BUFFER_BIT, I.NEAREST);
        ye.bindFramebuffer(I.READ_FRAMEBUFFER, null), ye.bindFramebuffer(I.DRAW_FRAMEBUFFER, null);
      } else if (B !== 0 || M.isRenderTargetTexture || _.has(M)) {
        const yt = _.get(M),
          bn = _.get(U);
        ye.bindFramebuffer(I.READ_FRAMEBUFFER, Wh), ye.bindFramebuffer(I.DRAW_FRAMEBUFFER, Xh);
        for (let _t = 0; _t < ve; _t++)
          ci
            ? I.framebufferTextureLayer(I.READ_FRAMEBUFFER, I.COLOR_ATTACHMENT0, yt.__webglTexture, B, ze + _t)
            : I.framebufferTexture2D(I.READ_FRAMEBUFFER, I.COLOR_ATTACHMENT0, I.TEXTURE_2D, yt.__webglTexture, B),
            et
              ? I.framebufferTextureLayer(I.DRAW_FRAMEBUFFER, I.COLOR_ATTACHMENT0, bn.__webglTexture, oe, ht + _t)
              : I.framebufferTexture2D(I.DRAW_FRAMEBUFFER, I.COLOR_ATTACHMENT0, I.TEXTURE_2D, bn.__webglTexture, oe),
            B !== 0
              ? I.blitFramebuffer(Se, Le, de, le, be, $e, de, le, I.COLOR_BUFFER_BIT, I.NEAREST)
              : et
                ? I.copyTexSubImage3D(Me, oe, be, $e, ht + _t, Se, Le, de, le)
                : I.copyTexSubImage2D(Me, oe, be, $e, Se, Le, de, le);
        ye.bindFramebuffer(I.READ_FRAMEBUFFER, null), ye.bindFramebuffer(I.DRAW_FRAMEBUFFER, null);
      } else
        et
          ? M.isDataTexture || M.isData3DTexture
            ? I.texSubImage3D(Me, oe, be, $e, ht, de, le, ve, Ke, St, ot.data)
            : U.isCompressedArrayTexture
              ? I.compressedTexSubImage3D(Me, oe, be, $e, ht, de, le, ve, Ke, ot.data)
              : I.texSubImage3D(Me, oe, be, $e, ht, de, le, ve, Ke, St, ot)
          : M.isDataTexture
            ? I.texSubImage2D(I.TEXTURE_2D, oe, be, $e, de, le, Ke, St, ot.data)
            : M.isCompressedTexture
              ? I.compressedTexSubImage2D(I.TEXTURE_2D, oe, be, $e, ot.width, ot.height, Ke, ot.data)
              : I.texSubImage2D(I.TEXTURE_2D, oe, be, $e, de, le, Ke, St, ot);
      I.pixelStorei(I.UNPACK_ROW_LENGTH, Pt),
        I.pixelStorei(I.UNPACK_IMAGE_HEIGHT, We),
        I.pixelStorei(I.UNPACK_SKIP_PIXELS, kt),
        I.pixelStorei(I.UNPACK_SKIP_ROWS, Kt),
        I.pixelStorei(I.UNPACK_SKIP_IMAGES, Xn),
        oe === 0 && U.generateMipmaps && I.generateMipmap(Me),
        ye.unbindTexture();
    }),
      (this.initRenderTarget = (M) => {
        _.get(M).__webglFramebuffer === void 0 && D.setupRenderTarget(M);
      }),
      (this.initTexture = (M) => {
        M.isCubeTexture
          ? D.setTextureCube(M, 0)
          : M.isData3DTexture
            ? D.setTexture3D(M, 0)
            : M.isDataArrayTexture || M.isCompressedArrayTexture
              ? D.setTexture2DArray(M, 0)
              : D.setTexture2D(M, 0),
          ye.unbindTexture();
      }),
      (this.resetState = () => {
        (C = 0), (N = 0), (O = null), ye.reset(), te.reset();
      }),
      typeof __THREE_DEVTOOLS__ < 'u' && __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent('observe', { detail: this }));
  }
  get coordinateSystem() {
    return Xt;
  }
  get outputColorSpace() {
    return this._outputColorSpace;
  }
  set outputColorSpace(e) {
    this._outputColorSpace = e;
    const t = this.getContext();
    (t.drawingBufferColorSpace = Ge._getDrawingBufferColorSpace(e)), (t.unpackColorSpace = Ge._getUnpackColorSpace());
  }
};

export {
  Bo as E,
  br as w,
  Co as m,
  Ct as d,
  Dh as N,
  Do as y,
  Eo as k,
  Fo as C,
  ft as o,
  Io as v,
  Jo as M,
  Kl as a,
  ko as H,
  L as h,
  Lo as x,
  Mt as f,
  No as B,
  Oo as D,
  Ql as b,
  Qn as i,
  qt as p,
  Re as g,
  Ro as r,
  Rt as n,
  rn as e,
  rs as s,
  Ui as z,
  Uo as A,
  Ve as j,
  Vo as G,
  Wo as J,
  wo as l,
  wt as I,
  Xo as K,
  xr as q,
  Yo as L,
  yn as c,
  yr as u,
  zo as F,
  zt as t,
};
