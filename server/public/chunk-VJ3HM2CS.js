import { a as We } from './chunk-4V35P7HZ.js';
import {
  i as _e,
  N as at,
  e as be,
  H as D,
  x as De,
  y as et,
  E as Ge,
  t as g,
  j as H,
  r as He,
  A as Ie,
  I as it,
  p as Je,
  m as je,
  z as K,
  o as Le,
  J as ne,
  D as nt,
  w as Oe,
  L as ot,
  g as Qe,
  l as qe,
  K as rt,
  q as te,
  B as tt,
  h as U,
  a as Ue,
  F as ue,
  s as X,
  n as ye,
  b as Ze,
  G as ze,
} from './chunk-KIK2QXGD.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  Jb as $e,
  Qb as A,
  ib as C,
  qb as c,
  _a as ce,
  lb as de,
  Z as E,
  Rb as ee,
  hb as Fe,
  hc as he,
  Ib as Ke,
  T as ke,
  vb as L,
  pb as l,
  jb as M,
  Bb as m,
  jc as me,
  Sa as Ne,
  ja as P,
  fc as Pe,
  Ob as p,
  Mb as pe,
  tb as Q,
  Lb as q,
  ic as Re,
  ub as Se,
  Na as s,
  Pb as T,
  ma as Te,
  nb as V,
  sb as W,
  zb as w,
  Ab as Xe,
  Y as x,
  ob as Z,
  mb as z,
} from './chunk-LF4EWAJA.js';

var xt = ['container'],
  Et = ['canvas'],
  Ct = ['minimap'],
  Mt = (_r, e) => e.category;
