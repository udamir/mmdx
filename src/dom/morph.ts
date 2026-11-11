// Morph (diff §9.2): three states of one diagram (before → merged → after) shown in one canvas, with animated
// transitions. Items are paired by their change key (`data-ck`); paired items with the same structure tween their
// geometry, path data and colours, changed text flips, an image whose picture changed cross-fades, items only one
// side has fade, and the highlight layers
// cross-fade. `replace` animates the same way from what is shown to new states (another version or pair). With
// reduced motion the switch is instant.
import { ease, TRANSITION_MS as DURATION } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const NUMERIC = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'font-size', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity']);
const LISTS = new Set(['d', 'points', 'transform', 'viewBox']);
const COLORS = new Set(['fill', 'stroke', 'stop-color']);
const LAYERS = ['dx-layer', 'dx-runs'];

type Tween = (t: number) => void;

/**
 * Over this many items a switch is instant: pairing and tweening every item costs more than the frame budget, and
 * copying what is shown for the transition is wasted (the previous review's morph item threshold).
 */
export const MORPH_MAX_ITEMS = 1500;

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

let colorCtx: CanvasRenderingContext2D | null | undefined;
/** Any CSS colour → [r, g, b, a], or null (none, url(#…), invalid, or no canvas). */
function rgba(v: string | null): [number, number, number, number] | null {
  if (!v || v === 'none' || v.startsWith('url(')) return null;
  try {
    colorCtx ??= document.createElement('canvas').getContext('2d');
  } catch {
    colorCtx = null;
  }
  if (!colorCtx) return null;
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = v;
  const s = String(colorCtx.fillStyle);
  if (s.startsWith('#')) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const p = m[1]!.split(',').map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}

/** Tween of one attribute from `a` to `b` (the element starts at `a`); null when they cannot be paired at all. */
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

const attrNames = (a: Element, b: Element): Set<string> =>
  new Set([...a.getAttributeNames(), ...b.getAttributeNames()].filter((n) => n !== 'class' && !n.startsWith('data-')));

interface Flip {
  a: Element;
  b: Element;
  /** An image with another picture: the old one fades out where it was while the new one moves and fades in. */
  image?: boolean;
}

