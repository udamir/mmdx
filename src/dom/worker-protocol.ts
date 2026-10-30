// Messages between the render worker and its client (structured-clone friendly: no functions).
import type { DiagramDocument } from '../core/meta/index.js';
import type { DiagramModel } from '../core/model.js';
import type { RenderResult } from '../core/render/types.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { Diagnostic } from '../core/types.js';

export interface WorkerRequest {
  id: number;
  src: string;
  opts: { theme?: string; visibleLayers?: readonly string[]; hideLabels?: boolean };
  themes: readonly ThemeFile[];
  /** Changes when the registry's themes change, so the worker rebuilds its registry. */
  themesKey: string;
  idPrefix: string;
}

export type WorkerResponse =
  | { id: number; ok: true; doc: DiagramDocument; model: DiagramModel; result: RenderResult; themeId: string; tooLarge: boolean; diagnostics: Omit<Diagnostic, 'fix'>[] }
  | { id: number; ok: false; error: string };
