import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIELD_DEFS, PAGE_FIELDS, SEQUENCE_PAGE_FIELDS, STYLE_FIELDS, THEME_SECTIONS, fieldKey, metaJsonSchema, themeJsonSchema, type JsonSchema,
} from '../../../src/core/schema/style-fields.js';
import { splitSource } from '../../../src/core/meta/index.js';

const ROOT = join(__dirname, '../../..');

// A small validator for the JSON Schema subset the generators use (no dependency): type, enum, properties,
// additionalProperties, required, items, prefixItems, $ref, allOf, anyOf, minimum, maximum, minLength, maxLength, pattern.
function validate(schema: JsonSchema, value: unknown, root: JsonSchema, path = '$', errors: string[] = []): string[] {
  const s = schema;
  if (typeof s['$ref'] === 'string') {
    const name = (s['$ref'] as string).replace('#/$defs/', '');
    validate((root['$defs'] as Record<string, JsonSchema>)[name]!, value, root, path, errors);
  }
  for (const sub of (s['allOf'] as JsonSchema[] | undefined) ?? []) validate(sub, value, root, path, errors);
  if (s['anyOf'] && !(s['anyOf'] as JsonSchema[]).some((sub) => !validate(sub, value, root, path, []).length)) errors.push(`${path}: no anyOf branch`);
  if (s['enum'] && !(s['enum'] as unknown[]).includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  const t = s['type'];
  if (t) {
    const types = Array.isArray(t) ? t : [t];
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) && types.includes('integer') ? 'integer' : typeof value;
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) errors.push(`${path}: ${actual} is not ${types.join('|')}`);
  }
  if (typeof value === 'number') {
    if (typeof s['minimum'] === 'number' && value < s['minimum']) errors.push(`${path}: below minimum`);
    if (typeof s['maximum'] === 'number' && value > s['maximum']) errors.push(`${path}: above maximum`);
  }
  if (typeof value === 'string') {
    if (typeof s['maxLength'] === 'number' && value.length > s['maxLength']) errors.push(`${path}: too long`);
    if (typeof s['minLength'] === 'number' && value.length < s['minLength']) errors.push(`${path}: too short`);
    if (typeof s['pattern'] === 'string' && !new RegExp(s['pattern']).test(value)) errors.push(`${path}: pattern`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of (s['required'] as string[] | undefined) ?? []) if (!(k in o)) errors.push(`${path}: missing ${k}`);
    const props = (s['properties'] as Record<string, JsonSchema> | undefined) ?? {};
    for (const [k, v] of Object.entries(o)) {
      if (props[k]) validate(props[k], v, root, `${path}.${k}`, errors);
      else if (s['additionalProperties'] && typeof s['additionalProperties'] === 'object') validate(s['additionalProperties'] as JsonSchema, v, root, `${path}.${k}`, errors);
    }
  }
  if (Array.isArray(value)) {
    const pre = (s['prefixItems'] as JsonSchema[] | undefined) ?? [];
    value.forEach((v, i) => {
      const sub = pre[i] ?? (s['items'] as JsonSchema | undefined);
      if (sub) validate(sub, v, root, `${path}[${i}]`, errors);
    });
  }
  return errors;
}

describe('style fields', () => {
  // The field tables drive the inspector, the theme editor and both JSON schemas: any change shows up here for review.
  it('field definitions', () => {
    expect(FIELD_DEFS).toMatchSnapshot();
  });

  it('fields of each item kind', () => {
    expect(STYLE_FIELDS).toMatchSnapshot();
    expect(FIELD_DEFS['wrap']).toEqual({ label: 'Word wrap', type: 'bool' });
    expect(STYLE_FIELDS.node).toContain('wrap');
    expect(STYLE_FIELDS.participant).toContain('wrap');
  });

  it('theme editor sections', () => {
    expect(THEME_SECTIONS).toMatchSnapshot();
    // the theme editor's node and participant fields include word wrap too
    const fieldsOf = (key: string): readonly string[] | undefined => THEME_SECTIONS.flatMap((s) => s.items).find((i) => i.key === key)?.fields;
    expect(fieldsOf('node')).toContain('wrap');
    expect(fieldsOf('participant')).toContain('wrap');
  });

  it('declares the page fields', () => {
    for (const f of ['background', 'border', 'gap', 'rowH', 'mirror', 'blockSpan']) expect(FIELD_DEFS[f], f).toBeDefined();
    expect([...PAGE_FIELDS, ...SEQUENCE_PAGE_FIELDS]).toEqual(['background', 'border', 'gap', 'rowH', 'mirror', 'blockSpan']);
    for (const fields of Object.values(STYLE_FIELDS)) for (const f of fields) expect(FIELD_DEFS[f], f).toBeDefined();
    expect(fieldKey('pshape')).toBe('shape');
    expect(fieldKey('barW')).toBe('w');
  });
});

