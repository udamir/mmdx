// Floating style toolbar and page toolbar wiring (A.7 rows 39, 58–60, 63, 64, 88; prototype app ~1390–1795 and
// ~3529–3637): the toolbar API over the editor (effective values, overrides as one history step per run, presets,
// layers, the diagram palette "+", lock, paint, group / arrange / activation actions), the Order slider with a live
// preview committed once (`orderInfo` / `orderPreview` / `orderCommit`), ⌘[ / ⌘] (`moveSelection`), the page badge
// above the page's top-left corner and the page's own action bar.
import { layerDefs, layerOf } from '../../../core/layers.js';
import { copyable } from '../../../core/ops/clipboard.js';
import {
  addLocalColor, canSavePreset, newLayer, removeLocalColor, resetCurve, resetItemStyle, setLayer, setStyle, SIZE_KEY, TEXT_KEY, WEIGHT_KEY,
} from '../../../core/ops/meta-ops.js';
import { applyOrderState, moveOrder, orderPositions, type OrderPositions } from '../../../core/ops/order.js';
import { baseStyleOf, effectiveValue, presetsFor } from '../../../core/ops/style-env.js';
import { relativeColor } from '../../../core/theme/colors.js';
import type { Direction, DiagramType } from '../../../core/model.js';
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { ItemRef, Rect } from '../../../core/types.js';
import type { PageToolbarApi, PageToolbarHandle, SequenceLayoutState } from '../../../ui/page-toolbar.js';
import type { ArrangeOp, ToolbarApi, ToolbarHandle, ToolbarOptions } from '../../../ui/style-toolbar.js';
import { TOOLBAR_CSS } from '../../../ui/styles/toolbar.js';
import { h } from '../../../ui/h.js';
import type { EditorCore, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { saveItemAsPreset, presetPicker } from '../panels/presets.js';
import {
  choosePagePreset, DIAGRAM_TYPES, FLOW_DIRS, pageEff, RATIOS, setAutonumberOn, setFlowDirection, setPageRatio, setPageSizeMode, setPageValue, switchDiagramType,
} from '../panels/properties.js';
import { applyDoc, applyMeta, canGroup, LiveEdit, styleEnv } from '../panels/util.js';
import { LINE_KINDS } from '../canvas/shared.js';
import { setPanel } from './panes.js';

export const TOOLBARS_CSS = /* css */ `
${TOOLBAR_CSS}
.page-badge { position: absolute; left: 0; top: 0; z-index: 5; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--muted);
  font-size: 11px; font-weight: 600; letter-spacing: .02em; padding: 2px 8px; line-height: 16px; cursor: pointer; white-space: nowrap; }
.page-badge[hidden] { display: none; }
.page-badge:hover { color: var(--ink); border-color: var(--accent); }
.page-badge[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: #fff; }
.ed.dragging .page-badge { opacity: .5; }
`;

/** Keys of a box's look (border, fill, corners): not a connector's. */
const BOX_LOOK: ReadonlySet<string> = new Set(['fill', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeOpacity', 'radius', 'dash', 'shape', 'stack']);

const selKey = (sel: readonly ItemRef[]): string => sel.map((x) => `${x.kind}:${x.id}`).join('|');

/** Horizontal strip of the canvas not covered by the tool dock, the code panel or the right panels (wrap coords). */
export function freeStrip(core: EditorCore): [number, number] {
  const wrap = core.dom.wrap, root = core.dom.root;
  const wr = wrap.getBoundingClientRect();
  const shown = (e: Element | null): e is HTMLElement => !!e && e instanceof HTMLElement && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const dock = wrap.querySelector('.tool-dock'), lp = root.querySelector('.pane.left'), rp = root.querySelector('.pane.right');
  let lo = shown(dock) ? dock.getBoundingClientRect().right - wr.left : 0;
  if (shown(lp)) lo = Math.max(lo, lp.getBoundingClientRect().right - wr.left);
  const hi = (shown(rp) ? rp.getBoundingClientRect().left - wr.left : wr.width) - 10;
  lo += 10;
  return hi - lo > 200 ? [lo, hi] : [8, wr.width - 8];
}

/** The selected item's box on screen (wrap coords): connectors take their path, label and bend points. */
function anchorRect(core: EditorCore, s: Sel): Rect | null {
  const wr = core.dom.wrap.getBoundingClientRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (l: number, t: number, r: number, b: number): void => {
    x0 = Math.min(x0, l);
    y0 = Math.min(y0, t);
    x1 = Math.max(x1, r);
    y1 = Math.max(y1, b);
  };
  const els = Array.from(core.dom.body.querySelectorAll('.el[data-id]')).filter((n) => n.getAttribute('data-id') === s.id && n.getAttribute('data-kind') === s.kind);
  if (s.kind === 'edge' || s.kind === 'rel') {
    for (const e of els) {
      const parts = e.getAttribute('data-part') === 'label' ? [e] : Array.from(e.querySelectorAll('.hit'));
      for (const n of parts) {
        const r = n.getBoundingClientRect();
        if (r.width || r.height) add(r.left, r.top, r.right, r.bottom);
      }
    }
    const g = core.geom;
    const eg = g.type === 'flowchart' && s.kind === 'edge' ? g.edges.get(s.id) : g.type === 'er' && s.kind === 'rel' ? g.rels.get(s.id) : undefined;
    const pts = (eg as { points?: [number, number][] } | undefined)?.points ?? [];
    const sv = core.dom.svg.getBoundingClientRect();
    for (const [x, y] of pts) {
      const p = core.toScreen({ x, y });
      add(p.x + sv.left, p.y + sv.top, p.x + sv.left, p.y + sv.top);
    }
    if (x0 !== Infinity) {
      const pad = 10;
      return { x: x0 - pad - wr.left, y: y0 - pad - wr.top, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    }
  }
  for (const n of els) {
    if (s.foot !== undefined && n.hasAttribute('data-foot') !== !!s.foot && s.kind === 'participant') continue;
    const r = n.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    add(r.left, r.top, r.right, r.bottom);
  }
  if (x0 === Infinity) {
    // no DOM box (jsdom, hidden item): fall back to the geometry
    const b = core.boxOf(s);
    if (!b) return null;
    const r = core.rectOnScreen({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
    return r;
  }
  return { x: x0 - wr.left, y: y0 - wr.top, w: x1 - x0, h: y1 - y0 };
}

export const toolbarsModule: EditorModule = {
  id: 'toolbars',
  css: TOOLBARS_CSS,
  install(core) {
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];
    const live = new LiveEdit(core);
    const wrap = core.dom.wrap;

    const primary = (): Sel | null => (core.mode.peek() === 'edit' && !core.inlineEditing ? core.selection()[0] ?? null : null);
    const multi = (): boolean => core.selection().length > 1;
    const env = () => styleEnv(core);

    // ---- diagram palette (row 88): "+" in colour pickers, Alt-click removes
    const palette = (): { name: string; value: string }[] => Object.entries(core.result.theme.palette ?? {}).map(([name, value]) => ({ name, value }));
    const localPalette = (): { name: string; value: string }[] =>
      Object.entries(core.meta.styles['palette'] ?? {}).flatMap(([name, v]) => (typeof v['color'] === 'string' ? [{ name, value: v['color'] }] : []));
    const addColor = (hex: string): string => {
      live.flush();
      const res = addLocalColor(core.meta, hex);
      applyMeta(core, t('history.paletteAdd'), res);
      return res.name;
    };
    const removeColor = (name: string): void => {
      live.flush();
      if (applyMeta(core, t('history.paletteRemove'), removeLocalColor(core.meta, name))) core.toast(t('palette.removed'));
      style?.refresh();
      page?.refresh();
    };

    // ---- order slider: every position the item can reach in the code, previewed live, committed once
    let ord: (OrderPositions & { key: string; base: { code: string; meta: DiagramMeta; model: typeof core.model; participants: ReadonlyMap<string, { x: number }> | null }; shown: number | null }) | null = null;
    let ordering = false;
    const orderInfo = (): typeof ord => {
      const sel = core.selection();
      if (sel.length !== 1) return null;
      const s = sel[0]!;
      const key = `${core.code}\u0000${s.kind}:${s.id}`;
      if (ord?.key === key) return ord;
      const g = core.geom;
      ord = { ...orderPositions(core.code, core.model, s), key, base: { code: core.code, meta: JSON.parse(JSON.stringify(core.meta)) as DiagramMeta, model: core.model, participants: g.type === 'sequence' ? g.participants : null }, shown: null };
      return ord;
    };
    const orderPreview = (i: number): void => {
      const o = ord;
      const st = o?.states[i];
      if (!o || !st) return;
      if (!ordering) {
        core.begin();
        ordering = true;
      }
      const doc = applyOrderState(o.base, st);
      core.store.meta.set(doc.meta);
      core.store.code.set(doc.code);
      core.select([st.sel]);
      core.draw();
      o.shown = i;
    };
    const orderCommit = (): void => {
      const o = ord;
      if (!ordering) return;
      ordering = false;
      if (!o || o.shown == null || core.code === o.base.code) {
        core.rollback();
        return;
      }
      core.commit(t('history.order'));
      // the reached position becomes the new base, keeping the slider where it is
      ord = null;
      style?.refresh();
    };
    const moveSelection = (dir: -1 | 1): void => {
      const sel = core.selection();
      if (sel.length !== 1) {
        core.toast(t('order.selectOne'));
        return;
      }
      const res = moveOrder(core.code, core.meta, core.model, core.geom, sel[0]!, dir);
      if (res.reason) {
        core.toast(res.reason);
        return;
      }
      // the op already carried sequence metadata over to the new positional ids: no second remap
      applyDoc(core, t('history.order'), res, res.selection ?? sel);
    };
    cleanups.push(core.provide('moveSelection', moveSelection));

    // ---- the style toolbar
    const effRaw = (k: string): unknown => {
      const s = primary();
      if (!s) return undefined;
      if (multi()) k = k === 'text' ? TEXT_KEY[s.kind] ?? k : k === 'fontSize' ? SIZE_KEY[s.kind] ?? k : k === 'fontWeight' ? WEIGHT_KEY[s.kind] ?? k : k;
      return effectiveValue(env(), s, k);
    };
    const resolve = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('@') ? core.result.rctx.color(v) ?? v : v);
    const setOverride = (k: string | Readonly<Record<string, unknown>>, v?: unknown): void => {
      const s = primary();
      if (!s) return;
      const patch = typeof k === 'object' && k ? k : { [k as string]: v };
      const targets = multi() ? core.selection() : [s];
      // a mixed selection's Border / Fill are the boxes' look: connectors there take only the text keys
      const mixed = targets.some((x) => x.kind !== s.kind);
      const lines = mixed ? targets.filter((x) => LINE_KINDS.has(x.kind)) : [];
      const boxes = lines.length ? targets.filter((x) => !LINE_KINDS.has(x.kind)) : targets;
      const textPatch = lines.length ? Object.fromEntries(Object.entries(patch).filter(([key]) => !BOX_LOOK.has(key))) : {};
      live.run(t('history.style'), () => {
        let meta = setStyle(core.meta, boxes, patch, { multi: multi() }).meta;
        if (Object.keys(textPatch).length) meta = setStyle(meta, lines, textPatch, { multi: true }).meta;
        core.store.meta.set(meta);
      });
    };
    // the counter's type filter: kinds taken out of a multi-selection can be put back while that selection lasts
    let typeBase: { items: Sel[]; shown: string } | null = null;
    const typeItems = (): Sel[] => {
      const cur = core.selection();
      if (typeBase && typeBase.shown !== selKey(cur)) typeBase = null;
      return typeBase?.items ?? cur;
    };
    // several items of one kind: actions that work on one item run on each of them
    const sameKind = (): Sel[] => {
      const s = primary();
      const sel = core.selection();
      return s && sel.every((x) => x.kind === s.kind) ? sel : s ? [s] : [];
    };
    const ARRANGE: Record<ArrangeOp, 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist'> = {
      left: 'left', hcenter: 'center', right: 'right', top: 'top', vcenter: 'middle', bottom: 'bottom', hdist: 'hdist', vdist: 'vdist',
    };
    let destroyed = false;
    let style: ToolbarHandle | null = null;
    let styleArgs: [ToolbarApi, ToolbarOptions] | null = null;
    let styleLoading: Promise<void> | null = null;
    // the style toolbar code loads with the first selection (prefetched when the browser is idle)
    const ensureStyleBar = (): Promise<void> => (styleLoading ??= import('../../../ui/style-toolbar.js').then(({ createToolbar }) => {
      if (!styleArgs || style || destroyed) return;
      style = createToolbar(wrap, ...styleArgs);
      cleanups.push(() => style?.destroy());
      sync(true);
    }));
    if (f.styleToolbar) {
      styleArgs = [{
        selection: () => primary(),
        editable: () => core.mode.peek() === 'edit' && !!core.model.type && core.tool.peek() !== 'hand' && core.tool.peek() !== 'pen',
        multiCount: () => core.selection().length,
        selectionTypes: () => {
          const items = typeItems();
          if (items.length < 2) return null;
          const on = new Set<string>(core.selection().map((x) => x.kind));
          const counts = new Map<string, number>();
          for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
          return [...counts].map(([kind, count]) => ({ kind, count, selected: on.has(kind) }));
        },
        setTypeSelected: (kind, on) => {
          const items = typeItems();
          const kinds = new Set<string>(core.selection().map((x) => x.kind));
          if (on) kinds.add(kind);
          else kinds.delete(kind);
          const next = items.filter((x) => kinds.has(x.kind));
          if (!next.length) return;
          live.flush();
          typeBase = { items, shown: selKey(next) };
          core.select(next);
          core.fire('panels');
        },
        eff: (k) => resolve(effRaw(k)),
        effRaw,
        set: setOverride,
        commit: () => live.flush(),
        palette,
        localPalette,
        addLocalColor: addColor,
        removeLocalColor: removeColor,
        customColor: (hex) => relativeColor(hex, core.result.theme.palette),
        themeFont: () => core.result.theme.font,
        themeFontName: () => (core.result.theme.font.split(',')[0] ?? '').replace(/['"]/g, '').trim(),
        edgeEnds: () => {
          const s = primary();
          const M = core.model;
          const e = s && M.type === 'flowchart' ? M.edges.find((x) => x.id === s.id) : undefined;
          if (!s || !e) return {};
          const arrow = baseStyleOf(env(), 'edge', s.id).arrow;
          const map = (x: string): string | undefined => (x === 'arrow' ? (typeof arrow === 'string' ? arrow : undefined) : x);
          return { start: map(e.start), end: map(e.end) };
        },
        anchorRect: () => {
          const s = primary();
          return s ? anchorRect(core, s) : null;
        },
        hBounds: () => freeStrip(core),
        diagramType: () => core.model.type,
        isLocked: () => {
          const s = primary();
          return !!s && !!core.getM(s.kind, s.id).locked;
        },
        toggleLock: () => {
          const s = primary();
          if (!s) return;
          const locked = !!core.getM(s.kind, s.id).locked;
          live.flush();
          applyMeta(core, t(locked ? 'history.unlock' : 'history.lock'), setStyle(core.meta, multi() ? core.selection() : [s], { locked: locked ? undefined : true }));
        },
        isPainting: () => core.tool.peek() === 'paint',
        togglePaint: () => core.run('setPainting', core.tool.peek() !== 'paint'),
        canGroup: () => canGroup(core),
        group: () => void core.run('groupSelection'),
        ungroup: () => core.run('ungroupSelection'),
        arrange: (op) => core.run('arrange', ARRANGE[op]),
        activation: () => {
          const a = core.run('activationInfo');
          return a ? { participant: a.participant ?? '', ...(a.removed !== undefined ? { removed: a.removed } : {}), ...(a.reason !== undefined ? { reason: a.reason } : {}) } : null;
        },
        toggleActivation: () => core.run('applyActivation'),
        groupEditing: () => core.enteredGroup.peek(),
        editGroup: () => {
          const s = primary();
          if (!s) return;
          if (core.enteredGroup.peek() === s.id) core.run('exitGroup');
          else core.run('enterGroup', s.id);
        },
        del: () => core.run('deleteSelection'),
        order: () => {
          const o = orderInfo();
          return o && o.states.length > 1 ? { index: o.shown ?? o.index, count: o.states.length, labels: o.labels.map((l) => t(`order.${l}`)) } : null;
        },
        orderPreview,
        orderCommit,
        layers: () => layerDefs(core.meta).map((l) => ({ id: l.id, name: l.name, hidden: l.hidden })),
        currentLayer: () => {
          const c = new Set(core.selection().filter((x) => x.kind !== 'activation').map((it) => layerOf(core.meta, it.kind, it.id)));
          return c.size === 1 ? [...c][0]! : null;
        },
        setLayer: (lid) => {
          live.flush();
          const sel = core.selection().filter((x) => x.kind !== 'activation');
          if (!applyMeta(core, t('history.layer'), setLayer(core.meta, sel, lid))) return;
          const l = layerDefs(core.meta).find((x) => x.id === lid);
          core.toast(t(l?.hidden ? 'layers.movedHidden' : 'layers.moved', { name: l?.name ?? lid }));
        },
        newLayer: () => {
          live.flush();
          const res = newLayer(core.meta, core.selection().filter((x) => x.kind !== 'activation'));
          if (applyMeta(core, t('history.newLayer'), res)) core.toast(t('layers.createdRename', { n: res.id.slice(1) }));
        },
        renderPresets: (grid, done, actions) => {
          const s = primary();
          if (s) presetPicker(core, grid, s, { cols: 4, actions, after: done, targets: sameKind() });
        },
        preset: () => {
          const s = primary();
          const p = s ? core.getM(s.kind, s.id).preset : undefined;
          return typeof p === 'string' ? p : '';
        },
        presets: () => {
          const s = primary();
          return s ? Object.keys(presetsFor(env(), s.kind) ?? {}).filter((p) => p !== '_base') : [];
        },
        setPreset: (p) => setOverride('preset', p || undefined),
        reset: () => {
          const targets = sameKind();
          if (!targets.length) return;
          live.flush();
          applyMeta(core, t('history.resetStyle'), { meta: targets.reduce((meta, it) => resetItemStyle(meta, it).meta, core.meta) });
        },
        copy: () => core.run('copySelection'),
        duplicate: () => core.run('duplicateSelection'),
        canCopy: () => core.selection().some((it) => copyable(core.model, it)),
        canSavePreset: () => {
          const s = primary();
          return !!s && !multi() && canSavePreset(env(), s);
        },
        savePreset: () => {
          const s = primary();
          if (s) void saveItemAsPreset(core, s);
        },
        inspect: () => setPanel(core, 'properties', true),
        bendCount: () => sameKind().reduce((n, s) => {
          const pts = core.getM(s.kind, s.id).points;
          return n + (Array.isArray(pts) ? pts.length : 0);
        }, 0),
        hasOwnCurve: () => sameKind().some((s) => core.getM(s.kind, s.id)['curve'] !== undefined),
        resetCurve: () => {
          const targets = sameKind();
          if (!targets.length) return;
          live.flush();
          applyMeta(core, t('history.resetCurve'), { meta: targets.reduce((meta, it) => resetCurve(meta, it).meta, core.meta) });
        },
      }, {
        i18n: core.i18n,
        // a process on the canvas: its look, or delete (resized by its edges)
        kinds: { activation: { groups: [['presets'], ['border', 'fill'], ['paint', 'delete']] } },
      }];
      const w = globalThis as typeof globalThis & { requestIdleCallback?: (f: () => void) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(() => void ensureStyleBar());
    }

    // ---- the page's own action bar and its badge
    const pageRect = (): Rect | null => {
      const r = core.dom.page.querySelector('rect.page')?.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) {
        const b = core.result.result.bounds;
        return b.w ? core.rectOnScreen(b) : null;
      }
      const wr = wrap.getBoundingClientRect();
      return { x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height };
    };
    const canvasVal = (k: string): unknown => (pageEff(core) as Record<string, unknown>)[k] ?? (core.result.theme.canvas as unknown as Record<string, unknown>)[k];
    const seqDefaults = (): Record<string, unknown> => {
      const L = core.result.theme.sequence.layout as unknown as Record<string, unknown>;
      return { ...L, blockSpan: L['blockSpan'] || 'full' };
    };
    let page: PageToolbarHandle | null = null;
    let pageLoading: Promise<void> | null = null;
    // the page toolbar code loads the first time the page is selected (its badge): most sessions never open it
    const ensurePageBar = (): Promise<void> => (pageLoading ??= import('../../../ui/page-toolbar.js').then(({ createPageToolbar }) => {
      if (!pageApi || page) return;
      page = createPageToolbar(wrap, pageApi, { i18n: core.i18n });
      cleanups.push(() => page?.destroy());
      page.refresh();
    }));
    let pageApi: PageToolbarApi | null = null;
    if (f.pageToolbar) {
      pageApi = ({
        visible: () => core.pageSelected.peek() && core.mode.peek() === 'edit' && !!core.model.type && !core.selection().length,
        types: () => DIAGRAM_TYPES.map(([v, k]) => [v, t(k)] as const),
        diagramType: () => core.model.type,
        direction: () => (core.model.type === 'flowchart' || core.model.type === 'er' ? core.model.direction : null),
        directions: () => FLOW_DIRS.map(([v, k]) => [v, t(k)] as const),
        presets: () => {
          const M = core.model;
          if (!M.type) return [];
          const P = core.result.theme[M.type].pagePresets ?? {};
          return Object.entries(P).map(([id, p]) => [id, p.label || id] as const);
        },
        preset: () => (typeof core.meta.canvas.preset === 'string' ? core.meta.canvas.preset : undefined),
        sizeMode: () => (core.meta.canvas.w && core.meta.canvas.h ? 'custom' : 'fit'),
        ratio: () => (typeof pageEff(core).ratio === 'string' ? (pageEff(core).ratio as string) : ''),
        ratioLabel: () => {
          const r = typeof pageEff(core).ratio === 'string' ? (pageEff(core).ratio as string) : '';
          const k = RATIOS.find(([x]) => x === r)?.[1];
          return k ? (k.startsWith('ratio.') ? t(k) : k) : r;
        },
        ratios: () => RATIOS.map(([v, k]) => [v, k.startsWith('ratio.') ? t(k) : k] as const),
        get: (k) => {
          const v = canvasVal(k);
          return typeof v === 'string' ? (core.result.rctx.color(v) ?? v) : null;
        },
        getRaw: (k) => {
          const v = canvasVal(k);
          return typeof v === 'string' ? v : null;
        },
        hasRouting: () => core.model.type !== 'sequence', // messages are always straight
        routing: () => (typeof pageEff(core).routing === 'string' ? (pageEff(core).routing as string) : 'curved'),
        seq: () => {
          const M = core.model;
          if (M.type !== 'sequence') return null;
          const v = { ...seqDefaults(), ...(pageEff(core) as Record<string, unknown>) };
          const st: SequenceLayoutState = { gap: Number(v['gap']) || 0, rowH: Number(v['rowH']) || 0, blockSpan: String(v['blockSpan'] ?? 'full'), mirror: !!v['mirror'], autonumber: M.autonumber };
          return st;
        },
        setSeq: (k, v, o = {}) => {
          if (k === 'autonumber') {
            setAutonumberOn(core, !!v);
            page?.refresh();
            return;
          }
          const meta = setPageValue(core, k, v, seqDefaults()[k]);
          if (o.live) live.run(t('history.page'), () => core.store.meta.set(meta));
          else {
            live.flush();
            applyMeta(core, t('history.page'), { meta });
            page?.refresh();
          }
        },
        set: (patch) => {
          live.flush();
          let meta = core.meta;
          for (const [k, v] of Object.entries(patch)) meta = setPageValueOn(core, meta, k, v);
          applyMeta(core, t('history.page'), { meta });
          page?.refresh();
        },
        setType: (type) => void switchDiagramType(core, type as DiagramType),
        setDirection: (d) => {
          setFlowDirection(core, d as Direction);
          page?.refresh();
        },
        setPreset: (id) => {
          choosePagePreset(core, id);
          page?.refresh();
        },
        setSizeMode: (m) => {
          setPageSizeMode(core, m);
          page?.refresh();
        },
        setRatio: (r) => {
          setPageRatio(core, r);
          page?.refresh();
        },
        setRouting: (v) => {
          applyMeta(core, t('history.page'), { meta: setPageValue(core, 'routing', v, 'curved') });
          page?.refresh();
        },
        palette,
        localPalette,
        addLocalColor: addColor,
        removeLocalColor: removeColor,
        rect: pageRect,
        hBounds: () => freeStrip(core),
        topInset: () => 64, // below the top-right controls and the problems bar
      });
    }

    const badge = h('button', { type: 'button', class: 'page-badge edit-only', hidden: true, 'aria-pressed': 'false' });
    if (f.pageToolbar) wrap.append(badge);
    badge.addEventListener('click', () => {
      core.select([]);
      core.pageSelected.set(true);
      core.drawOverlay();
      core.fire('panels');
      sync(true);
      void ensurePageBar();
    }, sig);
    badge.addEventListener('pointerdown', (ev) => ev.stopPropagation(), sig);
    const placeBadge = (): void => {
      const type = core.model.type;
      const r = pageRect();
      badge.hidden = !type || !r?.w || core.mode.peek() !== 'edit';
      if (badge.hidden || !r || !type) return;
      const label = t(`type.${type}`);
      badge.textContent = label;
      badge.title = t('page.badgeTip', { type: label });
      const on = core.pageSelected.peek() && !core.selection().length;
      badge.setAttribute('aria-pressed', String(on));
      badge.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y - (badge.offsetHeight || 22) - 6)}px)`;
    };

    // ---- keep both bars in step: rebuilt when what they show changes, else only re-placed
    let tbKey = '';
    let pageKey = '';
    const sync = (force = false): void => {
      placeBadge();
      if (page) {
        const { gap: _g, rowH: _r, ...shown } = core.meta.canvas; // slider values change while dragging: leave them out
        const key = `${core.pageSelected.peek()}|${core.mode.peek()}|${core.selection().length}|${core.model.type}|${core.model.type === 'flowchart' || core.model.type === 'er' ? core.model.direction : ''}|${core.model.type === 'sequence' ? core.model.autonumber : ''}|${JSON.stringify(shown)}`;
        if (force || key !== pageKey) {
          pageKey = key;
          page.refresh();
        } else page.place();
      }
      if (!style) {
        if (styleArgs && core.selection().length) void ensureStyleBar();
        return;
      }
      const key = core.mode.peek() === 'edit' && !core.inlineEditing ? selKey(core.selection()) + `|${core.tool.peek()}` : '';
      if (ordering) {
        style.place();
        return;
      }
      if (force || key !== tbKey) {
        tbKey = key;
        style.refresh();
      } else style.place();
    };
    // after a committed change the values shown may differ: rebuild unless a popover (slider) is in use
    const afterCommit = (): void => {
      if (ordering) return;
      if (style && !style.isOpen()) {
        tbKey = '';
      }
      if (page && !page.isOpen()) pageKey = '';
      sync();
    };
    cleanups.push(
      core.on('draw', () => sync()),
      core.on('selection', () => sync()),
      core.on('mode', () => sync(true)),
      core.on('tool', () => sync()),
      core.on('panels', afterCommit),
      core.on('view', () => {
        placeBadge();
        style?.place();
        page?.place();
      }),
      core.provide('refreshToolbar', () => sync(true)),
    );
    sync(true);

    return () => {
      destroyed = true;
      live.flush();
      ac.abort();
      for (const c of cleanups) c();
      badge.remove();
    };
  },
};

/** setPage over an explicit metadata object (several page keys in one step). */
function setPageValueOn(core: EditorCore, meta: DiagramMeta, k: string, v: unknown): DiagramMeta {
  const out: DiagramMeta = JSON.parse(JSON.stringify(meta)) as DiagramMeta;
  const name = out.canvas.preset;
  const M = core.model;
  const P = M.type ? (core.result.theme[M.type].pagePresets ?? {}) : {};
  const preset = typeof name === 'string' && Object.hasOwn(P, name) ? (P[name] as Record<string, unknown>) : undefined;
  const base = preset?.[k];
  if (v === undefined || v === base) delete out.canvas[k];
  else out.canvas[k] = v;
  return out;
}
