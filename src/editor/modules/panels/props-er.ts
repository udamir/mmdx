// The ER sections of the Properties panel (A.6 rows 54–56; prototype app `attrEditor`, `relEditor`): a table's
// attributes as editable lines with a style popup each (bold / italic / underline, font, size, colour, presets), and a
// relationship's cardinalities and identifying flag. Every change is one history step.
// The attribute style popup duplicates the table editor's presets (er-table `renderPresets`) as its own markup.
import type { AttrHighlight, ItemMeta } from '../../../core/meta/types.js';
import type { Cardinality, ErAttribute } from '../../../core/model.js';
import { attrText, updateEntity, updateRel } from '../../../core/ops/er.js';
import { cloneMeta, tidy } from '../../../core/ops/meta-util.js';
import { parseAttrLine } from '../../../core/parse/er.js';
import { ATTR_PRESETS, attrLook } from '../../../core/render/er.js';
import { FONTS } from '../../../ui/fonts.js';
import { h } from '../../../ui/h.js';
import { applyMeta } from '../../ops/doc.js';
import { writeAttrLook } from '../er-table/look.js';
import { row, sect, type PanelCtx } from './inspectors/shared.js';

/**
 * The table's attributes, one line each: the Mermaid attribute as text (`type name PK (comment)`, as in the canvas's
 * row editing; empty deletes it) and a style button whose popup sets the attribute's look (metadata highlights).
 */
export function attrEditor(p: PanelCtx, host: HTMLElement, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const M = core.model;
  if (M.type !== 'er') return;
  const e = M.entities.get(id);
  if (!e) return;
  sect(host, t('props.attributes', { n: e.attrs.length }));
  type Row = ErAttribute & { orig: string | null };
  const rows: Row[] = e.attrs.map((a) => ({ ...a, keys: [...a.keys], orig: a.name }));
  const hl = (): NonNullable<ItemMeta['attrs']> => core.getM('entity', id).attrs ?? {};
  const grid = h('div', { class: 'attr-grid', role: 'list', 'aria-label': t('props.attributesLabel') });
  const save = (): void => {
    // highlights are keyed by attribute name: follow renames, drop removed rows
    const meta = cloneMeta(core.meta);
    const m = meta.entities?.[id];
    if (m?.attrs) {
      const next: NonNullable<ItemMeta['attrs']> = {};
      for (const r of rows) if (r.name && r.orig && m.attrs[r.orig]) next[r.name] = m.attrs[r.orig]!;
      if (m.attrs['__title']) next['__title'] = m.attrs['__title'];
      if (Object.keys(next).length) m.attrs = next;
      else {
        delete m.attrs;
        tidy(meta, 'entity', id);
      }
    }
    const res = updateEntity(core.code, M, id, { attrs: rows.filter((r) => r.name).map(({ type, name, keys, comment }) => ({ type, name, keys, comment })) });
    if (!core.applyCode({ code: res.code, meta }, t('history.attributes'), { select: [{ kind: 'entity', id }] })) applyMeta(core, t('history.attributes'), { meta });
  };
  rows.forEach((r, idx) => {
    const text = attrText(r);
    const inp = h('input', { type: 'text', value: text, placeholder: t('table.placeholder'), 'aria-label': t('attr.line', { n: idx + 1 }), spellcheck: 'false' });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') inp.blur();
      else if (ev.key === 'Escape') {
        ev.stopPropagation();
        inp.value = text;
        inp.blur();
      }
    });
    inp.addEventListener('change', () => {
      const v = inp.value.trim();
      if (!v) {
        rows.splice(idx, 1);
        save();
        return;
      }
      const a = parseAttrLine(v);
      if (!a) {
        core.toast(t('table.badAttr'));
        inp.value = text;
        return;
      }
      Object.assign(r, { type: a.type, name: a.name, keys: a.keys, comment: a.comment });
      save();
    });
    // the style button shows the attribute's look
    const look = attrLook(hl(), r.name);
    const own = Object.keys(hl()[r.name] ?? {}).length > 0;
    const sample = h('span', {
      style: {
        color: core.result.rctx.color(look.color) ?? '', fontWeight: look.bold ? '700' : '400', fontStyle: look.italic ? 'italic' : 'normal',
        textDecoration: look.underline ? 'underline' : 'none',
      },
    }, 'Aa');
    const style = h('button', {
      type: 'button', class: 'attr-style' + (own ? ' set' : ''), title: t('attr.style'), 'aria-label': t('attr.styleOf', { name: r.name }),
      'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    }, sample);
    style.addEventListener('click', () => attrStylePopup(p, style, id, r.name));
    const del = h('button', { type: 'button', class: 'attr-del', title: t('attr.remove'), 'aria-label': t('attr.remove') }, '×');
    del.addEventListener('click', () => {
      rows.splice(idx, 1);
      save();
    });
    grid.append(h('div', { class: 'attr-line', role: 'listitem' }, inp, style, del));
  });
  host.append(grid);
  const add = h('button', { type: 'button', class: 'small' }, t('attr.add'));
  add.addEventListener('click', () => {
    rows.push({ type: 'string', name: `field${rows.length + 1}`, keys: [], comment: '', orig: null });
    save();
  });
  host.append(h('div', { class: 'btnrow' }, add), h('div', { class: 'hint' }, t('attr.hint')));
}

