// Positional ids of sequence items, computed in ONE place (the prototype computed activation ids both in
// render/sequence.js and in edit.js). The sequence parser numbers messages, notes, blocks and boxes in source order;
// activations (processes) are numbered per participant in the order they open: `B:1`, `B:2`…
import type { SequenceModel } from './model.js';

export const messageId = (n: number): string => `m${n}`;
export const noteId = (n: number): string => `n${n}`;
export const blockId = (n: number): string => `b${n}`;
export const boxId = (n: number): string => `box${n}`;

export const activationId = (participant: string, n: number): string => `${participant}:${n}`;

/** `B:2` → { participant: 'B', n: 2 } (participant ids may themselves contain `:`). */
export function parseActivationId(id: string): { participant: string; n: number } | null {
  const i = id.lastIndexOf(':');
  if (i <= 0) return null;
  const n = Number(id.slice(i + 1));
  return Number.isInteger(n) && n > 0 ? { participant: id.slice(0, i), n } : null;
}

export interface OpenActivation<T> {
  id: string;
  participant: string;
  /** Nesting depth on its participant when it opened (0 = outermost). */
  level: number;
  data: T;
}

/**
 * Activation bookkeeping shared by the renderer and the ops: open / close processes per participant (a stack each),
 * numbering them in the order they open. `T` is whatever the caller needs to keep per process (y, style, source).
 */
export class ActivationTracker<T> {
  private readonly stacks = new Map<string, OpenActivation<T>[]>();
  private readonly count = new Map<string, number>();

  open(participant: string, make: (id: string, level: number) => T): OpenActivation<T> {
    let s = this.stacks.get(participant);
    if (!s) this.stacks.set(participant, (s = []));
    const n = (this.count.get(participant) ?? 0) + 1;
    this.count.set(participant, n);
    const id = activationId(participant, n);
    const a: OpenActivation<T> = { id, participant, level: s.length, data: make(id, s.length) };
    s.push(a);
    return a;
  }

  /** Closes the innermost open process of the participant (undefined when none is open). */
  close(participant: string): OpenActivation<T> | undefined {
    return this.stacks.get(participant)?.pop();
  }

  /** Open processes of a participant, outermost first. */
  active(participant: string): readonly OpenActivation<T>[] {
    return this.stacks.get(participant) ?? [];
  }

  /** Closes everything still open (participants in first-open order, innermost first). */
  *drain(): Generator<OpenActivation<T>> {
    for (const s of this.stacks.values()) {
      while (s.length) yield s.pop()!;
    }
  }
}

/** Where a process starts or ends: a `+` / `-` marker on a message, or an `activate` / `deactivate` line. */
export interface ActivationEnd {
  type: '+' | '-' | 'line';
  /** 0-based source line. */
  src: number;
  /** The message carrying the marker. */
  msg?: string;
}

export interface ActivationInfo {
  id: string;
  participant: string;
  start: ActivationEnd;
  /** null when the process is never closed (it runs to the end of the diagram). */
  end: ActivationEnd | null;
}

/** Every process of a sequence diagram, in the order they close (prototype `activationsOf` in edit.js). */
export function activationsOf(model: Pick<SequenceModel, 'items'>): ActivationInfo[] {
  const out: ActivationInfo[] = [];
  const t = new ActivationTracker<ActivationEnd>();
  const close = (pid: string, end: ActivationEnd): void => {
    const a = t.close(pid);
    if (a) out.push({ id: a.id, participant: pid, start: a.data, end });
  };
  for (const it of model.items) {
    if (it.kind === 'message') {
      if (it.activate) t.open(it.to, () => ({ type: '+', src: it.src, msg: it.id }));
      if (it.deactivate) close(it.from, { type: '-', src: it.src, msg: it.id });
    } else if (it.kind === 'activate') t.open(it.who, () => ({ type: 'line', src: it.src }));
    else if (it.kind === 'deactivate') close(it.who, { type: 'line', src: it.src });
  }
  for (const a of t.drain()) out.push({ id: a.id, participant: a.participant, start: a.data, end: null });
  return out;
}
