// The view kinds loaded so far, for the generic helpers (layers, outline, diff, ops…) that get a model and need its
// type's descriptor. A model only exists once its type's parser ran, so its kind is here: every set of kinds is
// registered where it is built (core/kinds/all.ts, the viewer's and the editor's loaders). Static code shared by
// every component on the page — no instance state (that comes in through the CoreContext).
import type { DiagramModel, SupportedModel } from '../model.js';
import type { DiagramType } from '../types.js';
import type { Kinds, ViewKind } from './types.js';

const registered: Kinds = {};

/** Makes the kinds available to the generic helpers; returns the same set. */
export function registerKinds<K extends Kinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) registered[k.type] = k;
  return kinds;
}

/** Every kind registered so far. */
export const registeredKinds = (): Kinds => registered;

/** The view kind of a type, when it is loaded. */
export const viewKind = (type: DiagramType | null | undefined): ViewKind | undefined => (type ? registered[type] : undefined);

/** The view kind of a model (undefined for an unsupported diagram). */
export const kindOf = <M extends SupportedModel>(model: DiagramModel): ViewKind<M> | undefined =>
  (model.type ? registered[model.type] : undefined) as ViewKind<M> | undefined;

/**
 * Calls `f` with the model's view kind and the model as a supported one; undefined for an unsupported diagram (or a
 * kind that is not loaded, which cannot happen for a parsed model).
 */
export function withKind<R>(model: DiagramModel, f: (kind: ViewKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  const k = registered[model.type];
  return k ? f(k, model) : undefined;
}
