// The version source (A10g): an old version shown read-only in the editor's canvas (History). It reads the version's
// source once (its document and model), keeps the same items selected from version to version, and puts aside what
// the document's view had (its entered group and layer override) to give it back when the document shows again.
import { normalizeMeta, splitSource, type DiagramDocument } from '../../core/meta/index.js';
import type { DiagramModel } from '../../core/model.js';
import { reparse } from '../../core/parse/dispatch.js';
import type { ItemRef } from '../../core/types.js';
import { signal, type ReadSignal, type Signal } from '../../reactive/signal.js';
import { elementExists } from '../../core/ops/ids.js';

/** An old version shown read-only in the editor's canvas (History): read and drawn instead of the store's document. */
export interface VersionView {
  id: string;
  source: string;
  doc: DiagramDocument;
  model: DiagramModel;
}

export interface VersionHost {
  enteredGroup: Signal<string | null>;
  pageSelected: Signal<boolean>;
  visibleLayers: ReadSignal<readonly string[] | undefined>;
  setLayers(ids: readonly string[] | undefined): void;
  /** Ends the edit in flight and the inline editor (nothing is written while a version shows). */
  stopEditing(): void;
  /** Loads the kinds of the version's diagram type. */
  needKind(code: string): void;
  selections: { keepForVersion(exists: (r: ItemRef) => boolean, again: boolean): void; clearVersion(): void };
  /** The shown document changed: draw it and tell the panels. */
  shown(): void;
}

export class VersionSource {
  private readonly state = signal<VersionView | null>(null);
  /** The version shown (null: the document). */
  readonly view: ReadSignal<VersionView | null> = this.state;
  /** What showing a version put aside, given back after it. */
  private aside: { group: string | null; layers: readonly string[] | undefined } | null = null;

  constructor(private readonly host: VersionHost) {}

  /**
   * Shows an old version read-only or the document again (null). The document's selection, entered group and layer
   * visibility are kept for when it is back.
   */
  show(v: { id: string; source: string } | null): void {
    const cur = this.state.peek(), h = this.host;
    if ((v?.id ?? null) === (cur?.id ?? null) && v?.source === cur?.source) return;
    h.stopEditing();
    if (v) {
      const split = splitSource(v.source);
      const doc: DiagramDocument = { code: split.doc.code, meta: normalizeMeta(split.doc.meta) };
      if (!cur) {
        this.aside = { group: h.enteredGroup.peek(), layers: h.visibleLayers.peek() };
        h.enteredGroup.set(null);
        h.pageSelected.set(false);
      }
      // the same item stays selected from version to version while it is there
      const model = reparse(doc.code);
      h.needKind(doc.code);
      h.selections.keepForVersion((r) => elementExists(model, r), !!cur);
      this.state.set({ id: v.id, source: v.source, doc, model });
    } else {
      this.state.set(null);
      h.selections.clearVersion();
      const back = this.aside;
      this.aside = null;
      if (back) {
        h.enteredGroup.set(back.group);
        h.setLayers(back.layers);
      }
    }
    h.shown();
  }
}
