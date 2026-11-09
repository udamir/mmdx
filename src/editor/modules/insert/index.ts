// The insert dock (T05 §4.1): Image beside Shapes in the tool dock, shown when the diagram type's edit kind offers it
// (`addImage` / `setImage`), with its shortcut and help entry. Like a shape, the button is dragged onto the canvas (or
// clicked: the middle of it) and adds an image item with the placeholder — an empty URL, chosen afterwards from the
// toolbar or Properties; a picture pasted or dropped on the canvas goes to the host's `uploadImage`. Only the button and the shortcuts are eager: the pickers (icon picker, image tool, emoji picker)
// are a lazy chunk (`./media.ts`), loaded the first time one opens. Text, icons, containers and connectors are made
// inline (the Shapes menu's text block, the toolbar's and Properties' icon, ⌘G, a node's connection handles).
import type { Point } from '../../../core/types.js';
import { dockButton } from '../../../ui/blocks/tool-dock.js';
import { s } from '../../../ui/h.js';

import { editKind, withEdit } from '../../kinds/registry.js';
import type { EditKind } from '../../kinds/types.js';
import type { EditorModule } from '../../module.js';
import { canvasCenter, startMenuDrag } from '../shapes/drag.js';

/** Dock icon (24 × 24 stroke paths, fixed). */
const I_IMAGE = 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01';

/** Shortcut of the Image tool (I is Properties). */
export const INSERT_KEYS = { image: 'g' } as const;

type MediaChunk = typeof import('./media.js');
let chunk: Promise<MediaChunk> | null = null;
/** The pickers' chunk (icon picker, image tool, emoji picker, with their CSS). */
export const loadMedia = (): Promise<MediaChunk> =>
  (chunk ??= import('./media.js').catch((e: unknown) => {
    chunk = null;
    throw e;
  }));

/** Does the kind's dock offer images? */
const offersImage = (k: EditKind | undefined): boolean => !!(k?.addImage || k?.setImage);

export const insertModule: EditorModule = {
  id: 'insert',
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
    scope.provide('openIconPicker', (anchor) => media((m) => m.openIconPicker(core, anchor ?? null)));
    scope.provide('openImageTool', (anchor, opts) => media((m) => m.openImageTool(core, anchor ?? null, opts ?? {})));
    scope.provide('pickEmoji', (anchor, onPick, onClose) => media((m) => m.pickEmoji(core, anchor, onPick, onClose)));
    /** An image item with the placeholder at a point (a type that only sets images: the image tool for the selection). */
    const addImage = (at?: Point): void => {
      if (!withEdit(core.model, (k) => !!k.addImage)) return void core.run('openImageTool', image.el, { insert: false });
      const pt = at ?? canvasCenter(core);
      withEdit(core.model, (k, m) => k.addImage?.(core, m, '', { x: core.snapV(pt.x), y: core.snapV(pt.y) }));
      core.setTool('pointer');
    };
    const ghost = (): SVGElement =>
      s('svg', { viewBox: '0 0 24 24', width: '40', height: '40', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s('path', { d: I_IMAGE }));

    // ---- dock button and shortcuts --------------------------------------------------------------------------------
    const image = dockButton({
      icon: I_IMAGE, label: t('tools.image'), keys: INSERT_KEYS.image, class: 'edit-only no-version vt-image', f: 'tool-image',
      // a pointer press is the drag's (a click without moving adds it in the middle); Enter / Space add it there too
      onClick: (ev) => {
        if (ev.detail === 0) addImage();
      },
    });
    scope.listen(image.el, 'pointerdown', (ev) => {
      if (!editing()) return;
      startMenuDrag(core, ev as PointerEvent, image.el, { ghost, inside: [], drop: (at, _e, click) => addImage(click ? undefined : at) });
    });
    scope.contribute(core.dockItems, { id: 'image', section: 'tools', order: 32, el: image.el });
    const sync = (): void => {
      image.el.hidden = !core.model.type || !offersImage(kind());
    };
    scope.on('model', sync);
    scope.on('draw', sync);
    scope.effect(() => {
      core.stage();
      queueMicrotask(sync);
    });
    scope.shortcut(
      {
        id: 'insert-image', keys: [INSERT_KEYS.image], label: t('help.image'), group: t('help.tools'), editOnly: true,
        run: () => {
          if (!offersImage(kind())) return false;
          addImage();
        },
      },
      { id: 'insert-emoji', keys: ['mod+;'], label: t('help.emoji'), group: t('help.tools'), editOnly: true, hintOnly: true },
    );

    // ---- a picture pasted or dropped on the canvas: put into the host's image store, else its `uploadImage` ---------
    const takeFile = (file: File, at: Point | null): void => {
      const k = kind();
      if (!k?.addImage) return core.toast(t('media.noImages'));
      if (!core.upload) return core.toast(t('media.noUpload'));
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

    return () => image.destroy();
  },
};
