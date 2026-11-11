// The graph render kit (X1, task 4.4): what the flowchart, state and ER renderers each did in their own copy — the
// empty metadata, a string-or-nothing read, the groups a hidden group hides, a group's depth, the bounds accumulator
// and the accessibility line (the title block above a diagram is render/common.ts `diagramTitle`). Pure numbers and
// sets, no imports at run time, so a renderer that loads it pays for nothing it does not use.
import type { ItemMeta } from '../meta/types.js';
import type { CenterBox, Rect } from '../types.js';

/** The metadata of an item that has none (never written: a renderer reads it, the ops build their own). */
export const EMPTY_META: Readonly<ItemMeta> = Object.freeze({});

/** A non-empty string, else undefined (metadata read for a name or a URL). */
export const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** The groups the layers hide: the hidden ones and everything inside them (iterative: nesting depth is user input). */
export function hiddenGroups(groups: ReadonlyMap<string, { readonly id: string; readonly children: readonly string[] }>, hidden: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const gr of groups.values()) {
    if (!hidden.has(gr.id)) continue;
    const stack = [gr.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      for (const c of groups.get(id)?.children ?? []) if (groups.has(c)) stack.push(c);
    }
  }
  return out;
}

/** A group's nesting depth (0: at the top), memoised; a cycle in the parents stops at the first group seen again. */
export function depthOf(groups: ReadonlyMap<string, { readonly parent: string | null }>): (id: string) => number {
  const memo = new Map<string, number>();
  return (id) => {
    const c = memo.get(id);
    if (c !== undefined) return c;
    let d = 0;
    const seen = new Set([id]);
    for (let p = groups.get(id)?.parent ?? null; p && !seen.has(p); p = groups.get(p)?.parent ?? null) {
      seen.add(p);
      d++;
    }
    memo.set(id, d);
    return d;
  };
}

/**
 * The bounds of what a diagram draws: boxes grown in (centre and size; a box that is not placed yet is skipped), then
 * the padded rectangle. `slack` is added past the right and bottom edges (room for shadows and stacked looks).
 */
export class Bounds {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;

  constructor(private readonly slack = 0) {}

  grow(b: CenterBox): void {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
    this.x0 = Math.min(this.x0, b.x - b.w / 2);
    this.y0 = Math.min(this.y0, b.y - b.h / 2);
    this.x1 = Math.max(this.x1, b.x + b.w / 2 + this.slack);
    this.y1 = Math.max(this.y1, b.y + b.h / 2 + this.slack);
  }

  /** Grows by an edge rectangle (a box with extras on some sides); a non-finite edge is skipped. */
  growEdges(left: number, top: number, right: number, bottom: number): void {
    if (![left, top, right, bottom].every(Number.isFinite)) return;
    this.x0 = Math.min(this.x0, left);
    this.y0 = Math.min(this.y0, top);
    this.x1 = Math.max(this.x1, right + this.slack);
    this.y1 = Math.max(this.y1, bottom + this.slack);
  }

  /** Nothing was grown in. */
  get empty(): boolean {
    return this.x0 === Infinity;
  }

  /** The rectangle with `pad` around it; an empty diagram is 400 × 300 at the origin, padded too. */
  rect(pad: number): Rect {
    const [x0, y0, x1, y1] = this.empty ? [0, 0, 400, 300] : [this.x0, this.y0, this.x1, this.y1];
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }
}

/** `accTitle` / `accDescr`: the SVG's <title> and <desc>; undefined when the diagram has neither. */
export function a11yOf(model: { readonly accTitle?: string; readonly accDescr?: string }): { title?: string; desc?: string } | undefined {
  if (!model.accTitle && !model.accDescr) return undefined;
  return { ...(model.accTitle ? { title: model.accTitle } : {}), ...(model.accDescr ? { desc: model.accDescr } : {}) };
}
