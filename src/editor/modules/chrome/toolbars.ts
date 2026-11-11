// Floating style toolbar and page toolbar wiring (A.7 rows 39, 58–60, 63, 64, 88; prototype app ~1390–1795 and
// ~3529–3637): the toolbar API over the editor (effective values, overrides as one history step per run, presets,
// layers, the diagram palette "+", lock, paint, group / arrange / activation actions), the Order slider with a live
// preview committed once (`orderInfo` / `orderPreview` / `orderCommit`), ⌘[ / ⌘] (`moveSelection`), the page badge
// above the page's top-left corner and the page's own action bar.
import { opsKind, withOps } from '../../../core/kinds/registry.js';
import { anchorRect, freeStrip } from '../../lib/place.js';
import { editKind, withEdit } from '../../kinds/registry.js';
import { layerDefs, layerOf } from '../../../core/layers.js';
import { copyable } from '../../../core/ops/clipboard.js';
import { addLocalColor, canSavePreset, newLayer, removeLocalColor, resetCurve, resetItemStyle, setLayer, setStyle, SIZE_KEY, TEXT_KEY, WEIGHT_KEY, } from '../../../core/ops/meta-ops.js';
import { applyOrderState, moveOrder, orderPositions, type OrderPositions } from '../../../core/ops/order.js';
import { baseStyleOf, effectiveValue, presetsFor } from '../../../core/ops/style-env.js';
import { relativeColor } from '../../../core/theme/colors.js';
import type { Direction, DiagramType } from '../../../core/model.js';
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { ItemRef, Rect } from '../../../core/types.js';
import type { PageToolbarApi, PageToolbarHandle, SequenceLayoutState } from '../../../ui/diagram/page-toolbar.js';
import type { ArrangeOp, ToolbarApi, StyleToolbarHandle, StyleToolbarOptions } from '../../../ui/diagram/style-toolbar.js';
import { TOOLBAR_CSS } from '../../../ui/diagram/toolbar-styles.js';
import { h } from '../../../ui/kit/h.js';
import type { EditorCore, Sel, TextEditSession } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { saveItemAsPreset, presetPicker } from '../../lib/presets.js';
import { styleWithShapes } from '../../ops/shape.js';
import { mediaOf, mediaTargets, setImageFit, setMediaOf } from '../../ops/media.js';
import { applyDoc, applyMeta, DIAGRAM_TYPES, FLOW_DIRS, setAutonumberOn, setFlowDirection, styleEnv, switchDiagramType } from '../../ops/doc.js';
import { canGroup, groupResetState, resetSelectedGroup } from '../../ops/group.js';
import { LiveEdit } from '../../ops/live.js';
import { choosePagePreset, pageEff, RATIOS, setPageRatio, setPageSizeMode, setPageValue } from '../../ops/page.js';
import { LINE_KINDS } from '../../lib/canvas.js';
import { formatsAt, hasMarkup, toggleFormat } from '../../ops/format.js';
import { labelSpec } from '../../ops/label.js';
import { animationOf, setAnimation } from '../../ops/animation.js';

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


