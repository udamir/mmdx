// Diagram kinds loaded on demand (§R5, A4): a page of flowcharts never downloads the sequence and ER code. One manifest
// (KIND_MODULES) says where each type's view and diff kinds are; every loader — the viewer's, the diff's and History's,
// the editor's chunks (editor/kinds/loader.ts) — shares one in-flight load per chunk (`loadOnce`). The kernel's scenes
// get kinds through a `KindsProvider` (component architecture §7.1). A loaded kind is registered for the generic
// helpers (core/kinds/registry.ts). The geometry of the shapes beyond the 17 loads the same way, the first time a
// render draws one of them (T02.9).
import { diffKind, registerDiffs, registerKinds, registeredKinds, viewKind } from '../core/kinds/registry.js';
import type { DiffKind } from '../core/kind/diff-types.js';
import type { Kinds, ViewKind } from '../core/kind/types.js';
import { shapeMisses } from '../core/shapes/misses.js';
import type { DiagramType } from '../core/types.js';

/** Where each type's kinds are: its view kind (parser, renderer) and its diff kind. */
export const KIND_MODULES: { readonly [T in DiagramType]: { view(): Promise<{ VIEW: ViewKind }>; diff(): Promise<{ DIFF: DiffKind }> } } = {
  flowchart: { view: () => import('../core/kinds/flowchart.js'), diff: () => import('../core/kinds/flowchart-diff.js') },
  sequence: { view: () => import('../core/kinds/sequence.js'), diff: () => import('../core/kinds/sequence-diff.js') },
  er: { view: () => import('../core/kinds/er.js'), diff: () => import('../core/kinds/er-diff.js') },
  mindmap: { view: () => import('../core/kinds/mindmap.js'), diff: () => import('../core/kinds/mindmap-diff.js') },
  state: { view: () => import('../core/kinds/state.js'), diff: () => import('../core/kinds/state-diff.js') },
};

const inFlight = new Map<string, Promise<void>>();

/**
 * One load per key at a time (B37: concurrent callers each registered the kind again): `done()` says it is loaded
 * already; otherwise `load` runs once and every caller waits for it. A settled load is forgotten, so a failed one is
 * tried again and a forgotten kind registers again (the module itself stays cached).
 */
export function loadOnce(key: string, done: () => boolean, load: () => Promise<void>): Promise<void> {
  if (done()) return Promise.resolve();
  let p = inFlight.get(key);
  if (!p) {
    p = load();
    inFlight.set(key, p);
    const settle = (): void => void inFlight.delete(key);
    p.then(settle, settle);
  }
  return p;
}

/** The kinds loaded so far (shared by every viewer on the page; static code, no instance state). */
export const loadedKinds = (): Kinds => registeredKinds();

export const hasKind = (t: DiagramType): boolean => !!viewKind(t);

export const loadKind = (t: DiagramType): Promise<void> =>
  loadOnce(`view:${t}`, () => hasKind(t), () => KIND_MODULES[t].view().then(({ VIEW }) => void registerKinds({ [t]: VIEW })));

/** Loads a type's diff kind (resolves at once when it is loaded). */
export const loadDiffKind = (t: DiagramType): Promise<void> =>
  loadOnce(`diff:${t}`, () => !!diffKind(t), () => KIND_MODULES[t].diff().then(({ DIFF }) => void registerDiffs({ [t]: DIFF })));

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

/** Loads the geometry of the shapes beyond the 17 (core/extras.ts, with the media kit; resolves once they are drawable). */
export const loadShapes = (): Promise<void> => loadOnce('extras', () => false, () => import('../core/extras.js').then((m) => m.registerExtendedShapes()));

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
