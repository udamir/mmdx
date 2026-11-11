// Grouping rules of the editor (no UI): whether the selection can be grouped, and why not; "Reset positions in this
// group" for the selected group (T07).
import { withOps } from '../../core/kinds/registry.js';
import { groupHasPositions, resetGroupPositions } from '../../core/ops/positions.js';
import type { ItemRef } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { withEdit } from '../kinds/registry.js';
import { applyMeta } from './doc.js';

/** Can the selection be grouped (prototype `canGroup`)? */
export function canGroup(core: EditorCore): { ok: boolean; reason: string } {
  const g = withEdit(core.model, (k, m) => k.canGroup(m, core.selection())) ?? { ok: false, reason: '' };
  return { ok: g.ok, reason: g.reason ? core.i18n.t(g.reason) : '' };
}

/**
 * "Reset positions in this group" for one item: null when it is not offered (not a group, or the type's ops kind has
 * no `resetScope`), else whether the group has hand-placed positions inside it (false: nothing to reset).
 */
export function groupResetState(core: EditorCore, ref: ItemRef | null | undefined): boolean | null {
  if (!ref || ref.kind !== 'group' || !withOps(core.model, (k) => !!k.resetScope)) return null;
  return groupHasPositions(core.model, core.meta, ref);
}

/** The single selected group the action is offered for (null otherwise). */
export function resettableGroup(core: EditorCore): ItemRef | null {
  const sel = core.selection();
  const it = sel.length === 1 ? sel[0]! : null;
  return it && groupResetState(core, it) !== null ? { kind: it.kind, id: it.id } : null;
}

/**
 * Forgets the hand-placed positions inside the selected group as one history step ("Positions in the group reset");
 * a group without any shows "Nothing to reset" and changes nothing. False when nothing changed.
 */
export function resetSelectedGroup(core: EditorCore): boolean {
  const t = core.i18n.t;
  const ref = resettableGroup(core);
  if (!ref) {
    core.toast(t('groupReset.select'));
    return false;
  }
  if (!groupHasPositions(core.model, core.meta, ref)) {
    core.toast(t('groupReset.nothing'));
    return false;
  }
  const res = resetGroupPositions(core.model, core.meta, core.geom, ref);
  if (!res || !applyMeta(core, t('history.resetGroup'), res)) return false;
  core.toast(t('groupReset.done'));
  return true;
}
