// Scene tree (§7.1): renderers produce typed nodes, never markup strings. Two back ends consume it:
// `serializeSvg` (strings for Node, export, previews, SSR) and `patchSvg` in `dom/` (keyed DOM diff).
import type { ItemRef } from '../types.js';
import type { SafeUrl } from '../validate.js';

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

/** `<marker>` and `<pattern>` definitions; ids must come from `ctx.idPrefix` (see `Defs`). */
export interface SceneDef {
  t: 'marker' | 'pattern' | 'clipPath';
  key?: string;
  attrs: SvgAttrs;
  children: SceneNode[];
}

export type SceneNode = SceneGroup | SceneShape | SceneText | SceneLink | SceneDef;
