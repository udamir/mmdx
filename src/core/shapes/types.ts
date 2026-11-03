// Types of the shape catalogue (T02): one entry per shape any diagram type draws — its names (canonical id, Mermaid's
// shortName and aliases, the bracket form), its category, its default size, how it grows around a label, where the label
// goes and its geometry (what is drawn, and the outline connectors end on). Pure: no DOM, shared by every kind.
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { CenterBox, Point, Rect } from '../types.js';

/** Canonical shape ids: the mmdx name where one existed before the catalogue (stored metadata, theme keys and presets keep working), else Mermaid's shortName. */
export type ShapeId =
  // the shapes mmdx drew before the catalogue
  | 'rect' | 'rounded' | 'stadium' | 'subroutine' | 'cylinder' | 'circle' | 'doublecircle' | 'diamond' | 'hexagon'
  | 'parallelogram' | 'parallelogram-alt' | 'trapezoid' | 'trapezoid-alt' | 'asymmetric' | 'hcyl' | 'document' | 'card'
  // Mermaid's other flowchart shapes (11.17)
  | 'text' | 'lin-rect' | 'div-rect' | 'win-pane' | 'delay' | 'curv-trap' | 'sl-rect' | 'bow-rect' | 'docs' | 'st-rect'
  | 'tag-doc' | 'tag-rect' | 'lin-doc' | 'flag' | 'brace' | 'brace-r' | 'braces' | 'cross-circ' | 'fork' | 'hourglass'
  | 'bolt' | 'tri' | 'flip-tri' | 'notch-pent' | 'fr-circ' | 'sm-circ' | 'f-circ' | 'lin-cyl' | 'datastore' | 'folder'
  | 'bucket' | 'console' | 'browser' | 'person' | 'bang' | 'cloud'
  // states and annotations
  | 'choice' | 'note'
  // figures (sequence participants, the mindmap's default node) and media frames
  | 'actor' | 'boundary' | 'control' | 'entity' | 'collections' | 'mm-default' | 'icon' | 'image';

/** Where a shape is listed: the palette's sections (Basic, Process, Technical, Annotation), figures of other kinds, media frames. */
export type ShapeCategory = 'basic' | 'process' | 'technical' | 'annotation' | 'figure' | 'media';

export interface Size {
  w: number;
  h: number;
}

/** A shape's names: all that parsing and its diagnostics need, without the geometry (core/shapes/names.ts lists them for the shapes beyond the 17). */
export interface ShapeNames {
  readonly id: ShapeId;
  /** Mermaid's shortName (absent: mmdx only — a flowchart keeps the shape in metadata). */
  readonly mermaid?: string;
  /** More names Mermaid accepts for it (its aliases and the lowercase internal ones). */
  readonly aliases: readonly string[];
  /** Names mmdx reads that Mermaid rejects (`lean_r`, the old mmdx ids, other kinds' names): a flowchart warns and offers the shortName. */
  readonly legacy?: readonly string[];
  /** The flowchart bracket form, if Mermaid has one. */
  readonly bracket?: readonly [open: string, close: string];
}

export interface ShapeDef extends ShapeNames {
  /** Semantic name (Mermaid's, e.g. "Manual operation"): the palette's tooltip and search. */
  readonly name: string;
  /** Geometric name, when it says more than the semantic one ("Trapezoid base top"). */
  readonly title?: string;
  readonly category: ShapeCategory;
  /** In the editor's Shapes menu of common shapes: its place there and its label ("Start / End"). */
  readonly menu?: readonly [at: number, label: string];
  /** Default size: an item with no label, and the preview's aspect. */
  readonly size: Size;
  /** The label goes under the shape (small marks: junctions, bars, bolts, figures), which keeps its own size. */
  readonly below?: boolean;
  /** The outer size for a content box (label plus padding) of w × h; default: the content box. */
  fit?(w: number, h: number): Size;
  /** Where the label goes inside an outer box of w × h, relative to the centre; default: the whole box. */
  textBox?(w: number, h: number): Rect;
  /** The scene nodes of the shape in box `b` (centre and size): the outline painted with the style, then its details. */
  draw(b: CenterBox, st: StyleProps, extra: SvgAttrs): SceneNode[];
  /** The outline of a w × h shape, relative to the centre (connector ends, hit tests, highlight frames). */
  outline(w: number, h: number): readonly Point[] | 'ellipse';
}

/** A catalogue entry without its names, which core/shapes/names.ts holds (the shapes beyond the 17 are written so). */
export type ShapeBody = Omit<ShapeDef, Exclude<keyof ShapeNames, 'id'>>;
