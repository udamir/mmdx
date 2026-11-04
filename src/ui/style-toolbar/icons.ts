// The style toolbar's icons: a fixed, trusted set of SVG markup (never built from data) and the small previews of
// stacks, arrow heads, routings and dashes.
import { s } from '../h.js';
import { svgMarkup } from '../toolbar-kit.js';

// Icon bodies: a fixed, trusted set of SVG markup (never built from data).
export const ICON: Readonly<Record<string, string>> = {
  shape: '<rect x="4.5" y="4.5" width="15" height="15" rx="4"/>',
  icon: '<path d="M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.1l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z"/>',
  media: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 15.5l4.5-4.5 4 4 3-3 5 5"/><path d="M15.5 9.5h.01"/>',
  bold: '<path d="M8 5h5a3.2 3.2 0 0 1 0 6.4H8zM8 11.4h6a3.3 3.3 0 0 1 0 6.6H8z" stroke-width="2.2"/><path d="M5 21.5h14" stroke-width="1.6"/>',
  center: '<path d="M5 6h14M8 10h8M5 14h14M8 18h8"/>',
  wrap: '<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4"/><path d="M15 16l-2 2 2 2M4 18h5"/>',
  left: '<path d="M5 6h14M5 10h9M5 14h14M5 18h9"/>',
  right: '<path d="M5 6h14M10 10h9M5 14h14M10 18h9"/>',
  paint: '<path d="M5 4h11a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M17 6.5h2.5v5H11v3"/><rect x="9.5" y="14.5" width="3" height="6" rx="1"/>',
  group: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4"/><rect x="7" y="7" width="5" height="4.5" rx="1"/><rect x="12" y="12.5" width="5" height="4.5" rx="1"/>',
  ungroup: '<rect x="3.5" y="5" width="7" height="6" rx="1.5"/><rect x="13.5" y="13" width="7" height="6" rx="1.5"/><path d="M14 5h6.5v5M3.5 14v5.5H10" stroke-dasharray="2.5 2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6"/>',
  process: '<rect x="10" y="5" width="4" height="14" rx="1"/><path d="M3 7h6M7 5l2 2-2 2M21 17h-6M17 15l-2 2 2 2"/>',
  layers: '<path d="M12 4l8.5 4.2L12 12.4 3.5 8.2z"/><path d="M3.5 12.2L12 16.4l8.5-4.2"/><path d="M3.5 16L12 20.2l8.5-4.2"/>',
  zorder: '<rect x="3" y="3" width="10" height="10" rx="2" stroke-dasharray="2.4 2"/><rect x="11" y="11" width="10" height="10" rx="2"/><path d="M3 18h5M6 16l2 2-2 2"/>',
  alignLeft: '<path d="M5 4v16"/><path d="M9 8h9M9 15.5h5.5" stroke-width="3"/>',
  alignHCenter: '<path d="M12 4v16"/><path d="M7 8h10M9 15.5h6" stroke-width="3"/>',
  alignRight: '<path d="M19 4v16"/><path d="M6 8h9M9.5 15.5h5.5" stroke-width="3"/>',
  alignTop: '<path d="M4 5h16"/><path d="M8 9v9M15.5 9v5.5" stroke-width="3"/>',
  alignVCenter: '<path d="M4 12h16"/><path d="M8 7v10M15.5 9v6" stroke-width="3"/>',
  alignBottom: '<path d="M4 19h16"/><path d="M8 6v9M15.5 9.5v5.5" stroke-width="3"/>',
  distH: '<path d="M4.5 5v14M19.5 5v14"/><path d="M12 8v8" stroke-width="4"/>',
  distV: '<path d="M5 4.5h14M5 19.5h14"/><path d="M8 12h8" stroke-width="4"/>',
  editGroup: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.2"/><path d="M9 15l1-3 5.5-5.5a1.4 1.4 0 0 1 2 2L12 14z"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4.5h4.5"/>',
  presets: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  duplicate: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5M14 11.5v5M11.5 14h5"/>',
  savePreset: '<path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 19z"/><path d="M8.5 4.5v4h6v-4M12 12.5v5M9.5 15h5"/>',
  vtop: '<path d="M5 4.5h14M12 20V9M8 12.5l4-4 4 4"/>',
  vmiddle: '<path d="M5 12h14M12 3v6M9 6.5l3 3 3-3M12 21v-6M9 17.5l3-3 3 3"/>',
  vbottom: '<path d="M5 19.5h14M12 4v11M8 11.5l4 4 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/><path d="M4 4l16 16"/>',
  text: '<path d="M7 17l5-12 5 12M8.8 13h6.4"/>',
  arrows: '<path d="M4 12h15M14 7l5 5-5 5"/>',
  routing: '<path d="M4 18c6 0 4-12 10-12h6"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="6" r="1.6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/>',
  more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>',
  up: '<path d="M7 14l5-5 5 5"/>',
  down: '<path d="M7 10l5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
  italic: '<path d="M10 5h8M6 19h8M14.5 5l-5 14"/>',
  boldGlyph: '<path d="M8 5h5a3.2 3.2 0 0 1 0 6.4H8zM8 11.4h6a3.3 3.3 0 0 1 0 6.6H8z" stroke-width="2.2"/>',
  strike: '<path d="M16.5 7.5c-.6-1.6-2.3-2.7-4.5-2.7-2.6 0-4.4 1.4-4.4 3.4 0 1.5 1 2.4 3 3M4.5 12h15M8 16.3c.6 1.8 2.3 2.9 4.4 2.9 2.7 0 4.6-1.4 4.6-3.6 0-.8-.3-1.5-.8-2"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  underline: '<path d="M7 4.5v6a5 5 0 0 0 10 0v-6M5.5 20h13"/>',
  selection: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 12.5l2 2 4-4.5"/>',
};