function wt(r, e) {
  if (r & 1) {
    const t = L();
    W(0, 'button', 10),
      Xe('click', () => {
        const i = x(t).$implicit,
          o = m();
        return E(o.teleportToZone(i));
      }),
      Se(1, 'span', 11),
      p(2),
      Q();
  }
  if (r & 2) {
    const t = e.$implicit;
    q('--zone-color', `#${t.color.toString(16).padStart(6, '0')}`), s(2), A(' ', t.label, ' ');
  }
}
function kt(r, _e) {
  if ((r & 1 && (W(0, 'div', 12)(1, 'strong'), p(2), Q(), W(3, 'span', 13), p(4), Q()()), r & 2)) {
    const t = m();
    q('left', t.tooltipX(), 'px')('top', t.tooltipY(), 'px'),
      s(2),
      T(t.hoveredEntry().key),
      s(2),
      T(t.hoveredEntry().category);
  }
}
function Tt(r, _e) {
  r & 1 && p(0, ' WASD move \xB7 Mouse look \xB7 Click book to read \xB7 TAB browse mode ');
}
function St(r, _e) {
  r & 1 && p(0, ' Right-drag look \xB7 Click item to read \xB7 WASD move \xB7 TAB walk mode ');
}
var st = { guide: 58879, reference: 10980346, decision: 16096779, standard: 1096065, runbook: 16007006 },
  Pt = { guide: 'Guides', reference: 'Reference', decision: 'Decisions', standard: 'Standards', runbook: 'Runbooks' },
  Ve = ['guide', 'reference', 'decision', 'standard', 'runbook'],
  lt = 40,
  j = 12,
  ge = class r {
    entries = Re.required();
    paused = Re(!1);
    entrySelect = he();
    bookPageSelect = he();
    orbSearch = he();
    hoveredEntry = P(null);
    tooltipX = P(0);
    tooltipY = P(0);
    fpsMode = P(!1);
    containerRef = me.required('container');
    canvasRef = me.required('canvas');
    minimapRef = me.required('minimap');
    renderer = null;
    scene = null;
    camera = null;
    animationId = 0;
    resizeObserver = null;
    bookNodes = [];
    stars = null;
    starTwinklePhases = null;
    dustParticles = null;
    centerOrb = null;
    centerRing = null;
    centerOrbHitbox = null;
    orbHovered = !1;
    zoneRings = [];
    zoneLabels = [];
    shelfGroups = [];
    cameraTarget = new U(0, 5, 0);
    cameraPosition = new U(0, 5, 55);
    cameraYaw = 0;
    cameraPitch = -0.05;
    cameraDistance = 55;
    keys = new Set();
    isDragging = !1;
    lastMouseX = 0;
    lastMouseY = 0;
    touchStartX = 0;
    touchStartY = 0;
    raycaster = new ot();
    mouse = new Qe();
    unpausedAt = 0;
    rightDragging = !1;
    reducedMotion = !1;
    categoryZones = Ve.map((e, t) => {
      const n = (t / Ve.length) * Math.PI * 2 - Math.PI / 2;
      return {
        category: e,
        label: Pt[e],
        color: st[e],
        angle: n,
        position: new U(Math.cos(n) * lt, 0, Math.sin(n) * lt),
      };
    });
    bookGroups = new Map();
    onKeyDown = (e) => this.handleKeyDown(e);
    onKeyUp = (e) => this.handleKeyUp(e);
    onMouseDown = (e) => this.handleMouseDown(e);
    onMouseMove = (e) => this.handleMouseMove(e);
    onMouseUp = () => this.handleMouseUp();
    onWheel = (e) => this.handleWheel(e);
    onClick = (e) => this.handleClick(e);
    onTouchStart = (e) => this.handleTouchStart(e);
    onTouchMove = (e) => this.handleTouchMove(e);
    onTouchEnd = () => this.handleTouchEnd();
    onContextMenu = (e) => e.preventDefault();
    onPointerLockChange = () => {
      !document.pointerLockElement && this.fpsMode() && this.fpsMode.set(!1);
    };
    constructor() {
      (this.reducedMotion = typeof window < 'u' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
        Ne(() => this.initScene()),
        Te(() => {
          const e = this.entries();
          this.scene && this.rebuildBooks(e);
        }),
        Te(() => {
          this.paused()
            ? (this.fpsMode.set(!1), document.pointerLockElement && document.exitPointerLock(), this.keys.clear())
            : (this.unpausedAt = Date.now());
        });
    }
    ngOnDestroy() {
      this.cleanup();
    }
    initScene() {
      const e = this.containerRef().nativeElement,
        t = this.canvasRef().nativeElement,
        n = e.clientWidth,
        i = e.clientHeight;
      (this.renderer = new at({ canvas: t, antialias: !0, alpha: !1 })),
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)),
        this.renderer.setSize(n, i),
        (this.scene = new je()),
        (this.scene.background = new H(328970)),
        (this.scene.fog = new qe(328970, 40, 110)),
        (this.camera = new it(60, n / i, 0.1, 200)),
        this.camera.position.copy(this.cameraPosition),
        this.camera.lookAt(this.cameraTarget);
      const o = new rt(1709349, 1);
      this.scene.add(o);
      const d = new ne(16770229, 1.4, 120);
      d.position.set(0, 25, 0), this.scene.add(d);
      const a = new ne(58879, 0.4, 150);
      a.position.set(0, 40, 0), this.scene.add(a);
      const h = new ne(10980346, 0.35, 80);
      h.position.set(-30, 12, 30), this.scene.add(h);
      const y = new ne(16096779, 0.25, 80);
      y.position.set(30, 12, -30), this.scene.add(y);
      const f = new Ie(70, 64);
      f.rotateX(-Math.PI / 2);
      const b = new D({
          color: 854546,
          roughness: 0.85,
          metalness: 0.05,
          emissive: new H(1709349),
          emissiveIntensity: 0.15,
        }),
        u = new g(f, b);
      (u.position.y = -0.01), this.scene.add(u);
      for (const _ of [15, 35, 55]) {
        const v = new Ge(_ - 0.1, _ + 0.1, 64);
        v.rotateX(-Math.PI / 2);
        const k = new X({ color: 1709360, transparent: !0, opacity: 0.3, side: be }),
          I = new g(v, k);
        (I.position.y = 0.02), this.scene.add(I);
      }
      this.createCenterPiece(),
        this.createStarfield(),
        this.createDustParticles(),
        this.createZoneMarkers(),
        this.rebuildBooks(this.entries()),
        this.addEventListeners(e),
        (this.resizeObserver = new ResizeObserver(() => this.handleResize())),
        this.resizeObserver.observe(e),
        this.animate(0);
    }
    createStarfield() {
      const t = new Float32Array(3e3),
        n = new Float32Array(1e3 * 3);
      this.starTwinklePhases = new Float32Array(1e3);
      for (let d = 0; d < 1e3; d++) {
        const a = Math.random() * Math.PI * 2,
          h = Math.acos(2 * Math.random() - 1),
          y = 70 + Math.random() * 40;
        (t[d * 3] = y * Math.sin(h) * Math.cos(a)),
          (t[d * 3 + 1] = Math.abs(y * Math.cos(h)) + 15),
          (t[d * 3 + 2] = y * Math.sin(h) * Math.sin(a));
        const f = Math.random(),
          b = d * 3;
        if (f < 0.4)
          (n[b] = 0.9 + Math.random() * 0.1),
            (n[b + 1] = 0.7 + Math.random() * 0.2),
            (n[b + 2] = 0.3 + Math.random() * 0.15);
        else if (f < 0.6)
          (n[b] = 0.5 + Math.random() * 0.2),
            (n[b + 1] = 0.8 + Math.random() * 0.2),
            (n[b + 2] = 0.9 + Math.random() * 0.1);
        else {
          const u = 0.7 + Math.random() * 0.3;
          (n[b] = u), (n[b + 1] = u * 0.95), (n[b + 2] = u);
        }
        this.starTwinklePhases[d] = Math.random() * Math.PI * 2;
      }
      const i = new Le();
      i.setAttribute('position', new ye(t, 3)), i.setAttribute('color', new ye(n, 3));
      const o = new Oe({
        size: 0.3,
        vertexColors: !0,
        transparent: !0,
        opacity: 0.6,
        sizeAttenuation: !0,
        depthWrite: !1,
      });
      (this.stars = new De(i, o)), this.scene.add(this.stars);
    }
    createCenterPiece() {
      const e = new _e(),
        t = new tt(4, 4.5, 0.6, 32),
        n = new D({ color: 1709360, emissive: new H(58879), emissiveIntensity: 0.08, roughness: 0.4, metalness: 0.6 }),
        i = new g(t, n);
      (i.position.y = 0.3), e.add(i);
      const o = new ze(3.5, 0.08, 8, 64),
        d = new X({ color: 58879, transparent: !0, opacity: 0.6 }),
        a = new g(o, d);
      (a.rotation.x = -Math.PI / 2), (a.position.y = 0.65), e.add(a);
      const h = new nt(1.2, 2),
        y = new D({
          color: 58879,
          emissive: new H(58879),
          emissiveIntensity: 0.8,
          roughness: 0.1,
          metalness: 0.9,
          transparent: !0,
          opacity: 0.7,
        }),
        f = new g(h, y);
      (f.position.y = 4), e.add(f), (this.centerOrb = f);
      const b = new ue(2.5, 16, 16),
        u = new X({ color: 58879, transparent: !0, opacity: 0.06 }),
        _ = new g(b, u);
      (_.position.y = 4), e.add(_);
      const v = new ze(1.8, 0.03, 8, 48),
        k = new X({ color: 10980346, transparent: !0, opacity: 0.5 }),
        I = new g(v, k);
      (I.position.y = 4), e.add(I), (this.centerRing = I);
      const J = new ue(3, 16, 16),
        B = new X({ visible: !1 }),
        Y = new g(J, B);
      (Y.position.y = 4), (Y.userData = { isOrbHitbox: !0 }), e.add(Y), (this.centerOrbHitbox = Y);
      const N = this.createTextSprite('CORVID LIBRARY', 58879, 512, 64, 28);
      N.position.set(0, 7.5, 0), N.scale.set(12, 1.5, 1), e.add(N);
      const O = this.createTextSprite('Team Alpha Knowledge Commons', 8947882, 512, 48, 18);
      O.position.set(0, 6.5, 0), O.scale.set(12, 1.2, 1), e.add(O);
      const S = this.createTextSprite('Click Orb to Search', 6728396, 384, 36, 14);
      S.position.set(0, 1.5, 0), S.scale.set(7, 0.7, 1), e.add(S), this.scene.add(e);
    }
    createDustParticles() {
      const t = new Float32Array(600);
      for (let o = 0; o < 200; o++)
        (t[o * 3] = (Math.random() - 0.5) * 120),
          (t[o * 3 + 1] = Math.random() * 20 + 1),
          (t[o * 3 + 2] = (Math.random() - 0.5) * 120);
      const n = new Le();
      n.setAttribute('position', new ye(t, 3));
      const i = new Oe({ color: 16770229, size: 0.12, transparent: !0, opacity: 0.3 });
      (this.dustParticles = new De(n, i)), this.scene.add(this.dustParticles);
    }
    createZoneMarkers() {
      for (const e of this.categoryZones) {
        const t = new Ge(j + 2, j + 2.3, 48);
        t.rotateX(-Math.PI / 2);
        const n = new X({ color: e.color, transparent: !0, opacity: 0.25, side: be }),
          i = new g(t, n);
        i.position.copy(e.position), (i.position.y = 0.05), this.scene.add(i), this.zoneRings.push(i);
        const o = this.createTextSprite(e.label, e.color, 256, 48, 24);
        o.position.copy(e.position),
          (o.position.y = 7),
          o.scale.set(10, 2, 1),
          this.scene.add(o),
          this.zoneLabels.push(o);
        const d = new _e(),
          a = new D({
            color: 1709344,
            emissive: new H(e.color),
            emissiveIntensity: 0.05,
            roughness: 0.9,
            metalness: 0.1,
          }),
          h = new D({
            color: 1709344,
            emissive: new H(e.color),
            emissiveIntensity: 0.08,
            roughness: 0.8,
            metalness: 0.2,
          });
        for (let u = 0; u < 2; u++) {
          const _ = e.angle + (u - 0.5) * 0.6,
            v = e.position.x + Math.cos(_) * (j * 0.5),
            k = e.position.z + Math.sin(_) * (j * 0.5);
          for (const S of [-1, 1]) {
            const $ = new K(0.2, 7, 0.2),
              R = new g($, h),
              ie = Math.cos(_ + Math.PI / 2) * 3.2 * S,
              ve = Math.sin(_ + Math.PI / 2) * 3.2 * S;
            R.position.set(v + ie, 3.5, k + ve), d.add(R);
          }
          const I = new K(6.6, 7, 0.08),
            J = new D({
              color: 1183258,
              emissive: new H(e.color),
              emissiveIntensity: 0.02,
              roughness: 0.95,
              metalness: 0,
            }),
            B = new g(I, J),
            Y = 0.65;
          B.position.set(v + Math.cos(_) * Y, 3.5, k + Math.sin(_) * Y), (B.rotation.y = _), d.add(B);
          const N = new K(6.6, 0.15, 1.3),
            O = new g(N, h);
          O.position.set(v, 7, k), (O.rotation.y = _), d.add(O);
          for (const S of [1, 3, 5]) {
            const $ = new K(6.4, 0.14, 1.3),
              R = new g($, a);
            R.position.set(v, S, k), (R.rotation.y = _), d.add(R);
          }
        }
        const y = new Ie(j + 1, 32);
        y.rotateX(-Math.PI / 2);
        const f = new X({ color: e.color, transparent: !0, opacity: 0.04, side: be }),
          b = new g(y, f);
        b.position.copy(e.position),
          (b.position.y = 0.02),
          this.scene.add(b),
          this.scene.add(d),
          this.shelfGroups.push(d);
      }
    }
    rebuildBooks(e) {
      for (const a of this.bookNodes)
        this.scene.remove(a.mesh),
          this.scene.remove(a.glowMesh),
          this.scene.remove(a.label),
          a.mesh.geometry.dispose(),
          a.mesh.material.dispose(),
          a.glowMesh.geometry.dispose(),
          a.glowMesh.material.dispose(),
          a.label.material instanceof te && a.label.material.map && a.label.material.map.dispose(),
          a.label.material.dispose();
      (this.bookNodes = []), this.bookGroups.clear();
      for (const a of e)
        if (a.book) {
          const h = this.bookGroups.get(a.book) ?? [];
          h.push(a), this.bookGroups.set(a.book, h);
        }
      for (const [, a] of this.bookGroups) a.sort((h, y) => (h.page ?? 0) - (y.page ?? 0));
      const t = new Set(),
        n = [];
      for (const a of e) {
        if (a.book && this.bookGroups.has(a.book)) {
          const h = this.bookGroups.get(a.book);
          if (h.length > 1) {
            if (t.has(a.book)) continue;
            t.add(a.book), n.push({ entry: h[0], pageCount: h.length });
            continue;
          }
        }
        n.push({ entry: a, pageCount: 1 });
      }
      const i = new Map();
      for (const a of Ve) i.set(a, []);
      for (const a of n) {
        const h = i.get(a.entry.category);
        h?.push(a);
      }
      const o = Date.now(),
        d = [1, 3, 5];
      for (const a of this.categoryZones) {
        let h = i.get(a.category) ?? [],
          y = h.filter((v) => v.pageCount > 1),
          f = h.filter((v) => v.pageCount <= 1),
          b = [...y, ...f],
          u = Math.ceil(b.length / (d.length * 2)),
          _ = 0;
        for (let v = 0; v < 2 && _ < b.length; v++) {
          const k = a.angle + (v - 0.5) * 0.6,
            I = a.position.x + Math.cos(k) * (j * 0.5),
            J = a.position.z + Math.sin(k) * (j * 0.5);
          for (let B = 0; B < d.length && _ < b.length; B++) {
            const Y = d[B],
              N = Math.min(u || 5, b.length - _, 6);
            for (let O = 0; O < N && _ < b.length; O++) {
              const { entry: S, pageCount: $ } = b[_];
              _++;
              let R = $ > 1,
                ie = N > 1 ? (O / (N - 1) - 0.5) * 5 : 0,
                ve = Math.cos(k + Math.PI / 2) * ie,
                ht = Math.sin(k + Math.PI / 2) * ie,
                fe = I + ve,
                xe = J + ht,
                mt = (o - new Date(S.updatedAt).getTime()) / (1e3 * 60 * 60),
                re = Math.max(0, 1 - mt / 168),
                G,
                F;
              if (R) {
                const se = 0.4 + Math.min($ * 0.12, 1);
                F = 1.8;
                const _Be = new _e(),
                  Me = new K(1.2, F, se),
                  we = new D({
                    color: a.color,
                    emissive: new H(a.color),
                    emissiveIntensity: 0.4 + re * 0.5,
                    roughness: 0.4,
                    metalness: 0.3,
                  });
                G = new g(Me, we);
                const le = new K(1.22, F * 0.6, se + 0.02),
                  gt = new D({
                    color: 16766720,
                    emissive: new H(16766720),
                    emissiveIntensity: 0.3,
                    roughness: 0.3,
                    metalness: 0.5,
                  }),
                  Ye = new g(le, gt);
                (Ye.position.y = -F * 0.15), G.add(Ye);
              } else {
                F = 1;
                const se = new K(0.8, F, 0.04),
                  Be = new D({
                    color: 16117984,
                    emissive: new H(a.color),
                    emissiveIntensity: 0.1 + re * 0.15,
                    roughness: 0.9,
                    metalness: 0,
                  });
                G = new g(se, Be);
                const Me = new K(0.15, 0.15, 0.05),
                  we = new D({ color: a.color, emissive: new H(a.color), emissiveIntensity: 0.3 }),
                  le = new g(Me, we);
                le.position.set(0.33, F * 0.42, 0), G.add(le);
              }
              const oe = Y + F / 2 + 0.12;
              G.position.set(fe, oe, xe), (G.rotation.y = k), (G.userData = { entryKey: S.key }), this.scene.add(G);
              const bt = new ue(R ? 1.2 : 0.5, 12, 12),
                _t = new X({
                  color: R ? a.color : 16117984,
                  transparent: !0,
                  opacity: R ? 0.06 + re * 0.1 : 0.02 + re * 0.04,
                }),
                Ee = new g(bt, _t);
              Ee.position.copy(G.position), this.scene.add(Ee);
              const Ce = S.book && $ > 1 ? S.book : S.key,
                Ae = Ce.length > 28 ? `${Ce.slice(0, 26)}..` : Ce,
                yt = R ? `${Ae}  (${$}p)` : Ae,
                ut = R ? 16766720 : 13421772,
                ae = this.createTextSprite(yt, ut, 512, 36, 14);
              ae.position.set(fe, oe + F / 2 + 0.5, xe),
                ae.scale.set(5.5, 0.55, 1),
                this.scene.add(ae),
                this.bookNodes.push({
                  entry: S,
                  mesh: G,
                  glowMesh: Ee,
                  label: ae,
                  position: new U(fe, oe, xe),
                  baseY: oe,
                  pulsePhase: Math.random() * Math.PI * 2,
                });
            }
          }
        }
      }
    }
    createTextSprite(e, t, n, i, o) {
      const d = document.createElement('canvas');
      (d.width = n), (d.height = i);
      const a = d.getContext('2d');
      a.clearRect(0, 0, n, i),
        (a.font = `bold ${o}px 'JetBrains Mono', monospace`),
        (a.textAlign = 'center'),
        (a.textBaseline = 'middle');
      const h = `#${t.toString(16).padStart(6, '0')}`;
      (a.fillStyle = h), a.fillText(e, n / 2, i / 2);
      const y = new et(d);
      y.needsUpdate = !0;
      const f = new te({ map: y, transparent: !0, depthWrite: !1 });
      return new He(f);
    }
    animate(e) {
      if (
        ((this.animationId = requestAnimationFrame((n) => this.animate(n))),
        !this.renderer || !this.scene || !this.camera)
      )
        return;
      const t = e * 0.001;
      if ((this.processMovement(), !this.reducedMotion)) {
        for (const n of this.bookNodes) {
          const i = Math.sin(t * 1.2 + n.pulsePhase) * 0.5 + 0.5,
            o = n.glowMesh.material;
          o.opacity = 0.03 + i * 0.06;
        }
        if (
          (this.centerOrb &&
            ((this.centerOrb.position.y = 4 + Math.sin(t * 0.8) * 0.3),
            (this.centerOrb.rotation.y = t * 0.3),
            (this.centerOrb.rotation.x = Math.sin(t * 0.5) * 0.15)),
          this.centerRing &&
            ((this.centerRing.position.y = 4 + Math.sin(t * 0.8) * 0.3),
            (this.centerRing.rotation.x = Math.PI / 2 + Math.sin(t * 0.6) * 0.4),
            (this.centerRing.rotation.z = t * 0.5)),
          this.stars && this.starTwinklePhases)
        ) {
          const n = this.stars.geometry.attributes.color,
            i = this.starTwinklePhases.length;
          if (Math.floor(t * 60) % 3 === 0) {
            for (let o = 0; o < i; o++) {
              const d = this.starTwinklePhases[o],
                a = 0.5 + 0.5 * Math.sin(t * (0.5 + d * 0.3) + d * 8),
                h = o * 3,
                y = n.array[h],
                f = n.array[h + 1],
                b = n.array[h + 2],
                u = Math.max(y, f, b, 0.01);
              (n.array[h] = (y / u) * a), (n.array[h + 1] = (f / u) * a), (n.array[h + 2] = (b / u) * a);
            }
            n.needsUpdate = !0;
          }
          this.stars.rotation.y = t * 0.008;
        }
        if (this.dustParticles) {
          const n = this.dustParticles.geometry.attributes.position;
          for (let i = 0; i < n.count; i++) {
            let o = n.getY(i);
            (o += 0.003), o > 22 && (o = 1), n.setY(i, o), n.setX(i, n.getX(i) + Math.sin(t + i) * 0.001);
          }
          n.needsUpdate = !0;
        }
      }
      this.renderer.render(this.scene, this.camera), this.drawMinimap();
    }
    processMovement() {
      if (this.paused()) return;
      const e = 0.5,
        t = new U(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw)),
        n = new U(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
      (this.keys.has('w') || this.keys.has('arrowup')) && this.cameraPosition.addScaledVector(t, e),
        (this.keys.has('s') || this.keys.has('arrowdown')) && this.cameraPosition.addScaledVector(t, -e),
        (this.keys.has('a') || this.keys.has('arrowleft')) && this.cameraPosition.addScaledVector(n, -e),
        (this.keys.has('d') || this.keys.has('arrowright')) && this.cameraPosition.addScaledVector(n, e),
        (this.cameraPosition.x = Math.max(-80, Math.min(80, this.cameraPosition.x))),
        (this.cameraPosition.z = Math.max(-80, Math.min(80, this.cameraPosition.z))),
        this.camera.position.copy(this.cameraPosition);
      const i = new U(
        this.cameraPosition.x - Math.sin(this.cameraYaw) * 10,
        this.cameraPosition.y + Math.sin(this.cameraPitch) * 10,
        this.cameraPosition.z - Math.cos(this.cameraYaw) * 10,
      );
      this.camera.lookAt(i);
    }
    drawMinimap() {
      const e = this.minimapRef()?.nativeElement;
      if (!e) return;
      const t = e.getContext('2d');
      if (!t) return;
      const n = e.width,
        i = e.height,
        o = n / 160;
      t.clearRect(0, 0, n, i), (t.fillStyle = 'rgba(5, 5, 10, 0.9)'), t.fillRect(0, 0, n, i);
      for (const b of this.categoryZones) {
        const u = (b.position.x + 80) * o,
          _ = (b.position.z + 80) * o,
          v = `#${b.color.toString(16).padStart(6, '0')}`;
        t.beginPath(),
          t.arc(u, _, 4, 0, Math.PI * 2),
          (t.fillStyle = v),
          (t.globalAlpha = 0.4),
          t.fill(),
          (t.globalAlpha = 1);
      }
      for (const b of this.bookNodes) {
        const u = (b.position.x + 80) * o,
          _ = (b.position.z + 80) * o,
          v = b.entry.category,
          k = `#${st[v].toString(16).padStart(6, '0')}`;
        t.beginPath(), t.arc(u, _, 1.5, 0, Math.PI * 2), (t.fillStyle = k), t.fill();
      }
      const d = (this.cameraPosition.x + 80) * o,
        a = (this.cameraPosition.z + 80) * o,
        h = 8,
        y = d - Math.sin(this.cameraYaw) * h,
        f = a - Math.cos(this.cameraYaw) * h;
      t.beginPath(),
        t.moveTo(d, a),
        t.lineTo(y, f),
        (t.strokeStyle = '#00e5ff'),
        (t.lineWidth = 1.5),
        t.stroke(),
        t.beginPath(),
        t.arc(d, a, 3, 0, Math.PI * 2),
        (t.fillStyle = '#00e5ff'),
        t.fill();
    }
    teleportToZone(e) {
      this.cameraPosition.set(
        e.position.x + Math.cos(e.angle + Math.PI) * 20,
        5,
        e.position.z + Math.sin(e.angle + Math.PI) * 20,
      ),
        (this.cameraYaw = e.angle),
        (this.cameraPitch = -0.05);
    }
    addEventListeners(e) {
      e.addEventListener('mousedown', this.onMouseDown),
        e.addEventListener('mousemove', this.onMouseMove),
        e.addEventListener('mouseup', this.onMouseUp),
        e.addEventListener('mouseleave', this.onMouseUp),
        e.addEventListener('wheel', this.onWheel, { passive: !1 }),
        e.addEventListener('click', this.onClick),
        e.addEventListener('contextmenu', this.onContextMenu),
        e.addEventListener('touchstart', this.onTouchStart, { passive: !1 }),
        e.addEventListener('touchmove', this.onTouchMove, { passive: !1 }),
        e.addEventListener('touchend', this.onTouchEnd),
        document.addEventListener('pointerlockchange', this.onPointerLockChange),
        window.addEventListener('keydown', this.onKeyDown),
        window.addEventListener('keyup', this.onKeyUp);
    }
    removeEventListeners() {
      const e = this.containerRef()?.nativeElement;
      e &&
        (e.removeEventListener('mousedown', this.onMouseDown),
        e.removeEventListener('mousemove', this.onMouseMove),
        e.removeEventListener('mouseup', this.onMouseUp),
        e.removeEventListener('mouseleave', this.onMouseUp),
        e.removeEventListener('wheel', this.onWheel),
        e.removeEventListener('click', this.onClick),
        e.removeEventListener('contextmenu', this.onContextMenu),
        e.removeEventListener('touchstart', this.onTouchStart),
        e.removeEventListener('touchmove', this.onTouchMove),
        e.removeEventListener('touchend', this.onTouchEnd)),
        document.removeEventListener('pointerlockchange', this.onPointerLockChange),
        window.removeEventListener('keydown', this.onKeyDown),
        window.removeEventListener('keyup', this.onKeyUp);
    }
    handleKeyDown(e) {
      if (this.paused()) return;
      const t = e.key.toLowerCase();
      if (t === 'tab') {
        e.preventDefault();
        const n = !this.fpsMode();
        this.fpsMode.set(n);
        const i = this.containerRef()?.nativeElement;
        n && i ? i.requestPointerLock() : !n && document.pointerLockElement && document.exitPointerLock();
        return;
      }
      if (t === 'escape' && this.fpsMode()) {
        this.fpsMode.set(!1), document.pointerLockElement && document.exitPointerLock();
        return;
      }
      this.keys.add(t);
    }
    handleKeyUp(e) {
      this.keys.delete(e.key.toLowerCase());
    }
    handleMouseDown(e) {
      if (!this.paused()) {
        if (e.button === 2) {
          (this.rightDragging = !0), (this.lastMouseX = e.clientX), (this.lastMouseY = e.clientY), e.preventDefault();
          return;
        }
        e.button === 0 &&
          !this.fpsMode() &&
          ((this.isDragging = !0), (this.lastMouseX = e.clientX), (this.lastMouseY = e.clientY));
      }
    }
    handleMouseMove(e) {
      if (!this.paused()) {
        if (this.fpsMode() && document.pointerLockElement) {
          const t = e.movementX ?? 0,
            n = e.movementY ?? 0;
          (this.cameraYaw -= t * 0.002), (this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - n * 0.002)));
        } else if (this.rightDragging || this.isDragging) {
          const t = e.clientX - this.lastMouseX,
            n = e.clientY - this.lastMouseY;
          (this.cameraYaw -= t * 0.003),
            (this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - n * 0.003))),
            (this.lastMouseX = e.clientX),
            (this.lastMouseY = e.clientY);
        }
        !this.fpsMode() && !this.rightDragging && (this.updateMousePosition(e), this.performHoverRaycast());
      }
    }
    handleMouseUp() {
      (this.isDragging = !1), (this.rightDragging = !1);
    }
    handleWheel(e) {
      e.preventDefault(), (this.cameraPosition.y = Math.max(2, Math.min(20, this.cameraPosition.y + e.deltaY * 0.03)));
    }
    handleClick(e) {
      if (!this.camera || !this.scene || this.paused() || Date.now() - this.unpausedAt < 500) return;
      if (
        (this.fpsMode() ? this.mouse.set(0, 0) : this.updateMousePosition(e),
        this.raycaster.setFromCamera(this.mouse, this.camera),
        this.centerOrbHitbox && this.raycaster.intersectObject(this.centerOrbHitbox).length > 0)
      ) {
        this.orbSearch.emit();
        return;
      }
      const t = this.bookNodes.map((i) => i.mesh),
        n = this.raycaster.intersectObjects(t);
      if (n.length > 0) {
        const i = n[0].object.userData.entryKey,
          o = this.bookNodes.find((d) => d.entry.key === i);
        if (o) {
          const d = o.entry.book;
          if (d && this.bookGroups.has(d)) {
            const a = this.bookGroups.get(d);
            if (a.length > 1) {
              this.bookPageSelect.emit({ entry: o.entry, pages: a });
              return;
            }
          }
          this.entrySelect.emit(o.entry);
        }
      }
    }
    handleTouchStart(e) {
      e.touches.length === 1 &&
        ((this.isDragging = !0),
        (this.touchStartX = e.touches[0].clientX),
        (this.touchStartY = e.touches[0].clientY),
        (this.lastMouseX = this.touchStartX),
        (this.lastMouseY = this.touchStartY));
    }
    handleTouchMove(e) {
      if (e.touches.length === 1 && this.isDragging) {
        e.preventDefault();
        const t = e.touches[0].clientX - this.lastMouseX,
          n = e.touches[0].clientY - this.lastMouseY;
        (this.cameraYaw -= t * 0.003),
          (this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - n * 0.003))),
          (this.lastMouseX = e.touches[0].clientX),
          (this.lastMouseY = e.touches[0].clientY);
      }
    }
    handleTouchEnd() {
      this.isDragging = !1;
    }
    updateMousePosition(e) {
      const t = this.containerRef()?.nativeElement;
      if (!t) return;
      const n = t.getBoundingClientRect();
      (this.mouse.x = ((e.clientX - n.left) / n.width) * 2 - 1),
        (this.mouse.y = -((e.clientY - n.top) / n.height) * 2 + 1),
        this.tooltipX.set(e.clientX - n.left + 12),
        this.tooltipY.set(e.clientY - n.top - 24);
    }
    performHoverRaycast() {
      if (!this.camera) return;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const e = this.containerRef()?.nativeElement;
      if (this.centerOrbHitbox) {
        const i = this.raycaster.intersectObject(this.centerOrbHitbox),
          o = this.orbHovered;
        if (
          ((this.orbHovered = i.length > 0),
          this.orbHovered !== o && e && (e.style.cursor = this.orbHovered ? 'pointer' : ''),
          this.orbHovered)
        ) {
          if (this.centerOrb) {
            const d = this.centerOrb.material;
            d.emissiveIntensity = 1.2;
          }
          this.hoveredEntry.set(null);
          return;
        }
        if (this.centerOrb) {
          const d = this.centerOrb.material;
          d.emissiveIntensity = 0.8;
        }
      }
      const t = this.bookNodes.map((i) => i.mesh),
        n = this.raycaster.intersectObjects(t);
      if (n.length > 0) {
        const i = n[0].object.userData.entryKey,
          o = this.bookNodes.find((d) => d.entry.key === i);
        this.hoveredEntry.set(o?.entry ?? null), e && (e.style.cursor = 'pointer');
      } else this.hoveredEntry.set(null), e && (e.style.cursor = '');
    }
    handleResize() {
      const e = this.containerRef()?.nativeElement;
      if (!e || !this.renderer || !this.camera) return;
      const t = e.clientWidth,
        n = e.clientHeight;
      (this.camera.aspect = t / n), this.camera.updateProjectionMatrix(), this.renderer.setSize(t, n);
    }
    cleanup() {
      this.animationId && cancelAnimationFrame(this.animationId),
        document.pointerLockElement && document.exitPointerLock(),
        this.removeEventListeners(),
        this.resizeObserver?.disconnect();
      for (const e of this.bookNodes)
        e.mesh.geometry.dispose(),
          e.mesh.material.dispose(),
          e.glowMesh.geometry.dispose(),
          e.glowMesh.material.dispose(),
          e.label.material instanceof te && e.label.material.map && e.label.material.map.dispose(),
          e.label.material.dispose();
      this.stars && (this.stars.geometry.dispose(), this.stars.material.dispose());
      for (const e of this.zoneRings) e.geometry.dispose(), e.material.dispose();
      for (const e of this.zoneLabels)
        e.material instanceof te && e.material.map && e.material.map.dispose(), e.material.dispose();
      for (const e of this.shelfGroups)
        e.traverse((t) => {
          t instanceof g && (t.geometry.dispose(), t.material.dispose());
        });
      this.scene?.traverse((e) => {
        e instanceof g && (e.geometry?.dispose(), e.material instanceof Je && e.material.dispose()),
          e instanceof He && (e.material.map?.dispose(), e.material.dispose());
      }),
        this.renderer?.dispose(),
        (this.renderer = null),
        (this.scene = null),
        (this.camera = null);
    }
    static \u0275fac = (t) => new (t || r)();
    static \u0275cmp = ce({
      type: r,
      selectors: [['app-library-3d']],
      viewQuery: (t, n) => {
        t & 1 && Ke(n.containerRef, xt, 5)(n.canvasRef, Et, 5)(n.minimapRef, Ct, 5), t & 2 && $e(3);
      },
      inputs: { entries: [1, 'entries'], paused: [1, 'paused'] },
      outputs: { entrySelect: 'entrySelect', bookPageSelect: 'bookPageSelect', orbSearch: 'orbSearch' },
      decls: 15,
      vars: 3,
      consts: [
        ['container', ''],
        ['canvas', ''],
        ['minimap', ''],
        [1, 'lib3d'],
        ['width', '140', 'height', '140', 1, 'lib3d__minimap'],
        [1, 'lib3d__legend'],
        [1, 'lib3d__legend-btn', 3, '--zone-color'],
        [1, 'lib3d__tooltip', 3, 'left', 'top'],
        [1, 'lib3d__mode-badge'],
        [1, 'lib3d__hint'],
        [1, 'lib3d__legend-btn', 3, 'click'],
        [1, 'lib3d__legend-dot'],
        [1, 'lib3d__tooltip'],
        [1, 'lib3d__tooltip-cat'],
      ],
      template: (t, n) => {
        t & 1 &&
          (W(0, 'div', 3, 0),
          Se(2, 'canvas', null, 1)(4, 'canvas', 4, 2),
          W(6, 'div', 5),
          z(7, wt, 3, 3, 'button', 6, Mt),
          Q(),
          C(9, kt, 5, 6, 'div', 7),
          W(10, 'div', 8),
          p(11),
          Q(),
          W(12, 'div', 9),
          C(13, Tt, 1, 0)(14, St, 1, 0),
          Q()()),
          t & 2 &&
            (s(7),
            V(n.categoryZones),
            s(2),
            M(n.hoveredEntry() ? 9 : -1),
            s(2),
            T(n.fpsMode() ? 'WALK MODE' : 'BROWSE MODE'),
            s(2),
            M(n.fpsMode() ? 13 : 14));
      },
      styles: [
        '.lib3d[_ngcontent-%COMP%]{position:relative;width:100%;height:600px;min-height:400px;background:#05050a;border-radius:var(--radius, 6px);border:1px solid var(--border, #1a1a2e);overflow:hidden}canvas[_ngcontent-%COMP%]{display:block;width:100%;height:100%}.lib3d__minimap[_ngcontent-%COMP%]{position:absolute;bottom:12px;right:12px;width:140px;height:140px;border-radius:8px;border:1px solid var(--border-bright, #2a2a3e);background:#05050ad9;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);pointer-events:none}.lib3d__legend[_ngcontent-%COMP%]{position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:4px;z-index:10}.lib3d__legend-btn[_ngcontent-%COMP%]{display:flex;align-items:center;gap:6px;padding:3px 10px;background:#05050ad9;border:1px solid var(--border-bright, #2a2a3e);border-radius:12px;font-size:.65rem;font-weight:600;font-family:inherit;text-transform:uppercase;letter-spacing:.04em;color:var(--text-primary, #e0e0e0);cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);transition:background .15s,border-color .15s}.lib3d__legend-btn[_ngcontent-%COMP%]:hover{background:#141423e6;border-color:var(--zone-color)}.lib3d__legend-dot[_ngcontent-%COMP%]{width:8px;height:8px;border-radius:50%;background:var(--zone-color);box-shadow:0 0 6px var(--zone-color)}.lib3d__tooltip[_ngcontent-%COMP%]{position:absolute;z-index:20;pointer-events:none;padding:4px 10px;background:#05050ae6;border:1px solid var(--border-bright, #2a2a3e);border-radius:6px;font-size:.7rem;color:var(--text-primary, #e0e0e0);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;gap:8px;white-space:nowrap}.lib3d__tooltip-cat[_ngcontent-%COMP%]{font-size:.6rem;text-transform:uppercase;color:var(--text-secondary, #888)}.lib3d__mode-badge[_ngcontent-%COMP%]{position:absolute;top:12px;right:12px;padding:4px 12px;background:#05050ad9;border:1px solid var(--accent-cyan, #00e5ff);border-radius:12px;font-size:.6rem;font-weight:700;font-family:inherit;text-transform:uppercase;letter-spacing:.08em;color:var(--accent-cyan, #00e5ff);pointer-events:none;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);z-index:15}.lib3d__hint[_ngcontent-%COMP%]{position:absolute;bottom:12px;left:12px;font-size:.6rem;color:var(--text-secondary, #666);pointer-events:none}@media(max-width:600px){.lib3d[_ngcontent-%COMP%]{height:450px}.lib3d__minimap[_ngcontent-%COMP%]{width:100px;height:100px}.lib3d__legend[_ngcontent-%COMP%]{gap:2px}.lib3d__legend-btn[_ngcontent-%COMP%]{font-size:.58rem;padding:2px 6px}}',
      ],
      changeDetection: 0,
    });
  };
