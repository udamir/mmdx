// Diagram canvases for the diff prototype: render a source to an SVG element, draw change highlights over it,
// and pan / zoom one or more canvases together.
import { serializeNode, standaloneSvg, type Rendered, type SceneNode } from '../../../src/core.js';
import type { GeometryIndex } from '../../../src/core/render/types.js';
import type { ItemKind, Rect } from '../../../src/core/types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Mark = 'added' | 'removed' | 'content' | 'layout' | 'style';

export type ItemShape = { t: 'rect'; r: Rect } | { t: 'path'; d: string; label: Rect | null; mid: { x: number; y: number } };

export const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** The rendered SVG as a DOM element (the serializer already escaped every value). */
export function toSvgElement(r: Rendered): SVGSVGElement {
  const doc = new DOMParser().parseFromString(standaloneSvg(r), 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg;
}

const box = (b: { x: number; y: number; w: number; h: number }): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });

/** Where an item is drawn, from the renderer's geometry index. */
export function shapeOf(geom: GeometryIndex, kind: ItemKind, id: string): ItemShape | null {
  const rect = (b: { x: number; y: number; w: number; h: number; hidden?: boolean } | undefined): ItemShape | null => (b && !b.hidden ? { t: 'rect', r: box(b) } : null);
  const path = (e: { d: string; label: { x: number; y: number; w: number; h: number } | null; points: [number, number][]; a: { x: number; y: number }; b: { x: number; y: number } } | undefined): ItemShape | null => {
    if (!e) return null;
    const p = e.points[Math.floor(e.points.length / 2)];
    const mid = e.label ? { x: e.label.x, y: e.label.y } : p ? { x: p[0], y: p[1] } : { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    return { t: 'path', d: e.d, label: e.label ? box(e.label) : null, mid };
  };
  switch (geom.type) {
    case 'flowchart':
      return kind === 'node' ? rect(geom.nodes.get(id)) : kind === 'group' ? rect(geom.groups.get(id)) : kind === 'edge' ? path(geom.edges.get(id)) : null;
    case 'er':
      return kind === 'entity' ? rect(geom.entities.get(id)) : kind === 'rel' ? path(geom.rels.get(id)) : null;
    case 'sequence': {
      if (kind === 'participant') return rect(geom.participants.get(id));
      if (kind === 'note') return rect(geom.notes.get(id));
      if (kind === 'block') return rect(geom.blocks.get(id));
      if (kind === 'box') return rect(geom.boxes.get(id));
      if (kind === 'message') {
        const m = geom.messages.get(id);
        if (!m) return null;
        const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
        return { t: 'rect', r: m.self ? { x: x0 - 6, y: m.y - 26, w: x1 - x0 + 40, h: 62 } : { x: x0, y: m.y - 26, w: x1 - x0, h: 36 } };
      }
      return null;
    }
    default:
      return null;
  }
}

export const centreOf = (s: ItemShape): { x: number; y: number } => (s.t === 'rect' ? { x: s.r.x + s.r.w / 2, y: s.r.y + s.r.h / 2 } : s.mid);

/** Scene groups that draw one item (an item can have several parts, e.g. a connector and its label). */
export function sceneOf(r: Rendered, kind: ItemKind, id: string): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (ns: readonly SceneNode[]) => {
    for (const n of ns) {
      if (n.t === 'g' && n.item?.kind === kind && n.item.id === id) out.push(n);
      else if (n.t === 'g' || n.t === 'a') walk(n.children);
    }
  };
  walk(r.result.body);
  return out;
}

/** Copies the given scene nodes (from another render) into `svg` as a ghost layer, with any markers they need. */
export function addGhost(svg: SVGSVGElement, from: Rendered, nodes: SceneNode[], parent: SVGGElement): void {
  if (!nodes.length) return;
  const markup = `<svg xmlns="${SVG_NS}"><g>${nodes.map(serializeNode).join('')}</g></svg>`;
  const g = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement.firstElementChild;
  if (g) parent.append(document.importNode(g, true));
  // the other render's markers (same id prefix: one context renders both versions)
  const defs = svg.querySelector('defs');
  const ids = new Set([...svg.querySelectorAll('defs [id]')].map((e) => e.id));
  const fromDefs = new DOMParser().parseFromString(standaloneSvg(from), 'image/svg+xml').querySelector('defs');
  for (const d of fromDefs ? [...fromDefs.children] : []) if (!ids.has(d.id)) defs?.append(document.importNode(d, true));
}

export interface Highlight {
  key: string;
  shape: ItemShape;
  mark: Mark;
  /** Facets for the badge (`content`, `layout`, `style`), or `+` / `−`. */
  badge: string;
  dashed?: boolean;
}

const BADGE: Record<Mark, string> = { added: '+', removed: '−', content: 'C', layout: 'L', style: 'S' };

