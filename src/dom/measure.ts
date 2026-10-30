// Canvas-backed text measurer (§7.3). One per CoreContext; bounded cache; works in workers via OffscreenCanvas.
import { Lru, fontKey, type FontSpec, type TextMeasurer } from '../core/text/measure.js';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeContext(): Ctx2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1).getContext('2d');
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d');
  } catch {
    // jsdom and locked-down environments have no 2D context
  }
  return null;
}

/** Returns null when no canvas is available (the caller then uses the static measurer). */
export function createCanvasMeasurer(maxEntries = 20000): TextMeasurer | null {
  const ctx = makeContext();
  if (!ctx) return null;
  // jsdom returns a context whose measureText is missing or returns 0 for everything
  try {
    ctx.font = '400 14px sans-serif';
    if (!(ctx.measureText('MMMM').width > 0)) return null;
  } catch {
    return null;
  }
  const cache = new Lru<string, number>(maxEntries);
  let lastFont = '';
  return {
    kind: 'canvas',
    width(text: string, font: FontSpec): number {
      const k = `${fontKey(font)}|${text}`;
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      const css = `${font.style ?? 'normal'} ${font.weight ?? 400} ${font.size}px ${font.family}`;
      if (css !== lastFont) {
        ctx.font = css;
        lastFont = css;
      }
      const w = ctx.measureText(text).width;
      cache.set(k, w);
      return w;
    },
  };
}

/**
 * Resolves once the fonts a theme names are loaded (or failed), so layout measures real glyphs. Calls `onLate`
 * when a font finishes loading after the first render — the caller re-renders once.
 */
export function whenFontsReady(families: readonly string[], onLate: () => void): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const fonts = document.fonts;
  const pending = families.some((f) => {
    try {
      return !fonts.check(`16px ${f}`);
    } catch {
      return false;
    }
  });
  if (!pending) return Promise.resolve();
  void fonts.ready.then(onLate);
  return Promise.resolve();
}
