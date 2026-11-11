// The options every product element takes for its kernel (A9): the chrome's scheme, the themes, the compact preset,
// the wheel and where UI preferences live — applied by one function, so the viewer, the editor and the diff cannot
// drift in how they treat them.
import type { StorageAdapter } from '../ports.js';
import type { WheelMode } from '../dom/viewport.js';
import type { ViewCore } from './core.js';
import type { UiOption } from './theme.js';

export interface KernelOptions {
  ui?: UiOption;
  theme?: string;
  themeDark?: string;
  compact?: boolean | 'auto';
  wheel?: WheelMode;
  storage?: StorageAdapter;
}

export const KERNEL_OPTION_KEYS: readonly (keyof KernelOptions)[] = ['ui', 'theme', 'themeDark', 'compact', 'wheel', 'storage'];

/** Applies the kernel options a patch changes; `wheel` falls back to the product's default. */
export function applyKernelPatch(core: Pick<ViewCore, 'setStorage' | 'setUi' | 'themes' | 'setCompact' | 'canvas'>, patch: { readonly [K in keyof KernelOptions]?: KernelOptions[K] | undefined }, defaults: { wheel: WheelMode }): void {
  if ('storage' in patch) core.setStorage(patch.storage);
  if ('ui' in patch) core.setUi(patch.ui);
  if ('theme' in patch) core.themes.attr.set(patch.theme ?? null);
  if ('themeDark' in patch) core.themes.attrDark.set(patch.themeDark ?? null);
  if ('compact' in patch) core.setCompact(patch.compact ?? 'auto');
  if ('wheel' in patch) core.canvas.setOptions({ wheel: patch.wheel ?? defaults.wheel });
}