describe('themeJsonSchema', () => {
  const schema = themeJsonSchema();
  const defs = schema['$defs'] as Record<string, JsonSchema>;
  const props = schema['properties'] as Record<string, JsonSchema>;
  const section = (k: string): Record<string, JsonSchema> => props[k]!['properties'] as Record<string, JsonSchema>;

  it('is a draft 2020-12 schema covering the theme structure', () => {
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    for (const k of ['id', 'name', 'extends', 'appearance', 'schemaVersion', 'palette', 'font', 'canvas', 'flowchart', 'sequence', 'er']) expect(props[k], k).toBeDefined();
    expect(Object.keys(section('flowchart'))).toEqual(expect.arrayContaining(['node', 'nodeShapes', 'nodePresets', 'pagePresets']));
    expect(Object.keys(section('sequence'))).toEqual(expect.arrayContaining(['layout', 'lifeline', 'participantShapes', 'activationPresets', 'pagePresets']));
    expect(Object.keys(section('er'))).toEqual(expect.arrayContaining(['entity', 'relPresets', 'pagePresets']));
    const style = defs['style']!['properties'] as Record<string, JsonSchema>;
    for (const k of ['padX', 'padY', 'minW', 'minH', 'maxW', 'replyDash', 'fill', 'labelOnLine', 'attrColor', 'stack', 'shape']) expect(style[k], k).toBeDefined();
    const page = defs['page']!['properties'] as Record<string, JsonSchema>;
    for (const k of ['background', 'border', 'grid', 'pad', 'routing', 'ratio', 'gap', 'rowH', 'mirror', 'blockSpan']) expect(page[k], k).toBeDefined();
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema); // plain JSON
  });

  it('accepts the shipped themes', () => {
    for (const f of readdirSync(join(ROOT, 'themes')).filter((x) => x.endsWith('.theme.json'))) {
      const theme = JSON.parse(readFileSync(join(ROOT, 'themes', f), 'utf8')) as unknown;
      expect(validate(schema, theme, schema), f).toEqual([]);
    }
  });

  it('rejects wrong types', () => {
    const bad = { id: 'x', appearance: 'grey', flowchart: { node: { fontSize: 'big', routing: 'zigzag' } }, sequence: { layout: { mirror: 3 } } };
    expect(validate(schema, bad, schema).length).toBe(4);
    expect(validate(schema, {}, schema)).toEqual(['$: missing id']);
  });
});

describe('metaJsonSchema', () => {
  const schema = metaJsonSchema();
  it('covers every %%@ collection', () => {
    const props = schema['properties'] as Record<string, JsonSchema>;
    for (const k of ['canvas', 'styles', 'layers', 'groups', 'nodes', 'edges', 'participants', 'messages', 'notes', 'blocks', 'boxes', 'activations', 'entities', 'rels'])
      expect(props[k], k).toBeDefined();
  });

  it('accepts the metadata of every example', () => {
    for (const f of readdirSync(join(ROOT, 'examples')).filter((x) => x.endsWith('.mmd'))) {
      const { doc } = splitSource(readFileSync(join(ROOT, 'examples', f), 'utf8'));
      expect(validate(schema, JSON.parse(JSON.stringify(doc.meta)), schema), f).toEqual([]);
    }
  });

  it('rejects wrong item values', () => {
    const errs = validate(schema, { canvas: { mirror: 'yes' }, nodes: { A: { x: 'left', locked: 1 } }, edges: { e: { points: [[1, 'a']], fromSide: 'top' } } }, schema);
    expect(errs.length).toBe(5);
  });
});
