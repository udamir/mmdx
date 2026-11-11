// The editor's UI state (A10f): what the session shows besides the document — the snap grid, the open inline text
// editor and its formatting, the ER table being edited, the item under the pointer, the item clipboard — and the
// export name (what the host gives, its image store and upload, is HostServices). Signals, so a module can follow
// them; the core reads them through getters and its owners write them through `set`.
import { signal } from '../../reactive/signal.js';
import type { ItemRef } from '../../core/types.js';

export class UiState<Sel extends ItemRef = ItemRef, Session = unknown, Clip = unknown> {
  /** Base name of exports (no extension); files opened through `openFiles` set it. */
  readonly fileName = signal('diagram');
  /** Session snap grid in diagram px (0 = off). Alt while dragging = free. */
  readonly snap = signal(5);
  /** An inline text editor is open over this item: no handles around it. */
  readonly inlineEditing = signal<ItemRef | null>(null);
  /** The open inline text editor's formatting (the toolbar's text format menu acts on its selection). */
  readonly textEdit = signal<Session | null>(null);
  /** ER table whose attributes are being edited: drawn as a table with an empty row for a new attribute. */
  readonly tableView = signal<string | null>(null);
  /** Item under the pointer (connection dots on hover). */
  readonly hover = signal<Sel | null>(null);
  /** The item clipboard (never saved): copies carry their content, so History can fill it too. */
  readonly clipboard = signal<Clip | null>(null);
}
