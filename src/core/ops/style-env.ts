// Effective style values of an item as the editor shows them (prototype app `presetsFor`, `currentPreset`,
// `baseStyle`, `effValue`, `nodeShapeOf`, `participantShapeOf`): theme < shape default < diagram `_base` < preset
// < the item's own metadata. Pure: everything comes in through a StyleEnv instead of the prototype's globals.
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { edgePreset, flowPresets, groupPreset, nodePreset } from '../render/flowchart.js';
import { erPresets } from '../render/er.js';
import { effectivePage } from '../render/page.js';
import { seqPresets } from '../render/sequence.js';
import { mergeLayers, type StyleProps } from '../style.js';
import type { ResolvedTheme, ThemeFile } from '../theme/types.js';
import type { ItemKind, ItemRef } from '../types.js';
import { getM } from './meta-util.js';

export interface StyleEnv {
  model: DiagramModel;
  meta: DiagramMeta;
  /** The active theme, colours resolved. */
  theme: ResolvedTheme;
  /**
   * The active theme merged but NOT resolved (`ThemeRegistry.merged(id)`): presets saved from a theme preset keep
   * their palette references (`@lime`) and so still follow theme switches. Falls back to `theme`.
   */
  rawTheme?: ThemeFile | null;
  /**
   * Colour resolver (`createColorResolver`). When given, colour values of base styles are resolved, as the
   * prototype's global resolver did; a value it cannot resolve is kept as written.
   */
  color?: (v: unknown) => string | undefined;
}

export type Presets = Record<string, StyleProps>;

const COLOR_KEYS = new Set(['fill', 'stroke', 'text', 'color', 'labelColor', 'titleColor', 'attrColor']);

/** Theme presets plus the diagram's own, for an item kind of the current diagram type (undefined: no presets). */
export function presetsFor(env: StyleEnv, kind: ItemKind): Presets | undefined {
  const { model, theme: T, meta } = env;
  if (model.type === 'flowchart') return (flowPresets(T, meta) as unknown as Record<string, Presets>)[kind];
  if (model.type === 'sequence') return (seqPresets(T, meta) as unknown as Record<string, Presets>)[kind];
  if (model.type === 'er') return (erPresets(T, meta) as unknown as Record<string, Presets>)[kind];
  return {};
}

/** The theme's own default style of an item kind. */
export function defaultsFor(theme: ResolvedTheme, kind: ItemKind): StyleProps | undefined {
  const F = theme.flowchart, Sq = theme.sequence, E = theme.er;
  const map: Record<ItemKind, StyleProps | undefined> = {
    node: F.node, group: F.group, edge: F.edge,
    participant: Sq.participant, message: Sq.message, block: Sq.block, note: Sq.note, activation: Sq.activation, box: Sq.box,
    entity: E.entity, rel: E.rel,
  };
  return map[kind];
}

/** The theme's presets of a kind; `raw`: from the unresolved theme (palette references kept). */
export function themePresetsOf(env: StyleEnv, kind: ItemKind, raw = false): Presets {
  const T = (raw ? env.rawTheme : null) ?? env.theme;
  const F = T.flowchart, Sq = T.sequence, E = T.er;
  const map: Partial<Record<ItemKind, Presets | undefined>> = {
    node: F?.nodePresets, group: F?.groupPresets, edge: F?.edgePresets, participant: Sq?.participantPresets,
    message: Sq?.messagePresets, block: Sq?.blockPresets, activation: Sq?.activationPresets, box: Sq?.boxPresets,
    note: Sq?.notePresets, entity: E?.entityPresets, rel: E?.relPresets,
  };
  return map[kind] ?? {};
}

/** A preset defined in this diagram (and not in the theme). */
export const isLocalPreset = (env: StyleEnv, kind: ItemKind, name: string): boolean =>
  !!env.meta.styles[kind]?.[name] && !Object.hasOwn(themePresetsOf(env, kind), name);

/** The preset an item is drawn with: its own, else (flowchart) one derived from its Mermaid classes / shape / line. */
export function currentPreset(env: StyleEnv, { kind, id }: ItemRef): string {
  const { model, meta } = env;
  if (model.type === 'flowchart' && (kind === 'node' || kind === 'edge' || kind === 'group')) {
    const P = flowPresets(env.theme, meta);
    if (kind === 'node') {
      const n = model.nodes.get(id);
      return n ? nodePreset(n, meta, P) : '';
    }
    if (kind === 'edge') {
      const e = model.edges.find((x) => x.id === id);
      return e ? edgePreset(e, meta, P) : '';
    }
    const g = model.groups.get(id);
    return g ? groupPreset(g, meta, P) : '';
  }
  const p = getM(meta, kind, id).preset;
  return typeof p === 'string' ? p : '';
}

