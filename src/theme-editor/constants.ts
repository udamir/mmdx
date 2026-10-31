// Fixed data of the theme editor: fonts, sample diagrams, shape tabs, field option lists.
import { participantPresetShape, presetShape } from '../core/render/index.js';
import type { DiagramType } from '../core/types.js';
import type { ToolbarControl } from '../ui/style-toolbar.js';
import type { Obj } from './util.js';

export const FONTS: readonly (readonly [string, string])[] = [
  ["'Open Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", 'Open Sans'], ["Inter, 'Segoe UI', system-ui, sans-serif", 'Inter'],
  ['Roboto, sans-serif', 'Roboto'], ["'Helvetica Neue', Arial, sans-serif", 'Helvetica'], ['Georgia, serif', 'Georgia'],
  ["'JetBrains Mono', 'SF Mono', Menlo, monospace", 'JetBrains Mono'],
];

export const DEFAULT_SAMPLES: Readonly<Record<DiagramType, string>> = {
  flowchart: `flowchart TB
  subgraph svc ["Services"]
    api["API gateway"]:::core --> auth["Auth"]:::analytics
    api --> orders["Orders"]:::domain
    orders --> db[("Orders DB")]:::db
  end
  user(["User"]) -->|"HTTPS"| api
  orders -.->|"events"| bus[("Kafka")]:::event-bus
  bus --> mail{{"Mail"}}:::service
  class bus event-bus`,
  sequence: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant D as Storage
  C->>+S: Request
  Note over S: validate
  loop retry
    S->>D: Read
    D-->>S: Data
  end
  S-->>-C: Response`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : contains
  CUSTOMER {
    string id PK
    string name
  }
  ORDER {
    string id PK
    string customer_id FK
  }
  LINE {
    string order_id FK
    int qty
  }`,
};
export const TYPES: readonly DiagramType[] = ['flowchart', 'sequence', 'er'];

const NODE_SHAPES: readonly (readonly [string, string])[] = [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['stadium', 'Stadium'], ['circle', 'Circle'], ['doublecircle', 'Double circle'],
  ['diamond', 'Diamond'], ['hexagon', 'Hexagon'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['asymmetric', 'Flag'],
  ['cylinder', 'Cylinder'], ['hcyl', 'Queue (horizontal cylinder)'], ['document', 'Document'], ['card', 'Card'], ['subroutine', 'Subroutine']];
const PART_SHAPES: readonly (readonly [string, string])[] = [['box', 'Box'], ['rounded', 'Rounded'], ['stadium', 'Stadium'], ['actor', 'Stick figure'], ['database', 'Database'], ['hcyl', 'Queue (horizontal cylinder)']];

export interface ShapeTabs {
  key: 'nodeShapes' | 'participantShapes';
  shapes: readonly (readonly [string, string])[];
  def: string;
  of: (p: Obj | undefined) => string;
}
// items whose theme style is split per shape: <type>.<key>.<shape> holds each shape's default
export const SHAPE_TABS: Readonly<Record<string, ShapeTabs>> = {
  node: { key: 'nodeShapes', shapes: NODE_SHAPES, def: 'rect', of: (p) => presetShape(p as never) },
  participant: { key: 'participantShapes', shapes: PART_SHAPES, def: 'box', of: (p) => participantPresetShape(p as never) },
};
export const LINE_KINDS = new Set(['edge', 'message', 'rel', 'lifeline']);
/** The text colour key of box-like kinds (contrast check on their fill). */
export const TEXT_ON_FILL: Readonly<Record<string, string>> = { node: 'text', participant: 'text', note: 'text', entity: 'text', box: 'text', group: 'titleColor', block: 'labelColor' };
export const RATIOS = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'];
export const ROUTINGS = ['curved', 'orthogonal', 'straight'];
export const TOOLBAR_EXCLUDE: readonly ToolbarControl[] = ['link', 'lock', 'paint', 'delete', 'order', 'layer', 'editGroup', 'ungroup', 'group', 'activate', 'arrange', 'more', 'presets'];
/** Top-level theme keys that change nothing drawn (tiles and the preview need not follow them). */
export const UNDRAWN = new Set(['id', 'name', 'counterpart', 'schemaVersion', 'description']);
