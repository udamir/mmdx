// A pointer gesture's history step (X17): the transaction begins lazily, at the gesture's first write (a click that never moves records nothing), and the release commits it as one step or the cancel rolls it back.
import type { EditorCore, Gesture } from '../core.js';

type TxCore = Pick<EditorCore, 'begin' | 'commit' | 'rollback'>;

/** A gesture's transaction, begun on its first write. */
export interface GestureTx {
  /** Begins the transaction unless it has begun. */
  begin(): void;
  readonly began: boolean;
  /** Commits it as one history step (nothing when it never began). */
  commit(label: string): void;
  /** Rolls it back (nothing when it never began). */
  rollback(): void;
}

export function gestureTx(core: TxCore): GestureTx {
  let began = false;
  return {
    begin() {
      if (began) return;
      core.begin();
      began = true;
    },
    get began() {
      return began;
    },
    commit(label) {
      if (began) core.commit(label);
      began = false;
    },
    rollback() {
      if (began) core.rollback();
      began = false;
    },
  };
}

/**
 * A gesture that writes the document on every move and redraws: `apply` writes (a preview computed from the state at the gesture's start), the release records one history step `label`, a cancel rolls it back; `done` runs on both (the gesture's state goes).
 */
export function metaGesture(core: TxCore & Pick<EditorCore, 'draw'>, label: string, apply: (dx: number, dy: number, ev: PointerEvent) => void, done?: () => void): Gesture {
  const tx = gestureTx(core);
  return {
    move(dx, dy, ev) {
      tx.begin();
      apply(dx, dy, ev);
      core.draw();
    },
    end() {
      done?.();
      tx.commit(label);
    },
    cancel() {
      done?.();
      tx.rollback();
    },
  };
}
