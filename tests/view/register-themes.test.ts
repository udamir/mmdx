// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureBuiltinThemes, getShared, registerBuiltinThemes, registerThemes } from '../../src/config.js';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramViewer } from '../../src/elements/viewer.js';

// counts reads of the lazily loaded built-in themes (the chunk `ensureBuiltinThemes` imports)
const extra = vi.hoisted(() => ({ reads: 0 }));
vi.mock('../../src/core/theme/builtin-extra.js', async (orig) => {
  const m = await orig<typeof import('../../src/core/theme/builtin-extra.js')>();
  return {
    get EXTRA_THEMES() {
      extra.reads++;
      return m.EXTRA_THEMES;
    },
  };
});

const themeFile = (f: string): unknown => JSON.parse(readFileSync(resolve(__dirname, '../../themes', f), 'utf8'));

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

describe('registerThemes', () => {
  it('registers bundled theme files into the shared registry, without fetching', async () => {
    const reg = getShared().themes;
    expect(reg.has('github-light')).toBe(false);
    const diagnostics = registerThemes([themeFile('github-light.theme.json'), themeFile('github-dark.theme.json')]);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reg.has('github-light')).toBe(true);
    expect(reg.raw('github-dark')?.appearance).toBe('dark');
  });

  it('registered themes are what every new component lists', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const v = new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', storage: memoryStorage() });
    expect(v.ctx.themes.list().map((t) => t.id)).toContain('github-light');
    v.destroy();
    host.remove();
  });

  it('reports invalid files and keeps the valid ones', () => {
    const d = registerThemes([{ name: 'No id' }, { id: 'ok-theme', name: 'OK', extends: 'default-light' }]);
    expect(d.length).toBeGreaterThan(0);
    expect(getShared().themes.has('ok-theme')).toBe(true);
  });

  it('the built-in themes registered statically make ensureBuiltinThemes a no-op (nothing loads)', async () => {
    const reg = getShared().themes;
    expect(reg.has('default-dark')).toBe(false);
    registerThemes(BUILTIN_THEMES);
    expect(reg.has('default-light') && reg.has('default-dark')).toBe(true);
    const reads = extra.reads;
    await ensureBuiltinThemes();
    await registerBuiltinThemes();
    expect(extra.reads).toBe(reads);
  });
});