/** The style popup of one attribute: preset, bold / italic / underline, font, size and colour, applied at once. */
function attrStylePopup(p: PanelCtx, opener: HTMLElement, id: string, name: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const pop = h('div', { class: 'attr-style-pop', role: 'dialog', 'aria-label': t('attr.styleOf', { name }) });
  const write = (patch: Record<string, unknown>): void => {
    writeAttrLook(core, id, [name], patch);
    render();
  };
  const render = (): void => {
    const own = (core.getM('entity', id).attrs?.[name] ?? {}) as AttrHighlight;
    const look = attrLook(core.getM('entity', id).attrs, name);
    const head = (text: string): HTMLElement => h('div', { class: 'asp-label' }, text);
    // presets
    const presets = h('div', { class: 'asp-chips', role: 'group', 'aria-label': t('attr.preset') });
    for (const pn of ['', ...Object.keys(ATTR_PRESETS)]) {
      const on = (own.preset ?? '') === pn;
      const pl = pn ? ATTR_PRESETS[pn]! : {};
      const b = h('button', {
        type: 'button', class: 'asp-chip' + (on ? ' on' : ''), 'aria-pressed': String(on),
        style: { color: core.result.rctx.color(pl.color) ?? '', fontWeight: pl.bold ? '700' : '400', fontStyle: pl.italic ? 'italic' : 'normal', textDecoration: pl.underline ? 'underline' : 'none' },
      }, t(`attrPreset.${pn || 'none'}`));
      b.addEventListener('click', () => write({ preset: pn || undefined, color: undefined, bold: undefined, italic: undefined, underline: undefined }));
      presets.append(b);
    }
    // bold / italic / underline
    const styles = h('div', { class: 'asp-row', role: 'group', 'aria-label': t('attr.textStyle') });
    for (const [k, label] of [['bold', 'B'], ['italic', 'I'], ['underline', 'U']] as const) {
      const on = look[k] === true;
      const b = h('button', { type: 'button', class: `asp-tog asp-${k}` + (on ? ' on' : ''), 'aria-pressed': String(on), title: t(`attr.${k}`), 'aria-label': t(`attr.${k}`) }, label);
      b.addEventListener('click', () => write({ [k]: !on }));
      styles.append(b);
    }
    // font and size
    const font = h('select', { 'aria-label': t('attr.font') });
    for (const [v, n] of FONTS) font.append(new Option(v ? n : t('attr.themeFont'), v));
    font.value = typeof own.fontFamily === 'string' ? own.fontFamily : '';
    font.addEventListener('change', () => write({ fontFamily: font.value || undefined }));
    const size = h('input', { type: 'number', min: '6', max: '72', step: '1', placeholder: t('attr.sizeAuto'), 'aria-label': t('attr.size') });
    if (typeof own.fontSize === 'number') size.value = String(own.fontSize);
    size.addEventListener('change', () => write({ fontSize: Number(size.value) > 0 ? Math.min(72, Math.max(6, Number(size.value))) : undefined }));
    // colour: the theme palette, stored as references
    const colors = h('div', { class: 'asp-colors', role: 'group', 'aria-label': t('attr.color') });
    const none = h('button', { type: 'button', class: 'asp-sw asp-none' + (own.color ? '' : ' on'), title: t('attr.colorInherit'), 'aria-label': t('attr.colorInherit') });
    none.addEventListener('click', () => write({ color: undefined }));
    colors.append(none);
    for (const [pn, value] of Object.entries(core.result.theme.palette ?? {})) {
      const on = own.color === `@${pn}`;
      const b = h('button', { type: 'button', class: 'asp-sw' + (on ? ' on' : ''), title: pn, 'aria-label': pn, 'aria-pressed': String(on) });
      b.style.background = value;
      b.addEventListener('click', () => write({ color: `@${pn}` }));
      colors.append(b);
    }
    pop.replaceChildren(
      head(t('attr.preset')), presets,
      head(t('attr.textStyle')), styles, h('div', { class: 'asp-row asp-font' }, font, size),
      head(t('attr.color')), colors,
    );
  };
  render();
  const hostR = core.host.getBoundingClientRect();
  const r = opener.getBoundingClientRect();
  pop.style.top = `${Math.round(r.bottom - hostR.top + 6)}px`;
  pop.style.right = `${Math.max(8, Math.round(hostR.right - r.right))}px`;
  core.popovers.open(pop, opener);
}

export function relEditor(p: PanelCtx, host: HTMLElement, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const M = core.model;
  if (M.type !== 'er') return;
  const r = M.rels.find((x) => x.id === id);
  if (!r) return;
  sect(host, t('props.cardinality'));
  const CARDS: readonly Cardinality[] = ['zero-one', 'one', 'zero-many', 'one-many'];
  const sel = (label: string, key: 'fromCard' | 'toCard'): void => {
    const s = h('select', { 'aria-label': label });
    for (const v of CARDS) s.append(new Option(t(`card.${v}`), v));
    s.value = r[key];
    s.addEventListener('change', () => core.applyCode(updateRel(core.code, M, id, { [key]: s.value as Cardinality }), t('history.relationship'), { select: [{ kind: 'rel', id }] }));
    host.append(row(label, s));
  };
  sel(t('props.side', { id: r.from }), 'fromCard');
  sel(t('props.side', { id: r.to }), 'toCard');
  const cb = h('input', { type: 'checkbox', 'aria-label': t('props.identifying') });
  cb.checked = r.identifying;
  cb.addEventListener('change', () => core.applyCode(updateRel(core.code, M, id, { identifying: cb.checked }), t('history.relationship'), { select: [{ kind: 'rel', id }] }));
  host.append(row(t('props.identifying'), cb, h('span', { class: 'hint' }, t('props.solidLine'))));
}
