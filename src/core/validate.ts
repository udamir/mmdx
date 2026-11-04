// Typed value validation (§12). Every style value from every source — Mermaid `style` / `classDef` / `linkStyle`,
// sequence `rect` / `box` colours, `%%@` metadata, theme JSON, the diagram palette — goes through these before it
// can reach the scene. Anything that is not a well-formed value is dropped (callers report a diagnostic).
// The SVG serializer escapes attribute values as a second line of defence.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const PCT = String.raw`${NUM}%?`;
const FUNC = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${PCT}(?:\s*[,\s]\s*${PCT}){2}(?:\s*[,/]\s*${PCT})?\s*\)$`,
  'i',
);
/** Palette reference: `@name` or `@name~±h,±s,±l` / `@name~=h,±s,±l`. */
export const COLOR_REF = /^@[\w-]+(?:~=?[+-]?[\d.]+,[+-]?[\d.]+,[+-]?[\d.]+)?$/;

/** CSS named colours (level 4). Kept complete so stock Mermaid diagrams keep their colours. */
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon seagreen seashell sienna silver skyblue slateblue slategray ' +
    'slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

export const isNamedColor = (v: string): boolean => NAMED.has(v.toLowerCase());

/** A concrete CSS colour the serializer may emit: hex, rgb()/hsl() with numbers only, a named colour, `none`, `transparent`, `currentColor`. */
export function isColorLiteral(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 64) return false;
  if (HEX.test(s) || FUNC.test(s)) return true;
  const l = s.toLowerCase();
  return l === 'none' || l === 'transparent' || l === 'currentcolor' || NAMED.has(l);
}

/** A colour value as it may be stored (literal or palette reference). */
export function isColorValue(v: unknown): v is string {
  return isColorLiteral(v) || (typeof v === 'string' && COLOR_REF.test(v.trim()));
}

export function cleanColor(v: unknown): string | undefined {
  return isColorValue(v) ? v.trim() : undefined;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Number or numeric string → number, else undefined. */
export function toNumber(v: unknown): number | undefined {
  if (isFiniteNumber(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && new RegExp(`^${NUM}(?:px)?$`, 'i').test(v.trim())) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Dash pattern: numbers separated by spaces or commas (`"6 4"`, `"1.5,4"`). Empty string = solid. */
export function cleanDash(v: unknown): string | undefined {
  if (v === '' || v === 'none' || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const parts = String(v).trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.length > 8) return undefined;
  const nums: number[] = [];
  for (const p of parts) {
    const n = toNumber(p);
    if (n === undefined || n < 0 || n > 1000) return undefined;
    nums.push(n);
  }
  return nums.join(' ');
}

/**
 * Font family list: family names, quoted or bare, comma separated. No url(), no `;`, no braces, no `<`.
 * Theme JSON may hold only family names (§12).
 */
export function cleanFontFamily(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s.length > 300) return undefined;
  const fam = /^\s*(?:"[\w\s.-]+"|'[\w\s.-]+'|[\w-]+(?:\s+[\w-]+)*)\s*$/;
  return s.split(',').every((p) => fam.test(p)) ? s : undefined;
}

// ---- links ------------------------------------------------------------------------------------------------------

export interface LinkPolicy {
  /** Allowed protocols, lower case with the colon. Default `https:`, `http:`, `mailto:`. Relative URLs always pass. */
  protocols: readonly string[];
  /** `target` for opened links; the host decides. */
  target?: '_blank' | '_self' | '_top' | '_parent';
}

export const DEFAULT_LINK_POLICY: LinkPolicy = { protocols: ['https:', 'http:', 'mailto:'], target: '_blank' };

/** What a URL from diagram content is for. */
export type ContentUrlKind = 'image' | 'link';

/**
 * The host's resolver of content URLs (`configure({ resolveUrl })`): the URL to use for one written in a diagram — a
 * relative path made absolute, an attachment's name made its download URL — or null / undefined to use it as written.
 * The result goes through the image or link policy like a written URL; the diagram's code keeps what was written.
 */
export type UrlResolver = (url: string, kind: ContentUrlKind) => string | null | undefined;

/** A content URL through the host's resolver: as written without one, when it declines, or when it throws. */
export function resolveContentUrl(raw: unknown, kind: ContentUrlKind, resolve: UrlResolver | undefined): unknown {
  if (!resolve || typeof raw !== 'string' || !raw.trim()) return raw;
  try {
    const r = resolve(raw.trim(), kind);
    return typeof r === 'string' ? r : raw;
  } catch {
    return raw;
  }
}

declare const SAFE_URL: unique symbol;
/** A URL that passed `safeUrl()` — the only kind the scene accepts for `href`. */
export type SafeUrl = string & { readonly [SAFE_URL]: true };

/**
 * Returns the URL if its protocol is allowed (or it is relative), else null.
 * Control characters and whitespace that browsers strip before the scheme (`java\tscript:`) are rejected outright.
 */
export function safeUrl(raw: unknown, policy: LinkPolicy = DEFAULT_LINK_POLICY): SafeUrl | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(s)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) {
    // relative: path, query or fragment; never protocol-relative (`//evil.com`)
    if (s.startsWith('//')) return null;
    return s as SafeUrl;
  }
  const proto = scheme[1]!.toLowerCase() + ':';
  return policy.protocols.includes(proto) ? (s as SafeUrl) : null;
}

// ---- images -----------------------------------------------------------------------------------------------------

/** MIME types of the `data:` images the content policy can accept. */
export type ImageDataType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml' | 'image/avif';

/**
 * Which image URLs diagram content may use (T03; checked by `checkImageUrl`, core/media/policy.ts). Content references
 * images by URL only (no embedding): `https:` by default, `http:` and `data:` are off until the host enables them.
 * Icons are not content: mmdx builds their `data:` URIs itself (`svgImageUrl`, core/media/svg-url.ts), so this policy
 * never sees them.
 */
export interface ImagePolicy {
  /** Allowed protocols, lower case with the colon. Default `['https:']`; `[]` turns content images off. */
  protocols: readonly ('https:' | 'http:' | 'data:')[];
  /** With `data:` enabled: the accepted MIME types (base64 only). */
  dataTypes: readonly ImageDataType[];
  /** With `data:` enabled: the largest decoded image in bytes (default 256 KiB). */
  maxDataBytes: number;
  /** Host names remote images may come from; `*.example.com` matches its subdomains. Default: any host. */
  hosts?: readonly string[];
  /** Relative URLs (`./img/logo.png`), resolved against the page that shows the diagram. Default off. */
  relative?: boolean;
}

export const DEFAULT_IMAGE_POLICY: ImagePolicy = {
  protocols: ['https:'],
  dataTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
  maxDataBytes: 256 * 1024,
};

declare const SAFE_IMAGE_URL: unique symbol;
/**
 * An image URL the scene may put into `<image href>`: one that passed `checkImageUrl()` (content, core/media/policy.ts),
 * or an icon URI mmdx built itself (`svgImageUrl`, core/media/svg-url.ts). Nothing else creates it.
 */
export type SafeImageUrl = string & { readonly [SAFE_IMAGE_URL]: true };
