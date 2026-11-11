// Client of the render worker (§6.4, §12): one module worker per page, shared by every viewer. Jobs run one at a
// time, in order; a job's 2 s timeout starts when the worker takes it (not while it waits behind others), and a
// viewer's newer job replaces its older one still waiting (the older resolves as superseded, never rendered). A job
// that times out restarts the worker and is reported as too large; the jobs behind it run in the new worker. Falls
// back to the main thread when workers are unavailable (CSP without worker-src, file://, old engines) — callers check
// `workerAvailable()`.
import type { CoreContext } from '../core/context.js';
import { iconNamesOf } from '../core/icons/scan.js';
import { renderContext, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import type { ThemeRegistry } from '../core/theme/registry.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { WorkerReady, WorkerRequest, WorkerResponse } from './worker-protocol.js';

/** Diagrams with more source lines than this render in the worker. */
export const WORKER_THRESHOLD_LINES = 300;
/** …or more than this many characters (a few very long lines cost as much as many short ones). */
export const WORKER_THRESHOLD_BYTES = 32 * 1024;
const TIMEOUT_MS = 2000;
/** A worker that has not started this long after it was created (its script never loads): the main thread renders. */
const START_TIMEOUT_MS = 10_000;

interface Job {
  req: WorkerRequest;
  owner: object | null;
  /** The themes, read when the worker needs them (sent once per registry revision per worker). */
  themes(): readonly ThemeFile[];
  resolve(r: WorkerResponse): void;
}

let worker: Worker | null = null;
/** The worker has started: a job's timeout counts from when it takes the job, not from the worker's load. */
let started = false;
let startTimer: ReturnType<typeof setTimeout> | undefined;
/** The theme revisions this worker has been sent. */
let sentThemes = new Set<string>();
let failed = false;
let seq = 0;
/** Jobs waiting for the worker, in order. */
const queue: Job[] = [];
/** The job the worker is on, and its timeout (null until the worker has started). */
let running: { job: Job; timer: ReturnType<typeof setTimeout> | null } | null = null;
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
    started = false;
    sentThemes = new Set();
    clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      if (w !== worker || started) return;
      unavailable(w);
    }, START_TIMEOUT_MS);
    w.addEventListener('message', (ev: MessageEvent<WorkerResponse | WorkerReady>) => {
      if (w !== worker) return;
      const m = ev.data;
      if ('ready' in m) {
        started = true;
        clearTimeout(startTimer);
        if (running && !running.timer) running.timer = timeout(running.job);
        return;
      }
      if (!running || running.job.req.id !== m.id) return;
      // the worker let this revision's themes go: the job again, with them
      if (!m.ok && m.error === 'themes' && !running.job.req.themes) {
        running.job.req.themes = running.job.themes();
        sentThemes.add(running.job.req.themesKey);
        w.postMessage(running.job.req);
        return;
      }
      settle(m);
    });
    w.addEventListener('error', () => {
      if (w === worker) unavailable(w);
    });
    worker = w;
  } catch {
    failed = true;
    worker = null;
  }
  return worker;
}

/** The worker cannot run here: every job renders on the main thread. */
function unavailable(w: Worker): void {
  failed = true;
  clearTimeout(startTimer);
  w.terminate();
  worker = null;
  if (running) settle({ id: running.job.req.id, ok: false, error: 'unavailable' });
}

/** A job that takes too long: the worker is restarted for the jobs behind it. */
function timeout(job: Job): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    worker?.terminate();
    worker = null;
    settle({ id: job.req.id, ok: false, error: 'timeout' });
  }, TIMEOUT_MS);
}

/** The running job is done: its result goes out, the next job starts. */
function settle(res: WorkerResponse): void {
  const r = running;
  if (!r) return;
  if (r.timer) clearTimeout(r.timer);
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
  running = { job, timer: started ? timeout(job) : null };
  if (!sentThemes.has(job.req.themesKey)) {
    job.req.themes = job.themes();
    sentThemes.add(job.req.themesKey);
  }
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
  const themes = (): ThemeFile[] => ctx.themes.list().map((t) => ctx.themes.raw(t.id)).filter((t): t is ThemeFile => !!t);
  const o: WorkerRequest['opts'] = {};
  if (opts.theme) o.theme = opts.theme;
  if (opts.visibleLayers) o.visibleLayers = opts.visibleLayers;
  if (opts.hideLabels) o.hideLabels = true;
  // the icons the source names, resolved here: loading ones start loading, and their pack's change re-renders
  const icons = ctx.icons.snapshot(iconNamesOf(src, ctx.icons));
  const req: WorkerRequest = { id: ++seq, src, opts: o, themesKey: themesKeyOf(ctx.themes), idPrefix: ctx.idPrefix, linkPolicy: ctx.linkPolicy, imagePolicy: ctx.imagePolicy, icons };
  const res = await new Promise<WorkerResponse>((resolve) => {
    if (owner)
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i]!;
        if (j.owner !== owner) continue;
        queue.splice(i, 1);
        j.resolve({ id: j.req.id, ok: false, error: 'superseded' });
      }
    queue.push({ req, owner, themes, resolve });
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
