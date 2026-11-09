// The edit kind (T01, layer 3): what the editor's modules need from a diagram type — item text, structure edits
// (delete, group), copying, connecting, the Shapes menu, inspectors and toolbars. The editor loads it with the type's
// view and ops kinds; a missing hook means the type does not offer that action.
import type { Direction, SupportedModel } from '../../core/model.js';
import type { EdgeAnimation } from '../../core/ops/flow-edge.js';
import type { MediaPatch } from '../../core/ops/flow-media.js';
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
  /** The text is a markdown string (`**bold**` and `*italic*` are styled words; T06). */
  markdown?: boolean;
  /** Writes the text as a markdown string (once it is formatted); absent: the item's text cannot be one. */
  writeMarkdown?(code: string, v: string): CodeResult;
}

export type { MediaPatch } from '../../core/ops/flow-media.js';

/** An item's icon and image, as the insert UI, the selection toolbar and Properties show them (T05). */
export interface ItemMedia {
  /** Its icon (`pack:name`), if any. */
  icon: string | null;
  /** Its image URL, if any. */
  image: string | null;
  /** An icon or image item with layout keys of its own (position, frame, size, aspect lock); null: an icon in its label. */
  node: 'icon' | 'image' | null;
  /** The item can take an image (`setImage`). */
  canImage: boolean;
  /** The item's icon can be set (`setIcon`): a flowchart's image and icon nodes only (an icon is their source instead of a picture), every mindmap node (`::icon`); default true. */
  canIcon?: boolean;
  /** Where the label goes (`t`, `b`), the icon's frame (`square`, `circle`, `rounded`), the size, the aspect lock (`on`, `off`). */
  pos?: string;
  form?: string;
  w?: number;
  h?: number;
  constraint?: string;
}

/** A one-click action of the type's own in an item's selection toolbar (T11.3): it writes the code itself. */
export interface ItemAction {
  id: string;
  /** Title (already translated). */
  label: string;
  /** An icon of the style toolbar's fixed set. */
  icon: string;
  /** The current choice of a set (a note's placement). */
  active?: boolean;
  disabled?: boolean;
  run(): void;
}

/** A control of the type's own in an item's Properties (T09: a state's kind and description rows, a composite's direction and regions). */
export type PropControl =
  | { type: 'select'; label: string; value: string; options: readonly (readonly [string, string])[]; set(v: string): void }
  /** One entry per line (a state's description rows). */
  | { type: 'rows'; label: string; value: readonly string[]; hint?: string; set(rows: string[]): void }
  | { type: 'button'; label: string; title?: string; run(): void };

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
  /** A question to ask before ungrouping (the state diagram's inner starts and ends are rewired); null: none. */
  ungroupConfirm?(model: M, ref: Sel): { title: string; message: string; ok: string } | null;
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

  // ---- insert dock and media (T05): a missing hook hides its button or control ----
  /** Adds an image item at a point; `url` passed the image policy. */
  addImage?(core: EditorCore, model: M, url: string, at: Point): boolean;
  /** An item's icon and image (null: the item takes neither). */
  media?(model: M, ref: ItemRef, core: EditorCore): ItemMedia | null;
  /** Sets an item's icon in `code`, or removes it (null); null result: the item cannot take one. */
  setIcon?(code: string, model: M, ref: ItemRef, icon: string | null, core: EditorCore): CodeResult | null;
  /** Sets an item's image (a URL that passed the image policy), or removes it (null). */
  setImage?(code: string, model: M, ref: ItemRef, url: string | null, core: EditorCore): CodeResult | null;
  /** The type has no image syntax: an image is the item's metadata `img` (the editor writes it; `setImage` is not called). */
  imageInMeta?: boolean;
  /**
   * The type draws its icons and images beside the label through core/render/decorate.ts (T10): their place, size and
   * fit are item metadata (`iconPos`, `iconSize`, `imgW`, `imgH`, `imgFit`), which Properties edits.
   */
  decorated?: boolean;
  /** Where a label's icon token is drawn without metadata `iconPos` (default `l`, inline; sequence participants: `t`). */
  iconPos?: 'l' | 't' | 'b';
  /** Stock Mermaid shows every icon token in the type's labels as text (sequence): Properties says so. */
  iconsAsText?: boolean;
  /** Changes an icon or image item's position, frame, size or aspect lock. */
  setMedia?(code: string, model: M, ref: ItemRef, patch: MediaPatch, core: EditorCore): CodeResult | null;
  /** A connector's animation (dashes flowing along it); null: the item has none to set. */
  animation?(model: M, ref: ItemRef): EdgeAnimation | null;
  /** Sets a connector's animation in `code`; null: it cannot be written. */
  setAnimation?(code: string, model: M, ref: ItemRef, a: EdgeAnimation): SelectResult | null;

  // ---- page, toolbars, problems ----
  /** The diagram's direction, when the type has one (flowchart, ER). */
  direction?(model: M): Direction;
  /** Message numbering, when the type has it (sequence). */
  numbered?(model: M): boolean;
  /** Connectors are always straight: no routing setting (sequence messages). */
  straight?: boolean;
  /** Page settings the type writes its own way, as selects in Page properties (mindmap: colour by branch or depth, in the frontmatter). */
  pageOptions?(model: M, core: EditorCore): { label: string; options: readonly (readonly [string, string])[]; value: string; set(v: string): void }[];
  /** The type's own page layout fields (sequence: gap, row height, mirror, block span), with the Properties section title (i18n key). */
  layout?: { title: string; fields: readonly string[] };
  /** i18n key of the Shapes dock button's label (default `tools.shapes`). */
  shapesLabel?: string;
  /** i18n key of the toolbar's order button title (default `tb.order`). */
  orderTitle?: string;
  /** A fix of a diagnostic the type handles itself (flowchart: an id used by a node and a subgraph). */
  fixOf?(core: EditorCore, model: M, d: Diagnostic): { label: string; run(): void } | null;
  /** Controls of the type's own in an item's Properties, after its text. */
  properties?(core: EditorCore, model: M, ref: ItemRef): PropControl[];
  /** One-click actions of the type's own in a single item's selection toolbar (a message's direction, a note's placement, a block's branches). */
  actions?(core: EditorCore, model: M, ref: ItemRef): ItemAction[];
  /** A connector's arrow as written in the code, which the toolbar's arrow popover changes (sequence messages); null: none. */
  codeArrow?(core: EditorCore, model: M, ref: ItemRef): { rows: readonly (readonly string[])[]; value: string; set(arrow: string): void } | null;
  /** More problems of the code (flowchart: classes that name no classDef or preset, shapes kept only in metadata), with a fix where there is one. */
  problems?(core: EditorCore, model: M): { line: number | null; msg: string; fix?: { label: string; run(): void } }[];

  /** Geometry of the type (for typing the hooks that take it). */
  readonly geom?: G;
}

export type EditKinds = Partial<Record<NonNullable<SupportedModel['type']>, EditKind>>;
