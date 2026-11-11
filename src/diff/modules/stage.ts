// diffStage (component architecture §7.4 `links`, §8.1): the canvas behaviour of a DiffScene. A click on a change
// selects it (a drag pans, the pen draws); ⌘ / Ctrl-click on a linked item opens its link (the cancelable
// `mmdx-link`, then the link policy's target); hovering an item highlights what it connects to (view settings);
// the selected change is announced. Keys: Esc clears the selection, ⌘Z takes back the last pen stroke. Replaces the
// plain `links` and `hoverHighlight` modules inside a diff, and the canvas listeners of elements/diff.ts.
import { describeChange } from '../../ui/diagram/change-text.js';
import { renderedOf } from '../../core/diff/render.js';
import type { DiagramModel } from '../../core/model.js';
import { clearHighlight, HIGHLIGHT_CSS, hoverHighlight } from '../../dom/highlight.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_DIFF } from '../../ui/messages/blocks-diff.js';
import { untracked } from '../../reactive/signal.js';
import type { ViewCore } from '../../view/core.js';
import type { ViewModule } from '../../view/module.js';
import type { DiffScene } from '../scene.js';

/** The canvas an event happened on (a pane's svg), or null for the chrome over it. */
const canvasOf = (target: EventTarget | null): SVGSVGElement | null => (target instanceof Element ? target.closest<SVGSVGElement>('.pane > svg') : null);

export function diffStageModule(scene: DiffScene): ViewModule<ViewCore> {
  const session = scene.session;
  return {
    id: 'diff-stage',
    after: ['zoom-bar', 'pen', 'pan'],
    css: [HIGHLIGHT_CSS],
    install(scope) {
      // the change descriptions of the live region (also when the change list is turned off)
      registerMessages(BLOCK_MESSAGES_DIFF);
      const core = scope.core;
      const t = core.i18n.t;
      const area = core.area;

      // ---- click: select a change (a drag pans); ⌘ / Ctrl-click on a link opens it
      let down: { x: number; y: number } | null = null;
      scope.listen(area, 'pointerdown', (ev: PointerEvent) => {
        if (!canvasOf(ev.target)) return;
        down = { x: ev.clientX, y: ev.clientY };
        // the canvas takes the keyboard (shortcuts are handled on the root)
        core.root.focus({ preventScroll: true });
      });
      scope.listen(area, 'click', (ev: MouseEvent) => {
        if (!canvasOf(ev.target)) return;
        const target = ev.target as Element;
        const a = target.closest('a');
        if (a) ev.preventDefault();
        if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4 || core.tool.peek() === 'pen') return;
        const href = a?.getAttribute('href');
        if (href && (ev.metaKey || ev.ctrlKey)) {
          const item = a!.closest('[data-id]');
          if (!core.emit('mmdx-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
          const where = core.ctx.linkPolicy.target ?? '_blank';
          if (where === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
          else window.location.assign(href);
          return;
        }
        if (!core.feature('select') || session.viewOnly.peek() || !session.rendered.peek()) return;
        // a highlight carries the change key; an item drawn in this view has it on `data-ck` (minus the part prefix
        // of edge labels)
        let key = target.closest('[data-key]')?.getAttribute('data-key') ?? null;
        if (!key) {
          const ck = target.closest('[data-ck]')?.getAttribute('data-ck') ?? null;
          key = ck ? ck.replace(/^label:/, '') : null;
        }
        session.select(session.change(key) ? key : null);
      });
      // a double click on the empty After pane fits too (the main canvas is the zoom bar's)
      scope.listen(area, 'dblclick', (ev: MouseEvent) => {
        const svg = canvasOf(ev.target);
        if (!svg || svg === core.canvas.svg || (ev.target as Element).closest('[data-kind]')) return;
        core.run('fitView');
      });

      // ---- hover highlight (view settings → Display)
      const modelOf = (svg: SVGSVGElement): DiagramModel | null => {
        if (session.viewOnly.peek()) return session.plain.peek()?.model ?? null;
        const D = session.rendered.peek();
        if (!D) return null;
        const view = session.view.peek();
        if (view === 'side') return svg === core.canvas.svg ? D.before.model : D.after.model;
        return renderedOf(D, view).model;
      };
      const bodies = (): Element[] => scene.canvases().flatMap((c) => [...c.content.querySelectorAll(':scope > .body-layer')]);
      // something is lit: a pointer move with the highlight off (or a pan) clears only then (P8)
      let lit = false;
      const clearAll = (): void => {
        if (!lit) return;
        lit = false;
        bodies().forEach(clearHighlight);
      };
      scope.listen(area, 'pointermove', (ev: PointerEvent) => {
        const svg = canvasOf(ev.target);
        if (!svg || !core.display.peek().hoverHighlight || core.tool.peek() === 'pen' || scene.canvases().some((c) => c.viewport?.panning)) {
          clearAll();
          return;
        }
        const body = svg.querySelector(':scope > .vp > .content > .body-layer');
        if (!body) return;
        lit = hoverHighlight(body, ev.target as Element, modelOf(svg)) !== '' || lit;
      });
      scope.listen(area, 'pointerleave', clearAll);
      scope.effect(() => {
        if (!core.display().hoverHighlight) untracked(clearAll);
      });

      // the pen loads on first use: its strokes reach the After pane once it is there
      scope.effect(() => {
        core.strokes();
        untracked(() => scene.syncInk());
      });

      // ---- the selected change is announced
      scope.effect(() => {
        const key = session.selected();
        untracked(() => {
          const ch = session.change(key);
          if (ch) core.live.textContent = describeChange(t, ch);
        });
      });

      scope.shortcut(
        { id: 'clear-selection', keys: ['escape'], label: t('diff.help.escSelection'), group: t('diff.help.canvas'), run: () => (session.selected.peek() ? (session.select(null), true) : false) },
        { id: 'undo-stroke', keys: ['mod+z'], label: t('diff.help.undo'), group: t('diff.help.canvas'), run: () => core.strokes.peek()?.undo() ?? false },
      );
      return clearAll;
    },
  };
}
