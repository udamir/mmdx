// Idle callbacks with a timeout, falling back to a short timer where `requestIdleCallback` is missing (Safari).

type IdleGlobal = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Runs `f` in the next idle period (at the latest after `timeout` ms); returns a handle for `cancelIdle`. */
export function idle(f: () => void, timeout = 120): number {
  const w = globalThis as IdleGlobal;
  return w.requestIdleCallback ? w.requestIdleCallback(f, { timeout }) : (setTimeout(f, 16) as unknown as number);
}

export function cancelIdle(id: number): void {
  const w = globalThis as IdleGlobal;
  if (w.cancelIdleCallback) w.cancelIdleCallback(id);
  else clearTimeout(id);
}

/** Resolves in the next idle period (at the latest after `timeout` ms). */
export const nextIdle = (timeout = 120): Promise<void> => new Promise((r) => void idle(r, timeout));
