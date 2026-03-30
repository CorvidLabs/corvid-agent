import { i as $, q as A, e as G, s as J, b as q, d as R, c as T, g as U, j as W } from './chunk-AF4UDQOX.js';
import { a as H } from './chunk-ZEJIPHXJ.js';
import './chunk-ZSTU6MUH.js';
import { g as L } from './chunk-G7DVZDMF.js';
import './chunk-GH246MXO.js';
import './chunk-D6WCRQHB.js';
import './chunk-GEI46CGR.js';
import {
  ib as _,
  Ob as a,
  hb as B,
  T as b,
  zb as C,
  pb as c,
  _a as D,
  vb as E,
  ra as F,
  Ab as f,
  Bb as g,
  Z as h,
  lb as I,
  Na as i,
  ic as j,
  ob as k,
  qb as l,
  wb as M,
  tb as m,
  hc as N,
  ja as p,
  Qb as S,
  sb as s,
  jb as u,
  mb as V,
  Y as v,
  rb as w,
  Pb as y,
  nb as z,
} from './chunk-LF4EWAJA.js';

function Y(n, _r) {
  n & 1 && (s(0, 'div', 5), a(1, 'Loading\u2026'), m());
}
function Z(n, _r) {
  if ((n & 1 && (s(0, 'div', 6), a(1), m()), n & 2)) {
    const t = g();
    i(), y(t.error());
  }
}
function ee(n, r) {
  if (n & 1) {
    const t = E();
    s(0, 'li', 16),
      f('click', () => {
        const o = v(t).$implicit,
          d = g(2);
        return h(d.navigateInto(o));
      })('keydown.enter', () => {
        const o = v(t).$implicit,
          d = g(2);
        return h(d.navigateInto(o));
      }),
      s(1, 'span', 17),
      a(2, '\u{1F4C1}'),
      m(),
      a(3),
      m();
  }
  if (n & 2) {
    const t = r.$implicit;
    i(3), S(' ', t, ' ');
  }
}
function te(n, _r) {
  n & 1 && (s(0, 'li', 15), a(1, 'No subdirectories'), m());
}
function re(n, _r) {
  if ((n & 1 && (s(0, 'ul', 7), V(1, ee, 4, 1, 'li', 14, I), _(3, te, 2, 0, 'li', 15), m()), n & 2)) {
    const t = g();
    i(), z(t.dirs()), i(2), u(t.dirs().length === 0 ? 3 : -1);
  }
}
var O = class n {
  initialPath = j('');
  selected = N();
  cancelled = N();
  currentPath = p('');
  parentPath = p(null);
  dirs = p([]);
  loading = p(!1);
  error = p('');
  showHidden = p(!1);
  elRef = b(F);
  ngOnInit() {
    this.loadDir(this.initialPath() || '');
  }
  async loadDir(r) {
    this.loading.set(!0), this.error.set('');
    try {
      const t = new URLSearchParams();
      r && t.set('path', r), this.showHidden() && t.set('showHidden', '1');
      const e = await fetch(`/api/browse-dirs?${t}`);
      if (!e.ok) {
        const d = await e.json();
        this.error.set(d.error ?? 'Failed to load directory');
        return;
      }
      const o = await e.json();
      this.currentPath.set(o.current), this.parentPath.set(o.parent), this.dirs.set(o.dirs);
    } catch {
      this.error.set('Could not reach server');
    } finally {
      this.loading.set(!1);
    }
  }
  navigateInto(r) {
    const t = this.currentPath(),
      e = t.endsWith('/') ? t + r : `${t}/${r}`;
    this.loadDir(e);
  }
  navigateUp() {
    const r = this.parentPath();
    r && this.loadDir(r);
  }
  toggleHidden() {
    this.showHidden.update((r) => !r), this.loadDir(this.currentPath());
  }
  onSelect() {
    this.selected.emit(this.currentPath());
  }
  onCancel() {
    this.cancelled.emit();
  }
  onBackdropClick(r) {
    r.target === r.currentTarget && this.onCancel();
  }
  static \u0275fac = (t) => new (t || n)();
  static \u0275cmp = D({
    type: n,
    selectors: [['app-dir-browser']],
    inputs: { initialPath: [1, 'initialPath'] },
    outputs: { selected: 'selected', cancelled: 'cancelled' },
    decls: 19,
    vars: 7,
    consts: [
      [1, 'overlay', 3, 'click', 'keydown.escape'],
      ['role', 'dialog', 'aria-label', 'Browse directories', 1, 'browser'],
      [1, 'browser__header'],
      [1, 'browser__path', 3, 'title'],
      ['aria-label', 'Go to parent directory', 1, 'browser__up', 'btn', 'btn--icon', 3, 'click', 'disabled'],
      [1, 'browser__loading'],
      [1, 'browser__error'],
      ['role', 'listbox', 'aria-label', 'Directories', 1, 'browser__list'],
      [1, 'browser__actions'],
      [1, 'browser__toggle'],
      ['type', 'checkbox', 3, 'change', 'checked'],
      [1, 'browser__buttons'],
      [1, 'btn', 'btn--primary', 3, 'click'],
      [1, 'btn', 'btn--secondary', 3, 'click'],
      ['role', 'option', 'tabindex', '0', 1, 'browser__item'],
      [1, 'browser__empty'],
      ['role', 'option', 'tabindex', '0', 1, 'browser__item', 3, 'click', 'keydown.enter'],
      [1, 'browser__icon'],
    ],
    template: (t, e) => {
      t & 1 &&
        (s(0, 'div', 0),
        f('click', (d) => e.onBackdropClick(d))('keydown.escape', () => e.onCancel()),
        s(1, 'div', 1)(2, 'div', 2)(3, 'span', 3),
        a(4),
        m(),
        s(5, 'button', 4),
        f('click', () => e.navigateUp()),
        a(6, ' \u2191 Up '),
        m()(),
        _(7, Y, 2, 0, 'div', 5),
        _(8, Z, 2, 1, 'div', 6),
        _(9, re, 4, 1, 'ul', 7),
        s(10, 'div', 8)(11, 'label', 9)(12, 'input', 10),
        f('change', () => e.toggleHidden()),
        m(),
        a(13, ' Show hidden '),
        m(),
        s(14, 'div', 11)(15, 'button', 12),
        f('click', () => e.onSelect()),
        a(16, 'Select'),
        m(),
        s(17, 'button', 13),
        f('click', () => e.onCancel()),
        a(18, 'Cancel'),
        m()()()()()),
        t & 2 &&
          (i(3),
          M('title', e.currentPath()),
          i(),
          y(e.currentPath()),
          i(),
          M('disabled', !e.parentPath()),
          i(2),
          u(e.loading() ? 7 : -1),
          i(),
          u(e.error() ? 8 : -1),
          i(),
          u(!e.loading() && !e.error() ? 9 : -1),
          i(3),
          M('checked', e.showHidden()));
    },
    styles: [
      '.overlay[_ngcontent-%COMP%]{position:fixed;inset:0;z-index:1000;background:var(--overlay-heavy);display:flex;align-items:center;justify-content:center}.browser[_ngcontent-%COMP%]{width:540px;max-height:70vh;background:var(--bg-surface);border:1px solid var(--border-bright);border-radius:var(--radius-lg);display:flex;flex-direction:column;box-shadow:0 8px 32px var(--shadow-deep)}.browser__header[_ngcontent-%COMP%]{display:flex;align-items:center;gap:.5rem;padding:.75rem 1rem;border-bottom:1px solid var(--border)}.browser__path[_ngcontent-%COMP%]{flex:1;font-size:.8rem;color:var(--accent-cyan);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}.btn--icon[_ngcontent-%COMP%]{padding:.25rem .5rem;font-size:.75rem;background:transparent;color:var(--text-secondary);border:1px solid var(--border-bright);border-radius:var(--radius);cursor:pointer;font-family:inherit}.btn--icon[_ngcontent-%COMP%]:hover:not(:disabled){background:var(--bg-hover);color:var(--text-primary)}.btn--icon[_ngcontent-%COMP%]:disabled{opacity:.3;cursor:not-allowed}.browser__list[_ngcontent-%COMP%]{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;min-height:200px;max-height:400px}.browser__item[_ngcontent-%COMP%]{padding:.4rem 1rem;font-size:.8rem;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:.5rem}.browser__item[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}.browser__item[_ngcontent-%COMP%]:focus-visible{background:var(--accent-cyan-dim);outline:none}.browser__icon[_ngcontent-%COMP%]{font-size:.9rem}.browser__empty[_ngcontent-%COMP%]{padding:1.5rem 1rem;text-align:center;color:var(--text-tertiary);font-size:.8rem}.browser__loading[_ngcontent-%COMP%], .browser__error[_ngcontent-%COMP%]{padding:1.5rem 1rem;text-align:center;font-size:.8rem}.browser__loading[_ngcontent-%COMP%]{color:var(--text-secondary)}.browser__error[_ngcontent-%COMP%]{color:var(--accent-red)}.browser__actions[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-top:1px solid var(--border)}.browser__toggle[_ngcontent-%COMP%]{font-size:.75rem;color:var(--text-secondary);display:flex;align-items:center;gap:.35rem;cursor:pointer}.browser__toggle[_ngcontent-%COMP%]   input[_ngcontent-%COMP%]{accent-color:var(--accent-cyan)}.browser__buttons[_ngcontent-%COMP%]{display:flex;gap:.5rem}.btn[_ngcontent-%COMP%]{padding:.4rem .75rem;border-radius:var(--radius);font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;text-transform:uppercase;letter-spacing:.05em;transition:background .15s,box-shadow .15s}.btn--primary[_ngcontent-%COMP%]{background:transparent;color:var(--accent-cyan);border-color:var(--accent-cyan)}.btn--primary[_ngcontent-%COMP%]:hover{background:var(--accent-cyan-dim);box-shadow:var(--glow-cyan)}.btn--secondary[_ngcontent-%COMP%]{background:transparent;color:var(--text-secondary);border-color:var(--border-bright)}.btn--secondary[_ngcontent-%COMP%]:hover{background:var(--bg-hover)}',
    ],
    changeDetection: 0,
  });
};
function ne(n, _r) {
  n & 1 && (c(0, 'span', 5), a(1, 'Project name is required.'), l());
}
function oe(n, _r) {
  n & 1 && (c(0, 'span', 10), a(1, 'Working directory is required.'), l());
}
function ie(n, _r) {
  if (n & 1) {
    const t = E();
    c(0, 'app-dir-browser', 18),
      C('selected', (o) => {
        v(t);
        const d = g();
        return h(d.onDirSelected(o));
      })('cancelled', () => {
        v(t);
        const o = g();
        return h(o.showBrowser.set(!1));
      }),
      l();
  }
  if (n & 2) {
    const t = g();
    k('initialPath', t.form.controls.workingDir.value);
  }
}
var K = class n {
  fb = b(A);
  projectService = b(H);
  router = b(L);
  id = j(void 0);
  saving = p(!1);
  showBrowser = p(!1);
  form = this.fb.nonNullable.group({
    name: ['', T.required],
    workingDir: ['', T.required],
    description: [''],
    claudeMd: [''],
  });
  async ngOnInit() {
    const r = this.id();
    if (r) {
      const t = await this.projectService.getProject(r);
      this.form.patchValue({
        name: t.name,
        workingDir: t.workingDir,
        description: t.description,
        claudeMd: t.claudeMd,
      });
    }
  }
  async onSubmit() {
    if (!this.form.invalid) {
      this.saving.set(!0);
      try {
        const r = this.form.getRawValue(),
          t = this.id();
        if (t) await this.projectService.updateProject(t, r), this.router.navigate(['/agents/projects', t]);
        else {
          const e = await this.projectService.createProject(r);
          this.router.navigate(['/agents/projects', e.id]);
        }
      } finally {
        this.saving.set(!1);
      }
    }
  }
  onDirSelected(r) {
    this.form.controls.workingDir.setValue(r), this.showBrowser.set(!1);
  }
  onCancel() {
    this.router.navigate(['/agents/projects']);
  }
  static \u0275fac = (t) => new (t || n)();
  static \u0275cmp = D({
    type: n,
    selectors: [['app-project-form']],
    inputs: { id: [1, 'id'] },
    decls: 31,
    vars: 9,
    consts: [
      [1, 'page'],
      [1, 'form', 3, 'ngSubmit', 'formGroup'],
      [1, 'form__field'],
      ['for', 'name', 1, 'form__label'],
      ['id', 'name', 'formControlName', 'name', 1, 'form__input'],
      ['id', 'name-error', 'role', 'alert', 1, 'form__error'],
      ['for', 'workingDir', 1, 'form__label'],
      [1, 'form__row'],
      ['id', 'workingDir', 'formControlName', 'workingDir', 'placeholder', '/path/to/project', 1, 'form__input'],
      ['type', 'button', 1, 'btn', 'btn--secondary', 3, 'click'],
      ['id', 'workingDir-error', 'role', 'alert', 1, 'form__error'],
      [3, 'initialPath'],
      ['for', 'description', 1, 'form__label'],
      ['id', 'description', 'formControlName', 'description', 'rows', '3', 1, 'form__input', 'form__textarea'],
      ['for', 'claudeMd', 1, 'form__label'],
      [
        'id',
        'claudeMd',
        'formControlName',
        'claudeMd',
        'rows',
        '6',
        'placeholder',
        'Project instructions for Claude...',
        1,
        'form__input',
        'form__textarea',
      ],
      [1, 'form__actions'],
      ['type', 'submit', 1, 'btn', 'btn--primary', 3, 'disabled'],
      [3, 'selected', 'cancelled', 'initialPath'],
    ],
    template: (t, e) => {
      if (
        (t & 1 &&
          (c(0, 'div', 0)(1, 'h2'),
          a(2),
          l(),
          c(3, 'form', 1),
          C('ngSubmit', () => e.onSubmit()),
          c(4, 'div', 2)(5, 'label', 3),
          a(6, 'Name'),
          l(),
          w(7, 'input', 4),
          _(8, ne, 2, 0, 'span', 5),
          l(),
          c(9, 'div', 2)(10, 'label', 6),
          a(11, 'Working Directory'),
          l(),
          c(12, 'div', 7),
          w(13, 'input', 8),
          c(14, 'button', 9),
          C('click', () => e.showBrowser.set(!0)),
          a(15, 'Browse'),
          l()(),
          _(16, oe, 2, 0, 'span', 10),
          l(),
          _(17, ie, 1, 1, 'app-dir-browser', 11),
          c(18, 'div', 2)(19, 'label', 12),
          a(20, 'Description'),
          l(),
          w(21, 'textarea', 13),
          l(),
          c(22, 'div', 2)(23, 'label', 14),
          a(24, 'CLAUDE.md Content'),
          l(),
          w(25, 'textarea', 15),
          l(),
          c(26, 'div', 16)(27, 'button', 17),
          a(28),
          l(),
          c(29, 'button', 9),
          C('click', () => e.onCancel()),
          a(30, 'Cancel'),
          l()()()()),
        t & 2)
      ) {
        let o, d, P, x;
        i(2),
          y(e.id() ? 'Edit Project' : 'New Project'),
          i(),
          k('formGroup', e.form),
          i(4),
          B(
            'aria-describedby',
            (o = e.form.get('name')) != null && o.invalid && (o = e.form.get('name')) != null && o.touched
              ? 'name-error'
              : null,
          ),
          i(),
          u(
            (d = e.form.get('name')) != null && d.hasError('required') && (d = e.form.get('name')) != null && d.touched
              ? 8
              : -1,
          ),
          i(5),
          B(
            'aria-describedby',
            (P = e.form.get('workingDir')) != null && P.invalid && (P = e.form.get('workingDir')) != null && P.touched
              ? 'workingDir-error'
              : null,
          ),
          i(3),
          u(
            (x = e.form.get('workingDir')) != null &&
              x.hasError('required') &&
              (x = e.form.get('workingDir')) != null &&
              x.touched
              ? 16
              : -1,
          ),
          i(),
          u(e.showBrowser() ? 17 : -1),
          i(10),
          k('disabled', e.form.invalid || e.saving()),
          i(),
          S(' ', e.saving() ? 'Saving...' : 'Save', ' ');
      }
    },
    dependencies: [J, U, q, R, G, W, $, O],
    styles: [
      '.page[_ngcontent-%COMP%]{padding:1.5rem;max-width:640px}.page[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin:0 0 1.5rem;color:var(--text-primary)}',
    ],
    changeDetection: 0,
  });
};

export { K as ProjectFormComponent };
