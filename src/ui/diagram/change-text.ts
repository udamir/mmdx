// How a diagram change reads (A5: the change list, the diff stage's live region and tooltips share it).
import type { ItemChange } from '../../core/diff/types.js';
import type { Translate } from '../blocks/block.js';

export const kindLabel = (t: Translate, kind: string): string => t(`diff.kind.${kind}`);

/** One line describing a change, for tooltips and the live region. */
export function describeChange(t: Translate, c: ItemChange): string {
  const facets = c.facets.join(', ');
  const what = c.status !== 'changed' ? t(`diff.status.${c.status}`)
    : c.fields.length ? t('diff.status.changedFields', { facets, fields: c.fields.map((f) => f.field).join(', ') }) : t('diff.status.changed', { facets });
  return t('diff.announce', { kind: kindLabel(t, c.kind), name: c.label, what });
}
