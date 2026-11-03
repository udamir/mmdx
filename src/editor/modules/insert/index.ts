// The insert dock (T05 §4.1): Image beside Shapes in the tool dock, shown when the diagram type's edit kind offers it
// (`addImage` / `setImage`), with its shortcut and help entry; a picture pasted or dropped on the canvas goes to the
// host's `uploadImage`. Only the button and the shortcuts are eager: the pickers (icon picker, image tool, emoji picker)
// are a lazy chunk (`./media.ts`), loaded the first time one opens. Text, icons, containers and connectors are made
// inline (the Shapes menu's text block, the toolbar's and Properties' icon, ⌘G, a node's connection handles).
import type { Point } from '../../../core/types.js';
import { dockButton } from '../../../ui/blocks/tool-dock.js';

import { editKind } from '../../kinds/registry.js';
import type { EditKind } from '../../kinds/types.js';
import type { EditorModule } from '../../module.js';

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
    const openImage = (a?: HTMLElement): void => core.run('openImageTool', a ?? null, { insert: !!kind()?.addImage });

    // ---- dock button and shortcuts --------------------------------------------------------------------------------
    const image = dockButton({
      icon: I_IMAGE, label: t('tools.image'), keys: INSERT_KEYS.image, class: 'edit-only no-version vt-image', f: 'tool-image',
      attrs: { 'aria-haspopup': 'dialog' },
      onClick: () => openImage(image.el),
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
          openImage(image.el);
        },
      },
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

    return () => image.destroy();
  },
};
