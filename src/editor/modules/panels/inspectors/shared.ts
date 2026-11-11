// Pieces shared by the Properties panel's inspectors (A.7 rows 61, 63): section titles and field rows, the field
// targets over item metadata, several items and the page settings, the layer row, the preset tiles, the multi-selection
// actions and the geometry field defaults.
import { layerDefs, layerOf } from '../../../../core/layers.js';
import { setStyle } from '../../../../core/ops/style-ops.js';
import { setLayer } from '../../../../core/ops/palette.js';
import { relativeColor } from '../../../../core/theme/colors.js';
import type { ItemRef } from '../../../../core/types.js';
import { h } from '../../../../ui/kit/h.js';
import type { EditorCore } from '../../../core.js';
import { applyMeta } from '../../../ops/doc.js';
import { canGroup } from '../../../ops/group.js';
import type { LiveEdit } from '../../../ops/live.js';
import { pageEff } from '../../../ops/page.js';
import { styleWithShapes } from '../../../ops/shape.js';
import type { FieldTarget } from '../fields.js';
import { presetPicker } from '../../../lib/presets.js';

export interface PanelCtx {
  core: EditorCore;
  live: LiveEdit;
}

export const sect = (host: HTMLElement, text: string): void => {
  host.append(h('div', { class: 'sect', role: 'heading', 'aria-level': '3' }, text));
};
const wrapCtl = (...els: (Node | string | null)[]): HTMLElement => h('div', { class: 'ctl' }, ...els);
export const row = (label: string, ...ctl: (Node | string | null)[]): HTMLElement => h('div', { class: 'f' }, h('label', null, label), wrapCtl(...ctl), h('span'));

/** Item metadata as a field target (writes go through the panel's live edit / one-shot changes). */
export function itemTarget(p: PanelCtx, ref: ItemRef, base: Readonly<Record<string, unknown>>): FieldTarget {
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
        // a shape goes to the code where the type keeps shapes there (and one kept only in metadata moves there)
        if (styleWithShapes(core, [ref], { [k]: v }, t('history.style'), (meta) => setStyle(meta, [ref], k === 'shape' ? {} : { [k]: v }).meta)) return;
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
export function bulkTarget(p: PanelCtx, refs: readonly ItemRef[], bases: readonly Readonly<Record<string, unknown>>[]): FieldTarget {
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
        if (styleWithShapes(core, refs, { [k]: v }, t('history.style'), (meta) => setStyle(meta, refs, k === 'shape' ? {} : { [k]: v }).meta)) return;
        core.change(t('history.style'), f);
      }
    },
    flush: () => live.flush(),
    resolve: (v) => core.result.rctx.color(v),
    customColor: (hex) => relativeColor(hex, core.result.theme.palette),
  };
}

/** The page settings (`canvas`) as a field target. */
export function canvasTarget(p: PanelCtx, base: Readonly<Record<string, unknown>>): FieldTarget {
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

export function layerRow(p: PanelCtx, host: HTMLElement, items: readonly ItemRef[]): void {
  const { core } = p;
  const t = core.i18n.t;
  const its = items.filter((x) => x.kind !== 'activation');
  if (!its.length) return;
  const cur = new Set(its.map((it) => layerOf(core.meta, it.kind, it.id)));
  const r = row(t('props.layer'), layerSelect(core, cur.size === 1 ? [...cur][0]! : null, (lid) => applyMeta(core, t('history.layer'), setLayer(core.meta, its, lid))));
  r.classList.toggle('set', !(cur.size === 1 && cur.has('default')));
  host.append(r);
}

/** Preset tiles for the item; with `targets` (several items of its kind) a pick applies to all of them. */
export function pickerSection(p: PanelCtx, host: HTMLElement, ref: ItemRef, targets?: readonly ItemRef[]): void {
  const t = p.core.i18n.t;
  // save / update / reset act on one item: not offered for several
  const acts = targets ? null : h('div', { class: 'pp-acts' });
  host.append(h('div', { class: 'pp-head' }, h('div', { class: 'sect' }, t('props.stylePreset')), acts));
  const grid = h('div', { class: 'pp-grid' });
  host.append(grid);
  presetPicker(p.core, grid, ref, { cols: 3, actions: acts, ...(targets ? { targets } : {}) });
}

/** Group / delete / process buttons of a multi-selection. */
export function multiActions(p: PanelCtx, host: HTMLElement, extra: readonly HTMLElement[] = []): void {
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

/** A geometry box (centre and size) rounded for the position and size fields. */
export const roundedBox = (b: { x: number; y: number; w: number; h: number } | undefined): Record<string, number> =>
  b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : {};

/** A connector's geometry fields (relationships have no routing of their own). */
export const lineFields = (kind: 'edge' | 'rel'): string[] =>
  ['routing', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelAt'].filter((f) => !(kind === 'rel' && f === 'routing'));

/** What a connector's geometry fields show when nothing is set: the page routing and where the theme puts the label. */
export function lineDefaults(core: EditorCore, kind: 'edge' | 'rel'): Record<string, unknown> {
  const routing = pageEff(core).routing ?? 'curved';
  // ER labels are measured from the other end
  const labelAt = kind === 'rel' ? 1 - (core.result.theme.er.rel.labelAt ?? 0.5) : 0.5;
  return { routing, labelAt };
}
