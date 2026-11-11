# Extending the editor

The editor is a set of feature modules on a small core: canvas gestures, connectors, the panels, the toolbars and the chrome are each a module. A host can add its own modules next to them, or replace some of them, through the editor's `modules` option. This page covers what a module is, what it can reach, and how it hooks into the canvas.

::: warning Advanced
Custom modules are an advanced extension point. The API below is the editor as modules see it (`EditorModuleApi`). The editor core itself (`EditorCore`) is internal and changes from release to release, so a module typed with `EditorModuleApi` is the one that keeps working.
:::

## A module

A module is an object with an id and an `install` function. The editor installs it with its own modules and gives it a scope. Every registration made through the scope (listeners, shortcuts, actions, gesture sources, overlay painters, DOM) is muted while the module is suspended and removed when it is uninstalled, so a module needs no cleanup code of its own for them.

```ts
import { DiagramEditor, DEFAULT_MODULES, type EditorModule } from '@mmdx/studio/editor';

const wordCount: EditorModule = {
  id: 'host-word-count',
  install(scope) {
    const core = scope.core;
    const badge = document.createElement('span');
    scope.slot('bottom-right').append(badge);
    const update = (): void => {
      badge.textContent = `${core.code.split(/\s+/).filter(Boolean).length} words`;
    };
    scope.on('model', update);
    update();
  },
};

new DiagramEditor(host, { value, modules: [...DEFAULT_MODULES, wordCount] });
```

On `<mmdx-editor>`, set the `modules` property before the element connects. `DEFAULT_MODULES` is the editor's own list; leaving a module out of it takes that feature away (most features are easier to turn off through `features`).

```ts
interface EditorModule {
  id: string;
  replaces?: readonly string[];           // the editor's modules of these ids are out while this one is installed
  after?: readonly string[];              // install after these modules (ids), whatever the list order
  when?: { mode?: ('edit' | 'view')[]; stage?: ('document' | 'history')[] }; // active only there; suspended elsewhere
  enabled?: (core: EditorModuleApi) => boolean; // re-evaluated when features or options change; false uninstalls
  css?: readonly string[];                // adopted into the editor's shadow root while the module is installed
  install(scope: ModuleScope<EditorModuleApi>): void | (() => void);
  load?(): Promise<{ css?: readonly string[]; activate(scope: ModuleScope<EditorModuleApi>): void | (() => void) }>;
}
```

`install` should be small and synchronous. Code that only some sessions need goes into `load`: the scope's `load()` imports it the first time it is used and activates it in the same scope.

## What a module sees

The scope's `core` is an `EditorModuleApi`:

| Group | Members |
|---|---|
| The document | `model`, `code`, `meta`, `docType` (the diagram type from the code, a signal), `geom` and `result` (the last render) |
| Its changes | `applyCode(res, label, opts?)` (a code rewrite, one undo step; returns false when nothing changed or the host vetoed it), `setMeta(label, meta)`, `begin()` / `commit(label)` / `rollback()` (a transaction a gesture previews through), `undo()`, `redo()` |
| The selection | `selection()`, `select(items)`, `primary()`, `isSelected(item)`, `toggleSelected(item)` |
| The view | `draw()`, `drawOverlay()`, `viewport`, `hitTest(ev)`, `toDiagram(point)`, `toScreen(point)`, `rectOnScreen(rect)` |
| The canvas hooks | `addGestureSource(source)`, `addOverlay(painter)`; use the scope's `gesture` and `painter` below |
| The kernel | `mode`, `stage`, `tool`, `panels`, `display`, `scheme`, `compact` (signals), `setMode`, `setTool`, `setPanel`, `features`, `i18n`, `storage`, `ctx`, `host`, `product` |
| Events and actions | `on(event, f)`, `fire(event)`, `emit(name, detail, cancelable?)` (a DOM event on the element), `run(action, ...args)`, `has(action)`, `toast(message)` |

Everything a module writes goes through these calls: there is no way to write the document store directly, so every change is one `mmdx-op` (which the host can veto), one `mmdx-change` and one undo step.

## The scope

