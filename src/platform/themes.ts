// The shared theme registry's contents: themes a host bundles (registerThemes) and the built-in ones loaded on demand.
import { BUILTIN_IDS } from '../core/theme/builtin-ids.js';
import type { Diagnostic } from '../core/types.js';
import { getShared } from './config.js';

/**
 * Registers theme files into the shared registry every component reads (the theme menus list them), with no loading:
 * themes bundled by the host (`import github from 'mmdx/themes/github-light.theme.json'`), for pages that cannot fetch
 * theme files (sandboxed iframes). A file with the id of a registered theme replaces it. Returns the validation
 * diagnostics (invalid values are dropped).
 */
export function registerThemes(themes: Iterable<unknown>): Diagnostic[] {
  const reg = getShared().themes;
  const out: Diagnostic[] = [];
  for (const t of themes) out.push(...reg.register(t));
  return out;
}

let extras: Promise<void> | null = null;

/**
 * Registers the built-in themes besides baseline into the shared registry (loaded on demand: a page of viewers that
 * only use baseline never downloads them). Components that list themes (editor, theme editor, studio) call it on
 * start; the viewer calls it when a diagram names one of them. Nothing loads when they are registered already
 * (`registerThemes(BUILTIN_THEMES)`).
 */
export function ensureBuiltinThemes(): Promise<void> {
  if (!extras && BUILTIN_IDS.every((id) => getShared().themes.has(id))) return Promise.resolve();
  return (extras ??= import('../core/theme/builtin-extra.js').then(({ EXTRA_THEMES }) => {
    const reg = getShared().themes;
    for (const t of EXTRA_THEMES) if (!reg.has(t.id)) reg.register(t);
  }));
}

/** Registers every built-in theme (`ensureBuiltinThemes`): resolves once they are in the shared registry. */
export const registerBuiltinThemes = (): Promise<void> => ensureBuiltinThemes();