/** Pairs two item subtrees: their tweens, or null when the structure differs (they cross-fade instead). */
function pair(a: Element, b: Element, flips: Flip[]): Tween[] | null {
  if (a.tagName !== b.tagName) return null;
  const out: Tween[] = [];
  if (b.tagName === 'text' && (a.textContent !== b.textContent || a.children.length !== b.children.length)) {
    flips.push({ a, b });
    return out;
  }
  const swap = b.tagName === 'image' && a.getAttribute('href') !== b.getAttribute('href');
  if (swap) flips.push({ a, b, image: true });
  for (const n of attrNames(a, b)) {
    if (swap && n === 'href') continue;
    const va = a.getAttribute(n), vb = b.getAttribute(n);
    const tw = attrTween(b, n, va, vb);
    if (tw === null && va !== vb) return null;
    if (tw === 'discrete') out.push((t) => (t < 0.5 ? (va === null ? b.removeAttribute(n) : b.setAttribute(n, va)) : vb === null ? b.removeAttribute(n) : b.setAttribute(n, vb)));
    else if (tw) out.push(tw);
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

/**
 * An item's pairing key: its change key (the diff), else the key the renderer gives it (`part:kind:id`, read back
 * from its attributes: the editor's and the viewer's items), so a diff and a document picture pair too; the page is
 * one item.
 */
const ITEM = '[data-ck], .el[data-kind][data-id], g.page-layer';
const keyOf = (e: Element): string => {
  const ck = e.getAttribute('data-ck');
  if (ck) return ck;
  if (e.classList.contains('page-layer')) return '~page';
  const part = e.getAttribute('data-part'), raw = `${e.getAttribute('data-kind')}:${e.getAttribute('data-id')}`;
  return part ? `${part}:${raw}` : raw;
};

/** Outermost item groups by pairing key. */
/** At most MORPH_MAX_ITEMS items to pair. */
const small = (root: Element): boolean => root.querySelectorAll(ITEM).length <= MORPH_MAX_ITEMS;

function items(root: Element): Map<string, Element> {
  const m = new Map<string, Element>();
  for (const e of root.querySelectorAll(ITEM)) if (!e.parentElement?.closest(ITEM)) m.set(keyOf(e), e);
  return m;
}

const firstPos = (t: Element): { x: number; y: number } => {
  const s = t.querySelector('tspan[x]');
  return { x: parseFloat(s?.getAttribute('x') ?? '0') || 0, y: parseFloat(s?.getAttribute('y') ?? '0') || 0 };
};

/** Moves every positioned line of a text by (dx, dy), towards its own place or away from it. */
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

export interface MorphState {
  /** `<defs>` children (markers, patterns) the state needs. */
  defs: readonly Element[];
  /** A detached group whose children are the state's layers (page, diagram, highlights). */
  content: Element;
}

export class Morph {
  current: number;
  private running: { finish(): void } | null = null;

  /** `defs` and `content` are the display elements the states are copied into; `reducedMotion` turns the animation off. */
  constructor(
    private readonly defs: Element,
    private readonly content: Element,
    private states: MorphState[],
    start: number,
    private readonly reducedMotion: () => boolean = () => false,
  ) {
    this.current = start;
    this.show(start);
  }

  /**
   * Replaces the states (new data) and shows state `i`. `animate`: items move from what is shown now to their new
   * places, new ones fade in and gone ones fade out (switching to another version); otherwise the switch is instant.
   */
  replace(states: MorphState[], i: number, animate: boolean): void {
    this.running?.finish();
    // what is shown is copied only when it will animate
    const moving = animate && this.content.childElementCount > 0 && this.animates() && small(this.content) && !!states[i] && small(states[i].content);
    const from: MorphState | null = moving ? { defs: [...this.defs.children].map((n) => n.cloneNode(true) as Element), content: this.content.cloneNode(true) as Element } : null;
    this.states = states;
    this.current = i;
    this.show(i);
    if (from) this.running = this.transition(from);
  }

  go(i: number, animate = true): void {
    if (i === this.current || !this.states[i]) return;
    this.running?.finish();
    const from = this.states[this.current]!;
    this.current = i;
    this.show(i);
    if (animate && this.animates() && small(from.content) && small(this.content)) this.running = this.transition(from);
  }

  private animates(): boolean {
    return !this.reducedMotion() && typeof requestAnimationFrame !== 'undefined';
  }

  finish(): void {
    this.running?.finish();
  }

  private show(i: number): void {
    const s = this.states[i];
    if (!s) return;
    this.defs.replaceChildren(...s.defs.map((n) => n.cloneNode(true)));
    this.content.replaceChildren(...[...s.content.childNodes].map((n) => n.cloneNode(true)));
  }

  private transition(from: MorphState): { finish(): void } {
    return transitionFrom(this.defs, this.content, from, () => (this.running = null));
  }

  dispose(): void {
    this.running?.finish();
  }
}

/**
 * Animates `content` (and `defs`), which already show the new picture, from `from` (a copy of what was shown): items
 * both have move, the others fade in or out. The editor runs it when it switches between versions of a document.
 */
export function transitionFrom(defs: Element, content: Element, from: MorphState, onEnd?: () => void): { finish(): void } {
  const root = content;
  const tweens: Tween[] = [];
  const cleanup: (() => void)[] = [];
  const flips: Flip[] = [];
  const fade = (el: Element, a: number, b: number, after?: () => void): void => {
    const s = (el as SVGElement).style;
    tweens.push((t) => (s.opacity = String(lerp(a, b, t))));
    cleanup.push(() => (after ? after() : s.removeProperty('opacity')));
  };
  // markers and patterns the old state needs while it fades out
  const ids = new Set([...defs.querySelectorAll('[id]')].map((e) => e.id));
  for (const d of from.defs) if (d.id && !ids.has(d.id)) defs.append(d.cloneNode(true));

  const A = items(from.content), B = items(root);
  const out = document.createElementNS(NS, 'g');
  const top = root.querySelector(LAYERS.map((c) => `:scope > g.${c}`).join(', '));
  if (top) top.before(out);
  else root.append(out);
  for (const [k, b] of B) {
    const a = A.get(k);
    if (!a) {
      fade(b, 0, 1);
      continue;
    }
    const local: Flip[] = [];
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
    out.append(ghost);
    fade(ghost, 1, 0, () => ghost.remove());
  }
  for (const cls of LAYERS) {
    const a = from.content.querySelector(`:scope > g.${cls}`), b = root.querySelector(`:scope > g.${cls}`);
    if (b) fade(b, a ? 0.2 : 0, 1);
    if (a && a.childElementCount) {
      const ghost = a.cloneNode(true) as Element;
      root.append(ghost);
      fade(ghost, 1, 0, () => ghost.remove());
    }
  }
  // changed text: the old text flips out where it was, the new one flips in, both sliding with the item
  const anims: Animation[] = [];
  for (const { a, b, image } of flips) {
    if (image) {
      const ghost = a.cloneNode(true) as Element;
      b.before(ghost);
      fade(ghost, 1, 0, () => ghost.remove());
      fade(b, 0, 1);
      continue;
    }
    const old = a.cloneNode(true) as Element;
    b.before(old);
    const pa = firstPos(a), pb = firstPos(b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    if (dx || dy) tweens.push(slideText(old, dx, dy, false), slideText(b, -dx, -dy, true));
    if (typeof old.animate === 'function') {
      old.classList.add('mx-flip');
      b.classList.add('mx-flip');
      anims.push(old.animate([{ scale: '1 1', opacity: 1 }, { scale: '1 0', opacity: 0 }], { duration: DURATION / 2, easing: 'ease-in', fill: 'forwards' }));
      anims.push(b.animate([{ scale: '1 0', opacity: 0 }, { scale: '1 1', opacity: 1 }], { duration: DURATION / 2, delay: DURATION / 2, easing: 'ease-out', fill: 'backwards' }));
    } else fade(old, 1, 0);
    cleanup.push(() => {
      old.remove();
      b.classList.remove('mx-flip');
    });
  }

  for (const tw of tweens) tw(0);
  // the clock starts at the first frame (its timestamp, not performance.now(): a frame's time can be earlier)
  let t0 = -1, raf = 0, done = false;
  const end = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const tw of tweens) tw(1);
    for (const x of anims) x.finish();
    for (const c of cleanup) c();
    out.remove();
    onEnd?.();
  };
  const step = (now: number): void => {
    if (t0 < 0) t0 = now;
    const p = Math.min(1, (now - t0) / DURATION);
    const e = ease(p);
    for (const tw of tweens) tw(e);
    if (p < 1) raf = requestAnimationFrame(step);
    else end();
  };
  raf = requestAnimationFrame(step);
  return { finish: end };
}
