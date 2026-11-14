// What each item kind is (R11, task A11b): drawn as a line between two items, a connector the user draws, kept by its
// position in the code (its id is its place: `m3` is the third message), a container of other items. The sets the
// editor and the ops used to write out each (three line-kind sets, the positional kinds) derive from this table.
import type { ItemKind } from './types.js';

export interface ItemCaps {
  /** Drawn as a line (a connector or a message): it has a label on the line, no box of its own. */
  line?: true;
  /** A connector between two boxes the user draws and re-attaches (flowchart edges, ER relationships). */
  connector?: true;
  /** Its id is its place in the code: an edit above it renames it, and its metadata moves with the code. */
  positional?: true;
  /** It holds other items (subgraphs, composites, sequence boxes). */
  container?: true;
}

export const ITEM_CAPS: Readonly<Record<ItemKind, ItemCaps>> = {
  node: {},
  group: { container: true },
  edge: { line: true, connector: true },
  participant: {},
  message: { line: true, positional: true },
  note: { positional: true },
  block: { positional: true },
  box: { positional: true, container: true },
  activation: { positional: true },
  entity: {},
  rel: { line: true, connector: true },
};

const KINDS = Object.keys(ITEM_CAPS) as ItemKind[];
const withCap = (c: keyof ItemCaps): ReadonlySet<ItemKind> => new Set(KINDS.filter((k) => ITEM_CAPS[k][c]));

/** Kinds drawn as lines. */
export const LINE_KINDS: ReadonlySet<ItemKind> = withCap('line');
/** Connectors the user draws between boxes. */
export const CONNECTOR_KINDS: ReadonlySet<ItemKind> = withCap('connector');
/** Kinds whose id is their place in the code. */
export const POSITIONAL_KINDS: ReadonlySet<ItemKind> = withCap('positional');
/** Kinds that hold other items. */
export const CONTAINER_KINDS: ReadonlySet<ItemKind> = withCap('container');
