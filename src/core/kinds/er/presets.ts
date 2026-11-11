// ER presets (T11), apart from the renderer so the editor's base chunk (the attribute look of the table editor and
// Properties) and the ops kind do not load it: the theme's entity and relationship presets with the diagram's own over
// them, the flowchart's group presets for subgraph frames, the preset an item is drawn with (its metadata's, else the
// first of its Mermaid classes that names one, as the flowchart does), and an attribute's built-in looks.
import type { AttrHighlight, DiagramMeta } from '../../meta/types.js';
import type { Entity, ErGroup, ErRel } from '../../model.js';
import type { StyleProps } from '../../style.js';
import type { ResolvedTheme } from '../../theme/types.js';
import { presetOf, presets } from '../../render/common.js';
import { ownPreset } from '../../render/graph-kit.js';

export interface ErPresets {
  entity: Record<string, StyleProps>;
  rel: Record<string, StyleProps>;
  /** Subgraph frames: the flowchart's group presets (an ER subgraph is drawn as a flowchart subgraph). */
  group: Record<string, StyleProps>;
}

export function erPresets(T: ResolvedTheme, meta: DiagramMeta): ErPresets {
  return {
    entity: presets(T.er.entityPresets, meta.styles['entity']),
    rel: presets(T.er.relPresets, meta.styles['rel']),
    group: presets(T.flowchart.groupPresets, meta.styles['group']),
  };
}


/** The preset an entity is drawn with: its metadata's, else the first of its classes that names a preset ('' for none). */
export const entityPreset = (e: Entity, meta: DiagramMeta, P: ErPresets): string => ownPreset(meta.entities?.[e.id]) || (e.classes.find((c) => presetOf(P.entity, c)) ?? '');

/** The preset a subgraph is drawn with: its metadata's, else a class naming one, else the flowchart's `box`. */
export const erGroupPreset = (g: ErGroup, meta: DiagramMeta, P: ErPresets): string =>
  ownPreset(meta.groups?.[g.id]) || (g.classes.find((c) => presetOf(P.group, c)) ?? (presetOf(P.group, 'box') ? 'box' : ''));

export const relPreset = (r: ErRel, meta: DiagramMeta): string => ownPreset(meta.rels?.[r.id]);

/** Built-in looks of an attribute; colours are theme palette references, so they follow theme switches. */
export const ATTR_PRESETS: Readonly<Record<string, AttrHighlight>> = {
  key: { bold: true, underline: true },
  foreign: { italic: true, color: '@blue' },
  important: { bold: true, color: '@red' },
  muted: { color: '@grey' },
  note: { italic: true, color: '@slate' },
};

/** An attribute's look (or the title's, `__title`): its preset overridden by its own highlight keys. */
export function attrLook(hl: Readonly<Record<string, AttrHighlight>> | undefined, name: string): AttrHighlight {
  const own = highlight((hl ?? {}) as Record<string, AttrHighlight>, name);
  const p = typeof own.preset === 'string' && Object.hasOwn(ATTR_PRESETS, own.preset) ? ATTR_PRESETS[own.preset] : undefined;
  return p ? { ...p, ...own } : own;
}

/** Highlight of an attribute (or `__title`): colour, bold, underline. */
export function highlight(hl: Record<string, AttrHighlight>, name: string): AttrHighlight {
  return Object.prototype.hasOwnProperty.call(hl, name) && hl[name] && typeof hl[name] === 'object' ? hl[name] : {};
}
