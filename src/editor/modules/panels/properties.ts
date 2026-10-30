// Properties panel content (A.7 rows 61, 63, 85; A.5 row 52; A.6 rows 54–56; prototype app `refreshInspector`,
// `canvasInspector`, `pageSizeFields`, `activationInspector`, `multiInspector`, `textSection`, `attrEditor`,
// `relEditor`, `layerRow`). Builds the panel for the current selection; every change is one history step.
import { layerDefs, layerOf } from '../../../core/layers.js';
import { KIND_TO_COLL, type AttrHighlight, type DiagramMeta, type ItemMeta } from '../../../core/meta/types.js';
import type { Cardinality, Direction, DiagramType, ErAttribute } from '../../../core/model.js';
import { newDiagram, setAutonumber, setDirection, setLayer, setPage, setPagePreset } from '../../../core/ops/meta-ops.js';
import { ensure, tidy, cloneMeta } from '../../../core/ops/meta-util.js';
import { baseStyleOf, presetsFor } from '../../../core/ops/style-env.js';
import { attrText, updateEntity, updateRel } from '../../../core/ops/er.js';
import { parseAttrLine } from '../../../core/parse/er.js';
import { ATTR_PRESETS, attrLook } from '../../../core/render/er.js';
import { FONTS } from '../../../ui/fonts.js';
import { writeAttrLook } from '../er-table/look.js';
import { effectivePage, pagePresets, ratioOf } from '../../../core/render/page.js';
import { STYLE_FIELDS } from '../../../core/schema/style-fields.js';
import { relativeColor } from '../../../core/theme/colors.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import type { EditorCore, Sel } from '../../core.js';
import { field, type FieldTarget } from './fields.js';
import { presetPicker } from './presets.js';
import { applyMeta, canGroup, describe, labelSpec, styleEnv, type LiveEdit } from './util.js';

export const DIAGRAM_TYPES: readonly (readonly [DiagramType, string])[] = [['flowchart', 'type.flowchart'], ['sequence', 'type.sequence'], ['er', 'type.er']];
export const FLOW_DIRS: readonly (readonly [Direction, string])[] = [['TB', 'dir.TB'], ['LR', 'dir.LR'], ['BT', 'dir.BT'], ['RL', 'dir.RL']];
export const RATIOS: readonly (readonly [string, string])[] = [['16:9', '16 : 9'], ['4:3', '4 : 3'], ['3:2', '3 : 2'], ['1:1', 'ratio.square'], ['2:3', '2 : 3'], ['3:4', '3 : 4'], ['9:16', '9 : 16'],
  ['297:210', 'ratio.a4l'], ['210:297', 'ratio.a4p']];
const HAS_DIRECTION = new Set<string | null>(['flowchart', 'er']);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export interface PanelCtx {
  core: EditorCore;
  live: LiveEdit;
}

const sect = (host: HTMLElement, text: string): void => {
  host.append(h('div', { class: 'sect', role: 'heading', 'aria-level': '3' }, text));
};
const wrapCtl = (...els: (Node | string | null)[]): HTMLElement => h('div', { class: 'ctl' }, ...els);
const row = (label: string, ...ctl: (Node | string | null)[]): HTMLElement => h('div', { class: 'f' }, h('label', null, label), wrapCtl(...ctl), h('span'));

/** Item metadata as a field target (writes go through the panel's live edit / one-shot changes). */
function itemTarget(p: PanelCtx, ref: ItemRef, base: Readonly<Record<string, unknown>>): FieldTarget {
  const { core, live } = p;
  const t = core.i18n.t;
  return {
    own: (k) => (core.getM(ref.kind, ref.id) as Record<string, unknown>)[k],
    base,
    set: (k, v, isLive) => {
      const f = (): void => {
        const m = core.ensure(ref.kind, ref.id) as Record<string, unknown>;
        if (v === undefined) delete m[k];
        else m[k] = v;
        core.tidy(ref.kind, ref.id);
      };
      if (isLive) live.run(t('history.style'), f);
      else {
        live.flush();
        core.change(t('history.style'), f);
      }
    },
    flush: () => live.flush(),
    resolve: (v) => core.result.rctx.color(v),
    customColor: (hex) => relativeColor(hex, core.result.theme.palette),
  };
}

