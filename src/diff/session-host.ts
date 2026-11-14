// What a DiffSession reads from the kernel it is shown in (A13a, X12 sessionHost): the core context, the messages, the
// render options of the view (its theme, labels and visible layers), loading a theme and the chrome scheme — one
// binding for the diff element and for History, which wrote it out each.
import type { ViewCore } from '../view/core.js';
import type { DiffSessionOptions } from './session.js';

export type SessionHost = Pick<DiffSessionOptions, 'ctx' | 't' | 'renderOptions' | 'ensureTheme' | 'scheme'>;

export function sessionHost(core: ViewCore): SessionHost {
  return {
    ctx: core.ctx,
    t: core.i18n.t,
    renderOptions: () => core.renderOptions(),
    ensureTheme: (id) => core.ensureTheme(id),
    scheme: () => core.scheme.peek(),
  };
}
