// The options every product element takes for its kernel (A9): the chrome's scheme, the themes, the compact preset,
// the wheel and where UI preferences live — applied by one function, so the viewer, the editor and the diff cannot
// drift in how they treat them.
import type { StorageAdapter } from '../ports.js';
import type { WheelMode } from '../dom/viewport.js';
import type { ViewCore, ViewCoreOptions } from './core.js';
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

/** What a product passes on to its kernel when it is created: the options above it reads once, and the shared services. */
export type KernelCreateOptions = Pick<ViewCoreOptions, 'storage' | 'ctx' | 'iconPacks' | 'themeSource' | 'ui' | 'theme' | 'themeDark' | 'compact'>;

/** The kernel's options out of a product's (X12): only those set, so the kernel keeps its own defaults for the others. */
export function kernelOptions(o: { readonly [K in keyof KernelCreateOptions]?: KernelCreateOptions[K] | undefined }): KernelCreateOptions {
  return {
    ...(o.storage ? { storage: o.storage } : {}),
    ...(o.ctx ? { ctx: o.ctx } : {}),
    ...(o.iconPacks ? { iconPacks: o.iconPacks } : {}),
    ...(o.themeSource ? { themeSource: o.themeSource } : {}),
    ...(o.ui ? { ui: o.ui } : {}),
    ...(o.theme ? { theme: o.theme } : {}),
    ...(o.themeDark ? { themeDark: o.themeDark } : {}),
    ...(o.compact !== undefined ? { compact: o.compact } : {}),
  };
}

/** Applies the kernel options a patch changes; `wheel` falls back to the product's default. */
export function applyKernelPatch(core: Pick<ViewCore, 'setStorage' | 'setUi' | 'themes' | 'setCompact' | 'canvas'>, patch: { readonly [K in keyof KernelOptions]?: KernelOptions[K] | undefined }, defaults: { wheel: WheelMode }): void {
  if ('storage' in patch) core.setStorage(patch.storage);
  if ('ui' in patch) core.setUi(patch.ui);
  if ('theme' in patch) core.themes.attr.set(patch.theme ?? null);
  if ('themeDark' in patch) core.themes.attrDark.set(patch.themeDark ?? null);
  if ('compact' in patch) core.setCompact(patch.compact ?? 'auto');
  if ('wheel' in patch) core.canvas.setOptions({ wheel: patch.wheel ?? defaults.wheel });
}
