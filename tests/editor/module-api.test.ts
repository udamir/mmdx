// A host's editor module (A10a): typed with EditorModuleApi, it installs among the editor's own modules and reaches
// the document, the selection and the kernel through it.
// @vitest-environment jsdom
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EditorModule as HostModule, EditorModuleApi } from '../../src/editor/api.js';
import type { EditorOptions } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';

describe('EditorModuleApi', () => {
  it('a host module goes in the modules list and sees the document through the API', () => {
    const seen: string[] = [];
    const mine: HostModule = {
      id: 'host-counter',
      install(scope) {
        expectTypeOf(scope.core).toEqualTypeOf<EditorModuleApi>();
        scope.on('model', () => void seen.push(scope.core.code));
        scope.provide('documentName', () => 'from-host');
      },
    };
    const modules: EditorOptions['modules'] = [...DEFAULT_MODULES, mine];
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b', storage: memoryStorage(), modules });
    e.setSource('flowchart LR\n  a --> c');
    expect(seen.at(-1)).toContain('a --> c');
    expect(e.core.run('documentName')).toBe('from-host');
    e.destroy();
  });
});
