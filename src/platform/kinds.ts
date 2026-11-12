// Diagram kinds loaded on demand (§R5, A4): a page of flowcharts never downloads the sequence and ER code. One manifest
// (`kindModules`) says where each type's view, diff and extras kinds are, a kind plugin adds its own
// (`registerKindModules`, A11e); every loader — the viewer's, the diff's and History's,
// the editor's chunks (editor/kinds/loader.ts) — shares one in-flight load per chunk (`loadOnce`). A loaded kind is
// registered for the generic
// helpers (core/kinds/registry.ts). The geometry of the shapes beyond the 17 loads the same way, the first time a
// render draws one of them (T02.9).
import { diffKind, extrasKind, registerDiffs, registerExtras, registerKinds, registeredKinds, viewKind } from '../core/kinds/registry.js';
import type { ExtrasKind } from '../core/kind/extras-types.js';
import type { DiffKind } from '../core/kind/diff-types.js';
import type { Kinds, ViewKind } from '../core/kind/types.js';
import { collectMisses } from '../core/shapes/misses.js';
import type { DiagramType } from '../core/types.js';

/** Where a type's kinds are: its view kind (parser, renderer), its diff kind and its extras (outline, portable styles). */
export interface KindModules {
  view(): Promise<{ VIEW: ViewKind }>;
  diff?(): Promise<{ DIFF: DiffKind }>;
  extras?(): Promise<{ EXTRAS: ExtrasKind }>;
}

const MODULES = new Map<DiagramType, KindModules>(Object.entries({
  flowchart: { view: () => import('../core/kinds/flowchart/view.js'), diff: () => import('../core/kinds/flowchart/diff-kind.js'), extras: () => import('../core/kinds/flowchart/extras.js') },
  sequence: { view: () => import('../core/kinds/sequence/view.js'), diff: () => import('../core/kinds/sequence/diff-kind.js'), extras: () => import('../core/kinds/sequence/extras.js') },
  er: { view: () => import('../core/kinds/er/view.js'), diff: () => import('../core/kinds/er/diff-kind.js'), extras: () => import('../core/kinds/er/extras.js') },
  mindmap: { view: () => import('../core/kinds/mindmap/view.js'), diff: () => import('../core/kinds/mindmap/diff-kind.js'), extras: () => import('../core/kinds/mindmap/extras.js') },
  state: { view: () => import('../core/kinds/state/view.js'), diff: () => import('../core/kinds/state/diff-kind.js'), extras: () => import('../core/kinds/state/extras.js') },
} satisfies Record<string, KindModules>));

/** Where a kind plugin's kinds are (A11e); a type registered again takes the new modules. */
export function registerKindModules(type: DiagramType, modules: KindModules): void {
  MODULES.set(type, modules);
}

/** Where a type's kinds are (undefined: nobody registered it). */
export const kindModules = (t: DiagramType): KindModules | undefined => MODULES.get(t);

/** A type's modules; a type nobody registered fails as a load error (the document shows as unsupported). */
const modulesOf = (t: DiagramType): KindModules => {
  const m = MODULES.get(t);
  if (!m) throw new Error(`no kind modules for "${t}"`);
  return m;
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
  loadOnce(`view:${t}`, () => hasKind(t), async () => void registerKinds({ [t]: (await modulesOf(t).view()).VIEW }));

/** Loads a type's diff kind (resolves at once when it is loaded, or when the type has none: a plugin type without a diff module is then "not compared", B40, instead of failing the whole diff, BUG-004). */
export const loadDiffKind = (t: DiagramType): Promise<void> =>
  loadOnce(`diff:${t}`, () => !!diffKind(t) || !modulesOf(t).diff, async () => void registerDiffs({ [t]: (await modulesOf(t).diff!()).DIFF }));

/** Loads a type's extras (outline, portable styles; resolves at once when they are loaded, or when the type has none). */
export const loadExtrasKind = (t: DiagramType): Promise<void> =>
  loadOnce(`extras:${t}`, () => !!extrasKind(t) || !modulesOf(t).extras, async () => void registerExtras({ [t]: (await modulesOf(t).extras!()).EXTRAS }));


// ---- shapes ----

/** Loads the geometry of the shapes beyond the 17 (core/extras.ts, with the media kit; resolves once they are drawable). */
export const loadShapes = (): Promise<void> => loadOnce('extras', () => false, () => import('../core/extras.js').then((m) => m.registerExtendedShapes()));

/**
 * Runs a render and says whether it drew a shape whose geometry is not loaded yet: such a shape is drawn as a
 * rectangle (core/shapes/registry.ts), and the caller loads it (`loadShapes`) and renders again.
 */
export function drawShapes<R>(render: () => R): [R, missing: boolean] {
  const [r, m] = collectMisses(render);
  return [r, !!(m.shapes || m.media)];
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
