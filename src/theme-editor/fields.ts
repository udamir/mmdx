// Field rows: one property of the theme with its control (colour chip, number, text, range, switch, select) and, where
// the value can be inherited, a reset. Rows carry `data-dirty` = their path, which the unsaved-change marks and the
// validation errors use.
import { optionValue } from '../core/schema/style-fields.js';
import { isColorLiteral } from '../core/validate.js';
import { openColorPicker } from '../ui/blocks/color-picker.js';
import { h } from '../ui/kit/h.js';
import type { Env } from './env.js';
import type { LocalField } from './types.js';
import { isHex } from './util.js';

/** Controls a read-only editor disables. */
const EDITING = 'input, select, textarea, .te-reset, .te-dot-x, .te-tile-del, .te-tile-add, .te-chip, .te-seg';

export function disableIfReadOnly(env: Env, box: Element): void {
  if (env.canEdit()) return;
  box.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(EDITING).forEach((e) => {
    e.disabled = true;
  });
}

/** The validation errors: the list over the cards, and each field's own message. */
export function renderErrors(env: Env, root: Element = env.dlg): void {
  const errors = env.draft.errors.peek();
  const box = env.main.querySelector<HTMLElement>('.te-errors');
  if (box && root.contains(box)) {
    box.replaceChildren();
    box.hidden = !errors.size;
    if (errors.size)
      box.append(h('b', null, env.t('te.saveErrors')), h('ul', null, ...[...errors].map(([p, m]) => h('li', null, h('code', null, p), ` — ${m}`))));
  }
  root.querySelectorAll<HTMLElement>('.te-f[data-dirty]').forEach((row) => {
    const msg = errors.get(row.dataset['dirty'] ?? '');
    row.classList.toggle('invalid', !!msg);
    row.querySelector('.te-ferr')?.remove();
    if (msg) row.querySelector('.te-ctl')?.append(h('span', { class: 'te-ferr', role: 'alert' }, msg));
  });
}

/**
 * One property. In the baseline every value is the theme's own; in a theme, an empty field inherits.
 * `presetOfBase`: a baseline preset field, which inherits from the baseline item style.
 */
