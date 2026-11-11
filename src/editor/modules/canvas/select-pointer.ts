// Pointer extras of canvas selection: the copy cursor while Alt is held, a press that drops the page selection, the
// double-click (enters a group, edits the text, fits on the empty canvas), View-mode links (`mmdx-link`, a menu when
// there are several) and the View-mode hover highlight.
import { withEdit } from '../../kinds/registry.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import { clearHighlight, hoverHighlight } from '../../../dom/highlight.js';
import type { Sel } from '../../core.js';
import { menuLinks, openLinkMenu } from '../../../view/link-menu.js';
import { elementAt, selKey } from '../../lib/canvas.js';
import type { SelectScope } from './select-state.js';

export function installSelectPointer(scope: SelectScope): void {
  const core = scope.core;
  const editing = (): boolean => core.mode.peek() === 'edit';
  const { root, body } = core.dom;
  const isLane = (gid: string): boolean => core.isLane(gid);

  // Alt/Option held over the canvas: the copy cursor on what an Alt-drag would copy
  const altCopy = (on: boolean): void => {
    root.classList.toggle('alt-copy', on && editing() && !!withEdit(core.model, (k) => k.altCopy));
  };
  scope.canvas('pointermove', (ev) => altCopy(ev.altKey));
  scope.canvas('pointerleave', () => altCopy(false));
  scope.listen(root, 'keydown', (ev) => {
    if (ev.key === 'Alt') altCopy(true);
  });
  scope.listen(root, 'keyup', (ev) => {
    if (ev.key === 'Alt') altCopy(false);
  });
  scope.onDispose(() => root.classList.remove('alt-copy', 'copying'));

  let down: { x: number; y: number } | null = null;
  scope.canvas('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY };
    if (core.pageSelected.peek()) {
      core.pageSelected.set(false);
      core.drawOverlay();
      core.fire('panels');
    }
  }, { capture: true });

  scope.canvas('dblclick', (ev) => {
    if (core.tool.peek() === 'hand' && editing()) return;
    const t = ev.target instanceof Element ? ev.target : null;
    if (t?.closest('[data-handle]')) return; // handles (connector ends, bend points) handle their own double-click
    // The first click may have re-rendered the item (selecting it): look up what is under the pointer as well.
    const at = elementAt(core, ev.clientX, ev.clientY);
    if (at?.closest('[data-handle]')) return;
    const itemEl = t?.closest('.el[data-kind]') ?? (at && body.contains(at) ? at.closest('.el[data-kind]') : null);
    if (itemEl && editing()) {
      const item: ItemRef = { kind: itemEl.getAttribute('data-kind') as ItemKind, id: itemEl.getAttribute('data-id') ?? '' };
      const part = itemEl.getAttribute('data-part');
      // Double-click enters the group (its items become individually editable); inside, it edits text.
      const g = !part ? core.groupTarget(item, isLane) : null;
      const enterSelf = item.kind === 'group' && !g && core.enteredGroup.peek() !== item.id && !isLane(item.id);
      if (g || enterSelf) {
        core.enteredGroup.set(g ?? item.id);
        const inner = core.groupTarget(item, isLane);
        core.select(enterSelf ? [] : inner ? [{ kind: 'group', id: inner }] : [item]);
        core.draw();
        core.fire('panels');
        return;
      }
      if (item.kind === 'activation') return;
      const p = core.primary();
      const target: Sel = p && selKey(p) === selKey(item) ? p : item;
      if (!core.run('inlineEdit', target)) core.run('setPanel', 'properties', true);
      return;
    }
    if (!itemEl) fit();
  });

  const fit = (): void => {
    if (core.has('fitView')) core.run('fitView');
    else core.viewport.setBounds(core.result.result.bounds, { fit: true });
  };

  // Links open in View mode on a plain click (not the end of a pan); the host can route or veto (`mmdx-link`).
  scope.canvas('click', (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    const a = t?.closest('a');
    const linked = t?.closest('[data-link]');
    if (a) ev.preventDefault(); // never navigate the host page from the canvas by default
    if (editing() || (!a && !linked)) return;
    if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 3) return;
    const href = linked?.getAttribute('data-link') ?? a?.getAttribute('href');
    if (!href) return;
    const item = (linked ?? a)?.closest('[data-id]');
    const follow = (url: string): void => {
      if (!core.emit('mmdx-link', { href: url, id: item?.getAttribute('data-id') ?? null }, true)) return;
      const target = core.ctx.linkPolicy.target ?? '_blank';
      if (target === '_blank') window.open(url, '_blank', 'noopener,noreferrer');
      else window.location.assign(url);
    };
    // several links (a sequence participant's `links`): a menu of them at the pointer
    const links = menuLinks(linked ?? a ?? null);
    if (links) openLinkMenu({ popovers: core.popovers, within: core.area, at: ev, label: core.i18n.t('view.links'), links, follow });
    else follow(href);
  });

  let hoverKey = '';
  scope.canvas('pointermove', (ev) => {
    if (editing() || !core.display.peek().hoverHighlight || core.viewport.panning) return;
    hoverKey = hoverHighlight(body, ev.target instanceof Element ? ev.target : null, core.model);
  });
  scope.canvas('pointerleave', () => {
    if (!hoverKey) return;
    hoverKey = '';
    clearHighlight(body);
  });
  scope.on('mode', () => {
    clearHighlight(body);
    hoverKey = '';
  });
}