/**
 * Several items of one kind as a field target (bulk edit): a write goes to every item in one history step; a key
 * whose effective values differ between them is "mixed". `bases[i]` is what item `refs[i]` inherits.
 */
function bulkTarget(p: PanelCtx, refs: readonly ItemRef[], bases: readonly Readonly<Record<string, unknown>>[]): FieldTarget {
  const { core, live } = p;
  const t = core.i18n.t;
  const ownOf = (r: ItemRef, k: string): unknown => (core.getM(r.kind, r.id) as Record<string, unknown>)[k];
  const same = (vs: readonly unknown[]): boolean => vs.every((v) => JSON.stringify(v) === JSON.stringify(vs[0]));
  // what they inherit in common: a key whose inherited values differ has no common placeholder
  const base: Record<string, unknown> = {};
  for (const k of new Set(bases.flatMap((b) => Object.keys(b)))) {
    const vs = bases.map((b) => b[k]);
    if (same(vs)) base[k] = vs[0];
  }
  return {
    own: (k) => refs.map((r) => ownOf(r, k)).find((v) => v !== undefined),
    base,
    mixed: (k) => !same(refs.map((r, i) => ownOf(r, k) ?? bases[i]?.[k])),
    set: (k, v, isLive) => {
      const f = (): void => {
        for (const r of refs) {
          const m = core.ensure(r.kind, r.id) as Record<string, unknown>;
          if (v === undefined) delete m[k];
          else m[k] = v;
          core.tidy(r.kind, r.id);
        }
      };
      if (isLive) live.run(t('history.style'), f);
      else {
        live.flush();
        core.change(t('history.style'), f);
      }
    },
    flush: () => live.flush(),
    resolve: (v) => core.result.rctx.color(v),
    customColor: (hex) => relativeColor(hex, core.result.theme.palette),
  };
}

/** The page settings (`canvas`) as a field target. */
function canvasTarget(p: PanelCtx, base: Readonly<Record<string, unknown>>): FieldTarget {
  const { core, live } = p;
  const t = core.i18n.t;
  return {
    own: (k) => core.meta.canvas[k],
    base,
    set: (k, v, isLive) => {
      const f = (): void => {
        if (v === undefined) delete core.meta.canvas[k];
        else core.meta.canvas[k] = v;
      };
      if (isLive) live.run(t('history.page'), f);
      else {
        live.flush();
        core.change(t('history.page'), f);
      }
    },
    flush: () => live.flush(),
    resolve: (v) => core.result.rctx.color(v),
    customColor: (hex) => relativeColor(hex, core.result.theme.palette),
  };
}

// ---- diagram type, direction, autonumber -------------------------------------------------------------------------

/** Type switch: another type starts a new diagram, after a confirmation. */
export async function switchDiagramType(core: EditorCore, type: DiagramType): Promise<void> {
  const t = core.i18n.t;
  if (type === core.model.type) return;
  const label = t(`type.${type}`);
  if (core.model.type && !(await core.dialogs.confirm(t('type.switchTitle', { type: label }), t('type.switchMsg', { type: label.toLowerCase() }), { ok: t('type.switchOk'), danger: true }))) return;
  const doc = newDiagram(type);
  if (!core.emit('ds-op', { type: 'doc.setType', code: doc.code }, true)) return;
  core.store.apply(doc, t('history.newDiagram'), []);
  core.select([]);
  core.enteredGroup.set(null);
  core.pageSelected.set(false);
  core.fileName = `untitled-${type}`;
  core.afterChange();
  core.viewport.setBounds(core.result.result.bounds, { fit: true });
  core.fire('model');
}

export function setFlowDirection(core: EditorCore, dir: Direction): void {
  core.applyCode(setDirection(core.code, core.model, dir), core.i18n.t('history.direction'), { select: null });
}

export function setAutonumberOn(core: EditorCore, on: boolean): void {
  core.applyCode(setAutonumber(core.code, on), core.i18n.t('history.autonumber'), { select: null });
}

