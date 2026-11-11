// The graph render kit (X1, task 4.4): what the flowchart, state and ER renderers each did in their own copy — the
// empty metadata, a string-or-nothing read, the groups a hidden group hides, a group's depth, the bounds accumulator
// and the diagram's title above it. Pure: scene nodes and numbers, no DOM.
import type { ItemMeta } from '../meta/types.js';
import { g } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import { textBlockWidth } from '../text/wrap.js';
import type { CenterBox, Rect } from '../types.js';
import { font, textBlock } from './common.js';
import type { RenderContext } from './types.js';

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

/**
 * The diagram's title (the frontmatter's, or a `title` statement), above the diagram: `bounds` grows up by the
 * title's block and wide enough for it; returns the title's scene (none without a title).
 */
export function diagramTitle(bounds: Rect, title: string | undefined, ctx: RenderContext, family: string, pad: number): SceneNode[] {
  const text = (title ?? '').trim();
  if (!text) return [];
  const tl = text.split('\n');
  const size = 22, blockH = tl.length * size * 1.3;
  const tw = textBlockWidth(tl, font(size, 600, family), ctx.measure);
  bounds.y -= blockH + 14;
  bounds.h += blockH + 14;
  if (tw + 2 * pad > bounds.w) {
    bounds.x -= (tw + 2 * pad - bounds.w) / 2;
    bounds.w = tw + 2 * pad;
  }
  return [g({ class: 'title', 'data-part': 'title' }, [
    textBlock(tl, bounds.x + bounds.w / 2, bounds.y + pad + blockH / 2, { size, weight: 600, color: ctx.color('@title') ?? '#333', family }),
  ], { key: 'title' })];
}
