// Render worker (§6.4): large diagrams are parsed, laid out and rendered off the main thread. The core is DOM-free,
// so the same code runs here; text is measured with OffscreenCanvas so widths match the main thread.
import { createContext, type CoreContext } from '../core/context.js';
import { IconRegistry } from '../core/icons/registry.js';
import { renderSource, type PipelineOptions } from '../core/pipeline.js';
import { createStaticMeasurer } from '../core/text/measure.js';
import { ThemeRegistry } from '../core/theme/registry.js';
import type { ThemeFile } from '../core/theme/types.js';
import { createCanvasMeasurer } from './measure.js';
import type { WorkerReady, WorkerRequest, WorkerResponse } from './worker-protocol.js';

const measure = createCanvasMeasurer() ?? createStaticMeasurer();
/** Contexts by id prefix and theme registry revision (most recently used last). */
const contexts = new Map<string, CoreContext>();
/** The registries by revision: a job brings its themes only the first time (most recently used last). */
const registries = new Map<string, ThemeRegistry>();

/** The context of a job, or null when its themes are neither given nor held. */
function contextFor(idPrefix: string, themes: readonly ThemeFile[] | undefined, themesKey: string): CoreContext | null {
  let reg = registries.get(themesKey);
  if (reg) registries.delete(themesKey);
  else if (themes) reg = new ThemeRegistry(themes);
  else return null;
  registries.set(themesKey, reg);
  if (registries.size > 8) registries.delete(registries.keys().next().value!);
  const key = `${idPrefix}|${themesKey}`;
  let ctx = contexts.get(key);
  if (ctx) contexts.delete(key);
  else ctx = createContext({ themes: reg, measure, idPrefix });
  contexts.set(key, ctx);
  if (contexts.size > 32) contexts.delete(contexts.keys().next().value!);
  return ctx;
}

addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const { id, src, opts, themes, themesKey, idPrefix, linkPolicy, imagePolicy, icons } = ev.data;
  let res: WorkerResponse;
  try {
    const ctx = contextFor(idPrefix, themes, themesKey);
    if (!ctx) {
      postMessage({ id, ok: false, error: 'themes' } satisfies WorkerResponse);
      return;
    }
    ctx.linkPolicy = linkPolicy;
    ctx.imagePolicy = imagePolicy;
    ctx.icons = IconRegistry.fromSnapshot(icons);
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

// started: the client counts its jobs' time from here
postMessage({ ready: true } satisfies WorkerReady);
