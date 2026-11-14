// The edit kinds the editor loaded (static code shared by every editor on the page).
import type { DiagramModel, SupportedModel } from '../../core/model.js';
import type { DiagramType } from '../../core/types.js';
import type { EditKind, EditKinds } from './types.js';

const registered: EditKinds = {};

export function registerEditKinds<K extends EditKinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) registered[k.type] = k;
  return kinds;
}

/** Forgets every registered edit kind (tests of on-demand loading). */
export function forgetEditKinds(): void {
  for (const t of Object.keys(registered) as DiagramType[]) delete registered[t];
}

export const editKind = (type: DiagramType | null | undefined): EditKind | undefined => (type ? registered[type] : undefined);

/** Calls `f` with the model's edit kind and the model as a supported one; undefined for an unsupported diagram. */
export function withEdit<R>(model: DiagramModel, f: (kind: EditKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  const k = registered[model.type];
  return k ? f(k, model) : undefined;
}
