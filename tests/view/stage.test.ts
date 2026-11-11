// @vitest-environment jsdom
// The kernel's stage controller (A13d): enterStage pushes a stage's scene over the document's and puts the tool
// aside; leaveStage gives both back. History drives it instead of writing the stage, the tool and the scene stack.
import { beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { ViewCore } from '../../src/view/core.js';
import { BaseScene } from '../../src/view/scene.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

class Blank extends BaseScene {
  readonly id = 'blank';
  protected paint(): void {}
}

describe('ViewCore enterStage / leaveStage', () => {
  it('pushes the stage scene and takes the tool; leaving gives both back', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const core = new ViewCore(host, { product: 'viewer', storage: memoryStorage(), css: [], root: { class: 'root', role: 'group' }, areaClass: 'area', canvas: { interaction: 'pan-zoom' } });
    const under = core.scene;
    core.setTool('pen');
    const scene = new Blank();
    core.enterStage('history', { scene, tool: 'hand' });
    expect([core.stage.peek(), core.tool.peek(), core.scene]).toEqual(['history', 'hand', scene]);
    // entered already: only the stage changes
    core.enterStage('version', { scene: new Blank(), tool: 'pointer' });
    expect([core.stage.peek(), core.tool.peek(), core.scene]).toEqual(['version', 'hand', scene]);
    expect(core.leaveStage()).toBe(true);
    expect([core.stage.peek(), core.tool.peek(), core.scene]).toEqual(['document', 'pen', under]);
    expect(core.leaveStage()).toBe(false);
    core.destroy();
  });
});