/** Draws highlights into a layer on top of the diagram. Returns the layer (re-created on each call). */
export function drawHighlights(svg: SVGSVGElement, hs: readonly Highlight[]): SVGGElement {
  svg.querySelector(':scope > g.dx-layer')?.remove();
  const layer = svgEl('g', { class: 'dx-layer' });
  for (const h of hs) {
    const g = svgEl('g', { class: `dx-hl dx-${h.mark}${h.dashed ? ' dx-dashed' : ''}`, 'data-key': h.key });
    let anchor: { x: number; y: number };
    if (h.shape.t === 'rect') {
      const p = 8, r = h.shape.r;
      g.append(svgEl('rect', { x: r.x - p, y: r.y - p, width: r.w + p * 2, height: r.h + p * 2, rx: 10, class: 'dx-outline' }));
      anchor = { x: r.x + r.w + p, y: r.y - p };
    } else {
      g.append(svgEl('path', { d: h.shape.d, class: 'dx-stroke' }));
      if (h.shape.label) {
        const r = h.shape.label, p = 4;
        g.append(svgEl('rect', { x: r.x - p, y: r.y - p, width: r.w + p * 2, height: r.h + p * 2, rx: 6, class: 'dx-outline' }));
      }
      anchor = h.shape.mid;
    }
    // the badge keeps its screen size at any zoom (SharedView sets --dx-inv = 1 / scale)
    const at = svgEl('g', { transform: `translate(${anchor.x} ${anchor.y})` });
    const b = svgEl('g', { class: 'dx-badge' });
    const text = h.badge || BADGE[h.mark];
    const w = Math.max(18, text.length * 9 + 9);
    b.append(svgEl('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 9 }));
    const t = svgEl('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', y: 0.5 });
    t.textContent = text;
    b.append(t);
    at.append(b);
    g.append(at);
    layer.append(g);
  }
  svg.append(layer);
  return layer;
}

/** Old → new position arrows for moved items (overlay mode). */
export function drawMoves(layer: SVGGElement, moves: { key: string; from: ItemShape; to: ItemShape }[]): void {
  for (const m of moves) {
    const g = svgEl('g', { class: 'dx-move', 'data-key': m.key });
    if (m.from.t === 'rect') {
      const r = m.from.r;
      g.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, class: 'dx-was' }));
    }
    const a = centreOf(m.from), b = centreOf(m.to);
    g.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'dx-arrow' }));
    const ang = Math.atan2(b.y - a.y, b.x - a.x), s = 16;
    const pt = (d: number) => `${b.x - s * Math.cos(ang + d)},${b.y - s * Math.sin(ang + d)}`;
    g.append(svgEl('polygon', { points: `${b.x},${b.y} ${pt(0.45)} ${pt(-0.45)}`, class: 'dx-arrowhead' }));
    layer.prepend(g);
  }
}

/** Dims every item that is not in `keep` (keys `kind:id`). */
export function dimOthers(svg: SVGSVGElement, keep: ReadonlySet<string> | null): void {
  for (const e of svg.querySelectorAll<SVGGElement>('g.el[data-kind][data-id]')) {
    const k = `${e.dataset['kind']}:${e.dataset['id']}`;
    e.classList.toggle('dx-dim', !!keep && !keep.has(k));
  }
}

export const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Pan / zoom shared by several SVGs (side-by-side panes, swipe layers): one centre and scale, each pane its own size. */
export class SharedView {
  private svgs: SVGSVGElement[] = [];
  cx = 0;
  cy = 0;
  k = 1;
  private ro = new ResizeObserver(() => this.apply());
  private ac = new AbortController();
  onChange?: () => void;

  constructor(public bounds: Rect) {}

  attach(svg: SVGSVGElement, host: HTMLElement): void {
    this.svgs.push(svg);
    svg.setAttribute('preserveAspectRatio', 'none');
    this.ro.observe(host);
    const signal = this.ac.signal;
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('.no-pan')) return;
      // no text selection while dragging the canvas
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
    }, { signal });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) host.setPointerCapture?.(e.pointerId);
      drag.moved = true;
      host.classList.add('panning');
      this.cx = drag.cx - dx / this.k;
      this.cy = drag.cy - dy / this.k;
      this.apply();
    }, { signal });
    window.addEventListener('pointerup', () => {
      if (drag?.moved) host.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      drag = null;
      host.classList.remove('panning');
    }, { signal });
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = host.getBoundingClientRect();
        const px = e.clientX - rect.left - rect.width / 2, py = e.clientY - rect.top - rect.height / 2;
        const before = { x: this.cx + px / this.k, y: this.cy + py / this.k };
        const f = Math.exp(-(e.deltaMode ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0025));
        this.k = Math.min(8, Math.max(0.05, this.k * f));
        this.cx = before.x - px / this.k;
        this.cy = before.y - py / this.k;
        this.apply();
      },
      { passive: false, signal },
    );
  }

  private size(): { w: number; h: number } {
    const host = this.svgs[0]?.parentElement;
    return { w: host?.clientWidth || 800, h: host?.clientHeight || 600 };
  }

  fit(r: Rect = this.bounds, max = 1.2, margin = 1.05): void {
    const s = this.size();
    this.k = Math.min(max, s.w / (r.w * margin), s.h / (r.h * margin));
    this.cx = r.x + r.w / 2;
    this.cy = r.y + r.h / 2;
    this.apply();
  }

  /** Brings a rect into view, zooming in only as far as useful. */
  focus(r: Rect): void {
    const s = this.size();
    const k = Math.min(1, s.w / (r.w * 3), s.h / (r.h * 3));
    this.k = Math.max(k, Math.min(this.k, 1));
    this.cx = r.x + r.w / 2;
    this.cy = r.y + r.h / 2;
    this.apply();
  }

  zoom(f: number): void {
    this.k = Math.min(8, Math.max(0.05, this.k * f));
    this.apply();
  }

  apply(): void {
    for (const svg of this.svgs) {
      const host = svg.parentElement;
      const w = host?.clientWidth || 800, h = host?.clientHeight || 600;
      svg.setAttribute('viewBox', `${this.cx - w / 2 / this.k} ${this.cy - h / 2 / this.k} ${w / this.k} ${h / this.k}`);
      svg.style.setProperty('--dx-inv', String(1 / this.k));
    }
    this.onChange?.();
  }

  dispose(): void {
    this.ro.disconnect();
    this.ac.abort();
    this.svgs = [];
  }
}
