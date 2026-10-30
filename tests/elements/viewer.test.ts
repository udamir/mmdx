// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DiagramViewer, dedent } from '../../src/elements/viewer.js';
import { hasKind, loadKind } from '../../src/elements/kinds.js';

const example = (f: string): string => readFileSync(resolve(__dirname, '../../examples', f), 'utf8');

beforeAll(() => {
  // jsdom: no layout, no ResizeObserver / IntersectionObserver
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

describe('kinds on demand', () => {
  it('loads the parser and renderer of a diagram type before the first render', async () => {
    expect(hasKind('er')).toBe(false);
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('ds-render', r, { once: true }));
    new DiagramViewer(host, { lazy: false, source: 'erDiagram\n  A ||--o{ B : has' });
    expect(host.shadowRoot!.querySelectorAll('.el').length).toBe(0);
    await rendered;
    expect(hasKind('er')).toBe(true);
    expect(host.shadowRoot!.querySelectorAll('.el[data-kind="entity"]').length).toBe(2);
    host.remove();
  });
});

describe('DiagramViewer (kinds loaded)', () => {
  beforeAll(() => Promise.all([loadKind('flowchart'), loadKind('sequence'), loadKind('er')]));


const hosts: HTMLElement[] = [];
const mount = (opts: ConstructorParameters<typeof DiagramViewer>[1]): { host: HTMLElement; v: DiagramViewer } => {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  return { host, v: new DiagramViewer(host, { lazy: false, ...opts }) };
};
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});


  it('renders a flowchart into its shadow root and fires ds-render', () => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    let rendered: unknown = null;
    host.addEventListener('ds-render', (e) => (rendered = (e as CustomEvent).detail));
    new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b' });
    const sr = host.shadowRoot!;
    expect(sr.querySelectorAll('.el[data-kind="node"]').length).toBe(2);
    expect(sr.querySelectorAll('.el[data-kind="edge"]').length).toBe(1);
    expect(rendered).toMatchObject({ type: 'flowchart' });
    expect(sr.querySelector('.root')!.getAttribute('aria-label')).toBe('Flowchart: 2 nodes, 1 connections');
  });

  it('renders every example without errors', () => {
    for (const f of ['simple-flow.mmd', 'docker-deploy-sequence.mmd', 'atom-schema-er.mmd', 'production-microservices.mmd']) {
      const { host, v } = mount({ source: example(f) });
      expect(host.shadowRoot!.querySelectorAll('.el').length).toBeGreaterThan(3);
      expect(v.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('neutralises markup, handlers and javascript: links', () => {
    const { host } = mount({ source: 'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B\n  style A fill:red" onmouseover="alert(2)\n  click B href "javascript:alert(3)"' });
    const html = host.shadowRoot!.innerHTML;
    expect(host.shadowRoot!.querySelector('img')).toBeNull();
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('javascript:');
  });

  it('shows the source for unsupported types with fallback="source"', () => {
    const { host } = mount({ source: 'pie title Pets\n  "Dogs" : 386', fallback: 'source' });
    expect(host.shadowRoot!.querySelector('pre')!.textContent).toContain('pie title Pets');
  });

  it('hides layers given through setLayers()', () => {
    const src = 'flowchart LR\n  a --> b\n%%@ layer L1 {"name":"One"}\n%%@ node b {"layer":"L1"}';
    const { host, v } = mount({ source: src });
    expect(host.shadowRoot!.querySelectorAll('.el[data-kind="node"]').length).toBe(2);
    v.setLayers(['default']);
    // re-render is scheduled; force it through the public option path
    v.set({ layers: ['default'] });
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(host.shadowRoot!.querySelectorAll('.el[data-kind="node"]').length).toBe(1);
      resolve();
    }, 50));
  });

  it('toSvg() returns a standalone document', () => {
    const { v } = mount({ source: 'sequenceDiagram\n  A->>B: hi' });
    const svg = v.toSvg();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('hi');
  });

  it('cleans up on destroy', () => {
    const { host, v } = mount({ source: 'flowchart LR\n  a --> b' });
    v.destroy();
    expect(host.shadowRoot!.querySelector('.root')).toBeNull();
  });

  it('dedents inline sources', () => {
    expect(dedent('\n    flowchart LR\n      a --> b\n  ')).toBe('flowchart LR\n  a --> b');
  });
});
