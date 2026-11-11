// What the parts of ER table editing share (5.5): the table being edited, its selected rows, the open row editor and
// the drop line of a row drag, and the module's operations on them.
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { ErAttribute } from '../../../core/model.js';
import type { Rect } from '../../../core/types.js';
import type { EditorCore } from '../../core.js';
import type { TableBox } from './rows.js';

export interface TableState {
  /** The table being edited (null: none). */
  table: string | null;
  /** Its selected rows (attribute indices). */
  sel: number[];
  /** The open row editor. */
  editor: { close(apply: boolean): void } | null;
  /** Where dragged rows will land (null: no drag). */
  dropGap: number | null;
}

export interface TableContext {
  core: EditorCore;
  t: EditorCore['i18n']['t'];
  st: TableState;
  attrs(): ErAttribute[];
  box(): TableBox | null;
  /** Row i on screen (canvas-local px). */
  rowRect(i: number): Rect | null;
  /** The table's effective style value. */
  tableValue(k: string): unknown;
  /** Rewrites the table's attributes (one history step); `meta` carries highlight renames along. */
  setAttrs(next: readonly ErAttribute[], label: string, meta?: DiagramMeta): boolean;
  /** The metadata with the highlights keyed by the new names (undefined: no highlights). */
  remapHighlights(names: readonly (string | null)[]): DiagramMeta | undefined;
  deleteRows(rows: readonly number[]): void;
  /** Repaints the row selection and rebuilds the attribute toolbar. */
  refresh(): void;
}
