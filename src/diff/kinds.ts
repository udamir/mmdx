// Diagram kinds of a diff, loaded on demand (component architecture §9.1, §10): both versions may be any type, so a
// session loads the parser and renderer of each version's type before it renders (through elements/kinds.ts, shared
// with the viewer). `renderDiffToSvg` of `mmdx/diff` does the same, so the entry ships no kind statically.
import { renderDiffToSvgWith, type DiffRenderOptions, type DiffSvgOptions } from '../core/diff/render.js';
import type { CoreContext } from '../core/context.js';
import { detectType } from '../core/parse/dispatch.js';
import { loadedKinds, loadKind } from '../view/kinds.js';

/** Loads the kinds of every given source (sources of an unsupported type load nothing). */
export async function loadKindsOf(...sources: readonly string[]): Promise<void> {
  const types = new Set(sources.map((s) => detectType(s)).filter((t) => t !== null));
  await Promise.all([...types].map((t) => loadKind(t)));
}

/**
 * Server-side and build-time rendering of a diff (CI bots, MR comments): two sources → one standalone SVG of a view.
 * The kinds of both versions load first; otherwise as `renderDiffToSvg` of `mmdx/core`.
 */
export async function renderDiffToSvg(before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> {
  await loadKindsOf(before, after);
  return renderDiffToSvgWith(loadedKinds(), before, after, o);
}
