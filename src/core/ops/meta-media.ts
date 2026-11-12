// Image and icon items kept in metadata: in the types whose code has no image or icon syntax for them — state diagrams,
// mindmaps, sequence participants — an item's picture (`img`) or icon (`icon`) and the flowchart image node's layout
// keys (`pos`, `w`, `h`, `constraint`, `form`, and `imgFit`) are its metadata. The renderers read them
// (render/media-node.ts draws the item as the flowchart draws an image node); the editor's image tool, toolbar and
// Properties write them, through the state machine the flowchart's node data uses (core/ops/media.ts): a picture and an icon replace
// each other, and removing one makes the item plain again.
import { IMAGE_NODE_SIZE, mediaPatch, type MediaChange, type MediaPatch } from './media.js';

type Meta = Record<string, unknown>;

/** A new picture's keys: Mermaid Chart's default size, the caption below, the aspect kept (the flowchart's image node). */
export const NEW_IMAGE = { h: IMAGE_NODE_SIZE, w: IMAGE_NODE_SIZE, pos: 'b', constraint: 'on' } as const;

/** Applies a media change to an item's metadata; a plain item's `w` / `h` are its box, not an asset size. */
function change(m: Meta, c: MediaChange): void {
  for (const [k, v] of Object.entries(mediaPatch(m, c, { boxSize: true }) ?? {})) {
    if (v === null) delete m[k];
    else m[k] = v;
  }
}

/**
 * Sets an item's picture or removes it (null). A plain item becomes an image item (Mermaid Chart's default size,
 * caption below, the aspect kept); an icon item gives up its icon.
 */
export const setMetaImage = (m: Meta, url: string | null): void => change(m, { image: url });

/** Sets an image or icon item's icon, or removes it (null): a picture gives way to it; without one the item is plain. */
export const setMetaIcon = (m: Meta, name: string | null): void => change(m, { icon: name });

/** Changes an image or icon item's caption side, frame, size or aspect lock (null removes a key). */
export const patchMetaMedia = (m: Meta, patch: MediaPatch): void => change(m, { layout: patch });
