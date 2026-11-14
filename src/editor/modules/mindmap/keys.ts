// The mindmap's outline keys (T08 §3.7): Tab / Enter add a child / sibling, Shift+Tab / ⌥← / ⌥→ / ⌥↑ / ⌥↓ move a node,
// the arrows walk the tree, F2 edits, Space folds on release (Space+drag still pans), Shift+Delete lifts a node, ⌘D
// duplicates, ⌘V pastes branches; indented text pasted on a node becomes its subtree. They answer through the
// shortcuts the module registered when it was installed (`mindmapKeys`).
import type { MindmapModel } from '../../../core/model.js';
import { reparse } from '../../../core/parse/dispatch.js';
import { cloneMeta, ensure } from '../../../core/ops/meta-util.js';
import { addMindChild, addMindSibling, blockText, cloneMind, indentMind, liftMind, mindNodeAt, moveMind, outdentMind, pasteMindLines, pasteMindText, remapMindMeta } from '../../../core/kinds/mindmap/ops.js';
import { descendantsOf, parseMindmap } from '../../../core/kinds/mindmap/parse.js';
import type { EditorCore, Sel } from '../../core.js';
import type { ModuleScope } from '../../../view/module.js';
import { mindmapKeys } from './index.js';
import { maxOf } from '../../../core/geom.js';
import { applyAt, mindGeom, mindModel, selectedNode, toggleFold } from './lib.js';

