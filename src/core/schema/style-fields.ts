// Style properties: how each one is edited (Properties panel, theme editor) and which item type has which
// (prototype style-fields.js). The page fields the prototype added to FIELD_DEFS at run time (`background`,
// `border`, `gap`, `rowH`, `mirror`, `blockSpan`) are declared here statically.
import { DIAGRAM_TYPES } from '../kinds/info.js';
import { PARTICIPANT_SHAPES, pickerShapes } from '../shapes/catalog.js';
import type { BuiltinType, DiagramType, ItemKind } from '../types.js';
import { ROUTINGS } from '../style.js';

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
  pshape: { key: 'shape', label: 'Shape', type: 'select', options: [...PARTICIPANT_SHAPES.map(([n]) => n), 'hcyl'] },
  dash: { label: 'Line', type: 'select', options: [['none', 'solid'], ['6 4', 'dashed'], ['1.5 4', 'dotted'], ['10 4 2 4', 'dash-dot'], ['8 5', 'long dash']] },
  color: { label: 'Colour', type: 'color' }, width: { label: 'Width', type: 'number', step: 0.1 },
  arrow: { label: 'Arrow head', type: 'select', options: ['open', 'filled', 'arrow', 'none'] },
  labelColor: { label: 'Label colour', type: 'color' }, labelSize: { label: 'Label size', type: 'number' },
  curve: { label: 'Curvature', type: 'range', min: 0, max: 2, step: 0.05 },
  routing: { label: 'Routing', type: 'select', options: ROUTINGS },
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

const SECTION_UI: Readonly<Record<BuiltinType, ThemeSection>> = {
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

/**
 * What the theme editor shows, per diagram type (in UI order): base style of each item type (+ its named presets).
 * The built-in types', then the kind plugins' (`registerThemeSection`; live: a registered section is added).
 */
export const THEME_SECTIONS: readonly (ThemeSection & { type: DiagramType })[] = DIAGRAM_TYPES.filter((t) => Object.hasOwn(SECTION_UI, t)).map((type) => ({ type, ...SECTION_UI[type as BuiltinType] }));

/** A kind plugin's theme editor section (A11e), after the built-in ones; registering a type again replaces it. */
export function registerThemeSection(type: DiagramType, section: ThemeSection): void {
  const list = THEME_SECTIONS as (ThemeSection & { type: DiagramType })[];
  const at = list.findIndex((s) => s.type === type);
  if (at >= 0) list[at] = { type, ...section };
  else list.push({ type, ...section });
}

/** The theme editor section of a diagram type (an empty one for a type that declares none). */
export const themeSection = (type: DiagramType): ThemeSection => THEME_SECTIONS.find((s) => s.type === type) ?? { title: type, items: [], routing: true };

/** The stored key of a field (`pshape` → `shape`). */
export const fieldKey = (name: string): string => FIELD_DEFS[name]?.key ?? name;
export const optionValue = (o: FieldOption): string => (typeof o === 'string' ? o : o[0]);
