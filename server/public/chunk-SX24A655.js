import { a as Ct } from './chunk-A4KCXO2Q.js';
import { a as Mt } from './chunk-OQSRUIML.js';
import './chunk-OFKXBWQC.js';
import { l as bt, b as ft, d as ht, k as St, h as vt, r as wt, f as xt, m as yt } from './chunk-AF4UDQOX.js';
import { a as pt } from './chunk-CSQXEU3M.js';
import { b as mt } from './chunk-D6WCRQHB.js';
import { a as Et } from './chunk-FGNIWOFY.js';
import { g as gt } from './chunk-G7DVZDMF.js';
import { e as _t, c as ut } from './chunk-GH246MXO.js';
import './chunk-GEI46CGR.js';
import {
  Bb as _,
  rb as A,
  qb as a,
  lb as at,
  mb as B,
  ob as b,
  b as Ce,
  ac as ct,
  Na as d,
  bc as dt,
  Pb as E,
  zb as f,
  ib as h,
  Qb as I,
  a as j,
  Ob as l,
  Rb as lt,
  vb as M,
  Y as m,
  q as N,
  $b as Ne,
  e as Nn,
  fc as Oe,
  ra as ot,
  Z as p,
  hb as Q,
  nb as R,
  _a as rt,
  ja as S,
  pb as s,
  Lb as st,
  Mb as T,
  d as w,
  jb as x,
  T as Y,
} from './chunk-LF4EWAJA.js';

