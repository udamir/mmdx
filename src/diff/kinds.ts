// Diagram kinds of a diff, loaded on demand (component architecture §9.1, §10): both versions may be any type, so a
// session loads the view kind of each version's type (through platform/kinds.ts, shared with the viewer) and its diff kind
// before it renders. `renderDiffToSvg` of `@mmdx/studio/diff` does the same, so the entry ships no kind statically.
import { renderDiffToSvgWith, type DiffRenderOptions, type DiffSvgOptions } from '../core/diff/render.js';
import { diffDiagramsWith } from '../core/diff/index.js';
import type { DiagramDiff } from '../core/diff/types.js';
import { createContextWith, type CoreContext } from '../core/context-base.js';
import { getShared } from '../platform/config.js';
import { ensureBuiltinThemes } from '../platform/themes.js';
import { detectType } from '../core/parse/dispatch.js';
import { loadDiffKind, loadedKinds, loadKind, renderShapes } from '../platform/kinds.js';

/** Loads the kinds of every given source (sources of an unsupported type load nothing). */
export async function loadKindsOf(...sources: readonly string[]): Promise<void> {
  const types = new Set(sources.map((s) => detectType(s)).filter((t) => t !== null));
  await Promise.all([...types].flatMap((t) => [loadKind(t), loadDiffKind(t)]));
}

/**
 * Server-side and build-time rendering of a diff (CI bots, MR comments): two sources → one standalone SVG of a view.
 * The kinds of both versions load first (and the shapes beyond the 17 when a version draws one); otherwise as
 * `renderDiffToSvg` of `@mmdx/studio/core`.
 */
export async function renderDiffToSvg(before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> {
  await loadKindsOf(before, after);
  // the shared themes, with the built-in ones loaded on demand (B41: no static theme data in mmdx/diff)
  const ctx = o.ctx ?? (await ensureBuiltinThemes(), createContextWith({ themes: getShared().themes }));
  return renderShapes(() => renderDiffToSvgWith(loadedKinds(), before, after, { ...o, ctx }));
}

/** Diff of two sources (Mermaid with or without `%%@` lines) for `@mmdx/studio/diff`: the kinds of both versions load first; otherwise as `diffDiagrams` of `@mmdx/studio/core`, which is synchronous and ships every parser. Never rejects on bad input. */
export async function diffDiagrams(before: string, after: string): Promise<DiagramDiff> {
  await loadKindsOf(before, after);
  return diffDiagramsWith(loadedKinds(), before, after);
}
