// Messages between the render worker and its client (structured-clone friendly: no functions).
import type { IconSnapshot } from '../core/icons/types.js';
import type { DiagramDocument } from '../core/meta/index.js';
import type { DiagramModel } from '../core/model.js';
import type { RenderResult } from '../core/render/types.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { Diagnostic } from '../core/types.js';
import type { ImagePolicy, LinkPolicy } from '../core/validate.js';

export interface WorkerRequest {
  id: number;
  src: string;
  opts: { theme?: string; visibleLayers?: readonly string[]; hideLabels?: boolean };
  /** The themes, when this worker has not been sent this `themesKey` yet (once per registry revision per worker). */
  themes?: readonly ThemeFile[];
  /** The registry's identity and revision: changes when its themes change, so the worker builds a new registry. */
  themesKey: string;
  idPrefix: string;
  /** The instance's policies (plain data): the worker's contexts are its own. */
  linkPolicy: LinkPolicy;
  imagePolicy: ImagePolicy;
  /**
   * The icons the source references, resolved on the main thread (the worker cannot call pack loaders): ready ones
   * with their data, the others loading or missing. A pack that loads later re-renders, with a new snapshot.
   */
  icons: IconSnapshot;
}

/** The worker's first message: it has started (a job's timeout counts from here, not from the worker's load). */
export interface WorkerReady {
  ready: true;
}

/**
 * A job's answer. `error: 'themes'`: the worker no longer holds the job's themes (it keeps a few registries): the
 * client sends the job again with them.
 */
export type WorkerResponse =
  | { id: number; ok: true; doc: DiagramDocument; model: DiagramModel; result: RenderResult; themeId: string; tooLarge: boolean; diagnostics: Omit<Diagnostic, 'fix'>[] }
  | { id: number; ok: false; error: string };
