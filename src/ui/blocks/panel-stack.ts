// PanelStack (§5.2, §7.1): a column of SidePanels on one side of the component. Splitters sit between visible panels
// (drag sets the lower panel's height, double-click resets, arrow keys step; heights remembered per panel), the stack
// collapses (slides out) when no panel is open, its inner edge resizes the shared width (remembered), and below
// `drawerBelow` px of host width it becomes a drawer over the canvas showing one panel at a time (the one opened
// last). Replaces the stack of editor/modules/panels/right-panels.ts (`.right-stack`, `.rp-split`, `layersH`) and the
// diff's left stack (`leftPane`, `wireSplit` in elements/diff.ts).
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_PANELS } from '../messages/blocks-panels.js';
import { signal, untracked } from '../signal.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';
import { createGrip } from './side-panel.js';

/** What the stack remembers sizes in (the kernel's storage adapter fits). */
export interface StackStorage {
  get<T>(key: string): T | undefined | null;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export interface StackPanel {
  id: string;
  /** The panel's element (a SidePanel's `el`). */
  panel: HTMLElement;
  open: Value<boolean>;
}

export interface PanelStackProps {
  side: 'left' | 'right';
  panels: readonly StackPanel[];
  storage: StackStorage;
  /** Prefix of the remembered sizes: `<key>.w` (width), `<key>.h` (heights by panel id). */
  storageKey: string;
  /** The shared width and its clamp; without it the width is the CSS default and there is no grip. */
  width?: { initial: number; min: number; max: () => number };
  /** Host widths below this show the stack as a drawer, one panel at a time. */
  drawerBelow?: number;
  /** The element whose width decides the drawer form (observed with a ResizeObserver). */
  container?: HTMLElement;
  /** After a panel opens or closes, a resize, or a drawer switch (the host recomputes its canvas insets). */
  onChange?: () => void;
  label?: string;
  class?: string;
  part?: string;
  t: Translate;
}

export interface PanelStackHandle extends BlockHandle<PanelStackProps> {
  /** The width the stack takes from the canvas: 0 when collapsed or in the drawer form. */
  width(): number;
  /** Switches the drawer form (normally driven by the container's width). */
  setDrawer(on: boolean): void;
  readonly drawer: boolean;
}

export const PANEL_STACK_CSS = /* css */ `
.mmdx-stack { position: absolute; top: 12px; bottom: 12px; z-index: 30; display: flex; flex-direction: column; min-height: 0; width: var(--mmdx-stack-w, 340px);
  transition: transform .24s cubic-bezier(.2,.8,.2,1), opacity .24s, visibility .24s; }
.mmdx-stack[data-side=left] { left: 12px; }
.mmdx-stack[data-side=right] { right: 12px; }
.mmdx-stack[data-side=left]:not(.open) { transform: translateX(calc(-100% - 24px)); opacity: .4; visibility: hidden; pointer-events: none; }
.mmdx-stack[data-side=right]:not(.open) { transform: translateX(calc(100% + 24px)); opacity: .4; visibility: hidden; pointer-events: none; }
.mmdx-stack > .mmdx-panel { flex: 1 1 0; }
.mmdx-stack > [hidden] { display: none !important; }
.mmdx-stack[data-side=left] > .mmdx-grip { right: -6px; }
.mmdx-stack[data-side=right] > .mmdx-grip { left: -6px; }
.mmdx-split { flex: none; height: 10px; cursor: row-resize; position: relative; touch-action: none; }
.mmdx-split::after { content: ''; position: absolute; left: 50%; top: 4px; width: 36px; height: 3px; margin-left: -18px; border-radius: 2px; background: var(--mmdx-faint); opacity: 0; transition: opacity .12s; }
.mmdx-split:hover::after, .mmdx-split.dragging::after, .mmdx-split:focus-visible::after { opacity: 1; background: var(--mmdx-accent); }
.mmdx-split:focus-visible { box-shadow: none; }
.mmdx-stack.drawer { left: 8px; right: 8px; width: auto; z-index: 40; }
.mmdx-stack.drawer > .mmdx-grip { display: none; }
.resizing-rows, .resizing-rows * { cursor: row-resize !important; user-select: none !important; }
.resizing-panes, .resizing-panes * { cursor: col-resize !important; user-select: none !important; }
@media (prefers-reduced-motion: reduce) { .mmdx-stack { transition: none !important; } }
@media print { .mmdx-stack { display: none !important; } }
`;

/** Minimum heights kept while dragging a splitter: the lower panel, and the room left above it. */
const MIN_LOWER = 90, MIN_UPPER = 140, STEP = 16;

export function createPanelStack(props: PanelStackProps): PanelStackHandle {
  registerMessages(BLOCK_MESSAGES_PANELS);
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const el = h('aside', null);
  const drawer = signal(false);
  const opened = new Map<string, number>(); // panel id → when it was last opened (the drawer shows the newest)
  const wasOpen = new Map<string, boolean>();
  let tick = 0;
  let ready = false; // no onChange while the stack is being created

  // ---- remembered sizes
  const wKey = (): string => `${p.storageKey}.w`, hKey = (): string => `${p.storageKey}.h`;
  const savedW = p.storage.get<number>(wKey());
  let w: number | null = typeof savedW === 'number' && Number.isFinite(savedW) && savedW > 0 ? savedW : null;
  const savedH = p.storage.get<Record<string, number>>(hKey());
  const heights = new Map<string, number>(savedH && typeof savedH === 'object' ? Object.entries(savedH).filter(([, v]) => typeof v === 'number' && v > 0) : []);
  const saveHeights = (): void => {
    if (heights.size) p.storage.set(hKey(), Object.fromEntries(heights));
    else p.storage.remove(hKey());
  };
  const changed = (): void => {
    if (ready && p.onChange) untracked(p.onChange);
  };
  const applyWidth = (): void => {
    const cur = w ?? p.width?.initial ?? null;
    if (p.width && cur !== null) el.style.setProperty('--mmdx-stack-w', `${Math.round(cur)}px`);
    else el.style.removeProperty('--mmdx-stack-w');
  };

  let splits: (HTMLElement | null)[] = [];
  /** Sets the inline height of the panels under a visible splitter (and only those). */
  const applyHeights = (): void => {
    p.panels.forEach((x, i) => {
      const split = splits[i];
      const px = heights.get(x.id);
      if (split && !split.hidden && px !== undefined) x.panel.style.flex = `0 0 ${Math.round(px)}px`;
      else x.panel.style.flex = '';
      if (split) {
        if (px !== undefined) split.setAttribute('aria-valuenow', String(Math.round(px)));
        else split.removeAttribute('aria-valuenow');
      }
    });
  };

  /** The splitter above panel `i`: drag sets that panel's height. */
  const makeSplit = (i: number, s: Scope): HTMLElement => {
    const t = p.t;
    const split = h('div', { class: 'mmdx-split', role: 'separator', 'aria-orientation': 'horizontal', tabindex: '0', title: t('panes.split'), 'aria-label': t('panes.split') });
    const lower = (): StackPanel | undefined => p.panels[i];
    const setH = (px: number | null): void => {
      const x = lower();
      if (!x) return;
      if (px === null) heights.delete(x.id);
      else heights.set(x.id, Math.round(px));
      applyHeights();
      changed();
    };
    const clamp = (px: number): number => Math.max(MIN_LOWER, Math.min((el.getBoundingClientRect().height || 1e4) - MIN_UPPER, px));
    let drag: AbortController | null = null;
    s.add(() => drag?.abort());
    s.on(split, 'pointerdown', (ev: PointerEvent) => {
      const x = lower();
      if (ev.button !== 0 || !x) return;
      ev.preventDefault();
      try {
        split.setPointerCapture(ev.pointerId);
      } catch {
        // best-effort
      }
      const y0 = ev.clientY, h0 = x.panel.getBoundingClientRect().height;
      const root = el.parentElement;
      split.classList.add('dragging');
      root?.classList.add('resizing-rows');
      drag?.abort();
      const ac = (drag = new AbortController());
      const move = (e: PointerEvent): void => setH(clamp(h0 - (e.clientY - y0)));
      const up = (): void => {
        ac.abort();
        split.classList.remove('dragging');
        root?.classList.remove('resizing-rows');
        saveHeights();
      };
      split.addEventListener('pointermove', move as EventListener, { signal: ac.signal });
      split.addEventListener('pointerup', up, { signal: ac.signal });
      split.addEventListener('pointercancel', up, { signal: ac.signal });
    });
    s.on(split, 'dblclick', () => {
      setH(null);
      saveHeights();
    });
    s.on(split, 'keydown', (ev: KeyboardEvent) => {
      const x = lower();
      if ((ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') || !x) return;
      ev.preventDefault();
      ev.stopPropagation();
      const h0 = heights.get(x.id) ?? (x.panel.getBoundingClientRect().height || 200);
      setH(clamp(h0 + (ev.key === 'ArrowUp' ? STEP : -STEP)));
      saveHeights();
    });
    return split;
  };

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    el.className = ['mmdx-stack', p.class].filter(Boolean).join(' ');
    el.dataset['side'] = p.side;
    if (p.label) el.setAttribute('aria-label', p.label);
    else el.removeAttribute('aria-label');
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    splits = p.panels.map((_, i) => (i ? makeSplit(i, fx) : null));
    const children: HTMLElement[] = [];
    p.panels.forEach((x, i) => {
      const split = splits[i];
      if (split) children.push(split);
      children.push(x.panel);
    });
    const wd = p.width;
    if (wd)
      children.push(createGrip({
        side: p.side, measure: el, get: () => w ?? wd.initial, min: wd.min, max: wd.max, title: p.t('panes.resize'), dragRoot: () => el.parentElement,
        set: (px) => {
          w = px;
          applyWidth();
          changed();
        },
        onCommit: () => {
          if (w === null) p.storage.remove(wKey());
          else p.storage.set(wKey(), w);
        },
      }, fx));
    el.replaceChildren(...children);
    applyWidth();

    // ---- visibility: open panels (or, as a drawer, the one opened last); splitters between visible panels
    fx.effect(() => {
      const isDrawer = drawer();
      const open = p.panels.filter((x) => {
        const on = read(x.open);
        if (on && !wasOpen.get(x.id)) opened.set(x.id, ++tick);
        wasOpen.set(x.id, on);
        return on;
      });
      const front = isDrawer ? open.reduce<StackPanel | null>((a, x) => (!a || (opened.get(x.id) ?? 0) > (opened.get(a.id) ?? 0) ? x : a), null) : null;
      const shown = new Set(isDrawer ? (front ? [front] : []) : open);
      let above = false;
      p.panels.forEach((x, i) => {
        const on = shown.has(x);
        x.panel.hidden = !on;
        const split = splits[i];
        if (split) split.hidden = !(on && above);
        above ||= on;
      });
      applyHeights();
      el.classList.toggle('open', shown.size > 0);
      el.classList.toggle('drawer', isDrawer);
      changed();
    });
  };
  render();

  // ---- drawer form below a host width
  const observe = (): void => {
    const c = p.container, below = p.drawerBelow;
    if (!c || below === undefined) return;
    const check = (width: number): void => {
      if (width > 0) drawer.set(width < below);
    };
    check(c.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => check(entries[0]?.contentRect.width ?? c.getBoundingClientRect().width));
    ro.observe(c);
    scope.add(() => ro.disconnect());
  };
  observe();
  ready = true;

  return {
    el,
    get drawer() {
      return drawer.peek();
    },
    width() {
      if (!el.classList.contains('open') || drawer.peek()) return 0;
      return el.getBoundingClientRect().width || (p.width ? (w ?? p.width.initial) : 0);
    },
    setDrawer(on) {
      drawer.set(on);
    },
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
