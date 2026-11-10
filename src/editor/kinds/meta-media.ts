// What the editor shows of an image or icon item kept in metadata (core/ops/meta-media.ts: state diagrams, mindmaps,
// sequence participants): the edit kinds' `media` hook, so the toolbar's Change image, its settings and Properties
// work on it as on a flowchart image node.
import type { MediaSource } from '../../core/render/media-node.js';
import type { ItemMedia } from './types.js';

/**
 * An item's image as the editor shows it: an image or icon item from its source (an icon is its image's source), or a
 * plain item, which takes a picture (it becomes an image item) and no icon of its own.
 */
export function metaItemMedia(src: MediaSource | null): ItemMedia {
  if (!src) return { icon: null, image: null, node: null, canImage: true, canIcon: false };
  return {
    icon: src.icon ?? null, image: src.img ?? null, node: src.img != null ? 'image' : 'icon', canImage: true, canIcon: true,
    ...(src.pos ? { pos: src.pos } : {}), ...(src.form ? { form: src.form } : {}), ...(src.w ? { w: src.w } : {}), ...(src.h ? { h: src.h } : {}),
    ...(src.constraint ? { constraint: src.constraint } : {}),
  };
}
