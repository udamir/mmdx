// Style properties: how each one is edited (Properties panel, theme editor) and which item type has which
// (prototype style-fields.js). The page fields the prototype added to FIELD_DEFS at run time (`background`,
// `border`, `gap`, `rowH`, `mirror`, `blockSpan`) are declared here statically, so the generated JSON Schemas
// (§5.4, §8.3) cover them. `themeJsonSchema()` / `metaJsonSchema()` generate draft 2020-12 schemas for theme files
// and for `%%@` metadata from these definitions plus the shapes of core/theme/types and core/meta/types.
import { DIAGRAM_TYPES } from '../kinds/info.js';
import { PARTICIPANT_SHAPES, pickerShapes } from '../shapes/catalog.js';
import type { DiagramType, ItemKind } from '../types.js';
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
  // the shape catalogue's lists (values are ids; a flowchart writes Mermaid's names to the code)
  shape: { label: 'Shape', type: 'select', options: pickerShapes().map((d) => [d.id, d.title ?? d.name] as const) },
  pshape: { key: 'shape', label: 'Shape', type: 'select', options: PARTICIPANT_SHAPES.map(([n]) => n) },
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
  mindLayout: { label: 'Layout', type: 'select', options: [['both', 'both sides'], ['right', 'to the right'], ['down', 'top down']] },
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

/** State diagram states: no stack or wrap toggle (labels wrap at 200, as Mermaid's). */
const STATE_NODE_FIELDS: readonly string[] = ['fill', 'stroke', 'text', 'strokeWidth', 'fontSize', 'fontWeight', 'radius', 'shape', 'dash'];

/** Mindmap nodes: no stack, wrap or alignment (labels wrap at Mermaid's maxNodeWidth). */
const MIND_NODE_FIELDS: readonly string[] = ['fill', 'stroke', 'text', 'strokeWidth', 'fontSize', 'fontWeight', 'radius', 'shape'];

export interface ThemeSectionItem {
  key: string;
  label: string;
  fields: readonly string[];
  presets?: string;
  /** The preview sample when it is not the item key's (ui/item-preview: `mm-node`…). */
  preview?: string;
}

/** A section of the theme editor: its title, item types, and its page presets' own fields. */
export interface ThemeSection {
  title: string;
  items: readonly ThemeSectionItem[];
  /** Page presets have a routing (not sequence: messages are straight). */
  routing: boolean;
  /** The type's own page layout fields in a page preset (sequence: gap, rowH, mirror). */
  pageFields?: readonly string[];
}

