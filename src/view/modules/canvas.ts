// links and hoverHighlight (component architecture §7.4): canvas behaviour of the View mode. A click on a linked
// item (not after a pan, not while drawing) fires the cancelable `mmdx-link` and opens the link with the link
// policy's target — an item with several links (a sequence participant's `links`, T11) opens a menu of them first;
// hovering an item highlights it and what it connects to.
import { clearHighlight, HIGHLIGHT_CSS, hoverHighlight } from '../../dom/highlight.js';
import { MENU_CSS } from '../../ui/blocks/menu.js';
import type { ViewCore } from '../core.js';
import { menuLinks, openLinkMenu } from '../link-menu.js';
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
    const follow = (href: string, item: Element | null): void => {
      if (!core.emit('mmdx-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
      const target = core.ctx.linkPolicy.target ?? '_blank';
      if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
      else window.location.assign(href);
    };
    scope.canvas('click', (ev) => {
      const a = (ev.target as Element).closest('a');
      if (!a) return;
      ev.preventDefault();
      const moved = !!down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4;
      if (moved || core.tool.peek() === 'pen') return;
      const item = a.closest('[data-id]');
      const links = menuLinks(a);
      if (links) {
        openLinkMenu({ popovers: core.popovers, within: core.area, at: ev, label: core.i18n.t('view.links'), links, follow: (href) => follow(href, item) });
        return;
      }
      const href = a.getAttribute('href');
      if (href) follow(href, item);
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
    scope.canvas('pointermove', (ev) => {
      if (!core.display.peek().hoverHighlight || canvas.viewport?.panning || core.tool.peek() === 'pen') return;
      hoverHighlight(canvas.body, ev.target as Element, core.run('documentModel') ?? null);
    });
    scope.canvas('pointerleave', () => clearHighlight(canvas.body));
    // switched off or suspended: nothing stays highlighted
    scope.effect(() => {
      if (!core.display().hoverHighlight) clearHighlight(canvas.body);
    });
    return () => clearHighlight(canvas.body);
  },
};