const ARROW_HEAD: Readonly<Record<string, string>> = {
  none: '', open: '<path d="M30 6l7 6-7 6" fill="none"/>', filled: '<path d="M29 6l9 6-9 6 2.5-6z" fill="currentColor"/>',
  arrow: '<path d="M29 6.5l9 5.5-9 5.5z" fill="currentColor"/>', circle: '<circle cx="34" cy="12" r="3.6" fill="#fff"/>',
  dot: '<circle cx="34" cy="12" r="3.2" fill="currentColor"/>', cross: '<path d="M31 9l6 6M37 9l-6 6"/>',
};
const ROUTING_PATH: Readonly<Record<string, string>> = { curved: 'M4 20C16 20 14 4 26 4h12', orthogonal: 'M4 20h16V4h18', straight: 'M4 20L38 4' };

export function svgIcon(name: string, extra: readonly SVGElement[] = []): SVGSVGElement {
  const el = svgMarkup({ viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ICON[name] ?? '');
  el.append(...extra);
  return el;
}


/** Stacked boxes, filled with the toolbar's surface (light or dark), outlined in the text colour. */
export function stackPreview(lv: number, size: number): SVGSVGElement {
  const fill = 'fill: var(--float, var(--mmdx-float, #fff))';
  const el = s('svg', { viewBox: '0 0 26 26', width: String(size), height: String(size), stroke: 'currentColor', 'stroke-width': '1.7', 'aria-hidden': 'true' }) as SVGSVGElement;
  for (let k = lv; k >= 1; k--) el.append(s('rect', { x: String(4 + 3 * k), y: String(9 - 3 * k), width: '15', height: '12', rx: '3', style: fill }));
  el.append(s('rect', { x: '4', y: '9', width: '15', height: '12', rx: '3', style: fill }));
  return el;
}

export function arrowPreview(a: string, start = false): SVGSVGElement {
  const attrs: Record<string, string> = { viewBox: '0 0 42 24', width: '42', height: '24', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' };
  if (start) attrs['transform'] = 'scale(-1,1)';
  return svgMarkup(attrs, `<path d="M4 12h${a === 'none' ? 34 : 30}"/>${ARROW_HEAD[a] ?? ''}`);
}

export function routingPreview(r: string): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 42 24', width: '42', height: '24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }) as SVGSVGElement;
  el.append(s('path', { d: ROUTING_PATH[r] ?? '' }));
  return el;
}

/** A connector's animation: a still line (`off`), or dashes with one (`slow`) or two (`fast`) chevrons of flow. */
export function animationPreview(a: string): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 44 12', width: '44', height: '12', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as SVGSVGElement;
  if (a === 'off') {
    el.append(s('path', { d: 'M3 6h38', 'stroke-width': '2.4' }));
    return el;
  }
  el.append(s('path', { d: 'M3 6h22', 'stroke-width': '2.4', 'stroke-dasharray': '4 3' }));
  el.append(s('path', { d: a === 'fast' ? 'M29 2l4 4-4 4M35 2l4 4-4 4' : 'M32 2l4 4-4 4', 'stroke-width': '2' }));
  return el;
}

export function dashPreview(d: string): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 44 12', width: '44', height: '12', 'aria-hidden': 'true' }) as SVGSVGElement;
  const p = s('path', { d: 'M3 6h38', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round' });
  if (d && d !== 'none') p.setAttribute('stroke-dasharray', d.split(' ').map((n) => Number(n) * 1.6).join(' '));
  el.append(p);
  return el;
}
