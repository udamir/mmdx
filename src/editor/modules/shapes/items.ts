// Shapes menu content per diagram type (prototype app.js `PALETTE_ITEMS`, `SEQ_PRESET_KIND`, `SEQ_SHAPE`,
// `MERMAID_SHAPES`, `blockIcon`, `NOTE_ICON`, `TABLE_ICON`). Icons are fixed constants built with createElementNS.
import type { ItemKind } from '../../../core/types.js';
import { s } from '../../../ui/h.js';
import { shapePreview } from '../../../ui/shape-preview.js';

export interface PaletteItem {
  key: string;
  /** "Name — hint": the menu shows the name, the tooltip both. */
  label: string;
  icon: () => SVGElement;
  /** Preset the item is added in (preset submenus). */
  preset?: string;
}

export type PaletteEntry = PaletteItem | { sep: true };

const icon30 = (stroke: string, ...children: SVGElement[]): SVGElement =>
  s('svg', { viewBox: '0 0 32 32', width: '30', height: '30', fill: 'none', stroke: 'currentColor', 'stroke-width': stroke, 'aria-hidden': 'true' }, ...children);

const blockIcon = (t: string) => (): SVGElement =>
  icon30('1.5',
    s('rect', { x: '3', y: '5', width: '26', height: '22', rx: '2' }),
    s('path', { d: 'M3 11.5h17l-3 -6.5', 'stroke-width': '1.2' }),
    s('text', { x: '16', y: '22', 'text-anchor': 'middle', 'font-size': '8.5', 'font-weight': '700', 'font-family': 'sans-serif', fill: 'currentColor', stroke: 'none' }, t));

const noteIcon = (): SVGElement => icon30('1.6', s('path', { d: 'M6 6h20v14l-6 6H6z' }), s('path', { d: 'M20 26v-6h6M10 12h12M10 16h8' }));

export const tableIcon = (): SVGElement =>
  icon30('1.6', s('rect', { x: '4', y: '6', width: '24', height: '20', rx: '3' }), s('path', { d: 'M4 12h24M4 17.5h24M4 22h24M13 12v14' }));

const shapeIcon = (shape: string) => (): SVGElement => shapePreview(shape);

export const PALETTE_ITEMS: Readonly<Record<'flowchart' | 'sequence' | 'er', readonly PaletteEntry[]>> = {
  flowchart: ([
    ['rect', 'Process'], ['rounded', 'Step'], ['stadium', 'Start / End'], ['diamond', 'Decision'], ['parallelogram', 'Input / Output'],
    ['cylinder', 'Database'], ['hcyl', 'Queue'], ['document', 'Document'], ['subroutine', 'Subprocess'], ['circle', 'Event'], ['hexagon', 'Preparation'],
  ] as const).map(([key, label]) => ({ key, label, icon: shapeIcon(key) })),
  sequence: [
    { key: 'participant', label: 'Participant', icon: shapeIcon('box') },
    { key: 'actor', label: 'Actor', icon: shapeIcon('actor') },
    { key: 'database', label: 'Database', icon: shapeIcon('database') },
    { sep: true },
    { key: 'note', label: 'Note — drop next to a participant', icon: noteIcon },
    { key: 'loop', label: 'Loop — drop on a message (or select messages first)', icon: blockIcon('loop') },
    { key: 'alt', label: 'Alternative — drop on a message', icon: blockIcon('alt') },
    { key: 'opt', label: 'Optional — drop on a message', icon: blockIcon('opt') },
    { key: 'rect', label: 'Highlight — drop on a message', icon: blockIcon('hl') },
  ],
  er: [{ key: 'entity', label: 'Entity (table)', icon: tableIcon }],
};

export const PALETTE_TITLE: Readonly<Record<string, string>> = { flowchart: 'Shapes', sequence: 'Add to sequence', er: 'Add to ER diagram' };

/** Shapes Mermaid draws natively; the others are stored as `rect` + meta `shape`. */
export const MERMAID_SHAPES: ReadonlySet<string> = new Set(['rect', 'rounded', 'stadium', 'diamond', 'parallelogram', 'cylinder', 'subroutine', 'circle', 'hexagon']);

/** Sequence palette item → the preset kind it is styled with. */
export const SEQ_PRESET_KIND: Readonly<Record<string, ItemKind>> = {
  participant: 'participant', actor: 'participant', database: 'participant', note: 'note', loop: 'block', alt: 'block', opt: 'block', rect: 'block',
};

/** Sequence palette item → the participant shape its previews show. */
export const SEQ_SHAPE: Readonly<Record<string, string>> = { participant: 'box', actor: 'actor', database: 'database' };

export const isItem = (e: PaletteEntry): e is PaletteItem => !('sep' in e);

/** The palette item of a key in a diagram type (`entity` for ER). */
export function paletteItem(type: string | null, key: string): PaletteItem | null {
  const list = type === 'flowchart' || type === 'sequence' || type === 'er' ? PALETTE_ITEMS[type] : [];
  return list.filter(isItem).find((x) => x.key === key) ?? null;
}