const SECTION_UI: Readonly<Record<DiagramType, ThemeSection>> = {
  flowchart: { title: 'Flowchart', routing: true, items: [
    { key: 'node', label: 'Node', fields: STYLE_FIELDS.node, presets: 'nodePresets' },
    { key: 'group', label: 'Group (subgraph)', fields: STYLE_FIELDS.group, presets: 'groupPresets' },
    { key: 'edge', label: 'Connector', fields: STYLE_FIELDS.edge, presets: 'edgePresets' },
  ] },
  sequence: { title: 'Sequence', routing: false, pageFields: ['gap', 'rowH', 'mirror'], items: [
    { key: 'participant', label: 'Participant', fields: STYLE_FIELDS.participant, presets: 'participantPresets' },
    { key: 'message', label: 'Message', fields: STYLE_FIELDS.message, presets: 'messagePresets' },
    { key: 'note', label: 'Note', fields: STYLE_FIELDS.note, presets: 'notePresets' },
    { key: 'block', label: 'Block (loop / alt / opt)', fields: STYLE_FIELDS.block, presets: 'blockPresets' },
    { key: 'box', label: 'Box (participant group)', fields: STYLE_FIELDS.box, presets: 'boxPresets' },
    { key: 'lifeline', label: 'Lifeline', fields: ['color', 'width', 'dash'] },
    { key: 'activation', label: 'Activation (process)', fields: STYLE_FIELDS.activation, presets: 'activationPresets' },
  ] },
  er: { title: 'ER diagram', routing: true, items: [
    { key: 'entity', label: 'Table', fields: STYLE_FIELDS.entity, presets: 'entityPresets' },
    { key: 'rel', label: 'Relationship', fields: STYLE_FIELDS.rel, presets: 'relPresets' },
  ] },
  mindmap: { title: 'Mindmap', routing: false, pageFields: ['mindLayout'], items: [
    { key: 'root', label: 'Root', fields: MIND_NODE_FIELDS, preview: 'mm-root' },
    { key: 'node', label: 'Node', fields: MIND_NODE_FIELDS, presets: 'nodePresets', preview: 'mm-node' },
    { key: 'branch', label: 'Branch', fields: ['width'], preview: 'mm-branch' },
    // the section colours as presets of an empty base: one tile per section
    { key: 'section', label: 'Sections (branch colours)', fields: ['fill', 'text', 'color'], presets: 'sections', preview: 'mm-section' },
  ] },
  state: { title: 'State diagram', routing: true, items: [
    { key: 'node', label: 'State', fields: STATE_NODE_FIELDS, presets: 'nodePresets', preview: 'st-state' },
    { key: 'start', label: 'Start', fields: ['fill', 'w'], preview: 'st-start' },
    { key: 'end', label: 'End', fields: ['fill', 'stroke', 'strokeWidth', 'w'], preview: 'st-end' },
    { key: 'choice', label: 'Choice', fields: ['fill', 'stroke', 'strokeWidth', 'w'], preview: 'st-choice' },
    { key: 'fork', label: 'Fork / join', fields: ['fill', 'w', 'h'], preview: 'st-fork' },
    { key: 'composite', label: 'Composite state', fields: STYLE_FIELDS.group, presets: 'compositePresets', preview: 'st-composite' },
    // the "Coloured composites" page preset's colours as presets of an empty base: one tile per colour
    { key: 'compositeColor', label: 'Composite colours', fields: ['fill', 'stroke'], presets: 'compositeColors', preview: 'st-composite-color' },
    { key: 'note', label: 'Note', fields: [...STYLE_FIELDS.note, 'color'], presets: 'notePresets', preview: 'st-note' },
    { key: 'transition', label: 'Transition', fields: STYLE_FIELDS.edge, presets: 'transitionPresets', preview: 'st-transition' },
  ] },
};

/** What the theme editor shows, per diagram type (in UI order): base style of each item type (+ its named presets). */
export const THEME_SECTIONS: readonly (ThemeSection & { type: DiagramType })[] = DIAGRAM_TYPES.map((type) => ({ type, ...SECTION_UI[type] }));

/** The theme editor section of a diagram type. */
export const themeSection = (type: DiagramType): ThemeSection => SECTION_UI[type];

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
      blockTags: { type: 'boolean', title: 'Sequence blocks show their kind (loop, alt…) in the corner' },
      margin: { type: 'number', minimum: 0, title: 'Sequence margin' },
      mindLayout: { enum: ['both', 'right', 'down'], title: 'Mindmap layout' },
      composites: { enum: ['single', 'palette'], title: 'State diagram composites: one style, or a colour each' },
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
      mindmap: {
        type: 'object',
        properties: {
          root: style, node: style, nodeShapes: shapes, nodePresets: presets, branch: style,
          sections: recordOf(style, 'Section colours "0"…"11": fill and text of shaped nodes, colour of the branch and the underline'),
          pagePresets: ref('pagePresets'),
        },
        additionalProperties: true,
      },
      state: {
        type: 'object',
        properties: {
          node: style, nodeShapes: shapes, nodePresets: presets, start: style, end: style, choice: style, fork: style,
          composite: style, compositePresets: presets,
          compositeColors: recordOf(style, 'Composite colours "0", "1"… taken in turn under the page setting composites: "palette"'),
          note: style, notePresets: presets, transition: style, transitionPresets: presets, pagePresets: ref('pagePresets'),
        },
        additionalProperties: true,
      },
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

