// The image and icon state machine of an item (X9), shared by the flowchart's node data (core/kinds/flowchart/ops-media.ts) and the metadata of the types without image syntax (ops/meta-media.ts): from an item's media keys and a change, the keys to write. A picture and an icon replace each other, removing one makes the item plain again, and a plain item becomes an image or icon item with Mermaid Chart's defaults.
import { MEDIA_KEYS, type MetaKey } from '../meta/keys.js';

/** Size of a new icon node's icon and a new image node's picture (Mermaid Chart's defaults). */
export const ICON_NODE_H = 60;
export const IMAGE_NODE_SIZE = 200;
/** The frame of a new icon item: a square, as Mermaid's icon shape examples write it and the image tool's Icon tab has always made it. */
export const ICON_FORM = 'square';
/** The sizes a toolbar or Properties may give an icon or a picture. */
const SIZE_MIN = 8, SIZE_MAX = 2000;

/** A media key value to write: a string, a number, or null to remove the key. */
export type MediaValue = string | number | null;

/** The layout keys of an icon or image item a toolbar or Properties changes (null removes one). */
export interface MediaPatch {
  pos?: string | null;
  form?: string | null;
  w?: number | null;
  h?: number | null;
  constraint?: 'on' | 'off' | null;
  /** `icon`: a node whose label starts with an icon token becomes an icon node (T06 §3.6, "Convert to icon node"). */
  node?: 'icon';
}

/** A change of an item's media: its picture (a URL, or null to remove it), its icon (`pack:name`, or null), or its layout keys. */
export type MediaChange = { readonly image: string | null } | { readonly icon: string | null } | { readonly layout: MediaPatch };

export interface MediaOpts {
  /** The item's `w` / `h` are its box while it is plain (metadata), not an asset size: a new picture or icon does not keep them. */
  readonly boxSize?: boolean;
}

/** An item's media keys: a flowchart node's node data or an item's metadata. */
export type MediaKeys = { readonly [K in MetaKey]?: unknown };

/** The keys a picture has that an icon does not (an icon is `h` square). */
const PICTURE_KEYS = ['img', 'w', 'constraint', 'imgFit', 'imgW', 'imgH'] as const;

/**
 * The keys to write for a media change of an item whose media keys are `current` (null values remove a key; keys the item does not have are never removed): {} when nothing changes, null for a layout change of an item that is neither an image nor an icon item. An item with a picture is an image item (Mermaid draws `img` first), else one with an icon an icon item.
 */
export function mediaPatch(current: MediaKeys, change: MediaChange, opts: MediaOpts = {}): Record<string, MediaValue> | null {
  const image = current['img'] != null;
  const icon = !image && !!current['icon'];
  const has = (k: MetaKey): boolean => current[k] !== undefined;
  const p: Record<string, MediaValue> = {};
  const drop = (keys: readonly MetaKey[]): Record<string, MediaValue> => {
    for (const k of keys) if (has(k)) p[k] = null;
    return p;
  };
  if ('image' in change) {
    const url = change.image;
    if (url === null) return image ? drop(MEDIA_KEYS) : p;
    if (image) return { img: url };
    p['img'] = url;
    if (icon) drop(['icon', 'form']);
    // an icon's size carries over to the picture; a plain item's box (metadata) does not
    const keep = icon || !opts.boxSize;
    if (!keep) drop(['w', 'h']);
    if (!(keep && has('h'))) p['h'] = IMAGE_NODE_SIZE;
    if (!(keep && has('w'))) p['w'] = IMAGE_NODE_SIZE;
    if (!has('pos')) p['pos'] = 'b';
    // a picture keeps its aspect ratio unless Properties turns the lock off (Mermaid's default is off: it is written)
    if (!has('constraint')) p['constraint'] = 'on';
    return p;
  }
  if ('icon' in change) {
    const name = change.icon;
    if (name === null) return icon ? drop(MEDIA_KEYS) : p;
    if (icon) return { icon: name };
    // a picture gives way to the icon (its `h` becomes the icon's), and so does a plain item's box
    drop(image ? PICTURE_KEYS : opts.boxSize ? ['w'] : []);
    p['icon'] = name;
    if (!has('form')) p['form'] = ICON_FORM;
    p['h'] = ICON_NODE_H;
    if (!has('pos')) p['pos'] = 'b';
    return p;
  }
  if (!image && !icon) return null;
  for (const [k, v] of Object.entries(change.layout) as [keyof MediaPatch, MediaValue | undefined][]) {
    if (v === undefined || k === 'node') continue;
    // a frame belongs to icons, the aspect lock to images
    if ((k === 'form' && !icon) || (k === 'constraint' && !image)) continue;
    p[k] = typeof v === 'number' ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, v)) : v;
  }
  return p;
}
