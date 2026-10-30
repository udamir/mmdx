// Client of the render worker (§6.4, §12): one module worker per page, shared by every viewer; jobs time out after
// 2 s (the worker is then restarted and the diagram is reported as too large). Falls back to the main thread when
// workers are unavailable (CSP without worker-src, file://, old engines) — callers check `available()`.
import type { CoreContext } from '../core/context.js';
import { renderContext, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

/** Diagrams with more source lines than this render in the worker. */
export const WORKER_THRESHOLD_LINES = 300;
const TIMEOUT_MS = 2000;

let worker: Worker | null = null;
let failed = false;
let seq = 0;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void; timer: ReturnType<typeof setTimeout> }>();
let workerUrl: URL | string | null = null;

/** Hosts with a strict CSP can serve the worker file themselves (`worker-src 'self'`). */
export function setWorkerUrl(url: URL | string): void {
  workerUrl = url;
  worker?.terminate();
  worker = null;
  failed = false;
}

function getWorker(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined') {
    failed = true;
    return null;
  }
  try {
    worker = workerUrl
      ? new Worker(workerUrl, { type: 'module', name: 'mmdx-render' })
      : new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module', name: 'mmdx-render' });
    worker.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      clearTimeout(p.timer);
      p.resolve(ev.data);
    });
    worker.addEventListener('error', () => {
      failed = true;
      restart('The render worker failed to start');
    });
  } catch {
    failed = true;
    worker = null;
  }
  return worker;
}

function restart(reason: string): void {
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ id, ok: false, error: reason });
  }
  pending.clear();
}

export const workerAvailable = (): boolean => !failed && typeof Worker !== 'undefined';

const themesKeyOf = (files: readonly ThemeFile[]): string => files.map((f) => `${f.id}:${JSON.stringify(f).length}`).join('|');

/** Renders in the worker; resolves null when the worker is unavailable (render on the main thread instead). */
export async function renderInWorker(src: string, ctx: CoreContext, opts: PipelineOptions = {}): Promise<Rendered | { error: string } | null> {
  const w = getWorker();
  if (!w) return null;
  const themes = ctx.themes.list().map((t) => ctx.themes.raw(t.id)).filter((t): t is ThemeFile => !!t);
  const o: WorkerRequest['opts'] = {};
  if (opts.theme) o.theme = opts.theme;
  if (opts.visibleLayers) o.visibleLayers = opts.visibleLayers;
  if (opts.hideLabels) o.hideLabels = true;
  const id = ++seq;
  const req: WorkerRequest = { id, src, opts: o, themes, themesKey: themesKeyOf(themes), idPrefix: ctx.idPrefix };
  const res = await new Promise<WorkerResponse>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      restart('Rendering took too long');
      resolve({ id, ok: false, error: 'timeout' });
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage(req);
  });
  if (!res.ok) return res.error === 'timeout' ? { error: 'timeout' } : null;
  const theme = ctx.themes.get(res.themeId);
  return {
    doc: res.doc,
    model: res.model,
    theme,
    themeId: res.themeId,
    rctx: renderContext(ctx, theme, res.doc),
    result: res.result,
    diagnostics: res.diagnostics,
    tooLarge: res.tooLarge,
  };
}
