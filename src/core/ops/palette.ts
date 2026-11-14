// Metadata of the diagram as a whole that items point at (R9, task 5.7): the diagram palette (row 88), layers (row 67)
// and locks. Pure: (meta, …) → { meta }, the metadata cloned first.
import type { DiagramMeta } from '../meta/types.js';
import { KIND_TO_COLL } from '../meta/types.js';
import { DEFAULT_LAYER } from '../layers.js';
import { ITEM_KINDS, type ItemRef } from '../types.js';
import { cloneMeta, ensure, tidy } from './meta-util.js';
import type { MetaResult } from './types.js';


// ---- diagram palette (row 88) -------------------------------------------------------------------------------------

/**
 * "+" in a colour picker: keeps the colour in this diagram's palette, named by its value (adding it twice is one
 * entry). Returns the palette name; items then refer to it as `@<name>`.
 */
export function addLocalColor(meta: DiagramMeta, hex: string): MetaResult & { name: string } {
  const out = cloneMeta(meta);
  const name = `c-${hex.replace('#', '').toLowerCase()}`;
  (out.styles['palette'] ??= {})[name] = { color: hex.toLowerCase() };
  return { meta: out, name };
}

/**
 * Removes a diagram colour; items that used it keep the look: every `@<name>` value becomes the colour itself.
 * The editor shows "Colour removed from this diagram's palette — items using it keep the colour".
 */
export function removeLocalColor(meta: DiagramMeta, name: string): MetaResult {
  const out = cloneMeta(meta);
  const pal = out.styles['palette'];
  const hex = pal?.[name]?.['color'];
  if (pal) {
    delete pal[name];
    if (!Object.keys(pal).length) delete out.styles['palette'];
  }
  const ref = `@${name}`;
  if (typeof hex === 'string') {
    // iterative walk (metadata nesting is shallow, but it is user input)
    const stack: unknown[] = [out];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      const rec = o as Record<string, unknown>;
      for (const [k, v] of Object.entries(rec)) {
        if (v === ref) rec[k] = hex;
        else if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
  return { meta: out };
}

// ---- layers (row 67) ----------------------------------------------------------------------------------------------

export { DEFAULT_LAYER };

/** Puts items on a layer (`default` removes their `layer` key). */
export function setLayer(meta: DiagramMeta, items: readonly ItemRef[], layerId: string): MetaResult {
  const out = cloneMeta(meta);
  for (const it of items) {
    const m = ensure(out, it.kind, it.id);
    if (layerId === DEFAULT_LAYER) delete m.layer;
    else m.layer = layerId;
    tidy(out, it.kind, it.id);
  }
  return { meta: out };
}

/** "+ New layer": `L<n>` named "Layer <n>", taking the given items along. */
export function newLayer(meta: DiagramMeta, items: readonly ItemRef[] = []): MetaResult & { id: string } {
  let n = 1;
  while (meta.layers?.[`L${n}`]) n++;
  const id = `L${n}`;
  const out = cloneMeta(meta);
  (out.layers ??= {})[id] = { name: `Layer ${n}` };
  return { meta: items.length ? setLayer(out, items, id).meta : out, id };
}

// ---- lock ---------------------------------------------------------------------------------------------------------

/** Items with `locked` metadata. */
export function lockedItems(meta: DiagramMeta): ItemRef[] {
  const out: ItemRef[] = [];
  for (const kind of ITEM_KINDS) for (const [id, m] of Object.entries(meta[KIND_TO_COLL[kind]] ?? {})) if (m.locked) out.push({ kind, id });
  return out;
}

/** Everything locked becomes movable again ("Unlocked <count> items"). */
export function unlockAll(meta: DiagramMeta): MetaResult & { count: number } {
  const out = cloneMeta(meta);
  const list = lockedItems(out);
  for (const { kind, id } of list) {
    delete ensure(out, kind, id).locked;
    tidy(out, kind, id);
  }
  return { meta: out, count: list.length };
}
