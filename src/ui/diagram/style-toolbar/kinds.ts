// The button sets of the style toolbar per item kind (prototype KIND plus the order / layer / presets rearrangement
// done at load), the bulk-edit variant of a kind's set, and the value lists its popovers offer.
import { LINE_KINDS as ITEM_LINE_KINDS } from '../../../core/item-caps.js';
import { PARTICIPANT_SHAPES as PARTICIPANTS, pickerShapes } from '../../../core/shapes/catalog.js';
import type { KindSpec, ToolbarControl } from './types.js';

/** Font sizes the size steppers go through. */
export const SIZES = [8, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 64];
/** Kinds that can be drawn stacked. */
export const STACKABLE = new Set(['node', 'group', 'participant', 'entity']);
/** The shape pickers' lists, from the shape catalogue (flowchart nodes: by category; participants: their own names). */
export const NODE_SHAPES: readonly string[] = pickerShapes().map((d) => d.id);
export const PARTICIPANT_SHAPES: readonly string[] = PARTICIPANTS.map(([n]) => n);
export const DASHES: readonly (readonly [string, string])[] = [['none', 'solid'], ['6 4', 'dashed'], ['1.5 4', 'dotted']];
export const ARROWS = ['none', 'open', 'filled', 'arrow', 'circle', 'dot', 'cross'] as const;
export const ROUTINGS = ['curved', 'orthogonal', 'straight'] as const;

type MutableSpec = { groups: ToolbarControl[][] } & Omit<KindSpec, 'groups'>;

/** Controls that only make sense for one item: left out when the same kind's bar edits several items at once. */
const SINGLE_ONLY: ReadonlySet<ToolbarControl> = new Set(['order', 'editGroup', 'ungroup', 'source', 'media', 'actions']);

/** Connector kinds: no box to align or group (two messages can still become a process). */
const LINE_KINDS: ReadonlySet<string> = ITEM_LINE_KINDS;

/**
 * A kind's button set for several items of that kind (bulk edit): its own controls minus the single-item ones,
 * plus the multi-selection actions just before its last segment (align & distribute and group for boxes, process).
 */
export function bulkSpec(kind: string, sp: KindSpec): KindSpec {
  const groups = sp.groups.map((g) => g.filter((c) => !SINGLE_ONLY.has(c))).filter((g) => g.length);
  groups.splice(Math.max(0, groups.length - 1), 0, LINE_KINDS.has(kind) ? ['activate'] : ['arrange', 'group', 'activate']);
  return { ...sp, groups };
}

/** Button sets per kind (prototype KIND plus the order / layer / presets rearrangement done at load). */
function buildKinds(): Readonly<Record<string, KindSpec>> {
  const K: Record<string, MutableSpec> = {
    // an image node has Change image (a picture or an icon) and its settings instead of the shape picker; sizes are in
    // Properties
    node: { groups: [['source', 'media', 'shape', 'font', 'size', 'bold', 'align', 'link'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text', shapes: NODE_SHAPES },
    group: { groups: [['shape', 'font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['editGroup', 'ungroup', 'paint', 'lock', 'delete', 'more']], size: 'titleSize', bold: 'titleWeight', text: 'titleColor' },
    edge: { groups: [['line', 'arrows', 'routing'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    rel: { groups: [['line', 'routing'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    participant: { groups: [['source', 'media', 'shape', 'font', 'size', 'bold', 'wrap'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text', shapes: PARTICIPANT_SHAPES, shapeKey: 'shape' },
    message: { groups: [['line', 'arrows', 'actions'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    note: { groups: [['actions'], ['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['paint', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text' },
    block: { groups: [['actions'], ['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    box: { groups: [['textColor'], ['border', 'fill'], ['ungroup', 'delete']], text: 'text' },
    multi: { groups: [['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['arrange', 'group', 'activate'], ['delete']], size: 'fontSize', bold: 'fontWeight', text: 'text' },
    entity: { groups: [['shape', 'tableStyle', 'font', 'size', 'bold', 'link'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'attrSize', bold: 'titleWeight', text: 'text' },
    // only styled in the theme editor
    lifeline: { groups: [['line']] },
    activation: { groups: [['border', 'fill']] },
  };
  const WITH_PRESETS = new Set(['node', 'group', 'edge', 'rel', 'participant', 'message', 'block', 'box', 'note', 'entity']);
  for (const [k, spec] of Object.entries(K)) {
    if (k === 'multi') continue;
    // every single-item toolbar gets z-order and layer just before its last segment
    spec.groups.splice(spec.groups.length - 1, 0, ['order', 'layer']);
    // presets right after Shape (or first, for items without a shape)
    if (WITH_PRESETS.has(k)) {
      const g = spec.groups[0]!;
      const i = g.indexOf('shape');
      g.splice(i >= 0 ? i + 1 : 0, 0, 'presets');
    }
    // delete lives in the ⋮ menu when there is one
    for (const g of spec.groups) {
      const d = g.indexOf('delete');
      if (d >= 0 && g.includes('more')) g.splice(d, 1);
    }
  }
  K['multi']!.groups.splice(K['multi']!.groups.length - 1, 0, ['layer']);
  return K;
}

/** Default button sets per item kind (and `multi`). */
export const TOOLBAR_KINDS: Readonly<Record<string, KindSpec>> = buildKinds();
