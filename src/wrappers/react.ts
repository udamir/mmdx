// Optional React wrapper (§11.3): typed props and `onDs*` event wiring for React ≤ 18 (React 19 passes properties
// and custom events to custom elements natively, so the elements can be used directly there).
// No logic and no React dependency: pass your React in — `const { MmdxViewer, MmdxEditor } = createReactWrappers(React)`.

interface ReactLike {
  createElement(type: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
  forwardRef<T, P>(render: (props: P, ref: unknown) => unknown): unknown;
  useRef<T>(v: T | null): { current: T | null };
  useLayoutEffect(f: () => void | (() => void), deps?: unknown[]): void;
  useImperativeHandle(ref: unknown, init: () => unknown, deps?: unknown[]): void;
}

type EventProps = Record<`onDs${string}`, ((ev: CustomEvent) => void) | undefined>;

/** Attribute props are passed through; object props (`source`, `adapter`, `layers`, …) are set as properties. */
const PROPERTY_PROPS = new Set(['source', 'loader', 'layers', 'themeSource', 'storage', 'adapter', 'features', 'panels', 'value', 'readOnly', 'store', 'modules']);

function wrap(React: ReactLike, tag: string): unknown {
  return React.forwardRef((props: Record<string, unknown>, ref) => {
    const el = React.useRef<HTMLElement>(null);
    const attrs: Record<string, unknown> = {};
    const propsToSet: Record<string, unknown> = {};
    const events: [string, (ev: CustomEvent) => void][] = [];
    for (const [k, v] of Object.entries(props)) {
      if (k === 'children') continue;
      if (/^onDs[A-Z]/.test(k) && typeof v === 'function') {
        // onDsChange → ds-change, onDsThemeSaved → ds-theme-saved
        events.push(['ds-' + k.slice(4).replace(/[A-Z]/g, (c, i: number) => (i ? '-' : '') + c.toLowerCase()), v as (ev: CustomEvent) => void]);
      } else if (PROPERTY_PROPS.has(k)) propsToSet[k] = v;
      else attrs[k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = v === true ? '' : v === false ? undefined : v;
    }
    React.useImperativeHandle(ref, () => el.current, []);
    React.useLayoutEffect(() => {
      const node = el.current as (HTMLElement & Record<string, unknown>) | null;
      if (!node) return;
      for (const [k, v] of Object.entries(propsToSet)) if (node[k] !== v) node[k] = v;
    });
    React.useLayoutEffect(() => {
      const node = el.current;
      if (!node) return;
      for (const [type, f] of events) node.addEventListener(type, f as EventListener);
      return () => {
        for (const [type, f] of events) node.removeEventListener(type, f as EventListener);
      };
    });
    return React.createElement(tag, { ...attrs, ref: el }, props['children']);
  });
}

export interface MmdxReactComponents {
  MmdxViewer: unknown;
  MmdxEditor: unknown;
  MmdxThemeEditor: unknown;
  MmdxStudio: unknown;
}

export function createReactWrappers(React: ReactLike): MmdxReactComponents {
  return {
    MmdxViewer: wrap(React, 'mmdx-viewer'),
    MmdxEditor: wrap(React, 'mmdx-editor'),
    MmdxThemeEditor: wrap(React, 'mmdx-theme-editor'),
    MmdxStudio: wrap(React, 'mmdx-studio'),
  };
}

export type { EventProps };