var Pt = w((_Io, kt) => {
  kt.exports = () => typeof Promise === 'function' && Promise.prototype && Promise.prototype.then;
});
var $ = w((W) => {
  var Ie,
    On = [
      0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, 1156, 1258,
      1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
    ];
  W.getSymbolSize = (t) => {
    if (!t) throw new Error('"version" cannot be null or undefined');
    if (t < 1 || t > 40) throw new Error('"version" should be in range from 1 to 40');
    return t * 4 + 17;
  };
  W.getSymbolTotalCodewords = (t) => On[t];
  W.getBCHDigit = (i) => {
    let t = 0;
    for (; i !== 0; ) t++, (i >>>= 1);
    return t;
  };
  W.setToSJISFunction = (t) => {
    if (typeof t !== 'function') throw new Error('"toSJISFunc" is not a valid function.');
    Ie = t;
  };
  W.isKanjiModeEnabled = () => typeof Ie < 'u';
  W.toSJIS = (t) => Ie(t);
});
var fe = w((D) => {
  D.L = { bit: 1 };
  D.M = { bit: 0 };
  D.Q = { bit: 3 };
  D.H = { bit: 2 };
  function In(i) {
    if (typeof i !== 'string') throw new Error('Param is not a string');
    switch (i.toLowerCase()) {
      case 'l':
      case 'low':
        return D.L;
      case 'm':
      case 'medium':
        return D.M;
      case 'q':
      case 'quartile':
        return D.Q;
      case 'h':
      case 'high':
        return D.H;
      default:
        throw new Error(`Unknown EC Level: ${i}`);
    }
  }
  D.isValid = (t) => t && typeof t.bit < 'u' && t.bit >= 0 && t.bit < 4;
  D.from = (t, e) => {
    if (D.isValid(t)) return t;
    try {
      return In(t);
    } catch {
      return e;
    }
  };
});
var Nt = w((_Bo, Vt) => {
  function Tt() {
    (this.buffer = []), (this.length = 0);
  }
  Tt.prototype = {
    get: function (i) {
      const t = Math.floor(i / 8);
      return ((this.buffer[t] >>> (7 - (i % 8))) & 1) === 1;
    },
    put: function (i, t) {
      for (let e = 0; e < t; e++) this.putBit(((i >>> (t - e - 1)) & 1) === 1);
    },
    getLengthInBits: function () {
      return this.length;
    },
    putBit: function (i) {
      const t = Math.floor(this.length / 8);
      this.buffer.length <= t && this.buffer.push(0), i && (this.buffer[t] |= 128 >>> (this.length % 8)), this.length++;
    },
  };
  Vt.exports = Tt;
});
var It = w((_Ro, Ot) => {
  function le(i) {
    if (!i || i < 1) throw new Error('BitMatrix size must be defined and greater than 0');
    (this.size = i), (this.data = new Uint8Array(i * i)), (this.reservedBit = new Uint8Array(i * i));
  }
  le.prototype.set = function (i, t, e, n) {
    const o = i * this.size + t;
    (this.data[o] = e), n && (this.reservedBit[o] = !0);
  };
  le.prototype.get = function (i, t) {
    return this.data[i * this.size + t];
  };
  le.prototype.xor = function (i, t, e) {
    this.data[i * this.size + t] ^= e;
  };
  le.prototype.isReserved = function (i, t) {
    return this.reservedBit[i * this.size + t];
  };
  Ot.exports = le;
});
var At = w((he) => {
  var An = $().getSymbolSize;
  he.getRowColCoords = (t) => {
    if (t === 1) return [];
    const e = Math.floor(t / 7) + 2,
      n = An(t),
      o = n === 145 ? 26 : Math.ceil((n - 13) / (2 * e - 2)) * 2,
      r = [n - 7];
    for (let c = 1; c < e - 1; c++) r[c] = r[c - 1] - o;
    return r.push(6), r.reverse();
  };
  he.getPositions = (t) => {
    const e = [],
      n = he.getRowColCoords(t),
      o = n.length;
    for (let r = 0; r < o; r++)
      for (let c = 0; c < o; c++)
        (r === 0 && c === 0) || (r === 0 && c === o - 1) || (r === o - 1 && c === 0) || e.push([n[r], n[c]]);
    return e;
  };
});
var Rt = w((Bt) => {
  var Dn = $().getSymbolSize,
    Dt = 7;
  Bt.getPositions = (t) => {
    const e = Dn(t);
    return [
      [0, 0],
      [e - Dt, 0],
      [0, e - Dt],
    ];
  };
});
var Lt = w((k) => {
  k.Patterns = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7,
  };
  var Z = { N1: 3, N2: 3, N3: 40, N4: 10 };
  k.isValid = (t) => t != null && t !== '' && !Number.isNaN(t) && t >= 0 && t <= 7;
  k.from = (t) => (k.isValid(t) ? parseInt(t, 10) : void 0);
  k.getPenaltyN1 = (t) => {
    let e = t.size,
      n = 0,
      o = 0,
      r = 0,
      c = null,
      u = null;
    for (let g = 0; g < e; g++) {
      (o = r = 0), (c = u = null);
      for (let C = 0; C < e; C++) {
        let v = t.get(g, C);
        v === c ? o++ : (o >= 5 && (n += Z.N1 + (o - 5)), (c = v), (o = 1)),
          (v = t.get(C, g)),
          v === u ? r++ : (r >= 5 && (n += Z.N1 + (r - 5)), (u = v), (r = 1));
      }
      o >= 5 && (n += Z.N1 + (o - 5)), r >= 5 && (n += Z.N1 + (r - 5));
    }
    return n;
  };
  k.getPenaltyN2 = (t) => {
    let e = t.size,
      n = 0;
    for (let o = 0; o < e - 1; o++)
      for (let r = 0; r < e - 1; r++) {
        const c = t.get(o, r) + t.get(o, r + 1) + t.get(o + 1, r) + t.get(o + 1, r + 1);
        (c === 4 || c === 0) && n++;
      }
    return n * Z.N2;
  };
  k.getPenaltyN3 = (t) => {
    let e = t.size,
      n = 0,
      o = 0,
      r = 0;
    for (let c = 0; c < e; c++) {
      o = r = 0;
      for (let u = 0; u < e; u++)
        (o = ((o << 1) & 2047) | t.get(c, u)),
          u >= 10 && (o === 1488 || o === 93) && n++,
          (r = ((r << 1) & 2047) | t.get(u, c)),
          u >= 10 && (r === 1488 || r === 93) && n++;
    }
    return n * Z.N3;
  };
  k.getPenaltyN4 = (t) => {
    let e = 0,
      n = t.data.length;
    for (let r = 0; r < n; r++) e += t.data[r];
    return Math.abs(Math.ceil((e * 100) / n / 5) - 10) * Z.N4;
  };
  function Bn(i, t, e) {
    switch (i) {
      case k.Patterns.PATTERN000:
        return (t + e) % 2 === 0;
      case k.Patterns.PATTERN001:
        return t % 2 === 0;
      case k.Patterns.PATTERN010:
        return e % 3 === 0;
      case k.Patterns.PATTERN011:
        return (t + e) % 3 === 0;
      case k.Patterns.PATTERN100:
        return (Math.floor(t / 2) + Math.floor(e / 3)) % 2 === 0;
      case k.Patterns.PATTERN101:
        return ((t * e) % 2) + ((t * e) % 3) === 0;
      case k.Patterns.PATTERN110:
        return (((t * e) % 2) + ((t * e) % 3)) % 2 === 0;
      case k.Patterns.PATTERN111:
        return (((t * e) % 3) + ((t + e) % 2)) % 2 === 0;
      default:
        throw new Error(`bad maskPattern:${i}`);
    }
  }
  k.applyMask = (t, e) => {
    const n = e.size;
    for (let o = 0; o < n; o++) for (let r = 0; r < n; r++) e.isReserved(r, o) || e.xor(r, o, Bn(t, r, o));
  };
  k.getBestMask = (t, e) => {
    let n = Object.keys(k.Patterns).length,
      o = 0,
      r = 1 / 0;
    for (let c = 0; c < n; c++) {
      e(c), k.applyMask(c, t);
      const u = k.getPenaltyN1(t) + k.getPenaltyN2(t) + k.getPenaltyN3(t) + k.getPenaltyN4(t);
      k.applyMask(c, t), u < r && ((r = u), (o = c));
    }
    return o;
  };
});
var De = w((Ae) => {
  var H = fe(),
    xe = [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5,
      8, 8, 4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16, 6, 11, 16, 19, 6, 13,
      18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35,
      12, 23, 34, 37, 12, 25, 34, 40, 13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54,
      18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77,
      25, 49, 68, 81,
    ],
    ve = [
      7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88, 36, 64, 96, 112, 40, 72, 108, 130,
      48, 88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224, 80, 150, 224, 264, 96, 176, 260, 308, 104, 198, 288, 352,
      120, 216, 320, 384, 132, 240, 360, 432, 144, 280, 408, 480, 168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546,
      650, 224, 416, 600, 700, 224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588,
      870, 1050, 336, 644, 952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200,
      1440, 480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570, 1064, 1590,
      1890, 600, 1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950, 2310, 750, 1372, 2040,
      2430,
    ];
  Ae.getBlocksCount = (t, e) => {
    switch (e) {
      case H.L:
        return xe[(t - 1) * 4 + 0];
      case H.M:
        return xe[(t - 1) * 4 + 1];
      case H.Q:
        return xe[(t - 1) * 4 + 2];
      case H.H:
        return xe[(t - 1) * 4 + 3];
      default:
        return;
    }
  };
  Ae.getTotalCodewordsCount = (t, e) => {
    switch (e) {
      case H.L:
        return ve[(t - 1) * 4 + 0];
      case H.M:
        return ve[(t - 1) * 4 + 1];
      case H.Q:
        return ve[(t - 1) * 4 + 2];
      case H.H:
        return ve[(t - 1) * 4 + 3];
      default:
        return;
    }
  };
});
var Ft = w((be) => {
  var ce = new Uint8Array(512),
    Se = new Uint8Array(256);
  (() => {
    let t = 1;
    for (let e = 0; e < 255; e++) (ce[e] = t), (Se[t] = e), (t <<= 1), t & 256 && (t ^= 285);
    for (let e = 255; e < 512; e++) ce[e] = ce[e - 255];
  })();
  be.log = (t) => {
    if (t < 1) throw new Error(`log(${t})`);
    return Se[t];
  };
  be.exp = (t) => ce[t];
  be.mul = (t, e) => (t === 0 || e === 0 ? 0 : ce[Se[t] + Se[e]]);
});
var zt = w((de) => {
  var Be = Ft();
  de.mul = (t, e) => {
    const n = new Uint8Array(t.length + e.length - 1);
    for (let o = 0; o < t.length; o++) for (let r = 0; r < e.length; r++) n[o + r] ^= Be.mul(t[o], e[r]);
    return n;
  };
  de.mod = (t, e) => {
    let n = new Uint8Array(t);
    for (; n.length - e.length >= 0; ) {
      const o = n[0];
      for (let c = 0; c < e.length; c++) n[c] ^= Be.mul(e[c], o);
      let r = 0;
      for (; r < n.length && n[r] === 0; ) r++;
      n = n.slice(r);
    }
    return n;
  };
  de.generateECPolynomial = (t) => {
    let e = new Uint8Array([1]);
    for (let n = 0; n < t; n++) e = de.mul(e, new Uint8Array([1, Be.exp(n)]));
    return e;
  };
});
var Kt = w((_$o, qt) => {
  var Ut = zt();
  function Re(i) {
    (this.genPoly = void 0), (this.degree = i), this.degree && this.initialize(this.degree);
  }
  Re.prototype.initialize = function (t) {
    (this.degree = t), (this.genPoly = Ut.generateECPolynomial(this.degree));
  };
  Re.prototype.encode = function (t) {
    if (!this.genPoly) throw new Error('Encoder not initialized');
    const e = new Uint8Array(t.length + this.degree);
    e.set(t);
    const n = Ut.mod(e, this.genPoly),
      o = this.degree - n.length;
    if (o > 0) {
      const r = new Uint8Array(this.degree);
      return r.set(n, o), r;
    }
    return n;
  };
  qt.exports = Re;
});
var Le = w(($t) => {
  $t.isValid = (t) => !Number.isNaN(t) && t >= 1 && t <= 40;
});
var Fe = w((U) => {
  var Ht = '[0-9]+',
    Rn = '[A-Z $%*+\\-./:]+',
    ue =
      '(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+';
  ue = ue.replace(/u/g, '\\u');
  var Ln =
    '(?:(?![A-Z0-9 $%*+\\-./:]|' +
    ue +
    `)(?:.|[\r
]))+`;
  U.KANJI = new RegExp(ue, 'g');
  U.BYTE_KANJI = /[^A-Z0-9 $%*+\-./:]+/g;
  U.BYTE = new RegExp(Ln, 'g');
  U.NUMERIC = new RegExp(Ht, 'g');
  U.ALPHANUMERIC = new RegExp(Rn, 'g');
  var Fn = new RegExp(`^${ue}$`),
    zn = new RegExp(`^${Ht}$`),
    Un = /^[A-Z0-9 $%*+\-./:]+$/;
  U.testKanji = (t) => Fn.test(t);
  U.testNumeric = (t) => zn.test(t);
  U.testAlphanumeric = (t) => Un.test(t);
});
var J = w((V) => {
  var qn = Le(),
    ze = Fe();
  V.NUMERIC = { id: 'Numeric', bit: 1, ccBits: [10, 12, 14] };
  V.ALPHANUMERIC = { id: 'Alphanumeric', bit: 2, ccBits: [9, 11, 13] };
  V.BYTE = { id: 'Byte', bit: 4, ccBits: [8, 16, 16] };
  V.KANJI = { id: 'Kanji', bit: 8, ccBits: [8, 10, 12] };
  V.MIXED = { bit: -1 };
  V.getCharCountIndicator = (t, e) => {
    if (!t.ccBits) throw new Error(`Invalid mode: ${t}`);
    if (!qn.isValid(e)) throw new Error(`Invalid version: ${e}`);
    return e >= 1 && e < 10 ? t.ccBits[0] : e < 27 ? t.ccBits[1] : t.ccBits[2];
  };
  V.getBestModeForData = (t) =>
    ze.testNumeric(t) ? V.NUMERIC : ze.testAlphanumeric(t) ? V.ALPHANUMERIC : ze.testKanji(t) ? V.KANJI : V.BYTE;
  V.toString = (t) => {
    if (t?.id) return t.id;
    throw new Error('Invalid mode');
  };
  V.isValid = (t) => t?.bit && t.ccBits;
  function Kn(i) {
    if (typeof i !== 'string') throw new Error('Param is not a string');
    switch (i.toLowerCase()) {
      case 'numeric':
        return V.NUMERIC;
      case 'alphanumeric':
        return V.ALPHANUMERIC;
      case 'kanji':
        return V.KANJI;
      case 'byte':
        return V.BYTE;
      default:
        throw new Error(`Unknown mode: ${i}`);
    }
  }
  V.from = (t, e) => {
    if (V.isValid(t)) return t;
    try {
      return Kn(t);
    } catch {
      return e;
    }
  };
});
var Qt = w((X) => {
  var ye = $(),
    $n = De(),
    Jt = fe(),
    G = J(),
    Ue = Le(),
    jt = 7973,
    Gt = ye.getBCHDigit(jt);
  function Hn(i, t, e) {
    for (let n = 1; n <= 40; n++) if (t <= X.getCapacity(n, e, i)) return n;
  }
  function Yt(i, t) {
    return G.getCharCountIndicator(i, t) + 4;
  }
  function Jn(i, t) {
    let e = 0;
    return (
      i.forEach((n) => {
        const o = Yt(n.mode, t);
        e += o + n.getBitsLength();
      }),
      e
    );
  }
  function Gn(i, t) {
    for (let e = 1; e <= 40; e++) if (Jn(i, e) <= X.getCapacity(e, t, G.MIXED)) return e;
  }
  X.from = (t, e) => (Ue.isValid(t) ? parseInt(t, 10) : e);
  X.getCapacity = (t, e, n) => {
    if (!Ue.isValid(t)) throw new Error('Invalid QR Code version');
    typeof n > 'u' && (n = G.BYTE);
    const o = ye.getSymbolTotalCodewords(t),
      r = $n.getTotalCodewordsCount(t, e),
      c = (o - r) * 8;
    if (n === G.MIXED) return c;
    const u = c - Yt(n, t);
    switch (n) {
      case G.NUMERIC:
        return Math.floor((u / 10) * 3);
      case G.ALPHANUMERIC:
        return Math.floor((u / 11) * 2);
      case G.KANJI:
        return Math.floor(u / 13);
      default:
        return Math.floor(u / 8);
    }
  };
  X.getBestVersionForData = (t, e) => {
    let n,
      o = Jt.from(e, Jt.M);
    if (Array.isArray(t)) {
      if (t.length > 1) return Gn(t, o);
      if (t.length === 0) return 1;
      n = t[0];
    } else n = t;
    return Hn(n.mode, n.getLength(), o);
  };
  X.getEncodedBits = (t) => {
    if (!Ue.isValid(t) || t < 7) throw new Error('Invalid QR Code version');
    let e = t << 12;
    for (; ye.getBCHDigit(e) - Gt >= 0; ) e ^= jt << (ye.getBCHDigit(e) - Gt);
    return (t << 12) | e;
  };
});
var en = w((Xt) => {
  var qe = $(),
    Zt = 1335,
    jn = 21522,
    Wt = qe.getBCHDigit(Zt);
  Xt.getEncodedBits = (t, e) => {
    let n = (t.bit << 3) | e,
      o = n << 10;
    for (; qe.getBCHDigit(o) - Wt >= 0; ) o ^= Zt << (qe.getBCHDigit(o) - Wt);
    return ((n << 10) | o) ^ jn;
  };
});
var nn = w((_Qo, tn) => {
  var Yn = J();
  function ie(i) {
    (this.mode = Yn.NUMERIC), (this.data = i.toString());
  }
  ie.getBitsLength = (t) => 10 * Math.floor(t / 3) + (t % 3 ? (t % 3) * 3 + 1 : 0);
  ie.prototype.getLength = function () {
    return this.data.length;
  };
  ie.prototype.getBitsLength = function () {
    return ie.getBitsLength(this.data.length);
  };
  ie.prototype.write = function (t) {
    let e, n, o;
    for (e = 0; e + 3 <= this.data.length; e += 3) (n = this.data.substr(e, 3)), (o = parseInt(n, 10)), t.put(o, 10);
    const r = this.data.length - e;
    r > 0 && ((n = this.data.substr(e)), (o = parseInt(n, 10)), t.put(o, r * 3 + 1));
  };
  tn.exports = ie;
});
var rn = w((_Wo, on) => {
  var Qn = J(),
    Ke = [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
      'Q',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
      ' ',
      '$',
      '%',
      '*',
      '+',
      '-',
      '.',
      '/',
      ':',
    ];
  function oe(i) {
    (this.mode = Qn.ALPHANUMERIC), (this.data = i);
  }
  oe.getBitsLength = (t) => 11 * Math.floor(t / 2) + 6 * (t % 2);
  oe.prototype.getLength = function () {
    return this.data.length;
  };
  oe.prototype.getBitsLength = function () {
    return oe.getBitsLength(this.data.length);
  };
  oe.prototype.write = function (t) {
    let e;
    for (e = 0; e + 2 <= this.data.length; e += 2) {
      let n = Ke.indexOf(this.data[e]) * 45;
      (n += Ke.indexOf(this.data[e + 1])), t.put(n, 11);
    }
    this.data.length % 2 && t.put(Ke.indexOf(this.data[e]), 6);
  };
  on.exports = oe;
});
var sn = w((_Zo, an) => {
  var Wn = J();
  function re(i) {
    (this.mode = Wn.BYTE),
      typeof i === 'string' ? (this.data = new TextEncoder().encode(i)) : (this.data = new Uint8Array(i));
  }
  re.getBitsLength = (t) => t * 8;
  re.prototype.getLength = function () {
    return this.data.length;
  };
  re.prototype.getBitsLength = function () {
    return re.getBitsLength(this.data.length);
  };
  re.prototype.write = function (i) {
    for (let t = 0, e = this.data.length; t < e; t++) i.put(this.data[t], 8);
  };
  an.exports = re;
});
var cn = w((_Xo, ln) => {
  var Zn = J(),
    Xn = $();
  function ae(i) {
    (this.mode = Zn.KANJI), (this.data = i);
  }
  ae.getBitsLength = (t) => t * 13;
  ae.prototype.getLength = function () {
    return this.data.length;
  };
  ae.prototype.getBitsLength = function () {
    return ae.getBitsLength(this.data.length);
  };
  ae.prototype.write = function (i) {
    let t;
    for (t = 0; t < this.data.length; t++) {
      let e = Xn.toSJIS(this.data[t]);
      if (e >= 33088 && e <= 40956) e -= 33088;
      else if (e >= 57408 && e <= 60351) e -= 49472;
      else
        throw new Error(
          'Invalid SJIS character: ' +
            this.data[t] +
            `
Make sure your charset is UTF-8`,
        );
      (e = ((e >>> 8) & 255) * 192 + (e & 255)), i.put(e, 13);
    }
  };
  ln.exports = ae;
});
var dn = w((_er, $e) => {
  var _e = {
    single_source_shortest_paths: (i, t, e) => {
      var n = {},
        o = {};
      o[t] = 0;
      var r = _e.PriorityQueue.make();
      r.push(t, 0);
      for (var c, u, g, C, v, O, P, L, q; !r.empty(); ) {
        (c = r.pop()), (u = c.value), (C = c.cost), (v = i[u] || {});
        for (g in v)
          Object.hasOwn(v, g) &&
            ((O = v[g]),
            (P = C + O),
            (L = o[g]),
            (q = typeof o[g] > 'u'),
            (q || L > P) && ((o[g] = P), r.push(g, P), (n[g] = u)));
      }
      if (typeof e < 'u' && typeof o[e] > 'u') {
        var K = ['Could not find a path from ', t, ' to ', e, '.'].join('');
        throw new Error(K);
      }
      return n;
    },
    extract_shortest_path_from_predecessor_list: (i, t) => {
      for (var e = [], n = t, o; n; ) e.push(n), (o = i[n]), (n = i[n]);
      return e.reverse(), e;
    },
    find_path: (i, t, e) => {
      var n = _e.single_source_shortest_paths(i, t, e);
      return _e.extract_shortest_path_from_predecessor_list(n, e);
    },
    PriorityQueue: {
      make: (i) => {
        var t = _e.PriorityQueue,
          e = {},
          n;
        i = i || {};
        for (n in t) Object.hasOwn(t, n) && (e[n] = t[n]);
        return (e.queue = []), (e.sorter = i.sorter || t.default_sorter), e;
      },
      default_sorter: (i, t) => i.cost - t.cost,
      push: function (i, t) {
        var e = { value: i, cost: t };
        this.queue.push(e), this.queue.sort(this.sorter);
      },
      pop: function () {
        return this.queue.shift();
      },
      empty: function () {
        return this.queue.length === 0;
      },
    },
  };
  typeof $e < 'u' && ($e.exports = _e);
});
var hn = w((se) => {
  var y = J(),
    gn = nn(),
    mn = rn(),
    pn = sn(),
    Cn = cn(),
    ge = Fe(),
    we = $(),
    ei = dn();
  function un(i) {
    return unescape(encodeURIComponent(i)).length;
  }
  function me(i, t, e) {
    let n = [],
      o;
    for (; (o = i.exec(e)) !== null; ) n.push({ data: o[0], index: o.index, mode: t, length: o[0].length });
    return n;
  }
  function fn(i) {
    let t = me(ge.NUMERIC, y.NUMERIC, i),
      e = me(ge.ALPHANUMERIC, y.ALPHANUMERIC, i),
      n,
      o;
    return (
      we.isKanjiModeEnabled()
        ? ((n = me(ge.BYTE, y.BYTE, i)), (o = me(ge.KANJI, y.KANJI, i)))
        : ((n = me(ge.BYTE_KANJI, y.BYTE, i)), (o = [])),
      t
        .concat(e, n, o)
        .sort((c, u) => c.index - u.index)
        .map((c) => ({ data: c.data, mode: c.mode, length: c.length }))
    );
  }
  function He(i, t) {
    switch (t) {
      case y.NUMERIC:
        return gn.getBitsLength(i);
      case y.ALPHANUMERIC:
        return mn.getBitsLength(i);
      case y.KANJI:
        return Cn.getBitsLength(i);
      case y.BYTE:
        return pn.getBitsLength(i);
    }
  }
  function ti(i) {
    return i.reduce((t, e) => {
      const n = t.length - 1 >= 0 ? t[t.length - 1] : null;
      return n && n.mode === e.mode ? ((t[t.length - 1].data += e.data), t) : (t.push(e), t);
    }, []);
  }
  function ni(i) {
    const t = [];
    for (let e = 0; e < i.length; e++) {
      const n = i[e];
      switch (n.mode) {
        case y.NUMERIC:
          t.push([
            n,
            { data: n.data, mode: y.ALPHANUMERIC, length: n.length },
            { data: n.data, mode: y.BYTE, length: n.length },
          ]);
          break;
        case y.ALPHANUMERIC:
          t.push([n, { data: n.data, mode: y.BYTE, length: n.length }]);
          break;
        case y.KANJI:
          t.push([n, { data: n.data, mode: y.BYTE, length: un(n.data) }]);
          break;
        case y.BYTE:
          t.push([{ data: n.data, mode: y.BYTE, length: un(n.data) }]);
      }
    }
    return t;
  }
  function ii(i, t) {
    let e = {},
      n = { start: {} },
      o = ['start'];
    for (let r = 0; r < i.length; r++) {
      const c = i[r],
        u = [];
      for (let g = 0; g < c.length; g++) {
        const C = c[g],
          v = `${r}${g}`;
        u.push(v), (e[v] = { node: C, lastCount: 0 }), (n[v] = {});
        for (let O = 0; O < o.length; O++) {
          const P = o[O];
          e[P] && e[P].node.mode === C.mode
            ? ((n[P][v] = He(e[P].lastCount + C.length, C.mode) - He(e[P].lastCount, C.mode)),
              (e[P].lastCount += C.length))
            : (e[P] && (e[P].lastCount = C.length),
              (n[P][v] = He(C.length, C.mode) + 4 + y.getCharCountIndicator(C.mode, t)));
        }
      }
      o = u;
    }
    for (let r = 0; r < o.length; r++) n[o[r]].end = 0;
    return { map: n, table: e };
  }
  function _n(i, t) {
    let e,
      n = y.getBestModeForData(i);
    if (((e = y.from(t, n)), e !== y.BYTE && e.bit < n.bit))
      throw new Error(
        '"' +
          i +
          '" cannot be encoded with mode ' +
          y.toString(e) +
          `.
 Suggested mode is: ` +
          y.toString(n),
      );
    switch ((e === y.KANJI && !we.isKanjiModeEnabled() && (e = y.BYTE), e)) {
      case y.NUMERIC:
        return new gn(i);
      case y.ALPHANUMERIC:
        return new mn(i);
      case y.KANJI:
        return new Cn(i);
      case y.BYTE:
        return new pn(i);
    }
  }
  se.fromArray = (t) =>
    t.reduce((e, n) => (typeof n === 'string' ? e.push(_n(n, null)) : n.data && e.push(_n(n.data, n.mode)), e), []);
  se.fromString = (t, e) => {
    const n = fn(t, we.isKanjiModeEnabled()),
      o = ni(n),
      r = ii(o, e),
      c = ei.find_path(r.map, 'start', 'end'),
      u = [];
    for (let g = 1; g < c.length - 1; g++) u.push(r.table[c[g]].node);
    return se.fromArray(ti(u));
  };
  se.rawSplit = (t) => se.fromArray(fn(t, we.isKanjiModeEnabled()));
});
var vn = w((xn) => {
  var Ee = $(),
    Je = fe(),
    oi = Nt(),
    ri = It(),
    ai = At(),
    si = Rt(),
    Ye = Lt(),
    Qe = De(),
    li = Kt(),
    Me = Qt(),
    ci = en(),
    di = J(),
    Ge = hn();
  function ui(i, t) {
    const e = i.size,
      n = si.getPositions(t);
    for (let o = 0; o < n.length; o++) {
      const r = n[o][0],
        c = n[o][1];
      for (let u = -1; u <= 7; u++)
        if (!(r + u <= -1 || e <= r + u))
          for (let g = -1; g <= 7; g++)
            c + g <= -1 ||
              e <= c + g ||
              ((u >= 0 && u <= 6 && (g === 0 || g === 6)) ||
              (g >= 0 && g <= 6 && (u === 0 || u === 6)) ||
              (u >= 2 && u <= 4 && g >= 2 && g <= 4)
                ? i.set(r + u, c + g, !0, !0)
                : i.set(r + u, c + g, !1, !0));
    }
  }
  function _i(i) {
    const t = i.size;
    for (let e = 8; e < t - 8; e++) {
      const n = e % 2 === 0;
      i.set(e, 6, n, !0), i.set(6, e, n, !0);
    }
  }
  function gi(i, t) {
    const e = ai.getPositions(t);
    for (let n = 0; n < e.length; n++) {
      const o = e[n][0],
        r = e[n][1];
      for (let c = -2; c <= 2; c++)
        for (let u = -2; u <= 2; u++)
          c === -2 || c === 2 || u === -2 || u === 2 || (c === 0 && u === 0)
            ? i.set(o + c, r + u, !0, !0)
            : i.set(o + c, r + u, !1, !0);
    }
  }
  function mi(i, t) {
    let e = i.size,
      n = Me.getEncodedBits(t),
      o,
      r,
      c;
    for (let u = 0; u < 18; u++)
      (o = Math.floor(u / 3)),
        (r = (u % 3) + e - 8 - 3),
        (c = ((n >> u) & 1) === 1),
        i.set(o, r, c, !0),
        i.set(r, o, c, !0);
  }
  function je(i, t, e) {
    let n = i.size,
      o = ci.getEncodedBits(t, e),
      r,
      c;
    for (r = 0; r < 15; r++)
      (c = ((o >> r) & 1) === 1),
        r < 6 ? i.set(r, 8, c, !0) : r < 8 ? i.set(r + 1, 8, c, !0) : i.set(n - 15 + r, 8, c, !0),
        r < 8 ? i.set(8, n - r - 1, c, !0) : r < 9 ? i.set(8, 15 - r - 1 + 1, c, !0) : i.set(8, 15 - r - 1, c, !0);
    i.set(n - 8, 8, 1, !0);
  }
  function pi(i, t) {
    let e = i.size,
      n = -1,
      o = e - 1,
      r = 7,
      c = 0;
    for (let u = e - 1; u > 0; u -= 2)
      for (u === 6 && u--; ; ) {
        for (let g = 0; g < 2; g++)
          if (!i.isReserved(o, u - g)) {
            let C = !1;
            c < t.length && (C = ((t[c] >>> r) & 1) === 1), i.set(o, u - g, C), r--, r === -1 && (c++, (r = 7));
          }
        if (((o += n), o < 0 || e <= o)) {
          (o -= n), (n = -n);
          break;
        }
      }
  }
  function Ci(i, t, e) {
    const n = new oi();
    e.forEach((g) => {
      n.put(g.mode.bit, 4), n.put(g.getLength(), di.getCharCountIndicator(g.mode, i)), g.write(n);
    });
    const o = Ee.getSymbolTotalCodewords(i),
      r = Qe.getTotalCodewordsCount(i, t),
      c = (o - r) * 8;
    for (n.getLengthInBits() + 4 <= c && n.put(0, 4); n.getLengthInBits() % 8 !== 0; ) n.putBit(0);
    const u = (c - n.getLengthInBits()) / 8;
    for (let g = 0; g < u; g++) n.put(g % 2 ? 17 : 236, 8);
    return fi(n, i, t);
  }
  function fi(i, t, e) {
    let n = Ee.getSymbolTotalCodewords(t),
      o = Qe.getTotalCodewordsCount(t, e),
      r = n - o,
      c = Qe.getBlocksCount(t, e),
      u = n % c,
      g = c - u,
      C = Math.floor(n / c),
      v = Math.floor(r / c),
      O = v + 1,
      P = C - v,
      L = new li(P),
      q = 0,
      K = new Array(c),
      nt = new Array(c),
      Pe = 0,
      Vn = new Uint8Array(i.buffer);
    for (let ne = 0; ne < c; ne++) {
      const Ve = ne < g ? v : O;
      (K[ne] = Vn.slice(q, q + Ve)), (nt[ne] = L.encode(K[ne])), (q += Ve), (Pe = Math.max(Pe, Ve));
    }
    let Te = new Uint8Array(n),
      it = 0,
      F,
      z;
    for (F = 0; F < Pe; F++) for (z = 0; z < c; z++) F < K[z].length && (Te[it++] = K[z][F]);
    for (F = 0; F < P; F++) for (z = 0; z < c; z++) Te[it++] = nt[z][F];
    return Te;
  }
  function hi(i, t, e, n) {
    let o;
    if (Array.isArray(i)) o = Ge.fromArray(i);
    else if (typeof i === 'string') {
      let C = t;
      if (!C) {
        const v = Ge.rawSplit(i);
        C = Me.getBestVersionForData(v, e);
      }
      o = Ge.fromString(i, C || 40);
    } else throw new Error('Invalid data');
    const r = Me.getBestVersionForData(o, e);
    if (!r) throw new Error('The amount of data is too big to be stored in a QR Code');
    if (!t) t = r;
    else if (t < r)
      throw new Error(
        `
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: ` +
          r +
          `.
`,
      );
    const c = Ci(t, e, o),
      u = Ee.getSymbolSize(t),
      g = new ri(u);
    return (
      ui(g, t),
      _i(g),
      gi(g, t),
      je(g, e, 0),
      t >= 7 && mi(g, t),
      pi(g, c),
      Number.isNaN(n) && (n = Ye.getBestMask(g, je.bind(null, g, e))),
      Ye.applyMask(n, g),
      je(g, e, n),
      { modules: g, version: t, errorCorrectionLevel: e, maskPattern: n, segments: o }
    );
  }
  xn.create = (t, e) => {
    if (typeof t > 'u' || t === '') throw new Error('No input text');
    let n = Je.M,
      o,
      r;
    return (
      typeof e < 'u' &&
        ((n = Je.from(e.errorCorrectionLevel, Je.M)),
        (o = Me.from(e.version)),
        (r = Ye.from(e.maskPattern)),
        e.toSJISFunc && Ee.setToSJISFunction(e.toSJISFunc)),
      hi(t, o, n, r)
    );
  };
});
var We = w((ee) => {
  function Sn(i) {
    if ((typeof i === 'number' && (i = i.toString()), typeof i !== 'string'))
      throw new Error('Color should be defined as hex string');
    let t = i.slice().replace('#', '').split('');
    if (t.length < 3 || t.length === 5 || t.length > 8) throw new Error(`Invalid hex color: ${i}`);
    (t.length === 3 || t.length === 4) &&
      (t = Array.prototype.concat.apply(
        [],
        t.map((n) => [n, n]),
      )),
      t.length === 6 && t.push('F', 'F');
    const e = parseInt(t.join(''), 16);
    return { r: (e >> 24) & 255, g: (e >> 16) & 255, b: (e >> 8) & 255, a: e & 255, hex: `#${t.slice(0, 6).join('')}` };
  }
  ee.getOptions = (t) => {
    t || (t = {}), t.color || (t.color = {});
    const e = typeof t.margin > 'u' || t.margin === null || t.margin < 0 ? 4 : t.margin,
      n = t.width && t.width >= 21 ? t.width : void 0,
      o = t.scale || 4;
    return {
      width: n,
      scale: n ? 4 : o,
      margin: e,
      color: { dark: Sn(t.color.dark || '#000000ff'), light: Sn(t.color.light || '#ffffffff') },
      type: t.type,
      rendererOpts: t.rendererOpts || {},
    };
  };
  ee.getScale = (t, e) => (e.width && e.width >= t + e.margin * 2 ? e.width / (t + e.margin * 2) : e.scale);
  ee.getImageWidth = (t, e) => {
    const n = ee.getScale(t, e);
    return Math.floor((t + e.margin * 2) * n);
  };
  ee.qrToImageData = (t, e, n) => {
    const o = e.modules.size,
      r = e.modules.data,
      c = ee.getScale(o, n),
      u = Math.floor((o + n.margin * 2) * c),
      g = n.margin * c,
      C = [n.color.light, n.color.dark];
    for (let v = 0; v < u; v++)
      for (let O = 0; O < u; O++) {
        let P = (v * u + O) * 4,
          L = n.color.light;
        if (v >= g && O >= g && v < u - g && O < u - g) {
          const q = Math.floor((v - g) / c),
            K = Math.floor((O - g) / c);
          L = C[r[q * o + K] ? 1 : 0];
        }
        (t[P++] = L.r), (t[P++] = L.g), (t[P++] = L.b), (t[P] = L.a);
      }
  };
});
var bn = w((ke) => {
  var Ze = We();
  function xi(i, t, e) {
    i.clearRect(0, 0, t.width, t.height),
      t.style || (t.style = {}),
      (t.height = e),
      (t.width = e),
      (t.style.height = `${e}px`),
      (t.style.width = `${e}px`);
  }
  function vi() {
    try {
      return document.createElement('canvas');
    } catch {
      throw new Error('You need to specify a canvas element');
    }
  }
  ke.render = (t, e, n) => {
    let o = n,
      r = e;
    typeof o > 'u' && !e?.getContext && ((o = e), (e = void 0)), e || (r = vi()), (o = Ze.getOptions(o));
    const c = Ze.getImageWidth(t.modules.size, o),
      u = r.getContext('2d'),
      g = u.createImageData(c, c);
    return Ze.qrToImageData(g.data, t, o), xi(u, r, c), u.putImageData(g, 0, 0), r;
  };
  ke.renderToDataURL = (t, e, n) => {
    let o = n;
    typeof o > 'u' && !e?.getContext && ((o = e), (e = void 0)), o || (o = {});
    const r = ke.render(t, e, o),
      c = o.type || 'image/png',
      u = o.rendererOpts || {};
    return r.toDataURL(c, u.quality);
  };
});
var Mn = w((wn) => {
  var Si = We();
  function yn(i, t) {
    const e = i.a / 255,
      n = `${t}="${i.hex}"`;
    return e < 1 ? `${n} ${t}-opacity="${e.toFixed(2).slice(1)}"` : n;
  }
  function Xe(i, t, e) {
    let n = i + t;
    return typeof e < 'u' && (n += ` ${e}`), n;
  }
  function bi(i, t, e) {
    let n = '',
      o = 0,
      r = !1,
      c = 0;
    for (let u = 0; u < i.length; u++) {
      const g = Math.floor(u % t),
        C = Math.floor(u / t);
      !g && !r && (r = !0),
        i[u]
          ? (c++,
            (u > 0 && g > 0 && i[u - 1]) || ((n += r ? Xe('M', g + e, 0.5 + C + e) : Xe('m', o, 0)), (o = 0), (r = !1)),
            (g + 1 < t && i[u + 1]) || ((n += Xe('h', c)), (c = 0)))
          : o++;
    }
    return n;
  }
  wn.render = (t, e, n) => {
    const o = Si.getOptions(e),
      r = t.modules.size,
      c = t.modules.data,
      u = r + o.margin * 2,
      g = o.color.light.a ? `<path ${yn(o.color.light, 'fill')} d="M0 0h${u}v${u}H0z"/>` : '',
      C = `<path ${yn(o.color.dark, 'stroke')} d="${bi(c, r, o.margin)}"/>`,
      v = `viewBox="0 0 ${u} ${u}"`,
      P =
        '<svg xmlns="http://www.w3.org/2000/svg" ' +
        (o.width ? `width="${o.width}" height="${o.width}" ` : '') +
        v +
        ' shape-rendering="crispEdges">' +
        g +
        C +
        `</svg>
`;
    return typeof n === 'function' && n(null, P), P;
  };
});
var kn = w((pe) => {
  var yi = Pt(),
    et = vn(),
    En = bn(),
    wi = Mn();
  function tt(i, t, e, n, o) {
    const r = [].slice.call(arguments, 1),
      c = r.length,
      u = typeof r[c - 1] === 'function';
    if (!u && !yi()) throw new Error('Callback required as last argument');
    if (u) {
      if (c < 2) throw new Error('Too few arguments provided');
      c === 2
        ? ((o = e), (e = t), (t = n = void 0))
        : c === 3 &&
          (t.getContext && typeof o > 'u' ? ((o = n), (n = void 0)) : ((o = n), (n = e), (e = t), (t = void 0)));
    } else {
      if (c < 1) throw new Error('Too few arguments provided');
      return (
        c === 1 ? ((e = t), (t = n = void 0)) : c === 2 && !t.getContext && ((n = e), (e = t), (t = void 0)),
        new Promise((g, C) => {
          try {
            const v = et.create(e, n);
            g(i(v, t, n));
          } catch (v) {
            C(v);
          }
        })
      );
    }
    try {
      const g = et.create(e, n);
      o(null, i(g, t, n));
    } catch (g) {
      o(g);
    }
  }
  pe.create = et.create;
  pe.toCanvas = tt.bind(null, En.render);
  pe.toDataURL = tt.bind(null, En.renderToDataURL);
  pe.toString = tt.bind(null, (i, _t, e) => wi.render(i, e));
});
var Tn = Nn(kn());
var te = (_i, t) => t.id,
  Mi = (_i, t) => t.model,
  Ei = (_i, t) => t.key;
