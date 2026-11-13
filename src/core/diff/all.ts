// The diff with every diagram kind (component architecture §9.1, §10): `diffDiagrams`, `renderDiff` and `renderDiffToSvg` parse and render with every parser and renderer. Only `mmdx/core` exports them; the diff engine (index.ts) and the renderer (render.ts) take the kinds, so `mmdx/diff` and History ship no kind statically.
import { createContext, type CoreContext } from '../context.js';
import type { Kinds } from '../kind/types.js';
import { ALL_DIFF_KINDS } from '../kinds/all-diff.js';
import { registerDiffs } from '../kinds/registry.js';
import { ALL_KINDS } from '../pipeline.js';
import { annotate } from './annotate.js';
import { diffDiagramsWith, diffModels } from './index.js';
import { mergeDiagrams } from './merge.js';
import { renderDiffToSvgWith, renderDiffWith, type DiffRendered, type DiffRenderOptions, type DiffSvgOptions } from './render.js';
import type { DiagramDiff } from './types.js';

/** Every type's diff kind (core ships them all; registering again is a no-op). */
const allDiffs = (): void => void registerDiffs(ALL_DIFF_KINDS);

/**
 * Core's diff functions with every diff kind registered first (`mmdx/core` exports these under the plain
 * names; the diff entry and History load the diff kinds they need instead).
 */
export const diffDiagramsWithAll: typeof diffDiagramsWith = (...a) => (allDiffs(), diffDiagramsWith(...a));
export const diffModelsAll: typeof diffModels = (...a) => (allDiffs(), diffModels(...a));
export const mergeDiagramsAll: typeof mergeDiagrams = (...a) => (allDiffs(), mergeDiagrams(...a));
export const annotateAll: typeof annotate = (...a) => (allDiffs(), annotate(...a));
export const renderDiffWithAll: typeof renderDiffWith = (...a) => (allDiffs(), renderDiffWith(...a));
export const renderDiffToSvgWithAll = (kinds: Kinds, before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> =>
  (allDiffs(), renderDiffToSvgWith(kinds, before, after, { ...o, ctx: o.ctx ?? createContext() }));

/** Diff of two sources (Mermaid with or without `%%@` lines), parsed with every kind. Never throws on bad input. */
export function diffDiagrams(before: string, after: string): DiagramDiff {
  allDiffs();
  return diffDiagramsWith(ALL_KINDS, before, after);
}

/** Renders a diff with every kind: both versions, the merged picture and the filtered change list. */
export function renderDiff(before: string, after: string, ctx: CoreContext, o: DiffRenderOptions = {}): DiffRendered {
  allDiffs();
  return renderDiffWith(ALL_KINDS, before, after, ctx, o);
}

/** Server-side and build-time rendering of a diff (CI bots, MR comments): two sources → one standalone SVG of a view, with every kind. Uses the static text measurer unless the context brings another one. Works in Node and workers. */
export function renderDiffToSvg(before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> {
  allDiffs();
  return renderDiffToSvgWith(ALL_KINDS, before, after, { ...o, ctx: o.ctx ?? createContext() });
}
