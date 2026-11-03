// mmdx/worker-inline: the render worker as one classic script, started from a `blob:` URL.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import type { WorkerRequest, WorkerResponse } from '../../src/dom/worker-protocol.js';
import { DEFAULT_IMAGE_POLICY, DEFAULT_LINK_POLICY } from '../../src/core/validate.js';

const load = async (): Promise<{ inline: typeof import('../../src/worker-inline.js'); client: typeof import('../../src/dom/worker-client.js') }> => {
  vi.resetModules();
  return { inline: await import('../../src/worker-inline.js'), client: await import('../../src/dom/worker-client.js') };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workerSource', () => {
  it('is a classic script: no import or export statements', async () => {
    const { inline } = await load();
    expect(inline.workerSource.length).toBeGreaterThan(10_000);
    expect(inline.workerSource).not.toMatch(/(^|[;}\n])\s*(import|export)\s*[{*\w]/);
  });

  it('renders a diagram when run as a worker (its global scope faked)', async () => {
    const { inline } = await load();
    const listeners: ((ev: { data: WorkerRequest }) => void)[] = [];
    const posted: WorkerResponse[] = [];
    const scope = {
      addEventListener: (_t: string, f: (ev: { data: WorkerRequest }) => void) => void listeners.push(f),
      postMessage: (m: WorkerResponse) => void posted.push(m),
    };
    new Function('self', 'addEventListener', 'postMessage', inline.workerSource)(scope, scope.addEventListener, scope.postMessage);
    expect(listeners).toHaveLength(1);
    listeners[0]!({ data: { id: 7, src: 'flowchart LR\n  a --> b', opts: {}, themes: BUILTIN_THEMES, themesKey: '1.0', idPrefix: 't', linkPolicy: DEFAULT_LINK_POLICY, imagePolicy: DEFAULT_IMAGE_POLICY, icons: { packs: [], icons: {} } } });
    expect(posted).toHaveLength(1);
    const res = posted[0]!;
    expect(res.id).toBe(7);
    expect(res.ok && res.model.type).toBe('flowchart');
  });
});

describe('useInlineWorker', () => {
  it('starts a classic worker from a blob: URL, once', async () => {
    const { inline, client } = await load();
    const made: { url: unknown; opts: WorkerOptions | undefined }[] = [];
    vi.stubGlobal('Worker', class {
      constructor(url: unknown, opts?: WorkerOptions) {
        made.push({ url, opts });
      }
      addEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:null/worker');
    expect(inline.useInlineWorker()).toBe(true);
    expect(inline.useInlineWorker()).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('text/javascript');
    expect(await blob.text()).toBe(inline.workerSource);
    void client.renderInWorker('flowchart LR\n  a', (await import('../../src/core/context.js')).createContext());
    expect(made).toEqual([{ url: 'blob:null/worker', opts: { type: 'classic', name: 'mmdx-render' } }]);
  });

  it('returns false without Blob or URL.createObjectURL', async () => {
    const { inline } = await load();
    vi.stubGlobal('Blob', undefined);
    expect(inline.useInlineWorker()).toBe(false);
  });
});
