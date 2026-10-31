// Floating side panels (A.2 row 21): open / close with a slide that honours reduced motion, remembered visibility
// (`panels`) and widths (`panes`), resize by dragging a panel's inner edge (double-click resets). The panel modules
// (code, properties, layers) build their own DOM and call `attachResizer`; this module provides `setPanel`.
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { attachPaneResizer, slidePanel } from '../../../ui/panes.js';

export type PanelName = 'code' | 'properties' | 'layers';
type WidthVar = '--left-w' | '--right-w' | '--right-vw';

/** Default, min and max width of each panel. */
const PANE_W: Record<WidthVar, readonly [number, number, number]> = { '--left-w': [360, 220, 760], '--right-w': [340, 240, 640], '--right-vw': [260, 200, 520] };
const MIN_CANVAS = 360;

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
  const varName = (): WidthVar => (side === 'left' ? '--left-w' : core.mode.peek() === 'view' ? '--right-vw' : '--right-w');
  return attachPaneResizer(pane, side, {
    root: core.dom.root,
    varName,
    min: 0,
    max: 1e5,
    title: core.i18n.t('panes.resize'),
    // the editor clamps against its own per-panel limits and the room left for the canvas
    onResize: () => {
      const v = varName();
      const cur = parseInt(core.dom.root.style.getPropertyValue(v), 10);
      if (Number.isFinite(cur)) setPaneWidth(core, v, cur);
      core.fire('view');
    },
    onCommit: () => savePaneWidths(core),
  });
}

export { slidePanel };

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
