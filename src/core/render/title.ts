// The diagram's title block (X1, task 4.4): the frontmatter's `title` (or a `title` statement) above a flowchart, a
// state, an ER or a sequence diagram, the same in each.
import { g } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import { textBlockWidth } from '../text/wrap.js';
import type { Rect } from '../types.js';
import { font, textBlock } from './common.js';
import type { RenderContext } from './types.js';

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