/** Page values in effect: theme < page preset < the diagram's own. */
export const pageEff = (core: EditorCore): ReturnType<typeof effectivePage> => effectivePage(core.model.type, core.meta, core.result.theme);

export function setPageValue(core: EditorCore, k: string, v: unknown, dflt?: unknown): DiagramMeta {
  return setPage(core.meta, core.result.theme, core.model.type, k, v, dflt).meta;
}

export function choosePagePreset(core: EditorCore, id: string): void {
  applyMeta(core, core.i18n.t('history.pagePreset'), setPagePreset(core.meta, id || null));
}

/** Fit content / custom page size (a custom page starts from the current page). */
export function setPageSizeMode(core: EditorCore, mode: string): void {
  const out = cloneMeta(core.meta), c = out.canvas, b = core.result.result.bounds;
  if (mode === 'fit') {
    delete c.w;
    delete c.h;
    delete c.x;
    delete c.y;
  } else if (!(c.w && c.h)) Object.assign(c, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  applyMeta(core, core.i18n.t('history.pageSize'), { meta: out });
}

/** Proportions; a custom page keeps its width and centre. */
export function setPageRatio(core: EditorCore, r: string): void {
  const meta = setPageValue(core, 'ratio', r || '', '');
  const c = meta.canvas;
  const kk = ratioOf(r);
  if (c.w && c.h && kk) {
    const cy = (c.y ?? 0) + c.h / 2, hh = Math.round(c.w / kk);
    Object.assign(c, { h: hh, y: Math.round(cy - hh / 2) });
  }
  applyMeta(core, core.i18n.t('history.pageRatio'), { meta });
}

// ---- sections -----------------------------------------------------------------------------------------------------

function layerSelect(core: EditorCore, current: string | null, onPick: (id: string) => void): HTMLSelectElement {
  const t = core.i18n.t;
  const s = h('select', { 'aria-label': t('props.layer') });
  for (const l of layerDefs(core.meta)) s.append(new Option(`${l.name}${l.hidden ? ` ${t('layers.hiddenSuffix')}` : ''}`, l.id));
  if (current === null) {
    s.prepend(new Option(t('props.mixed'), ''));
    s.value = '';
  } else s.value = current;
  s.addEventListener('change', () => {
    if (s.value) onPick(s.value);
  });
  return s;
}

function layerRow(p: PanelCtx, host: HTMLElement, items: readonly ItemRef[]): void {
  const { core } = p;
  const t = core.i18n.t;
  const its = items.filter((x) => x.kind !== 'activation');
  if (!its.length) return;
  const cur = new Set(its.map((it) => layerOf(core.meta, it.kind, it.id)));
  const r = row(t('props.layer'), layerSelect(core, cur.size === 1 ? [...cur][0]! : null, (lid) => applyMeta(core, t('history.layer'), setLayer(core.meta, its, lid))));
  r.classList.toggle('set', !(cur.size === 1 && cur.has('default')));
  host.append(r);
}

function textSection(p: PanelCtx, host: HTMLElement, kind: ItemKind, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const spec = labelSpec(core, kind, id);
  if (!spec) return;
  const { value, multi } = spec;
  sect(host, t(spec.title));
  const inp: HTMLTextAreaElement | HTMLInputElement = multi ? h('textarea', { 'aria-label': t(spec.title) }) : h('input', { type: 'text', 'aria-label': t(spec.title) });
  inp.value = value;
  inp.placeholder = multi ? t('props.textMultiHint') : t('props.textHint');
  let done = false;
  const go = (): void => {
    if (done) return;
    const v = multi ? inp.value.replace(/\s+$/, '') : inp.value.trim();
    if (v === value) return;
    done = true;
    core.applyCode(spec.apply(v), t('history.text'), { select: [{ kind, id }] });
  };
  inp.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Enter' && (!multi || kev.metaKey || kev.ctrlKey)) {
      kev.preventDefault();
      go();
    }
    if (kev.key === 'Escape') {
      kev.stopPropagation();
      inp.value = value;
      inp.blur();
    }
  });
  inp.addEventListener('blur', go);
  host.append(h('div', { class: 'prop-label' }, inp));
  if (kind === 'entity') attrEditor(p, host, id);
  if (kind === 'rel') relEditor(p, host, id);
}

