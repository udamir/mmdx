// Scene → SVG string. The one place where escaping happens (§7.1, §12).
import type { AttrValue, SceneNode, SvgAttrs, TextLine, TextRun } from './types.js';

/** Deterministic number formatting: one decimal, no `-0`, no exponent. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

export const escText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Presentation and geometry attributes the renderers use. Anything else is dropped. */
export const ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  'id', 'class', 'role', 'aria-label', 'aria-hidden', 'tabindex', 'focusable',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'transform',
  'viewBox', 'preserveAspectRatio',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'paint-order', 'vector-effect',
  'marker-start', 'marker-end', 'marker-mid', 'clip-path', 'pointer-events', 'visibility', 'display',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'text-decoration',
  'letter-spacing',
  // <marker> / <pattern>
  'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'patternUnits',
]);

/** `data-*` attributes the renderers set; the editor's hit-testing reads them. */
export const DATA_ATTRS: ReadonlySet<string> = new Set([
  'data-kind', 'data-id', 'data-part', 'data-from', 'data-to', 'data-link', 'data-index', 'data-layer',
  'data-mmdx-ssr', 'data-mmdx-measure', 'data-attr', 'data-participant', 'data-mirror', 'data-end', 'data-foot', 'data-handle',
  // editor overlay handles (connections, bend points, sequence handles)
  'data-side', 'data-dir', 'data-msg', 'data-pid', 'data-edge', 'data-i', 'data-j',
  // diff overlays: the change a highlight belongs to, and the key that pairs an item across the diff views
  'data-key', 'data-ck',
]);

export const isAllowedAttr = (name: string): boolean => ALLOWED_ATTRS.has(name) || DATA_ATTRS.has(name);

/**
 * Attributes whose value is a `url(#id)` reference: only local fragment references are allowed. `href` is not an
 * attribute name at all: `<a>` and `<image>` write it from their branded field.
 */
const URL_ATTRS = new Set(['marker-start', 'marker-end', 'marker-mid', 'clip-path', 'fill', 'stroke']);
const LOCAL_URL = /^url\(#[\w-]+\)$/;

/** Formats an attribute value, or returns null if it must be omitted. */
export function attrValue(name: string, v: AttrValue): string | null {
  if (v === undefined || v === null || v === false) return null;
  if (v === true) return name.startsWith('aria-') ? 'true' : '';
  const s = typeof v === 'number' ? fmt(v) : v;
  // `url(...)` only as a local fragment (markers, patterns, clip paths); never `url(javascript:…)` or a remote
  // resource: images are `<image>` nodes whose href passed the image policy
  if (/url\s*\(/i.test(s) && !(URL_ATTRS.has(name) && LOCAL_URL.test(s.trim()))) return null;
  return s;
}

function attrsToString(attrs: SvgAttrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (!isAllowedAttr(k)) continue;
    const s = attrValue(k, v);
    if (s === null) continue;
    out += ` ${k}="${escAttr(s)}"`;
  }
  return out;
}

export function serializeNode(n: SceneNode): string {
  switch (n.t) {
    case 'g':
    case 'marker':
    case 'pattern':
    case 'clipPath':
      return `<${n.t}${attrsToString(n.attrs)}>${n.children.map(serializeNode).join('')}</${n.t}>`;
    case 'a':
      return `<a href="${escAttr(n.href)}" rel="noopener noreferrer">${n.children.map(serializeNode).join('')}</a>`;
    case 'text':
      return `<text${attrsToString(n.attrs)}>${textSpans(n.lines)}</text>`;
    case 'image':
      return `<image href="${escAttr(n.href)}"${attrsToString(n.attrs)}/>`;
    default:
      return `<${n.t}${attrsToString(n.attrs)}/>`;
  }
}

/** A run's own attributes: the change mark's class token, bold, italic and its place (fixed names and values). */
export function runAttrs(r: TextRun): [string, string][] {
  const out: [string, string][] = [];
  if (r.mark) out.push(['class', r.mark === 'ins' ? 'dx-ins' : 'dx-del']);
  if (r.bold) out.push(['font-weight', '700']);
  if (r.italic) out.push(['font-style', 'italic']);
  if (r.x !== undefined) out.push(['x', fmt(r.x)]);
  return out;
}

/** A run: plain text, or a `<tspan>` with its attributes. Icon runs draw nothing here (their image is beside the text). */
const runSpan = (r: TextRun): string => {
  if (r.icon || !r.text) return '';
  const a = runAttrs(r);
  return a.length ? `<tspan${a.map(([k, v]) => ` ${k}="${v}"`).join('')}>${escText(r.text)}</tspan>` : escText(r.text);
};

/** A line's content: its text, or its runs as styled `<tspan>`s. */
const lineBody = (l: TextLine): string => (l.runs ? l.runs.map(runSpan).join('') : l.text && escText(l.text)) || '&#160;';

/** One `<tspan>` per line. */
const textSpans = (lines: readonly TextLine[]): string =>
  lines.map((l) => `<tspan x="${fmt(l.x)}" y="${fmt(l.y)}"${l.anchor ? ' text-anchor="start"' : ''}>${lineBody(l)}</tspan>`).join('');

export const serializeNodes = (ns: readonly SceneNode[]): string => ns.map(serializeNode).join('');
