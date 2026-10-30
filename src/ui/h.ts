// `h()` DOM helper (§4.3). Text goes through text nodes, never innerHTML. Event props start with `on`.
type Child = Node | string | number | false | null | undefined | Child[];
type Props = Record<string, unknown> & {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el: Element | DocumentFragment, c: Child): void {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) {
    for (const x of c) append(el, x);
    return;
  }
  el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
}

function apply(el: Element, props: Props): void {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign((el as HTMLElement).style, v);
    } else if (k === 'dataset') Object.assign((el as HTMLElement).dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && !(el instanceof SVGElement) && k !== 'list' && k !== 'form') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) apply(el, props);
  append(el, children);
  return el;
}

export function s(tag: string, props?: Props | null, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (props) apply(el, props);
  append(el, children);
  return el as SVGElement;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** Inline SVG icon from a fixed, trusted path set (never user input). */
export function icon(d: string, size = 16): SVGElement {
  return s('svg', { viewBox: '0 0 24 24', width: String(size), height: String(size), 'aria-hidden': 'true', class: 'ds-icon' },
    s('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
