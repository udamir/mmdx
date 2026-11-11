// @vitest-environment jsdom
// The React wrapper (B15) against a fake React that runs the hooks the way React does for one component instance,
// and the elements' lazy-property upgrade (B16).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { elementProperties } from '../../src/elements/base.js';
import { defineViewer, MmdxViewerElement } from '../../src/elements/viewer.js';
import { defineEditor, MmdxEditorElement } from '../../src/editor/editor.js';
import { createReactWrappers } from '../../src/wrappers/react.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  defineViewer();
  defineEditor();
});
afterEach(() => document.body.replaceChildren());

/** One mounted component: render() re-renders it with new props, as React would (layout effects after each render). */
function fakeReact() {
  let refs: { current: unknown }[] = [], ri = 0;
  let effects: { deps?: unknown[] | undefined; cleanup?: (() => void) | void }[] = [], ei = 0;
  let node: HTMLElement | null = null;
  const pending: (() => void)[] = [];
  const React = {
    forwardRef: (render: (p: Record<string, unknown>, ref: unknown) => unknown) => render,
    useRef: <T,>(v: T | null) => (refs[ri++] ??= { current: v }) as { current: T | null },
    useImperativeHandle: () => {},
    useLayoutEffect(f: () => void | (() => void), deps?: unknown[]) {
      const i = ei++, prev = effects[i];
      if (prev && deps && prev.deps && deps.every((d, j) => Object.is(d, prev.deps![j]))) return;
      pending.push(() => {
        if (typeof prev?.cleanup === 'function') prev.cleanup();
        effects[i] = { deps, cleanup: f() };
      });
    },
    createElement(tag: string, props: Record<string, unknown>) {
      node ??= document.body.appendChild(document.createElement(tag));
      for (const a of Array.from(node.attributes)) if (!(a.name in props)) node.removeAttribute(a.name);
      for (const [k, v] of Object.entries(props)) if (k !== 'ref' && v !== undefined) node.setAttribute(k, String(v));
      (props['ref'] as { current: unknown }).current = node;
      return node;
    },
  };
  const render = (C: unknown, props: Record<string, unknown>): HTMLElement => {
    ri = 0;
    ei = 0;
    (C as (p: Record<string, unknown>, r: unknown) => unknown)(props, null);
    for (const f of pending.splice(0)) f();
    return node!;
  };
  return { React, render, reset: () => ((refs = []), (effects = []), (node = null)) };
}

describe('React wrapper (B15)', () => {
  it('sets the element\'s properties as properties, including new ones (images, uploadImage, fullscreen)', () => {
    const { React, render } = fakeReact();
    const { MmdxEditor } = createReactWrappers(React as never);
    const images = { list: async () => ({ items: [] }) };
    const upload = async () => 'u';
    const el = render(MmdxEditor, { value: 'flowchart LR\n  A', images, uploadImage: upload, fullscreen: true }) as unknown as Record<string, unknown>;
    expect(el['images']).toBe(images);
    expect(el['uploadImage']).toBe(upload);
    expect((el as unknown as HTMLElement).hasAttribute('images')).toBe(false);
    expect((el as unknown as HTMLElement).hasAttribute('upload-image')).toBe(false);
  });

  it('passes standard attributes: className as class, aria- and data- as written', () => {
    const { React, render } = fakeReact();
    const { MmdxViewer } = createReactWrappers(React as never);
    const el = render(MmdxViewer, { className: 'big', 'aria-label': 'Chart', 'data-x': '1', themeDark: 'dark' });
    expect(el.getAttribute('class')).toBe('big');
    expect(el.getAttribute('aria-label')).toBe('Chart');
    expect(el.getAttribute('data-x')).toBe('1');
    expect(el.getAttribute('theme-dark')).toBe('dark');
  });

  it('clears a property that is no longer passed', () => {
    const { React, render } = fakeReact();
    const { MmdxViewer } = createReactWrappers(React as never);
    const layers = ['a'];
    const el = render(MmdxViewer, { layers }) as unknown as Record<string, unknown>;
    expect(el['layers']).toEqual(layers);
    render(MmdxViewer, {});
    expect(el['layers']).toBeUndefined();
  });

  it('keeps one listener per event: a new handler each render is called, never added twice', () => {
    const { React, render } = fakeReact();
    const { MmdxViewer } = createReactWrappers(React as never);
    const calls: string[] = [];
    const el = render(MmdxViewer, { onMmdxRender: () => calls.push('first') });
    render(MmdxViewer, { onMmdxRender: () => calls.push('second') });
    el.dispatchEvent(new CustomEvent('mmdx-render'));
    expect(calls).toEqual(['second']);
  });
});

describe('lazy properties (B16)', () => {
  it('the property list is derived from the element class', () => {
    expect(elementProperties(MmdxViewerElement)).toContain('source');
    expect(elementProperties(MmdxEditorElement)).toEqual(expect.arrayContaining(['value', 'images', 'uploadImage']));
  });

  it('a property set before the element is defined is not lost', () => {
    const tag = 'mmdx-viewer-late';
    const el = document.createElement(tag) as HTMLElement & { source?: string };
    el.source = 'flowchart LR\n  A --> B';
    document.body.append(el);
    defineViewer(tag);
    const up = document.querySelector(tag) as MmdxViewerElement;
    expect(Object.hasOwn(up, 'source')).toBe(false);
    expect(up.source).toBe('flowchart LR\n  A --> B');
  });
});
