// The page bar's API over the editor (A.7 row 63): the diagram type and direction, the page preset, size and ratio,
// its colours, routing, the sequence layout, the diagram palette; one history step per change (a slider's run
// coalesced).
import { editKind, withEdit } from '../../kinds/registry.js';
import { freeStrip } from '../../lib/place.js';
import type { Direction, DiagramType } from '../../../core/model.js';
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { Rect } from '../../../core/types.js';
import type { PageToolbarApi, SequenceLayoutState } from '../../../ui/diagram/page-toolbar.js';
import type { EditorCore } from '../../core.js';
import { applyMeta, diagramTypeChoices, FLOW_DIRS, setAutonumberOn, setFlowDirection, switchDiagramType } from '../../ops/doc.js';
import { choosePagePreset, pageEff, RATIOS, setPageRatio, setPageSizeMode, setPageValue } from '../../ops/page.js';
import type { BarContext } from './bar-context.js';
import type { PaletteApi } from './palette-api.js';

/** `refresh`: the bar shows the new values; `rect`: the page on screen. */
export function pageToolbarApi({ core, t, live }: BarContext, pal: PaletteApi, refresh: () => void, rect: () => Rect | null): PageToolbarApi {
  const canvasVal = (k: string): unknown => (pageEff(core) as Record<string, unknown>)[k] ?? (core.result.theme.canvas as unknown as Record<string, unknown>)[k];
  const seqDefaults = (): Record<string, unknown> => {
    const L = core.result.theme.sequence.layout as unknown as Record<string, unknown>;
    return { ...L, blockSpan: L['blockSpan'] || 'full' };
  };
  return {
    visible: () => core.pageSelected.peek() && core.mode.peek() === 'edit' && !!core.model.type && !core.selection().length,
    types: () => diagramTypeChoices().map(([v, k]) => [v, t(k)] as const),
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
        refresh();
        return;
      }
      const meta = setPageValue(core, k, v, seqDefaults()[k]);
      if (o.live) live.run(t('history.page'), () => core.write({ meta: meta }));
      else {
        live.flush();
        applyMeta(core, t('history.page'), { meta });
        refresh();
      }
    },
    set: (patch) => {
      live.flush();
      let meta = core.meta;
      for (const [k, v] of Object.entries(patch)) meta = setPageValueOn(core, meta, k, v);
      applyMeta(core, t('history.page'), { meta });
      refresh();
    },
    setType: (type) => void switchDiagramType(core, type as DiagramType),
    setDirection: (d) => {
      setFlowDirection(core, d as Direction);
      refresh();
    },
    setPreset: (id) => {
      choosePagePreset(core, id);
      refresh();
    },
    setSizeMode: (m) => {
      setPageSizeMode(core, m);
      refresh();
    },
    setRatio: (r) => {
      setPageRatio(core, r);
      refresh();
    },
    setRouting: (v) => {
      applyMeta(core, t('history.page'), { meta: setPageValue(core, 'routing', v, 'curved') });
      refresh();
    },
    ...pal,
    rect,
    hBounds: () => freeStrip(core),
    topInset: () => 64, // below the top-right controls and the problems bar
  };
}

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
