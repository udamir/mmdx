// Floating side panels (A.2 row 21): open / close with a slide that honours reduced motion, remembered visibility
// (`panels`) and widths (`panes`), resize by dragging a panel's inner edge (double-click resets). The panel modules
// (code, properties, layers) build their own DOM and call `attachResizer`; this module provides `setPanel`.
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';

export type PanelName = 'code' | 'properties' | 'layers';
type WidthVar = '--left-w' | '--right-w' | '--right-vw';

/** Default, min and max width of each panel. */
const PANE_W: Record<WidthVar, readonly [number, number, number]> = { '--left-w': [360, 220, 760], '--right-w': [340, 240, 640], '--right-vw': [260, 200, 520] };
const MIN_CANVAS = 360;

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function setPaneWidth(core: EditorCore, v: WidthVar, px: number): number {
  const [, lo, hi] = PANE_W[v];
  const avail = core.dom.root.getBoundingClientRect().width || 1e4;
  const max = Math.max(lo, Math.min(hi, avail - MIN_CANVAS)); // always leave room for the canvas
  const w = Math.round(Math.max(lo, Math.min(max, px)));
  core.dom.root.style.setProperty(v, `${w}px`);
  return w;
}

function savePaneWidths(core: EditorCore): void {
  const st = core.dom.root.style, out: Partial<Record<WidthVar, number>> = {};
  for (const v of Object.keys(PANE_W) as WidthVar[]) {
    const val = st.getPropertyValue(v);
    if (val) out[v] = parseInt(val, 10);
  }
  core.storage.set('panes', out);
}

/** Restores remembered panel widths (called once per editor). */
export function restorePaneWidths(core: EditorCore): void {
  const saved = core.storage.get<Partial<Record<string, number>>>('panes') ?? {};
  for (const [v, px] of Object.entries(saved))
    if (Object.hasOwn(PANE_W, v) && typeof px === 'number' && Number.isFinite(px)) {
      const [, lo, hi] = PANE_W[v as WidthVar];
      core.dom.root.style.setProperty(v, `${Math.round(Math.max(lo, Math.min(hi, px)))}px`);
    }
}

/** Adds the drag-to-resize grip on a panel's inner edge. Returns a cleanup. */
export function attachResizer(core: EditorCore, pane: HTMLElement, side: 'left' | 'right'): () => void {
  const grip = document.createElement('div');
  grip.className = 'pane-resizer';
  grip.title = core.i18n.t('panes.resize');
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  pane.append(grip);
  const varName = (): WidthVar => (side === 'left' ? '--left-w' : core.mode.peek() === 'view' ? '--right-vw' : '--right-w');
  const ac = new AbortController();
  grip.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch {
      // capture is best-effort
    }
    const v = varName(), x0 = ev.clientX, w0 = pane.getBoundingClientRect().width;
    grip.classList.add('dragging');
    core.dom.root.classList.add('resizing-panes');
    const move = (e: PointerEvent): void => {
      setPaneWidth(core, v, side === 'left' ? w0 + (e.clientX - x0) : w0 - (e.clientX - x0));
      core.fire('view');
    };
    const up = (): void => {
      grip.classList.remove('dragging');
      core.dom.root.classList.remove('resizing-panes');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      savePaneWidths(core);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }, { signal: ac.signal });
  grip.addEventListener('dblclick', () => {
    core.dom.root.style.removeProperty(varName());
    savePaneWidths(core);
    core.fire('view');
  }, { signal: ac.signal });
  return () => {
    ac.abort();
    grip.remove();
  };
}

/**
 * Slides a floating panel out past its screen edge (close) or back in (open). `apply` switches the state; on close
 * it runs once the panel has left the screen.
 */
export function slidePanel(el: HTMLElement | null, side: 'left' | 'right', open: boolean, apply: () => void): void {
  if (!el || el.dataset['sliding']) {
    if (!el) apply();
    return;
  }
  const canAnimate = typeof el.animate === 'function';
  const away = `translateX(calc(${side === 'left' ? '-' : ''}100% ${side === 'left' ? '-' : '+'} 24px))`;
  const hidden = !el.offsetParent; // not rendered (e.g. another mode hides it): no animation to show
  if (!canAnimate || reducedMotion() || document.hidden || (!open && hidden)) {
    apply();
    return;
  }
  el.getAnimations?.().forEach((x) => x.cancel());
  if (open) {
    apply();
    if (!el.offsetParent) return;
    el.animate([{ transform: away, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return;
  }
  el.dataset['sliding'] = '1';
  const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: away, opacity: 0.4 }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    delete el.dataset['sliding'];
    apply();
    a.cancel();
  };
  a.finished.then(finish, finish);
  setTimeout(finish, 400); // animations can stall (e.g. a background page): close anyway
}

/** The element each panel slides. */
function panelEl(core: EditorCore, name: PanelName): HTMLElement | null {
  const sel = name === 'code' ? '.pane.left' : name === 'properties' ? '.rpanel.props' : '.rpanel.layers';
  return core.dom.root.querySelector<HTMLElement>(sel);
}

/** Opens or closes a panel (remembered). */
export function setPanel(core: EditorCore, name: PanelName, open: boolean): void {
  const cur = core.panels.peek();
  if (cur[name] === open) return;
  slidePanel(panelEl(core, name), name === 'code' ? 'left' : 'right', open, () => {
    core.panels.set({ ...core.panels.peek(), [name]: open });
    core.storage.set('panels', core.panels.peek());
    core.fire('panels');
    core.fire('view');
  });
}

export const panesModule: EditorModule = {
  id: 'panes',
  install(core) {
    restorePaneWidths(core);
    const off = core.provide('setPanel', (name, open) => setPanel(core, name, open));
    return () => {
      off();
    };
  },
};
