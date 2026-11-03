// The edit kind (T01, layer 3): what the editor's modules need from a diagram type — item text, structure edits
// (delete, group), copying, connecting, the Shapes menu, inspectors and toolbars. The editor loads it with the type's
// view and ops kinds; a missing hook means the type does not offer that action.
import type { Direction, SupportedModel } from '../../core/model.js';
import type { CodeResult, ConnectResult, RefusableResult, SelectResult } from '../../core/ops/types.js';
import type { GeometryIndex } from '../../core/render/types.js';
import type { Diagnostic, ItemKind, ItemRef } from '../../core/types.js';
import type { Point } from '../../core/types.js';
import type { EditorCore, Sel } from '../core.js';
import type { PaletteItem, PaletteSpec } from './palette.js';

/** An item's text and how to write it back to Mermaid. */
export interface ItemText {
  value: string;
  multi: boolean;
  /** i18n key of the section title. */
  title: string;
  write(code: string, v: string): CodeResult;
}

export interface EditKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];

  // ---- text ----
  /** Title and sub line of the Properties panel for an item (null: the item is gone). */
  describe(model: M, ref: ItemRef): { title: string; sub: string } | null;
  /** The item's text (null: it has none). */
  text(model: M, ref: ItemRef): ItemText | null;

  // ---- structure ----
  remove(code: string, model: M, refs: readonly ItemRef[]): RefusableResult;
  /** Deletes a single item the type removes its own way (a sequence process); true when it handled it. */
  removeOne?(core: EditorCore, model: M, ref: Sel): boolean;
  /** Can the selection be grouped? `reason` is an i18n key ('' when nothing to say). */
  canGroup(model: M, sel: readonly Sel[]): { ok: boolean; reason: string };
  group?(code: string, model: M, sel: readonly Sel[], title: string): SelectResult;
  /** Removes a container, keeping what is in it (null: the item is not one of the type's containers). */
  ungroup?(code: string, model: M, ref: Sel): { code: string; members: Sel[] } | null;
  renameContainer?(code: string, model: M, ref: Sel, name: string): CodeResult | null;
  /** Plain Mermaid of copied items (the system clipboard's text). */
  fragment?(model: M, code: string, refs: readonly ItemRef[]): string;
  /** The toast when nothing in the selection can be copied (default "Nothing to copy"). */
  noCopy?: string;
  /** Alt-drag copies items. */
  altCopy?: boolean;

  // ---- connect ----
  /** Item kinds a connection starts or ends on. */
  connectable?: readonly ItemKind[];
  /** Adds a connector between two items. */
  connect?(code: string, from: string, to: string): CodeResult;
  /** The connector just added between two items in the new model, and whether it takes the dragged ports. */
  added?(model: M, from: string, to: string): { ref: Sel; ports: boolean } | null;
  /** History label and toast of a new connector (default: Connect, "Connection added — …"). */
  connected?: { label: string; toast: string };
  /** Re-attaches end `which` of a connector to another item. */
  reconnect?(code: string, model: M, ref: ItemRef, which: 'a' | 'b', target: string): ConnectResult | null;
  /** The id of a re-attached connector in the model after the rewrite. */
  reconnected?(model: M, r: ConnectResult): string | undefined;

  // ---- shapes ----
  /**
   * Writes an item's shape to the Mermaid code (flowchart: a bracket or `@{ shape }`); null when the code cannot hold
   * it (a shape Mermaid lacks, an item without code shapes): the editor keeps it in metadata.
   */
  setShape?(code: string, model: M, ref: ItemRef, shape: string): CodeResult | null;

  // ---- Shapes menu ----
  /** What the Shapes dock button offers. */
  palette?: PaletteSpec;
  /** Adds a palette item at a (snapped) diagram point; false when refused (a toast says why). */
  drop?(core: EditorCore, model: M, item: PaletteItem, at: Point): boolean;

  // ---- page, toolbars, problems ----
  /** The diagram's direction, when the type has one (flowchart, ER). */
  direction?(model: M): Direction;
  /** Message numbering, when the type has it (sequence). */
  numbered?(model: M): boolean;
  /** Connectors are always straight: no routing setting (sequence messages). */
  straight?: boolean;
  /** The type's own page layout fields (sequence: gap, row height, mirror, block span), with the Properties section title (i18n key). */
  layout?: { title: string; fields: readonly string[] };
  /** i18n key of the Shapes dock button's label (default `tools.shapes`). */
  shapesLabel?: string;
  /** i18n key of the toolbar's order button title (default `tb.order`). */
  orderTitle?: string;
  /** A fix of a diagnostic the type handles itself (flowchart: an id used by a node and a subgraph). */
  fixOf?(core: EditorCore, model: M, d: Diagnostic): { label: string; run(): void } | null;
  /** More problems of the code (flowchart: classes that name no classDef or preset, shapes kept only in metadata), with a fix where there is one. */
  problems?(core: EditorCore, model: M): { line: number | null; msg: string; fix?: { label: string; run(): void } }[];

  /** Geometry of the type (for typing the hooks that take it). */
  readonly geom?: G;
}

export type EditKinds = Partial<Record<NonNullable<SupportedModel['type']>, EditKind>>;
