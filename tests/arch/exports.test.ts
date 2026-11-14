// Architecture guard: the public export surface of every package entry. Any change to what an entry exports shows up
// as a diff of the snapshot file and is reviewed (and recorded in the breaking-change ledger when it removes or renames
// something). Types count: a host that imports `type StorageAdapter` breaks as surely as one that imports a function.
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const ENTRIES = ['adapters', 'core', 'diff', 'editor', 'markdown', 'react', 'studio', 'theme-editor', 'viewer', 'worker-inline'];

/**
 * Names a known downstream app imports (the YouTrack app, `../mermaid-studio-youtrack`). Removing one breaks a real
 * consumer, so it fails here even if the snapshot is updated.
 */
const MUST_KEEP: Record<string, readonly string[]> = {
  viewer: ['configure', 'registerThemes', 'MmdxViewerElement'],
  core: ['BUILTIN_THEMES', 'renderToSvg', 'starterSource'],
  editor: ['DocumentAdapter', 'LoadResult', 'MmdxEditorElement'],
  adapters: ['memoryStorage', 'preloadedStorage', 'StorageAdapter', 'HistoryAdapter', 'VersionInfo'],
  'worker-inline': ['useInlineWorker'],
};

function surface(): Record<string, string[]> {
  const files = ENTRIES.map((e) => join(ROOT, 'src', `${e}.ts`));
  const parsed = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const program = ts.createProgram(files, { ...parsed!.options, noEmit: true });
  const checker = program.getTypeChecker();
  const out: Record<string, string[]> = {};
  ENTRIES.forEach((e, i) => {
    const sf = program.getSourceFile(files[i]!)!;
    const mod = checker.getSymbolAtLocation(sf);
    const names = (mod ? checker.getExportsOfModule(mod) : []).map((s) => {
      const t = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
      return `${s.getName()}${t.flags & ts.SymbolFlags.Value ? '' : ' (type)'}`;
    });
    out[e] = names.sort();
  });
  return out;
}

describe('public export surface', () => {
  const s = surface();

  it('matches the reviewed snapshot', async () => {
    const text = Object.entries(s).map(([e, names]) => `## ${e}\n${names.join('\n')}\n`).join('\n');
    await expect(text).toMatchFileSnapshot('./__snapshots__/exports.txt');
  });

  it('keeps every name a known downstream app imports', () => {
    for (const [e, names] of Object.entries(MUST_KEEP)) {
      const have = new Set(s[e]!.map((n) => n.replace(/ \(type\)$/, '')));
      expect(names.filter((n) => !have.has(n)), `missing from ${e}`).toEqual([]);
    }
  });
});
