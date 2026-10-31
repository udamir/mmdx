// Diagram kinds loaded on demand by the viewer (§R5): a page of flowcharts never downloads the sequence and ER code.
// The kernel's scenes get kinds through a `KindsProvider` (component architecture §7.1): this lazy one for the viewer
// and the diff; the editor's renders are synchronous and use every kind bundled.
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

/** Where a scene gets the parsers and renderers of diagram kinds from. */
export interface KindsProvider {
  /** The kinds available now. */
  kinds(): Kinds;
  has(t: DiagramType): boolean;
  /** Makes a kind available (resolves at once when it already is). */
  load(t: DiagramType): Promise<void>;
}

/** Kinds loaded on first use, shared by every component on the page. */
export const lazyKinds: KindsProvider = { kinds: loadedKinds, has: hasKind, load: loadKind };
