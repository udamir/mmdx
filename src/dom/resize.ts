// One ResizeObserver for every element a component watches (the previous review: an observer per component
// instance). A size change calls the callbacks of its element.

let observer: ResizeObserver | null = null;
const callbacks = new Map<Element, Set<() => void>>();

/** Calls `cb` when `el` changes size. Returns the stop (the shared observer goes once nothing is watched). */
export function observeSize(el: Element, cb: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) for (const f of [...(callbacks.get(e.target) ?? [])]) f();
  });
  const f = (): void => cb();
  let set = callbacks.get(el);
  if (!set) {
    callbacks.set(el, (set = new Set()));
    observer.observe(el);
  }
  set.add(f);
  return () => {
    if (!set.delete(f) || set.size) return;
    callbacks.delete(el);
    // (stand-ins without unobserve: the element stays observed, its callbacks gone)
    observer?.unobserve?.(el);
    if (!callbacks.size) {
      observer?.disconnect();
      observer = null;
    }
  };
}
