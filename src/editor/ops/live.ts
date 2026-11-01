// Coalesced live edits (fields typed into, sliders dragged): one history step per run of changes.
import type { EditorCore } from '../core.js';

/**
 * The first change opens a transaction, each change redraws, and the run is committed as one history step after
 * `idle` ms or on `flush()` (change / blur).
 */
export class LiveEdit {
  private open = false;
  /** The transaction the run is in (a cancel — undo, a load, a stage switch — may have ended it). */
  private tx = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private label = '';
  constructor(private readonly core: EditorCore, private readonly idle = 400) {}

  /** Runs `f` (which mutates `core.meta` in place) inside the open transaction and redraws. */
  run(label: string, f: () => void): void {
    if (!this.open || this.core.store.txId !== this.tx) {
      this.core.begin();
      this.open = true;
      this.tx = this.core.store.txId;
    }
    this.label = label;
    try {
      f();
    } finally {
      this.core.store.preview();
      this.core.draw();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.idle);
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    if (!this.open) return;
    this.open = false;
    if (this.core.store.txId === this.tx) this.core.commit(this.label);
  }

  get pending(): boolean {
    return this.open && this.core.store.txId === this.tx;
  }
}
