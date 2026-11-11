// The editor's UI state (A10f): what the session shows besides the document — the snap grid, the open inline text
// editor and its formatting, the ER table being edited, the item under the pointer, the item clipboard — and what
// the host gave it (the image store, the upload, the export name). Signals, so a module can follow them; the core
// reads them through getters and its owners write them through `set`.
import { signal } from '../../reactive/signal.js';
import type { ItemRef } from '../../core/types.js';
import type { ImageStore } from '../../ports.js';

export class UiState<Sel extends ItemRef = ItemRef, Session = unknown, Clip = unknown> {
  /** The host's upload of a dropped, pasted or chosen picture: the URL the image references; null: by URL only. */
  readonly uploadImage = signal<((file: File) => Promise<{ url: string }>) | null>(null);
  /** The host's image store (the image tool's Library; uploads go to it first); null: no library. */
  readonly images = signal<ImageStore | null>(null);
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
