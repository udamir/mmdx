// Style properties: how each one is edited (Properties panel, theme editor) and which item type has which
// (prototype style-fields.js). The page fields the prototype added to FIELD_DEFS at run time (`background`,
// `border`, `gap`, `rowH`, `mirror`, `blockSpan`) are declared here statically, so the generated JSON Schemas
// (§5.4, §8.3) cover them. `themeJsonSchema()` / `metaJsonSchema()` generate draft 2020-12 schemas for theme files
// and for `%%@` metadata from these definitions plus the shapes of core/theme/types and core/meta/types.
import type { ItemKind } from '../types.js';
import { THEME_SCHEMA_VERSION } from '../theme/types.js';
import { META_VERSION } from '../meta/types.js';

export type FieldType = 'color' | 'number' | 'select' | 'range' | 'bool' | 'toggle';
/** A select option: a value, or [value, label]. */
export type FieldOption = string | readonly [string, string];

export interface FieldDef {
  /** The metadata / theme key when it differs from the field name (`pshape` → `shape`, `barW` → `w`). */
  key?: string;
  label: string;
  type: FieldType;
  step?: number;
  min?: number;
  max?: number;
  options?: readonly FieldOption[];
}

const SIDES: readonly FieldOption[] = [['', 'auto'], ['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']];

