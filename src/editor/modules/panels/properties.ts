// Properties panel content (A.7 rows 61, 63, 85; A.5 row 52; A.6 rows 54–56; prototype app `refreshInspector`):
// picks the inspector for the current selection — the page and diagram settings when nothing is selected
// (inspectors/canvas.ts), one item (inspectors/item.ts), several items (inspectors/bulk.ts). Every change is one
// history step; the document ops live in editor/ops.
import { h } from '../../../ui/h.js';
import type { Sel } from '../../core.js';
import { bulkInspector, multiInspector } from './inspectors/bulk.js';
import { canvasInspector } from './inspectors/canvas.js';
import { itemInspector } from './inspectors/item.js';
import type { PanelCtx } from './inspectors/shared.js';

export type { PanelCtx } from './inspectors/shared.js';

/** Builds the Properties panel for the current selection into `host`. */
export function renderProperties(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  host.replaceChildren();
  if (!core.model.type) {
    host.append(h('div', { class: 'hint' }, core.i18n.t('props.noDiagram')));
    return;
  }
  // a table whose attributes are edited in place: its properties
  const sel: readonly Sel[] = core.selection().length ? core.selection() : core.tableView ? [{ kind: 'entity', id: core.tableView }] : [];
  if (!sel.length) return canvasInspector(p, host);
  if (sel.length > 1) return sel.every((x) => x.kind === sel[0]!.kind) ? bulkInspector(p, host, sel[0]!.kind, sel) : multiInspector(p, host);
  itemInspector(p, host, sel[0]!.kind, sel[0]!.id);
}
