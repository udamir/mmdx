// Diagram kinds loaded on demand by the viewer (§R5): a page of flowcharts never downloads the sequence and ER code.
import type { Kinds } from '../core/pipeline-core.js';
import type { DiagramType } from '../core/types.js';

const loaded: Kinds = { parsers: {}, renderers: {} };
const pending = new Map<DiagramType, Promise<void>>();

const importers: Record<DiagramType, () => Promise<{ KIND: Kinds }>> = {
  flowchart: () => import('../core/kind-flowchart.js'),
  sequence: () => import('../core/kind-sequence.js'),
  er: () => import('../core/kind-er.js'),
};

/** The kinds loaded so far (shared by every viewer on the page; static code, no instance state). */
export const loadedKinds = (): Kinds => loaded;

export const hasKind = (t: DiagramType): boolean => !!loaded.parsers[t];

export function loadKind(t: DiagramType): Promise<void> {
  if (hasKind(t)) return Promise.resolve();
  let p = pending.get(t);
  if (!p) {
    p = importers[t]().then(({ KIND }) => {
      Object.assign(loaded.parsers, KIND.parsers);
      Object.assign(loaded.renderers, KIND.renderers);
    });
    pending.set(t, p);
    p.catch(() => pending.delete(t));
  }
  return p;
}
