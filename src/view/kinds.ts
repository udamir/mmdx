// Diagram kinds loaded on demand by the viewer (§R5): a page of flowcharts never downloads the sequence and ER code.
// The kernel's scenes get kinds through a `KindsProvider` (component architecture §7.1): this lazy one for the viewer
// and the diff. A loaded kind is registered for the generic helpers (core/kinds/registry.ts). The geometry of the shapes
// beyond the 17 loads the same way, the first time a render draws one of them (T02.9).
import { registerKinds, registeredKinds, viewKind } from '../core/kinds/registry.js';
import type { Kinds, ViewKind } from '../core/kinds/types.js';
import { shapeMisses } from '../core/shapes/misses.js';
import type { DiagramType } from '../core/types.js';

const pending = new Map<DiagramType, Promise<void>>();

const importers: Record<DiagramType, () => Promise<{ VIEW: ViewKind }>> = {
  flowchart: () => import('../core/kinds/flowchart.js'),
  sequence: () => import('../core/kinds/sequence.js'),
  er: () => import('../core/kinds/er.js'),
  mindmap: () => import('../core/kinds/mindmap.js'),
  state: () => import('../core/kinds/state.js'),
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

// ---- shapes ----

let shapesPending: Promise<void> | null = null;

/** Loads the geometry of the shapes beyond the 17 (core/shapes/extended.ts; resolves once they are drawable). */
export function loadShapes(): Promise<void> {
  if (!shapesPending) {
    const p = import('../core/shapes/extended.js').then((m) => m.registerExtendedShapes());
    shapesPending = p;
    const done = (): void => void (shapesPending = null);
    p.then(done, done);
  }
  return shapesPending;
}

/**
 * Runs a render and says whether it drew a shape whose geometry is not loaded yet: such a shape is drawn as a
 * rectangle (core/shapes/registry.ts), and the caller loads it (`loadShapes`) and renders again.
 */
export function drawShapes<R>(render: () => R): [R, missing: boolean] {
  const before = shapeMisses();
  const r = render();
  return [r, shapeMisses() !== before];
}

/** A render with every shape it draws: when one was missing, it loads and the render runs again (if it fails to load, the shape stays a rectangle). */
export async function renderShapes<R>(render: () => R): Promise<R> {
  const [r, missing] = drawShapes(render);
  if (!missing) return r;
  try {
    await loadShapes();
  } catch {
    return r;
  }
  return render();
}
