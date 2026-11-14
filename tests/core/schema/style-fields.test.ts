import { describe, expect, it } from 'vitest';
import { FIELD_DEFS, STYLE_FIELDS, THEME_SECTIONS, fieldKey } from '../../../src/core/schema/style-fields.js';

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
    for (const fields of Object.values(STYLE_FIELDS)) for (const f of fields) expect(FIELD_DEFS[f], f).toBeDefined();
    expect(fieldKey('pshape')).toBe('shape');
    expect(fieldKey('barW')).toBe('w');
  });
});
