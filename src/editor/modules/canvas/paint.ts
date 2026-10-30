// Copy style / paint roller (A.3 row 40): ⌘⌥C copies the selected item's look, ⌘⌥V pastes it onto the selection;
// the paint tool applies it with a click (Shift-click for several), Esc or a click on the board stops. Same kind:
// an exact copy; across kinds of one family (shape ↔ shape, line ↔ line): the common visual keys. Ported from
// prototype app.js (`copyStyle`, `pasteStyle`, `setPainting`); the look rules live in `core/ops/meta-ops.ts`.
import { copyStyle as copyStyleOp, pasteStyle as pasteStyleOp, type StyleClip } from '../../../core/ops/index.js';
import type { ItemKind } from '../../../core/types.js';
import { effect } from '../../../ui/signal.js';
import type { EditorCore, Gesture, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';

export const PAINT_CSS = /* css */ `
.ed.tool-paint svg.canvas, .ed.tool-paint svg.canvas .el, .ed.tool-paint svg.canvas .el * { cursor: copy !important; }
`;

export const canvasPaintModule: EditorModule = {
  id: 'canvas-paint',
  css: PAINT_CSS,
  enabled: (f) => f.copyStyle,
  install(core: EditorCore) {
    const offs: (() => void)[] = [];
    let clip: StyleClip | null = null;
    let paintFrom: Sel | null = null;

    const copyStyle = (): boolean => {
      const sel = core.primary();
      if (!sel) return false;
      const c = copyStyleOp(core.styleEnv(), sel);
      if (!c) return false;
      clip = c;
      return true;
    };

    /** Applies the copied look to `target`; false when refused (toast) or nothing to do. Records one step. */
    const pasteStyle = (target: Sel): boolean => {
      if (!clip) return false;
      const env = core.styleEnv();
      if (paintFrom && target.kind === clip.kind && target.id === paintFrom.id) return false;
      const res = pasteStyleOp(env, clip, target);
      if (res.reason) {
        core.toast(res.reason);
        return false;
      }
      if (res.meta === env.meta) return false;
      core.change('Paste style', () => core.store.meta.set(res.meta));
      return true;
    };

    const setPainting = (on: boolean): void => {
      if (on && !copyStyle()) return;
      paintFrom = on ? core.primary() : null;
      core.setTool(on ? 'paint' : 'pointer');
      if (on) core.toast('Click an item to apply the style · Shift-click for several · Esc to stop');
      core.run('refreshToolbar');
    };

    // the paint tool ends however the tool changes (tool bar, V / H…)
    offs.push(effect(() => {
      if (core.tool() !== 'paint') paintFrom = null;
    }));

    offs.push(core.addGestureSource({
      id: 'canvas-paint',
      priority: 60,
      down(ev, hit): Gesture | null {
        if (core.tool.peek() !== 'paint') return null;
        if (hit.el && hit.item && core.mode.peek() === 'edit') {
          const target: Sel = { kind: hit.el.getAttribute('data-kind') as ItemKind, id: hit.el.getAttribute('data-id') ?? '' };
          if (pasteStyle(target) && !ev.shiftKey) {
            core.select([target]);
            setPainting(false);
            core.draw();
          }
          return { move: () => undefined };
        }
        setPainting(false);
        return null; // the board press goes on (marquee)
      },
    }));

    offs.push(
      core.provide('copyStyle', () => {
        if (copyStyle()) core.toast('Style copied — ⌘/Ctrl+Alt+V to paste');
      }),
      core.provide('pasteStyle', (t: Sel) => pasteStyle(t)),
      core.provide('setPainting', setPainting),
    );

    core.shortcuts.add(
      {
        id: 'copy-style', keys: ['mod+alt+c'], label: 'Copy style', group: 'Style', editOnly: true,
        run: () => {
          if (!core.selection().length) return false;
          if (copyStyle()) core.toast('Style copied — ⌘/Ctrl+Alt+V to paste');
          return true;
        },
      },
      {
        id: 'paste-style', keys: ['mod+alt+v'], label: 'Paste style', group: 'Style', editOnly: true,
        run: () => {
          const sel = core.primary() ?? core.selection()[0];
          if (!sel || !clip) return false;
          if (pasteStyle(sel)) {
            core.run('refreshToolbar');
            core.toast('Style pasted');
          }
          return true;
        },
      },
      {
        id: 'stop-paint', keys: ['escape'], label: 'Stop applying a style', group: 'Style', editOnly: true,
        run: () => {
          if (core.tool.peek() !== 'paint') return false;
          setPainting(false);
          return true;
        },
      },
    );

    return () => {
      for (const off of offs) off();
      if (core.tool.peek() === 'paint') core.setTool('pointer');
      clip = null;
    };
  },
};
