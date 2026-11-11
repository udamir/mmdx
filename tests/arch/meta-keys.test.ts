// META_KEYS coverage (task 4.2, X5): every metadata key the code declares, edits or renders is in the one registry,
// with a value type that fits how it is used — the item and page metadata types, the style properties, the
// Properties / theme editor fields, the kinds' extra style keys and the ER attribute highlights. A key added anywhere
// without its registry entry (so without a cleaner and a class) fails here.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTR_KEYS, META_KEYS, STYLE_KEYS, valueType, type ValueType } from '../../src/core/meta/keys.js';
import { FIELD_DEFS, STYLE_FIELDS, type FieldType } from '../../src/core/schema/style-fields.js';

const ROOT = join(__dirname, '../../src');
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');
const known = (k: string): boolean => Object.hasOwn(META_KEYS, k);

/** The optional members of an interface in a source file (`name?:`), one level deep. */
function membersOf(file: string, name: string): string[] {
  const src = read(file);
  const at = src.indexOf(`export interface ${name}`);
  expect(at, `${name} in ${file}`).toBeGreaterThanOrEqual(0);
  const body = src.slice(src.indexOf('{', at) + 1, src.indexOf('\n}', at));
  return [...body.matchAll(/^ {2}(\w+)\?:/gm)].map((m) => m[1]!);
}

/** The structured keys outside META_KEYS, each cleaned by its own function (meta/sanitize.ts). */
const STRUCTURED = new Set(['attrs']);

/** The editor types a value type may be edited with. */
const EDITORS: Record<FieldType, readonly ValueType[]> = {
  color: ['color'],
  number: ['number'],
  range: ['number'],
  bool: ['bool'],
  toggle: ['bool'],
  select: ['enum', 'text', 'weight', 'dash', 'stack'],
};

describe('META_KEYS coverage', () => {
  it('the item, page and canvas metadata types declare only registry keys', () => {
    const declared = [
      ...membersOf('core/meta/types.ts', 'ItemMeta'),
      ...membersOf('core/meta/types.ts', 'PageSettings'),
      ...membersOf('core/meta/types.ts', 'CanvasMeta'),
    ];
    expect(declared.length).toBeGreaterThan(40);
    expect(declared.filter((k) => !known(k) && !STRUCTURED.has(k))).toEqual([]);
  });

  it('every style property is a registry key', () => {
    const props = membersOf('core/style.ts', 'StyleProps');
    expect(props.length).toBeGreaterThan(30);
    expect(props.filter((k) => !known(k))).toEqual([]);
    // what the renderer picks from an item's metadata is a style property
    for (const k of STYLE_KEYS) expect(props).toContain(k);
  });

  it('every Properties / theme editor field edits a registry key with an editor that fits its value type', () => {
    for (const [name, f] of Object.entries(FIELD_DEFS)) {
      const key = f.key ?? name;
      expect(known(key), `field ${name} → ${key}`).toBe(true);
      expect(EDITORS[f.type], `field ${name}: ${f.type} for a ${valueType(key)}`).toContain(valueType(key));
    }
    for (const [kind, fields] of Object.entries(STYLE_FIELDS)) for (const f of fields) expect(Object.hasOwn(FIELD_DEFS, f), `${kind}: ${f}`).toBe(true);
  });

  it('the kinds\' extra style keys (pickStyle) are registry keys', () => {
    const files = (dir: string): string[] =>
      readdirSync(join(ROOT, dir)).flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? files(`${dir}/${f}`) : f.endsWith('.ts') ? [`${dir}/${f}`] : []));
    const extras = files('core').flatMap((f) => [...read(f).matchAll(/pickStyle\([^)\]]*?,\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1]!.matchAll(/'(\w+)'/g)].map((x) => x[1]!)));
    expect(extras.length).toBeGreaterThan(0);
    expect(extras.filter((k) => !known(k))).toEqual([]);
  });

  it('every key of an ER attribute highlight has a cleaner, and only those', () => {
    expect(Object.keys(ATTR_KEYS).sort()).toEqual(membersOf('core/meta/types.ts', 'AttrHighlight').sort());
  });
});