export const toolbarsModule: EditorModule = {
  id: 'toolbars',
  css: [TOOLBARS_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const live = new LiveEdit(core);
    const wrap = core.dom.wrap;

    // the item whose text is being edited keeps its toolbar: the text format menu acts on the selected words
    const primary = (): Sel | null => (core.mode.peek() !== 'edit' ? null : core.inlineEditing ? { ...core.inlineEditing } : core.selection()[0] ?? null);
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
    let orderTx = 0;
    const orderInfo = (): typeof ord => {
      const sel = core.selection();
      if (sel.length !== 1) return null;
      const s = sel[0]!;
      const key = `${core.code}\u0000${s.kind}:${s.id}`;
      if (ord?.key === key) return ord;
      const g = core.geom;
      ord = { ...orderPositions(core.code, core.model, s), key, base: { code: core.code, meta: JSON.parse(JSON.stringify(core.meta)) as DiagramMeta, model: core.model, participants: g.type ? opsKind(g.type)?.swapBoxes?.(g) ?? null : null }, shown: null };
      return ord;
    };
    const orderPreview = (i: number): void => {
      const o = ord;
      const st = o?.states[i];
      if (!o || !st) return;
      if (!ordering || core.store.txId !== orderTx) {
        core.begin();
        ordering = true;
        orderTx = core.store.txId;
      }
      const doc = applyOrderState(o.base, st);
      core.write({ meta: doc.meta });
      core.write({ code: doc.code });
      core.select([st.sel]);
      core.draw();
      o.shown = i;
    };
    const orderCommit = (): void => {
      const o = ord;
      if (!ordering) return;
      ordering = false;
      if (core.store.txId !== orderTx) {
        // cancelled meanwhile (undo, a load, a stage switch): the base is stale
        ord = null;
        return;
      }
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
    scope.onDispose(core.provide('moveSelection', moveSelection));

    // ---- the style toolbar
    /**
     * What the text format menu formats: the open text editor (its selected words, else its whole text), else the
     * selected item's whole label; null when the label cannot be rich (a markdown string), where Bold is a style switch.
     */
    const textTarget = (): Pick<TextEditSession, 'formats' | 'format'> | null => {
      if (core.inlineEditing) return core.textEdit?.rich ? core.textEdit : null;
      const s = primary();
      if (!s || multi()) return null;
      const spec = labelSpec(core, s.kind, s.id);
      if (!spec || !(spec.markdown || spec.canMarkdown)) return null;
      // a label made bold by its style (the layout metadata or the theme) reads as bold too
      const key = WEIGHT_KEY[s.kind] ?? 'fontWeight';
      const weight = (): number => {
        const w = effectiveValue(env(), s, key);
        return typeof w === 'number' ? w : w === 'bold' ? 700 : Number(w) || 400;
      };
      return {
        formats: () => {
          const f = formatsAt(spec.value, 0, 0);
          return { ...f, b: f.b || weight() >= 600 };
        },
        format: (f) => {
          live.flush();
          const marked = formatsAt(spec.value, 0, 0).b;
          if (f === 'b' && !marked && weight() >= 600) {
            setOverride(key, 400);
            return;
          }
          const r = toggleFormat(spec.value, 0, 0, f);
          core.applyCode(spec.apply(r.text, spec.markdown || hasMarkup(r.text)), 'Format text', { select: [s] });
        },
      };
    };
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
      // a picked shape goes to the code where the type keeps shapes there (one history step with the rest of the patch)
      if (typeof patch['shape'] === 'string' && patch['shape']) {
        live.flush();
        const rest = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'shape'));
        const done = styleWithShapes(core, boxes, patch, t('history.style'), (meta) => {
          let m = setStyle(meta, boxes, rest, { multi: multi() }).meta;
          if (Object.keys(textPatch).length) m = setStyle(m, lines, textPatch, { multi: true }).meta;
          return m;
        });
        if (done) return;
      }
      live.run(t('history.style'), () => {
        let meta = setStyle(core.meta, boxes, patch, { multi: multi() }).meta;
        if (Object.keys(textPatch).length) meta = setStyle(meta, lines, textPatch, { multi: true }).meta;
        core.write({ meta: meta });
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
    let style: StyleToolbarHandle | null = null;
    let styleArgs: [ToolbarApi, StyleToolbarOptions] | null = null;
    let styleLoading: Promise<void> | null = null;
    // the style toolbar code loads with the first selection (prefetched when the browser is idle)
    const ensureStyleBar = (): Promise<void> => (styleLoading ??= import('../../../ui/diagram/style-toolbar.js').then(({ createStyleToolbar, SHAPE_PALETTE_CSS }) => {
      if (!styleArgs || style || destroyed) return;
      core.addCss([SHAPE_PALETTE_CSS]);
      style = createStyleToolbar(wrap, ...styleArgs);
      scope.onDispose(() => style?.destroy());
      if (!scope.active) style.el.remove();
      else sync(true);
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
        animation: () => {
          const s = primary();
          return s && !multi() ? animationOf(core, s) : null;
        },
        setAnimation: (a) => {
          const s = primary();
          if (!s) return;
          live.flush();
          setAnimation(core, s, a);
        },
        edgeEnds: () => {
          const s = primary();
          const e = s ? withOps(core.model, (k, m) => k.codeEnds?.(m, s)) : null;
          if (!s || !e) return {};
          const arrow = baseStyleOf(env(), 'edge', s.id).arrow;
          const map = (x: string): string | undefined => (x === 'arrow' ? (typeof arrow === 'string' ? arrow : undefined) : x);
          return { start: map(e.start), end: map(e.end) };
        },
        // the type's own controls (T11.3): a message's arrow in the code, one-click actions of one item
        codeArrow: () => {
          const s = primary();
          return s && core.selection().length === 1 ? withEdit(core.model, (k, m) => k.codeArrow?.(core, m, s)) ?? null : null;
        },
        itemActions: () => {
          const s = primary();
          return s && core.selection().length === 1 ? withEdit(core.model, (k, m) => k.actions?.(core, m, s)) ?? [] : [];
        },
        anchorRect: () => {
          const s = primary();
          return s ? anchorRect(core, s) : null;
        },
        hBounds: () => freeStrip(core),
        orderTitle: () => editKind(core.model.type)?.orderTitle,
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
        textFormats: () => textTarget()?.formats() ?? null,
        textFormat: (f) => textTarget()?.format(f),
        textPartial: () => !!core.textEdit?.partial(),
        textEditing: () => !!core.inlineEditing,
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
        inspect: () => void core.run('setPanel', 'properties', true),
        // "Reset positions in this group" (T07): one selected group of a type with the action
        groupPositions: () => (multi() ? null : groupResetState(core, primary())),
        resetGroupPositions: () => {
          live.flush();
          resetSelectedGroup(core);
        },
        // icons and images (T05): the kind's media of the selected item
        media: () => {
          const s = primary();
          const m = s ? mediaOf(core, s) : null;
          if (!s || !m) return null;
          const fit = core.getM(s.kind, s.id)['imgFit'];
          return { ...m, ...(typeof fit === 'string' ? { fit } : {}) };
        },
        pickImage: (anchor) => core.run('openImageTool', anchor, { insert: false }),
        setMedia: (patch) => {
          live.flush();
          const { fit, ...rest } = patch;
          const refs = mediaTargets(core, 'icon');
          if (fit !== undefined) setImageFit(core, refs, fit);
          if (Object.keys(rest).length) setMediaOf(core, refs, rest);
        },
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
    // the page is the render's bounds (render/page.ts): placed from the view, never measured (reading the page's box
    // forced a layout of the whole picture on every pan and zoom step)
    const pageRect = (): Rect | null => {
      const b = core.result.result.bounds;
      return b.w ? core.rectOnScreen(b) : null;
    };
    const canvasVal = (k: string): unknown => (pageEff(core) as Record<string, unknown>)[k] ?? (core.result.theme.canvas as unknown as Record<string, unknown>)[k];
    const seqDefaults = (): Record<string, unknown> => {
      const L = core.result.theme.sequence.layout as unknown as Record<string, unknown>;
      return { ...L, blockSpan: L['blockSpan'] || 'full' };
    };
    let page: PageToolbarHandle | null = null;
    let pageLoading: Promise<void> | null = null;
    // the page toolbar code loads the first time the page is selected (its badge): most sessions never open it
    const ensurePageBar = (): Promise<void> => (pageLoading ??= import('../../../ui/diagram/page-toolbar.js').then(({ createPageToolbar }) => {
      if (!pageApi || page) return;
      page = createPageToolbar(wrap, pageApi, { i18n: core.i18n });
      scope.onDispose(() => page?.destroy());
      if (!scope.active) page.el.remove();
      else page.refresh();
    }));
    let pageApi: PageToolbarApi | null = null;
    if (f.pageToolbar) {
      pageApi = ({
        visible: () => core.pageSelected.peek() && core.mode.peek() === 'edit' && !!core.model.type && !core.selection().length,
        types: () => DIAGRAM_TYPES.map(([v, k]) => [v, t(k)] as const),
        diagramType: () => core.model.type,
        direction: () => withEdit(core.model, (k, m) => k.direction?.(m)) ?? null,
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
        hasRouting: () => !editKind(core.model.type)?.straight, // sequence messages are always straight
        routing: () => (typeof pageEff(core).routing === 'string' ? (pageEff(core).routing as string) : 'curved'),
        seq: () => {
          const kind = editKind(core.model.type);
          if (!kind?.layout) return null;
          const v = { ...seqDefaults(), ...(pageEff(core) as Record<string, unknown>) };
          const st: SequenceLayoutState = { gap: Number(v['gap']) || 0, rowH: Number(v['rowH']) || 0, blockSpan: String(v['blockSpan'] ?? 'full'), mirror: !!v['mirror'], autonumber: withEdit(core.model, (k, m) => k.numbered?.(m)) ?? false };
          return st;
        },
        setSeq: (k, v, o = {}) => {
          if (k === 'autonumber') {
            setAutonumberOn(core, !!v);
            page?.refresh();
            return;
          }
          const meta = setPageValue(core, k, v, seqDefaults()[k]);
          if (o.live) live.run(t('history.page'), () => core.write({ meta: meta }));
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
    let badgeH = 0;
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
      badgeH ||= badge.offsetHeight; // measured once: its height does not change
      badge.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y - (badgeH || 22) - 6)}px)`;
    };

    // ---- keep both bars in step: rebuilt when what they show changes, else only re-placed
    let tbKey = '';
    let pageKey = '';
    /** A sync skipped while an item was dragged: done when the gesture ends (its overlay is drawn then). */
    let afterDrag = false;
    const sync = (force = false): void => {
      placeBadge();
      // the bars are hidden while an item is dragged (`.ed.dragging`): placing them on every move only forces layouts
      if (core.dragging && !force) {
        afterDrag = true;
        return;
      }
      afterDrag = false;
      if (page) {
        const { gap: _g, rowH: _r, ...shown } = core.meta.canvas; // slider values change while dragging: leave them out
        const key = `${core.pageSelected.peek()}|${core.mode.peek()}|${core.selection().length}|${core.model.type}|${withEdit(core.model, (k, m) => k.direction?.(m)) ?? ''}|${withEdit(core.model, (k, m) => k.numbered?.(m)) ?? ''}|${JSON.stringify(shown)}`;
        if (force || key !== pageKey) {
          pageKey = key;
          page.refresh();
        } else page.place();
      }
      if (!style) {
        if (styleArgs && core.selection().length) void ensureStyleBar();
        return;
      }
      const te = core.textEdit;
      const text = core.inlineEditing ? `|text:${te ? `${te.partial()}${JSON.stringify(te.formats())}` : ''}` : '';
      const key = core.mode.peek() === 'edit' ? selKey(core.inlineEditing ? [core.inlineEditing] : core.selection()) + `|${core.tool.peek()}${text}` : '';
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
    // the toolbars are created after install (on first use): detached while the module is suspended (History, where
    // their popovers would edit the document), back and placed again when it resumes
    scope.register({
      set: (on) => {
        for (const bar of [style, page]) {
          if (!bar) continue;
          if (on) {
            if (!bar.el.parentNode) wrap.append(bar.el);
          } else {
            bar.close();
            bar.el.remove();
          }
        }
        if (on) sync(true);
      },
      dispose: () => undefined,
    });
    const afterCommit = (): void => {
      if (ordering) return;
      if (style && !style.isOpen()) {
        tbKey = '';
      }
      if (page && !page.isOpen()) pageKey = '';
      sync();
    };
    for (const off of [
      core.on('draw', () => sync()),
      core.on('selection', () => sync()),
      core.on('mode', () => sync(true)),
      core.on('tool', () => sync()),
      core.on('panels', afterCommit),
      core.on('overlay', () => {
        if (afterDrag && !core.dragging) sync();
      }),
      core.on('view', () => {
        placeBadge();
        style?.place();
        page?.place();
      }),
      core.provide('refreshToolbar', () => sync(true)),
    ]) scope.onDispose(off);
    sync(true);

    return () => {
      destroyed = true;
      live.flush();
      ac.abort();
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
