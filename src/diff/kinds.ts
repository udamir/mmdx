// Diagram kinds of a diff, loaded on demand (component architecture §9.1, §10): both versions may be any type, so a
// session loads the view kind of each version's type (through view/kinds.ts, shared with the viewer) and its diff kind
// before it renders. `renderDiffToSvg` of `@mmdx/studio/diff` does the same, so the entry ships no kind statically.
import { renderDiffToSvgWith, type DiffRenderOptions, type DiffSvgOptions } from '../core/diff/render.js';
import { diffDiagramsWith } from '../core/diff/index.js';
import type { DiagramDiff } from '../core/diff/types.js';
import { createContextWith, type CoreContext } from '../core/context-base.js';
import { ensureBuiltinThemes, getShared } from '../config.js';
import { detectType } from '../core/parse/dispatch.js';
import { diffKind, registerDiffs } from '../core/kinds/registry.js';
import type { DiffKind } from '../core/kinds/diff-types.js';
import type { DiagramType } from '../core/types.js';
import { loadedKinds, loadKind, renderShapes } from '../view/kinds.js';

const diffImporters: Record<DiagramType, () => Promise<{ DIFF: DiffKind }>> = {
  flowchart: () => import('../core/kinds/flowchart-diff.js'),
  sequence: () => import('../core/kinds/sequence-diff.js'),
  er: () => import('../core/kinds/er-diff.js'),
  mindmap: () => import('../core/kinds/mindmap-diff.js'),
  state: () => import('../core/kinds/state-diff.js'),
};

/** Loads in progress: concurrent callers share one (B37: each registered the kind again). */
const loading = new Map<DiagramType, Promise<void>>();

/** Loads a type's diff kind (resolves at once when it is loaded). */
function loadDiffKind(t: DiagramType): Promise<void> {
  if (diffKind(t)) return Promise.resolve();
  let p = loading.get(t);
  if (!p) {
    p = diffImporters[t]().then(({ DIFF }) => {
      if (!diffKind(t)) registerDiffs({ [t]: DIFF });
    });
    p.finally(() => loading.delete(t)).catch(() => {});
    loading.set(t, p);
  }
  return p;
}

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
