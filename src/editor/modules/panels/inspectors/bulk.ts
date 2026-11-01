// The Properties panel for several selected items (A.7 row 63; prototype app `multiInspector`): of one kind, every
// property that can be set on all of them at once (preset, appearance, geometry, each shared or "mixed"); of several
// kinds, the layer and the group / delete / process actions.
import { KIND_TO_COLL } from '../../../../core/meta/types.js';
import { cloneMeta } from '../../../../core/ops/meta-util.js';
import { baseStyleOf, presetsFor } from '../../../../core/ops/style-env.js';
import { STYLE_FIELDS } from '../../../../core/schema/style-fields.js';
import type { ItemKind, ItemRef } from '../../../../core/types.js';
import { h } from '../../../../ui/h.js';
import { applyMeta, styleEnv } from '../../../ops/doc.js';
import { field } from '../fields.js';
import { bulkTarget, layerRow, lineDefaults, lineFields, multiActions, pickerSection, roundedBox, sect, type PanelCtx } from './shared.js';

export function multiInspector(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const sel = core.selection();
  host.append(h('div', { class: 'insp-title' }, t('props.multiTitle', { n: sel.length })));
  layerRow(p, host, sel);
  const counts = new Map<string, number>();
  for (const x of sel) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  host.append(h('div', { class: 'multi-list' }, [...counts].map(([k, n]) => `${n} × ${k}`).join(' · ')));
  multiActions(p, host);
  host.append(h('div', { class: 'hint' }, t('props.multiHint')));
}

/**
 * Several items of one kind: every property that can be set on all of them at once (preset, appearance, the
 * position and geometry fields), each showing the shared value or "mixed".
 */
export function bulkInspector(p: PanelCtx, host: HTMLElement, kind: ItemKind, sel: readonly ItemRef[]): void {
  const { core } = p;
  const t = core.i18n.t;
  const env = styleEnv(core);
  const refs = sel.map(({ kind: k, id }) => ({ kind: k, id }));
  const kindName = t(`props.kinds.${kind}`);
  host.append(h('div', { class: 'insp-title' }, t('props.bulkTitle', { n: refs.length, kind: kindName.startsWith('props.') ? kind : kindName })),
    h('div', { class: 'insp-sub' }, t('props.bulkHint')));
  layerRow(p, host, refs);
  if (presetsFor(env, kind)) pickerSection(p, host, refs[0]!, refs);
  sect(host, t('props.appearance'));
  const style = bulkTarget(p, refs, refs.map((r) => baseStyleOf(env, kind, r.id)));
  for (const f of STYLE_FIELDS[kind] ?? []) field(core.i18n, host, f, style);

  const g = core.geom;
  const geo = (fields: readonly string[], baseOf: (r: ItemRef) => Record<string, unknown>): void => {
    sect(host, t('props.geometry'));
    const target = bulkTarget(p, refs, refs.map(baseOf));
    for (const f of fields) field(core.i18n, host, f, target);
  };
  if (kind === 'node' && g.type === 'flowchart') geo(['x', 'y', 'w', 'h'], (r) => roundedBox(g.nodes.get(r.id)));
  else if (kind === 'entity' && g.type === 'er') geo(['x', 'y', 'w', 'h'], (r) => roundedBox(g.entities.get(r.id)));
  else if (kind === 'participant' && g.type === 'sequence') geo(['x', 'w', 'h'], (r) => roundedBox(g.participants.get(r.id)));
  else if (kind === 'edge' || kind === 'rel') {
    const defaults = lineDefaults(core, kind);
    geo(lineFields(kind), () => ({ ...defaults }));
  } else if (kind === 'message' || kind === 'note' || kind === 'block') geo(['dy'], () => ({ dy: 0 }));

  const reset = h('button', { type: 'button', class: 'danger' }, t('props.resetAll'));
  reset.addEventListener('click', () => {
    const meta = cloneMeta(core.meta);
    const coll = meta[KIND_TO_COLL[kind]] as Record<string, unknown> | undefined;
    for (const r of refs) if (coll) delete coll[r.id];
    applyMeta(core, t('history.resetAll'), { meta });
  });
  multiActions(p, host, [reset]);
}
