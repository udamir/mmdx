// Client of the render worker (§6.4, §12): one module worker per page, shared by every viewer. Jobs run one at a
// time, in order; a job's 2 s timeout starts when the worker takes it (not while it waits behind others), and a
// viewer's newer job replaces its older one still waiting (the older resolves as superseded, never rendered). A job
// that times out restarts the worker and is reported as too large; the jobs behind it run in the new worker. Falls
// back to the main thread when workers are unavailable (CSP without worker-src, file://, old engines) — callers check
// `workerAvailable()`.
import type { CoreContext } from '../core/context.js';
import { renderContext, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import type { ThemeRegistry } from '../core/theme/registry.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

/** Diagrams with more source lines than this render in the worker. */
export const WORKER_THRESHOLD_LINES = 300;
const TIMEOUT_MS = 2000;

interface Job {
  req: WorkerRequest;
  owner: object | null;
  resolve(r: WorkerResponse): void;
}

let worker: Worker | null = null;
let failed = false;
let seq = 0;
/** Jobs waiting for the worker, in order. */
const queue: Job[] = [];
/** The job the worker is on, and its timeout. */
let running: { job: Job; timer: ReturnType<typeof setTimeout> } | null = null;
let workerUrl: URL | string | null = null;
let workerType: WorkerType = 'module';

/**
 * Hosts with a strict CSP can serve the worker file themselves (`worker-src 'self'`). `type: 'classic'` starts a
 * classic worker: the `blob:` URL of `@mmdx/studio/worker-inline`'s source, for pages that cannot start module workers.
 */
export function setWorkerUrl(url: URL | string, opts: { type?: WorkerType } = {}): void {
  workerUrl = url;
  workerType = opts.type ?? 'module';
  worker?.terminate();
  worker = null;
  failed = false;
  // a job in flight in the old worker renders on the main thread
  if (running) settle({ id: running.job.req.id, ok: false, error: 'unavailable' });
}

function getWorker(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined') {
    failed = true;
    return null;
  }
  try {
    const w = workerUrl
      ? new Worker(workerUrl, { type: workerType, name: 'mmdx-render' })
      : new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module', name: 'mmdx-render' });
    w.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => {
      if (w !== worker || !running || running.job.req.id !== ev.data.id) return;
      settle(ev.data);
    });
    w.addEventListener('error', () => {
      if (w !== worker) return;
      // the worker cannot run here: every job renders on the main thread
      failed = true;
      w.terminate();
      worker = null;
      if (running) settle({ id: running.job.req.id, ok: false, error: 'unavailable' });
    });
    worker = w;
  } catch {
    failed = true;
    worker = null;
  }
  return worker;
}

/** The running job is done: its result goes out, the next job starts. */
function settle(res: WorkerResponse): void {
  const r = running;
  if (!r) return;
  clearTimeout(r.timer);
  running = null;
  r.job.resolve(res);
  next();
}

function next(): void {
  if (running || !queue.length) return;
  const w = getWorker();
  if (!w) {
    for (const j of queue.splice(0)) j.resolve({ id: j.req.id, ok: false, error: 'unavailable' });
    return;
  }
  const job = queue.shift()!;
  running = {
    job,
    timer: setTimeout(() => {
      // a job that takes too long: the worker is restarted for the jobs behind it
      worker?.terminate();
      worker = null;
      settle({ id: job.req.id, ok: false, error: 'timeout' });
    }, TIMEOUT_MS),
  };
  w.postMessage(job.req);
}

export const workerAvailable = (): boolean => !failed && typeof Worker !== 'undefined';

/** Each registry's identity and revision (bumped on every change): the worker rebuilds its registry when it changes. */
const registryKeys = new WeakMap<ThemeRegistry, { id: number; rev: number }>();
let registries = 0;
function themesKeyOf(reg: ThemeRegistry): string {
  let k = registryKeys.get(reg);
  if (!k) {
    const key = (k = { id: ++registries, rev: 0 });
    registryKeys.set(reg, key);
    reg.onChange(() => void key.rev++);
  }
  return `${k.id}.${k.rev}`;
}

/**
 * Renders in the worker; resolves null when the worker is unavailable (render on the main thread instead), and
 * `{ error: 'superseded' }` when a newer job of the same `owner` replaced this one before it started.
 */
export async function renderInWorker(src: string, ctx: CoreContext, opts: PipelineOptions = {}, owner: object | null = null): Promise<Rendered | { error: string } | null> {
  if (!getWorker()) return null;
  const themes = ctx.themes.list().map((t) => ctx.themes.raw(t.id)).filter((t): t is ThemeFile => !!t);
  const o: WorkerRequest['opts'] = {};
  if (opts.theme) o.theme = opts.theme;
  if (opts.visibleLayers) o.visibleLayers = opts.visibleLayers;
  if (opts.hideLabels) o.hideLabels = true;
  const req: WorkerRequest = { id: ++seq, src, opts: o, themes, themesKey: themesKeyOf(ctx.themes), idPrefix: ctx.idPrefix, linkPolicy: ctx.linkPolicy, imagePolicy: ctx.imagePolicy };
  const res = await new Promise<WorkerResponse>((resolve) => {
    if (owner)
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i]!;
        if (j.owner !== owner) continue;
        queue.splice(i, 1);
        j.resolve({ id: j.req.id, ok: false, error: 'superseded' });
      }
    queue.push({ req, owner, resolve });
    next();
  });
  if (!res.ok) return res.error === 'timeout' || res.error === 'superseded' ? { error: res.error } : null;
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