/** Where a label's leading icon token is drawn, its size and colour (T10 §4.6: mindmap nodes, states, participants, entities). */
const ICON_KEYS = (): Record<string, JsonSchema> => ({
  iconPos: { enum: ['l', 't', 'b'], description: "Where the label's leading icon token is drawn: inline before the text (l, default), above it (t) or below it (b)" },
  iconSize: { type: 'number', minimum: 1, maximum: 512, description: 'The icon size in px (default: the font size inline, 1.75 em above or below)' },
  iconColor: { ...ref('color'), description: 'The icon colour (default: the text colour)' },
});

/** The icon keys plus a picture by URL and a catalogue shape, for items whose code has no syntax for them. */
const MEDIA_KEYS = (): Record<string, JsonSchema> => ({
  ...ICON_KEYS(),
  img: { type: 'string', maxLength: 2048, description: 'A picture above the label (URL; mindmap nodes, states, participants: their code has no image syntax); "" = not chosen yet (a placeholder)' },
  imgW: { type: 'number', minimum: 0, description: 'The picture width (alone: the height follows the aspect)' },
  imgH: { type: 'number', minimum: 0, description: 'The picture height (alone: the width follows the aspect)' },
  imgFit: { enum: ['contain', 'cover', 'stretch'], description: 'How the picture fills its box (default contain); flowchart image nodes too' },
  shape: { type: 'string', maxLength: 64, description: 'A catalogue shape the code cannot write (mmdx only: not in the portable file)' },
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
    node: item({
      ...box,
      // mindmaps
      dx: num('Nudge x (mindmap)'), dy: num('Nudge y (mindmap)'), side: { enum: ['l', 'r'], description: 'A first-level mindmap branch: its side of the root' },
      section: { type: 'integer', minimum: 0, maximum: 11, description: 'A mindmap branch colour (a section of the theme) for the node and its subtree' },
      collapsed: { type: 'boolean', description: 'A folded mindmap branch' },
      ...MEDIA_KEYS(),
    }),
    // a group's x / y is its top-left: a frame with w / h, or (without them) the place "Reset positions in this group" keeps
    group: item({ x: num('Left'), y: num('Top'), w: num('Width'), h: num('Height'), titleSize: num(), titleColor: ref('color') }),
    edge: item({ ...LINE_GEOM(), startArrow: ref('arrow'), endArrow: ref('arrow') }),
    rel: item(LINE_GEOM()),
    participant: item({ x: num(), w: num(), h: num(), ...MEDIA_KEYS() }),
    message: item({ dy: num('Extra space above'), labelOnLine: { type: 'boolean' } }),
    note: item({ dy: num('Extra space above') }),
    block: item({ dy: num('Extra space above'), showTag: { type: 'boolean' } }),
    box: item(),
    activation: item(),
    entity: item({
      ...box,
      ...ICON_KEYS(),
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
          layout: { enum: ['legacy', 'compound'], description: 'Flowcharts with subgraphs: `legacy` keeps the auto layout from before the compound engine (one minor release)' },
        },
      },
      styles: {
        type: 'object',
        properties: { palette: recordOf({ type: 'object', required: ['color'], properties: { color: ref('color') }, additionalProperties: true }, "The diagram's own palette") },
        additionalProperties: recordOf(ref('preset'), 'Local presets of one item kind (`_base` = the diagram-wide base style)'),
      },
      layers: recordOf({ type: 'object', properties: { name: { type: 'string' }, hidden: { type: 'boolean' } }, additionalProperties: true }),
      groups: coll('group', 'Flowchart subgraphs; state diagram composites'),
      nodes: coll('node', 'Flowchart nodes; mindmap nodes (their written id, else mm1, mm2… in code order); states (pseudo-states: [*]start, X/[*]end, URI-encoded)'),
      edges: coll('edge', 'Flowchart edges and state transitions, keyed `from->to` or `from->to#n`'),
      participants: coll('participant', 'Sequence participants'),
      messages: coll('message', 'Messages (positional ids m1, m2…)'),
      notes: coll('note', 'Sequence and state diagram notes (n1, n2…)'),
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
