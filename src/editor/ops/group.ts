// Grouping rules of the editor (no UI): whether the selection can be grouped, and why not.
import type { EditorCore } from '../core.js';
import { withEdit } from '../kinds/registry.js';

/** Can the selection be grouped (prototype `canGroup`)? */
export function canGroup(core: EditorCore): { ok: boolean; reason: string } {
  const g = withEdit(core.model, (k, m) => k.canGroup(m, core.selection())) ?? { ok: false, reason: '' };
  return { ok: g.ok, reason: g.reason ? core.i18n.t(g.reason) : '' };
}
