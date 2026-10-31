// Preview of one item type in one style (default or a preset), drawn by the real renderer (ui/item-preview-core.ts)
// with every diagram kind and the shared configuration: the entry the editor's preset pickers and the theme editor
// use. A host that loads kinds on demand calls `drawItemPreviewWith` / `renderItemSampleWith` with its own.
import { instanceContext } from '../config.js';
import { ALL_PARSERS } from '../core/parse/index.js';
import { ALL_RENDERERS } from '../core/render/index.js';
import type { ResolvedTheme } from '../core/theme/types.js';
import { drawItemPreviewWith, renderItemSampleWith, type ItemPreviewOptions, type PreviewEnv, type PreviewKind, type SampleOptions, type Sampled } from './item-preview-core.js';

export * from './item-preview-core.js';

/** Every kind and the shared configuration. */
const allKinds = (): PreviewEnv => ({ kinds: { parsers: ALL_PARSERS, renderers: ALL_RENDERERS }, ctx: instanceContext() });

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
