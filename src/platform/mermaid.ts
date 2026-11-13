// The stock Mermaid bridge (D5): the fallback renderer and the plain-Mermaid views draw through one serial queue.
import type { IconRegistry } from '../core/icons/registry.js';
import type { MermaidLike } from '../ports.js';
import { getShared } from './config.js';

let mermaidQueue: Promise<unknown> = Promise.resolve();
let mermaidInstance: Promise<MermaidLike> | null = null;
/** The `configure({ mermaid })` the instance was loaded for: another one loads again. */
let loadedFor: unknown = undefined;
/** Kept in a variable so no bundler sees a module name to resolve. */
const MERMAID_MODULE: string = 'mermaid';

/** The icon packs Mermaid has (Mermaid keeps one global set): registered again when another set is due. */
let mermaidIcons = '';

/**
 * Renders with stock Mermaid through one serial queue shared by all instances (Mermaid keeps global config and
 * measures in document.body), in a detached light-DOM container, with securityLevel strict (§8.1). Mermaid receives
 * the component's icon packs first (`registerIconPacks`, the built-in set under `tabler` included), sharing the
 * registry's loads, so its `fa:` tokens and icon nodes draw from the same packs.
 */
export function renderWithMermaid(code: string, dark: boolean, icons: IconRegistry = getShared().icons): Promise<string> {
  const s = getShared();
  if (s.mermaid !== loadedFor) {
    loadedFor = s.mermaid;
    mermaidInstance = null;
    mermaidIcons = '';
  }
  mermaidInstance ??= (async () => {
    const m = s.mermaid;
    // a loader may resolve to the module (`() => import('mermaid')`) or to the instance
    if (typeof m === 'function') {
      const r = await m();
      return 'default' in r ? r.default : r;
    }
    if (m) return m;
    // an opaque run-time import (old D5): a literal `import('mermaid')` made every consumer's bundler resolve the
    // optional peer and fail without it. This one works where `mermaid` resolves at run time (Node, an import map);
    // a bundled app passes `configure({ mermaid: () => import('mermaid') })`.
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ MERMAID_MODULE)) as { default: MermaidLike };
    return mod.default;
  })();
  // a failed load is not kept: the next render tries again (Mermaid installed or configured meanwhile)
  const loading = mermaidInstance;
  loading.catch(() => {
    if (mermaidInstance === loading) mermaidInstance = null;
  });
  const job = mermaidQueue.then(async () => {
    const mermaid = await mermaidInstance!;
    if (mermaid.registerIconPacks && icons.key !== mermaidIcons) {
      const packs = icons.mermaidPacks();
      if (packs.length) mermaid.registerIconPacks(packs);
      mermaidIcons = icons.key;
    }
    // theme, look and layout given explicitly: Mermaid 12 changed their defaults (redux-color, neo, ELK), and the
    // fallback should look like mmdx's light or dark scheme whichever Mermaid the host installed (10 to 12)
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', look: 'classic', layout: 'dagre' });
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
    document.body.append(box);
    try {
      const { svg } = await mermaid.render(`mmdx-m${Math.random().toString(36).slice(2)}`, code, box);
      return svg;
    } finally {
      box.remove();
    }
  });
  mermaidQueue = job.catch(() => undefined);
  return job;
}