/**
 * The table's attributes, one line each: the Mermaid attribute as text (`type name PK (comment)`, as in the canvas's
 * row editing; empty deletes it) and a style button whose popup sets the attribute's look (metadata highlights).
 */
function attrEditor(p: PanelCtx, host: HTMLElement, id: string): void {
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
  const hostR = (core.dom.shadow.host as HTMLElement).getBoundingClientRect();
  const r = opener.getBoundingClientRect();
  pop.style.top = `${Math.round(r.bottom - hostR.top + 6)}px`;
  pop.style.right = `${Math.max(8, Math.round(hostR.right - r.right))}px`;
  core.popovers.open(pop, opener);
}

function relEditor(p: PanelCtx, host: HTMLElement, id: string): void {
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

/** Preset tiles for the item; with `targets` (several items of its kind) a pick applies to all of them. */
function pickerSection(p: PanelCtx, host: HTMLElement, ref: ItemRef, targets?: readonly ItemRef[]): void {
  const t = p.core.i18n.t;
  // save / update / reset act on one item: not offered for several
  const acts = targets ? null : h('div', { class: 'pp-acts' });
  host.append(h('div', { class: 'pp-head' }, h('div', { class: 'sect' }, t('props.stylePreset')), acts));
  const grid = h('div', { class: 'pp-grid' });
  host.append(grid);
  presetPicker(p.core, grid, ref, { cols: 3, actions: acts, ...(targets ? { targets } : {}) });
}

function activationInspector(p: PanelCtx, host: HTMLElement, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const info = describe(core.model, 'activation', id);
  host.append(h('div', { class: 'insp-title' }, info.title), h('div', { class: 'insp-sub' }, info.sub));
  host.append(h('div', { class: 'hint' }, t('props.activationHint')));
  const ref: ItemRef = { kind: 'activation', id };
  pickerSection(p, host, ref);
  sect(host, t('props.appearance'));
  const target = itemTarget(p, ref, baseStyleOf(styleEnv(core), 'activation', id));
  for (const f of STYLE_FIELDS.activation) field(core.i18n, host, f, target);
  const del = h('button', { type: 'button' }, t('props.removeProcess'));
  del.addEventListener('click', () => core.run('deleteSelection'));
  host.append(h('div', { class: 'btnrow' }, del));
}

function multiInspector(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const sel = core.selection();
  host.append(h('div', { class: 'insp-title' }, t('props.multiTitle', { n: sel.length })));
  layerRow(p, host, sel);
  const counts = new Map<string, number>();
  for (const x of sel) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  host.append(h('div', { class: 'multi-list' }, [...counts].map(([k, n]) => `${n} × ${k}`).join(' · ')));
  multiActions(p, host);
  host.append(h('div', { class: 'hint' }, t('props.multiHint')));
}

/** Group / delete / process buttons of a multi-selection. */
function multiActions(p: PanelCtx, host: HTMLElement, extra: readonly HTMLElement[] = []): void {
  const { core } = p;
  const t = core.i18n.t;
  const br = h('div', { class: 'btnrow' });
  const g = canGroup(core);
  const gb = h('button', { type: 'button', class: 'primary', disabled: !g.ok, title: g.reason || t('props.groupTip') }, t('props.group'));
  gb.addEventListener('click', () => void core.run('groupSelection'));
  const db = h('button', { type: 'button', class: 'danger' }, t('props.delete'));
  db.addEventListener('click', () => core.run('deleteSelection'));
  br.append(gb, db);
  const act = core.run('activationInfo') ?? null;
  if (act) {
    const label = act.removed ? t('props.removeProcessOn', { p: act.participant ?? '' }) : act.participant ? t('props.showProcessOn', { p: act.participant }) : t('props.showProcess');
    const ab = h('button', { type: 'button', class: act.removed ? '' : 'primary', disabled: !!act.reason, title: act.reason || t('props.showProcessTip') }, label);
    ab.addEventListener('click', () => core.run('applyActivation'));
    br.prepend(ab);
    if (act.reason) host.append(h('div', { class: 'hint' }, act.reason));
  }
  br.append(...extra);
  host.append(br);
}

/**
 * Several items of one kind: every property that can be set on all of them at once (preset, appearance, the
 * position and geometry fields), each showing the shared value or "mixed".
 */
function bulkInspector(p: PanelCtx, host: HTMLElement, kind: ItemKind, sel: readonly ItemRef[]): void {
  const { core } = p;
  const t = core.i18n.t;
  const env = styleEnv(core);
  const refs = sel.map(({ kind: k, id }) => ({ kind: k, id }));
  const kindName = t(`props.kinds.${kind}`);
  host.append(h('div', { class: 'insp-title' }, t('props.bulkTitle', { n: refs.length, kind: kindName.startsWith('props.') ? kind : kindName })),
    h('div', { class: 'insp-sub' }, t('props.bulkHint')));
  layerRow(p, host, refs);
  if (presetsFor(env, kind)) pickerSection(p, host, refs[0]!, refs);
  sect(host, t('props.appearance'));
  const style = bulkTarget(p, refs, refs.map((r) => baseStyleOf(env, kind, r.id)));
  for (const f of STYLE_FIELDS[kind] ?? []) field(core.i18n, host, f, style);

  const g = core.geom;
  const rounded = (b: { x: number; y: number; w: number; h: number } | undefined): Record<string, number> =>
    b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : {};
  const geo = (fields: readonly string[], baseOf: (r: ItemRef) => Record<string, unknown>): void => {
    sect(host, t('props.geometry'));
    const target = bulkTarget(p, refs, refs.map(baseOf));
    for (const f of fields) field(core.i18n, host, f, target);
  };
  if (kind === 'node' && g.type === 'flowchart') geo(['x', 'y', 'w', 'h'], (r) => rounded(g.nodes.get(r.id)));
  else if (kind === 'entity' && g.type === 'er') geo(['x', 'y', 'w', 'h'], (r) => rounded(g.entities.get(r.id)));
  else if (kind === 'participant' && g.type === 'sequence') geo(['x', 'w', 'h'], (r) => rounded(g.participants.get(r.id)));
  else if (kind === 'edge' || kind === 'rel') {
    const routing = pageEff(core).routing ?? 'curved';
    const relAt = core.result.theme.er.rel as unknown as Record<string, unknown>;
    const labelAt = kind === 'rel' ? 1 - (typeof relAt['labelAt'] === 'number' ? relAt['labelAt'] : 0.5) : 0.5;
    geo(['routing', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelAt'].filter((f) => !(kind === 'rel' && f === 'routing')), () => ({ routing, labelAt }));
  } else if (kind === 'message' || kind === 'note' || kind === 'block') geo(['dy'], () => ({ dy: 0 }));

  const reset = h('button', { type: 'button', class: 'danger' }, t('props.resetAll'));
  reset.addEventListener('click', () => {
    const meta = cloneMeta(core.meta);
    const coll = meta[KIND_TO_COLL[kind]] as Record<string, unknown> | undefined;
    for (const r of refs) if (coll) delete coll[r.id];
    applyMeta(core, t('history.resetAll'), { meta });
  });
  multiActions(p, host, [reset]);
}

function pageSizeFields(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const c = core.meta.canvas;
  const custom = !!(c.w && c.h);
  const er = typeof pageEff(core).ratio === 'string' ? (pageEff(core).ratio as string) : ''; // proportions in effect
  const k = ratioOf(er);
  const b = core.result.result.bounds;
  /** Resizes a custom page around its centre. */
  const resize = (meta: DiagramMeta, w: number, hh: number): void => {
    const cc = meta.canvas;
    w = Math.max(40, Math.round(w));
    hh = Math.max(40, Math.round(hh));
    const cx = (cc.x ?? 0) + (cc.w ?? 0) / 2, cy = (cc.y ?? 0) + (cc.h ?? 0) / 2;
    Object.assign(cc, { w, h: hh, x: Math.round(cx - w / 2), y: Math.round(cy - hh / 2) });
  };
  sect(host, t('page.size'));
  const seg = h('div', { class: 'seg small page-size-seg', role: 'radiogroup', 'aria-label': t('page.pageSize') });
  for (const [v, label] of [['fit', t('page.fit')], ['custom', t('page.custom')]] as const) {
    const on = (v === 'custom') === custom;
    const bt = h('button', { type: 'button', class: on ? 'on' : '', role: 'radio', 'aria-checked': String(on) }, label);
    bt.addEventListener('click', () => {
      if (!on) setPageSizeMode(core, v);
    });
    seg.append(bt);
  }
  host.append(row(t('page.pageSize'), seg));
  // proportions
  const preset = RATIOS.find(([r]) => r === er);
  const sel = h('select', { 'aria-label': t('page.proportions') });
  sel.append(new Option(t('page.free'), ''), ...RATIOS.map(([r, label]) => new Option(label.startsWith('ratio.') ? t(label) : label, r)), new Option(t('page.customRatio'), 'custom'));
  sel.value = !k ? '' : preset ? er : 'custom';
  sel.addEventListener('change', () => {
    if (sel.value === 'custom') {
      const w = Math.round(b.w), hh = Math.round(b.h), g = gcd(w, hh) || 1;
      setPageRatio(core, `${w / g}:${hh / g}`);
    } else setPageRatio(core, sel.value);
  });
  const ratioRow = row(t('page.proportions'), sel);
  ratioRow.classList.toggle('set', !!k);
  host.append(ratioRow);
  if (k && !preset) {
    // custom proportions: W : H
    const [rw = '', rh = ''] = er.split(':');
    const a = h('input', { type: 'number', min: '0.1', step: 'any', value: rw, class: 'ratio-in', 'aria-label': t('page.ratioW') });
    const z = h('input', { type: 'number', min: '0.1', step: 'any', value: rh, class: 'ratio-in', 'aria-label': t('page.ratioH') });
    const upd = (): void => {
      if (+a.value > 0 && +z.value > 0) setPageRatio(core, `${+a.value}:${+z.value}`);
    };
    a.addEventListener('change', upd);
    z.addEventListener('change', upd);
    host.append(row('', a, h('span', { class: 'ratio-sep' }, ':'), z));
  }
  // width × height (+ lock)
  const W = h('input', { type: 'number', min: '40', value: String(Math.round(b.w)), disabled: !custom, 'aria-label': t('page.width') });
  const H = h('input', { type: 'number', min: '40', value: String(Math.round(b.h)), disabled: !custom, 'aria-label': t('page.height') });
  if (!custom) W.title = H.title = t('page.fitsContent');
  const apply = (w: number, hh: number): void => {
    const meta = cloneMeta(core.meta);
    resize(meta, w, hh);
    applyMeta(core, t('history.pageSize'), { meta });
  };
  W.addEventListener('change', () => {
    const w = +W.value;
    if (w > 0) apply(w, k ? w / k : c.h ?? b.h);
  });
  H.addEventListener('change', () => {
    const hh = +H.value;
    if (hh > 0) apply(k ? hh * k : c.w ?? b.w, hh);
  });
  const lock = h('button', { type: 'button', class: 'lock-btn' + (k ? ' on' : ''), title: k ? t('page.unlock') : t('page.lock'), 'aria-label': k ? t('page.unlock') : t('page.lock'), 'aria-pressed': String(!!k) },
    icon(k ? ICONS.lock : ICONS.unlock, 15));
  lock.addEventListener('click', () => {
    if (k) {
      applyMeta(core, t('history.pageRatio'), { meta: setPageValue(core, 'ratio', '', '') });
      return;
    }
    const w = Math.round(b.w), hh = Math.round(b.h), g = gcd(w, hh) || 1;
    const named = RATIOS.find(([x]) => Math.abs(ratioOf(x) - w / hh) < 0.005)?.[0]; // name it when it is a known one
    applyMeta(core, t('history.pageRatio'), { meta: setPageValue(core, 'ratio', named ?? `${w / g}:${hh / g}`, '') });
  });
  const wh = row(t('page.wh'), W, lock, H);
  wh.classList.add('page-wh');
  host.append(wh);
}

function canvasInspector(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const M = core.model;
  const T = core.result.theme;
  host.append(h('div', { class: 'insp-title' }, t('props.diagram')), h('div', { class: 'insp-sub' }, t('props.nothingSelected')));
  sect(host, t('page.title'));
  const selRow = (label: string, opts: readonly (readonly [string, string])[], cur: string, pick: (v: string) => void): void => {
    const sel = h('select', { 'aria-label': label });
    sel.append(...opts.map(([v, l]) => new Option(l, v)));
    sel.value = cur;
    sel.addEventListener('change', () => {
      const v = sel.value;
      sel.value = cur; // the type switch may be cancelled
      pick(v);
    });
    host.append(row(label, sel));
  };
  if (!M.type) return;
  selRow(t('page.type'), DIAGRAM_TYPES.map(([v, k]) => [v, t(k)] as const), M.type, (v) => void switchDiagramType(core, v as DiagramType));
  if (HAS_DIRECTION.has(M.type) && (M.type === 'flowchart' || M.type === 'er')) selRow(t('page.direction'), FLOW_DIRS.map(([v, k]) => [v, t(k)] as const), M.direction, (v) => setFlowDirection(core, v as Direction));
  if (M.type === 'sequence') selRow(t('page.numbers'), [['off', t('page.numbersOff')], ['on', t('page.numbersOn')]], M.autonumber ? 'on' : 'off', (v) => setAutonumberOn(core, v === 'on'));
  const presets = Object.entries(pagePresets(T, M.type)).map(([id, pp]) => [id, pp.label || id] as const);
  if (presets.length) selRow(t('page.preset'), [['', t('page.presetNone')], ...presets], typeof core.meta.canvas.preset === 'string' ? core.meta.canvas.preset : '', (v) => choosePagePreset(core, v));
  const presetName = core.meta.canvas.preset;
  const pp = ((typeof presetName === 'string' ? pagePresets(T, M.type)[presetName] : undefined) ?? {}) as Record<string, unknown>;
  if (M.type !== 'sequence') field(core.i18n, host, 'routing', canvasTarget(p, { routing: pp['routing'] ?? 'curved' })); // messages are always straight
  const pageBase = { ...(T.canvas as unknown as Record<string, unknown>), ...pp };
  for (const f of ['background', 'border']) field(core.i18n, host, f, canvasTarget(p, pageBase));
  pageSizeFields(p, host);
  if (M.type === 'sequence') {
    sect(host, t('page.seqLayout'));
    const L = T.sequence.layout as unknown as Record<string, unknown>;
    const base = { ...L, blockSpan: L['blockSpan'] || 'full', ...pp };
    for (const f of ['gap', 'rowH', 'mirror', 'blockSpan']) field(core.i18n, host, f, canvasTarget(p, base));
  }
  sect(host, t('props.editor'));
  const si = h('input', { type: 'number', min: '0', value: String(core.snap), 'aria-label': t('props.snap') });
  si.addEventListener('input', () => {
    core.snap = Math.max(0, Number(si.value) || 0);
  });
  host.append(row(t('props.snap'), si), h('div', { class: 'hint' }, t('props.metaHint')));
}

/** Builds the Properties panel for the current selection into `host`. */
export function renderProperties(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  host.replaceChildren();
  const M = core.model;
  if (!M.type) {
    host.append(h('div', { class: 'hint' }, t('props.noDiagram')));
    return;
  }
  // a table whose attributes are edited in place: its properties
  const sel: readonly Sel[] = core.selection().length ? core.selection() : core.tableView ? [{ kind: 'entity', id: core.tableView }] : [];
  if (!sel.length) return canvasInspector(p, host);
  if (sel.length > 1) return sel.every((x) => x.kind === sel[0]!.kind) ? bulkInspector(p, host, sel[0]!.kind, sel) : multiInspector(p, host);
  const { kind, id } = sel[0] as Sel;
  if (kind === 'activation') return activationInspector(p, host, id);
  const env = styleEnv(core);
  const ref: ItemRef = { kind, id };
  const info = describe(M, kind, id);
  host.append(h('div', { class: 'insp-title' }, info.title), h('div', { class: 'insp-sub' }, info.sub));
  textSection(p, host, kind, id);
  layerRow(p, host, [ref]);
  if (presetsFor(env, kind)) pickerSection(p, host, ref);
  sect(host, t('props.appearance'));
  const base = baseStyleOf(env, kind, id);
  const target = itemTarget(p, ref, base);
  for (const f of STYLE_FIELDS[kind] ?? []) field(core.i18n, host, f, target);
  if (kind === 'box') return; // placed by its participants

  sect(host, t('props.geometry'));
  const g = core.geom;
  const rounded = (b: { x: number; y: number; w: number; h: number } | undefined): Record<string, number> =>
    b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : {};
  if ((kind === 'node' && g.type === 'flowchart') || (kind === 'entity' && g.type === 'er')) {
    const gb = g.type === 'flowchart' ? g.nodes.get(id) : g.type === 'er' ? g.entities.get(id) : undefined;
    const geo = itemTarget(p, ref, rounded(gb));
    for (const f of ['x', 'y', 'w', 'h']) field(core.i18n, host, f, geo);
  } else if (kind === 'group' && g.type === 'flowchart') {
    const gb = g.groups.get(id);
    const fixed = !!core.getM('group', id).w;
    const cb = h('input', { type: 'checkbox', 'aria-label': t('props.fixedFrame') });
    cb.checked = fixed;
    cb.addEventListener('change', () => {
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, 'group', id);
      if (cb.checked && gb) Object.assign(m, { x: Math.round(gb.x - gb.w / 2), y: Math.round(gb.y - gb.h / 2), w: Math.round(gb.w), h: Math.round(gb.h) });
      else {
        delete m.x;
        delete m.y;
        delete m['w'];
        delete m['h'];
      }
      tidy(meta, 'group', id);
      applyMeta(core, t('history.frame'), { meta });
    });
    host.append(row(t('props.fixedFrame'), cb, h('span', { class: 'hint' }, fixed ? t('props.fixedOn') : t('props.fixedOff'))));
    if (fixed) {
      const geo = itemTarget(p, ref, {});
      for (const f of ['x', 'y', 'w', 'h']) field(core.i18n, host, f, geo);
    }
  } else if (kind === 'edge' || kind === 'rel') {
    const routing = pageEff(core).routing ?? 'curved';
    const relAt = core.result.theme.er.rel as unknown as Record<string, unknown>;
    const labelAt = kind === 'rel' ? 1 - (typeof relAt['labelAt'] === 'number' ? relAt['labelAt'] : 0.5) : 0.5;
    const geo = itemTarget(p, ref, { routing, labelAt });
    for (const f of ['routing', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelAt']) if (!(kind === 'rel' && f === 'routing')) field(core.i18n, host, f, geo);
  } else if (kind === 'participant' && g.type === 'sequence') {
    const pb = g.participants.get(id);
    const geo = itemTarget(p, ref, rounded(pb));
    for (const f of ['x', 'w', 'h']) field(core.i18n, host, f, geo);
  } else if (kind === 'message' || kind === 'note' || kind === 'block') {
    field(core.i18n, host, 'dy', itemTarget(p, ref, { dy: 0 }));
  }

  const br = h('div', { class: 'btnrow' });
  const reset = h('button', { type: 'button', class: 'danger' }, t('props.resetAll'));
  reset.addEventListener('click', () => {
    const meta = cloneMeta(core.meta);
    const coll = meta[KIND_TO_COLL[kind]] as Record<string, unknown> | undefined;
    if (coll) delete coll[id];
    applyMeta(core, t('history.resetAll'), { meta });
  });
  br.append(reset);
  if (kind === 'edge' || kind === 'rel') {
    const lbl = h('button', { type: 'button' }, t('props.resetLabel'));
    lbl.addEventListener('click', () => {
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, kind, id);
      delete m.labelDx;
      delete m.labelDy;
      tidy(meta, kind, id);
      applyMeta(core, t('history.resetLabel'), { meta });
    });
    br.append(lbl);
  }
  host.append(br);
}
