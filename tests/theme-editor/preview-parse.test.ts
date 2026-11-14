// @vitest-environment jsdom
// The theme editor's preview parses its sample once while the text stays (P19): a theme edit repaints the same
// sample with the new theme, with no parse.
import { afterEach, describe, expect, it, vi } from 'vitest';

const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/core/parse/index.js', async (orig) => {
  const m = await orig<typeof import('../../src/core/parse/index.js')>();
  return { ...m, parse: (code: string) => (parses.n++, m.parse(code)) };
});

const { memoryThemeStore } = await import('../../src/adapters/themes.js');
const { memoryStorage } = await import('../../src/adapters/storage.js');
const { BUILTIN_THEMES } = await import('../../src/core/theme/builtin.js');
const { defineThemeEditor } = await import('../../src/elements/theme-editor.js');
defineThemeEditor();

afterEach(() => document.body.replaceChildren());

describe('theme editor preview', () => {
  it('a palette edit repaints the sample without parsing it again', async () => {
    const el = document.createElement('mmdx-theme-editor') as HTMLElement & { store: unknown; storage: unknown; ready: Promise<void> };
    el.store = memoryThemeStore(BUILTIN_THEMES);
    el.storage = memoryStorage();
    document.body.append(el);
    await el.ready;
    const root = el.shadowRoot!;
    expect(root.querySelector('.vw-svg [data-kind="node"]')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    parses.n = 0;
    const input = root.querySelector<HTMLElement>('.te-dot[data-dirty="palette.lime"]')!.querySelector<HTMLInputElement>('input[type=color]')!;
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 200));
    expect(parses.n).toBe(0);
  });
});
