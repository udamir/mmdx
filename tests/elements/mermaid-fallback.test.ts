// @vitest-environment jsdom
// The stock Mermaid fallback (T10.5): Mermaid is given its theme, look and layout explicitly, since Mermaid 12 changed
// their defaults (redux-color, neo, ELK), so a fallback render matches mmdx's light or dark scheme in Mermaid 10 to 12.
import { describe, expect, it, vi } from 'vitest';
import type { MermaidLike } from '../../src/config.js';

describe('stock Mermaid fallback', () => {
  it('initializes Mermaid with strict security, the scheme\'s theme, the classic look and the dagre layout', async () => {
    vi.resetModules();
    const config = await import('../../src/config.js');
    const cfgs: Record<string, unknown>[] = [];
    const mermaid: MermaidLike = { initialize: (c) => void cfgs.push(c), render: async () => ({ svg: '<svg/>' }) };
    config.configure({ mermaid });
    await config.renderWithMermaid('pie\n "a": 1', false);
    await config.renderWithMermaid('pie\n "a": 1', true);
    expect(cfgs).toEqual([
      { startOnLoad: false, securityLevel: 'strict', theme: 'default', look: 'classic', layout: 'dagre' },
      { startOnLoad: false, securityLevel: 'strict', theme: 'dark', look: 'classic', layout: 'dagre' },
    ]);
  });

  it('a Mermaid configured after a fallback render is the one the next render uses', async () => {
    vi.resetModules();
    const config = await import('../../src/config.js');
    const used: string[] = [];
    const fake = (name: string): MermaidLike => ({ initialize: () => undefined, render: async () => (used.push(name), { svg: '<svg/>' }) });
    config.configure({ mermaid: fake('a') });
    await config.renderWithMermaid('pie\n "a": 1', false);
    config.configure({ mermaid: async () => fake('b') });
    await config.renderWithMermaid('pie\n "a": 1', false);
    expect(used).toEqual(['a', 'b']);
  });
});
