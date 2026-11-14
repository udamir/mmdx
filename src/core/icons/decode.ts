// Icon decoding (T04 §4.2): an icon of an Iconify pack → its validated body with the transformations applied and its
// view box. Aliases are followed (their flips and turns combine with the parent's, the rest overrides it), the pack's
// box defaults apply, and `rotate` / `hFlip` / `vFlip` become a transform as Iconify's own `iconToSVG` writes it. The
// registry loads this module on demand (in the viewer it is not part of the first chunk); SSR and Node import it.
import { cleanIconBody, hasOwnColours } from './svg-body.js';
import type { IconData, IconifyAlias, IconifyIcon, IconifyJSON } from './types.js';

type Props = Omit<IconifyIcon, 'body' | 'hidden'>;

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const own = <T>(o: Record<string, T> | undefined, k: string): T | undefined => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** An alias's transformations combined with its parent's: flips toggle, turns add, box values override. */
function merge(parent: Props, child: Props): Props {
  const r: Props = { ...parent };
  for (const k of ['left', 'top', 'width', 'height'] as const) if (child[k] !== undefined) r[k] = child[k];
  if (child.hFlip) r.hFlip = !parent.hFlip;
  if (child.vFlip) r.vFlip = !parent.vFlip;
  if (child.rotate) r.rotate = ((parent.rotate ?? 0) + child.rotate) % 4;
  return r;
}

/** The icon a name (or an alias chain, at most 8 deep) names, with the props it collected; null when unknown. */
function lookup(pack: IconifyJSON, name: string): { body: string; props: Props } | null {
  let props: Props = {};
  let n = name;
  for (let depth = 0; depth < 8; depth++) {
    const icon = own(pack.icons, n);
    if (icon && typeof icon.body === 'string') {
      const { body, hidden: _h, ...p } = icon;
      return { body, props: merge(p, props) };
    }
    const alias: IconifyAlias | undefined = own(pack.aliases, n);
    if (!alias || typeof alias.parent !== 'string') return null;
    const { parent, ...p } = alias;
    props = merge(p, props);
    n = parent;
  }
  return null;
}

const f = (n: number): string => String(Math.round(n * 1e4) / 1e4);

/** `rotate`, `hFlip` and `vFlip` as a transform around the box (Iconify's `iconToSVG`); the box after it. */
function transform(body: string, p: Required<Pick<Props, 'left' | 'top' | 'width' | 'height'>> & Props): { body: string; box: [number, number, number, number] } {
  const box = { left: p.left, top: p.top, width: p.width, height: p.height };
  const t: string[] = [];
  let rotation = num(p.rotate, 0);
  if (p.hFlip) {
    if (p.vFlip) rotation += 2;
    else {
      t.push(`translate(${f(box.width + box.left)} ${f(-box.top)})`, 'scale(-1 1)');
      box.top = box.left = 0;
    }
  } else if (p.vFlip) {
    t.push(`translate(${f(-box.left)} ${f(box.height + box.top)})`, 'scale(1 -1)');
    box.top = box.left = 0;
  }
  rotation = ((Math.round(rotation) % 4) + 4) % 4;
  if (rotation === 1) {
    const c = box.height / 2 + box.top;
    t.unshift(`rotate(90 ${f(c)} ${f(c)})`);
  } else if (rotation === 2) t.unshift(`rotate(180 ${f(box.width / 2 + box.left)} ${f(box.height / 2 + box.top)})`);
  else if (rotation === 3) {
    const c = box.width / 2 + box.left;
    t.unshift(`rotate(-90 ${f(c)} ${f(c)})`);
  }
  if (rotation % 2 === 1) {
    [box.left, box.top] = [box.top, box.left];
    [box.width, box.height] = [box.height, box.width];
  }
  return { body: t.length ? `<g transform="${t.join(' ')}">${body}</g>` : body, box: [box.left, box.top, box.width, box.height] };
}

/**
 * Decodes icon `name` of `pack`: `missing` when the pack has no such icon or alias, `invalid` when its body fails
 * validation or its box is not a positive size.
 */
export function decodeIcon(pack: IconifyJSON, name: string): IconData | 'missing' | 'invalid' {
  const found = lookup(pack, name);
  if (!found) return 'missing';
  let body = cleanIconBody(found.body);
  if (body === null) return 'invalid';
  const p = found.props;
  const width = num(p.width, num(pack.width, 16)), height = num(p.height, num(pack.height, 16));
  if (!(width > 0 && height > 0)) return 'invalid';
  const own = hasOwnColours(body);
  const mono = !own || /currentColor/i.test(body);
  // a body that paints nothing itself is black by default: draw it in currentColor so it takes the item's colour
  if (!own && !/currentColor/i.test(body)) body = `<g fill="currentColor">${body}</g>`;
  const t = transform(body, { ...p, left: num(p.left, num(pack.left, 0)), top: num(p.top, num(pack.top, 0)), width, height });
  const [left, top, w, h] = t.box;
  return { body: t.body, left, top, width: w, height: h, mono };
}

/** The decoder the registry uses (an object, so the registry can take it statically or load it). */
export const ICON_DECODER = { decodeIcon };
export type IconDecoder = typeof ICON_DECODER;
