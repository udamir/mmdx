// Browser-side export (§7.4): PNG through a canvas with the used fonts inlined, and file downloads.

const FAMILY = /^[\w\s.-]+$/;

async function fontFaceCss(fonts: Record<string, string | ArrayBuffer>, used: string): Promise<{ css: string; missing: string[] }> {
  const want = used.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const rules: string[] = [];
  const missing: string[] = [];
  for (const fam of new Set(want)) {
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system)$/i.test(fam)) continue;
    const src = fonts[fam];
    if (!src || !FAMILY.test(fam)) {
      missing.push(fam);
      continue;
    }
    try {
      const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : src;
      rules.push(`@font-face{font-family:"${fam}";src:url(data:${fontMime(buf)};base64,${toBase64(buf)})}`);
    } catch {
      missing.push(fam);
    }
  }
  return { css: rules.join(''), missing };
}

function fontMime(buf: ArrayBuffer): string {
  const sig = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)));
  return sig === 'wOF2' ? 'font/woff2' : sig === 'wOFF' ? 'font/woff' : sig === 'OTTO' ? 'font/otf' : 'font/ttf';
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Every font-family attribute value used in an SVG document string. */
export function usedFonts(svg: string): string {
  const out = new Set<string>();
  for (const m of svg.matchAll(/font-family="([^"]*)"/g)) for (const f of (m[1] ?? '').replace(/&quot;|&#39;/g, '').split(',')) out.add(f.trim());
  return [...out].join(',');
}

export interface PngResult {
  blob: Blob;
  /** Families that had no font source and were left to the machine's local fonts. */
  missingFonts: string[];
}

/** Rasterises a standalone SVG string at `scale` (default 2×). Rejects when the image fails to load. */
export async function svgToPng(svg: string, w: number, h: number, opts: { scale?: number; fonts?: Record<string, string | ArrayBuffer>; background?: string } = {}): Promise<PngResult> {
  const scale = opts.scale ?? 2;
  const { css, missing } = await fontFaceCss(opts.fonts ?? {}, usedFonts(svg));
  const withFonts = css ? svg.replace(/^<svg([^>]*)>/, `<svg$1><style>${css}</style>`) : svg;
  const url = URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The SVG image could not be loaded for PNG export'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const c = canvas.getContext('2d');
    if (!c) throw new Error('No 2D canvas available for PNG export');
    if (opts.background) {
      c.fillStyle = opts.background;
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
    return { blob, missingFonts: missing };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a file through a temporary link. File names are cleaned of path and control characters. */
export function download(name: string, data: string | Blob, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${type};charset=utf-8` }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120) || 'diagram';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