var dt = (_r, e) => e.key,
  pt = (_r, e) => e.id;
function Rt(r, e) {
  if (r & 1) {
    const t = L();
    l(0, 'button', 11),
      w('click', () => {
        const i = x(t).$implicit,
          o = m(2);
        return E(o.selectCategory(i.key));
      }),
      p(1),
      c();
  }
  if (r & 2) {
    const t = e.$implicit,
      n = m(2);
    pe('library__tab--active', n.activeCategory() === t.key),
      Fe('aria-selected', n.activeCategory() === t.key),
      s(),
      A(' ', t.label, ' ');
  }
}
function Lt(r, _e) {
  r & 1 && (l(0, 'div', 8), p(1, 'Loading library...'), c());
}
function Ht(r, _e) {
  r & 1 && (l(0, 'div', 9), p(1, 'No library entries found.'), c());
}
function Ot(r, _e) {
  if ((r & 1 && (l(0, 'span', 17), p(1), c()), r & 2)) {
    const t = m().$implicit;
    s(), ee('', t.book, ' p.', t.page);
  }
}
function Dt(r, e) {
  if ((r & 1 && (l(0, 'span', 23), p(1), c()), r & 2)) {
    const t = e.$implicit;
    s(), T(t);
  }
}
function It(r, _e) {
  if ((r & 1 && (l(0, 'div', 21), z(1, Dt, 2, 1, 'span', 23, de), c()), r & 2)) {
    const t = m().$implicit;
    s(), V(t.tags);
  }
}
function Gt(r, _e) {
  if ((r & 1 && (l(0, 'div', 22)(1, 'pre', 24), p(2), c()()), r & 2)) {
    const t = m().$implicit;
    s(2), T(t.content);
  }
}
function zt(r, e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 13),
      w('click', () => {
        const i = x(t).$implicit,
          o = m(3);
        return E(o.toggleExpand(i.key));
      }),
      l(1, 'div', 14)(2, 'span', 15),
      p(3),
      c(),
      l(4, 'span', 16),
      p(5),
      c(),
      C(6, Ot, 2, 2, 'span', 17),
      c(),
      l(7, 'div', 18)(8, 'span', 19),
      p(9),
      c(),
      l(10, 'span', 20),
      p(11),
      c()(),
      C(12, It, 3, 0, 'div', 21),
      C(13, Gt, 3, 1, 'div', 22),
      c();
  }
  if (r & 2) {
    const t = e.$implicit,
      n = m(3);
    pe('library__card--expanded', n.expandedKey() === t.key),
      s(2),
      q('background', n.getCategoryColor(t.category))('box-shadow', `0 0 8px ${n.getCategoryColor(t.category)}40`),
      s(),
      A(' ', t.category, ' '),
      s(2),
      T(t.key),
      s(),
      M(t.book ? 6 : -1),
      s(3),
      T(t.authorName),
      s(2),
      T(n.formatDate(t.updatedAt)),
      s(),
      M(t.tags.length > 0 ? 12 : -1),
      s(),
      M(n.expandedKey() === t.key ? 13 : -1);
  }
}
function Vt(r, _e) {
  if ((r & 1 && (l(0, 'div', 10), z(1, zt, 14, 13, 'div', 12, pt), c()), r & 2)) {
    const t = m(2);
    s(), V(t.filteredEntries());
  }
}
function At(r, _e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 4),
      z(1, Rt, 2, 4, 'button', 5, dt),
      c(),
      l(3, 'div', 6)(4, 'input', 7),
      w('input', (i) => {
        x(t);
        const o = m();
        return E(o.onSearch(i));
      }),
      c()(),
      C(5, Lt, 2, 0, 'div', 8)(6, Ht, 2, 0, 'div', 9)(7, Vt, 3, 0, 'div', 10);
  }
  if (r & 2) {
    const t = m();
    s(),
      V(t.categories),
      s(3),
      Z('value', t.searchQuery()),
      s(),
      M(t.loading() ? 5 : t.filteredEntries().length === 0 ? 6 : 7);
  }
}
function Bt(r, e) {
  if (r & 1) {
    const t = L();
    l(0, 'button', 38),
      w('click', () => {
        const i = x(t).$implicit,
          o = m(3);
        return E(o.orbSearchCategory.set(i.key));
      }),
      p(1),
      c();
  }
  if (r & 2) {
    const t = e.$implicit,
      n = m(3);
    pe('library__tab--active', n.orbSearchCategory() === t.key), s(), A(' ', t.label, ' ');
  }
}
function Yt(r, _e) {
  if ((r & 1 && (l(0, 'span', 17), p(1), c()), r & 2)) {
    const t = m().$implicit;
    s(), ee('', t.book, ' p.', t.page);
  }
}
function Nt(r, e) {
  if ((r & 1 && (l(0, 'span', 23), p(1), c()), r & 2)) {
    const t = e.$implicit;
    s(), T(t);
  }
}
function Ft(r, _e) {
  if ((r & 1 && (l(0, 'div', 43), z(1, Nt, 2, 1, 'span', 23, de), c()), r & 2)) {
    const t = m().$implicit;
    s(), V(t.tags.slice(0, 3));
  }
}
function Xt(r, e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 39),
      w('click', () => {
        const i = x(t).$implicit,
          o = m(3);
        return E(o.onSearchResultClick(i));
      }),
      l(1, 'span', 15),
      p(2),
      c(),
      l(3, 'div', 40)(4, 'span', 41),
      p(5),
      c(),
      C(6, Yt, 2, 2, 'span', 17),
      l(7, 'span', 42),
      p(8),
      c()(),
      C(9, Ft, 3, 0, 'div', 43),
      c();
  }
  if (r & 2) {
    const t = e.$implicit,
      n = m(3);
    s(),
      q('background', n.getCategoryColor(t.category))('box-shadow', `0 0 6px ${n.getCategoryColor(t.category)}30`),
      s(),
      A(' ', t.category, ' '),
      s(3),
      T(t.key),
      s(),
      M(t.book ? 6 : -1),
      s(2),
      T(n.getPreview(t.content)),
      s(),
      M(t.tags.length > 0 ? 9 : -1);
  }
}
function Kt(r, _e) {
  r & 1 && (l(0, 'div', 9), p(1, 'No matching entries.'), c());
}
function $t(r, _e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 27),
      w('click', () => {
        x(t);
        const i = m(2);
        return E(i.closeSearch());
      }),
      l(1, 'div', 28),
      w('click', (i) => (x(t), E(i.stopPropagation()))),
      l(2, 'div', 29)(3, 'span', 30),
      p(4, 'Search Library'),
      c(),
      l(5, 'span', 31),
      p(6),
      c(),
      l(7, 'button', 32),
      w('click', () => {
        x(t);
        const i = m(2);
        return E(i.closeSearch());
      }),
      p(8, '\u2715'),
      c()(),
      l(9, 'input', 33),
      w('input', (i) => {
        x(t);
        const o = m(2);
        return E(o.onOrbSearch(i));
      }),
      c(),
      l(10, 'div', 34),
      z(11, Bt, 2, 3, 'button', 35, dt),
      c(),
      l(13, 'div', 36),
      z(14, Xt, 10, 9, 'div', 37, pt),
      C(16, Kt, 2, 0, 'div', 9),
      c()()();
  }
  if (r & 2) {
    const t = m(2);
    s(6),
      A('', t.searchResults().length, ' entries'),
      s(3),
      Z('value', t.orbSearchQuery()),
      s(2),
      V(t.categories),
      s(3),
      V(t.searchResults()),
      s(2),
      M(t.searchResults().length === 0 ? 16 : -1);
  }
}
function Wt(r, _e) {
  if ((r & 1 && (l(0, 'span', 47), p(1), c()), r & 2)) {
    const t = m(3);
    s(), ee(' Page ', t.currentPageIndex() + 1, ' of ', t.bookPages().length, ' ');
  }
}
function Ut(r, _e) {
  r & 1 && (l(0, 'span', 48), p(1, 'Note'), c());
}
function Zt(r, e) {
  if ((r & 1 && (l(0, 'span', 23), p(1), c()), r & 2)) {
    const t = e.$implicit;
    s(), T(t);
  }
}
function Qt(r, _e) {
  if ((r & 1 && (l(0, 'div', 21), z(1, Zt, 2, 1, 'span', 23, de), c()), r & 2)) {
    const t = m(3);
    s(), V(t.selectedEntry().tags);
  }
}
function qt(r, _e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 51)(1, 'button', 52),
      w('click', () => {
        x(t);
        const i = m(3);
        return E(i.prevPage());
      }),
      p(2, ' \u2190 Prev '),
      c(),
      l(3, 'span', 53),
      p(4),
      c(),
      l(5, 'button', 52),
      w('click', () => {
        x(t);
        const i = m(3);
        return E(i.nextPage());
      }),
      p(6, ' Next \u2192 '),
      c()();
  }
  if (r & 2) {
    const t = m(3);
    s(),
      Z('disabled', t.currentPageIndex() === 0),
      s(3),
      A(' ', t.selectedEntry().key, ' '),
      s(),
      Z('disabled', t.currentPageIndex() === t.bookPages().length - 1);
  }
}
function jt(r, _e) {
  if (r & 1) {
    const t = L();
    l(0, 'div', 27),
      w('click', () => {
        x(t);
        const i = m(2);
        return E(i.clearSelection());
      }),
      l(1, 'div', 44),
      w('click', (i) => (x(t), E(i.stopPropagation()))),
      l(2, 'div', 45)(3, 'span', 15),
      p(4),
      c(),
      l(5, 'span', 46),
      p(6),
      c(),
      C(7, Wt, 2, 2, 'span', 47)(8, Ut, 2, 0, 'span', 48),
      l(9, 'button', 32),
      w('click', () => {
        x(t);
        const i = m(2);
        return E(i.clearSelection());
      }),
      p(10, '\u2715'),
      c()(),
      l(11, 'div', 49),
      p(12),
      c(),
      C(13, Qt, 3, 0, 'div', 21),
      l(14, 'pre', 50),
      p(15),
      c(),
      C(16, qt, 7, 3, 'div', 51),
      c()();
  }
  if (r & 2) {
    const t = m(2);
    s(3),
      q('background', t.getCategoryColor(t.selectedEntry().category)),
      s(),
      A(' ', t.selectedEntry().category, ' '),
      s(2),
      T(t.selectedEntry().key),
      s(),
      M(t.bookPages().length > 1 ? 7 : 8),
      s(5),
      ee(' ', t.selectedEntry().authorName, ' \xB7 ', t.formatDate(t.selectedEntry().updatedAt), ' '),
      s(),
      M(t.selectedEntry().tags.length > 0 ? 13 : -1),
      s(2),
      T(t.selectedEntry().content),
      s(),
      M(t.bookPages().length > 1 ? 16 : -1);
  }
}
function Jt(r, _e) {
  if (r & 1) {
    const t = L();
    l(0, 'app-library-3d', 25),
      w('entrySelect', (i) => {
        x(t);
        const o = m();
        return E(o.onEntrySelect(i));
      })('bookPageSelect', (i) => {
        x(t);
        const o = m();
        return E(o.onBookPageSelect(i));
      })('orbSearch', () => {
        x(t);
        const i = m();
        return E(i.openSearch());
      }),
      c(),
      C(1, $t, 17, 3, 'div', 26),
      C(2, jt, 17, 10, 'div', 26);
  }
  if (r & 2) {
    const t = m();
    Z('entries', t.allEntries())('paused', !!t.selectedEntry() || t.showSearch()),
      s(),
      M(t.showSearch() ? 1 : -1),
      s(),
      M(t.selectedEntry() ? 2 : -1);
  }
}
var en = [
    { key: 'all', label: 'All' },
    { key: 'guide', label: 'Guides' },
    { key: 'reference', label: 'Reference' },
    { key: 'decision', label: 'Decisions' },
    { key: 'standard', label: 'Standards' },
    { key: 'runbook', label: 'Runbooks' },
  ],
  tn = { guide: '#00e5ff', reference: '#a78bfa', decision: '#f59e0b', standard: '#10b981', runbook: '#f43f5e' },
  ct = class r {
    libraryService = ke(We);
    viewModeService = ke(Ue);
    categories = en;
    activeCategory = P('all');
    searchQuery = P('');
    expandedKey = P(null);
    selectedEntry = P(null);
    bookPages = P([]);
    currentPageIndex = P(0);
    showSearch = P(!1);
    orbSearchQuery = P('');
    orbSearchCategory = P('all');
    viewMode = this.viewModeService.getMode('library');
    loading = this.libraryService.loading;
    allEntries = this.libraryService.entries;
    searchResults = Pe(() => {
      let e = this.allEntries(),
        t = this.orbSearchCategory();
      t !== 'all' && (e = e.filter((i) => i.category === t));
      const n = this.orbSearchQuery().toLowerCase().trim();
      return (
        n &&
          (e = e.filter(
            (i) =>
              i.key.toLowerCase().includes(n) ||
              i.tags.some((o) => o.toLowerCase().includes(n)) ||
              i.content.toLowerCase().includes(n),
          )),
        [...e].sort((i, o) => new Date(o.updatedAt).getTime() - new Date(i.updatedAt).getTime())
      );
    });
    filteredEntries = Pe(() => {
      let e = this.allEntries(),
        t = this.activeCategory();
      t !== 'all' && (e = e.filter((i) => i.category === t));
      const n = this.searchQuery().toLowerCase().trim();
      return (
        n &&
          (e = e.filter(
            (i) =>
              i.key.toLowerCase().includes(n) ||
              i.tags.some((o) => o.toLowerCase().includes(n)) ||
              i.content.toLowerCase().includes(n),
          )),
        [...e].sort((i, o) => new Date(o.updatedAt).getTime() - new Date(i.updatedAt).getTime())
      );
    });
    onEscKey = (e) => {
      e.key === 'Escape' &&
        (e.preventDefault(), this.selectedEntry() ? this.clearSelection() : this.showSearch() && this.closeSearch());
    };
    ngOnInit() {
      this.libraryService.load({ limit: 200 }), window.addEventListener('keydown', this.onEscKey);
    }
    ngOnDestroy() {
      window.removeEventListener('keydown', this.onEscKey);
    }
    setViewMode(e) {
      this.viewModeService.setMode('library', e);
    }
    selectCategory(e) {
      this.activeCategory.set(e);
    }
    onSearch(e) {
      this.searchQuery.set(e.target.value);
    }
    toggleExpand(e) {
      this.expandedKey.update((t) => (t === e ? null : e));
    }
    onEntrySelect(e) {
      this.selectedEntry.set(e), this.bookPages.set([]), this.currentPageIndex.set(0);
    }
    onBookPageSelect(e) {
      this.bookPages.set(e.pages), this.currentPageIndex.set(0), this.selectedEntry.set(e.pages[0]);
    }
    clearSelection() {
      this.selectedEntry.set(null), this.bookPages.set([]), this.currentPageIndex.set(0);
    }
    prevPage() {
      const e = this.currentPageIndex();
      e > 0 && (this.currentPageIndex.set(e - 1), this.selectedEntry.set(this.bookPages()[e - 1]));
    }
    nextPage() {
      const e = this.currentPageIndex(),
        t = this.bookPages();
      e < t.length - 1 && (this.currentPageIndex.set(e + 1), this.selectedEntry.set(t[e + 1]));
    }
    openSearch() {
      this.showSearch.set(!0), this.orbSearchQuery.set(''), this.orbSearchCategory.set('all');
    }
    closeSearch() {
      this.showSearch.set(!1);
    }
    onOrbSearch(e) {
      this.orbSearchQuery.set(e.target.value);
    }
    onSearchResultClick(e) {
      this.showSearch.set(!1), this.onEntrySelect(e);
    }
    getPreview(e) {
      const t =
        e
          .split(`
`)
          .find((n) => n.trim().length > 0) ?? '';
      return t.length > 80 ? `${t.slice(0, 78)}...` : t;
    }
    getCategoryColor(e) {
      return tn[e] ?? '#888';
    }
    formatDate(e) {
      try {
        return new Date(e).toLocaleDateString(void 0, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return e;
      }
    }
    static \u0275fac = (t) => new (t || r)();
    static \u0275cmp = ce({
      type: r,
      selectors: [['app-library']],
      decls: 7,
      vars: 2,
      consts: [
        [1, 'library'],
        [1, 'library__header'],
        [1, 'library__title'],
        ['ariaLabel', 'Library view mode', 3, 'modeChange', 'mode'],
        ['role', 'tablist', 1, 'library__tabs'],
        ['role', 'tab', 1, 'library__tab', 3, 'library__tab--active'],
        [1, 'library__search-row'],
        ['type', 'text', 'placeholder', 'Search by title or tags...', 1, 'library__search', 3, 'input', 'value'],
        [1, 'library__loading'],
        [1, 'library__empty'],
        [1, 'library__grid'],
        ['role', 'tab', 1, 'library__tab', 3, 'click'],
        [1, 'library__card', 3, 'library__card--expanded'],
        [1, 'library__card', 3, 'click'],
        [1, 'library__card-header'],
        [1, 'library__card-badge'],
        [1, 'library__card-title'],
        [1, 'library__card-book'],
        [1, 'library__card-meta'],
        [1, 'library__card-author'],
        [1, 'library__card-date'],
        [1, 'library__card-tags'],
        [1, 'library__card-content'],
        [1, 'library__card-tag'],
        [1, 'library__card-pre'],
        [3, 'entrySelect', 'bookPageSelect', 'orbSearch', 'entries', 'paused'],
        [1, 'library__overlay'],
        [1, 'library__overlay', 3, 'click'],
        [1, 'library__search-panel', 3, 'click'],
        [1, 'library__search-panel-header'],
        [1, 'library__search-panel-title'],
        [1, 'library__search-panel-count'],
        [1, 'library__overlay-close', 3, 'click'],
        [
          'type',
          'text',
          'placeholder',
          'Search by title, tags, or content...',
          'autofocus',
          '',
          1,
          'library__search',
          'library__search--panel',
          3,
          'input',
          'value',
        ],
        [1, 'library__search-panel-tabs'],
        [1, 'library__tab', 3, 'library__tab--active'],
        [1, 'library__search-results'],
        [1, 'library__search-result'],
        [1, 'library__tab', 3, 'click'],
        [1, 'library__search-result', 3, 'click'],
        [1, 'library__search-result-info'],
        [1, 'library__search-result-title'],
        [1, 'library__search-result-preview'],
        [1, 'library__card-tags', 'library__search-result-tags'],
        [1, 'library__overlay-content', 3, 'click'],
        [1, 'library__overlay-header'],
        [1, 'library__overlay-title'],
        [1, 'library__overlay-page-info'],
        [1, 'library__overlay-type'],
        [1, 'library__overlay-meta'],
        [1, 'library__card-pre', 'library__overlay-pre'],
        [1, 'library__overlay-nav'],
        [1, 'library__overlay-nav-btn', 3, 'click', 'disabled'],
        [1, 'library__overlay-nav-label'],
      ],
      template: (t, n) => {
        t & 1 &&
          (l(0, 'div', 0)(1, 'div', 1)(2, 'h2', 2),
          p(3, 'Library'),
          c(),
          l(4, 'app-view-mode-toggle', 3),
          w('modeChange', (o) => n.setViewMode(o)),
          c()(),
          C(5, At, 8, 2)(6, Jt, 3, 4),
          c()),
          t & 2 && (s(4), Z('mode', n.viewMode()), s(), M(n.viewMode() === 'basic' ? 5 : 6));
      },
      dependencies: [Ze, ge],
      styles: [
        '.library[_ngcontent-%COMP%]{padding:1.5rem;max-width:1200px;margin:0 auto}.library__header[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}.library__title[_ngcontent-%COMP%]{font-size:1.2rem;font-weight:700;color:var(--text-primary, #e0e0e0);margin:0}.library__tabs[_ngcontent-%COMP%]{display:flex;gap:0;margin-bottom:.75rem;background:var(--glass-bg-solid, rgba(20, 21, 30, .9));border:1px solid var(--border-subtle, #1a1a2e);border-radius:6px;overflow-x:auto}.library__tab[_ngcontent-%COMP%]{padding:.4rem .8rem;font-size:.72rem;font-weight:600;font-family:inherit;text-transform:uppercase;letter-spacing:.03em;background:transparent;border:none;color:var(--text-secondary, #888);cursor:pointer;transition:color .15s,background .15s;white-space:nowrap}.library__tab[_ngcontent-%COMP%]:hover{color:var(--text-primary, #e0e0e0);background:var(--bg-hover, rgba(255, 255, 255, .04))}.library__tab--active[_ngcontent-%COMP%]{color:var(--accent-cyan, #00e5ff);background:var(--accent-cyan-subtle, rgba(0, 229, 255, .08))}.library__search-row[_ngcontent-%COMP%]{margin-bottom:.75rem}.library__search[_ngcontent-%COMP%]{width:100%;padding:.5rem .75rem;font-size:.8rem;font-family:inherit;background:var(--input-bg, rgba(15, 15, 25, .8));border:1px solid var(--border-subtle, #1a1a2e);border-radius:6px;color:var(--text-primary, #e0e0e0);outline:none;transition:border-color .15s}.library__search[_ngcontent-%COMP%]:focus{border-color:var(--accent-cyan, #00e5ff)}.library__loading[_ngcontent-%COMP%], .library__empty[_ngcontent-%COMP%]{text-align:center;padding:2rem;color:var(--text-secondary, #888);font-size:.85rem}.library__grid[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:.5rem}.library__card[_ngcontent-%COMP%]{background:var(--card-bg, rgba(15, 15, 25, .7));border:1px solid var(--border-subtle, #1a1a2e);border-radius:8px;padding:.75rem;cursor:pointer;transition:border-color .15s,background .15s}.library__card[_ngcontent-%COMP%]:hover{border-color:var(--border-bright, #2a2a3e);background:var(--card-bg-hover, rgba(20, 20, 35, .8))}.library__card--expanded[_ngcontent-%COMP%]{border-color:var(--accent-cyan-border, rgba(0, 229, 255, .3))}.library__card-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.library__card-badge[_ngcontent-%COMP%]{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#000}.library__card-title[_ngcontent-%COMP%]{font-weight:600;font-size:.85rem;color:var(--text-primary, #e0e0e0)}.library__card-book[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-secondary, #888);background:var(--bg-hover, rgba(255, 255, 255, .04));padding:1px 6px;border-radius:4px}.library__card-meta[_ngcontent-%COMP%]{display:flex;gap:.5rem;margin-top:.25rem;font-size:.7rem;color:var(--text-secondary, #888)}.library__card-tags[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:4px;margin-top:.35rem}.library__card-tag[_ngcontent-%COMP%]{display:inline-block;padding:1px 6px;background:var(--tag-bg, rgba(167, 139, 250, .1));border:1px solid var(--tag-border, rgba(167, 139, 250, .2));border-radius:4px;font-size:.62rem;color:var(--accent-purple, #a78bfa);text-transform:lowercase}.library__card-content[_ngcontent-%COMP%]{margin-top:.5rem;border-top:1px solid var(--border-subtle, #1a1a2e);padding-top:.5rem}.library__card-pre[_ngcontent-%COMP%]{white-space:pre-wrap;word-break:break-word;font-family:JetBrains Mono,Fira Code,monospace;font-size:.75rem;color:var(--text-primary, #e0e0e0);line-height:1.5;margin:0;max-height:400px;overflow-y:auto}.library__overlay[_ngcontent-%COMP%]{position:fixed;inset:0;z-index:100;background:#000000b3;display:flex;align-items:center;justify-content:center;padding:1rem;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}.library__overlay-content[_ngcontent-%COMP%]{background:var(--card-bg, rgba(15, 15, 25, .95));border:1px solid var(--border-bright, #2a2a3e);border-radius:12px;padding:1.25rem;max-width:700px;width:100%;max-height:80vh;overflow-y:auto}.library__overlay-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.library__overlay-title[_ngcontent-%COMP%]{font-weight:700;font-size:1rem;color:var(--text-primary, #e0e0e0);flex:1}.library__overlay-close[_ngcontent-%COMP%]{background:transparent;border:1px solid var(--border-subtle, #1a1a2e);color:var(--text-secondary, #888);font-size:.8rem;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit}.library__overlay-close[_ngcontent-%COMP%]:hover{color:var(--text-primary, #e0e0e0);border-color:var(--border-bright, #2a2a3e)}.library__overlay-meta[_ngcontent-%COMP%]{font-size:.72rem;color:var(--text-secondary, #888);margin-top:.35rem}.library__overlay-pre[_ngcontent-%COMP%]{max-height:50vh}.library__overlay-type[_ngcontent-%COMP%]{font-size:.6rem;text-transform:uppercase;color:var(--text-secondary, #888);background:var(--bg-hover, rgba(255, 255, 255, .04));padding:1px 6px;border-radius:4px}.library__overlay-page-info[_ngcontent-%COMP%]{font-size:.65rem;color:var(--accent-cyan, #00e5ff);font-weight:600}.library__overlay-nav[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border-subtle, #1a1a2e)}.library__overlay-nav-btn[_ngcontent-%COMP%]{padding:.35rem .75rem;font-size:.72rem;font-weight:600;font-family:inherit;background:var(--glass-bg-solid, rgba(20, 21, 30, .9));border:1px solid var(--border-bright, #2a2a3e);border-radius:6px;color:var(--accent-cyan, #00e5ff);cursor:pointer;transition:background .15s,border-color .15s}.library__overlay-nav-btn[_ngcontent-%COMP%]:hover:not(:disabled){background:#00e5ff14;border-color:var(--accent-cyan, #00e5ff)}.library__overlay-nav-btn[_ngcontent-%COMP%]:disabled{opacity:.3;cursor:default}.library__overlay-nav-label[_ngcontent-%COMP%]{font-size:.7rem;color:var(--text-secondary, #888);text-align:center;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.library__search-panel[_ngcontent-%COMP%]{background:var(--card-bg, rgba(10, 10, 20, .97));border:1px solid var(--border-bright, #2a2a3e);border-radius:12px;padding:1rem;max-width:600px;width:100%;max-height:80vh;display:flex;flex-direction:column;gap:.5rem}.library__search-panel-header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem}.library__search-panel-title[_ngcontent-%COMP%]{font-weight:700;font-size:1rem;color:var(--accent-cyan, #00e5ff);flex:1}.library__search-panel-count[_ngcontent-%COMP%]{font-size:.65rem;color:var(--text-secondary, #888)}.library__search--panel[_ngcontent-%COMP%]{margin-bottom:0}.library__search-panel-tabs[_ngcontent-%COMP%]{display:flex;gap:0;background:var(--glass-bg-solid, rgba(20, 21, 30, .9));border:1px solid var(--border-subtle, #1a1a2e);border-radius:6px;overflow-x:auto}.library__search-results[_ngcontent-%COMP%]{display:flex;flex-direction:column;gap:4px;overflow-y:auto;max-height:50vh;padding-right:4px}.library__search-result[_ngcontent-%COMP%]{display:flex;align-items:flex-start;gap:.5rem;padding:.5rem .6rem;background:var(--card-bg, rgba(15, 15, 25, .6));border:1px solid var(--border-subtle, #1a1a2e);border-radius:6px;cursor:pointer;transition:border-color .15s,background .15s}.library__search-result[_ngcontent-%COMP%]:hover{border-color:var(--accent-cyan-border, rgba(0, 229, 255, .3));background:var(--card-bg-hover, rgba(20, 20, 35, .8))}.library__search-result-info[_ngcontent-%COMP%]{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.library__search-result-title[_ngcontent-%COMP%]{font-weight:600;font-size:.8rem;color:var(--text-primary, #e0e0e0)}.library__search-result-preview[_ngcontent-%COMP%]{font-size:.68rem;color:var(--text-secondary, #888);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.library__search-result-tags[_ngcontent-%COMP%]{flex-shrink:0;align-self:center}@media(max-width:600px){.library[_ngcontent-%COMP%], .library__card[_ngcontent-%COMP%]{padding:.5rem}.library__search-panel[_ngcontent-%COMP%]{max-width:100%;padding:.75rem}}',
      ],
      changeDetection: 0,
    });
  };

export { ct as LibraryComponent };
