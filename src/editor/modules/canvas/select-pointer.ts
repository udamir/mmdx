// Pointer extras of canvas selection: the copy cursor while Alt is held, a press that drops the page selection, the
// double-click (enters a group, edits the text, fits on the empty canvas). View mode's links and hover highlight are
// the standard view modules (`links`, `hover-highlight`, A16).
import { withEdit } from '../../kinds/registry.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import type { Sel } from '../../core.js';
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

  scope.canvas('pointerdown', () => {
    if (core.pageSelected.peek()) {
      core.selectPage(false);
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
        core.enterGroup(g ?? item.id);
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

  // the canvas never navigates the host page (View mode's links are the standard `links` module's, A16)
  scope.canvas('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a')) ev.preventDefault();
  });
}
