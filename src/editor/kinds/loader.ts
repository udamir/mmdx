// Diagram kinds loaded on demand by the editor (T01): a type's view, ops and edit kinds arrive in one chunk the first
// time a document of that type is shown, so an editor of flowcharts never downloads the sequence and ER code. Loading
// bumps `kindsVersion`, which the store's model reads, so the document is parsed again with the new kind. A kind plugin
// adds its chunk with `registerEditorKind` (A11e).
import { opsKind, registerExtras, registerKinds, registerOps, registeredKinds, viewKind } from '../../core/kinds/registry.js';
import type { Kinds } from '../../core/kind/types.js';
import type { ExtrasKind } from '../../core/kind/extras-types.js';
import type { OpsKind } from '../../core/kind/ops-types.js';
import type { ViewKind } from '../../core/kind/types.js';
import type { DiagramModel } from '../../core/model.js';
import { detectType, parseWith } from '../../core/parse/dispatch.js';
import type { DiagramType } from '../../core/types.js';
import { loadOnce } from '../../platform/kinds.js';
import { signal } from '../../reactive/signal.js';
import { editKind, registerEditKinds } from './registry.js';
import type { EditKind } from './types.js';

/** A type's editor chunk: its view, ops and edit kinds, and its extras (the portable export). */
export interface KindChunk {
  VIEW: ViewKind;
  OPS: OpsKind;
  EDIT: EditKind;
  EXTRAS?: ExtrasKind;
}

const importers = new Map<DiagramType, () => Promise<KindChunk>>(Object.entries({
  flowchart: () => import('./flowchart/index.js') as Promise<KindChunk>,
  sequence: () => import('./sequence/index.js') as Promise<KindChunk>,
  er: () => import('./er/index.js') as Promise<KindChunk>,
  mindmap: () => import('./mindmap/index.js') as Promise<KindChunk>,
  state: () => import('./state/index.js') as Promise<KindChunk>,
}));

/** Where a kind plugin's editor chunk is (A11e); the built-in types' are above. */
export function registerEditorKind(type: DiagramType, chunk: () => Promise<KindChunk>): void {
  importers.set(type, chunk);
}

const version = signal(0);

/** Changes whenever a kind finishes loading (a tracked read: computeds that parse depend on it). */
const kindsVersion = (): number => version();

/** Are the view, ops and edit kinds of the type loaded? */
export const editorHasKind = (t: DiagramType): boolean => !!viewKind(t) && !!opsKind(t) && !!editKind(t);

/** The view kinds of the types the editor can edit (their ops and edit kinds are loaded too): what its document parses with. */
const editorKinds = (): Kinds => Object.fromEntries(Object.entries(registeredKinds()).filter(([t]) => editorHasKind(t)));

/**
 * Parses code as the editor does (its document and a shown version): once the editor has the type's kinds (view, ops and edit), and only with the editor's types; while they load, an empty model (no problems). A viewer or a gallery may have loaded a type's parser before the editor's chunk of it, and a model of that type would reach ops that are not there yet (the editor's lookups fail closed). A tracked read of `kindsVersion`: a computed that parses runs again when a kind arrives.
 */
export function editorParse(code: string): DiagramModel {
  kindsVersion();
  const type = detectType(code);
  if (type && !editorHasKind(type)) return { type: null, diagnostics: [] };
  return parseWith(code, editorKinds());
}

/** Loads a type's kinds (resolves at once when they are loaded). */
export const loadEditorKind = (t: DiagramType): Promise<void> =>
  loadOnce(`editor:${t}`, () => editorHasKind(t), () => {
    const chunk = importers.get(t);
    if (!chunk) return Promise.reject(new Error(`no editor kind for "${t}"`));
    return chunk().then(({ VIEW, OPS, EDIT, EXTRAS }) => {
      registerKinds({ [t]: VIEW });
      registerOps({ [t]: OPS });
      registerEditKinds({ [t]: EDIT });
      if (EXTRAS) registerExtras({ [t]: EXTRAS });
      version.set(version.peek() + 1);
    });
  });

