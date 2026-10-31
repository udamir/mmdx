// WCAG 2.x contrast (§8.3): the theme editor warns about text on a fill below AA (4.5:1). Pure; #hex colours only.
import { hexToRgb } from './colors.js';

/** WCAG relative luminance of a #hex colour (null for anything else). */
export function luminance(c: string): number | null {
  const rgb = hexToRgb(c);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #hex colours (1 to 21), or null when either is not one. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
