// The attribute toolbar of the ER table being edited: the selected rows' look (preset, font, size, bold / italic /
// underline, colour) styled at once, and delete.
import type { AttrHighlight } from '../../../core/meta/types.js';
import type { ErAttribute } from '../../../core/model.js';
import { addLocalColor, removeLocalColor } from '../../../core/ops/palette.js';
import { ATTR_PRESETS, attrLook } from '../../../core/render/er-presets.js';
import { themeStyleTarget } from '../../../ui/diagram/style-toolbar/theme-target.js';
import type { Rect } from '../../../core/types.js';
import type { KindSpec, ToolbarApi } from '../../../ui/diagram/style-toolbar.js';
import { h } from '../../../ui/kit/h.js';
import { writeAttrLook } from '../../lib/er-look.js';
import { freeStrip } from '../../lib/place.js';
import { applyMeta } from '../../ops/doc.js';
import type { TableContext } from './state.js';

/** The attribute toolbar's controls. */
export const ATTR_SPEC: KindSpec = {
  groups: [['presets', 'font', 'size', 'bold', 'italic', 'underline'], ['textColor'], ['delete']],
  size: 'fontSize',
  bold: 'fontWeight',
  text: 'color',
};

/** Highlight keys the toolbar writes (`fontWeight` maps to `bold`). */
const LOOK_KEYS = new Set(['color', 'fontFamily', 'fontSize', 'italic', 'underline', 'bold', 'preset']);

export function attrToolbarApi(c: TableContext): ToolbarApi {
  const { core, t, st } = c;
  const editing = (): boolean => core.mode.peek() === 'edit';
  const first = (): ErAttribute | undefined => c.attrs()[st.sel[0] ?? -1];
  const look = (): AttrHighlight => {
    const a = first();
    return a && st.table ? attrLook(core.getM('entity', st.table).attrs, a.name) : {};
  };
  const effRaw = (k: string): unknown => {
    const a = first();
    if (!a) return undefined;
    const l = look();
    switch (k) {
      case 'color': return l.color ?? c.tableValue('attrColor');
      case 'fontFamily': return l.fontFamily ?? '';
      case 'fontSize': return l.fontSize ?? c.tableValue('attrSize') ?? 14;
      case 'fontWeight': return l.bold ? 700 : 400;
      case 'italic': return l.italic === true;
      case 'underline': return l.underline === true;
      case 'preset': return l.preset ?? '';
      default: return undefined;
    }
  };
  /** Writes look keys into the highlights of the selected rows; a boolean equal to the row's preset is not stored. */
  const setLook = (patch: Readonly<Record<string, unknown>>): void => {
    if (!st.table || !st.sel.length) return;
    const list = c.attrs();
    writeAttrLook(core, st.table, st.sel.flatMap((i) => (list[i] ? [list[i]!.name] : [])), patch);
  };
  const set = (k: string | Readonly<Record<string, unknown>>, v?: unknown): void => {
    const patch: Record<string, unknown> = typeof k === 'object' && k ? { ...k } : { [k as string]: v };
    const lookPatch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'fontWeight') lookPatch['bold'] = Number(val) >= 600;
      else if (key === 'preset') Object.assign(lookPatch, { preset: val || undefined, color: undefined, bold: undefined, italic: undefined, underline: undefined });
      else if (LOOK_KEYS.has(key)) lookPatch[key] = val;
    }
    if (Object.keys(lookPatch).length) setLook(lookPatch);
  };
  return {
    selection: () => (st.table && st.sel.length && editing() && !st.editor ? { kind: 'attr', id: `${st.table}#${st.sel[0]}` } : null),
    editable: () => editing(),
    multiCount: () => st.sel.length,
    selectionTypes: () => (st.sel.length > 1 ? [{ kind: 'attr', count: st.sel.length, selected: true }] : null),
    setTypeSelected: () => undefined,
    eff: (k) => {
      const v = effRaw(k);
      return typeof v === 'string' && v.startsWith('@') ? core.result.rctx.color(v) ?? v : v;
    },
    effRaw,
    set,
    ...themeStyleTarget(() => core.result.theme),
    localPalette: () => Object.entries(core.meta.styles['palette'] ?? {}).flatMap(([name, v]) => (typeof v['color'] === 'string' ? [{ name, value: v['color'] }] : [])),
    addLocalColor: (hex) => {
      const res = addLocalColor(core.meta, hex);
      applyMeta(core, t('history.paletteAdd'), res);
      return res.name;
    },
    removeLocalColor: (name) => void applyMeta(core, t('history.paletteRemove'), removeLocalColor(core.meta, name)),
    anchorRect: () => {
      let r: Rect | null = null;
      for (const i of st.sel) {
        const q = c.rowRect(i);
        if (!q) continue;
        r = r ? { x: Math.min(r.x, q.x), y: Math.min(r.y, q.y), w: Math.max(r.x + r.w, q.x + q.w) - Math.min(r.x, q.x), h: Math.max(r.y + r.h, q.y + q.h) - Math.min(r.y, q.y) } : q;
      }
      return r;
    },
    hBounds: () => freeStrip(core),
    diagramType: () => core.model.type,
    del: () => c.deleteRows(st.sel),
    preset: () => String(effRaw('preset') ?? ''),
    renderPresets: (grid, done) => {
      grid.style.setProperty('--pp-cols', '3');
      const cur = String(effRaw('preset') ?? '');
      const sample = first()?.name ?? 'attribute';
      for (const name of ['', ...Object.keys(ATTR_PRESETS)]) {
        const p: AttrHighlight = name ? ATTR_PRESETS[name]! : {};
        const text = h('span', {
          style: {
            color: core.result.rctx.color(p.color) ?? '', fontWeight: p.bold ? '700' : '400', fontStyle: p.italic ? 'italic' : 'normal',
            textDecoration: p.underline ? 'underline' : 'none', fontFamily: core.result.theme.font,
          },
        }, sample);
        const on = name === cur;
        const b = h('button', { type: 'button', class: 'pp-item' + (on ? ' on' : ''), 'aria-pressed': String(on), title: t(`attrPreset.${name || 'none'}`) },
          h('div', { class: 'pp-pic attr-pp', 'aria-hidden': 'true' }, text), h('span', { class: 'pp-name' }, t(`attrPreset.${name || 'none'}`)));
        b.addEventListener('click', () => {
          set('preset', name);
          done();
        });
        grid.append(b);
      }
    },
  };
}
