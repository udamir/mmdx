// DocStore (§6.1, §6.3): the document state of one editor instance — source snapshots, derived model, history with
// transactions. UI state lives beside it (EditorUi) and is never saved into the document.
import { joinSource, normalizeMeta, splitSource, type DiagramDocument } from '../core/meta/index.js';
import type { DiagramMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';
import { activationsOf } from '../core/ids.js';
import { parse } from '../core/parse/index.js';
import type { Diagnostic, ItemRef } from '../core/types.js';
import { computed, signal, type ReadSignal } from '../ui/signal.js';

export type ChangeReason = 'op' | 'code' | 'undo' | 'redo' | 'load' | 'remote';

export interface HistoryEntry {
  source: string;
  selection: ItemRef[];
  label: string;
}

export interface Snapshot {
  code: string;
  meta: DiagramMeta;
}

export interface StoreOptions {
  /** History byte budget (default 5 MB). */
  historyBytes?: number;
  onChange?: (source: string, reason: ChangeReason) => void;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Snapshot history (the prototype's, which handles code edits uniformly) with explicit transactions instead of a
 * 400 ms timer: `begin()` … `commit(label)` is one undo step however many mutations happen in between.
 */
export class DocStore {
  /** Mermaid code without %%@ lines. */
  readonly code = signal('');
  /** Metadata. Mutated in place by gestures inside a transaction, then `touch()`ed; replaced on load. */
  readonly meta = signal<DiagramMeta>({ canvas: {}, styles: {} }, () => false);
  readonly metaDiagnostics = signal<Diagnostic[]>([]);
  readonly selection = signal<ItemRef[]>([], sameRefs);
  readonly model: ReadSignal<DiagramModel>;
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly dirty = signal(false);
  /** Bumps on every committed change (cheap dependency for views). */
  readonly revision = signal(0);

  private history: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private bytes = 0;
  private last = '';
  private saved = '';
  private txDepth = 0;
  private txStart: { source: string; selection: ItemRef[] } | null = null;
  private readonly budget: number;

  constructor(private readonly opts: StoreOptions = {}) {
    this.budget = opts.historyBytes ?? 5 * 1024 * 1024;
    this.model = computed(() => parse(this.code()));
  }

  /** The full text: code + %%@ lines. */
  source(): string {
    return joinSource({ code: this.code.peek(), meta: this.meta.peek() });
  }

  doc(): DiagramDocument {
    return { code: this.code.peek(), meta: this.meta.peek() };
  }

  /** Loads a document. `reset` clears history (new file); `push` makes it an undoable step (remote update). */
  load(src: string, opts: { history?: 'reset' | 'push'; reason?: ChangeReason; markSaved?: boolean } = {}): void {
    const before = this.last;
    const beforeSel = this.selection.peek();
    const split = splitSource(src);
    this.code.set(split.doc.code);
    this.meta.set(normalizeMeta(split.doc.meta));
    this.metaDiagnostics.set(split.diagnostics);
    const now = this.source();
    if (opts.history === 'push' && before && before !== now) this.pushHistory({ source: before, selection: beforeSel, label: 'Reload' });
    else if (opts.history !== 'push') {
      this.history = [];
      this.future = [];
      this.bytes = 0;
    }
    this.last = now;
    if (opts.markSaved !== false) this.saved = now;
    this.selection.set(this.selection.peek().filter((r) => this.exists(r)));
    this.sync(opts.reason ?? 'load');
  }

  /** Replaces the code (typing in the code panel, ops). %%@ lines pasted into the code move into metadata (A.1 row 5). */
  setCode(code: string, label = 'Edit code'): void {
    if (/^\s*%%@/m.test(code)) {
      const split = splitSource(joinSource({ code, meta: this.meta.peek() }));
      this.mutate(label, () => {
        this.code.set(split.doc.code);
        this.meta.set(normalizeMeta(split.doc.meta));
      }, 'code');
      return;
    }
    this.mutate(label, () => this.code.set(code), 'code');
  }

  /** Replaces code and metadata together (most ops return both). */
  apply(next: Snapshot, label: string, selection?: ItemRef[]): void {
    this.mutate(label, () => {
      if (next.code !== this.code.peek()) this.code.set(next.code);
      this.meta.set(next.meta);
      if (selection) this.selection.set(selection);
    });
  }

  /** Runs `f`, which may mutate `meta.peek()` in place; one history step. */
  mutate(label: string, f: () => void, reason: ChangeReason = 'op'): void {
    this.begin();
    try {
      f();
      this.meta.set(this.meta.peek());
    } finally {
      this.commit(label, reason);
    }
  }

  /** Opens a transaction (drags, slider moves, key repeats). Nested calls join the outer one. */
  begin(): void {
    if (this.txDepth++ === 0) this.txStart = { source: this.last || this.source(), selection: this.selection.peek() };
  }

  /** Live preview inside a transaction: re-derive and redraw without recording. */
  preview(): void {
    this.meta.set(this.meta.peek());
    this.revision.update((n) => n + 1);
  }

  /** Closes a transaction. Records one step when the source changed. */
  commit(label: string, reason: ChangeReason = 'op'): void {
    if (this.txDepth === 0) return;
    if (--this.txDepth > 0) return;
    const start = this.txStart;
    this.txStart = null;
    const now = this.source();
    if (start && now !== start.source) {
      this.pushHistory({ source: start.source, selection: start.selection, label });
      this.future = [];
      this.last = now;
      this.sync(reason);
    } else this.revision.update((n) => n + 1);
  }

  /** Abandons a transaction and restores the state before it (Esc during a drag, vetoed op). */
  rollback(): void {
    if (this.txDepth === 0) return;
    this.txDepth = 0;
    const start = this.txStart;
    this.txStart = null;
    if (!start) return;
    const split = splitSource(start.source);
    this.code.set(split.doc.code);
    this.meta.set(normalizeMeta(split.doc.meta));
    this.selection.set(start.selection);
    this.revision.update((n) => n + 1);
  }

  get inTransaction(): boolean {
    return this.txDepth > 0;
  }

  undoLabel(): string | null {
    return this.history[this.history.length - 1]?.label ?? null;
  }
  redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.bytes -= prev.source.length * 2;
    this.future.push({ source: this.source(), selection: this.selection.peek(), label: prev.label });
    this.restore(prev, 'undo');
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.pushHistory({ source: this.source(), selection: this.selection.peek(), label: next.label });
    this.restore(next, 'redo');
  }

  markSaved(source = this.source()): void {
    this.saved = source;
    this.dirty.set(this.source() !== this.saved);
  }

  /** Does the item still exist in the current model? */
  exists(r: ItemRef): boolean {
    return itemExists(this.model.peek(), r, this.meta.peek());
  }

  private restore(e: HistoryEntry, reason: ChangeReason): void {
    const split = splitSource(e.source);
    this.code.set(split.doc.code);
    this.meta.set(normalizeMeta(split.doc.meta));
    this.last = this.source();
    this.selection.set(e.selection.filter((r) => this.exists(r)));
    this.sync(reason);
  }

  private pushHistory(e: HistoryEntry): void {
    this.history.push(e);
    this.bytes += e.source.length * 2;
    while (this.bytes > this.budget && this.history.length > 1) {
      const dropped = this.history.shift()!;
      this.bytes -= dropped.source.length * 2;
    }
  }

  private sync(reason: ChangeReason): void {
    this.canUndo.set(this.history.length > 0);
    this.canRedo.set(this.future.length > 0);
    this.dirty.set(this.source() !== this.saved);
    this.revision.update((n) => n + 1);
    this.opts.onChange?.(this.source(), reason);
  }

  /** Deep copy of the current snapshot, for ops that build the next state functionally. */
  snapshot(): Snapshot {
    return { code: this.code.peek(), meta: clone(this.meta.peek()) };
  }
}

function sameRefs(a: readonly ItemRef[], b: readonly ItemRef[]): boolean {
  return a.length === b.length && a.every((r, i) => r.kind === b[i]!.kind && r.id === b[i]!.id);
}

/** Item existence for selection repair after undo / reload. */
export function itemExists(model: DiagramModel, r: ItemRef, _meta?: DiagramMeta): boolean {
  switch (model.type) {
    case 'flowchart':
      return r.kind === 'node' ? model.nodes.has(r.id) : r.kind === 'group' ? model.groups.has(r.id) : r.kind === 'edge' ? model.edges.some((e) => e.id === r.id) : false;
    case 'sequence':
      if (r.kind === 'participant') return model.participants.some((p) => p.id === r.id);
      if (r.kind === 'box') return model.boxes.some((b) => b.id === r.id);
      if (r.kind === 'message' || r.kind === 'note') return model.items.some((i) => i.kind === r.kind && i.id === r.id);
      if (r.kind === 'block') return model.items.some((i) => i.kind === 'blockStart' && i.id === r.id);
      if (r.kind === 'activation') return activationsOf(model).some((a) => a.id === r.id);
      return false;
    case 'er':
      return r.kind === 'entity' ? model.entities.has(r.id) : r.kind === 'rel' ? model.rels.some((x) => x.id === r.id) : false;
    default:
      return false;
  }
}
