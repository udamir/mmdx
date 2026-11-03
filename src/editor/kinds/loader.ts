// Diagram kinds loaded on demand by the editor (T01): a type's view, ops and edit kinds arrive in one chunk the first
// time a document of that type is shown, so an editor of flowcharts never downloads the sequence and ER code. Loading
// bumps `kindsVersion`, which the store's model reads, so the document is parsed again with the new kind.
import { opsKind, registerKinds, registerOps, viewKind } from '../../core/kinds/registry.js';
import type { OpsKind } from '../../core/kinds/ops-types.js';
import type { ViewKind } from '../../core/kinds/types.js';
import { DIAGRAM_TYPES } from '../../core/kinds/info.js';
import type { DiagramType } from '../../core/types.js';
import { signal } from '../../ui/signal.js';
import { editKind, registerEditKinds } from './registry.js';
import type { EditKind } from './types.js';

interface KindChunk {
  VIEW: ViewKind;
  OPS: OpsKind;
  EDIT: EditKind;
}

const importers: Record<DiagramType, () => Promise<KindChunk>> = {
  flowchart: () => import('./flowchart.js') as Promise<KindChunk>,
  sequence: () => import('./sequence.js') as Promise<KindChunk>,
  er: () => import('./er.js') as Promise<KindChunk>,
  mindmap: () => import('./mindmap.js') as Promise<KindChunk>,
};

const version = signal(0);
const pending = new Map<DiagramType, Promise<void>>();

/** Changes whenever a kind finishes loading (a tracked read: computeds that parse depend on it). */
export const kindsVersion = (): number => version();

/** Are the view, ops and edit kinds of the type loaded? */
export const editorHasKind = (t: DiagramType): boolean => !!viewKind(t) && !!opsKind(t) && !!editKind(t);

/** Loads a type's kinds (resolves at once when they are loaded). */
export function loadEditorKind(t: DiagramType): Promise<void> {
  if (editorHasKind(t)) return Promise.resolve();
  let p = pending.get(t);
  if (!p) {
    p = importers[t]().then(({ VIEW, OPS, EDIT }) => {
      registerKinds({ [t]: VIEW });
      registerOps({ [t]: OPS });
      registerEditKinds({ [t]: EDIT });
      version.set(version.peek() + 1);
    });
    pending.set(t, p);
    // settled: the next call registers again if the kinds were forgotten (the module itself stays cached)
    const done = (): void => void pending.delete(t);
    p.then(done, done);
  }
  return p;
}

/** Loads every type's kinds (hosts that switch types often, the type chooser). */
export const loadAllEditorKinds = (): Promise<void> => Promise.all(DIAGRAM_TYPES.map(loadEditorKind)).then(() => undefined);
