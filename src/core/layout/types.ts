// The layouts' contract types (C0): what a renderer passes the layered, compound and tree layouts.
import type { Point } from '../types.js';

/** The bounded cache of layout results (`RenderContext.layoutCache`): positions keyed by the layout's input, a layout's further point lists packed in (layout/cache.ts). */
export interface LayoutCache {
  get(k: string): Map<string, Point> | undefined;
  set(k: string, v: Map<string, Point>): void;
  /** Room for this many entries (a diagram's scopes or subtrees, twice: a diff renders two versions). */
  reserve?(n: number): void;
}
