// Icon references (T04.2): the forms diagrams write (§4.3), label tokens only for registered packs and Font Awesome,
// and the scan of sources and models that decides what SSR and the render worker load.
import { describe, expect, it } from 'vitest';
import { createIconRegistry } from '../../../src/core/icons/index.js';
import { isIconToken, parseIconRef } from '../../../src/core/icons/names.js';
import { iconNamesOf } from '../../../src/core/icons/scan.js';
import type { IconForm } from '../../../src/core/icons/types.js';
import { parse } from '../../../src/core/parse/index.js';

const reg = createIconRegistry([{ name: 'azure', icons: { prefix: 'azure', icons: {} } }, { name: 'mdi', icons: { prefix: 'mdi', icons: {} } }]);

describe('resolution forms (§4.3)', () => {
  const cases: [written: string, form: IconForm, expected: string | null][] = [
    // icon node values: any pack:name
    ['logos:aws-ec2', 'node', 'logos:aws-ec2'],
    ['  tabler:car ', 'node', 'tabler:car'],
    ['fa:fa-car', 'node', 'fa:car'],
    ['unregistered:thing', 'node', 'unregistered:thing'],
    ['no-colon', 'node', null],
    ['a:b c', 'node', null],
    // label tokens: Font Awesome always (Mermaid's regex), other packs when registered
    ['fa:fa-car', 'token', 'fa:car'],
    ['fab:fa-github', 'token', 'fab:github'],
    ['fak:fa-x', 'token', 'fak:x'],
    ['fal:fa-x', 'token', 'fal:x'],
    ['far:fa-bell', 'token', 'far:bell'],
    ['fas:fa-user', 'token', 'fas:user'],
    ['fax:fa-car', 'token', null],
    ['fa:car', 'token', null],
    ['azure:computer-vision', 'token', 'azure:computer-vision'],
    ['tabler:car', 'token', 'tabler:car'],
    ['Note:something', 'token', null],
    ['http:x', 'token', null],
    // mindmap ::icon() classes
    ['fa fa-car', 'class', 'fa:car'],
    ['fa-solid fa-car', 'class', 'fas:car'],
    ['fab fa-github', 'class', 'fab:github'],
    ['fa-brands fa-github', 'class', 'fab:github'],
    ['fa-regular fa-bell fa-2x', 'class', 'far:bell'],
    ['fa fa-fw fa-spin fa-spinner', 'class', 'fa:spinner'],
    ['fa-car', 'class', 'fa:car'],
    ['mdi mdi-skull-outline', 'class', 'mdi:skull-outline'],
    ['logos:aws-ec2', 'class', 'logos:aws-ec2'],
    ['something else', 'class', null],
  ];
  it.each(cases)('%s (%s) → %s', (written, form, expected) => {
    expect(reg.resolve(written, form)).toBe(expected);
  });

  it('syntax alone (parseIconRef) and the registered-pack rule (isIconToken)', () => {
    expect(parseIconRef('azure:x')).toBe('azure:x');
    expect(isIconToken('azure:x', () => false)).toBe(false);
    expect(isIconToken('fa:fa-x', () => false)).toBe(true);
    expect(reg.resolve(42 as unknown as string)).toBeNull();
  });
});

describe('iconNamesOf', () => {
  it('scans source text: tokens of registered packs and Font Awesome, node data, ::icon()', () => {
    const src = [
      'flowchart LR',
      '  A[fa:fa-car Car] --> B[azure:computer-vision Vision]',
      '  C@{ icon: "logos:aws-ec2", form: "square" }',
      "  D@{ icon: 'mdi:database' }",
      '  E[Note: unknown:pack and http://x.com/fa:fa-plane at 10:30]',
      'mindmap',
      '  root::icon(fa fa-book)',
      '  x::icon(mdi mdi-skull-outline)',
    ].join('\n');
    expect(iconNamesOf(src, reg).sort()).toEqual(['azure:computer-vision', 'fa:book', 'fa:car', 'logos:aws-ec2', 'mdi:database', 'mdi:skull-outline']);
  });

  it('scans a parsed model and plain label lists', () => {
    const model = parse('flowchart LR\n  A[fab:fa-github Repo] --> B[tabler:car]\n  C@{ icon: "azure:vm" }');
    expect(iconNamesOf(model, reg).sort()).toEqual(['azure:vm', 'fab:github', 'tabler:car']);
    expect(iconNamesOf(['mdi:car x', 'plain', { icon: 'fa fa-bell' }], reg).sort()).toEqual(['fa:bell', 'mdi:car']);
    const loop: Record<string, unknown> = { label: 'fa:fa-car' };
    loop['self'] = loop;
    expect(iconNamesOf(loop, reg)).toEqual(['fa:car']);
  });
});
