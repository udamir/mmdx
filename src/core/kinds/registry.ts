// The view kinds loaded so far, for the generic helpers (layers, outline, diff, ops…) that get a model and need its
// type's descriptor. A model only exists once its type's parser ran, so its kind is here: every set of kinds is
// registered where it is built (core/kinds/all.ts, the viewer's and the editor's loaders). Static code shared by
// every component on the page — no instance state (that comes in through the CoreContext).
import type { DiagramModel, SupportedModel } from '../model.js';
import type { DiagramType } from '../types.js';
import type { DiffKind, DiffKinds } from '../kind/diff-types.js';
import type { ExtrasKind, ExtrasKinds } from '../kind/extras-types.js';
import type { OpsKind, OpsKinds } from '../kind/ops-types.js';
import type { Kinds, ViewKind } from '../kind/types.js';

/** Which part of a type's code: the view kind (parse, render), the ops kind (the editor's edits), the diff kind or the extras (outline, portable styles). */
export type KindLayer = 'view' | 'ops' | 'diff' | 'extras';

/** A kind asked for that is not loaded (A4: lookups fail closed). */
export class KindNotLoaded extends Error {
  readonly code = 'kind.not-loaded';
  constructor(readonly type: DiagramType, readonly layer: KindLayer) {
    super(`the ${layer} kind of ${type} is not loaded`);
  }
}

/** The kinds registered so far, by layer (one set for the page). */
class KindSet {
  readonly view: Kinds = {};
  readonly ops: OpsKinds = {};
  readonly diff: DiffKinds = {};
  readonly extras: ExtrasKinds = {};

  /** A layer's kind of a type; throws KindNotLoaded when it is not loaded. */
  require<L extends KindLayer>(layer: L, type: DiagramType): NonNullable<KindSet[L][DiagramType]> {
    const k = this[layer][type];
    if (!k) throw new KindNotLoaded(type, layer);
    return k as NonNullable<KindSet[L][DiagramType]>;
  }
}

/** The page's kinds. */
export const KINDS = new KindSet();

/** A layer's kind of a type, failing closed: throws KindNotLoaded (code `kind.not-loaded`) when it is not loaded. */
export const requireKind = <L extends KindLayer>(type: DiagramType, layer: L): NonNullable<KindSet[L][DiagramType]> => KINDS.require(layer, type);

const registered: Kinds = KINDS.view;

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

/**
 * Calls `f` with the model's view kind and the model as a supported one; undefined for an unsupported diagram. A model
 * of a type whose view kind is not loaded cannot come from a parser: it fails closed (KindNotLoaded).
 */
export function withKind<R>(model: DiagramModel, f: (kind: ViewKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  return f(KINDS.require('view', model.type), model);
}


// ---- ops kinds (the editor) ----

const ops: OpsKinds = KINDS.ops;

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

/** As `withKind`, with the model's ops kind (fails closed: KindNotLoaded when the type's ops kind is not loaded). */
export function withOps<R>(model: DiagramModel, f: (kind: OpsKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  return f(KINDS.require('ops', model.type), model);
}

// ---- diff kinds (the diff, History, core) ----

const diffs: DiffKinds = KINDS.diff;

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

/** As `withKind`, with the model's diff kind (fails closed: KindNotLoaded when the type's diff kind is not loaded). */
export function withDiff<R>(model: DiagramModel, f: (kind: DiffKind, model: SupportedModel) => R): R | undefined {
  if (!model.type) return undefined;
  return f(KINDS.require('diff', model.type), model);
}

// ---- extras kinds (core's outline and portable export) ----

const extras: ExtrasKinds = KINDS.extras;

/** Makes the extras kinds available to `outline()` and the portable export; returns the same set. */
export function registerExtras<K extends ExtrasKinds>(kinds: K): K {
  for (const k of Object.values(kinds)) if (k) extras[k.type] = k;
  return kinds;
}

/** The extras kind of a type, when it is loaded. */
export const extrasKind = (type: DiagramType | null | undefined): ExtrasKind | undefined => (type ? extras[type] : undefined);