/** The item's preset as the toolbar names it (own, else derived for flowchart items). */
export function presetOfItem(env: StyleEnv, ref: ItemRef): string {
  const own = getM(env.meta, ref.kind, ref.id).preset;
  if (typeof own === 'string' && own) return own;
  return ref.kind === 'node' || ref.kind === 'edge' || ref.kind === 'group' ? currentPreset(env, ref) : '';
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** The shape a participant is drawn with — as the renderer: own > Mermaid's declaration / actor > preset > theme. */
export function participantShapeOf(env: StyleEnv, id: string): string {
  const { model, meta, theme } = env;
  const p = model.type === 'sequence' ? model.participants.find((x) => x.id === id) : undefined;
  const m = getM(meta, 'participant', id);
  const preset = typeof m.preset === 'string' ? m.preset : '';
  return str(m.shape) ?? str(p?.shape) ?? (p?.kind === 'actor' ? 'actor' : undefined) ?? str(presetsFor(env, 'participant')?.[preset]?.shape) ?? str(theme.sequence.participant.shape) ?? 'box';
}

/** The shape a node is drawn with (its own, its preset's or its Mermaid shape). */
export function nodeShapeOf(env: StyleEnv, id: string): string {
  const { model, meta, theme } = env;
  const n = model.type === 'flowchart' ? model.nodes.get(id) : undefined;
  const m = getM(meta, 'node', id);
  const pst = presetsFor(env, 'node')?.[currentPreset(env, { kind: 'node', id })];
  return str(m.shape) ?? str(pst?.shape) ?? (n && n.shape !== 'rect' ? n.shape : str(theme.flowchart.node.shape) ?? 'rect');
}

/** Theme + shape default + diagram `_base` + preset, with colour values resolved when `env.color` is given. */
export function baseStyleOf(env: StyleEnv, kind: ItemKind, id: string | null): StyleProps & Record<string, unknown> {
  const { theme, meta } = env;
  const preset = id != null ? currentPreset(env, { kind, id }) : '';
  const shapeDef = id == null ? undefined
    : kind === 'node' ? theme.flowchart.nodeShapes?.[nodeShapeOf(env, id)]
      : kind === 'participant' ? theme.sequence.participantShapes?.[participantShapeOf(env, id)]
        : undefined;
  const layers: (object | undefined)[] = [defaultsFor(theme, kind), shapeDef, meta.styles[kind]?.['_base'], presetsFor(env, kind)?.[preset]];
  const b = mergeLayers<StyleProps & Record<string, unknown>>(...(layers as Record<string, unknown>[]));
  if (env.color) for (const k of Object.keys(b)) if (COLOR_KEYS.has(k) && typeof b[k] === 'string') b[k] = env.color(b[k]) ?? b[k];
  return b;
}

/** Effective value of one property (prototype app `effValue`): own metadata, else what the item inherits. */
export function effectiveValue(env: StyleEnv, ref: ItemRef, k: string): unknown {
  const { kind, id } = ref;
  const own = (getM(env.meta, kind, id) as Record<string, unknown>)[k];
  if (own !== undefined) return own;
  const { model } = env;
  if (k === 'link' && kind === 'node') return model.type === 'flowchart' ? model.nodes.get(id)?.link : undefined;
  const page = (): unknown => effectivePage(model.type, env.meta, env.theme).routing;
  if (k === 'routing') return kind === 'edge' ? page() || 'curved' : baseStyleOf(env, kind, id).routing || page() || 'curved';
  const base = baseStyleOf(env, kind, id);
  if (k === 'shape' && kind === 'participant') return participantShapeOf(env, id);
  if (k === 'shape' && kind === 'node') {
    const n = model.type === 'flowchart' ? model.nodes.get(id) : undefined;
    return str(presetsFor(env, 'node')?.[currentPreset(env, ref)]?.shape) ?? (n && n.shape !== 'rect' ? n.shape : base.shape);
  }
  return base[k];
}

/** Arrow heads actually drawn at both ends of a flowchart edge. */
export function edgeEndsOf(env: StyleEnv, id: string): { start: unknown; end: unknown } | null {
  if (env.model.type !== 'flowchart') return null;
  const e = env.model.edges.find((x) => x.id === id);
  if (!e) return null;
  const m = getM(env.meta, 'edge', id);
  const arrow = effectiveValue(env, { kind: 'edge', id }, 'arrow');
  const map = (t: string): unknown => (t === 'arrow' ? arrow : t);
  return { start: m.startArrow || map(e.start), end: m.endArrow || map(e.end) };
}
