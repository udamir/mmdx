// Render contract (§7): model + meta + resolved theme → scene tree + geometry.
import type { IconLookup } from '../icons/types.js';
import type { CanvasMeta, DiagramMeta } from '../meta/types.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { TextMeasurer } from '../text/measure.js';
import type { Diagnostic, ItemKind, Point, Rect } from '../types.js';
import type { ImagePolicy, LinkPolicy, UrlResolver } from '../validate.js';

/** How a text block is drawn (render/common.ts `textBlock`, the media kit's `richText`). */
export interface TextOpts {
  size: number;
  weight?: number | string | undefined;
  color?: string | undefined;
  family: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Line height as a multiple of the size. */
  lh?: number;
  cls?: string;
  underline?: boolean;
  extra?: SvgAttrs;
}

/** Everything a renderer needs from its environment; instance-scoped, never global. */
export interface RenderContext {
  measure: TextMeasurer;
  /** Prefix for every `<defs>` id (markers, patterns) so several diagrams can share a page. */
  idPrefix: string;
  linkPolicy: LinkPolicy;
  /** Which image URLs from diagram content are drawn (core/media/image.ts draws the others as placeholders). */
  imagePolicy: ImagePolicy;
  /** The host's resolver of content URLs (images and links), applied before the policies check them. */
  resolveUrl?: UrlResolver;
  /** Icon lookups (T04): renderers draw icons through core/icons/draw.ts (`drawIcon`, `iconResolver`). */
  icons: IconLookup;
  /**
   * Resolves a stored colour (palette reference `@x` / `@x~…`, the diagram palette `style.palette`, or a literal)
   * against the active theme. Returns undefined for anything that is not a valid colour.
   */
  color(v: unknown): string | undefined;
  /**
   * Natural sizes of content images (T06: an image node without `w` / `h`): the size when known, undefined while it
   * loads (the browser's lookup starts loading it and the component renders again when it arrives), null when it
   * cannot be known. Absent (SSR, the render worker): images without a size are drawn 96 × 96.
   */
  imageSizes?: ImageSizes;
  /** Bounded cache for auto-layout results (keyed by the layout input); optional. */
  layoutCache?: { get(k: string): Map<string, Point> | undefined; set(k: string, v: Map<string, Point>): void; reserve?(n: number): void };
}

/** Natural image sizes by URL (see `RenderContext.imageSizes`). */
export interface ImageSizes {
  get(url: string): { w: number; h: number } | null | undefined;
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
  /** The catalogue shape drawn in the box, when not a rectangle (connector ends, magnets and highlight frames follow its outline). */
  shape?: string;
  /** An icon or image node's asset (its icon or picture, without the frame; centre and size): resizing the node sizes it. */
  asset?: { x: number; y: number; w: number; h: number };
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
  entities: Map<string, BoxGeom & { head?: number; rows?: { name: string; y: number; h: number; add?: boolean }[]; auto?: boolean }>;
  rels: Map<string, EdgeGeom>;
  /** Subgraph frames (11.17+, T11.6): `fixed` when placed by hand (metadata x / y / w / h). */
  groups: Map<string, BoxGeom & { fixed?: boolean; hidden?: boolean }>;
}

export interface MindmapGeometry {
  type: 'mindmap';
  /** Node boxes; `side`: where the node grows from its parent (r, l, d; the root has none), `depth` from the root. */
  nodes: Map<string, BoxGeom & { side?: 'l' | 'r' | 'd'; depth: number; parent: string | null; section: number }>;
  /** Branch paths, keyed by the child's id. */
  branches: Map<string, string>;
  root: string | null;
}

export interface StateGeometry {
  type: 'state';
  /** States and pseudo-states; `auto`: placed by the layout (not by hand). */
  nodes: Map<string, BoxGeom & { auto?: boolean }>;
  /** Composites; `fixed`: a frame placed by hand. */
  groups: Map<string, BoxGeom & { fixed: boolean }>;
  /** Transitions. */
  edges: Map<string, EdgeGeom>;
  /** Notes, beside their state. */
  notes: Map<string, BoxGeom>;
}

export type GeometryIndex = FlowGeometry | SequenceGeometry | ErGeometry | MindmapGeometry | StateGeometry | { type: null };

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
  /** What the render reported (`image.blocked`); absent when nothing. */
  diagnostics?: Diagnostic[];
  /** The diagram's own accessible title and description (`accTitle`, `accDescr`): the SVG's `<title>` and `<desc>`. */
  a11y?: { title?: string; desc?: string };
  /** What the render drew without because it was not loaded (A18): shapes' geometry, the media kit. */
  missing?: Misses;
}

/** What a render lacked (core/shapes/misses.ts collects it). */
export interface Misses {
  shapes?: true;
  media?: true;
}

export type { DiagramMeta };

/** What every diagram renderer receives from `render()` (index.ts). */
export interface RenderEnv {
  ctx: RenderContext;
  theme: ResolvedTheme;
  /** The diagram's metadata with `canvas` replaced by the effective page settings (theme < preset < diagram). */
  meta: DiagramMeta & { canvas: CanvasMeta };
  opts: RenderOptions;
  /** Colour behind labels (halo) and inside markers: the page background, or the paper colour on a clear page. */
  paper: string;
  /** Page padding around the content. */
  pad: number;
  /** What the render reports (an image the policy refused: `image.blocked`); merged into the pipeline's diagnostics. */
  diagnostics: Diagnostic[];
}

export interface SubResult {
  defs: SceneNode[];
  body: SceneNode[];
  bounds: Rect;
  geom: GeometryIndex;
  presetsUsed: Partial<Record<ItemKind, Map<string, number>>>;
  /** The diagram's accessible title and description, when its code gives them. */
  a11y?: { title?: string; desc?: string };
}

/** What an icon or image node is made of: its source and layout keys (node data, or a state's metadata). */
export interface MediaSource {
  /** The picture's URL (`""`: not chosen yet, the placeholder); undefined: an icon node. */
  img?: string | undefined;
  icon?: string | undefined;
  form?: string | undefined;
  /** The caption's side: `t` above, else below. */
  pos?: string | undefined;
  w?: number | undefined;
  h?: number | undefined;
  constraint?: string | undefined;
  fit?: string | undefined;
}
