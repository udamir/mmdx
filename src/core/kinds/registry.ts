// The view kinds loaded so far, for the generic helpers (layers, outline, diff, ops…) that get a model and need its
// type's descriptor. A model only exists once its type's parser ran, so its kind is here: every set of kinds is
// registered where it is built (core/kinds/all.ts, the viewer's and the editor's loaders). Static code shared by
// every component on the page — no instance state (that comes in through the CoreContext).
import type { DiagramModel, SupportedModel } from '../model.js';
import type { DiagramType } from '../types.js';
import { parseWith } from '../parse/dispatch.js';
import type { DiffKind, DiffKinds } from './diff-types.js';
import type { OpsKind, OpsKinds } from './ops-types.js';
import type { Kinds, ViewKind } from './types.js';

const registered: Kinds = {};

/** Makes the kinds available to the generic helpers; returns the same set. */
export function registerKinds<K extends Kinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) registered[k.type] = k;
  return kinds;
}

/** Forgets every registered view kind (tests of on-demand loading start from none). */
export function forgetKinds(): void {
  for (const t of Object.keys(registered) as DiagramType[]) delete registered[t];
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

/** A model of the code, parsed with the kinds registered so far (the ops re-parse their results with it). */
export const reparse = (code: string): DiagramModel => parseWith(code, registered);

// ---- ops kinds (the editor) ----

const ops: OpsKinds = {};

/** Makes the ops kinds available to the editing ops; returns the same set. */
export function registerOps<K extends OpsKinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) ops[k.type] = k;
  return kinds;
}

/** Forgets every registered ops kind (tests of on-demand loading). */
export function forgetOps(): void {
  for (const t of Object.keys(ops) as DiagramType[]) delete ops[t];
}

/** The ops kind of a type, when it is loaded. */
export const opsKind = (type: DiagramType | null | undefined): OpsKind | undefined => (type ? ops[type] : undefined);

/** As `withKind`, with the model's ops kind. */
export function withOps<R>(model: DiagramModel, f: (kind: OpsKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  const k = ops[model.type];
  return k ? f(k, model) : undefined;
}

// ---- diff kinds (the diff, History, core) ----

const diffs: DiffKinds = {};

/** Makes the diff kinds available to the diff engine; returns the same set. */
export function registerDiffs<K extends DiffKinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) diffs[k.type] = k;
  return kinds;
}

/** Forgets every registered diff kind (tests of on-demand loading). */
export function forgetDiffs(): void {
  for (const t of Object.keys(diffs) as DiagramType[]) delete diffs[t];
}

/** The diff kind of a type, when it is loaded. */
export const diffKind = (type: DiagramType | null | undefined): DiffKind | undefined => (type ? diffs[type] : undefined);

/** As `withKind`, with the model's diff kind. */
export function withDiff<R>(model: DiagramModel, f: (kind: DiffKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  const k = diffs[model.type];
  return k ? f(k, model) : undefined;
}
