// Document ops of the editor (no UI): the style environment of the current render, metadata and code + metadata
// changes applied as one history step, and the diagram-wide settings (type, direction, autonumber) the Properties
// panel and the page toolbar share.
import type { DiagramMeta } from '../../core/meta/types.js';
import type { Direction, DiagramType } from '../../core/model.js';
import { newDiagram, setAutonumber, setDirection } from '../../core/ops/meta-ops.js';
import type { StyleEnv } from '../../core/ops/style-env.js';
import type { MetaResult } from '../../core/ops/types.js';
import type { EditorCore, Sel } from '../core.js';

export const DIAGRAM_TYPES: readonly (readonly [DiagramType, string])[] = [['flowchart', 'type.flowchart'], ['sequence', 'type.sequence'], ['er', 'type.er']];
export const FLOW_DIRS: readonly (readonly [Direction, string])[] = [['TB', 'dir.TB'], ['LR', 'dir.LR'], ['BT', 'dir.BT'], ['RL', 'dir.RL']];

/** The style environment (model, metadata, active theme, colour resolver) of the current document. */
export function styleEnv(core: EditorCore): StyleEnv {
  const r = core.result;
  return { model: core.model, meta: core.meta, theme: r.theme, rawTheme: core.ctx.themes.merged(r.themeId), color: r.rctx.color };
}

/** Applies a metadata op as one history step; a refused op (reason) shows a toast and changes nothing. */
export function applyMeta(core: EditorCore, label: string, res: MetaResult): boolean {
  if (res.reason) {
    core.toast(res.reason);
    return false;
  }
  if (res.meta === core.meta) return false;
  core.setMeta(label, res.meta);
  return true;
}

/** Replaces the code and metadata together without the core's sequence remap (the op remapped already). */
export function applyDoc(core: EditorCore, label: string, doc: { code: string; meta: DiagramMeta }, select: Sel[] | null): boolean {
  if (doc.code === core.code && JSON.stringify(doc.meta) === JSON.stringify(core.meta)) return false;
  return core.applyCode(doc, label, select ? { select } : {});
}

/** Type switch: another type starts a new diagram, after a confirmation. */
export async function switchDiagramType(core: EditorCore, type: DiagramType): Promise<void> {
  const t = core.i18n.t;
  if (type === core.model.type) return;
  const label = t(`type.${type}`);
  if (core.model.type && !(await core.dialogs.confirm(t('type.switchTitle', { type: label }), t('type.switchMsg', { type: label.toLowerCase() }), { ok: t('type.switchOk'), danger: true }))) return;
  const doc = newDiagram(type);
  const group = core.enteredGroup.peek(), page = core.pageSelected.peek();
  core.enteredGroup.set(null);
  core.pageSelected.set(false);
  if (!core.applyCode(doc, t('history.newDiagram'), { select: [], type: 'doc.setType' })) {
    // vetoed by the host: nothing changes
    core.enteredGroup.set(group);
    core.pageSelected.set(page);
    return;
  }
  core.fileName = `untitled-${type}`;
  core.viewport.setBounds(core.result.result.bounds, { fit: true });
  core.fire('model');
}

export function setFlowDirection(core: EditorCore, dir: Direction): void {
  core.applyCode(setDirection(core.code, core.model, dir), core.i18n.t('history.direction'), { select: null });
}

export function setAutonumberOn(core: EditorCore, on: boolean): void {
  core.applyCode(setAutonumber(core.code, on), core.i18n.t('history.autonumber'), { select: null });
}
