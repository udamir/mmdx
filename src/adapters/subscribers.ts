// The subscriber set of an adapter's `subscribe` (X20, 4.12): add a callback (its remover returned), notify them all.

export interface Subscribers<A extends unknown[] = []> {
  add(cb: (...args: A) => void): () => void;
  notify(...args: A): void;
  readonly size: number;
}

export function createSubscribers<A extends unknown[] = []>(): Subscribers<A> {
  const subs = new Set<(...args: A) => void>();
  return {
    add(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    // a callback that unsubscribes while notified does not skip the next one
    notify: (...args) => {
      for (const cb of [...subs]) cb(...args);
    },
    get size() {
      return subs.size;
    },
  };
}
