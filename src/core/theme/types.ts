// Theme file model (A.8 row 69, §8.3). Themes are JSON; `extends` chains are merged by ThemeRegistry.
import type { PageSettings } from '../meta/types.js';
import type { StyleProps } from '../style.js';

export const THEME_SCHEMA_VERSION = 1;

export type Presets = Record<string, StyleProps>;
export type PagePresets = Record<string, PageSettings & { label?: string }>;

export interface FlowchartTheme {
  node?: StyleProps;
  nodeShapes?: Record<string, StyleProps>;
  nodePresets?: Presets;
  group?: StyleProps;
  groupPresets?: Presets;
  edge?: StyleProps;
  edgePresets?: Presets;
  pagePresets?: PagePresets;
}

export interface SequenceLayout {
  gap?: number;
  top?: number;
  rowH?: number;
  lineH?: number;
  blockGapTop?: number;
  blockGapBottom?: number;
  blockPad?: number;
  mirror?: boolean;
  margin?: number;
  /** Block width: across every participant (`full`) or only the ones it touches. */
  blockSpan?: 'full' | 'touched';
}

export interface SequenceTheme {
  participant?: StyleProps;
  participantShapes?: Record<string, StyleProps>;
  participantPresets?: Presets;
  lifeline?: StyleProps;
  activation?: StyleProps;
  activationPresets?: Presets;
  message?: StyleProps;
  messagePresets?: Presets;
  note?: StyleProps;
  notePresets?: Presets;
  block?: StyleProps;
  blockPresets?: Presets;
  box?: StyleProps;
  boxPresets?: Presets;
  layout?: SequenceLayout;
  pagePresets?: PagePresets;
}

export interface ErTheme {
  entity?: StyleProps;
  entityPresets?: Presets;
  rel?: StyleProps;
  relPresets?: Presets;
  pagePresets?: PagePresets;
}

export interface MindmapTheme {
  /** The root node (its shape when the code gives none: `rounded`). */
  root?: StyleProps;
  /** Every other node; a node without delimiters is its label over an underline in the section's colour. */
  node?: StyleProps;
  nodeShapes?: Record<string, StyleProps>;
  nodePresets?: Presets;
  /** The lines from a parent to its children: `width` of a first-level branch (deeper ones taper: 11 / 8 / 5 / 3). */
  branch?: StyleProps;
  /**
   * The section colours, `"0"` … `"11"`: `fill` and `text` of shaped nodes, `color` of the branch and the underline.
   * Each child of the root starts a section (Mermaid's `i % 11`), or each depth (`colorBy: depth`).
   */
  sections?: Record<string, StyleProps>;
  pagePresets?: PagePresets;
}

export interface StateTheme {
  /** A state: a rounded box, its title centred (with description rows: title, divider, rows). */
  node?: StyleProps;
  /** Per-shape defaults of states given an mmdx-only shape (metadata `shape`). */
  nodeShapes?: Record<string, StyleProps>;
  nodePresets?: Presets;
  /** The start pseudo-state: a filled dot (`fill`, `w`). */
  start?: StyleProps;
  /** The end pseudo-state: a dot in a ring (`fill` the dot, `stroke` the ring, `w`). */
  end?: StyleProps;
  /** `<<choice>>`: a diamond (`w`). */
  choice?: StyleProps;
  /** `<<fork>>` / `<<join>>`: a filled bar across the flow (`fill`, `w` its length, `h` its thickness). */
  fork?: StyleProps;
  /** A composite state: its frame and title band (`pad`, `padTop`, `titleSize`…). */
  composite?: StyleProps;
  compositePresets?: Presets;
  /**
   * The colours of composites under the page setting `composites: "palette"` (the "Coloured composites" page preset,
   * Mermaid 12's redux-color look): `"0"`, `"1"`… in turn, by the composite's place in the code.
   */
  compositeColors?: Record<string, StyleProps>;
  /** A note: a folded-corner box beside its state, joined by a dashed line (`color` of the line). */
  note?: StyleProps;
  notePresets?: Presets;
  /** A transition: an arrow with a label (`color`, `width`, `arrow`, `labelSize`…). */
  transition?: StyleProps;
  transitionPresets?: Presets;
  pagePresets?: PagePresets;
}

export interface ThemeFile {
  id: string;
  name?: string;
  extends?: string;
  appearance?: 'light' | 'dark';
  /** The theme of the same family with the other appearance (shown when the UI switches between light and dark). */
  counterpart?: string;
  schemaVersion?: number;
  palette?: Record<string, string>;
  font?: string;
  canvas?: PageSettings;
  flowchart?: FlowchartTheme;
  sequence?: SequenceTheme;
  er?: ErTheme;
  mindmap?: MindmapTheme;
  state?: StateTheme;
}

export interface ThemeInfo {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  extends: string | null;
  version?: string;
}

/**
 * A merged theme with every colour reference resolved, ready for rendering. All sections exist (baseline defines
 * every one); `basePalette` is the baseline palette (fallback for names a theme lacks).
 */
export interface ResolvedTheme {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  palette: Record<string, string>;
  basePalette: Record<string, string>;
  font: string;
  canvas: PageSettings & { pad: number };
  flowchart: Required<Omit<FlowchartTheme, 'nodeShapes'>> & Pick<FlowchartTheme, 'nodeShapes'>;
  sequence: Required<Omit<SequenceTheme, 'participantShapes'>> & Pick<SequenceTheme, 'participantShapes'>;
  er: Required<ErTheme>;
  mindmap: Required<Omit<MindmapTheme, 'nodeShapes'>> & Pick<MindmapTheme, 'nodeShapes'>;
  state: Required<Omit<StateTheme, 'nodeShapes'>> & Pick<StateTheme, 'nodeShapes'>;
}
