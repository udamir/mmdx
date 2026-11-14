// Mindmap gestures (T08 §3.7): the outline keys — Tab adds a child, Enter a sibling (on the root: a child),
// Shift+Tab / ⌥← moves a node out, ⌥→ under the node above it, ⌥↑ / ⌥↓ trades it with a sibling, the arrows walk the
// tree, F2 edits the text, Space folds or unfolds a branch (metadata `collapsed`), Shift+Delete deletes a node and
// keeps its children, ⌘D duplicates a branch, ⌘V pastes copied branches (or indented text) under the selected node;
// the `+` and fold handles and dragging a node to re-parent or reorder it are the lazy part (gestures.ts), loaded the
// first time the editor shows a mindmap. The keys are registered here, when the module installs before the canvas
// modules, so they come before the canvas's own (Tab, Enter, arrows), as the ER table editor's do; each one lets the
// key through until the lazy part answers it, and whenever the diagram is not a mindmap.
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';

/** The keys' handlers, per editor: filled by the lazy part when it activates. */
type Keys = Record<string, (ev: KeyboardEvent) => boolean>;
const KEYS = new WeakMap<EditorCore, Keys>();

/** The handler table of an editor's mindmap keys. */
export function mindmapKeys(core: EditorCore): Keys {
  let k = KEYS.get(core);
  if (!k) KEYS.set(core, (k = {}));
  return k;
}

export const mindmapModule: EditorModule = {
  id: 'mindmap',
  install(scope) {
    const core = scope.core;
    const keys = mindmapKeys(core);
    const run = (name: string) => (ev: KeyboardEvent): boolean => keys[name]?.(ev) ?? false;
    const G = 'Mindmap';
    const t = core.i18n.t;
    scope.shortcut(
      { id: 'mm-child', keys: ['tab'], label: t('help.mm.child'), group: G, editOnly: true, run: run('child') },
      { id: 'mm-sibling', keys: ['enter'], label: t('help.mm.sibling'), group: G, editOnly: true, run: run('sibling') },
      { id: 'mm-outdent', keys: ['shift+tab', 'alt+arrowleft'], label: t('help.mm.outdent'), group: G, editOnly: true, run: run('outdent') },
      { id: 'mm-indent', keys: ['alt+arrowright'], label: t('help.mm.indent'), group: G, editOnly: true, run: run('indent') },
      { id: 'mm-up', keys: ['alt+arrowup'], label: t('help.mm.up'), group: G, editOnly: true, run: run('up') },
      { id: 'mm-down', keys: ['alt+arrowdown'], label: t('help.mm.down'), group: G, editOnly: true, run: run('down') },
      { id: 'mm-walk', keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: t('help.mm.walk'), group: G, editOnly: true, readOnly: true, run: run('walk') },
      { id: 'mm-edit', keys: ['f2'], label: t('help.mm.edit'), group: G, editOnly: true, run: run('edit') },
      { id: 'mm-fold', keys: ['space'], label: t('help.mm.fold'), group: G, editOnly: true, hintOnly: true },
      { id: 'mm-lift', keys: ['shift+delete', 'shift+backspace'], label: t('help.mm.lift'), group: G, editOnly: true, run: run('lift') },
      { id: 'mm-duplicate', keys: ['mod+d'], label: t('help.mm.duplicate'), group: G, editOnly: true, run: run('duplicate') },
      { id: 'mm-paste', keys: ['mod+v'], label: t('help.mm.paste'), group: G, editOnly: true, run: run('paste') },
    );
    // the gestures load with the first mindmap, however the document becomes one: an effect on its type, not the
    // `model` event, which does not fire when the kind was already loaded (a second editor on the page, B42)
    scope.effect(() => {
      if (core.docType() === 'mindmap') void scope.load();
    });
  },
  load: () => import('./gestures.js').then((m) => ({ css: [m.MINDMAP_CSS], activate: m.activateMindmap })),
};
