// Optional React wrapper (§11.3): typed props and `onMmdx*` event wiring for React ≤ 18 (React 19 passes properties
// and custom events to custom elements natively, so the elements can be used directly there).
// No logic and no React dependency: pass your React in — `const { MmdxViewer, MmdxEditor } = createReactWrappers(React)`.
import { elementProperties } from '../elements/base.js';

interface ReactLike {
  createElement(type: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
  forwardRef<P>(render: (props: P, ref: unknown) => unknown): unknown;
  useRef<T>(v: T | null): { current: T | null };
  useLayoutEffect(f: () => void | (() => void), deps?: unknown[]): void;
  useImperativeHandle(ref: unknown, init: () => unknown, deps?: unknown[]): void;
}

type EventProps = Record<`onMmdx${string}`, ((ev: CustomEvent) => void) | undefined>;

/** React's names for standard attributes. */
const STANDARD_ATTRS: Readonly<Record<string, string>> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex' };

/** onMmdxChange → mmdx-change, onMmdxThemeSaved → mmdx-theme-saved. */
const eventName = (k: string): string => 'mmdx-' + k.slice(6).replace(/[A-Z]/g, (c, i: number) => (i ? '-' : '') + c.toLowerCase());

/**
 * Whether a prop is set as a property: the element's own properties (its class's setters, elements/base.ts — so a new
 * property such as `images` or `uploadImage` needs no change here, B15), and any object or function before the element
 * is defined (an object is never useful as an attribute).
 */
function isProperty(tag: string, k: string, v: unknown): boolean {
  const cls = typeof customElements !== 'undefined' ? customElements.get(tag) : undefined;
  if (cls) return elementProperties(cls).includes(k);
  return (typeof v === 'object' && v !== null) || typeof v === 'function';
}

function wrap(React: ReactLike, tag: string): unknown {
  return React.forwardRef((props: Record<string, unknown>, ref) => {
    const el = React.useRef<HTMLElement>(null);
    /** The properties set by the last render (one removed since is reset). */
    const lastProps = React.useRef<Record<string, unknown>>({});
    /** The current handler of each event; one listener per type calls it, so a new function per render re-adds nothing. */
    const handlers = React.useRef<Map<string, (ev: CustomEvent) => void>>(new Map());
    const attrs: Record<string, unknown> = {};
    const propsToSet: Record<string, unknown> = {};
    const events = new Map<string, (ev: CustomEvent) => void>();
    for (const [k, v] of Object.entries(props)) {
      if (k === 'children') continue;
      if (/^onMmdx[A-Z]/.test(k) && typeof v === 'function') events.set(eventName(k), v as (ev: CustomEvent) => void);
      else if (isProperty(tag, k, v)) propsToSet[k] = v;
      else if (k === 'style' || k.includes('-')) attrs[k] = v;
      else {
        const name = STANDARD_ATTRS[k] ?? k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        attrs[name] = v === true ? '' : v === false ? undefined : v;
      }
    }
    handlers.current!.clear();
    for (const [type, f] of events) handlers.current!.set(type, f);
    React.useImperativeHandle(ref, () => el.current, []);
    React.useLayoutEffect(() => {
      const node = el.current as (HTMLElement & Record<string, unknown>) | null;
      if (!node) return;
      for (const k of Object.keys(lastProps.current!)) if (!(k in propsToSet)) node[k] = undefined;
      for (const [k, v] of Object.entries(propsToSet)) if (node[k] !== v) node[k] = v;
      lastProps.current = propsToSet;
    });
    const types = [...events.keys()].sort().join(' ');
    React.useLayoutEffect(() => {
      const node = el.current;
      if (!node || !types) return;
      const listeners = types.split(' ').map((type) => [type, (ev: Event) => handlers.current!.get(type)?.(ev as CustomEvent)] as const);
      for (const [type, f] of listeners) node.addEventListener(type, f);
      return () => {
        for (const [type, f] of listeners) node.removeEventListener(type, f);
      };
    }, [types]);
    return React.createElement(tag, { ...attrs, ref: el }, props['children']);
  });
}

export interface MmdxReactComponents {
  MmdxViewer: unknown;
  MmdxEditor: unknown;
  MmdxThemeEditor: unknown;
  MmdxStudio: unknown;
  MmdxDiff: unknown;
}

export function createReactWrappers(React: ReactLike): MmdxReactComponents {
  return {
    MmdxViewer: wrap(React, 'mmdx-viewer'),
    MmdxEditor: wrap(React, 'mmdx-editor'),
    MmdxThemeEditor: wrap(React, 'mmdx-theme-editor'),
    MmdxStudio: wrap(React, 'mmdx-studio'),
    MmdxDiff: wrap(React, 'mmdx-diff'),
  };
}

export type { EventProps };
