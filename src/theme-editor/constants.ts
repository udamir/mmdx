// Fixed data of the theme editor: fonts, sample diagrams, shape tabs, field option lists.
import { DIAGRAM_TYPES, kindInfo } from '../core/kinds/info.js';
import { participantPresetShape, presetShape } from '../core/render/index.js';
import { registerExtendedShapes } from '../core/extras.js';
import { PARTICIPANT_SHAPES, pickerShapes } from '../core/shapes/catalog.js';
import type { BuiltinType, DiagramType } from '../core/types.js';
import { kindUi } from '../ui/diagram/kind-ui.js';
import type { Obj } from './util.js';
import { FONTS as STYLE_FONTS } from '../ui/diagram/fonts.js';

// the previews draw every catalogue shape, icons and rich labels: the geometry and the media kit, registered statically
registerExtendedShapes();

/** A theme's font: the style pickers' fonts (one table, ui/fonts.ts, B25) without "the theme's font". */
export const FONTS: readonly (readonly [string, string])[] = STYLE_FONTS.filter(([v]) => v !== '');

const DEFAULT_SAMPLES: Readonly<Record<BuiltinType, string>> = {
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
  mindmap: `mindmap
  root((Product))
    Goals
      Grow usage
      **Faster** onboarding
    Research[User research]
      Interviews
      Surveys
    Launch))Launch((
      Beta
      Press
    Risks{{Risks}}
      Scope
      Budget`,
  state: `stateDiagram-v2
  state "Shopping cart" as Cart
  Cart : items and totals
  state check <<choice>>
  [*] --> Cart
  Cart --> check : checkout
  check --> Paid : approved
  check --> Failed : declined
  state Paid {
    [*] --> Packing
    Packing --> Shipped
    --
    [*] --> Invoicing
  }
  Paid --> [*]
  Failed --> Cart : retry
  note right of Failed : the card was declined`,
};

/** A type's sample: the built-in types' above, a kind plugin's from its KindUi, else its starter source. */
export const defaultSample = (type: DiagramType): string =>
  (Object.hasOwn(DEFAULT_SAMPLES, type) ? DEFAULT_SAMPLES[type as BuiltinType] : undefined) ?? kindUi(type).sample ?? kindInfo(type)?.starter ?? '';
export const TYPES: readonly DiagramType[] = DIAGRAM_TYPES;

// from the shape catalogue: flowchart shapes by category (Basic, Process, Technical, Annotation), with their names
const NODE_SHAPES: readonly (readonly [string, string])[] = pickerShapes().map((d) => [d.id, d.title ?? d.name] as const);
const PART_SHAPES = PARTICIPANT_SHAPES;

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
export const LINE_KINDS = new Set(['edge', 'message', 'rel', 'lifeline', 'transition']);
/** The text colour key of box-like kinds (contrast check on their fill). */
export const TEXT_ON_FILL: Readonly<Record<string, string>> = { node: 'text', participant: 'text', note: 'text', entity: 'text', box: 'text', group: 'titleColor', block: 'labelColor', composite: 'titleColor' };
/** Top-level theme keys that change nothing drawn (tiles and the preview need not follow them). */
export const UNDRAWN = new Set(['id', 'name', 'counterpart', 'schemaVersion', 'description']);