export function fieldRow(env: Env, host: HTMLElement, def: LocalField, path: readonly string[], inherited: unknown, presetOfBase = false): HTMLElement {
  const { t, draft } = env;
  const row = h('div', { class: 'te-f', dataset: { dirty: path.join('.') } });
  const own = (): unknown => draft.get(path);
  const inheritable = !draft.isBase() || presetOfBase;
  row.classList.toggle('set', inheritable && own() !== undefined);
  const id = `te-f-${env.ctx.idPrefix}${path.join('-').replace(/[^\w-]/g, '_')}`;
  row.append(h('label', { for: id }, def.label));
  const ctl = h('div', { class: 'te-ctl' });
  const set = (v: unknown): void => {
    draft.set(path, v);
    row.classList.toggle('set', inheritable && v !== undefined);
  };
  const cur = (): unknown => own() ?? inherited;
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  if (def.type === 'color') colorControl(env, ctl, id, def.label, cur, own, set, inheritable);
  else if (def.type === 'number' || def.type === 'text') {
    const n = h('input', { id, type: def.type === 'number' ? 'number' : 'text' });
    if (def.step) n.step = String(def.step);
    n.value = str(own());
    n.placeholder = inherited !== undefined && inherited !== null ? String(inherited) : '';
    n.addEventListener('change', () => set(n.value === '' ? undefined : def.type === 'number' ? Number(n.value) : n.value));
    ctl.append(n);
  } else if (def.type === 'range') {
    const r = h('input', { id, type: 'range', min: String(def.min ?? 0), max: String(def.max ?? 1), step: String(def.step ?? 0.01) });
    const c = Number(cur());
    r.value = String(Number.isFinite(c) && cur() !== undefined ? c : ((def.min ?? 0) + (def.max ?? 1)) / 2);
    r.addEventListener('input', () => set(Number(r.value)));
    r.addEventListener('change', () => draft.endGroup());
    ctl.append(r);
  } else if (def.type === 'bool' || def.type === 'toggle') {
    // a switch showing the effective value; dimmed while it is inherited
    const sw = h('input', { id, class: 'toggle', type: 'checkbox', role: 'switch' });
    sw.checked = !!cur();
    const inh = inheritable && own() === undefined;
    sw.classList.toggle('inherited', inh);
    sw.title = inh ? t('te.inheritedV', { v: inherited ? t('te.yes') : t('te.no') }) : '';
    sw.addEventListener('change', () => {
      set(sw.checked);
      sw.classList.remove('inherited');
      sw.title = '';
    });
    ctl.append(sw);
  } else {
    const s = h('select', { id });
    const opts = (def.options ?? []).map((o): readonly [string, string] => (typeof o === 'string' ? [o, o] : o));
    const label = (v: unknown): string => opts.find((o) => o[0] === String(v))?.[1] ?? String(v);
    if (inheritable) s.append(new Option(inherited !== undefined ? t('te.inheritOptV', { v: label(inherited) }) : t('te.inheritOpt'), '__inherit'));
    for (const [v, l] of opts) s.append(new Option(l, v));
    s.value = own() !== undefined ? String(own()) : inheritable ? '__inherit' : String(inherited ?? optionValue(opts[0] ?? ''));
    s.addEventListener('change', () => {
      if (s.value === '__inherit') return set(undefined);
      // stored as the theme files store them: booleans and numbers, not their text
      set(s.value === 'true' ? true : s.value === 'false' ? false : /^\d+(\.\d+)?$/.test(s.value) ? Number(s.value) : s.value);
    });
    ctl.append(s);
  }
  if (inheritable) {
    const r = h('button', { type: 'button', class: 'te-reset', title: t('te.inherit'), 'aria-label': `${t('te.inherit')}: ${def.label}` }, '×');
    r.addEventListener('click', () => {
      set(undefined);
      const fresh = h('div');
      const next = fieldRow(env, fresh, def, path, inherited, presetOfBase);
      row.replaceWith(next);
      env.decorate(next);
    });
    ctl.append(r);
  }
  row.append(ctl);
  host.append(row);
  return row;
}

/** Colour: a palette colour (stored "@name"), a literal colour, none / transparent; the chip opens a ColorPicker. */
function colorControl(env: Env, ctl: HTMLElement, id: string, field: string, cur: () => unknown, own: () => unknown, set: (v: unknown) => void, inheritable: boolean): void {
  const { t, draft } = env;
  const label = t('te.chooseColor', { field });
  const chip = h('button', { id, type: 'button', class: 'te-chip', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': label });
  const text = h('span', { class: 'te-chip-label' });
  const paint = (): void => {
    const v = cur();
    const c = draft.show(v);
    if (!v || v === 'none' || v === 'transparent' || !isColorLiteral(c)) chip.style.background = 'repeating-linear-gradient(45deg,#fff 0 4px,#eee 4px 8px)';
    else chip.style.background = c;
    text.textContent = v === undefined || v === null ? '—' : typeof v === 'string' && v[0] === '@' ? v.slice(1) : String(v);
    text.classList.toggle('inherited', inheritable && own() === undefined);
  };
  chip.addEventListener('click', (ev) => {
    ev.preventDefault();
    const shown = draft.show(cur());
    openColorPicker({
      popovers: env.pops, opener: chip, label, class: 'te-pop',
      colors: Object.entries(draft.palette()).map(([name, value]) => ({ name, value })),
      value: cur(), custom: isHex(shown) ? shown : '#888888',
      paletteLabel: t('te.paletteTitle'), customLabel: t('te.custom'), noneLabel: t('te.none'),
      onPick: (v) => {
        set(v);
        paint();
      },
    });
  });
  paint();
  ctl.append(chip, text);
}
