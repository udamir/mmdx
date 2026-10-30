// Source transforms for diff views: draw both versions without the facets a reviewer chose to ignore, so the
// pictures differ only where the remaining changes are.
import { joinSource, splitSource } from '../meta/index.js';
import { COLLECTIONS, type DiagramMeta, type ItemMeta } from '../meta/types.js';
import { stripMermaidStyles } from '../strip-styles.js';

const LAYOUT_KEYS = ['x', 'y', 'w', 'h', 'points', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelDx', 'labelDy', 'dy'] as const;
const KEEP_WITHOUT_STYLE = new Set<string>([...LAYOUT_KEYS, 'layer', 'link', 'locked']);

/**
 * The source without styling: no Mermaid classes or style statements, no presets, colours or fonts in the
 * metadata, no theme. Positions and sizes stay, so the layout does not move.
 */
export function withoutStyle(source: string): string {
  const { doc } = splitSource(source);
  const code = stripMermaidStyles(doc.code);
  const meta: DiagramMeta = { canvas: {}, styles: {} };
  const { routing } = doc.meta.canvas;
  if (routing !== undefined) meta.canvas.routing = routing;
  for (const coll of COLLECTIONS) {
    const src = doc.meta[coll] as Record<string, ItemMeta> | undefined;
    if (!src || coll === 'layers') continue;
    const out: Record<string, ItemMeta> = {};
    for (const [id, m] of Object.entries(src)) out[id] = Object.fromEntries(Object.entries(m).filter(([k]) => KEEP_WITHOUT_STYLE.has(k)));
    (meta as unknown as Record<string, unknown>)[coll] = out;
  }
  return joinSource({ code, meta });
}

/**
 * `before` drawn with the layout of `after` for every item both have (same id), so a side-by-side or swipe view
 * shows no movement — only what was added, removed or restyled. Items only in `before` keep their own place.
 */
export function withLayoutOf(before: string, after: string): string {
  const a = splitSource(before).doc, b = splitSource(after).doc;
  const meta: DiagramMeta = { ...a.meta, canvas: { ...a.meta.canvas } };
  const canvas = meta.canvas as Record<string, unknown>;
  for (const k of ['w', 'h', 'x', 'y', 'ratio', 'pad']) {
    if (b.meta.canvas[k] !== undefined) canvas[k] = b.meta.canvas[k];
    else delete canvas[k];
  }
  for (const coll of COLLECTIONS) {
    if (coll === 'layers') continue;
    const A = (a.meta[coll] ?? {}) as Record<string, ItemMeta>, B = (b.meta[coll] ?? {}) as Record<string, ItemMeta>;
    const out: Record<string, ItemMeta> = {};
    for (const [id, m] of Object.entries(A)) {
      const next: Record<string, unknown> = { ...m };
      for (const k of LAYOUT_KEYS) delete next[k];
      const from = B[id];
      if (from) for (const k of LAYOUT_KEYS) if (from[k] !== undefined) next[k] = from[k];
      out[id] = next;
    }
    // items placed only in `after` that also exist (unplaced) in `before`
    for (const [id, m] of Object.entries(B)) {
      if (out[id]) continue;
      const pos = Object.fromEntries(LAYOUT_KEYS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
      if (Object.keys(pos).length) out[id] = pos;
    }
    (meta as unknown as Record<string, unknown>)[coll] = out;
  }
  return joinSource({ code: a.code, meta });
}
