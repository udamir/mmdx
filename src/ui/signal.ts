// A tiny reactive core (§4.3): signal, computed, effect, batch. Replaces the prototype's ad hoc refresh*() calls
// without a framework. Effects run synchronously after the outermost batch; dependencies are re-tracked each run.

type Sub = { run(): void; deps: Set<Set<Sub>> };

let current: Sub | null = null;
let depth = 0;
const queue = new Set<Sub>();

function flush(): void {
  while (queue.size) {
    const subs = [...queue];
    queue.clear();
    for (const s of subs) s.run();
  }
}

export interface ReadSignal<T> {
  (): T;
  /** Reads without tracking. */
  peek(): T;
}

export interface Signal<T> extends ReadSignal<T> {
  set(v: T): void;
  update(f: (v: T) => T): void;
}

export function signal<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Signal<T> {
  let value = initial;
  const subs = new Set<Sub>();
  const read = (() => {
    if (current) {
      subs.add(current);
      current.deps.add(subs);
    }
    return value;
  }) as Signal<T>;
  read.peek = () => value;
  read.set = (v: T) => {
    if (equals(value, v)) return;
    value = v;
    for (const s of [...subs]) queue.add(s);
    if (!depth) flush();
  };
  read.update = (f) => read.set(f(value));
  return read;
}

function cleanup(s: Sub): void {
  for (const d of s.deps) d.delete(s);
  s.deps.clear();
}

/** Runs `f` now and again whenever a signal it read changes. Returns a disposer. */
export function effect(f: () => void | (() => void)): () => void {
  let disposed = false;
  let teardown: void | (() => void);
  const s: Sub = {
    deps: new Set(),
    run() {
      if (disposed) return;
      cleanup(s);
      if (typeof teardown === 'function') teardown();
      const prev = current;
      current = s;
      try {
        teardown = f();
      } finally {
        current = prev;
      }
    },
  };
  s.run();
  return () => {
    disposed = true;
    cleanup(s);
    if (typeof teardown === 'function') teardown();
  };
}

/** A derived value, recomputed lazily when one of its inputs changed. */
export function computed<T>(f: () => T): ReadSignal<T> {
  let dirty = true;
  let value: T;
  const subs = new Set<Sub>();
  const self: Sub = {
    deps: new Set(),
    run() {
      if (dirty) return;
      dirty = true;
      for (const s of [...subs]) queue.add(s);
    },
  };
  const read = (() => {
    if (current) {
      subs.add(current);
      current.deps.add(subs);
    }
    if (dirty) {
      cleanup(self);
      const prev = current;
      current = self;
      try {
        value = f();
      } finally {
        current = prev;
      }
      dirty = false;
    }
    return value;
  }) as ReadSignal<T>;
  read.peek = () => {
    const prev = current;
    current = null;
    try {
      return read();
    } finally {
      current = prev;
    }
  };
  return read;
}

/** Groups several sets into one notification pass. */
export function batch<T>(f: () => T): T {
  depth++;
  try {
    return f();
  } finally {
    if (--depth === 0) flush();
  }
}

/** Runs `f` without tracking the signals it reads. */
export function untracked<T>(f: () => T): T {
  const prev = current;
  current = null;
  try {
    return f();
  } finally {
    current = prev;
  }
}
