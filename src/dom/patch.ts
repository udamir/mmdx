// Keyed scene → DOM patcher (§7.1). A drag re-renders the scene, but only the elements whose attributes changed are
// touched, instead of resetting innerHTML on every pointer move as the prototype did.
// No user string ever reaches innerHTML: elements are created with createElementNS, attributes go through the same
// allowlist and value checks as the string serializer, text through textContent.
import { attrValue, isAllowedAttr } from '../core/scene/serialize.js';
import { fmt } from '../core/scene/serialize.js';
import type { SceneNode, SvgAttrs, TextLine } from '../core/scene/types.js';

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

interface Bound {
  node: SceneNode;
  key: string;
}

const bound = new WeakMap<Element, Bound>();

const keyOf = (n: SceneNode, i: number): string => (n.key !== undefined ? `k:${n.key}` : `i:${n.t}:${i}`);

/** Replaces the children of `parent` with `next`, reusing elements by key. */
export function patchChildren(parent: Element, next: readonly SceneNode[]): void {
  const existing = new Map<string, Element>();
  for (const c of Array.from(parent.children)) {
    const b = bound.get(c);
    if (b && !existing.has(b.key)) existing.set(b.key, c);
    else c.remove();
  }
  let cursor: Element | null = parent.firstElementChild;
  next.forEach((n, i) => {
    const key = keyOf(n, i);
    let el = existing.get(key);
    if (el && el.localName !== n.t) {
      if (el === cursor) cursor = cursor.nextElementSibling;
      existing.delete(key);
      el.remove();
      el = undefined;
    }
    if (el) {
      existing.delete(key);
      update(el, bound.get(el)!.node, n);
    } else el = create(n);
    bound.set(el, { node: n, key });
    if (el !== cursor) parent.insertBefore(el, cursor);
    else cursor = cursor.nextElementSibling;
  });
  for (const el of existing.values()) el.remove();
}

function create(n: SceneNode): Element {
  const el = document.createElementNS(NS, n.t);
  update(el, null, n);
  return el;
}

const gone = (v: unknown): boolean => v === undefined || v === null || v === false;

function setAttrs(el: Element, prev: SvgAttrs | null, next: SvgAttrs): void {
  // a drag re-renders every item: most values are the same as last time, so compare the raw values first and format
  // only what changed
  if (prev)
    for (const k in prev) {
      const v = next[k];
      if ((gone(v) || attrValue(k, v) === null) && !gone(prev[k]) && isAllowedAttr(k)) el.removeAttribute(k);
    }
  for (const k in next) {
    const v = next[k];
    if (prev && prev[k] === v) continue;
    if (!isAllowedAttr(k)) continue;
    const s = attrValue(k, v);
    if (s === null) {
      el.removeAttribute(k);
      continue;
    }
    if (prev && attrValue(k, prev[k]) === s) continue;
    el.setAttribute(k, s);
  }
}

/** A removed or added run of words (a diff's merged picture): a styled `<tspan>`, fixed class tokens. */
function runSpan(text: string, mark: 'ins' | 'del'): Element {
  const run = document.createElementNS(NS, 'tspan');
  run.setAttribute('class', `dx-${mark}`);
  run.textContent = text;
  return run;
}

function setLines(el: Element, lines: readonly TextLine[]): void {
  const spans = Array.from(el.children);
  lines.forEach((l, i) => {
    let span = spans[i];
    if (!span) {
      span = document.createElementNS(NS, 'tspan');
      el.append(span);
    }
    const x = fmt(l.x), y = fmt(l.y), t = l.text || '\u00a0';
    if (span.getAttribute('x') !== x) span.setAttribute('x', x);
    if (span.getAttribute('y') !== y) span.setAttribute('y', y);
    if (l.runs?.length) span.replaceChildren(...l.runs.map((r) => (r.mark ? runSpan(r.text, r.mark) : r.text)));
    else if (span.textContent !== t || span.childElementCount) span.textContent = t;
  });
  for (let i = lines.length; i < spans.length; i++) spans[i]!.remove();
}

function sameAttrs(a: SvgAttrs, b: SvgAttrs): boolean {
  let n = 0;
  for (const k in a) {
    if (a[k] !== b[k]) return false;
    n++;
  }
  for (const _ in b) n--;
  return n === 0;
}

function sameLines(a: readonly TextLine[], b: readonly TextLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    if (x.text !== y.text || x.x !== y.x || x.y !== y.y || x.runs !== y.runs) return false;
  }
  return true;
}

/**
 * The same picture as last time (plain value compare, no DOM reads): a drag re-renders every item, but only the
 * dragged ones and their connectors change.
 */
function same(a: SceneNode, b: SceneNode): boolean {
  if (a === b) return true;
  if (a.t !== b.t || a.key !== b.key) return false;
  if (a.t === 'a') return a.href === (b as typeof a).href && sameKids(a.children, (b as typeof a).children);
  if (!sameAttrs(a.attrs, (b as typeof a).attrs)) return false;
  if (a.t === 'text') return sameLines(a.lines, (b as typeof a).lines);
  return !('children' in a) || sameKids(a.children, (b as typeof a).children);
}

function sameKids(a: readonly SceneNode[], b: readonly SceneNode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!same(a[i]!, b[i]!)) return false;
  return true;
}

function update(el: Element, prev: SceneNode | null, n: SceneNode): void {
  if (prev && same(prev, n)) return;
  if (n.t === 'a') {
    // href was checked by safeUrl() when the scene was built; set both forms for older engines
    if (el.getAttribute('href') !== n.href) {
      el.setAttribute('href', n.href);
      el.setAttributeNS(XLINK, 'xlink:href', n.href);
    }
    el.setAttribute('rel', 'noopener noreferrer');
    patchChildren(el, n.children);
    return;
  }
  setAttrs(el, prev && prev.t !== 'a' ? prev.attrs : null, n.attrs);
  if (n.t === 'text') setLines(el, n.lines);
  else if (n.t === 'g' || n.t === 'marker' || n.t === 'pattern' || n.t === 'clipPath') patchChildren(el, n.children);
}

/** The scene node an element was last patched from (hit-testing reads `item` from it). */
export const sceneOf = (el: Element): SceneNode | undefined => bound.get(el)?.node;
