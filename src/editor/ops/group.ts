// Grouping rules of the editor (no UI): whether the selection can be grouped, and why not.
import type { EditorCore } from '../core.js';

/** Can the selection be grouped (prototype `canGroup`)? */
export function canGroup(core: EditorCore): { ok: boolean; reason: string } {
  const sel = core.selection(), M = core.model;
  const t = core.i18n.t;
  if (M.type === 'er') return { ok: false, reason: t('group.noEr') };
  if (M.type === 'flowchart')
    return sel.some((x) => x.kind === 'node' || x.kind === 'group') ? { ok: true, reason: '' } : { ok: false, reason: t('group.selectBoxes') };
  if (M.type === 'sequence') {
    const ps = sel.filter((x) => x.kind === 'participant');
    if (!ps.length) return { ok: false, reason: t('group.selectParticipants') };
    if (ps.some((x) => M.participants.find((p) => p.id === x.id)?.box)) return { ok: false, reason: t('group.alreadyBoxed') };
    return { ok: true, reason: '' };
  }
  return { ok: false, reason: '' };
}
