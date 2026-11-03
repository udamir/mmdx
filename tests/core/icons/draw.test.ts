// Icons in the scene (T04.3): a lookup drawn as an image (goldens: a monochrome icon recoloured per theme, a
// multicolour logo unchanged, the loading box, the "?" placeholder), the URL cache, the diagnostics, and label tokens
// through `iconResolver` and `parseInline` (golden: a label with icons, drawn by `richText`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext } from '../../../src/core/context.js';
import { drawIcon, iconImage, iconResolver, iconSvg, iconUrl, ICON_LOADING_URL } from '../../../src/core/icons/draw.js';
import { createIconRegistry } from '../../../src/core/icons/index.js';
import type { IconData, IconifyJSON } from '../../../src/core/icons/types.js';
import { renderSource } from '../../../src/core/pipeline.js';
import { richText } from '../../../src/core/render/rich-text.js';
import { serializeNodes } from '../../../src/core/scene/serialize.js';
import { createStaticMeasurer, type FontSpec } from '../../../src/core/text/measure.js';
import { parseInline, runsLabel, wrapRuns } from '../../../src/core/text/rich.js';
import type { Diagnostic } from '../../../src/core/types.js';

const fixture = (name: string): IconifyJSON => JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8')) as IconifyJSON;
const measure = createStaticMeasurer();
const font: FontSpec = { size: 14, weight: 400, family: 'Inter, sans-serif' };
const BOX = { x: 10, y: 20, w: 24, h: 24 };
const decodeUrl = (href: string): string => decodeURIComponent(href.replace(/^data:image\/svg\+xml,/, ''));

const icons = createIconRegistry([{ name: 'mdi', icons: fixture('mdi') }, { name: 'logos', icons: fixture('logos') }]);
const env = (): { ctx: { icons: typeof icons }; diagnostics: Diagnostic[] } => ({ ctx: { icons }, diagnostics: [] });

describe('drawIcon (goldens)', () => {
  it('a monochrome icon takes the item colour of each theme', () => {
    const light = serializeNodes(drawIcon(env(), 'mdi:car', { box: BOX, color: '#1f2328' }));
    const dark = serializeNodes(drawIcon(env(), 'mdi:car', { box: BOX, color: '#e6edf3' }));
    expect(light).toMatchSnapshot();
    expect(dark).toMatchSnapshot();
    const svg = (s: string): string => decodeUrl(/href="([^"]+)"/.exec(s)![1]!.replace(/&amp;/g, '&'));
    expect(svg(light)).toContain('fill="#1f2328"');
    expect(svg(dark)).toContain('fill="#e6edf3"');
    expect(svg(light)).not.toContain('currentColor');
  });

  it('a multicolour logo keeps its colours', () => {
    const out = serializeNodes(drawIcon(env(), 'logos:aws-ec2', { box: BOX, color: '#e6edf3' }));
    expect(out).toMatchSnapshot();
    expect(out).not.toContain(encodeURIComponent('#e6edf3'));
    expect(out).toContain(encodeURIComponent('#c8511b'));
  });

  it('an icon still loading is an empty box of its size; a missing one the placeholder with icon.unknown, once', async () => {
    const reg = createIconRegistry([{ name: 'slow', loader: () => new Promise<IconifyJSON>(() => undefined) }], { builtin: false });
    const e = { ctx: { icons: reg }, diagnostics: [] as Diagnostic[] };
    const loading = drawIcon(e, 'slow:x', { box: BOX });
    expect(serializeNodes(loading)).toMatchSnapshot();
    expect(loading[0]).toMatchObject({ t: 'image', href: ICON_LOADING_URL });
    const missing = serializeNodes(drawIcon(e, 'azure:computer-vision', { box: BOX, line: 3 }));
    drawIcon(e, 'azure:other', { box: BOX, line: 4 });
    expect(missing).toMatchSnapshot();
    expect(missing).toContain('mmdx-icon-missing');
    expect(e.diagnostics).toEqual([
      { severity: 'warning', code: 'icon.unknown', message: 'Icons from "azure" are not available', range: { line: 3 }, params: { name: 'azure:computer-vision', pack: 'azure', reason: 'pack' } },
    ]);
    drawIcon(e, 'not an icon', { box: BOX });
    expect(e.diagnostics[1]).toMatchObject({ code: 'icon.unknown', params: { reason: 'icon' } });
  });

  it('mindmap classes and Font Awesome look-alikes (icon.fa-fallback)', async () => {
    await icons.preload(['fa:car']);
    const e = env();
    const out = drawIcon(e, 'fa fa-car', { box: BOX, form: 'class', source: 'code', line: 1 });
    expect(out[0]).toMatchObject({ t: 'image', attrs: { 'aria-label': 'car', class: 'mmdx-icon' } });
    expect(e.diagnostics).toEqual([expect.objectContaining({ severity: 'info', code: 'icon.fa-fallback', source: 'code', params: { name: 'fa:car', fallback: 'tabler:car' } })]);
  });
});

describe('icon URLs', () => {
  const icon = { body: '<path fill="currentColor" d="M0 0h4v4z"/>', left: 0, top: 0, width: 4, height: 4, mono: true } satisfies IconData;

  it('one document per icon, colour and size, cached; only colour literals are baked in', () => {
    expect(iconSvg(icon, 'red', 16)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4" width="16" height="16"><path fill="red" d="M0 0h4v4z"/></svg>');
    expect(iconSvg(icon, 'url(#x)')).toContain('fill="currentColor"');
    expect(iconSvg(icon, '"/><script>')).toContain('fill="currentColor"');
    expect(iconUrl(icon, '#123', 16)).toBe(iconUrl(icon, '#123', 16));
    expect(iconUrl(icon, '#123', 16)).not.toBe(iconUrl(icon, '#123', 20));
    expect(iconUrl(icon, '#123')).not.toBe(iconUrl(icon, '#456'));
    // a multicolour icon ignores the colour, so every colour shares one URL
    const logo = { ...icon, mono: false, body: '<path fill="#f90" d="M0 0"/>' };
    expect(iconUrl(logo, '#123')).toBe(iconUrl(logo, '#456'));
  });

  it('iconImage reports the status it drew', () => {
    expect(iconImage(icons, 'mdi:car').status).toBe('ready');
    expect(iconImage(icons, 'mdi:nope')).toMatchObject({ status: 'missing', name: 'nope' });
  });
});

describe('label tokens (iconResolver + parseInline)', () => {
  it('turns tokens of registered packs and Font Awesome into icon runs; others stay text (golden)', async () => {
    await icons.preload(['fa:car', 'tabler:database']);
    const diagnostics: Diagnostic[] = [];
    const resolve = iconResolver({ icons }, '#1f2328', 14, { diagnostics, line: 2 });
    const runs = parseInline('fa:fa-car Car in mdi:database and tabler:database, not azure:vm or Note: x', { icons: resolve, iconSize: 14 });
    expect(runsLabel(runs)).toBe('car Car in database and database, not azure:vm or Note: x');
    expect(runs.filter((r) => r.icon).length).toBe(3);
    const svg = serializeNodes(richText(wrapRuns(runs, 0, font, measure), 100, 50, { size: 14, family: 'Inter, sans-serif', color: '#1f2328', measure }));
    expect(svg).toMatchSnapshot();
    expect(diagnostics.map((d) => d.code)).toEqual(['icon.fa-fallback']);
  });

  it('the render context carries the context\'s registry', () => {
    const ctx = createContext({ icons });
    const r = renderSource('flowchart LR\n  a --> b', ctx);
    expect(r.rctx.icons).toBe(icons);
  });
});
