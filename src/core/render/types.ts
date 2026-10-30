// Render contract (§7): model + meta + resolved theme → scene tree + geometry.
import type { CanvasMeta, DiagramMeta } from '../meta/types.js';
import type { SceneNode } from '../scene/types.js';
import type { FontSpec, TextMeasurer } from '../text/measure.js';
import type { ItemKind, Point, Rect } from '../types.js';
import type { LinkPolicy } from '../validate.js';
import type { ResolvedTheme } from '../theme/types.js';

/** Everything a renderer needs from its environment; instance-scoped, never global. */
export interface RenderContext {
  measure: TextMeasurer;
  /** Prefix for every `<defs>` id (markers, patterns) so several diagrams can share a page. */
  idPrefix: string;
  linkPolicy: LinkPolicy;
  /**
   * Resolves a stored colour (palette reference `@x` / `@x~…`, the diagram palette `style.palette`, or a literal)
   * against the active theme. Returns undefined for anything that is not a valid colour.
   */
  color(v: unknown): string | undefined;
  /** Bounded cache for auto-layout results (keyed by the layout input); optional. */
  layoutCache?: { get(k: string): Map<string, Point> | undefined; set(k: string, v: Map<string, Point>): void };
}

/** Item ids hidden by layers, per collection kind. */
export type HiddenSets = Partial<Record<ItemKind, ReadonlySet<string>>>;

export interface RenderOptions {
  /** Items hidden by layers (already expanded to their direct ids; renderers cascade to attached items). */
  hidden?: HiddenSets;
  /** View settings → Display → connector labels off. */
  hideLabels?: boolean;
  /** ER tables drawn as tables with an empty last row for a new attribute (the editor's attribute editing). */
  tableView?: readonly string[];
}

export interface BoxGeom {
  /** centre */
  x: number;
  y: number;
  w: number;
  h: number;
  stack?: boolean | number | undefined;
  hidden?: boolean;
}

export interface Port extends Point {
  /** Outward normal of the side. */
  n: Point;
}

export interface EdgeGeom {
  a: Port;
  b: Port;
  /** Label box (centre + size) or null. */
  label: BoxGeom | null;
  points: [number, number][];
  /** Middle of each part between consecutive points (where a new bend point can be pulled out). */
  mids: Point[];
  /** Path data of the drawn line (for overlay highlights and hit-testing). */
  d: string;
}

export interface FlowGeometry {
  type: 'flowchart';
  nodes: Map<string, BoxGeom & { auto?: boolean }>;
  groups: Map<string, BoxGeom & { fixed: boolean }>;
  edges: Map<string, EdgeGeom>;
}

export interface SequenceGeometry {
  type: 'sequence';
  participants: Map<string, BoxGeom>;
  /** Mirrored copies at the bottom (`mirror`). */
  participantFeet: Map<string, BoxGeom>;
  messages: Map<string, { x0: number; x1: number; y: number; self?: boolean }>;
  /** Keyed `<participant>:<n>` (core/ids). */
  activations: Map<string, { x: number; y0: number; y1: number; w: number; participant: string; from?: string; to?: string }>;
  boxes: Map<string, BoxGeom>;
  blocks: Map<string, BoxGeom & { y0: number; y1: number }>;
  notes: Map<string, BoxGeom>;
  /** Automatic x of each participant (before metadata overrides). */
  autoX: Map<string, number>;
  /** Lifeline x per participant and the lifeline span. */
  lifelines: Map<string, { x: number; y0: number; y1: number }>;
}

export interface ErGeometry {
  type: 'er';
  /**
   * `head`: height of the title section (from the top; the attributes are below it). `rows`: the attribute rows of a
   * table (y = top), plus the empty row for a new one (`add`) in table view.
   */
  entities: Map<string, BoxGeom & { head?: number; rows?: { name: string; y: number; h: number; add?: boolean }[] }>;
  rels: Map<string, EdgeGeom>;
}

export type GeometryIndex = FlowGeometry | SequenceGeometry | ErGeometry | { type: null };

export interface PageStyle {
  /** `transparent` when not set. */
  background: string;
  grid: string | undefined;
  border: string | null;
}

export interface RenderResult {
  /** Markers and patterns, ids prefixed with `ctx.idPrefix`. */
  defs: SceneNode[];
  /** The diagram, drawn in z-order. Each item is a `g` with `item` and `key` = ItemKey. */
  body: SceneNode[];
  /** Page bounds (top-left + size), after page size / ratio / minimum size. */
  bounds: Rect;
  /** Content bounds before the page rules. */
  contentBounds: Rect;
  page: PageStyle;
  /** Effective page settings (theme < page preset < diagram). */
  pageSettings: CanvasMeta;
  geom: GeometryIndex;
  /** Preset name → number of items using it, per kind (`(none)` for items without a preset). */
  presetsUsed: Partial<Record<ItemKind, Map<string, number>>>;
}

/** Shared font helper: the family a style asks for, else the theme font. */
export const fontOf = (size: number, weight: number | string | undefined, family: string): FontSpec => ({
  size,
  weight: weight ?? 400,
  family,
});

export type { DiagramMeta };
