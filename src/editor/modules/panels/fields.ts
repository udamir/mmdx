// Generic property field (prototype app `field`): one row per style key with label, control and × reset. The
// control shows the item's own value, or the inherited one as placeholder; `set` writes (undefined = inherit).
import { FIELD_DEFS, type FieldOption } from '../../../core/schema/style-fields.js';
import { h } from '../../../ui/h.js';
import type { I18n } from '../../../ui/i18n.js';
import { toHex } from './util.js';

export interface FieldTarget {
  /** The stored value (undefined: inherited). */
  own(key: string): unknown;
  /** Inherited values (placeholders). */
  base: Readonly<Record<string, unknown>>;
  /** Writes a value (undefined removes it). `live`: part of a continuous edit (typing, slider). */
  set(key: string, v: unknown, live: boolean): void;
  /** End of a continuous edit. */
  flush(): void;
  /** Colour value → CSS colour (palette references resolved). */
  resolve(v: unknown): string | undefined;
  /** A picked colour → how it is stored (relative to the theme palette). */
  customColor(hex: string): string;
  /** Several items whose values for the key differ (bulk edit): the control shows "mixed" until it is set. */
  mixed?(key: string): boolean;
}

/** `t(key)`, or the English fallback when the catalog has no entry. */
export const tOr = (i18n: I18n, key: string, fallback: string): string => {
  const s = i18n.t(key);
  return s === key ? fallback : s;
};

const opt = (o: FieldOption): readonly [string, string] => (typeof o === 'string' ? [o, o] : o);

/** Appends the row of field `name` to `host`. */
export function field(i18n: I18n, host: HTMLElement, name: string, target: FieldTarget): HTMLElement | null {
  const def = FIELD_DEFS[name];
  if (!def) return null;
  const key = def.key ?? name;
  const t = i18n.t;
  const labelText = tOr(i18n, `field.${name}`, def.label);
  const has = (): boolean => target.own(key) !== undefined;
  const cur = (): unknown => (has() ? target.own(key) : target.base[key]);
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const mix = !!target.mixed?.(key);
  const mixedText = t('props.mixed');
  const row = h('div', { class: 'f' + (has() ? ' set' : '') + (mix ? ' mixed' : '') });
  const lab = h('label', { for: id }, labelText);
  const ctl = h('div', { class: 'ctl' });
  const clr = h('button', { type: 'button', class: 'clr', title: t('props.resetField'), 'aria-label': `${t('props.resetField')}: ${labelText}` }, '×');
  const set = (v: unknown, live = false): void => {
    const empty = v === undefined || v === null || (v === '' && def.type !== 'select');
    target.set(key, empty ? undefined : v, live);
    row.classList.toggle('set', !empty);
    row.classList.remove('mixed');
  };
  const baseV = target.base[key];

  if (def.type === 'color') {
    // the text shows what is stored ("@lime", "#hex~lime", "#hex"); the picker shows the colour in the active theme
    const c = h('input', { type: 'color', value: toHex(target.resolve(cur())), 'aria-label': labelText });
    const tx = h('input', { type: 'text', id, value: has() && !mix ? String(target.own(key)) : '', placeholder: mix ? mixedText : baseV != null ? String(baseV) : '' });
    c.addEventListener('change', () => {
      const v = target.customColor(c.value);
      tx.value = v;
      set(v);
    });
    tx.addEventListener('change', () => {
      c.value = toHex(target.resolve(tx.value || baseV));
      set(tx.value.trim() || undefined);
    });
    ctl.append(c, tx);
    clr.addEventListener('click', () => {
      tx.value = '';
      c.value = toHex(target.resolve(baseV));
      set(undefined);
    });
  } else if (def.type === 'number') {
    const n = h('input', { type: 'number', id, step: String(def.step ?? 1), value: has() && !mix ? String(target.own(key)) : '',
      placeholder: mix ? mixedText : typeof baseV === 'number' ? String(Math.round(baseV * 10) / 10) : '' });
    n.addEventListener('input', () => set(n.value === '' ? undefined : Number(n.value), true));
    n.addEventListener('change', () => target.flush());
    n.addEventListener('blur', () => target.flush());
    ctl.append(n);
    clr.addEventListener('click', () => {
      n.value = '';
      set(undefined);
    });
  } else if (def.type === 'range') {
    const min = def.min ?? 0, max = def.max ?? 1;
    const r = h('input', { type: 'range', id, min: String(min), max: String(max), step: String(def.step ?? 0.01) });
    const v0 = cur();
    r.value = String(typeof v0 === 'number' ? v0 : (min + max) / 2);
    const note = mix ? h('span', { class: 'mixed-note' }, mixedText) : null;
    r.addEventListener('input', () => {
      note?.remove();
      set(Number(r.value), true);
    });
    r.addEventListener('change', () => target.flush());
    ctl.append(r);
    if (note) ctl.append(note);
    clr.addEventListener('click', () => {
      r.value = String(typeof baseV === 'number' ? baseV : (min + max) / 2);
      set(undefined);
    });
  } else if (def.type === 'toggle') {
    // on / off switch; matching what is inherited stores nothing
    const cb = h('input', { type: 'checkbox', id, class: 'toggle', role: 'switch' });
    cb.checked = !!cur();
    cb.indeterminate = mix;
    if (mix) cb.setAttribute('aria-checked', 'mixed');
    cb.addEventListener('change', () => {
      cb.removeAttribute('aria-checked');
      set(cb.checked === !!baseV ? undefined : cb.checked);
    });
    ctl.append(cb);
    clr.addEventListener('click', () => {
      cb.checked = !!baseV;
      set(undefined);
    });
  } else {
    const s = h('select', { id });
    const opts: (readonly [string, string])[] = def.type === 'bool' ? [['true', t('props.yes')], ['false', t('props.no')]] : (def.options ?? []).map(opt);
    const shown = baseV === undefined ? '' : def.type === 'bool' ? ` (${baseV ? t('props.yes') : t('props.no')})` : ` (${opts.find((o) => o[0] === String(baseV))?.[1] ?? String(baseV)})`;
    s.append(new Option(`${t('props.inherit')}${shown}`, '__inherit'));
    for (const [v, l] of opts) s.append(new Option(tOr(i18n, `option.${name}.${v}`, l), v));
    s.value = has() ? String(target.own(key)) : '__inherit';
    if (mix) {
      const m = new Option(mixedText, '__mixed');
      m.disabled = true;
      s.prepend(m);
      s.value = '__mixed';
    }
    s.addEventListener('change', () => {
      s.querySelector('option[value="__mixed"]')?.remove();
      row.classList.remove('mixed');
      if (s.value === '__inherit') {
        set(undefined);
        return;
      }
      let v: unknown = s.value;
      if (def.type === 'bool') v = s.value === 'true';
      else if (name === 'stack') v = s.value === 'true' ? true : s.value === 'false' ? false : Number(s.value);
      else if (name === 'fontWeight' || name === 'titleWeight') v = Number(s.value);
      target.set(key, v, false);
      row.classList.add('set');
    });
    ctl.append(s);
    clr.addEventListener('click', () => {
      s.value = '__inherit';
      set(undefined);
    });
  }
  row.append(lab, ctl, clr);
  host.append(row);
  return row;
}
