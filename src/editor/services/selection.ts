// The editor's selection (A10e, on 1.19): one model for the document's selection (kept in the store, so undo and
// redo bring it back) and for a shown version's (its items are picked to copy them; the document's stays as it is).
// A real change of the document's selection fires `selection` and `mmdx-selection` once (B11, P5), and repaints only
// the marks and the overlay, never the picture (P4).
import { effect, untracked, type ReadSignal, type Signal } from '../../reactive/signal.js';
import { itemKey, type ItemRef } from '../../core/types.js';

/** A selected item; `foot`: a participant's copy at the bottom. */
type Pick = ItemRef & { foot?: boolean };

/** What the selection needs from the editor core (structural: the service does not import the core). */
export interface SelectionHost {
  readonly store: { readonly selection: Signal<ItemRef[]> };
  readonly version: ReadSignal<unknown>;
  readonly pageSelected: Signal<boolean>;
  fire(ev: 'selection'): void;
  emit(type: string, detail: unknown): boolean;
  drawOverlay(): void;
  /** The selection marks of the drawn picture (when it is drawn). */
  decorateSelection(): void;
}

export class SelectionService {
  /** The primary item's `foot` flag. */
  foot = false;
  /** A shown version's selection (the document's is the store's). */
  private versionSel: ItemRef[] = [];

  constructor(private readonly host: SelectionHost) {}

  /** Reports the document's selection as it changes, however it changes (a pick, undo / redo, a rollback, a load). */
  watch(): () => void {
    const h = this.host;
    let last = h.store.selection.peek().map(itemKey).join('\n');
    return effect(() => {
      const sel = h.store.selection();
      if (h.version()) return;
      const key = sel.map(itemKey).join('\n');
      if (key === last) return;
      last = key;
      untracked(() => {
        h.fire('selection');
        h.decorateSelection();
        h.drawOverlay();
        h.emit('mmdx-selection', { items: sel.map((r) => ({ kind: r.kind, id: r.id })) });
      });
    });
  }

  private current(): ItemRef[] {
    return this.host.version.peek() ? this.versionSel : this.host.store.selection.peek();
  }

  list(): Pick[] {
    return this.current().map((r, i) => (i === 0 && this.foot && r.kind === 'participant' ? { ...r, foot: true } : r));
  }

  has(r: ItemRef): boolean {
    return this.current().some((x) => x.kind === r.kind && x.id === r.id);
  }

  set(items: readonly Pick[]): void {
    const h = this.host;
    const seen = new Set<string>();
    const list: ItemRef[] = [];
    for (const it of items) {
      const k = itemKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ kind: it.kind, id: it.id });
    }
    const foot = !!items[0]?.foot;
    if (list.length) h.pageSelected.set(false);
    // a version's items are selected to copy them: the document's selection and its event stay as they are
    if (h.version.peek()) {
      this.foot = foot;
      this.versionSel = list;
      h.fire('selection');
      h.drawOverlay();
      return;
    }
    // the document's selection: `watch` fires and emits when it changes; the same items again do nothing (P5)
    // unless only the participant end (its foot) changed
    const footChanged = foot !== this.foot;
    this.foot = foot;
    h.store.selection.set(list);
    if (footChanged) {
      h.fire('selection');
      h.drawOverlay();
    }
  }

  toggle(it: Pick): void {
    const cur = this.list();
    const i = cur.findIndex((x) => x.kind === it.kind && x.id === it.id);
    if (i >= 0) {
      cur.splice(i, 1);
      this.set(cur);
    } else this.set([it, ...cur]);
  }

  /** A version shows (or the next one: the same items stay selected while they are there). */
  keepForVersion(stillThere: (r: ItemRef) => boolean, continuing: boolean): void {
    this.versionSel = continuing ? this.versionSel.filter(stillThere) : [];
  }

  /** The version closed: its selection goes. */
  clearVersion(): void {
    this.versionSel = [];
  }
}
