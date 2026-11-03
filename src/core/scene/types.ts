// Scene tree (§7.1): renderers produce typed nodes, never markup strings. Two back ends consume it:
// `serializeSvg` (strings for Node, export, previews, SSR) and `patchSvg` in `dom/` (keyed DOM diff).
import type { ItemRef } from '../types.js';
import type { SafeImageUrl, SafeUrl } from '../validate.js';

/** Attribute values. `undefined` / `null` / `false` attributes are omitted. Numbers are formatted by `fmt()`. */
export type AttrValue = string | number | boolean | null | undefined;

/**
 * Attributes a scene node may carry. Names are a fixed allowlist (see `ALLOWED_ATTRS` in serialize.ts):
 * the serializer and the patcher refuse anything else, so no user string ever becomes an attribute name.
 * `class` holds space-separated tokens chosen by the renderer. `data-*` keys are limited to `DATA_ATTRS`.
 */
export type SvgAttrs = Readonly<Record<string, AttrValue>>;

export interface TextLine {
  text: string;
  x: number;
  y: number;
  /**
   * The line as runs: removed and added words (the merged picture of a diff), bold and italic words (markdown labels,
   * core/text/rich.ts) and inline icons; `text` is then their plain text. Drawn as `<tspan>`s inside the line's
   * `<tspan>` (`class="dx-del"` / `"dx-ins"`, `font-weight`, `font-style`); icon runs draw nothing here, their image
   * is a sibling of the `<text>` (`richText`).
   */
  runs?: readonly TextRun[];
  /** `start`: `x` is the line's left edge whatever the text's anchor (a line with icons, its runs placed one by one). */
  anchor?: 'start';
}

export interface TextRun {
  text: string;
  mark: 'ins' | 'del' | null;
  bold?: boolean;
  italic?: boolean;
  /** An inline icon: `text` is empty, the run is `size` wide and its image is drawn beside the text. */
  icon?: { href: SafeImageUrl; size: number; name: string };
  /** Where the run starts (a run after an icon in a line with `anchor: 'start'`): a new positioned text chunk. */
  x?: number;
}

export interface SceneGroup {
  t: 'g';
  /** Stable key for the keyed DOM patcher (usually the ItemKey); unique among siblings. */
  key?: string;
  attrs: SvgAttrs;
  children: SceneNode[];
  /** The diagram item this group draws (hit-testing, selection classes). */
  item?: ItemRef;
}

export interface SceneShape {
  t: 'path' | 'rect' | 'ellipse' | 'circle' | 'line' | 'polygon' | 'polyline';
  key?: string;
  attrs: SvgAttrs;
}

export interface SceneText {
  t: 'text';
  key?: string;
  attrs: SvgAttrs;
  /** One `<tspan>` per line. Empty lines render as a non-breaking space so they keep their height. */
  lines: TextLine[];
}

export interface SceneLink {
  t: 'a';
  key?: string;
  href: SafeUrl;
  children: SceneNode[];
}

/**
 * An image: content images whose URL passed the image policy, and icons mmdx built itself. `href` is written only
 * from this branded field, never from `attrs` (`href` is not an allowed attribute name).
 */
export interface SceneImage {
  t: 'image';
  key?: string;
  /** x, y, width, height, opacity, clip-path, class, preserveAspectRatio, aria-hidden. */
  attrs: SvgAttrs;
  href: SafeImageUrl;
}

/** `<marker>` and `<pattern>` definitions; ids must come from `ctx.idPrefix` (see `Defs`). */
export interface SceneDef {
  t: 'marker' | 'pattern' | 'clipPath';
  key?: string;
  attrs: SvgAttrs;
  children: SceneNode[];
}

export type SceneNode = SceneGroup | SceneShape | SceneText | SceneLink | SceneImage | SceneDef;
