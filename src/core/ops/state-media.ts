// Image and icon states: Mermaid has no image or icon syntax in state diagrams, so a state's picture (`img`) or icon
// (`icon`) and the flowchart image node's layout keys (`pos`, `w`, `h`, `constraint`, `form`, and `imgFit`) are its
// metadata. The renderer reads them (render/media-node.ts draws the state as the flowchart draws an image node); the
// editor's image tool, icon picker, toolbar and Properties write them, as the flowchart writes its node data
// (core/ops/flow-media.ts): a picture and an icon replace each other, and removing one makes the state plain again.
import type { MediaSource } from '../render/media-node.js';
import type { MediaPatch } from './flow-media.js';

type Meta = Record<string, unknown>;

/** The flowchart's defaults (flow-media.ts: ICON_NODE_H, IMAGE_NODE_SIZE), not imported: that module carries the flowchart's ops. */
const ICON_NODE_H = 60, IMAGE_NODE_SIZE = 200;

/** Every key of an image or icon state (`imgW` / `imgH`: the first metadata images' size, read where `w` / `h` are not). */
const MEDIA_KEYS = ['img', 'icon', 'form', 'pos', 'w', 'h', 'constraint', 'imgFit', 'imgW', 'imgH'] as const;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** A state's picture (`img`, `""`: not chosen yet) or icon and its layout keys; null: a plain state. */
export function stateMediaSource(m: Meta): MediaSource | null {
  const img = typeof m['img'] === 'string' ? m['img'] : undefined, icon = str(m['icon']);
  if (img === undefined && !icon) return null;
  return {
    ...(img !== undefined ? { img } : { icon }),
    form: str(m['form']), pos: str(m['pos']), constraint: str(m['constraint']), fit: str(m['imgFit']),
    w: num(m['w']) ?? (img !== undefined ? num(m['imgW']) : undefined),
    h: num(m['h']) ?? (img !== undefined ? num(m['imgH']) : undefined),
  };
}

const clear = (m: Meta): void => {
  for (const k of MEDIA_KEYS) delete m[k];
};

/**
 * Sets a state's picture or removes it (null). A plain state becomes an image state (Mermaid Chart's default size,
 * caption below, the aspect kept); an icon state gives up its icon.
 */
export function setStateImage(m: Meta, url: string | null): void {
  if (url === null) {
    if (typeof m['img'] === 'string') clear(m);
    return;
  }
  if (typeof m['img'] !== 'string') {
    // a plain state's `w` / `h` were its box: the picture starts at the default size
    if (m['icon']) delete m['icon'], delete m['form'];
    else delete m['w'], delete m['h'];
    m['h'] ??= IMAGE_NODE_SIZE;
    m['w'] ??= IMAGE_NODE_SIZE;
    m['pos'] ??= 'b';
    m['constraint'] ??= 'on';
  }
  m['img'] = url;
}

/** Sets an image or icon state's icon, or removes it (null): a picture gives way to it; without one the state is plain. */
export function setStateIcon(m: Meta, name: string | null): void {
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

/** Changes an image or icon state's caption side, frame, size or aspect lock (null removes a key). */
export function patchStateMedia(m: Meta, patch: MediaPatch): void {
  for (const k of ['pos', 'form', 'w', 'h', 'constraint'] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) delete m[k];
    else m[k] = v;
  }
}
