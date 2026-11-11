// Mindmap gestures (T08 §3.7): the outline keys — Tab adds a child, Enter a sibling (on the root: a child),
// Shift+Tab / ⌥← moves a node out, ⌥→ under the node above it, ⌥↑ / ⌥↓ trades it with a sibling, the arrows walk the
// tree, F2 edits the text, Space folds or unfolds a branch (metadata `collapsed`), Shift+Delete deletes a node and
// keeps its children; the `+` handle on the node's outer side adds a child and the fold handle beside it folds;
// dragging a node re-parents it (drop on a node) or reorders it (between siblings: an insertion line shows where), a
// first-level branch dropped across the root switches sides (metadata `side`), ⌥-drag drops a copy; ⌘D duplicates a
// branch, ⌘V pastes copied branches (or indented text, a Markdown list, a Mermaid mindmap) under the selected node.
// The mindmap module's lazy part (index.ts loads it the first time a mindmap is shown): its keys answer through the
// shortcuts the module registered when it was installed, so they keep their place before the canvas's own.
import type { EditorCore } from '../../core.js';
import type { ModuleScope } from '../../../view/module.js';
import { installMindmapDrag, type MindDragState } from './drag.js';
import { installMindmapKeys } from './keys.js';

export { MINDMAP_CSS } from './css.js';

export function activateMindmap(scope: ModuleScope<EditorCore>): () => void {
  const st: MindDragState = { drag: null };
  installMindmapKeys(scope);
  installMindmapDrag(scope, st);
  scope.on('model', () => {
    st.drag = null;
  });
  return () => {
    st.drag = null;
  };
}
