// The kernel's event and action catalogue (A1, A6): every event a product declares is fired and listened to, and
// every action is provided and run — by the code, or by hosts (the tests and the API docs show those calls). Keys are read from the interfaces
// (ViewEvents, EditorEvents, ViewActions, EditorActions); uses from the code — `fire('x'` / `on('x'`, `provide('x'` /
// `run('x'` / `has('x'`, and the arrays modules loop over (`['a', 'b'] as const`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../src');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(ts|md)$/.test(n) ? [join(d, n)] : []));
const code = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
// actions are also the hosts' API (`core.run('autoLayout')`): the tests and the API docs call some of them
const hostCode = [...walk(join(__dirname, '..')).filter((f) => !f.endsWith('catalogue.test.ts')), ...walk(join(__dirname, '../../docs/api')).filter(() => true)]
  .map((f) => readFileSync(f, 'utf8')).join('\n');

/** The keys of an interface declared in a file. */
function keysOf(file: string, name: string): string[] {
  const s = readFileSync(join(SRC, file), 'utf8');
  const start = s.indexOf(`export interface ${name}`);
  if (start < 0) throw new Error(`${name} not in ${file}`);
  let depth = 0, i = s.indexOf('{', start), end = i;
  for (; end < s.length; end++) {
    if (s[end] === '{') depth++;
    else if (s[end] === '}' && --depth === 0) break;
  }
  const body = s.slice(i + 1, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // top-level members only: `name:` or `name(` at depth 0
  const out: string[] = [];
  let d = 0;
  for (const line of body.split('\n')) {
    if (d === 0) {
      const m = /^\s*(\w+)\??\s*[(:<]/.exec(line);
      if (m) out.push(m[1]!);
    }
    for (const c of line) d += c === '{' || c === '(' ? 1 : c === '}' || c === ')' ? -1 : 0;
  }
  return out;
}

/** Names used in a call `f('name'` for any of the functions, or listed in an `[…] as const` loop. */
const used = (fns: readonly string[], text = code): Set<string> => {
  const out = new Set<string>();
  for (const f of fns) for (const m of text.matchAll(new RegExp(`\\b${f}\\(\\s*'([a-zA-Z]+)'`, 'g'))) out.add(m[1]!);
  for (const m of code.matchAll(/\[((?:\s*'[a-zA-Z]+',?)+)\]\s*as const/g)) for (const k of m[1]!.matchAll(/'([a-zA-Z]+)'/g)) out.add(k[1]!);
  return out;
};

describe('event and action catalogue', () => {
  it('every event is fired and listened to', () => {
    const events = [...keysOf('view/types.ts', 'ViewEvents'), ...keysOf('editor/core.ts', 'EditorEvents')];
    expect(events.length).toBeGreaterThan(8);
    const fired = used(['fire']), heard = used(['on']);
    expect(events.filter((e) => !fired.has(e)), 'declared, never fired').toEqual([]);
    expect(events.filter((e) => !heard.has(e)), 'declared, never listened to').toEqual([]);
  });

  it('every action is provided and asked for', () => {
    const actions = [...keysOf('view/types.ts', 'ViewActions'), ...keysOf('editor/core.ts', 'EditorActions')];
    expect(actions.length).toBeGreaterThan(20);
    const provided = used(['provide', 'provideDefault']), asked = new Set([...used(['run', 'has']), ...used(['run'], hostCode)]);
    expect(actions.filter((a) => !provided.has(a)), 'declared, never provided').toEqual([]);
    expect(actions.filter((a) => !asked.has(a)), 'declared, never run').toEqual([]);
  });
});
