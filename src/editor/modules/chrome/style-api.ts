// The style toolbar's API over the editor (A.7 rows 39, 58–60, 64): effective values and overrides (one history step
// per slider run), the text format menu, presets, layers, lock, paint, group / arrange / process actions, media, the
// type filter of a multi-selection, and the Order slider.
import { withOps } from '../../../core/kinds/registry.js';
import { anchorRect, freeStrip } from '../../lib/place.js';
import { editKind, withEdit } from '../../kinds/registry.js';
import { layerDefs, layerOf } from '../../../core/layers.js';
import { copyable } from '../../../core/ops/clipboard.js';
import { canSavePreset, resetCurve, resetItemStyle, setStyle, SIZE_KEY, TEXT_KEY, WEIGHT_KEY } from '../../../core/ops/style-ops.js';
import { newLayer, setLayer } from '../../../core/ops/palette.js';
import { baseStyleOf, effectiveValue, presetsFor } from '../../../core/ops/style-env.js';
import { relativeColor } from '../../../core/theme/colors.js';
import type { ArrangeOp, ToolbarApi } from '../../../ui/diagram/style-toolbar.js';
import type { Sel, TextEditSession } from '../../core.js';
import { saveItemAsPreset, presetPicker } from '../../lib/presets.js';
import { styleWithShapes } from '../../ops/shape.js';
import { mediaOf, mediaTargets, setImageFit, setMediaOf } from '../../ops/media.js';
import { applyMeta, styleEnv } from '../../ops/doc.js';
import { canGroup, groupResetState, resetSelectedGroup } from '../../ops/group.js';
import { LINE_KINDS } from '../../lib/canvas.js';
import { formatsAt, hasMarkup, toggleFormat } from '../../ops/format.js';
import { labelSpec } from '../../ops/label.js';
import { animationOf, setAnimation } from '../../ops/animation.js';
import { selectionKey as selKey, type BarContext } from './bar-context.js';
import type { OrderSlider } from './order-slider.js';
import type { PaletteApi } from './palette-api.js';

/** Keys of a box's look (border, fill, corners): not a connector's. */
const BOX_LOOK: ReadonlySet<string> = new Set(['fill', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeOpacity', 'radius', 'dash', 'shape', 'stack']);

export function styleToolbarApi({ core, t, live, primary, multi }: BarContext, pal: PaletteApi, order: OrderSlider): ToolbarApi {
  const env = () => styleEnv(core);
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
        core.applyCode(spec.apply(r.text, spec.markdown || hasMarkup(r.text)), t('history.formatText'), { select: [s] });
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
  return {
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
    ...pal,
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
      const o = order.info();
      return o && o.states.length > 1 ? { index: o.shown ?? o.index, count: o.states.length, labels: o.labels.map((l) => t(`order.${l}`)) } : null;
    },
    orderPreview: order.preview,
    orderCommit: order.commit,
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
  };
}
