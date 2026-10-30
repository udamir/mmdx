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
}
