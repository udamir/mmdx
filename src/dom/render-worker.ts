// Render worker (§6.4): large diagrams are parsed, laid out and rendered off the main thread. The core is DOM-free,
// so the same code runs here; text is measured with OffscreenCanvas so widths match the main thread.
import { createContext, type CoreContext } from '../core/context.js';
import { renderSource, type PipelineOptions } from '../core/pipeline.js';
import { createStaticMeasurer } from '../core/text/measure.js';
import { ThemeRegistry } from '../core/theme/registry.js';
import type { ThemeFile } from '../core/theme/types.js';
import { createCanvasMeasurer } from './measure.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

const measure = createCanvasMeasurer() ?? createStaticMeasurer();
const contexts = new Map<string, { ctx: CoreContext; themesKey: string }>();

function contextFor(idPrefix: string, themes: readonly ThemeFile[], themesKey: string): CoreContext {
  const hit = contexts.get(idPrefix);
  if (hit && hit.themesKey === themesKey) return hit.ctx;
  const ctx = createContext({ themes: new ThemeRegistry(themes), measure, idPrefix });
  contexts.set(idPrefix, { ctx, themesKey });
  if (contexts.size > 32) contexts.delete(contexts.keys().next().value!);
  return ctx;
}

addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const { id, src, opts, themes, themesKey, idPrefix } = ev.data;
  let res: WorkerResponse;
  try {
    const ctx = contextFor(idPrefix, themes, themesKey);
    const r = renderSource(src, ctx, opts as PipelineOptions);
    res = {
      id,
      ok: true,
      doc: r.doc,
      model: r.model,
      result: r.result,
      themeId: r.themeId,
      tooLarge: r.tooLarge,
      // fixes are functions: they stay on the main thread (the viewer never offers fixes)
      diagnostics: r.diagnostics.map(({ fix: _fix, ...d }) => d),
    };
  } catch (e) {
    res = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  postMessage(res);
});
