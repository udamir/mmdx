// The Shapes menu's helpers (R6: out of the module's install): the diagram type's palette, the palette block's lazy chunk, the `addShape` action and where the menu opens.
import type { Point } from '../../../core/types.js';
import { registerMessages } from '../../../i18n.js';
import type { EditorCore } from '../../core.js';
import { editKind } from '../../kinds/registry.js';
import type { PaletteItem, PaletteSpec } from '../../kinds/palette.js';
import { canvasCenter } from '../../lib/shape-drag.js';
import { dropPaletteItem } from '../../lib/shape-drop.js';
import { paletteItem } from './items.js';

/** The palette of the current diagram type. */
export const paletteOf = (core: EditorCore): PaletteSpec | undefined => editKind(core.model.type)?.palette;

/** The block's chunk (with its CSS), loaded the first time a palette shows. */
let paletteChunk: Promise<typeof import('../../../ui/blocks/shape-palette.js')> | null = null;
export const loadShapePalette = (): Promise<typeof import('../../../ui/blocks/shape-palette.js')> =>
  (paletteChunk ??= Promise.all([import('../../../ui/blocks/shape-palette.js'), import('../../messages-media.js'), import('../../../ui/messages/blocks-media.js')]).then(([m, msg, blocks]) => {
    registerMessages(msg.EDITOR_MEDIA_MESSAGES);
    // the shape categories (`palette.cat.*`) are the media blocks'
    registerMessages(blocks.BLOCK_MESSAGES_MEDIA);
    return m;
  }).catch((e: unknown) => {
    paletteChunk = null;
    throw e;
  }));

/** Adds an item of the Shapes menu (`addShape` action): `kind` is a palette key (`rect`, `actor`, `note`, `entity`…). */
export function addShape(core: EditorCore, kind: string, opts: { preset?: string; at?: Point } = {}): boolean {
  const item = paletteItem(core.model.type, kind);
  if (!item) return false;
  const it: PaletteItem = opts.preset ? { ...item, preset: opts.preset } : item;
  return dropPaletteItem(core, it, opts.at ?? canvasCenter(core));
}

/** The tool dock (or the button) the menu opens beside. */
export const dockOf = (anchor: HTMLElement | null): HTMLElement | null => anchor?.closest<HTMLElement>('.view-tools, .tool-dock') ?? anchor;

/** Places the menu beside the dock: centred on it, moved up or down only as far as needed to stay inside the editor (`root`). */
export function placeMenu(menu: HTMLElement, anchor: HTMLElement | null, root: HTMLElement): void {
  const dock = dockOf(anchor);
  if (!dock) {
    menu.style.removeProperty('left');
    menu.style.removeProperty('top');
    return;
  }
  const dr = dock.getBoundingClientRect(), rr = root.getBoundingClientRect();
  if (!dr.width && !dr.height) return;
  const mh = menu.getBoundingClientRect().height;
  const top = Math.max(8, Math.min(dr.top + dr.height / 2 - rr.top - mh / 2, rr.height - 8 - mh));
  menu.style.left = `${dr.right - rr.left + 8}px`;
  menu.style.top = `${top + mh / 2}px`;
}
