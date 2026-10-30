import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { counterpartTheme, linkProblems } from '../../../src/core/theme/pairs.js';
import { ThemeRegistry } from '../../../src/core/theme/registry.js';
import { BASELINE_THEME } from '../../../src/core/theme/baseline.js';
import type { ThemeFile } from '../../../src/core/theme/types.js';

const t = (id: string, appearance: 'light' | 'dark', counterpart?: string): ThemeFile =>
  ({ id, name: id, extends: 'default-light', appearance, ...(counterpart ? { counterpart } : {}) });

describe('counterpartTheme', () => {
  const reg = new ThemeRegistry([
    BASELINE_THEME,
    t('default-dark', 'dark', 'default-light'),
    t('github-light', 'light', 'github-dark'),
    t('github-dark', 'dark', 'github-light'),
    t('rose-pine-dawn', 'light', 'dracula'),
    t('dracula', 'dark', 'rose-pine-dawn'),
    t('lonely', 'light'),
    t('one-way', 'dark'),
    t('points-here', 'light', 'one-way'),
  ]);

  it('keeps a theme whose appearance already matches', () => {
    expect(counterpartTheme(reg, 'github-dark', 'dark')).toBe('github-dark');
    expect(counterpartTheme(reg, 'rose-pine-dawn', 'light')).toBe('rose-pine-dawn');
  });
  it('follows the declared links in both directions', () => {
    expect(counterpartTheme(reg, 'github-light', 'dark')).toBe('github-dark');
    expect(counterpartTheme(reg, 'github-dark', 'light')).toBe('github-light');
    expect(counterpartTheme(reg, 'rose-pine-dawn', 'dark')).toBe('dracula');
    expect(counterpartTheme(reg, 'dracula', 'light')).toBe('rose-pine-dawn');
    expect(counterpartTheme(reg, 'default-light', 'dark')).toBe('default-dark');
    expect(counterpartTheme(reg, 'default-dark', 'light')).toBe('default-light');
  });
  it('uses a theme that links to it when its own link is missing', () => {
    expect(counterpartTheme(reg, 'one-way', 'light')).toBe('points-here');
  });
  it('falls back to the house theme of that appearance', () => {
    expect(counterpartTheme(reg, 'lonely', 'dark')).toBe('default-dark');
  });
  it('treats a missing or unknown theme as baseline', () => {
    expect(counterpartTheme(reg, undefined, 'dark')).toBe('default-dark');
    expect(counterpartTheme(reg, 'nope', 'light')).toBe('default-light');
  });
  it('reports broken links', () => {
    const p = linkProblems(reg);
    expect(p).toContainEqual({ id: 'lonely', problem: 'missing' });
    expect(p).toContainEqual({ id: 'points-here', problem: 'not-mutual', counterpart: 'one-way' });
    expect(p.some((x) => x.id === 'github-light' || x.id === 'dracula' || x.id === 'default-light')).toBe(false);
  });
});

describe('shipped themes', () => {
  it('every theme in themes/index.json is linked to one of the other appearance, and back', () => {
    const dir = resolve(__dirname, '../../../themes');
    const files = (JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as { themes: string[] }).themes;
    const reg = new ThemeRegistry(files.map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as ThemeFile));
    expect(reg.list().length).toBe(8);
    expect(linkProblems(reg)).toEqual([]);
  });
  it('the built-in house pair is linked', () => {
    const r = createDefaultRegistry();
    expect(r.list().map((x) => x.id)).toEqual(['default-light', 'default-dark']);
    expect(counterpartTheme(r, 'default-light', 'dark')).toBe('default-dark');
    expect(linkProblems(r)).toEqual([]);
  });
});