function ki(i, _t) {
  i & 1 && A(0, 'app-skeleton', 1), i & 2 && b('count', 6);
}
function Pi(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 5)(1, 'div', 12)(2, 'span', 13),
      l(3, 'Schema Version'),
      a(),
      s(4, 'span', 14),
      l(5),
      a()(),
      s(6, 'div', 12)(7, 'span', 13),
      l(8, 'Agents'),
      a(),
      s(9, 'span', 14),
      l(10),
      a()(),
      s(11, 'div', 12)(12, 'span', 13),
      l(13, 'Projects'),
      a(),
      s(14, 'span', 14),
      l(15),
      a()(),
      s(16, 'div', 12)(17, 'span', 13),
      l(18, 'Sessions'),
      a(),
      s(19, 'span', 14),
      l(20),
      a()()()),
    i & 2)
  ) {
    let e,
      n,
      o,
      r,
      c = _(2);
    d(5),
      E((e = c.settings()) == null || e.system == null ? null : e.system.schemaVersion),
      d(5),
      E((n = c.settings()) == null || n.system == null ? null : n.system.agentCount),
      d(5),
      E((o = c.settings()) == null || o.system == null ? null : o.system.projectCount),
      d(5),
      E((r = c.settings()) == null || r.system == null ? null : r.system.sessionCount);
  }
}
function Ti(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 5)(1, 'div', 15)(2, 'span', 13),
      l(3, 'Guided Tour'),
      a(),
      s(4, 'button', 16),
      f('click', () => {
        m(e);
        const o = _(2);
        return p(o.replayTour());
      }),
      l(5, 'Replay Tour'),
      a()(),
      s(6, 'div', 15)(7, 'span', 13),
      l(8, 'Keyboard Shortcuts'),
      a(),
      s(9, 'span', 14),
      l(10, 'Press '),
      s(11, 'kbd'),
      l(12, '?'),
      a(),
      l(13, ' to view'),
      a()()();
  }
}
function Vi(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 6)(1, 'div', 17),
      A(2, 'span', 18),
      s(3, 'span', 19),
      l(4, 'AlgoChat'),
      a(),
      s(5, 'span', 20),
      l(6),
      a()(),
      s(7, 'div', 17),
      A(8, 'span', 18),
      s(9, 'span', 19),
      l(10, 'Operations'),
      a(),
      s(11, 'span', 20),
      l(12),
      Ne(13, 'titlecase'),
      a()(),
      s(14, 'div', 17),
      A(15, 'span', 18),
      s(16, 'span', 19),
      l(17, 'Sessions'),
      a(),
      s(18, 'span', 20),
      l(19),
      a()(),
      s(20, 'div', 17),
      A(21, 'span', 18),
      s(22, 'span', 19),
      l(23, 'Mobile Contacts'),
      a(),
      s(24, 'span', 20),
      l(25),
      a()()()),
    i & 2)
  ) {
    let e,
      n,
      o,
      r,
      c = _(2);
    d(2),
      T('health-dot-pulse', (e = c.algochatStatus()) == null ? null : e.enabled),
      Q('data-status', c.algochatStatus() ? 'ok' : 'off'),
      d(4),
      E((n = c.algochatStatus()) != null && n.enabled ? 'Connected' : 'Disconnected'),
      d(2),
      T('health-dot-pulse', c.operationalMode() === 'normal'),
      Q('data-status', c.operationalMode() === 'normal' ? 'ok' : c.operationalMode() === 'paused' ? 'off' : 'warn'),
      d(4),
      E(ct(13, 12, c.operationalMode())),
      d(3),
      Q(
        'data-status',
        (((o = c.settings()) == null || o.system == null ? null : o.system.sessionCount) ?? 0) > 0 ? 'ok' : 'off',
      ),
      d(4),
      I('', (r = c.settings()) == null || r.system == null ? null : r.system.sessionCount, ' total'),
      d(2),
      Q('data-status', c.pskContacts().length > 0 ? 'ok' : 'off'),
      d(4),
      I('', c.pskContacts().length, ' configured');
  }
}
function Ni(i, _t) {
  i & 1 && (s(0, 'span', 10), l(1, 'Unsaved changes'), a());
}
function Oi(i, t) {
  if ((i & 1 && (s(0, 'option', 63), l(1), a()), i & 2)) {
    const e = t.$implicit;
    b('value', e.id), d(), E(e.name);
  }
}
function Ii(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'select', 61),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.setDiscordValue('default_agent_id', o));
      }),
      s(1, 'option', 62),
      l(2, 'First available'),
      a(),
      B(3, Oi, 2, 2, 'option', 63, te),
      a();
  }
  if (i & 2) {
    let e,
      n = _(4);
    b(
      'ngModel',
      n.discordValues().default_agent_id ?? ((e = n.discordConfig()) == null ? null : e.default_agent_id) ?? '',
    ),
      d(3),
      R(n.agentsList());
  }
}
function Ai(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'input', 64),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.setDiscordValue('default_agent_id', o));
      }),
      a();
  }
  if (i & 2) {
    let e,
      n = _(4);
    b(
      'ngModel',
      n.discordValues().default_agent_id ?? ((e = n.discordConfig()) == null ? null : e.default_agent_id) ?? '',
    );
  }
}
function Di(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'span', 49),
      l(1),
      s(2, 'button', 65),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(4);
        return p(r.removeChannel(o.id));
      }),
      l(3, '\xD7'),
      a()();
  }
  if (i & 2) {
    const e = t.$implicit;
    d(), I('#', e.name, ' ');
  }
}
function Bi(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 71),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(6);
        return p(r.addChannel(o.id));
      }),
      l(1),
      s(2, 'span', 72),
      l(3),
      a()();
  }
  if (i & 2) {
    const e = t.$implicit;
    d(), I(' #', e.name, ' '), d(2), E(e.id);
  }
}
function Ri(i, _t) {
  i & 1 && (s(0, 'span', 70), l(1, 'No matching channels'), a());
}
function Li(i, _t) {
  if ((i & 1 && (s(0, 'div', 68), B(1, Bi, 4, 2, 'button', 69, te), h(3, Ri, 2, 0, 'span', 70), a()), i & 2)) {
    const e = _(5);
    d(), R(e.filteredChannels()), d(2), x(e.filteredChannels().length === 0 ? 3 : -1);
  }
}
function Fi(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 66)(1, 'input', 67),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.channelSearch.set(o));
      }),
      a()(),
      h(2, Li, 4, 1, 'div', 68);
  }
  if (i & 2) {
    const e = _(4);
    d(), b('ngModel', e.channelSearch()), d(), x(e.channelSearch() ? 2 : -1);
  }
}
function zi(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'input', 73),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.setDiscordValue('additional_channel_ids', o));
      }),
      a();
  }
  if (i & 2) {
    let e,
      n = _(4);
    b(
      'ngModel',
      n.discordValues().additional_channel_ids ??
        ((e = n.discordConfig()) == null ? null : e.additional_channel_ids) ??
        '',
    );
  }
}
function Ui(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 55)(1, 'span', 74),
      l(2),
      a(),
      s(3, 'select', 75),
      f('ngModelChange', (o) => {
        const r = m(e).$implicit,
          c = _(5);
        return p(c.setRolePermLevel(r.id, o));
      }),
      s(4, 'option', 62),
      l(5, '\u2014 No override \u2014'),
      a(),
      s(6, 'option', 34),
      l(7, 'Blocked'),
      a(),
      s(8, 'option', 35),
      l(9, 'Basic'),
      a(),
      s(10, 'option', 36),
      l(11, 'Standard'),
      a(),
      s(12, 'option', 37),
      l(13, 'Admin'),
      a()()();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = _(5);
    d(), st('color', n.roleColor(e)), d(), E(e.name), d(), b('ngModel', n.getRolePermLevel(e.id));
  }
}
function qi(i, _t) {
  if ((i & 1 && (s(0, 'div', 53), B(1, Ui, 14, 4, 'div', 55, te), a()), i & 2)) {
    const e = _(4);
    d(), R(e.getConfigurableRoles());
  }
}
function Ki(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'textarea', 76),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.setDiscordValue('role_permissions', o));
      }),
      a();
  }
  if (i & 2) {
    let e,
      n = _(4);
    b(
      'ngModel',
      n.discordValues().role_permissions ?? ((e = n.discordConfig()) == null ? null : e.role_permissions) ?? '{}',
    );
  }
}
function $i(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 55)(1, 'span', 77),
      l(2),
      a(),
      s(3, 'select', 75),
      f('ngModelChange', (o) => {
        const r = m(e).$implicit,
          c = _(4);
        return p(c.setChannelPermLevel(r.id, o));
      }),
      s(4, 'option', 34),
      l(5, 'Blocked'),
      a(),
      s(6, 'option', 35),
      l(7, 'Basic'),
      a(),
      s(8, 'option', 36),
      l(9, 'Standard'),
      a(),
      s(10, 'option', 37),
      l(11, 'Admin'),
      a()(),
      s(12, 'button', 65),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(4);
        return p(r.removeChannelPerm(o.id));
      }),
      l(13, '\xD7'),
      a()();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = _(4);
    d(2), I('#', e.name), d(), b('ngModel', n.String(e.level));
  }
}
function Hi(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 71),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(6);
        return p(r.addChannelPerm(o.id));
      }),
      l(1),
      a();
  }
  if (i & 2) {
    const e = t.$implicit;
    d(), I(' #', e.name, ' ');
  }
}
function Ji(i, _t) {
  i & 1 && (s(0, 'span', 70), l(1, 'No matching channels'), a());
}
function Gi(i, _t) {
  if ((i & 1 && (s(0, 'div', 68), B(1, Hi, 2, 1, 'button', 69, te), h(3, Ji, 2, 0, 'span', 70), a()), i & 2)) {
    const e = _(5);
    d(), R(e.filteredChannelPerms()), d(2), x(e.filteredChannelPerms().length === 0 ? 3 : -1);
  }
}
function ji(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 66)(1, 'input', 78),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(4);
        return p(r.channelPermSearch.set(o));
      }),
      a()(),
      h(2, Gi, 4, 1, 'div', 68);
  }
  if (i & 2) {
    const e = _(4);
    d(), b('ngModel', e.channelPermSearch()), d(), x(e.channelPermSearch() ? 2 : -1);
  }
}
function Yi(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 79),
      f('click', () => {
        m(e);
        const o = _(4);
        return p(o.resetDiscordChanges());
      }),
      l(1, 'Discard Changes'),
      a();
  }
}
function Qi(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 21)(1, 'div', 22)(2, 'label', 23),
      l(3, 'Bridge Mode'),
      a(),
      s(4, 'select', 24),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('mode', o));
      }),
      s(5, 'option', 25),
      l(6, 'Chat'),
      a(),
      s(7, 'option', 26),
      l(8, 'Work Intake'),
      a()(),
      s(9, 'span', 27),
      l(10, 'Chat: interactive sessions. Work Intake: creates work tasks.'),
      a()(),
      s(11, 'div', 22)(12, 'label', 28),
      l(13, 'Public Mode'),
      a(),
      s(14, 'select', 29),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('public_mode', o));
      }),
      s(15, 'option', 30),
      l(16, 'Off (allowlist only)'),
      a(),
      s(17, 'option', 31),
      l(18, 'On (role-based access)'),
      a()(),
      s(19, 'span', 27),
      l(20, 'When on, anyone can interact (subject to role permissions).'),
      a()(),
      s(21, 'div', 22)(22, 'label', 32),
      l(23, 'Default Permission Level'),
      a(),
      s(24, 'select', 33),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('default_permission_level', o));
      }),
      s(25, 'option', 34),
      l(26, '0 \u2014 Blocked'),
      a(),
      s(27, 'option', 35),
      l(28, '1 \u2014 Basic (chat, mention)'),
      a(),
      s(29, 'option', 36),
      l(30, '2 \u2014 Standard (slash commands)'),
      a(),
      s(31, 'option', 37),
      l(32, '3 \u2014 Admin (council, work intake)'),
      a()(),
      s(33, 'span', 27),
      l(34, 'Permission level for users with no matching role (public mode only).'),
      a()(),
      s(35, 'div', 22)(36, 'label', 38),
      l(37, 'Activity Type'),
      a(),
      s(38, 'select', 39),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('activity_type', o));
      }),
      s(39, 'option', 34),
      l(40, 'Playing'),
      a(),
      s(41, 'option', 35),
      l(42, 'Streaming'),
      a(),
      s(43, 'option', 36),
      l(44, 'Listening to'),
      a(),
      s(45, 'option', 37),
      l(46, 'Watching'),
      a(),
      s(47, 'option', 40),
      l(48, 'Competing in'),
      a()(),
      s(49, 'span', 27),
      l(50, 'Bot presence activity type.'),
      a()(),
      s(51, 'div', 22)(52, 'label', 41),
      l(53, 'Status Text'),
      a(),
      s(54, 'input', 42),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('status_text', o));
      }),
      a(),
      s(55, 'span', 27),
      l(56, "Text shown in the bot's presence status."),
      a()(),
      s(57, 'div', 22)(58, 'label', 43),
      l(59, 'Default Agent'),
      a(),
      h(60, Ii, 5, 1, 'select', 44)(61, Ai, 1, 1, 'input', 45),
      s(62, 'span', 27),
      l(63, 'Default agent for @mention replies.'),
      a()(),
      s(64, 'div', 46)(65, 'label', 47),
      l(66, 'Monitored Channels'),
      a(),
      s(67, 'div', 48),
      B(68, Di, 4, 1, 'span', 49, te),
      a(),
      h(70, Fi, 3, 2)(71, zi, 1, 1, 'input', 50),
      s(72, 'span', 27),
      l(73, 'Extra channels to monitor (beyond the primary channel).'),
      a()(),
      s(74, 'div', 46)(75, 'label', 51),
      l(76, 'Allowed Users (Legacy)'),
      a(),
      s(77, 'input', 52),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('allowed_user_ids', o));
      }),
      a(),
      s(78, 'span', 27),
      l(79, 'User allowlist for legacy mode (ignored when public mode is on).'),
      a()(),
      s(80, 'div', 46)(81, 'label', 47),
      l(82, 'Role Permissions'),
      a(),
      h(83, qi, 3, 0, 'div', 53)(84, Ki, 1, 1, 'textarea', 54),
      s(85, 'span', 27),
      l(86, 'Maps Discord roles to permission levels (0-3).'),
      a()(),
      s(87, 'div', 46)(88, 'label', 47),
      l(89, 'Channel Permissions'),
      a(),
      s(90, 'div', 53),
      B(91, $i, 14, 2, 'div', 55, te),
      a(),
      h(93, ji, 3, 2),
      s(94, 'span', 27),
      l(
        95,
        'Per-channel permission floor. Everyone in the channel gets at least this level (useful for invite-only channels with no roles).',
      ),
      a()(),
      s(96, 'div', 46)(97, 'label', 56),
      l(98, 'Rate Limits by Level (JSON)'),
      a(),
      s(99, 'textarea', 57),
      f('ngModelChange', (o) => {
        m(e);
        const r = _(3);
        return p(r.setDiscordValue('rate_limit_by_level', o));
      }),
      a(),
      s(100, 'span', 27),
      l(101, 'Max messages per window by permission level. JSON object.'),
      a()()(),
      s(102, 'div', 58)(103, 'button', 59),
      f('click', () => {
        m(e);
        const o = _(3);
        return p(o.saveDiscordConfig());
      }),
      l(104),
      a(),
      h(105, Yi, 2, 0, 'button', 60),
      a();
  }
  if (i & 2) {
    let e,
      n,
      o,
      r,
      c,
      u,
      g,
      C = _(3);
    d(4),
      b('ngModel', C.discordValues().mode ?? ((e = C.discordConfig()) == null ? null : e.mode) ?? 'chat'),
      d(10),
      b(
        'ngModel',
        C.discordValues().public_mode ?? ((n = C.discordConfig()) == null ? null : n.public_mode) ?? 'false',
      ),
      d(10),
      b(
        'ngModel',
        C.discordValues().default_permission_level ??
          ((o = C.discordConfig()) == null ? null : o.default_permission_level) ??
          '1',
      ),
      d(14),
      b(
        'ngModel',
        C.discordValues().activity_type ?? ((r = C.discordConfig()) == null ? null : r.activity_type) ?? '3',
      ),
      d(16),
      b('ngModel', C.discordValues().status_text ?? ((c = C.discordConfig()) == null ? null : c.status_text) ?? ''),
      d(6),
      x(C.agentsList().length > 0 ? 60 : 61),
      d(8),
      R(C.getSelectedChannels()),
      d(2),
      x(C.guildChannels().length > 0 ? 70 : 71),
      d(7),
      b(
        'ngModel',
        C.discordValues().allowed_user_ids ?? ((u = C.discordConfig()) == null ? null : u.allowed_user_ids) ?? '',
      ),
      d(6),
      x(C.guildRoles().length > 0 ? 83 : 84),
      d(8),
      R(C.getChannelPermEntries()),
      d(2),
      x(C.guildChannels().length > 0 ? 93 : -1),
      d(6),
      b(
        'ngModel',
        C.discordValues().rate_limit_by_level ??
          ((g = C.discordConfig()) == null ? null : g.rate_limit_by_level) ??
          '{}',
      ),
      d(4),
      b('disabled', C.savingDiscord() || !C.discordDirty()),
      d(),
      E(C.savingDiscord() ? 'Saving...' : 'Save Discord Config'),
      d(),
      x(C.discordDirty() ? 105 : -1);
  }
}
function Wi(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 2)(1, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _(2);
        return p(o.toggleSection('discord'));
      }),
      s(2, 'span', 4),
      l(3, '\u25B6'),
      a(),
      l(4, ' Discord '),
      h(5, Ni, 2, 0, 'span', 10),
      a(),
      h(6, Qi, 106, 14),
      a();
  }
  if (i & 2) {
    const e = _(2);
    d(2),
      T('section-chevron--open', !e.collapsedSections().has('discord')),
      d(3),
      x(e.discordDirty() ? 5 : -1),
      d(),
      x(e.collapsedSections().has('discord') ? -1 : 6);
  }
}
function Zi(i, _t) {
  if ((i & 1 && (s(0, 'div', 12)(1, 'span', 13), l(2, 'Address'), a(), s(3, 'code', 82), l(4), a()()), i & 2)) {
    const e = _();
    d(4), E(e.address);
  }
}
function Xi(i, t) {
  if (
    (i & 1 &&
      (s(0, 'div', 5)(1, 'div', 12)(2, 'span', 13),
      l(3, 'Status'),
      a(),
      s(4, 'span', 14),
      l(5),
      a()(),
      h(6, Zi, 5, 1, 'div', 12),
      s(7, 'div', 12)(8, 'span', 13),
      l(9, 'Network'),
      a(),
      s(10, 'span', 81),
      l(11),
      a()(),
      s(12, 'div', 12)(13, 'span', 13),
      l(14, 'Server Balance'),
      a(),
      s(15, 'span', 14),
      l(16),
      Ne(17, 'number'),
      a()(),
      s(18, 'div', 12)(19, 'span', 13),
      l(20, 'Active Chats'),
      a(),
      s(21, 'span', 14),
      l(22),
      a()()()),
    i & 2)
  ) {
    const e = t;
    d(4),
      T('info-value--active', e.enabled)('info-value--inactive', !e.enabled),
      d(),
      I(' ', e.enabled ? 'Connected' : 'Disconnected', ' '),
      d(),
      x(e.address && e.address !== 'local' ? 6 : -1),
      d(4),
      Q('data-network', e.network),
      d(),
      E(e.network),
      d(4),
      T('algo-balance--low', e.balance < 1e6),
      d(),
      I(' ', dt(17, 12, e.balance / 1e6, '1.2-4'), ' ALGO '),
      d(6),
      E(e.activeConversations);
  }
}
function eo(i, _t) {
  i & 1 && (s(0, 'p', 80), l(1, 'AlgoChat not configured'), a());
}
function to(i, _t) {
  if ((i & 1 && h(0, Xi, 23, 15, 'div', 5)(1, eo, 2, 0, 'p', 80), i & 2)) {
    let e,
      n = _(2);
    x((e = n.algochatStatus()) ? 0 : 1, e);
  }
}
function no(i, _t) {
  if ((i & 1 && (s(0, 'span', 7), l(1), a()), i & 2)) {
    const e = _(2);
    d(), E(e.pskContacts().length);
  }
}
function io(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'input', 94),
      f('input', (o) => {
        m(e);
        const r = _(5);
        return p(r.editingNickname.set(r.asInputValue(o)));
      })('keydown.enter', () => {
        m(e);
        const o = _().$implicit,
          r = _(4);
        return p(r.saveNickname(o.id));
      })('keydown.escape', () => {
        m(e);
        const o = _(5);
        return p(o.cancelEditNickname());
      }),
      a(),
      s(1, 'button', 95),
      f('click', () => {
        m(e);
        const o = _().$implicit,
          r = _(4);
        return p(r.saveNickname(o.id));
      }),
      l(2, '\u2713'),
      a(),
      s(3, 'button', 96),
      f('click', () => {
        m(e);
        const o = _(5);
        return p(o.cancelEditNickname());
      }),
      l(4, '\u2715'),
      a();
  }
  if (i & 2) {
    const e = _(5);
    b('value', e.editingNickname());
  }
}
function oo(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'span', 97),
      f('dblclick', () => {
        m(e);
        const o = _().$implicit,
          r = _(4);
        return p(r.startEditNickname(o));
      }),
      l(1),
      a(),
      s(2, 'button', 98),
      f('click', () => {
        m(e);
        const o = _().$implicit,
          r = _(4);
        return p(r.startEditNickname(o));
      }),
      l(3, '\u270E'),
      a();
  }
  if (i & 2) {
    const e = _().$implicit;
    d(), E(e.nickname);
  }
}
function ro(i, _t) {
  if ((i & 1 && (s(0, 'code', 91), l(1), a()), i & 2)) {
    const e = _().$implicit;
    d(), E(e.mobileAddress);
  }
}
function ao(i, _t) {
  i & 1 && (s(0, 'div', 93), A(1, 'canvas', 99), a());
}
function so(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 88)(1, 'div', 89),
      h(2, io, 5, 1)(3, oo, 4, 1),
      s(4, 'span', 90),
      l(5),
      a()(),
      h(6, ro, 2, 1, 'code', 91),
      s(7, 'div', 92)(8, 'button', 16),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(4);
        return p(r.toggleQR(o));
      }),
      l(9),
      a(),
      s(10, 'button', 16),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(4);
        return p(r.copyContactUri(o));
      }),
      l(11, 'Copy URI'),
      a(),
      s(12, 'button', 79),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(4);
        return p(r.cancelContact(o));
      }),
      l(13, 'Delete'),
      a()(),
      h(14, ao, 2, 0, 'div', 93),
      a();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = _(4);
    d(2),
      x(n.editingContactId() === e.id ? 2 : 3),
      d(2),
      T('contact-status--active', e.mobileAddress)('contact-status--waiting', !e.mobileAddress),
      d(),
      I(' ', e.mobileAddress ? 'Connected' : 'Waiting', ' '),
      d(),
      x(e.mobileAddress ? 6 : -1),
      d(3),
      I(' ', n.expandedContactId() === e.id ? 'Hide QR' : 'Show QR', ' '),
      d(5),
      x(n.expandedContactId() === e.id && e.uri ? 14 : -1);
  }
}
function lo(i, _t) {
  if ((i & 1 && (s(0, 'div', 84), B(1, so, 15, 9, 'div', 88, te), a()), i & 2)) {
    const e = _(3);
    d(), R(e.pskContacts());
  }
}
function co(i, _t) {
  i & 1 && (s(0, 'p', 80), l(1, 'No contacts yet. Add one to get started.'), a());
}
function uo(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 86)(1, 'input', 100),
      f('input', (o) => {
        m(e);
        const r = _(3);
        return p(r.newContactNickname.set(r.asInputValue(o)));
      })('keydown.enter', () => {
        m(e);
        const o = _(3);
        return p(o.createContact());
      })('keydown.escape', () => {
        m(e);
        const o = _(3);
        return p(o.addingContact.set(!1));
      }),
      a(),
      s(2, 'button', 101),
      f('click', () => {
        m(e);
        const o = _(3);
        return p(o.createContact());
      }),
      l(3),
      a(),
      s(4, 'button', 102),
      f('click', () => {
        m(e);
        const o = _(3);
        return p(o.addingContact.set(!1));
      }),
      l(5, '\u2715'),
      a()();
  }
  if (i & 2) {
    const e = _(3);
    d(),
      b('value', e.newContactNickname()),
      d(),
      b('disabled', e.creatingContact()),
      d(),
      I(' ', e.creatingContact() ? 'Creating...' : 'Create', ' ');
  }
}
function _o(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 103),
      f('click', () => {
        m(e);
        const o = _(3);
        return p(o.addingContact.set(!0));
      }),
      l(1, '+ Add Contact'),
      a();
  }
}
function go(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'p', 83),
      l(1, ' Share your agent with friends. Each contact gets their own encrypted PSK channel. '),
      a(),
      h(2, lo, 3, 0, 'div', 84)(3, co, 2, 0, 'p', 80),
      s(4, 'div', 85),
      h(5, uo, 6, 3, 'div', 86)(6, _o, 2, 0, 'button', 87),
      a()),
    i & 2)
  ) {
    const e = _(2);
    d(2), x(e.pskContacts().length > 0 ? 2 : 3), d(3), x(e.addingContact() ? 5 : 6);
  }
}
function mo(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 107),
      f('click', () => {
        const o = m(e).$implicit,
          r = _(3);
        return p(r.setMode(o));
      }),
      l(1),
      a();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = _(3);
    T('mode-btn--active', n.operationalMode() === e), d(), E(e);
  }
}
function po(i, _t) {
  i & 1 && l(0, ' Agents execute tools immediately without approval. ');
}
function Co(i, _t) {
  i & 1 && l(0, ' Tool calls are queued for manual approval before execution. ');
}
function fo(i, _t) {
  i & 1 && l(0, ' All sessions are paused. No tool execution. ');
}
function ho(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 104),
      B(1, mo, 2, 3, 'button', 105, at),
      a(),
      s(3, 'p', 106),
      h(4, po, 1, 0)(5, Co, 1, 0)(6, fo, 1, 0),
      a()),
    i & 2)
  ) {
    let e,
      n = _(2);
    d(), R(n.modes), d(3), x((e = n.operationalMode()) === 'normal' ? 4 : e === 'queued' ? 5 : e === 'paused' ? 6 : -1);
  }
}
function xo(i, _t) {
  i & 1 && (s(0, 'span', 9), l(1, 'Connected'), a());
}
function vo(i, _t) {
  if (
    (i & 1 && (s(0, 'div', 12)(1, 'span', 13), l(2, 'Configured Models'), a(), s(3, 'span', 14), l(4), a()()), i & 2)
  ) {
    let e,
      n = _(3);
    d(4), E((e = n.openrouterStatus()) == null ? null : e.configuredModels);
  }
}
function So(i, t) {
  if ((i & 1 && (s(0, 'div', 111)(1, 'span', 112), l(2), a(), s(3, 'span', 113), l(4), a()()), i & 2)) {
    const e = t.$implicit;
    d(2), E(e.displayName), d(2), lt(' $', e.inputPricePerMillion, '/$', e.outputPricePerMillion, ' per M tokens ');
  }
}
function bo(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 109)(1, 'h4'),
      l(2, 'Available Models'),
      a(),
      s(3, 'div', 110),
      B(4, So, 5, 3, 'div', 111, Mi),
      a()()),
    i & 2)
  ) {
    const e = _(3);
    d(4), R(e.openrouterModels());
  }
}
function yo(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 5)(1, 'div', 12)(2, 'span', 13),
      l(3, 'Status'),
      a(),
      s(4, 'span', 14),
      l(5),
      a()(),
      h(6, vo, 5, 1, 'div', 12),
      a(),
      s(7, 'p', 108),
      l(8, ' Set '),
      s(9, 'code'),
      l(10, 'OPENROUTER_API_KEY'),
      a(),
      l(11, ' in your environment to enable. Models are routed via '),
      s(12, 'code'),
      l(13, 'https://openrouter.ai'),
      a(),
      l(14, '. '),
      a(),
      h(15, bo, 6, 0, 'div', 109)),
    i & 2)
  ) {
    let e,
      n,
      o = _(2);
    d(5),
      E(((e = o.openrouterStatus()) == null ? null : e.status) ?? 'Not configured'),
      d(),
      x((n = o.openrouterStatus()) != null && n.configuredModels ? 6 : -1),
      d(9),
      x(o.openrouterModels().length > 0 ? 15 : -1);
  }
}
function wo(i, _t) {
  i & 1 && (s(0, 'span', 10), l(1, 'Unsaved changes'), a());
}
function Mo(i, t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 115)(1, 'label', 117),
      l(2),
      a(),
      s(3, 'input', 118),
      f('ngModelChange', (o) => {
        const r = m(e).$implicit,
          c = _(3);
        return p(c.setCreditValue(r.key, o));
      }),
      a(),
      s(4, 'span', 119),
      l(5),
      a()();
  }
  if (i & 2) {
    const e = t.$implicit,
      n = _(3);
    d(),
      b('for', `credit_${e.key}`),
      d(),
      E(e.label),
      d(),
      T('credit-input--dirty', n.isCreditDirty(e.key)),
      b('id', `credit_${e.key}`)('ngModel', n.getCreditValue(e.key)),
      d(2),
      E(e.description);
  }
}
function Eo(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 79),
      f('click', () => {
        m(e);
        const o = _(3);
        return p(o.resetCreditChanges());
      }),
      l(1, 'Discard Changes'),
      a();
  }
}
function ko(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 114),
      B(1, Mo, 6, 7, 'div', 115, Ei),
      a(),
      s(3, 'div', 116)(4, 'button', 59),
      f('click', () => {
        m(e);
        const o = _(2);
        return p(o.saveCreditConfig());
      }),
      l(5),
      a(),
      h(6, Eo, 2, 0, 'button', 60),
      a();
  }
  if (i & 2) {
    const e = _(2);
    d(),
      R(e.creditFields),
      d(3),
      b('disabled', e.saving() || !e.isDirty()),
      d(),
      E(e.saving() ? 'Saving...' : 'Save Credit Config'),
      d(),
      x(e.isDirty() ? 6 : -1);
  }
}
function Po(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 11)(1, 'div', 120)(2, 'div', 121)(3, 'span', 122),
      l(4, 'Session Completed'),
      a(),
      s(5, 'span', 123),
      l(6, 'Notify when a session finishes successfully'),
      a()(),
      s(7, 'label', 124)(8, 'input', 125),
      f('change', (o) => {
        m(e);
        const r = _(2);
        return r.notifSessionComplete.set(o.target.checked), p(r.saveNotifPrefs());
      }),
      a(),
      s(9, 'span', 126),
      A(10, 'span', 127),
      a()()(),
      s(11, 'div', 120)(12, 'div', 121)(13, 'span', 122),
      l(14, 'Session Errors'),
      a(),
      s(15, 'span', 123),
      l(16, 'Notify when a session encounters an error'),
      a()(),
      s(17, 'label', 124)(18, 'input', 125),
      f('change', (o) => {
        m(e);
        const r = _(2);
        return r.notifSessionError.set(o.target.checked), p(r.saveNotifPrefs());
      }),
      a(),
      s(19, 'span', 126),
      A(20, 'span', 127),
      a()()(),
      s(21, 'div', 120)(22, 'div', 121)(23, 'span', 122),
      l(24, 'Approval Requests'),
      a(),
      s(25, 'span', 123),
      l(26, 'Notify when an agent needs tool approval'),
      a()(),
      s(27, 'label', 124)(28, 'input', 125),
      f('change', (o) => {
        m(e);
        const r = _(2);
        return r.notifApproval.set(o.target.checked), p(r.saveNotifPrefs());
      }),
      a(),
      s(29, 'span', 126),
      A(30, 'span', 127),
      a()()(),
      s(31, 'div', 120)(32, 'div', 121)(33, 'span', 122),
      l(34, 'Work Task Updates'),
      a(),
      s(35, 'span', 123),
      l(36, 'Notify on PR creation, merge, or failure'),
      a()(),
      s(37, 'label', 124)(38, 'input', 125),
      f('change', (o) => {
        m(e);
        const r = _(2);
        return r.notifWorkTask.set(o.target.checked), p(r.saveNotifPrefs());
      }),
      a(),
      s(39, 'span', 126),
      A(40, 'span', 127),
      a()()(),
      s(41, 'div', 120)(42, 'div', 121)(43, 'span', 122),
      l(44, 'Agent Messages'),
      a(),
      s(45, 'span', 123),
      l(46, 'Notify when an agent sends you a message'),
      a()(),
      s(47, 'label', 124)(48, 'input', 125),
      f('change', (o) => {
        m(e);
        const r = _(2);
        return r.notifAgentMessage.set(o.target.checked), p(r.saveNotifPrefs());
      }),
      a(),
      s(49, 'span', 126),
      A(50, 'span', 127),
      a()()()();
  }
  if (i & 2) {
    const e = _(2);
    d(8),
      b('checked', e.notifSessionComplete()),
      d(10),
      b('checked', e.notifSessionError()),
      d(10),
      b('checked', e.notifApproval()),
      d(10),
      b('checked', e.notifWorkTask()),
      d(10),
      b('checked', e.notifAgentMessage());
  }
}
function To(i, _t) {
  if (
    (i & 1 &&
      (s(0, 'div', 128)(1, 'div', 129)(2, 'span', 130),
      l(3, 'ANTHROPIC_API_KEY'),
      a(),
      s(4, 'span', 131),
      l(5, 'Configured'),
      a()(),
      s(6, 'div', 129)(7, 'span', 130),
      l(8, 'OPENROUTER_API_KEY'),
      a(),
      s(9, 'span', 132),
      l(10),
      a()(),
      s(11, 'div', 129)(12, 'span', 130),
      l(13, 'DISCORD_TOKEN'),
      a(),
      s(14, 'span', 132),
      l(15),
      a()(),
      s(16, 'div', 129)(17, 'span', 130),
      l(18, 'GITHUB_TOKEN'),
      a(),
      s(19, 'span', 131),
      l(20, 'Configured'),
      a()()(),
      s(21, 'p', 133),
      l(22, 'Environment variables are set in your '),
      s(23, 'code'),
      l(24, '.env'),
      a(),
      l(25, ' file or system environment. Restart the server after changes.'),
      a()),
    i & 2)
  ) {
    let e,
      n,
      o,
      r = _(2);
    d(9),
      T('env-value--set', ((e = r.openrouterStatus()) == null ? null : e.status) === 'available')(
        'env-value--unset',
        ((n = r.openrouterStatus()) == null ? null : n.status) !== 'available',
      ),
      d(),
      I(' ', ((o = r.openrouterStatus()) == null ? null : o.status) === 'available' ? 'Configured' : 'Not set', ' '),
      d(4),
      T('env-value--set', !!r.discordConfig())('env-value--unset', !r.discordConfig()),
      d(),
      I(' ', r.discordConfig() ? 'Configured' : 'Not set', ' ');
  }
}
function Vo(i, _t) {
  if ((i & 1 && (s(0, 'p', 135), l(1), a()), i & 2)) {
    const e = _(3);
    d(), E(e.backupResult());
  }
}
function No(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'button', 134),
      f('click', () => {
        m(e);
        const o = _(2);
        return p(o.runBackup());
      }),
      l(1),
      a(),
      h(2, Vo, 2, 1, 'p', 135);
  }
  if (i & 2) {
    const e = _(2);
    b('disabled', e.backingUp()),
      d(),
      E(e.backingUp() ? 'Backing up...' : 'Create Backup'),
      d(),
      x(e.backupResult() ? 2 : -1);
  }
}
function Oo(i, _t) {
  if (i & 1) {
    const e = M();
    s(0, 'div', 2)(1, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('system'));
      }),
      s(2, 'span', 4),
      l(3, '\u25B6'),
      a(),
      l(4, ' System Info '),
      a(),
      h(5, Pi, 21, 4, 'div', 5),
      a(),
      s(6, 'div', 2)(7, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('help'));
      }),
      s(8, 'span', 4),
      l(9, '\u25B6'),
      a(),
      l(10, ' Help '),
      a(),
      h(11, Ti, 14, 0, 'div', 5),
      a(),
      s(12, 'div', 2)(13, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('health'));
      }),
      s(14, 'span', 4),
      l(15, '\u25B6'),
      a(),
      l(16, ' System Health '),
      a(),
      h(17, Vi, 26, 14, 'div', 6),
      a(),
      h(18, Wi, 7, 4, 'div', 2),
      s(19, 'div', 2)(20, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('algochat'));
      }),
      s(21, 'span', 4),
      l(22, '\u25B6'),
      a(),
      l(23, ' AlgoChat '),
      a(),
      h(24, to, 2, 1),
      a(),
      s(25, 'div', 2)(26, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('mobile'));
      }),
      s(27, 'span', 4),
      l(28, '\u25B6'),
      a(),
      l(29, ' Connect Mobile '),
      h(30, no, 2, 1, 'span', 7),
      a(),
      h(31, go, 7, 2),
      a(),
      s(32, 'div', 2)(33, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('mode'));
      }),
      s(34, 'span', 4),
      l(35, '\u25B6'),
      a(),
      l(36, ' Operational Mode '),
      s(37, 'span', 8),
      l(38),
      a()(),
      h(39, ho, 7, 1),
      a(),
      s(40, 'div', 2)(41, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('openrouter'));
      }),
      s(42, 'span', 4),
      l(43, '\u25B6'),
      a(),
      l(44, ' OpenRouter '),
      h(45, xo, 2, 0, 'span', 9),
      a(),
      h(46, yo, 16, 3),
      a(),
      s(47, 'div', 2)(48, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('credits'));
      }),
      s(49, 'span', 4),
      l(50, '\u25B6'),
      a(),
      l(51, ' Credit Configuration '),
      h(52, wo, 2, 0, 'span', 10),
      a(),
      h(53, ko, 7, 3),
      a(),
      s(54, 'div', 2)(55, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('notifications'));
      }),
      s(56, 'span', 4),
      l(57, '\u25B6'),
      a(),
      l(58, ' Notifications '),
      a(),
      h(59, Po, 51, 5, 'div', 11),
      a(),
      s(60, 'div', 2)(61, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('environment'));
      }),
      s(62, 'span', 4),
      l(63, '\u25B6'),
      a(),
      l(64, ' Environment '),
      a(),
      h(65, To, 26, 10),
      a(),
      s(66, 'div', 2)(67, 'h3', 3),
      f('click', () => {
        m(e);
        const o = _();
        return p(o.toggleSection('database'));
      }),
      s(68, 'span', 4),
      l(69, '\u25B6'),
      a(),
      l(70, ' Database '),
      a(),
      h(71, No, 3, 3),
      a();
  }
  if (i & 2) {
    let e,
      n = _();
    d(2),
      T('section-chevron--open', !n.collapsedSections().has('system')),
      d(3),
      x(n.collapsedSections().has('system') ? -1 : 5),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('help')),
      d(3),
      x(n.collapsedSections().has('help') ? -1 : 11),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('health')),
      d(3),
      x(n.collapsedSections().has('health') ? -1 : 17),
      d(),
      x(n.discordConfig() ? 18 : -1),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('algochat')),
      d(3),
      x(n.collapsedSections().has('algochat') ? -1 : 24),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('mobile')),
      d(3),
      x(n.pskContacts().length > 0 ? 30 : -1),
      d(),
      x(n.collapsedSections().has('mobile') ? -1 : 31),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('mode')),
      d(3),
      Q('data-mode', n.operationalMode()),
      d(),
      E(n.operationalMode()),
      d(),
      x(n.collapsedSections().has('mode') ? -1 : 39),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('openrouter')),
      d(3),
      x(((e = n.openrouterStatus()) == null ? null : e.status) === 'available' ? 45 : -1),
      d(),
      x(n.collapsedSections().has('openrouter') ? -1 : 46),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('credits')),
      d(3),
      x(n.isDirty() ? 52 : -1),
      d(),
      x(n.collapsedSections().has('credits') ? -1 : 53),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('notifications')),
      d(3),
      x(n.collapsedSections().has('notifications') ? -1 : 59),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('environment')),
      d(3),
      x(n.collapsedSections().has('environment') ? -1 : 65),
      d(3),
      T('section-chevron--open', !n.collapsedSections().has('database')),
      d(3),
      x(n.collapsedSections().has('database') ? -1 : 71);
  }
}
var Pn = class i {
  api = Y(mt);
  notifications = Y(pt);
  sessionService = Y(Ct);
  tourService = Y(Mt);
  settingsRouter = Y(gt);
  elRef = Y(ot);
  loading = S(!0);
  saving = S(!1);
  backingUp = S(!1);
  settings = S(null);
  operationalMode = S('normal');
  backupResult = S(null);
  algochatStatus = this.sessionService.algochatStatus;
  discordConfig = S(null);
  discordValues = S({});
  savingDiscord = S(!1);
  discordDirty = Oe(() => Object.keys(this.discordValues()).length > 0);
  guildChannels = S([]);
  guildRoles = S([]);
  agentsList = S([]);
  channelSearch = S('');
  channelPermSearch = S('');
  pskContacts = S([]);
  expandedContactId = S(null);
  addingContact = S(!1);
  newContactNickname = S('');
  creatingContact = S(!1);
  editingContactId = S(null);
  editingNickname = S('');
  openrouterStatus = S(null);
  openrouterModels = S([]);
  notifSessionComplete = S(!0);
  notifSessionError = S(!0);
  notifApproval = S(!0);
  notifWorkTask = S(!0);
  notifAgentMessage = S(!1);
  collapsedSections = S(new Set());
  creditValues = {};
  dirtyKeys = S(new Set());
  isDirty = Oe(() => this.dirtyKeys().size > 0);
  modes = ['normal', 'queued', 'paused'];
  creditFields = [
    { key: 'credits_per_algo', label: 'Credits per ALGO', description: 'How many credits 1 ALGO buys' },
    { key: 'credits_per_turn', label: 'Credits per Turn', description: 'Credits consumed per agent turn' },
    {
      key: 'credits_per_agent_message',
      label: 'Credits per Agent Message',
      description: 'Credits for agent-to-agent messages',
    },
    { key: 'low_credit_threshold', label: 'Low Credit Warning', description: 'Threshold for low-balance warnings' },
    {
      key: 'free_credits_on_first_message',
      label: 'Free Credits (First Message)',
      description: 'Credits given on first contact',
    },
    {
      key: 'reserve_per_group_message',
      label: 'Reserve per Group Message',
      description: 'Credits reserved for group chats',
    },
  ];
  ngOnInit() {
    this.loadAll();
  }
  asInputValue(t) {
    return t.target.value;
  }
  replayTour() {
    this.tourService.reset(),
      this.settingsRouter.navigate(['/dashboard']).then(() => {
        setTimeout(() => this.tourService.startTour(), 400);
      });
  }
  saveNotifPrefs() {
    const t = {
      sessionComplete: this.notifSessionComplete(),
      sessionError: this.notifSessionError(),
      approval: this.notifApproval(),
      workTask: this.notifWorkTask(),
      agentMessage: this.notifAgentMessage(),
    };
    localStorage.setItem('corvid_notif_prefs', JSON.stringify(t)),
      this.notifications.success('Notification preferences saved');
  }
  loadNotifPrefs() {
    try {
      const t = localStorage.getItem('corvid_notif_prefs');
      if (t) {
        const e = JSON.parse(t);
        typeof e.sessionComplete === 'boolean' && this.notifSessionComplete.set(e.sessionComplete),
          typeof e.sessionError === 'boolean' && this.notifSessionError.set(e.sessionError),
          typeof e.approval === 'boolean' && this.notifApproval.set(e.approval),
          typeof e.workTask === 'boolean' && this.notifWorkTask.set(e.workTask),
          typeof e.agentMessage === 'boolean' && this.notifAgentMessage.set(e.agentMessage);
      }
    } catch {}
  }
  toggleSection(t) {
    this.collapsedSections.update((e) => {
      const n = new Set(e);
      return n.has(t) ? n.delete(t) : n.add(t), n;
    });
  }
  getCreditValue(t) {
    return this.creditValues[t] ?? this.settings()?.creditConfig?.[t] ?? '';
  }
  setCreditValue(t, e) {
    this.creditValues[t] = e;
    const n = this.settings()?.creditConfig?.[t] ?? '';
    this.dirtyKeys.update((o) => {
      const r = new Set(o);
      return e === n ? r.delete(t) : r.add(t), r;
    });
  }
  isCreditDirty(t) {
    return this.dirtyKeys().has(t);
  }
  resetCreditChanges() {
    (this.creditValues = {}), this.dirtyKeys.set(new Set());
  }
  async setMode(t) {
    try {
      await N(this.api.post('/operational-mode', { mode: t })),
        this.operationalMode.set(t),
        this.notifications.success(`Operational mode set to ${t}`);
    } catch {
      this.notifications.error('Failed to update operational mode');
    }
  }
  async saveCreditConfig() {
    if (this.isDirty()) {
      this.saving.set(!0);
      try {
        await N(this.api.put('/settings/credits', this.creditValues)),
          this.notifications.success('Credit configuration saved'),
          (this.creditValues = {}),
          this.dirtyKeys.set(new Set());
      } catch {
        this.notifications.error('Failed to save credit configuration');
      } finally {
        this.saving.set(!1);
      }
    }
  }
  async runBackup() {
    this.backingUp.set(!0), this.backupResult.set(null);
    try {
      const t = await N(this.api.post('/backup'));
      this.backupResult.set(`Backup created: ${t.path}`), this.notifications.success('Database backup created');
    } catch {
      this.notifications.error('Backup failed');
    } finally {
      this.backingUp.set(!1);
    }
  }
  async createContact() {
    const t = this.newContactNickname().trim();
    if (!t) {
      this.notifications.error('Please enter a nickname');
      return;
    }
    this.creatingContact.set(!0);
    try {
      const e = await N(this.api.post('/algochat/psk-contacts', { nickname: t }));
      await this.loadPSKContacts(),
        this.newContactNickname.set(''),
        this.addingContact.set(!1),
        this.notifications.success(`Contact "${e.nickname}" created`),
        this.toggleQR(Ce(j({}, e), { network: '', mobileAddress: null, active: !0, createdAt: '', uri: e.uri }));
    } catch {
      this.notifications.error('Failed to create contact');
    } finally {
      this.creatingContact.set(!1);
    }
  }
  async toggleQR(t) {
    if (this.expandedContactId() === t.id) {
      this.expandedContactId.set(null);
      return;
    }
    if (!t.uri)
      try {
        const e = await N(this.api.get(`/algochat/psk-contacts/${t.id}/qr`));
        (t.uri = e.uri),
          this.pskContacts.update((n) => n.map((o) => (o.id === t.id ? Ce(j({}, o), { uri: e.uri }) : o)));
      } catch {
        this.notifications.error('Failed to load QR code');
        return;
      }
    this.expandedContactId.set(t.id), this.renderQRWhenReady(t.uri);
  }
  async copyContactUri(t) {
    let e = t.uri;
    if (!e)
      try {
        e = (await N(this.api.get(`/algochat/psk-contacts/${t.id}/qr`))).uri;
      } catch {
        this.notifications.error('Failed to get URI');
        return;
      }
    await navigator.clipboard.writeText(e), this.notifications.success('URI copied to clipboard');
  }
  async cancelContact(t) {
    if (confirm(`Delete contact "${t.nickname}"? They will no longer be able to message your agent.`))
      try {
        await N(this.api.delete(`/algochat/psk-contacts/${t.id}`)),
          this.notifications.success(`Contact "${t.nickname}" deleted`),
          this.expandedContactId() === t.id && this.expandedContactId.set(null),
          await this.loadPSKContacts();
      } catch {
        this.notifications.error('Failed to delete contact');
      }
  }
  startEditNickname(t) {
    this.editingContactId.set(t.id), this.editingNickname.set(t.nickname);
  }
  cancelEditNickname() {
    this.editingContactId.set(null), this.editingNickname.set('');
  }
  async saveNickname(t) {
    const e = this.editingNickname().trim();
    if (e)
      try {
        await N(this.api.patch(`/algochat/psk-contacts/${t}`, { nickname: e })),
          this.pskContacts.update((n) => n.map((o) => (o.id === t ? Ce(j({}, o), { nickname: e }) : o))),
          this.editingContactId.set(null),
          this.notifications.success('Contact renamed');
      } catch {
        this.notifications.error('Failed to rename contact');
      }
  }
  setDiscordValue(t, e) {
    const n = this.discordConfig()?.[t] ?? '';
    this.discordValues.update((o) => {
      const r = j({}, o);
      return e === n ? delete r[t] : (r[t] = e), r;
    });
  }
  resetDiscordChanges() {
    this.discordValues.set({});
  }
  async saveDiscordConfig() {
    const t = this.discordValues();
    if (Object.keys(t).length !== 0) {
      this.savingDiscord.set(!0);
      try {
        await N(this.api.put('/settings/discord', t)),
          this.discordConfig.update((e) => e && j(j({}, e), t)),
          this.discordValues.set({}),
          this.notifications.success('Discord configuration saved');
      } catch {
        this.notifications.error('Failed to save Discord configuration');
      } finally {
        this.savingDiscord.set(!1);
      }
    }
  }
  get textChannels() {
    return this.guildChannels()
      .filter((t) => t.type === 0)
      .sort((t, e) => t.position - e.position);
  }
  getSelectedChannelIds() {
    return (this.discordValues().additional_channel_ids ?? this.discordConfig()?.additional_channel_ids ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }
  getSelectedChannels() {
    const t = this.getSelectedChannelIds(),
      e = new Map(this.guildChannels().map((n) => [n.id, n]));
    return t.map((n) => {
      const o = e.get(n);
      return { id: n, name: o?.name ?? n };
    });
  }
  filteredChannels() {
    const t = new Set(this.getSelectedChannelIds()),
      e = this.channelSearch().toLowerCase();
    return this.textChannels.filter((n) => !t.has(n.id) && n.name.toLowerCase().includes(e)).slice(0, 15);
  }
  addChannel(t) {
    const e = this.getSelectedChannelIds();
    e.includes(t) || (e.push(t), this.setDiscordValue('additional_channel_ids', e.join(','))),
      this.channelSearch.set('');
  }
  removeChannel(t) {
    const e = this.getSelectedChannelIds().filter((n) => n !== t);
    this.setDiscordValue('additional_channel_ids', e.join(','));
  }
  getConfigurableRoles() {
    return this.guildRoles()
      .filter((t) => t.name !== '@everyone' && !t.managed)
      .sort((t, e) => e.position - t.position);
  }
  getRolePermLevel(t) {
    const e = this.discordValues().role_permissions ?? this.discordConfig()?.role_permissions ?? '{}';
    try {
      const n = JSON.parse(e);
      return n[t] !== void 0 ? String(n[t]) : '';
    } catch {
      return '';
    }
  }
  setRolePermLevel(t, e) {
    let n = this.discordValues().role_permissions ?? this.discordConfig()?.role_permissions ?? '{}',
      o = {};
    try {
      o = JSON.parse(n);
    } catch {}
    e === '' ? delete o[t] : (o[t] = parseInt(e, 10)), this.setDiscordValue('role_permissions', JSON.stringify(o));
  }
  roleColor(t) {
    return t.color ? `#${t.color.toString(16).padStart(6, '0')}` : 'var(--text-primary)';
  }
  getChannelPerms() {
    const t = this.discordValues().channel_permissions ?? this.discordConfig()?.channel_permissions ?? '{}';
    try {
      return JSON.parse(t);
    } catch {
      return {};
    }
  }
  getChannelPermEntries() {
    const t = this.getChannelPerms(),
      e = new Map(this.guildChannels().map((n) => [n.id, n]));
    return Object.entries(t).map(([n, o]) => ({ id: n, name: e.get(n)?.name ?? n, level: o }));
  }
  filteredChannelPerms() {
    const t = new Set(Object.keys(this.getChannelPerms())),
      e = this.channelPermSearch().toLowerCase();
    return this.textChannels.filter((n) => !t.has(n.id) && n.name.toLowerCase().includes(e)).slice(0, 15);
  }
  addChannelPerm(t) {
    const e = this.getChannelPerms();
    t in e || ((e[t] = 2), this.setDiscordValue('channel_permissions', JSON.stringify(e))),
      this.channelPermSearch.set('');
  }
  setChannelPermLevel(t, e) {
    const n = this.getChannelPerms();
    (n[t] = parseInt(e, 10)), this.setDiscordValue('channel_permissions', JSON.stringify(n));
  }
  removeChannelPerm(t) {
    const e = this.getChannelPerms();
    delete e[t], this.setDiscordValue('channel_permissions', JSON.stringify(e));
  }
  String = String;
  async loadDiscordConfig() {
    try {
      const t = await N(this.api.get('/settings/discord'));
      this.discordConfig.set(t.discordConfig);
    } catch {}
  }
  async loadGuildCache() {
    try {
      const t = await N(this.api.get('/settings/discord/guild-cache'));
      this.guildChannels.set(t.channels ?? []), this.guildRoles.set(t.roles ?? []);
    } catch {}
  }
  async loadAgentsList() {
    try {
      const t = await N(this.api.get('/agents'));
      this.agentsList.set(t.map((e) => ({ id: e.id, name: e.name })));
    } catch {}
  }
  renderQRWhenReady(t, e = 0) {
    if (e > 20) return;
    const n = this.elRef.nativeElement.querySelector('.qr-canvas');
    n
      ? Tn.default.toCanvas(n, t, { width: 280, margin: 2, color: { dark: '#0a0a12', light: '#e0f7fa' } })
      : setTimeout(() => this.renderQRWhenReady(t, e + 1), 50);
  }
  async loadPSKContacts() {
    try {
      const t = await N(this.api.get('/algochat/psk-contacts'));
      this.pskContacts.set(t.contacts);
    } catch {}
  }
  async loadAll() {
    this.loading.set(!0), this.loadNotifPrefs();
    try {
      const [t, e] = await Promise.all([N(this.api.get('/settings')), N(this.api.get('/operational-mode'))]);
      this.settings.set(t),
        this.operationalMode.set(e.mode),
        this.sessionService.loadAlgoChatStatus(),
        await Promise.all([
          this.loadPSKContacts(),
          this.loadDiscordConfig(),
          this.loadGuildCache(),
          this.loadAgentsList(),
          this.loadOpenRouterStatus(),
        ]);
    } catch {
    } finally {
      this.loading.set(!1);
    }
  }
  async loadOpenRouterStatus() {
    try {
      const t = await N(this.api.get('/openrouter/status'));
      if ((this.openrouterStatus.set(t), t.status === 'available')) {
        const e = await N(this.api.get('/openrouter/models/configured'));
        this.openrouterModels.set(e.models ?? []);
      }
    } catch {
      this.openrouterStatus.set({ status: 'unavailable' });
    }
  }
  static \u0275fac = (e) => new (e || i)();
  static \u0275cmp = rt({
    type: i,
    selectors: [['app-settings']],
    decls: 5,
    vars: 1,
    consts: [
      [1, 'settings'],
      ['variant', 'line', 3, 'count'],
      [1, 'settings__section'],
      [1, 'section-toggle', 3, 'click'],
      [1, 'section-chevron'],
      [1, 'info-grid', 'section-collapse'],
      [1, 'health-grid', 'section-collapse'],
      [1, 'section-badge'],
      [1, 'section-badge', 'section-badge--mode'],
      [1, 'status-badge', 'status-badge--ok'],
      [1, 'dirty-badge', 'dirty-badge-pulse'],
      [1, 'notification-prefs', 'section-collapse'],
      [1, 'info-item'],
      [1, 'info-label'],
      [1, 'info-value'],
      [1, 'info-item', 'info-item--action'],
      [1, 'save-btn', 'save-btn--sm', 3, 'click'],
      [1, 'health-item'],
      [1, 'health-dot'],
      [1, 'health-name'],
      [1, 'health-status'],
      [1, 'discord-grid', 'section-collapse'],
      [1, 'discord-field'],
      ['for', 'discord_mode', 1, 'discord-label'],
      ['id', 'discord_mode', 1, 'discord-select', 3, 'ngModelChange', 'ngModel'],
      ['value', 'chat'],
      ['value', 'work_intake'],
      [1, 'discord-desc'],
      ['for', 'discord_public_mode', 1, 'discord-label'],
      ['id', 'discord_public_mode', 1, 'discord-select', 3, 'ngModelChange', 'ngModel'],
      ['value', 'false'],
      ['value', 'true'],
      ['for', 'discord_default_perm', 1, 'discord-label'],
      ['id', 'discord_default_perm', 1, 'discord-select', 3, 'ngModelChange', 'ngModel'],
      ['value', '0'],
      ['value', '1'],
      ['value', '2'],
      ['value', '3'],
      ['for', 'discord_activity_type', 1, 'discord-label'],
      ['id', 'discord_activity_type', 1, 'discord-select', 3, 'ngModelChange', 'ngModel'],
      ['value', '5'],
      ['for', 'discord_status_text', 1, 'discord-label'],
      ['id', 'discord_status_text', 'placeholder', 'corvid-agent', 1, 'discord-input', 3, 'ngModelChange', 'ngModel'],
      ['for', 'discord_default_agent', 1, 'discord-label'],
      ['id', 'discord_default_agent', 1, 'discord-select', 3, 'ngModel'],
      ['id', 'discord_default_agent', 'placeholder', 'Agent UUID', 1, 'discord-input', 3, 'ngModel'],
      [1, 'discord-field', 'discord-field--wide'],
      [1, 'discord-label'],
      [1, 'chip-list'],
      [1, 'chip'],
      ['placeholder', 'Channel IDs, comma-separated', 1, 'discord-input', 3, 'ngModel'],
      ['for', 'discord_users', 1, 'discord-label'],
      [
        'id',
        'discord_users',
        'placeholder',
        'User IDs, comma-separated',
        1,
        'discord-input',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [1, 'role-perm-grid'],
      ['rows', '3', 'placeholder', '{"role_id": 3, "other_role_id": 1}', 1, 'discord-textarea', 3, 'ngModel'],
      [1, 'role-perm-row'],
      ['for', 'discord_rate_limits', 1, 'discord-label'],
      [
        'id',
        'discord_rate_limits',
        'rows',
        '2',
        'placeholder',
        '{"1": 5, "2": 15, "3": 50}',
        1,
        'discord-textarea',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [1, 'discord-actions'],
      [1, 'save-btn', 3, 'click', 'disabled'],
      [1, 'cancel-btn', 'cancel-btn--sm'],
      ['id', 'discord_default_agent', 1, 'discord-select', 3, 'ngModelChange', 'ngModel'],
      ['value', ''],
      [3, 'value'],
      ['id', 'discord_default_agent', 'placeholder', 'Agent UUID', 1, 'discord-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'chip-remove', 3, 'click'],
      [1, 'picker-search'],
      ['placeholder', 'Search channels...', 1, 'discord-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'picker-results'],
      [1, 'picker-item'],
      [1, 'picker-empty'],
      [1, 'picker-item', 3, 'click'],
      [1, 'picker-id'],
      ['placeholder', 'Channel IDs, comma-separated', 1, 'discord-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'role-name'],
      [1, 'discord-select', 'discord-select--sm', 3, 'ngModelChange', 'ngModel'],
      [
        'rows',
        '3',
        'placeholder',
        '{"role_id": 3, "other_role_id": 1}',
        1,
        'discord-textarea',
        3,
        'ngModelChange',
        'ngModel',
      ],
      [1, 'channel-name'],
      ['placeholder', 'Add channel permission...', 1, 'discord-input', 3, 'ngModelChange', 'ngModel'],
      [1, 'cancel-btn', 'cancel-btn--sm', 3, 'click'],
      [1, 'muted'],
      [1, 'info-value', 'network-badge'],
      [1, 'info-code'],
      [1, 'connect-desc'],
      [1, 'contact-list'],
      [1, 'add-contact'],
      [1, 'add-contact-form'],
      [1, 'save-btn'],
      [1, 'contact-card', 'contact-interactive'],
      [1, 'contact-header'],
      [1, 'contact-status'],
      [1, 'contact-address'],
      [1, 'contact-actions'],
      [1, 'qr-container'],
      [1, 'contact-nickname-input', 3, 'input', 'keydown.enter', 'keydown.escape', 'value'],
      ['title', 'Save', 1, 'icon-btn', 3, 'click'],
      ['title', 'Cancel', 1, 'icon-btn', 3, 'click'],
      [1, 'contact-nickname', 3, 'dblclick'],
      ['title', 'Rename', 1, 'icon-btn', 3, 'click'],
      [1, 'qr-canvas'],
      [
        'placeholder',
        'Nickname (e.g. Alice)',
        1,
        'contact-nickname-input',
        3,
        'input',
        'keydown.enter',
        'keydown.escape',
        'value',
      ],
      [1, 'save-btn', 'save-btn--sm', 3, 'click', 'disabled'],
      [1, 'icon-btn', 3, 'click'],
      [1, 'save-btn', 3, 'click'],
      [1, 'mode-selector', 'section-collapse'],
      [1, 'mode-btn', 3, 'mode-btn--active'],
      [1, 'mode-desc'],
      [1, 'mode-btn', 3, 'click'],
      [1, 'muted', 2, 'margin-top', '0.5rem'],
      [1, 'openrouter-models'],
      [1, 'model-list'],
      [1, 'model-item'],
      [1, 'model-name'],
      [1, 'model-price'],
      [1, 'credit-grid', 'section-collapse'],
      [1, 'credit-field'],
      [1, 'credit-actions'],
      [1, 'credit-label', 3, 'for'],
      ['type', 'number', 1, 'credit-input', 3, 'ngModelChange', 'id', 'ngModel'],
      [1, 'credit-desc'],
      [1, 'notif-row'],
      [1, 'notif-info'],
      [1, 'notif-name'],
      [1, 'notif-desc'],
      [1, 'notif-toggle'],
      ['type', 'checkbox', 3, 'change', 'checked'],
      [1, 'notif-toggle__track'],
      [1, 'notif-toggle__thumb'],
      [1, 'env-grid', 'section-collapse'],
      [1, 'env-item'],
      [1, 'env-key'],
      [1, 'env-value', 'env-value--set'],
      [1, 'env-value'],
      [1, 'env-hint'],
      [1, 'backup-btn', 3, 'click', 'disabled'],
      [1, 'backup-result'],
    ],
    template: (e, n) => {
      e & 1 && (s(0, 'div', 0)(1, 'h2'), l(2, 'Settings'), a(), h(3, ki, 1, 1, 'app-skeleton', 1)(4, Oo, 72, 39), a()),
        e & 2 && (d(3), x(n.loading() ? 3 : 4));
    },
    dependencies: [wt, bt, yt, ft, vt, St, ht, xt, Et, _t, ut],
    styles: [
      '.settings[_ngcontent-%COMP%]{padding:1.5rem;max-width:900px}.settings[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0 0 1.5rem;color:var(--text-primary)}.settings[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{margin:0 0 .75rem;color:var(--text-primary);font-size:.85rem}.loading[_ngcontent-%COMP%], .muted[_ngcontent-%COMP%]{color:var(--text-secondary);font-size:.8rem}.section-toggle[_ngcontent-%COMP%]{cursor:pointer;display:flex;align-items:center;gap:.5rem;-webkit-user-select:none;user-select:none;transition:color .15s}.section-toggle[_ngcontent-%COMP%]:hover{color:var(--accent-cyan)}.section-chevron[_ngcontent-%COMP%]{font-size:.55rem;color:var(--text-tertiary);width:.75rem}.section-badge[_ngcontent-%COMP%]{font-size:.55rem;font-weight:700;padding:1px 6px;border-radius:var(--radius-sm);background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);text-transform:uppercase;letter-spacing:.04em}.section-badge--mode[data-mode=normal][_ngcontent-%COMP%]{color:var(--accent-green);border-color:var(--accent-green);background:var(--accent-green-dim)}.section-badge--mode[data-mode=queued][_ngcontent-%COMP%]{color:var(--accent-amber);border-color:var(--accent-amber);background:var(--accent-amber-dim)}.section-badge--mode[data-mode=paused][_ngcontent-%COMP%]{color:var(--accent-red);border-color:var(--accent-red);background:var(--accent-red-dim)}.dirty-badge[_ngcontent-%COMP%]{font-size:.55rem;font-weight:600;padding:1px 6px;border-radius:var(--radius-sm);background:var(--accent-amber-dim);color:var(--accent-amber);border:1px solid var(--accent-amber);margin-left:auto}.health-grid[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.health-item[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.6rem;padding:.4rem .5rem;background:var(--bg-raised);border-radius:var(--radius)}.health-dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;flex-shrink:0}.health-dot[data-status=ok][_ngcontent-%COMP%]{background:var(--accent-green);box-shadow:0 0 6px var(--accent-green)}.health-dot[data-status=warn][_ngcontent-%COMP%]{background:var(--accent-amber);box-shadow:0 0 6px var(--accent-amber)}.health-dot[data-status=off][_ngcontent-%COMP%]{background:var(--text-tertiary)}.health-name[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-primary);min-width:120px}.health-status[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary)}.credit-input--dirty[_ngcontent-%COMP%]{border-color:var(--accent-amber)!important}.credit-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center}.discord-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-bottom:1rem}.discord-field[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.2rem}.discord-field--wide[_ngcontent-%COMP%]{grid-column:1 / -1}.discord-label[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);font-weight:600}.discord-input[_ngcontent-%COMP%], .discord-select[_ngcontent-%COMP%], .discord-textarea[_ngcontent-%COMP%]{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;width:100%}.discord-textarea[_ngcontent-%COMP%]{resize:vertical;font-size:.75rem;font-family:var(--font-mono, monospace)}.discord-select[_ngcontent-%COMP%]{cursor:pointer}.discord-input[_ngcontent-%COMP%]:focus, .discord-select[_ngcontent-%COMP%]:focus, .discord-textarea[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.discord-desc[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary)}.discord-select--sm[_ngcontent-%COMP%]{padding:.3rem;font-size:.75rem;width:auto;min-width:120px}.discord-actions[_ngcontent-%COMP%]{display:flex;gap:.5rem;align-items:center}.chip-list[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.4rem}.chip[_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .5rem;background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:var(--radius-sm);font-size:.7rem;font-weight:600}.chip-remove[_ngcontent-%COMP%]{background:none;border:none;color:inherit;cursor:pointer;font-size:.85rem;padding:0;line-height:1;opacity:.7}.chip-remove[_ngcontent-%COMP%]:hover{opacity:1}.picker-search[_ngcontent-%COMP%]{margin-bottom:.3rem}.picker-results[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.15rem;max-height:160px;overflow-y:auto;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.3rem}.picker-item[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-primary);text-align:left;padding:.3rem .5rem;cursor:pointer;border-radius:var(--radius-sm);font-size:.75rem;font-family:inherit;display:flex;justify-content:space-between;align-items:center}.picker-item[_ngcontent-%COMP%]:hover{background:var(--bg-surface);color:var(--accent-cyan)}.picker-id[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);font-family:var(--font-mono, monospace)}.picker-empty[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);padding:.3rem .5rem}.role-perm-grid[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.4rem}.role-perm-row[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.3rem .5rem;background:var(--bg-raised);border-radius:var(--radius-sm)}.role-name[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.channel-name[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;flex:1;color:var(--text-primary)}.settings__section[_ngcontent-%COMP%]{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.25rem}.info-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem}.info-item[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.2rem}.info-label[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em}.info-value[_ngcontent-%COMP%]{font-size:1rem;font-weight:700;color:var(--text-primary)}.info-value--active[_ngcontent-%COMP%]{color:var(--accent-green)}.info-value--inactive[_ngcontent-%COMP%]{color:var(--accent-red)}.info-code[_ngcontent-%COMP%]{background:var(--bg-raised);color:var(--accent-magenta);padding:2px 6px;border-radius:var(--radius-sm);font-size:.7rem;border:1px solid var(--border);word-break:break-all}.network-badge[_ngcontent-%COMP%]{text-transform:uppercase;font-size:.75rem}.network-badge[data-network=testnet][_ngcontent-%COMP%]{color:#4a90d9}.network-badge[data-network=mainnet][_ngcontent-%COMP%]{color:#50e3c2}.network-badge[data-network=localnet][_ngcontent-%COMP%]{color:var(--accent-gold)}.algo-balance--low[_ngcontent-%COMP%]{color:var(--accent-red, #ff4d4f)!important}.connect-desc[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);margin-bottom:1rem}.contact-list[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;max-height:500px;overflow-y:auto}.contact-card[_ngcontent-%COMP%]{background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem}.contact-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem}.contact-nickname[_ngcontent-%COMP%]{font-weight:700;font-size:.85rem;color:var(--text-primary);cursor:pointer}.contact-nickname-input[_ngcontent-%COMP%]{padding:.25rem .4rem;background:var(--bg-input);border:1px solid var(--accent-cyan);border-radius:var(--radius-sm);color:var(--text-primary);font-size:.8rem;font-family:inherit;font-weight:600;outline:none;width:140px}.contact-status[_ngcontent-%COMP%]{font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-left:auto}.contact-status--active[_ngcontent-%COMP%]{color:var(--accent-green)}.contact-status--waiting[_ngcontent-%COMP%]{color:var(--accent-yellow, #f5a623)}.contact-address[_ngcontent-%COMP%]{display:block;font-size:.6rem;color:var(--accent-magenta);background:var(--bg-surface);padding:2px 4px;border-radius:var(--radius-sm);margin-bottom:.4rem;word-break:break-all}.contact-actions[_ngcontent-%COMP%]{display:flex;gap:.4rem;flex-wrap:wrap}.icon-btn[_ngcontent-%COMP%]{background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:.85rem;padding:.1rem .3rem;border-radius:var(--radius-sm)}.icon-btn[_ngcontent-%COMP%]:hover{color:var(--text-primary);background:var(--bg-surface)}.qr-container[_ngcontent-%COMP%]{display:flex;justify-content:center;margin-top:.75rem}.qr-canvas[_ngcontent-%COMP%]{border-radius:var(--radius);border:2px solid var(--accent-cyan);box-shadow:0 0 12px #00e5ff33}.add-contact[_ngcontent-%COMP%]{margin-top:.5rem}.add-contact-form[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.mode-selector[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-bottom:.5rem}.mode-btn[_ngcontent-%COMP%]{padding:.45rem .85rem;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-secondary);font-size:.75rem;font-family:inherit;font-weight:600;cursor:pointer;text-transform:capitalize;transition:border-color .15s,color .15s,background .15s}.mode-btn[_ngcontent-%COMP%]:hover{border-color:var(--border-bright);color:var(--text-primary)}.mode-btn--active[_ngcontent-%COMP%]{border-color:var(--accent-cyan);color:var(--accent-cyan);background:var(--accent-cyan-dim)}.mode-desc[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-tertiary);margin:0}.credit-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-bottom:1rem}.credit-field[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.2rem}.credit-label[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary);font-weight:600}.credit-input[_ngcontent-%COMP%]{padding:.45rem;background:var(--bg-input);border:1px solid var(--border-bright);border-radius:var(--radius);color:var(--text-primary);font-size:.85rem;font-family:inherit;width:100%}.credit-input[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan);box-shadow:var(--glow-cyan);outline:none}.credit-desc[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary)}.save-btn[_ngcontent-%COMP%], .backup-btn[_ngcontent-%COMP%], .cancel-btn[_ngcontent-%COMP%]{padding:.5rem 1.25rem;border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s}.save-btn[_ngcontent-%COMP%]{background:var(--accent-cyan-dim);color:var(--accent-cyan);border:1px solid var(--accent-cyan)}.save-btn[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff33}.save-btn[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.save-btn--sm[_ngcontent-%COMP%], .cancel-btn--sm[_ngcontent-%COMP%]{padding:.3rem .7rem;font-size:.65rem}.backup-btn[_ngcontent-%COMP%]{background:var(--accent-magenta-dim);color:var(--accent-magenta);border:1px solid var(--accent-magenta)}.backup-btn[_ngcontent-%COMP%]:hover:not(:disabled){background:#f0a3}.backup-btn[_ngcontent-%COMP%]:disabled{opacity:.5;cursor:not-allowed}.cancel-btn[_ngcontent-%COMP%]{background:transparent;color:var(--accent-red, #ff4d4f);border:1px solid var(--accent-red, #ff4d4f)}.cancel-btn[_ngcontent-%COMP%]:hover{background:#ff4d4f1a}.backup-result[_ngcontent-%COMP%]{font-size:.7rem;color:var(--accent-green);margin-top:.5rem}.notification-prefs[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.35rem}.notif-row[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.55rem .65rem;background:var(--bg-raised);border-radius:var(--radius);gap:1rem}.notif-info[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.1rem}.notif-name[_ngcontent-%COMP%]{font-size:.75rem;font-weight:600;color:var(--text-primary)}.notif-desc[_ngcontent-%COMP%]{font-size:.6rem;color:var(--text-tertiary)}.notif-toggle[_ngcontent-%COMP%]{position:relative;display:inline-flex;cursor:pointer}.notif-toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]{position:absolute;opacity:0;width:0;height:0}.notif-toggle__track[_ngcontent-%COMP%]{width:36px;height:20px;border-radius:10px;background:var(--border-bright);transition:background .2s;position:relative;flex-shrink:0}.notif-toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]:checked + .notif-toggle__track[_ngcontent-%COMP%]{background:var(--accent-cyan)}.notif-toggle__thumb[_ngcontent-%COMP%]{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--text-primary);transition:transform .2s}.notif-toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]:checked + .notif-toggle__track[_ngcontent-%COMP%]   .notif-toggle__thumb[_ngcontent-%COMP%]{transform:translate(16px);background:var(--bg-deep)}.env-grid[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.35rem}.env-item[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.45rem .65rem;background:var(--bg-raised);border-radius:var(--radius)}.env-key[_ngcontent-%COMP%]{font-size:.7rem;font-weight:600;color:var(--text-primary);font-family:var(--font-mono, monospace)}.env-value[_ngcontent-%COMP%]{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.env-value--set[_ngcontent-%COMP%]{color:var(--accent-green)}.env-value--unset[_ngcontent-%COMP%]{color:var(--text-tertiary)}.env-hint[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-tertiary);margin-top:.5rem}.env-hint[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{background:var(--bg-raised);padding:1px 4px;border-radius:3px;font-size:.6rem;border:1px solid var(--border)}@media(max-width:600px){.settings[_ngcontent-%COMP%]{padding:1rem}.discord-grid[_ngcontent-%COMP%], .credit-grid[_ngcontent-%COMP%], .info-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}.mode-selector[_ngcontent-%COMP%]{flex-wrap:wrap}.notif-row[_ngcontent-%COMP%]{flex-direction:column;align-items:stretch;gap:.35rem}.notif-toggle[_ngcontent-%COMP%]{align-self:flex-end}}',
    ],
    changeDetection: 0,
  });
};

export { Pn as SettingsComponent };
