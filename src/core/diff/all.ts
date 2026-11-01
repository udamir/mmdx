// The diff with every diagram kind (component architecture §9.1, §10): `diffDiagrams`, `renderDiff` and `renderDiffToSvg` parse and render with every parser and renderer. Only `@mmdx/studio/core` exports them; the diff engine (index.ts) and the renderer (render.ts) take the kinds, so `@mmdx/studio/diff` and History ship no kind statically.
import type { CoreContext } from '../context.js';
import { ALL_KINDS } from '../pipeline.js';
import { diffDiagramsWith } from './index.js';
import { renderDiffToSvgWith, renderDiffWith, type DiffRendered, type DiffRenderOptions, type DiffSvgOptions } from './render.js';
import type { DiagramDiff } from './types.js';

/** Diff of two sources (Mermaid with or without `%%@` lines), parsed with every kind. Never throws on bad input. */
export function diffDiagrams(before: string, after: string): DiagramDiff {
  return diffDiagramsWith(ALL_KINDS, before, after);
}

/** Renders a diff with every kind: both versions, the merged picture and the filtered change list. */
export function renderDiff(before: string, after: string, ctx: CoreContext, o: DiffRenderOptions = {}): DiffRendered {
  return renderDiffWith(ALL_KINDS, before, after, ctx, o);
}

/** Server-side and build-time rendering of a diff (CI bots, MR comments): two sources → one standalone SVG of a view, with every kind. Uses the static text measurer unless the context brings another one. Works in Node and workers. */
export function renderDiffToSvg(before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> {
  return renderDiffToSvgWith(ALL_KINDS, before, after, o);
}
