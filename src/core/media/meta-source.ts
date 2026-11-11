// The read half of image and icon items kept in metadata (ops/meta-media.ts writes them): the renderers draw such an
// item as the flowchart's image node (render/media-node.ts) from what this reads.
import type { MediaSource } from '../render/types.js';

type Meta = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** An item's picture (`img`, `""`: not chosen yet) or icon and its layout keys; null: a plain item. */
export function metaMediaSource(m: Meta): MediaSource | null {
  const img = typeof m['img'] === 'string' ? m['img'] : undefined, icon = str(m['icon']);
  if (img === undefined && !icon) return null;
  return {
    ...(img !== undefined ? { img } : { icon }),
    form: str(m['form']), pos: str(m['pos']), constraint: str(m['constraint']), fit: str(m['imgFit']),
    w: num(m['w']) ?? (img !== undefined ? num(m['imgW']) : undefined),
    h: num(m['h']) ?? (img !== undefined ? num(m['imgH']) : undefined),
  };
}
