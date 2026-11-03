// @vitest-environment jsdom
// Shapes in the editor go to the Mermaid code (T02.6): a shape change writes a bracket or `@{ shape }` and drops the
// metadata key, unless the item's preset draws another shape or Mermaid lacks the shape; shapes 0.1–0.3 files keep in
// metadata move to the code on edit and through the `flow.meta-shape` fix — never on their own.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { codePanelModule } from '../../src/editor/modules/panels/code-panel.js';
import { panesModule } from '../../src/editor/modules/chrome/panes.js';
import { labelSpec } from '../../src/editor/ops/label.js';
import { styleWithShapes } from '../../src/editor/ops/shape.js';
import { setStyle } from '../../src/core/ops/meta-ops.js';

let host: HTMLElement;
let ed: DiagramEditor | null = null;
const mount = (value: string): DiagramEditor => (ed = new DiagramEditor(host, { value, modules: [panesModule, codePanelModule], storage: memoryStorage() }));
const $$ = (sel: string): HTMLElement[] => Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>(sel));

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  ed?.destroy();
  ed = null;
  host.remove();
  vi.useRealTimers();
});

const OLD = 'flowchart LR\n  A["Report"] --> B["User"]\n  C["Decide"]\n%%@ node A {"shape":"document","x":10,"y":10}\n%%@ node B {"shape":"actor"}\n%%@ node C {"shape":"diamond"}';

describe('shapes kept only in metadata', () => {
  test('are a problem with a fix that writes them to the code; mmdx-only shapes stay in metadata', () => {
    const e = mount(OLD);
    const code = e.core.code;
    const item = $$('.problems .pb-item').find((b) => b.textContent?.includes('only in layout data'));
    expect(item?.textContent).toContain('2 shapes');
    // nothing is rewritten until the fix runs
    expect(e.core.code).toBe(code);
    $$('.problems .pb-fix').find((b) => b.textContent?.includes('Write shapes'))!.click();
    expect(e.core.code).toBe('flowchart LR\n  A["Report"] --> B["User"]\n  C{"Decide"}\n  A@{ shape: doc }\n');
    expect(e.core.meta.nodes?.['A']).toEqual({ x: 10, y: 10 });
    expect(e.core.meta.nodes?.['B']).toEqual({ shape: 'actor' });
    expect(e.core.meta.nodes?.['C']).toBeUndefined();
    expect($$('.problems .pb-item').some((b) => b.textContent?.includes('only in layout data'))).toBe(false);
    // one undo step
    e.undo();
    expect(e.core.code).toBe(code);
    expect(e.core.meta.nodes?.['A']?.shape).toBe('document');
  });

  test('an edit of the node moves its shape to the code (relabel)', () => {
    const e = mount(OLD);
    const res = labelSpec(e.core, 'node', 'C')!.apply('Choose');
    expect(res?.code).toBe('flowchart LR\n  A["Report"] --> B["User"]\n  C{"Choose"}');
    expect(e.core.applyCode(res, 'Edit text')).toBe(true);
    expect(e.core.meta.nodes?.['C']).toBeUndefined();
    expect(e.core.meta.nodes?.['A']?.shape).toBe('document');
  });
});

describe('a shape change', () => {
  test('writes the code and no metadata key for a Mermaid shape, in one step with the rest of the patch', () => {
    const e = mount('flowchart LR\n  A["Report"] --> B\n');
    const refs = [{ kind: 'node' as const, id: 'A' }];
    expect(styleWithShapes(e.core, refs, { shape: 'lin-cyl', fill: '#ff0000' }, 'Style', (m) => setStyle(m, refs, { fill: '#ff0000' }).meta)).toBe(true);
    expect(e.core.code.trimEnd()).toBe('flowchart LR\n  A["Report"] --> B\n  A@{ shape: lin-cyl }');
    expect(e.core.meta.nodes?.['A']).toEqual({ fill: '#ff0000' });
    expect(styleWithShapes(e.core, refs, { shape: 'diamond' }, 'Style', (m) => m)).toBe(true);
    expect(e.core.code.trimEnd()).toBe('flowchart LR\n  A["Report"] --> B\n  A@{ shape: diam }');
    e.undo();
    e.undo();
    expect(e.core.code.trimEnd()).toBe('flowchart LR\n  A["Report"] --> B');
  });

  test('keeps a metadata shape where the preset draws another one, and for shapes Mermaid lacks', () => {
    const e = mount('flowchart LR\n  A["Report"]\n%%@ node A {"preset":"db"}');
    const refs = [{ kind: 'node' as const, id: 'A' }];
    styleWithShapes(e.core, refs, { shape: 'diamond' }, 'Style', (m) => m);
    expect(e.core.code).toBe('flowchart LR\n  A{"Report"}');
    expect(e.core.meta.nodes?.['A']).toEqual({ preset: 'db', shape: 'diamond' });
    // Mermaid has no actor: the caller keeps it in metadata as before
    expect(styleWithShapes(e.core, refs, { shape: 'actor' }, 'Style', (m) => m)).toBe(false);
  });

  test('a name Mermaid rejects in node data shows a Fix', () => {
    const e = mount('flowchart LR\n  A@{ shape: lean_r }\n');
    const fix = $$('.problems .pb-fix').find((b) => b.textContent?.includes('lean-r'));
    fix!.click();
    expect(e.core.code.trimEnd()).toBe('flowchart LR\n  A@{ shape: lean-r }');
  });
});
