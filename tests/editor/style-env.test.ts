// @vitest-environment jsdom
// The editor's one style environment (X17, BUG-009): core.styleEnv() is what the canvas (copy / paste style, lanes) and the panels, toolbars and presets read; it carries the unresolved theme too, so both paths agree.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { currentPreset, themePresetsOf } from '../../src/core/ops/style-env.js';
import { DiagramEditor } from '../../src/editor/editor.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});
const eds: DiagramEditor[] = [];
afterEach(() => {
  for (const e of eds.splice(0)) e.destroy();
  document.body.replaceChildren();
});

describe('core.styleEnv()', () => {
  it('gives the model, the metadata, the theme resolved and unresolved, and the render\'s colour resolver', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  A --> B\n  subgraph G [Lane]\n    C\n  end\n%%@ group G {"preset":"lane"}\n', storage: memoryStorage() });
    eds.push(e);
    await e.whenLoaded();
    const core = e.core, r = core.result;
    const env = core.styleEnv();
    expect(env.model).toBe(core.model);
    expect(env.meta).toBe(core.meta);
    expect(env.theme).toBe(r.theme);
    // the panels' builder (ops/doc.ts) had the unresolved theme and the canvas's did not: both read this one now
    expect(env.rawTheme).toEqual(core.ctx.themes.merged(r.themeId));
    expect(themePresetsOf(env, 'node', true)).toEqual(themePresetsOf({ ...env, rawTheme: core.ctx.themes.merged(r.themeId) }, 'node', true));
    for (const v of ['#ff0000', 'red', 'nonsense']) expect(env.color?.(v)).toBe(r.rctx.color(v));
    // what the canvas asks of it (lanes) and what the panels ask (the preset) agree
    expect(currentPreset(env, { kind: 'group', id: 'G' })).toBe('lane');
    expect(core.isLane('G')).toBe(true);
  });
});
