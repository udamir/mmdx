// The insert dock (T05 §4.1): Text, Image, Icons, Container and Connector beside Shapes in the tool dock, each shown
// when the diagram type's edit kind offers it (`addText`, `addImage` / `setImage`, `addIcon` / `setIcon`, `group`,
// `connect`), with shortcuts and help entries; a picture pasted or dropped on the canvas goes to the host's
// `uploadImage`. Only the buttons and the shortcuts are eager: the Connector and Container tools' gestures are the
// module's lazy part (`./tools.ts`, loaded when one is chosen), the pickers (icon picker, image tool, emoji picker) a
// lazy chunk of their own (`./media.ts`), loaded the first time one opens.
import type { Point } from '../../../core/types.js';
import { dockButton } from '../../../ui/blocks/tool-dock.js';
import { computed } from '../../../ui/signal.js';

import { editKind, withEdit } from '../../kinds/registry.js';
import type { EditKind } from '../../kinds/types.js';
import type { EditorModule } from '../../module.js';
import { canvasCenter } from '../shapes/drag.js';

/** Dock icons (24 × 24 stroke paths, fixed). */
const I_TEXT = 'M5 6V4h14v2M12 4v16M9 20h6';
const I_IMAGE = 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01';
const I_ICONS = 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z';
const I_CONTAINER = 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 9h6v6H9z';
const I_CONNECTOR = 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6.5 15.5L17.5 8.5';

/**
 * Shortcuts. The design's I, C and L already toggle Properties, the Code panel and Layers, so Icons, Container and
 * Connector take N, B and A; S, T and G as designed.
 */
export const INSERT_KEYS = { text: 't', image: 'g', icons: 'n', container: 'b', connector: 'a' } as const;


type MediaChunk = typeof import('./media.js');
let chunk: Promise<MediaChunk> | null = null;
/** The pickers' chunk (icon picker, image tool, emoji picker, with their CSS). */
export const loadMedia = (): Promise<MediaChunk> =>
  (chunk ??= import('./media.js').catch((e: unknown) => {
    chunk = null;
    throw e;
  }));

/** What the kind's dock offers. */
const caps = (k: EditKind | undefined): Record<keyof typeof INSERT_KEYS, boolean> => ({
  text: !!k?.addText,
  image: !!(k?.addImage || k?.setImage),
  icons: !!(k?.addIcon || k?.setIcon),
  container: !!k?.group,
  connector: !!k?.connect,
});

