// Focus kept across re-renders (§5.1): blocks that rebuild their children mark focusable controls with `data-f`;
// after the rebuild, the control with the same key gets the focus back, so keyboard users are never dropped out of
// the component.

/** The element focused inside `box` (through shadow roots), or null. */
export function focusedIn(box: Element): HTMLElement | null {
  const root = box.getRootNode() as Document | ShadowRoot;
  const active = (root as Document | ShadowRoot).activeElement as HTMLElement | null;
  return active && box.contains(active) ? active : null;
}

/** Runs `render` (which replaces `box`'s content) and moves the focus back to the control with the same `data-f`. */
export function keepFocus(box: HTMLElement, render: () => void): void {
  const active = focusedIn(box);
  const id = active?.getAttribute('data-f') ?? null;
  render();
  if (!id) return;
  const next = [...box.querySelectorAll<HTMLElement>('[data-f]')].find((e) => e.getAttribute('data-f') === id);
  next?.focus({ preventScroll: true });
}
