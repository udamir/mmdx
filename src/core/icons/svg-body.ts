// Icon body validation (T04 §4.2): an icon's SVG body is read by a small strict tokenizer and written out again from
// what it read, so only allowed elements and attributes reach the icon's image. Refused outright: `<script>`,
// `<foreignObject>`, `<image>` and any other element outside the list, `on*` attributes, an `href` that is not `#id`,
// `url()` that is not `url(#id)`, entities beyond the XML five and numeric ones, declarations, text, and bodies over
// 64 KB. Unknown harmless attributes (`class`, `data-*`) are dropped; `style` keeps paint properties only.
//
// The body never becomes markup in the page: it goes into a `data:` image (core/media/svg-url.ts), which runs no
// script and loads nothing. This is defence in depth, and a size guard.

/** Bodies longer than this (characters) are refused. */
export const MAX_ICON_BODY = 64 * 1024;

const ELEMENTS = new Set(
  ('path circle ellipse rect line polyline polygon g defs linearGradient radialGradient stop clipPath mask use symbol ' +
    'pattern filter feFlood feBlend feGaussianBlur feOffset feColorMatrix feMerge feMergeNode feMorphology feComposite').split(' '),
);

const ATTRS = new Set(
  ('d x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height points pathLength transform offset gradientUnits ' +
    'gradientTransform spreadMethod patternUnits patternContentUnits patternTransform viewBox preserveAspectRatio ' +
    'clipPathUnits maskUnits maskContentUnits filterUnits primitiveUnits id fill fill-opacity fill-rule stroke stroke-width ' +
    'stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity stop-color ' +
    'stop-opacity color clip-path clip-rule mask filter display visibility vector-effect shape-rendering paint-order ' +
    'mix-blend-mode isolation color-interpolation-filters flood-color flood-opacity result in in2 stdDeviation dx dy ' +
    'values type mode operator k1 k2 k3 k4 radius edgeMode mask-type').split(' '),
);

/** `style` properties kept (paint); the others are dropped. */
const STYLE_PROPS = new Set(
  ('fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray ' +
    'stroke-dashoffset stroke-opacity opacity stop-color stop-opacity color clip-rule mask-type mix-blend-mode isolation ' +
    'display visibility vector-effect paint-order flood-color flood-opacity').split(' '),
);

const NAME = /^[A-Za-z][\w:.-]*$/;
const LOCAL_REF = /^#[\w.:-]+$/;
const URL_REF = /url\(\s*(['"]?)#[\w.:-]+\1\s*\)/gi;
const ENTITY = /&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-f]{1,6}));/gi;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** An attribute value with its entities decoded; null for an unknown entity or a bare `&`. */
function decode(v: string): string | null {
  if (v.replace(ENTITY, '').includes('&')) return null;
  const out = v.replace(ENTITY, (_m, named: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (named) return NAMED[named.toLowerCase()]!;
    const cp = dec ? Number(dec) : parseInt(hex!, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\u0000';
  });
  return out.includes('\u0000') ? null : out;
}

/** A value may hold `url(#id)` references only: no other `url(`, no script schemes, no CSS escapes or rules. */
function safeValue(v: string): boolean {
  if (/[\\<>@]|expression\s*\(|javascript:|data:/i.test(v)) return false;
  return !/url\s*\(/i.test(v.replace(URL_REF, ''));
}

/** A `style` attribute reduced to paint declarations; null when a declaration is unsafe. */
function cleanStyle(v: string): string | null {
  const keep: string[] = [];
  for (const decl of v.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) {
      if (decl.trim()) return null;
      continue;
    }
    const prop = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1).trim();
    if (!safeValue(val)) return null;
    if (STYLE_PROPS.has(prop) && val) keep.push(`${prop}:${val}`);
  }
  return keep.join(';');
}

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One tag's attributes, cleaned and serialized (` a="v"`…); null when one is refused. */
function attributes(src: string): string | null {
  let out = '';
  const re = /\s*([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')|\s*(\S)/gy;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[4] !== undefined) return null; // a bare word, an unquoted value or stray characters
    const name = m[1]!;
    const raw = decode(m[2] ?? m[3] ?? '');
    if (raw === null || !NAME.test(name)) return null;
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) return null;
    if (lower === 'href' || lower === 'xlink:href') {
      if (!LOCAL_REF.test(raw)) return null;
      out += ` href="${esc(raw)}"`;
      continue;
    }
    if (lower === 'style') {
      const s = cleanStyle(raw);
      if (s === null) return null;
      if (s) out += ` style="${esc(s)}"`;
      continue;
    }
    if (!safeValue(raw)) return null;
    if (ATTRS.has(name)) out += ` ${name}="${esc(raw)}"`;
  }
  return out;
}

/**
 * The body re-serialized from its allowed parts, or null when it is refused (see the file header). Comments are
 * dropped; whitespace between elements is kept.
 */
export function cleanIconBody(body: string): string | null {
  if (typeof body !== 'string' || body.length > MAX_ICON_BODY) return null;
  const stack: string[] = [];
  let out = '';
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf('<', i);
    // only whitespace between elements (zero-width spaces and byte order marks included, which some exports leave)
    const text = body.slice(i, lt < 0 ? body.length : lt).replace(/[\u200b-\u200d\ufeff]/g, '');
    if (text.trim()) return null;
    out += text;
    if (lt < 0) break;
    if (body.startsWith('<!--', lt)) {
      const end = body.indexOf('-->', lt + 4);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    const gt = body.indexOf('>', lt);
    if (gt < 0) return null;
    const tag = body.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      if (stack.pop() !== name) return null;
      out += `</${name}>`;
      continue;
    }
    const m = /^([A-Za-z][\w:.-]*)([\s\S]*?)(\/?)$/.exec(tag);
    if (!m || !ELEMENTS.has(m[1]!)) return null;
    const attrs = attributes(m[2]!);
    if (attrs === null) return null;
    if (m[3]) out += `<${m[1]}${attrs}/>`;
    else {
      stack.push(m[1]!);
      out += `<${m[1]}${attrs}>`;
    }
  }
  return stack.length ? null : out;
}

/** Paint values in a cleaned body other than `none` / `currentColor` / `url(#…)`: a multicolour icon has some. */
export function hasOwnColours(body: string): boolean {
  for (const m of body.matchAll(/(?:fill|stroke|stop-color|flood-color|color)\s*(?:=\s*"|:)\s*([^";]+)/gi)) {
    const v = m[1]!.trim().toLowerCase();
    if (v !== 'none' && v !== 'currentcolor' && v !== 'transparent' && v !== 'inherit' && !v.startsWith('url(')) return true;
  }
  return false;
}
