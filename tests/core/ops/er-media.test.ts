// @vitest-environment jsdom
// ER icons (T10.3): a table's icon is the leading label token of its alias — added to a bare table with an alias of
// its id (in its first statement, or a new declaration when it lives only in relationships), replaced and removed in
// the alias that Mermaid reads (the first one written), the alias kept once written; emoji and quotes in aliases
// through erQuoted, icon tokens in relationship labels through erLabel — and every output parsed by stock Mermaid
// 12.2 and 11.17.
import { afterAll, describe, expect, it } from 'vitest';
import { parseER } from '../../../src/core/parse/er.js';
import { setEntityIcon, updateEntity, updateRel } from '../../../src/core/ops/er.js';
import { faOnly, type IsIconToken } from '../../../src/core/ops/icon-token.js';
import { stockParse } from '../../helpers/mermaid.js';

/** Every op output of this file, parsed by stock Mermaid at the end. */
const outputs = new Set<string>();
const icon = (code: string, id: string, name: string | null, isIcon?: IsIconToken): string => {
  const r = setEntityIcon(code, parseER(code), id, name, isIcon).code;
  outputs.add(r);
  return r;
};
const errors = (code: string): string[] => parseER(code).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
afterAll(async () => {
  for (const code of outputs) await stockParse(code).catch((e: Error) => Promise.reject(new Error(`${e.message}\n${code}`)));
}, 60_000);

describe('a table icon is a token in its alias', () => {
  it('a bare table gets an alias of its id; the alias stays when the icon goes', () => {
    const src = 'erDiagram\n  CUSTOMER {\n    string id PK\n  }\n';
    const a = icon(src, 'CUSTOMER', 'fa:user');
    expect(a).toBe('erDiagram\n  CUSTOMER["fa:fa-user CUSTOMER"] {\n    string id PK\n  }\n');
    expect(parseER(a).entities.get('CUSTOMER')).toMatchObject({ alias: 'fa:fa-user CUSTOMER', label: 'fa:fa-user CUSTOMER' });
    // replaced in place
    const b = icon(a, 'CUSTOMER', 'tabler:truck', (t) => t.includes(':'));
    expect(b).toBe('erDiagram\n  CUSTOMER["tabler:truck CUSTOMER"] {\n    string id PK\n  }\n');
    // removed: the alias form is kept from then on
    const c = icon(b, 'CUSTOMER', null, (t) => t.includes(':'));
    expect(c).toBe('erDiagram\n  CUSTOMER["CUSTOMER"] {\n    string id PK\n  }\n');
    expect(errors(c)).toEqual([]);
  });

  it('an aliased table: the token goes before its alias text, in the alias Mermaid reads', () => {
    const src = 'erDiagram\n  p["Person"]\n  p["Ignored"] {\n    string name\n  }\n';
    const a = icon(src, 'p', 'fa:user');
    expect(a).toBe('erDiagram\n  p["fa:fa-user Person"]\n  p["Ignored"] {\n    string name\n  }\n');
    expect(parseER(a).entities.get('p')!.label).toBe('fa:fa-user Person');
    expect(icon(a, 'p', 'fa:car')).toBe('erDiagram\n  p["fa:fa-car Person"]\n  p["Ignored"] {\n    string name\n  }\n');
    expect(icon(a, 'p', null)).toBe(src);
  });

  it('an icon that was the whole alias leaves the id', () => {
    const src = 'erDiagram\n  p["fa:fa-user"]\n';
    expect(icon(src, 'p', null)).toBe('erDiagram\n  p["p"]\n');
    // without an icon, removing one changes nothing (no alias is added)
    expect(icon('erDiagram\n  p\n', 'p', null)).toBe('erDiagram\n  p\n');
  });

  it('a table that lives only in relationships gets a declaration with the alias', () => {
    const src = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n';
    const a = icon(src, 'ORDER', 'fa:cart-shopping');
    expect(a).toBe('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER["fa:fa-cart-shopping ORDER"]\n');
    expect(parseER(a).rels).toHaveLength(1);
  });

  it('a table in a subgraph keeps it; ids Mermaid would not read bare stay quoted', () => {
    const src = 'erDiagram\n  subgraph S [Sales]\n    "LINE ITEM" {\n      int qty\n    }\n  end\n';
    const a = icon(src, 'LINE ITEM', 'fa:list');
    expect(a).toBe('erDiagram\n  subgraph S [Sales]\n    "LINE ITEM"["fa:fa-list LINE ITEM"] {\n      int qty\n    }\n  end\n');
    expect(parseER(a).entities.get('LINE ITEM')!.parent).toBe('S');
  });

  it('emoji and quotes in an alias (erQuoted), with an icon before them', () => {
    const a = updateEntity('erDiagram\n  CUSTOMER\n', parseER('erDiagram\n  CUSTOMER\n'), 'CUSTOMER', { label: '🛒 "Best" buyer' }).code;
    outputs.add(a);
    expect(a).toBe('erDiagram\n  CUSTOMER["🛒 #quot;Best#quot; buyer"]\n');
    expect(parseER(a).entities.get('CUSTOMER')!.label).toBe('🛒 "Best" buyer');
    const b = icon(a, 'CUSTOMER', 'fa:user');
    expect(b).toBe('erDiagram\n  CUSTOMER["fa:fa-user 🛒 #quot;Best#quot; buyer"]\n');
    // an emoji id (Mermaid's lexer reads any non-ASCII character as a word character)
    expect(icon('erDiagram\n  🧾 {\n    int n\n  }\n', '🧾', 'fa:receipt')).toBe('erDiagram\n  🧾["fa:fa-receipt 🧾"] {\n    int n\n  }\n');
  });

  it('a word that only looks like a token is not taken for an icon', () => {
    const src = 'erDiagram\n  t["note:urgent Ticket"]\n';
    expect(icon(src, 't', 'fa:bug', faOnly)).toBe('erDiagram\n  t["fa:fa-bug note:urgent Ticket"]\n');
  });
});

describe('icon tokens in relationship labels', () => {
  it('a label with a token is quoted (erLabel); a one-word one stays bare', () => {
    const src = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n';
    const M = parseER(src);
    const a = updateRel(src, M, M.rels[0]!.id, { label: 'fa:fa-cart places' }).code;
    outputs.add(a);
    expect(a).toBe('erDiagram\n  CUSTOMER ||--o{ ORDER : "fa:fa-cart places"\n');
    expect(parseER(a).rels[0]!.label).toBe('fa:fa-cart places');
    const N = parseER(a);
    const b = updateRel(a, N, N.rels[0]!.id, { label: 'places' }).code;
    expect(b).toBe(src);
  });
});
