// Diagram kinds loaded on demand by the viewer (§R5): a page of flowcharts never downloads the sequence and ER code.
// The kernel's scenes get kinds through a `KindsProvider` (component architecture §7.1): this lazy one for the viewer
// and the diff. A loaded kind is registered for the generic helpers (core/kinds/registry.ts).
import { registerKinds, registeredKinds, viewKind } from '../core/kinds/registry.js';
import type { Kinds, ViewKind } from '../core/kinds/types.js';
import type { DiagramType } from '../core/types.js';

const pending = new Map<DiagramType, Promise<void>>();

const importers: Record<DiagramType, () => Promise<{ VIEW: ViewKind }>> = {
  flowchart: () => import('../core/kinds/flowchart.js'),
  sequence: () => import('../core/kinds/sequence.js'),
  er: () => import('../core/kinds/er.js'),
};

/** The kinds loaded so far (shared by every viewer on the page; static code, no instance state). */
export const loadedKinds = (): Kinds => registeredKinds();

export const hasKind = (t: DiagramType): boolean => !!viewKind(t);

export function loadKind(t: DiagramType): Promise<void> {
  if (hasKind(t)) return Promise.resolve();
  let p = pending.get(t);
  if (!p) {
    p = importers[t]().then(({ VIEW }) => {
      registerKinds({ [t]: VIEW });
    });
    pending.set(t, p);
    const done = (): void => void pending.delete(t);
    p.then(done, done);
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
