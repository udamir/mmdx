// The mindmap module's helpers (5.5): the model and geometry when the diagram is a mindmap, the selected node, an op
// applied with the node it made selected (and its text opened), folding a branch, and what a node drag drops.
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { MindmapModel } from '../../../core/model.js';
import { reparse } from '../../../core/parse/dispatch.js';
import { mindNodeAt } from '../../../core/kinds/mindmap/ops.js';
import type { MindmapGeometry } from '../../../core/render/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Sel } from '../../core.js';

export const NOOP: Gesture = { move: () => undefined };

export const mindModel = (core: EditorCore): MindmapModel | null => (core.model.type === 'mindmap' ? core.model : null);
export const mindGeom = (core: EditorCore): MindmapGeometry | null => (core.geom.type === 'mindmap' ? core.geom : null);

/** Where a dragged node would go: under `parent` at `index` (among its other children), shown on `mark`. */
export interface Drop {
  parent: string;
  index: number;
  /** The node it lands on (a child of it), or the sibling the insertion line is drawn against. */
  mark: { id: string; at: 'on' | 'before' | 'after' };
  /** A first-level branch dropped on this side of the root. */
  side?: 'l' | 'r';
}

export interface Drag {
  id: string;
  p: Point;
  drop: Drop | null;
  copy: boolean;
}

/** The single selected node, if any. */
export function selectedNode(core: EditorCore): string | null {
  const s = core.selection();
  return s.length === 1 && s[0]!.kind === 'node' && mindModel(core)?.nodes.has(s[0]!.id) ? s[0]!.id : null;
}

/** Applies a code rewrite and selects the node on `line` of the result (and edits its text when `edit`). */
export function applyAt(core: EditorCore, res: { code: string; line?: number; reason?: string }, label: string, edit = false, meta?: (M: MindmapModel, N: MindmapModel, id: string) => DiagramMeta): boolean {
  if (res.reason) {
    core.toast(res.reason);
    return false;
  }
  const M = mindModel(core);
  const N = reparse(res.code);
  if (!M || N.type !== 'mindmap' || res.code === core.code) return false;
  const n = res.line !== undefined ? mindNodeAt(N, res.line) : undefined;
  const sel: Sel[] = n ? [{ kind: 'node', id: n.id }] : [];
  const ok = core.applyCode(meta && n ? { code: res.code, meta: meta(M, N, n.id) } : { code: res.code }, label, { select: sel });
  if (ok && edit && n) setTimeout(() => {
    if (core.isSelected(sel[0]!) && !core.run('inlineEdit', sel[0]!)) core.run('setPanel', 'properties', true);
  }, 0);
  return ok;
}

/** Folds or unfolds a branch (metadata `collapsed`, one undo step). */
export function toggleFold(core: EditorCore, id: string): void {
  const n = mindModel(core)?.nodes.get(id);
  if (!n?.children.length) return;
  const folded = core.getM('node', id).collapsed === true;
  core.change(folded ? 'Unfold' : 'Fold', () => {
    const m = core.ensure('node', id);
    if (folded) delete m.collapsed;
    else m.collapsed = true;
    core.tidy('node', id);
  });
}
