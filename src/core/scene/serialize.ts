// Scene → SVG string. The one place where escaping happens (§7.1, §12).
import type { AttrValue, SceneNode, SvgAttrs } from './types.js';

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
  'data-ds-ssr', 'data-ds-measure', 'data-attr', 'data-participant', 'data-mirror', 'data-end', 'data-foot', 'data-handle',
  // editor overlay handles (connections, bend points, sequence handles)
  'data-side', 'data-dir', 'data-msg', 'data-pid', 'data-edge', 'data-i', 'data-j',
]);

export const isAllowedAttr = (name: string): boolean => ALLOWED_ATTRS.has(name) || DATA_ATTRS.has(name);

/** Attributes whose value is a `url(#id)` reference: only local fragment references are allowed. */
const URL_ATTRS = new Set(['marker-start', 'marker-end', 'marker-mid', 'clip-path', 'fill', 'stroke']);
const LOCAL_URL = /^url\(#[\w-]+\)$/;

/** Formats an attribute value, or returns null if it must be omitted. */
export function attrValue(name: string, v: AttrValue): string | null {
  if (v === undefined || v === null || v === false) return null;
  if (v === true) return name.startsWith('aria-') ? 'true' : '';
  const s = typeof v === 'number' ? fmt(v) : v;
  // `url(...)` only as a local fragment (markers, patterns); never `url(javascript:…)` or remote images
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
    case 'text': {
      const spans = n.lines
        .map((l) => `<tspan x="${fmt(l.x)}" y="${fmt(l.y)}">${l.text ? escText(l.text) : '&#160;'}</tspan>`)
        .join('');
      return `<text${attrsToString(n.attrs)}>${spans}</text>`;
    }
    default:
      return `<${n.t}${attrsToString(n.attrs)}/>`;
  }
}

export const serializeNodes = (ns: readonly SceneNode[]): string => ns.map(serializeNode).join('');
