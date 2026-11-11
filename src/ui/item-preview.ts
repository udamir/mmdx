// Preview of one item type in one style (default or a preset), drawn by the real renderer (ui/item-preview-core.ts)
// with the diagram kinds loaded so far (the editor: its document's type; the theme editor: every type) and the shared
// configuration: the entry the editor's preset pickers and the theme editor use. A host with its own kinds calls
// `drawItemPreviewWith` / `renderItemSampleWith`.
import { instanceContext } from '../platform/config.js';
import { registeredKinds } from '../core/kinds/registry.js';
import type { ResolvedTheme } from '../core/theme/types.js';
import { drawItemPreviewWith, renderItemSampleWith, type ItemPreviewOptions, type PreviewEnv, type PreviewKind, type SampleOptions, type Sampled } from './item-preview-core.js';

export * from './item-preview-core.js';

/** The kinds loaded so far and the shared configuration. */
const allKinds = (): PreviewEnv => ({ kinds: registeredKinds(), ctx: instanceContext() });

/** Renders the sample of `kind` and returns the scene and the context used (no DOM). */
export function renderItemSample(kind: PreviewKind, preset: string | null | undefined, theme: ResolvedTheme, opts: SampleOptions = {}): Sampled {
  return renderItemSampleWith(allKinds(), kind, preset, theme, opts);
}

/**
 * Draws `kind` in `preset` (null: its default style) with theme `theme` into `pic`.
 *   default: real size × zoom — a window the width of pic, centred on the item, at least minH tall; the rest is cropped
 *   fit: { h } — the item scaled down (never up) to fit pic's width × h
 */
export function drawItemPreview(pic: HTMLElement, kind: PreviewKind, preset: string | null | undefined, theme: ResolvedTheme, opts: ItemPreviewOptions = {}): void {
  drawItemPreviewWith(allKinds(), pic, kind, preset, theme, opts);
}
