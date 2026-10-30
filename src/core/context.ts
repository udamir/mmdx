// CoreContext with the built-in themes as the default registry (Node, SSR, the editor).
import { createContextWith, type CoreContext } from './context-base.js';
import { createDefaultRegistry } from './theme/builtin.js';

export { createContextWith, nextIdPrefix, type CoreContext } from './context-base.js';

export function createContext(opts: Partial<CoreContext> = {}): CoreContext {
  return createContextWith({ ...opts, themes: opts.themes ?? createDefaultRegistry() });
}
