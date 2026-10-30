// Morph view: three states of one diagram (before → merged → after) and animated transitions between them.
// Items are paired by a canonical key (`data-ck`); paired items with the same structure tween their geometry
// and colours, changed text flips, and items only one side has fade in or out.
import type { SharedView } from './canvas.js';

const DURATION = 900;
const NUMERIC = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'font-size', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity']);
const LISTS = new Set(['d', 'points', 'transform', 'viewBox']);
const COLORS = new Set(['fill', 'stroke', 'stop-color']);

type Tween = (t: number) => void;

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

let colorCtx: CanvasRenderingContext2D | null | undefined;
/** Any CSS colour → [r, g, b, a], or null (none, url(#…), invalid). */
function rgba(v: string | null): [number, number, number, number] | null {
  if (!v || v === 'none' || v.startsWith('url(')) return null;
  colorCtx ??= document.createElement('canvas').getContext('2d');
  if (!colorCtx) return null;
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = v;
  const s = colorCtx.fillStyle;
  if (s.startsWith('#')) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const p = m[1]!.split(',').map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}

/** Tween of one attribute from `a` to `b` (the element starts at `a`), or null when they cannot be interpolated. */
function attrTween(el: Element, name: string, a: string | null, b: string | null): Tween | null | 'discrete' {
  if (a === b) return null;
  if (a !== null && b !== null && NUMERIC.has(name)) {
    const x = parseFloat(a), y = parseFloat(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return (t) => el.setAttribute(name, String(lerp(x, y, t)));
  }
  if (a !== null && b !== null && LISTS.has(name)) {
    if (a.replace(NUM, '#') !== b.replace(NUM, '#')) return name === 'd' || name === 'points' ? null : 'discrete';
    const xs = a.match(NUM)!.map(Number), ys = b.match(NUM)!.map(Number);
    const parts = b.split(NUM);
    return (t) => el.setAttribute(name, parts.map((p, i) => p + (i < ys.length ? String(lerp(xs[i]!, ys[i]!, t)) : '')).join(''));
  }
  if (COLORS.has(name)) {
    const x = rgba(a), y = rgba(b);
    if (x && y) return (t) => el.setAttribute(name, `rgba(${x.map((v, i) => (i < 3 ? Math.round(lerp(v, y[i]!, t)) : lerp(v, y[i]!, t))).join(',')})`);
  }
  return 'discrete';
}

function attrNames(a: Element, b: Element): Set<string> {
  return new Set([...a.getAttributeNames(), ...b.getAttributeNames()].filter((n) => n !== 'class' && !n.startsWith('data-')));
}

/** Pairs two item subtrees. Returns the tweens, or null when their structure differs (then they cross-fade). */
function pair(a: Element, b: Element, flips: { a: Element; b: Element }[]): Tween[] | null {
  if (a.tagName !== b.tagName) return null;
  const out: Tween[] = [];
  if (b.tagName === 'text') {
    const la = [...a.children], lb = [...b.children];
    if (a.textContent !== b.textContent || la.length !== lb.length) {
      flips.push({ a, b });
      return out;
    }
  }
  for (const n of attrNames(a, b)) {
    const tw = attrTween(b, n, a.getAttribute(n), b.getAttribute(n));
    if (tw === null && a.getAttribute(n) !== b.getAttribute(n)) return null;
    if (tw === 'discrete') {
      const va = a.getAttribute(n), vb = b.getAttribute(n);
      out.push((t) => (t < 0.5 ? (va === null ? b.removeAttribute(n) : b.setAttribute(n, va)) : vb === null ? b.removeAttribute(n) : b.setAttribute(n, vb)));
    } else if (tw) out.push(tw);
  }
  const ca = [...a.children], cb = [...b.children];
  if (ca.length !== cb.length) return null;
  for (let i = 0; i < ca.length; i++) {
    const r = pair(ca[i]!, cb[i]!, flips);
    if (!r) return null;
    out.push(...r);
  }
  return out;
}

/** Outermost item groups by canonical key. */
function items(root: Element): Map<string, Element> {
  const m = new Map<string, Element>();
  for (const e of root.querySelectorAll('[data-ck]')) if (!e.parentElement?.closest('[data-ck]')) m.set(e.getAttribute('data-ck')!, e);
  return m;
}

const firstPos = (t: Element): { x: number; y: number } => {
  const s = t.querySelector('tspan[x]');
  return { x: parseFloat(s?.getAttribute('x') ?? '0') || 0, y: parseFloat(s?.getAttribute('y') ?? '0') || 0 };
};

/** Moves every positioned line of a text element by (dx, dy) × (1 − t) → a tween towards its own place. */
function slideText(t: Element, dx: number, dy: number, towards: boolean): Tween {
  const lines = [...t.querySelectorAll('tspan[x]')].map((s) => ({ s, x: parseFloat(s.getAttribute('x')!), y: parseFloat(s.getAttribute('y')!) }));
  return (k) => {
    const f = towards ? 1 - k : k;
    for (const l of lines) {
      l.s.setAttribute('x', String(l.x + dx * f));
      l.s.setAttribute('y', String(l.y + dy * f));
    }
  };
}

export const STATE_NAMES = ['Before', 'Merged', 'After'] as const;

export class Morph {
  readonly svg: SVGSVGElement;
  current: number;
  private running: { finish(): void } | null = null;

  constructor(host: HTMLElement, private readonly states: SVGSVGElement[], view: SharedView, start = 1) {
    this.current = start;
    this.svg = states[start]!.cloneNode(false) as SVGSVGElement;
    this.svg.append(...[...states[start]!.childNodes].map((n) => n.cloneNode(true)));
    host.append(this.svg);
    view.attach(this.svg, host);
  }

  go(i: number, animate = true): void {
    if (i === this.current || !this.states[i]) return;
    this.running?.finish();
    const from = this.states[this.current]!, to = this.states[i]!;
    this.current = i;
    const keepViewBox = this.svg.getAttribute('viewBox');
    const inv = this.svg.style.getPropertyValue('--dx-inv');
    this.svg.replaceChildren(...[...to.childNodes].map((n) => n.cloneNode(true)));
    if (keepViewBox) this.svg.setAttribute('viewBox', keepViewBox);
    if (inv) this.svg.style.setProperty('--dx-inv', inv);
    if (animate) this.running = this.transition(from);
  }

  private transition(fromSvg: SVGSVGElement): { finish(): void } {
    const svg = this.svg;
    const tweens: Tween[] = [];
    const cleanup: (() => void)[] = [];
    const flips: { a: Element; b: Element }[] = [];
    const fade = (el: Element, from: number, to: number, after?: () => void) => {
      const s = (el as SVGElement).style;
      tweens.push((t) => (s.opacity = String(lerp(from, to, t))));
      cleanup.push(() => (after ? after() : s.removeProperty('opacity')));
    };
    // markers and patterns the old version needs
    const defs = svg.querySelector('defs');
    const ids = new Set([...svg.querySelectorAll('defs [id]')].map((e) => e.id));
    for (const d of fromSvg.querySelectorAll('defs > [id]')) if (!ids.has(d.id)) defs?.append(d.cloneNode(true));

    const A = items(fromSvg), B = items(svg);
    const outLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const top = svg.querySelector(':scope > g.dx-runs, :scope > g.dx-layer');
    if (top) top.before(outLayer);
    else svg.append(outLayer);
    for (const [k, b] of B) {
      const a = A.get(k);
      if (!a) {
        fade(b, 0, 1);
        continue;
      }
      const local: { a: Element; b: Element }[] = [];
      const tw = pair(a, b, local);
      if (tw) {
        tweens.push(...tw);
        flips.push(...local);
      } else {
        const ghost = a.cloneNode(true) as Element;
        b.before(ghost);
        fade(ghost, 1, 0, () => ghost.remove());
        fade(b, 0, 1);
      }
    }
    for (const [k, a] of A) {
      if (B.has(k)) continue;
      const ghost = a.cloneNode(true) as Element;
      outLayer.append(ghost);
      fade(ghost, 1, 0, () => ghost.remove());
    }
    // annotation layers (highlights, highlighter runs) cross-fade with their state
    for (const cls of ['dx-layer', 'dx-runs']) {
      const a = fromSvg.querySelector(`:scope > g.${cls}`), b = svg.querySelector(`:scope > g.${cls}`);
      if (b) fade(b, a ? 0.2 : 0, 1);
      if (a) {
        const ghost = a.cloneNode(true) as Element;
        svg.append(ghost);
        fade(ghost, 1, 0, () => ghost.remove());
      }
    }
    // changed text: the old text flips out where it was, the new one flips in, both sliding with the item
    const anims: Animation[] = [];
    for (const { a, b } of flips) {
      const old = a.cloneNode(true) as Element;
      b.before(old);
      const pa = firstPos(a), pb = firstPos(b);
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      if (dx || dy) {
        tweens.push(slideText(old, dx, dy, false), slideText(b, -dx, -dy, true));
      }
      old.classList.add('mx-flip');
      b.classList.add('mx-flip');
      anims.push(old.animate([{ scale: '1 1', opacity: 1 }, { scale: '1 0', opacity: 0 }], { duration: DURATION / 2, easing: 'ease-in', fill: 'forwards' }));
      anims.push(b.animate([{ scale: '1 0', opacity: 0 }, { scale: '1 1', opacity: 1 }], { duration: DURATION / 2, delay: DURATION / 2, easing: 'ease-out', fill: 'backwards' }));
      cleanup.push(() => {
        old.remove();
        b.classList.remove('mx-flip');
      });
    }

    for (const tw of tweens) tw(0);
    const t0 = performance.now();
    let raf = 0, done = false;
    const end = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      for (const tw of tweens) tw(1);
      for (const a of anims) a.finish();
      for (const c of cleanup) c();
      outLayer.remove();
      this.running = null;
    };
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const e = ease(p);
      for (const tw of tweens) tw(e);
      if (p < 1) raf = requestAnimationFrame(step);
      else end();
    };
    raf = requestAnimationFrame(step);
    return { finish: end };
  }

  dispose(): void {
    this.running?.finish();
  }
}
