// English names of the diagram types for the UIs that list them (the editor's "Start a diagram" cards, the studio's
// New menu); kept apart from info.ts so detection does not ship them.
import type { BuiltinType } from '../types.js';

export interface KindNames {
  /** Short name (the "Start a diagram" cards). */
  readonly name: string;
  /** Full name (the studio's New menu). */
  readonly title: string;
  /** One line about what the type draws (the "Start a diagram" cards). */
  readonly blurb: string;
}

/** In the order of KIND_INFO. */
export const KIND_NAMES: Readonly<Record<BuiltinType, KindNames>> = {
  flowchart: { name: 'Flowchart', title: 'Flowchart', blurb: 'Boxes, decisions, groups and arrows' },
  sequence: { name: 'Sequence', title: 'Sequence diagram', blurb: 'Participants and the messages between them' },
  er: { name: 'ER diagram', title: 'Entity–relationship (ER) diagram', blurb: 'Tables, columns and relationships' },
  mindmap: { name: 'Mindmap', title: 'Mindmap', blurb: 'A central topic and branches of ideas' },
  state: { name: 'State diagram', title: 'State diagram', blurb: 'States, transitions and composite states' },
};