export function installMindmapKeys(scope: ModuleScope<EditorCore>): void {
  const core = scope.core;
  const editing = (): boolean => core.mode.peek() === 'edit' && !core.version.peek();
  /** A key for the selected node of a mindmap, with the canvas focused. */
  const target = (ev: KeyboardEvent): { M: MindmapModel; id: string } | null => {
    const M = mindModel(core);
    const id = M && core.atRoot(ev) && editing() ? selectedNode(core) : null;
    return M && id ? { M, id } : null;
  };
  const keyOp = (f: (M: MindmapModel, id: string) => { code: string; line?: number; reason?: string }, label: string, edit = false) => (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    if (!t) return false;
    applyAt(core, f(t.M, t.id), label, edit);
    return true;
  };

  /** Arrow keys walk the tree: up / down to a sibling, toward the root or into the first child (by side). */
  const walk = (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    const gm = mindGeom(core);
    if (!t || !gm) return false;
    const n = t.M.nodes.get(t.id)!;
    const b = gm.nodes.get(t.id);
    const side = b?.side ?? 'r';
    const parent = n.parent, kids = n.children.filter((c) => gm.nodes.has(c));
    const sibs = parent ? t.M.nodes.get(parent)!.children.filter((c) => gm.nodes.get(c)?.side === side) : [];
    const i = sibs.indexOf(t.id);
    const down = side === 'd';
    const key = ev.key;
    const along = down ? (key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0) : key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    const outward = down ? key === 'ArrowDown' : (key === 'ArrowRight') === (side !== 'l');
    let next: string | undefined;
    if (along) next = sibs[i + along];
    else if (outward) next = kids.find((c) => !n.parent || gm.nodes.get(c)?.side === side) ?? kids[0];
    else next = parent ?? undefined;
    // the root: right and left go to the first branch on that side
    if (!n.parent && !along) next = kids.find((c) => gm.nodes.get(c)?.side === (key === 'ArrowLeft' ? 'l' : key === 'ArrowUp' ? 'l' : 'r')) ?? kids[0];
    if (next) {
      core.select([{ kind: 'node', id: next }]);
      core.draw();
      core.fire('panels');
    }
    return true;
  };

  const duplicate = (ev: KeyboardEvent): boolean => {
    const M = mindModel(core);
    if (!M || !core.atRoot(ev) || !editing()) return false;
    const refs = core.selection().filter((r) => r.kind === 'node' && r.id !== M.root);
    if (!refs.length) return false;
    const res = cloneMind(core.code, M, refs);
    const N = reparse(res.code);
    if (N.type !== 'mindmap' || !res.map) return true;
    // the copies take the originals' looks (positions and folds are their own)
    const meta = cloneMeta(remapMindMeta(core.meta, M, N));
    for (const [from, to] of Object.entries(res.map)) {
      const look = core.meta.nodes?.[from];
      if (!look) continue;
      const { dx: _x, dy: _y, side: _s, collapsed: _c, locked: _l, ...rest } = look;
      if (Object.keys(rest).length) Object.assign(ensure(meta, 'node', to), structuredClone(rest));
    }
    const tops = refs.filter((r) => !refs.some((o) => o.id !== r.id && descendantsOf(M, o.id).includes(r.id))).map((r) => res.map![r.id]).filter((x): x is string => !!x);
    core.applyCode({ code: res.code, meta }, 'Duplicate', { select: tops.map((id) => ({ kind: 'node', id })) });
    return true;
  };

  /** ⌘V: copied branches (this map's, or another's from their content) under the selected node, else the root. */
  const paste = (ev: KeyboardEvent): boolean => {
    const M = mindModel(core);
    const data = core.clipboard;
    if (!M || !core.atRoot(ev) || !editing() || data?.type !== 'mindmap' || !M.root) return false;
    const here = data.items.every((r) => M.nodes.has(r.id));
    const src = here ? M : data.content ? parseMindmap(data.content.code) : null;
    const code = here ? core.code : data.content?.code ?? '';
    if (!src) return false;
    const ids = data.items.map((r) => r.id).filter((id) => src.nodes.has(id));
    const tops = ids.filter((id) => !ids.some((o) => o !== id && descendantsOf(src, o).includes(id)));
    const lines = tops.flatMap((id) => blockText(src, code, id));
    const parent = selectedNode(core) ?? M.root;
    const res = pasteMindLines(core.code, M, parent, lines);
    if (res.line < 0) return true;
    const N = reparse(res.code);
    const sel: Sel[] = [];
    if (N.type === 'mindmap') {
      let at = res.line;
      for (let k = 0; k < tops.length; k++) {
        const n = mindNodeAt(N, at);
        if (!n) break;
        sel.push({ kind: 'node', id: n.id });
        at = Math.max(n.endLine, maxOf(descendantsOf(N, n.id).map((d) => N.nodes.get(d)!.endLine))) + 1;
      }
    }
    core.applyCode({ code: res.code }, core.i18n.t('history.paste'), { select: sel });
    return true;
  };

  const lift = (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    if (!t) return false;
    const r = liftMind(core.code, t.M, t.id);
    if (r.reason) core.toast(r.reason);
    else {
      const meta = cloneMeta(core.meta);
      delete meta.nodes?.[t.id];
      const N = reparse(r.code);
      core.applyCode({ code: r.code, meta: N.type === 'mindmap' ? remapMindMeta(meta, t.M, N) : meta }, 'Delete', { select: [] });
    }
    return true;
  };

  // Space folds on release, so Space+drag still pans
  let spacePan = false;
  scope.listen(core.eventRoot, 'pointerdown', () => {
    if (core.spaceDown) spacePan = true;
  });
  scope.listen(core.eventRoot, 'keyup', (ev) => {
    if (ev.key !== ' ') return;
    const pan = spacePan;
    spacePan = false;
    const t = target(ev);
    if (!pan && t) toggleFold(core, t.id);
  });

  const keys = mindmapKeys(core);
  Object.assign(keys, {
    child: keyOp((M, id) => addMindChild(core.code, M, id), core.i18n.t('history.addNode'), true),
    sibling: keyOp((M, id) => addMindSibling(core.code, M, id), core.i18n.t('history.addNode'), true),
    outdent: keyOp((M, id) => outdentMind(core.code, M, id), core.i18n.t('history.moveNode')),
    indent: keyOp((M, id) => indentMind(core.code, M, id), core.i18n.t('history.moveNode')),
    up: keyOp((M, id) => moveMind(core.code, M, id, -1), core.i18n.t('history.moveNode')),
    down: keyOp((M, id) => moveMind(core.code, M, id, 1), core.i18n.t('history.moveNode')),
    walk,
    edit: (ev: KeyboardEvent): boolean => {
      const t = target(ev);
      if (!t) return false;
      if (!core.run('inlineEdit', { kind: 'node', id: t.id })) core.run('setPanel', 'properties', true);
      return true;
    },
    lift,
    duplicate,
    paste,
  });
  scope.onDispose(() => {
    for (const k of Object.keys(keys)) delete keys[k];
  });

  // indented text or a Markdown list pasted on a node becomes its subtree
  scope.listen(core.eventRoot, 'paste', (ev) => {
    const M = mindModel(core);
    const e = ev as ClipboardEvent;
    if (!M || !editing() || core.inlineEditing || !core.atRoot(e)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim() || e.clipboardData?.files.length) return;
    const parent = selectedNode(core) ?? M.root;
    if (!parent) return;
    e.preventDefault();
    applyAt(core, pasteMindText(core.code, M, parent, text), 'Paste');
  });
}