export const insertModule: EditorModule = {
  id: 'insert',
  load: () => import('./tools.js').then((m) => ({ css: [m.TOOLS_CSS], activate: m.activateTools })),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const kind = (): EditKind | undefined => editKind(core.model.type);
    const editing = (): boolean => core.mode.peek() === 'edit' && !core.version.peek();
    const chunkFailed = (e: unknown): void => core.toast(`Could not load the editor's pickers: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    const media = (f: (m: MediaChunk) => void): void => void loadMedia().then((m) => {
      if (!core.isDestroyed) f(m);
    }, chunkFailed);

    // ---- actions --------------------------------------------------------------------------------------------------
    const addText = (at?: Point): void => {
      const pt = at ?? canvasCenter(core);
      withEdit(core.model, (k, m) => k.addText?.(core, m, { x: core.snapV(pt.x), y: core.snapV(pt.y) }));
    };
    scope.provide('addText', addText);
    scope.provide('openIconPicker', (anchor, opts) => media((m) => m.openIconPicker(core, anchor ?? null, opts ?? {})));
    scope.provide('openImageTool', (anchor, opts) => media((m) => m.openImageTool(core, anchor ?? null, opts ?? {})));
    scope.provide('pickEmoji', (anchor, onPick, onClose) => media((m) => m.pickEmoji(core, anchor, onPick, onClose)));

    const tool = (name: 'connect' | 'container'): void => {
      if (core.tool.peek() === name) return void core.run('setTool', 'pointer');
      if (name === 'container' && core.selection().length) {
        // a selection: wrap it at once
        void core.run('groupSelection');
        return;
      }
      // the tools' gestures are the module's lazy part
      void scope.load().then(() => {
        core.run('setTool', name);
        core.toast(t(name === 'connect' ? 'connect.source' : 'container.draw'));
      }, chunkFailed);
    };
    const insertMode = (what: 'icons' | 'image'): boolean => !!(what === 'icons' ? kind()?.addIcon : kind()?.addImage);
    const run: Record<keyof typeof INSERT_KEYS, (anchor?: HTMLElement) => void> = {
      text: () => addText(),
      image: (a) => core.run('openImageTool', a ?? null, { insert: insertMode('image') }),
      icons: (a) => core.run('openIconPicker', a ?? null, { insert: insertMode('icons') }),
      container: () => tool('container'),
      connector: () => tool('connect'),
    };

    // ---- dock buttons and shortcuts -------------------------------------------------------------------------------
    const ICONS: Record<keyof typeof INSERT_KEYS, string> = { text: I_TEXT, image: I_IMAGE, icons: I_ICONS, container: I_CONTAINER, connector: I_CONNECTOR };
    const ORDER: Record<keyof typeof INSERT_KEYS, number> = { text: 31, image: 32, icons: 33, container: 34, connector: 35 };
    const names = Object.keys(INSERT_KEYS) as (keyof typeof INSERT_KEYS)[];
    const buttons = names.map((name) => {
      const pressed = name === 'connector' ? computed(() => core.tool() === 'connect') : name === 'container' ? computed(() => core.tool() === 'container') : undefined;
      const b = dockButton({
        icon: ICONS[name], label: t(`tools.${name}`), keys: INSERT_KEYS[name], class: `edit-only no-version vt-${name}`, f: `tool-${name}`,
        ...(pressed ? { pressed } : { attrs: { 'aria-haspopup': name === 'text' ? 'false' : 'dialog' } }),
        onClick: () => run[name](b.el),
      });
      scope.contribute(core.dockItems, { id: name, section: 'tools', order: ORDER[name], el: b.el });
      return [name, b] as const;
    });
    const sync = (): void => {
      const c = caps(kind());
      for (const [name, b] of buttons) b.el.hidden = !core.model.type || !c[name];
    };
    scope.on('model', sync);
    scope.on('draw', sync);
    scope.effect(() => {
      core.stage();
      queueMicrotask(sync);
    });
    scope.shortcut(
      ...names.map((name) => ({
        id: `insert-${name}`, keys: [INSERT_KEYS[name]], label: t(`help.${name === 'icons' ? 'icons' : name}`), group: t('help.tools'), editOnly: true,
        run: () => {
          if (!caps(kind())[name]) return false;
          run[name](buttons.find(([n]) => n === name)?.[1].el);
        },
      })),
      { id: 'insert-emoji', keys: ['mod+;'], label: t('help.emoji'), group: t('help.tools'), editOnly: true, hintOnly: true },
    );

    // ---- a picture pasted or dropped on the canvas: uploaded through the host's `uploadImage` -----------------------
    const takeFile = (file: File, at: Point | null): void => {
      const k = kind();
      if (!k?.addImage) return core.toast(t('media.noImages'));
      if (!core.uploadImage) return core.toast(t('media.noUpload'));
      core.run('openImageTool', null, { insert: true, file, ...(at ? { at } : {}) });
    };
    const imageFile = (list: FileList | null | undefined): File | null => [...(list ?? [])].find((f) => /^image\//.test(f.type)) ?? null;
    scope.listen(core.dom.root, 'paste', (ev) => {
      const e = ev as ClipboardEvent;
      const target = e.composedPath()[0] as HTMLElement | undefined;
      if (!editing() || (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) || target?.closest?.('.mmdx-pop')) return;
      const f = imageFile(e.clipboardData?.files);
      if (!f) return;
      e.preventDefault();
      takeFile(f, core.pointer ? core.toDiagram(core.pointer) : null);
    });
    scope.listen(core.dom.wrap, 'dragover', (ev) => {
      const e = ev as DragEvent;
      if (editing() && [...(e.dataTransfer?.items ?? [])].some((x) => x.kind === 'file')) e.preventDefault();
    });
    scope.listen(core.dom.wrap, 'drop', (ev) => {
      const e = ev as DragEvent;
      const f = editing() ? imageFile(e.dataTransfer?.files) : null;
      if (!f) return;
      e.preventDefault();
      takeFile(f, core.toDiagram(e));
    });

    return () => {
      for (const [, b] of buttons) b.destroy();
      core.dom.root.classList.remove('tool-connect', 'tool-container');
    };
  },
};
