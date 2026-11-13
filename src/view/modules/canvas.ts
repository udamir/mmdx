// links and hoverHighlight (component architecture §7.4): canvas behaviour of the View mode, in the viewer and the
// editor (A16). A click on a linked item (an `<a>` or the editor's `data-link`; not after a pan, not while drawing)
// fires the cancelable `mmdx-link` and opens the link with the link policy's target — an item with several links (a
// sequence participant's `links`, T11) opens a menu of them first; hovering an item highlights it and what it
// connects to.
import { HIGHLIGHT_CSS } from '../../dom/highlight.js';
import { MENU_CSS } from '../../ui/blocks/menu.js';
import type { ViewCore } from '../core.js';
import { onLinkClick } from '../link-menu.js';
import type { ViewModule } from '../module.js';

export const linksModule: ViewModule<ViewCore> = {
  id: 'links',
  css: [MENU_CSS],
  when: { mode: ['view'], stage: ['document'] },
  install(scope) {
    const core = scope.core;
    let down: { x: number; y: number } | null = null;
    scope.canvas('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
    });
    scope.canvas('click', (ev) => {
      // never navigate the host page from the canvas by default
      if ((ev.target as Element).closest('a')) ev.preventDefault();
      const moved = !!down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4;
      if (moved || core.tool.peek() === 'pen') return;
      onLinkClick(core, ev);
    });
  },
};

export const hoverHighlightModule: ViewModule<ViewCore> = {
  id: 'hover-highlight',
  css: [HIGHLIGHT_CSS],
  when: { mode: ['view'], stage: ['document'] },
  install(scope) {
    const core = scope.core;
    const clear = (): void => core.highlightAt(null, null);
    scope.canvas('pointermove', (ev) => {
      if (!core.display.peek().hoverHighlight || core.panZoom.viewport?.panning || core.tool.peek() === 'pen') return;
      // a pointer over the picture's background: nothing lit
      core.highlightAt(ev.target instanceof Element ? ev.target : null, core.run('documentModel') ?? null);
    });
    scope.canvas('pointerleave', clear);
    // switched off or suspended: nothing stays highlighted
    scope.effect(() => {
      if (!core.display().hoverHighlight) clear();
    });
    return clear;
  },
};
