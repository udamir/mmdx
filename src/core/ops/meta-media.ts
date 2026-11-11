// Image and icon items kept in metadata: in the types whose code has no image or icon syntax for them — state diagrams,
// mindmaps, sequence participants — an item's picture (`img`) or icon (`icon`) and the flowchart image node's layout
// keys (`pos`, `w`, `h`, `constraint`, `form`, and `imgFit`) are its metadata. The renderers read them
// (render/media-node.ts draws the item as the flowchart draws an image node); the editor's image tool, toolbar and
// Properties write them, as the flowchart writes its node data (core/ops/flow-media.ts): a picture and an icon replace
// each other, and removing one makes the item plain again.
import { MEDIA_KEYS } from '../meta/keys.js';
import type { MediaPatch } from './flow-media.js';

type Meta = Record<string, unknown>;

/** The flowchart's defaults (flow-media.ts: ICON_NODE_H, IMAGE_NODE_SIZE), not imported: that module carries the flowchart's ops. */
const ICON_NODE_H = 60, IMAGE_NODE_SIZE = 200;

// MEDIA_KEYS (meta/keys.ts): every key of an image or icon item (`imgW` / `imgH`: the first metadata images' size,
// read where `w` / `h` are not)

/** A new picture's keys: Mermaid Chart's default size, the caption below, the aspect kept (the flowchart's image node). */
export const NEW_IMAGE = { h: IMAGE_NODE_SIZE, w: IMAGE_NODE_SIZE, pos: 'b', constraint: 'on' } as const;

const clear = (m: Meta): void => {
  for (const k of MEDIA_KEYS) delete m[k];
};

/**
 * Sets an item's picture or removes it (null). A plain item becomes an image item (Mermaid Chart's default size,
 * caption below, the aspect kept); an icon item gives up its icon.
 */
export function setMetaImage(m: Meta, url: string | null): void {
  if (url === null) {
    if (typeof m['img'] === 'string') clear(m);
    return;
  }
  if (typeof m['img'] !== 'string') {
    // a plain item's `w` / `h` were its box: the picture starts at the default size
    if (m['icon']) delete m['icon'], delete m['form'];
    else delete m['w'], delete m['h'];
    m['h'] ??= IMAGE_NODE_SIZE;
    m['w'] ??= IMAGE_NODE_SIZE;
    m['pos'] ??= 'b';
    m['constraint'] ??= 'on';
  }
  m['img'] = url;
}

/** Sets an image or icon item's icon, or removes it (null): a picture gives way to it; without one the item is plain. */
export function setMetaIcon(m: Meta, name: string | null): void {
  if (name === null) {
    if (m['icon']) clear(m);
    return;
  }
  if (typeof m['img'] === 'string') {
    for (const k of ['img', 'w', 'constraint', 'imgFit', 'imgW', 'imgH'] as const) delete m[k];
    m['h'] = ICON_NODE_H;
  }
  m['icon'] = name;
  m['form'] ??= 'square';
  m['pos'] ??= 'b';
}

/** Changes an image or icon item's caption side, frame, size or aspect lock (null removes a key). */
export function patchMetaMedia(m: Meta, patch: MediaPatch): void {
  for (const k of ['pos', 'form', 'w', 'h', 'constraint'] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) delete m[k];
    else m[k] = v;
  }
}