export const FIELD_DEFS: Readonly<Record<string, FieldDef>> = {
  fill: { label: 'Fill', type: 'color' }, stroke: { label: 'Border', type: 'color' }, text: { label: 'Text colour', type: 'color' },
  strokeWidth: { label: 'Border width', type: 'number', step: 0.1 }, fontSize: { label: 'Font size', type: 'number' },
  fontWeight: { label: 'Font weight', type: 'select', options: ['400', '600', '700'] },
  radius: { label: 'Corner radius', type: 'number' },
  stack: { label: 'Stacked look', type: 'select', options: [['false', 'single'], ['true', 'stacked'], ['2', 'double']] },
  shape: { label: 'Shape', type: 'select', options: ['rect', 'rounded', 'stadium', 'circle', 'doublecircle', 'diamond', 'hexagon', 'cylinder', 'hcyl', 'subroutine', 'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'asymmetric', 'document', 'card'] },
  pshape: { key: 'shape', label: 'Shape', type: 'select', options: ['box', 'rounded', 'stadium', 'actor', 'database', 'hcyl'] },
  dash: { label: 'Line', type: 'select', options: [['none', 'solid'], ['6 4', 'dashed'], ['1.5 4', 'dotted'], ['10 4 2 4', 'dash-dot'], ['8 5', 'long dash']] },
  color: { label: 'Colour', type: 'color' }, width: { label: 'Width', type: 'number', step: 0.1 },
  arrow: { label: 'Arrow head', type: 'select', options: ['open', 'filled', 'arrow', 'none'] },
  labelColor: { label: 'Label colour', type: 'color' }, labelSize: { label: 'Label size', type: 'number' },
  curve: { label: 'Curvature', type: 'range', min: 0, max: 2, step: 0.05 },
  routing: { label: 'Routing', type: 'select', options: ['curved', 'orthogonal', 'straight'] },
  titleSize: { label: 'Title size', type: 'number' }, titleColor: { label: 'Title colour', type: 'color' },
  titleAlign: { label: 'Title align', type: 'select', options: ['center', 'left'] },
  titleWeight: { label: 'Title weight', type: 'select', options: ['400', '600', '700'] },
  pad: { label: 'Padding', type: 'number' }, padTop: { label: 'Top padding', type: 'number' },
  align: { label: 'Text align', type: 'select', options: ['left', 'center', 'right'] },
  valign: { label: 'Vertical', type: 'select', options: ['top', 'middle', 'bottom'] },
  wrap: { label: 'Word wrap', type: 'bool' },
  labelOnLine: { label: 'Label on line', type: 'bool' }, showTag: { label: 'Show block tag', type: 'bool' },
  attrSize: { label: 'Attr size', type: 'number' }, attrColor: { label: 'Attr colour', type: 'color' },
  mode: { label: 'Layout', type: 'select', options: ['compact', 'table'] },
  showTypes: { label: 'Show types', type: 'bool' }, showComments: { label: 'Show comments', type: 'bool' },
  pkUnderline: { label: 'Underline PK', type: 'bool' }, maxW: { label: 'Max width', type: 'number' },
  labelAt: { label: 'Label position', type: 'range', min: 0.02, max: 0.98, step: 0.01 },
  fromSide: { label: 'From side', type: 'select', options: SIDES },
  toSide: { label: 'To side', type: 'select', options: SIDES },
  fromAt: { label: 'From offset', type: 'range', min: 0.02, max: 0.98, step: 0.01 },
  toAt: { label: 'To offset', type: 'range', min: 0.02, max: 0.98, step: 0.01 },
  x: { label: 'X', type: 'number' }, y: { label: 'Y', type: 'number' }, w: { label: 'Width', type: 'number' }, h: { label: 'Height', type: 'number' },
  dy: { label: 'Extra space above', type: 'number' },
  barW: { key: 'w', label: 'Bar width', type: 'number' },
  // page (Properties → Page; the prototype added these at run time)
  background: { label: 'Background', type: 'color' }, border: { label: 'Border', type: 'color' },
  gap: { label: 'Participant gap', type: 'number' }, rowH: { label: 'Row height', type: 'number' },
  mirror: { label: 'Participants at the bottom', type: 'toggle' }, blockSpan: { label: 'Block width', type: 'select', options: ['full', 'touched'] },
};

/** The page fields of the Properties panel (all diagram types / sequence only). */
export const PAGE_FIELDS: readonly string[] = ['background', 'border'];
export const SEQUENCE_PAGE_FIELDS: readonly string[] = ['gap', 'rowH', 'mirror', 'blockSpan'];

export const STYLE_FIELDS: Readonly<Record<ItemKind, readonly string[]>> = {
  node: ['fill', 'stroke', 'text', 'strokeWidth', 'fontSize', 'fontWeight', 'align', 'valign', 'wrap', 'radius', 'stack', 'shape', 'dash'],
  group: ['fill', 'stroke', 'strokeWidth', 'radius', 'stack', 'titleSize', 'titleColor', 'titleWeight', 'titleAlign', 'pad', 'padTop'],
  edge: ['color', 'width', 'dash', 'arrow', 'labelColor', 'labelSize', 'curve'],
  participant: ['fill', 'stroke', 'text', 'strokeWidth', 'fontSize', 'wrap', 'radius', 'stack', 'pshape'],
  message: ['color', 'width', 'dash', 'arrow', 'labelSize', 'labelColor', 'labelOnLine'],
  block: ['fill', 'stroke', 'strokeWidth', 'labelSize', 'labelColor', 'showTag', 'radius'],
  note: ['fill', 'stroke', 'strokeWidth', 'dash', 'text', 'fontSize'],
  entity: ['fill', 'stroke', 'text', 'strokeWidth', 'radius', 'stack', 'titleSize', 'attrSize', 'attrColor', 'mode', 'showTypes', 'showComments', 'pkUnderline', 'maxW'],
  rel: ['color', 'width', 'dash', 'labelSize', 'labelColor', 'curve', 'routing', 'labelAt'],
  activation: ['fill', 'stroke', 'strokeWidth', 'dash', 'barW'],
  box: ['fill', 'stroke', 'strokeWidth', 'dash', 'text', 'labelSize'],
};

export interface ThemeSectionItem {
  key: string;
  label: string;
  fields: readonly string[];
  presets?: string;
}

/** What the theme editor shows, per diagram type: base style of each item type (+ its named presets). */
export const THEME_SECTIONS: readonly { type: 'flowchart' | 'sequence' | 'er'; title: string; items: readonly ThemeSectionItem[] }[] = [
  { type: 'flowchart', title: 'Flowchart', items: [
    { key: 'node', label: 'Node', fields: STYLE_FIELDS.node, presets: 'nodePresets' },
    { key: 'group', label: 'Group (subgraph)', fields: STYLE_FIELDS.group, presets: 'groupPresets' },
    { key: 'edge', label: 'Connector', fields: STYLE_FIELDS.edge, presets: 'edgePresets' },
  ] },
  { type: 'sequence', title: 'Sequence', items: [
    { key: 'participant', label: 'Participant', fields: STYLE_FIELDS.participant, presets: 'participantPresets' },
    { key: 'message', label: 'Message', fields: STYLE_FIELDS.message, presets: 'messagePresets' },
    { key: 'note', label: 'Note', fields: STYLE_FIELDS.note, presets: 'notePresets' },
    { key: 'block', label: 'Block (loop / alt / opt)', fields: STYLE_FIELDS.block, presets: 'blockPresets' },
    { key: 'box', label: 'Box (participant group)', fields: STYLE_FIELDS.box, presets: 'boxPresets' },
    { key: 'lifeline', label: 'Lifeline', fields: ['color', 'width', 'dash'] },
    { key: 'activation', label: 'Activation (process)', fields: STYLE_FIELDS.activation, presets: 'activationPresets' },
  ] },
  { type: 'er', title: 'ER diagram', items: [
    { key: 'entity', label: 'Table', fields: STYLE_FIELDS.entity, presets: 'entityPresets' },
    { key: 'rel', label: 'Relationship', fields: STYLE_FIELDS.rel, presets: 'relPresets' },
  ] },
];

/** The stored key of a field (`pshape` → `shape`). */
export const fieldKey = (name: string): string => FIELD_DEFS[name]?.key ?? name;
export const optionValue = (o: FieldOption): string => (typeof o === 'string' ? o : o[0]);

// ---- JSON Schema generation ---------------------------------------------------------------------------------------

export type JsonSchema = { [k: string]: unknown };

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ref = (name: string): JsonSchema => ({ $ref: `#/$defs/${name}` });
const recordOf = (s: JsonSchema, description?: string): JsonSchema => ({ type: 'object', additionalProperties: s, ...(description ? { description } : {}) });

// Style keys that are not editable fields: theme-only sizing and line keys, font family, opacities, arrow ends.
const EXTRA_KEYS: Readonly<Record<string, JsonSchema>> = {
  padX: { type: 'number', minimum: 0, description: 'Horizontal text padding (theme only)' },
  padY: { type: 'number', minimum: 0, description: 'Vertical text padding (theme only)' },
  minW: { type: 'number', minimum: 0, description: 'Minimum width (theme only)' },
  minH: { type: 'number', minimum: 0, description: 'Minimum height (theme only)' },
  replyDash: { $ref: '#/$defs/dash', description: 'Dash pattern of reply messages (theme only)' },
  fontFamily: { type: 'string', maxLength: 300, description: 'Font family names, comma separated (no URLs)' },
  fillOpacity: { type: 'number', minimum: 0, maximum: 1 },
  strokeOpacity: { type: 'number', minimum: 0, maximum: 1 },
  startArrow: { $ref: '#/$defs/arrow' },
  endArrow: { $ref: '#/$defs/arrow' },
};

// Fields whose stored values are not their editor's option strings.
const VALUE_OVERRIDES: Readonly<Record<string, JsonSchema>> = {
  stack: { anyOf: [{ type: 'boolean' }, { type: 'number', minimum: 0, maximum: 3 }], description: 'false / true (one copy) / 2 / 3 copies behind the shape' },
  fontWeight: { type: ['number', 'string'], description: 'normal, bold or 100…900' },
  titleWeight: { type: ['number', 'string'], description: 'normal, bold or 100…900' },
  dash: ref('dash'),
  arrow: ref('arrow'),
  // shapes are open-ended: themes may define styles for shapes a newer renderer knows
  shape: { type: 'string', maxLength: 64 },
  mirror: { type: 'boolean' },
};

function fieldSchema(name: string, def: FieldDef): JsonSchema {
  const over = VALUE_OVERRIDES[fieldKey(name)];
  if (over) return { ...over, title: def.label };
  switch (def.type) {
    case 'color':
      return { ...ref('color'), title: def.label };
    case 'number':
    case 'range':
      return { type: 'number', title: def.label, ...(def.min !== undefined ? { minimum: def.min } : {}), ...(def.max !== undefined ? { maximum: def.max } : {}) };
    case 'bool':
    case 'toggle':
      return { type: 'boolean', title: def.label };
    case 'select':
      return { enum: (def.options ?? []).map(optionValue).filter((v) => v !== ''), title: def.label };
  }
}

/** Every style key → its value schema (editable fields first, then the theme-only / internal ones). */
function styleProperties(): Record<string, JsonSchema> {
  const props: Record<string, JsonSchema> = {};
  const styleNames = new Set(Object.values(STYLE_FIELDS).flat().concat(['labelAt', 'routing', 'curve', 'maxW']));
  for (const name of styleNames) {
    const def = FIELD_DEFS[name];
    if (!def) continue;
    const key = fieldKey(name);
    if (key === 'w') continue; // activation bar width: geometry, listed with w below
    props[key] ??= fieldSchema(name, def);
  }
  for (const [k, s] of Object.entries(EXTRA_KEYS)) props[k] ??= s;
  props['w'] ??= { type: 'number', minimum: 0, title: 'Width' };
  props['h'] ??= { type: 'number', minimum: 0, title: 'Height' };
  return props;
}

const COMMON_DEFS = (): Record<string, JsonSchema> => ({
  color: {
    type: ['string', 'null'],
    maxLength: 64,
    description: 'A colour: #hex, rgb()/hsl(), a CSS colour name, none, transparent, or a palette reference @name / @name~±h,±s,±l (null: not set, e.g. a label colour that follows the line)',
  },
  dash: { type: 'string', maxLength: 64, description: 'Dash pattern: numbers separated by spaces or commas; "" or "none" = solid' },
  arrow: { enum: ['none', 'open', 'filled', 'arrow', 'circle', 'dot', 'cross', 'default'] },
  style: { type: 'object', properties: styleProperties(), additionalProperties: true },
  preset: {
    allOf: [ref('style')],
    properties: {
      for: { type: 'string', description: 'The shape a node / participant preset belongs to (when it sets no shape)' },
      label: { type: 'string', description: 'Display name' },
    },
  },
  page: {
    type: 'object',
    properties: {
      background: fieldSchema('background', FIELD_DEFS['background']!),
      border: fieldSchema('border', FIELD_DEFS['border']!),
      grid: { ...ref('color'), title: 'Grid colour' },
      pad: { type: 'number', minimum: 0, title: 'Page padding' },
      routing: fieldSchema('routing', FIELD_DEFS['routing']!),
      ratio: { type: 'string', pattern: '^(free|[\\d.]+:[\\d.]+)$', title: 'Proportions (W:H)' },
      gap: fieldSchema('gap', FIELD_DEFS['gap']!),
      rowH: fieldSchema('rowH', FIELD_DEFS['rowH']!),
      mirror: fieldSchema('mirror', FIELD_DEFS['mirror']!),
      blockSpan: fieldSchema('blockSpan', FIELD_DEFS['blockSpan']!),
      margin: { type: 'number', minimum: 0, title: 'Sequence margin' },
    },
    additionalProperties: true,
  },
  pagePresets: recordOf({ allOf: [ref('page')], properties: { label: { type: 'string' } } }, 'Page presets of this diagram type, chosen with %%@ canvas {"preset": …}'),
});

/** JSON Schema (draft 2020-12) of a theme file (`*.theme.json`, §8.3). */
export function themeJsonSchema(): JsonSchema {
  const style = ref('style');
  const presets = recordOf(ref('preset'));
  const shapes = recordOf(style, 'Per-shape default style');
  return {
    $schema: DRAFT,
    $id: 'https://diagram-studio.dev/schema/theme.json',
    title: 'Diagram Studio theme',
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      extends: { type: 'string', description: 'Id of the theme this one builds on (depth ≤ 5)' },
      appearance: { enum: ['light', 'dark'] },
      schemaVersion: { type: 'integer', minimum: 1, maximum: THEME_SCHEMA_VERSION, default: THEME_SCHEMA_VERSION },
      palette: recordOf(ref('color'), 'Named colours that @name references resolve to (colour literals)'),
      font: { type: 'string', maxLength: 300, description: 'Font family names' },
      canvas: ref('page'),
      flowchart: {
        type: 'object',
        properties: { node: style, nodeShapes: shapes, nodePresets: presets, group: style, groupPresets: presets, edge: style, edgePresets: presets, pagePresets: ref('pagePresets') },
        additionalProperties: true,
      },
      sequence: {
        type: 'object',
        properties: {
          participant: style, participantShapes: shapes, participantPresets: presets, lifeline: style, activation: style, activationPresets: presets,
          message: style, messagePresets: presets, note: style, notePresets: presets, block: style, blockPresets: presets, box: style, boxPresets: presets,
          layout: {
            type: 'object',
            properties: {
              gap: { type: 'number' }, top: { type: 'number' }, rowH: { type: 'number' }, lineH: { type: 'number' },
              blockGapTop: { type: 'number' }, blockGapBottom: { type: 'number' }, blockPad: { type: 'number' },
              mirror: { type: 'boolean' }, margin: { type: 'number' }, blockSpan: { enum: ['full', 'touched'] },
            },
            additionalProperties: true,
          },
          pagePresets: ref('pagePresets'),
        },
        additionalProperties: true,
      },
      er: { type: 'object', properties: { entity: style, entityPresets: presets, rel: style, relPresets: presets, pagePresets: ref('pagePresets') }, additionalProperties: true },
    },
    additionalProperties: true,
    $defs: COMMON_DEFS(),
  };
}

const num = (title?: string): JsonSchema => ({ type: 'number', ...(title ? { title } : {}) });
const SIDE: JsonSchema = { enum: ['t', 'b', 'l', 'r'] };
const LINE_GEOM = (): Record<string, JsonSchema> => ({
  routing: fieldSchema('routing', FIELD_DEFS['routing']!), fromSide: SIDE, toSide: SIDE, fromAt: num(), toAt: num(), labelAt: num(),
  labelDx: num(), labelDy: num(),
  points: { type: 'array', items: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], minItems: 2, maxItems: 2 }, description: 'Bend points [[x,y],…]' },
});