| Method | What it does |
|---|---|
| `on(event, f)` | Listens to an editor event: `model`, `selection`, `mode`, `tool`, `overlay`, `draw`, `panels`, `view`, `document`, `theme` |
| `provide(action, f)`, `provideDefault(action, f)` | Answers an action other modules `run` (`provideDefault`: only when no other module does) |
| `shortcut(...shortcuts)` | Registers keyboard shortcuts (they show in the editor's help) |
| `gesture(source)` | Adds a gesture source to the canvas (below) |
| `painter(painter)` | Adds an overlay painter to the canvas (below) |
| `slot(name).append(el)`, `mount(parent, el)` | Places DOM in a named slot of the shell (`top-left`, `top-center`, `top-right`, `bottom-center`, `bottom-right`, …) or anywhere else |
| `canvas(type, f, opts?)`, `listen(target, type, f, opts?)` | A DOM listener on the canvas picture, or on any target |
| `effect(f)`, `computed(f)` | Follows signals (`core.mode()`, `core.docType()`, `core.selection` through `on('selection')`, …) |
| `contribute(list, item)`, `contributeAll(list)` | Adds entries to a list the editor renders (dock buttons, export formats, panels) |
| `onDispose(f)` | Runs `f` when the module is uninstalled |

## Gestures and the overlay

A press on the canvas asks the gesture sources one after the other, highest priority first; the first one that returns a gesture owns the drag. A gesture gets diagram-space deltas from the press point until the pointer is released (`end`) or the drag is cancelled (`cancel`: Esc, a lost pointer, History opening); a press without movement is a `click`.

```ts
scope.gesture({
  id: 'host-stamp',
  priority: 55, // above the editor's item gestures, below its handles
  down(ev, hit) {
    if (core.mode.peek() !== 'edit' || !ev.altKey || !hit.item) return null; // let the next source try
    return {
      move() {},
      click: () => core.toast(`${hit.item!.kind} ${hit.item!.id}`),
    };
  },
});
```

The editor's own sources use these priorities:

| Priority | Sources |
|---|---|
| 100 | Handles on the overlay: resize, connector ends and bend points, connection dots |
| 95 | The ER table being edited |
| 90 | A diagram type's own gestures (sequence messages and lifelines, mindmap branches) |
| 60 | Copy style (the paint roller) |
| 50 | Items: select, move, Alt-drag copy, enter groups |
| 10 | The empty canvas: the marquee |

Overlay painters draw handles and marks over the picture, from the current geometry, every time the overlay is drawn (after each render and each pan or zoom step). A painter returns scene nodes (`{ t: 'rect', attrs: { … }, key }`); `k` is the zoom, so `1 / k` is one screen pixel. Painters paint in `order` (lowest underneath): the selection boxes are 10, the ER table 11, connector handles 70, a diagram type's own marks 80. A painter whose `exclusive()` is true hides the others while it shows (a link preview hides the selection boxes).

```ts
scope.painter({
  id: 'host-ring',
  order: 90,
  paint(k) {
    // the geometry is in diagram units; a flowchart's node boxes are centred on (x, y)
    const s = core.primary(), g = core.geom;
    const b = s?.kind === 'node' && g.type === 'flowchart' ? g.nodes.get(s.id) : undefined;
    if (!b) return [];
    return [{ t: 'circle', attrs: { class: 'host-ring', cx: b.x, cy: b.y, r: Math.max(b.w, b.h) / 2 + 8 / k, 'stroke-width': 1.5 / k } }];
  },
});
```

## Lifecycle

- **Suspended**: while History is open, and outside the module's `when`, a module is suspended. Its DOM is detached, its listeners, gestures, painters and shortcuts are muted, and its actions fall back to the previous provider. Its state stays. It resumes where it was.
- **Reinstalled**: changing `features` (or anything an `enabled` read) uninstalls and installs modules in place.
- **Uninstalled**: when the editor is destroyed, and when `enabled` turns false. Everything registered through the scope goes, and the function `install` returned runs.

An old version shown in History is read-only: `applyCode`, `setMeta`, transactions and undo refuse to write while it shows. A module that edits can say so with `when: { stage: ['document'] }`, and is then suspended while History is open.
