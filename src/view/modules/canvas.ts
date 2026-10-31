// links and hoverHighlight (component architecture §7.4): canvas behaviour of the View mode. A click on a linked
// item (not after a pan, not while drawing) fires the cancelable `mmdx-link` and opens the link with the link
// policy's target; hovering an item highlights it and what it connects to.
import { clearHighlight, HIGHLIGHT_CSS, hoverHighlight } from '../../dom/highlight.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

export const linksModule: ViewModule<ViewCore> = {
  id: 'links',
  when: { mode: ['view'], stage: ['document'] },
  install(scope) {
    const core = scope.core;
    const svg = core.canvas.svg;
    let down: { x: number; y: number } | null = null;
    scope.listen(svg, 'pointerdown', (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY };
    });
    scope.listen(svg, 'click', (ev: MouseEvent) => {
      const a = (ev.target as Element).closest('a');
      if (!a) return;
      ev.preventDefault();
      const moved = !!down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4;
      if (moved || core.tool.peek() === 'pen') return;
      const href = a.getAttribute('href');
      if (!href) return;
      const item = a.closest('[data-id]');
      if (!core.emit('mmdx-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
      const target = core.ctx.linkPolicy.target ?? '_blank';
      if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
      else window.location.assign(href);
    });
  },
};

export const hoverHighlightModule: ViewModule<ViewCore> = {
  id: 'hover-highlight',
  css: [HIGHLIGHT_CSS],
  when: { mode: ['view'], stage: ['document'] },
  install(scope) {
    const core = scope.core;
    const canvas = core.canvas;
    scope.listen(canvas.svg, 'pointermove', (ev: PointerEvent) => {
      if (!core.display.peek().hoverHighlight || canvas.viewport?.panning || core.tool.peek() === 'pen') return;
      hoverHighlight(canvas.body, ev.target as Element, core.run('documentModel') ?? null);
    });
    scope.listen(canvas.svg, 'pointerleave', () => clearHighlight(canvas.body));
    // switched off or suspended: nothing stays highlighted
    scope.effect(() => {
      if (!core.display().hoverHighlight) clearHighlight(canvas.body);
    });
    return () => clearHighlight(canvas.body);
  },
};