/**
 * JSON Schema (draft 2020-12) of the `%%@` metadata (A.10), as one object: `canvas`, `styles` (local presets per
 * kind and the diagram palette), `layers` and one record per item collection, keyed by item id. Each `%%@` line is
 * one entry: `%%@ <kind> <id> {json}` ↔ `<collection>.<id>`, `%%@ style.<kind> <name> {json}` ↔ `styles.<kind>.<name>`.
 */
export function metaJsonSchema(): JsonSchema {
  const defs = COMMON_DEFS();
  const item = (extra: Record<string, JsonSchema> = {}): JsonSchema => ({
    allOf: [ref('style')],
    properties: {
      preset: { type: 'string' }, layer: { type: 'string' }, locked: { type: 'boolean' }, link: { type: 'string', maxLength: 2048 },
      ...extra,
    },
  });
  const box = { x: num('Centre x'), y: num('Centre y'), w: num('Width'), h: num('Height') };
  const items: Record<string, JsonSchema> = {
    node: item(box),
    group: item({ ...box, titleSize: num(), titleColor: ref('color') }),
    edge: item({ ...LINE_GEOM(), startArrow: ref('arrow'), endArrow: ref('arrow') }),
    rel: item(LINE_GEOM()),
    participant: item({ x: num(), w: num(), h: num() }),
    message: item({ dy: num('Extra space above'), labelOnLine: { type: 'boolean' } }),
    note: item({ dy: num('Extra space above') }),
    block: item({ dy: num('Extra space above'), showTag: { type: 'boolean' } }),
    box: item(),
    activation: item(),
    entity: item({
      ...box,
      attrs: recordOf({ type: 'object', properties: { color: ref('color'), bold: { type: 'boolean' }, underline: { type: 'boolean' } }, additionalProperties: true }, 'Per-attribute highlights (`__title` = the table name)'),
    }),
  };
  for (const [k, s] of Object.entries(items)) defs[`${k}Meta`] = s;
  const coll = (kind: string, description: string): JsonSchema => recordOf(ref(`${kind}Meta`), description);
  return {
    $schema: DRAFT,
    $id: 'https://diagram-studio.dev/schema/meta.json',
    title: 'Diagram Studio %%@ metadata',
    type: 'object',
    properties: {
      canvas: {
        allOf: [ref('page')],
        properties: {
          v: { type: 'integer', minimum: 1, default: META_VERSION, description: 'Metadata format version' },
          theme: { type: 'string' }, preset: { type: 'string', description: 'Page preset name' },
          w: num(), h: num(), x: num(), y: num(),
        },
      },
      styles: {
        type: 'object',
        properties: { palette: recordOf({ type: 'object', required: ['color'], properties: { color: ref('color') }, additionalProperties: true }, "The diagram's own palette") },
        additionalProperties: recordOf(ref('preset'), 'Local presets of one item kind (`_base` = the diagram-wide base style)'),
      },
      layers: recordOf({ type: 'object', properties: { name: { type: 'string' }, hidden: { type: 'boolean' } }, additionalProperties: true }),
      groups: coll('group', 'Flowchart subgraphs'),
      nodes: coll('node', 'Flowchart nodes'),
      edges: coll('edge', 'Flowchart edges, keyed `from->to` or `from->to#n`'),
      participants: coll('participant', 'Sequence participants'),
      messages: coll('message', 'Messages (positional ids m1, m2…)'),
      notes: coll('note', 'Notes (n1, n2…)'),
      blocks: coll('block', 'Blocks (b1, b2…)'),
      boxes: coll('box', 'Boxes (box1, box2…)'),
      activations: coll('activation', 'Processes (`<participant>:<n>`)'),
      entities: coll('entity', 'ER tables'),
      rels: coll('rel', 'ER relationships'),
    },
    additionalProperties: true,
    $defs: defs,
  };
}
