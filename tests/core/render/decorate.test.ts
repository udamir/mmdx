// decorate() (T10 §4.5): the leading token taken out of a label, the icon's place and size from `iconPos` /
// `iconSize` / `iconColor`, the metadata image's box from `imgW` / `imgH` / the natural size / the default, the content
// block's size, and what is drawn where (the image on top, the icon above, below or left of the text).
import { describe, expect, it } from 'vitest';
import { decorate, decoratedSize, decoration, DECO_GAP, lazyKit, leadingToken, type Decoration } from '../../../src/core/render/decorate.js';
import { forgetMediaKit, registerMediaKit } from '../../../src/core/media/kit.js';
import { MEDIA_KIT } from '../../../src/core/media/kit-impl.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import type { ItemMeta } from '../../../src/core/meta/types.js';
import { serializeNodes } from '../../../src/core/scene/serialize.js';
import { shapeMisses } from '../../../src/core/shapes/misses.js';
import type { Diagnostic } from '../../../src/core/types.js';
import { makeCtx, registry } from './helpers.js';

registerMediaKit(MEDIA_KIT);
const theme = registry.get('default-light');
const ctx = makeCtx(theme, emptyMeta());
const kit = (): typeof MEDIA_KIT => MEDIA_KIT;
const deco = (label: string, meta: ItemMeta = {}, own?: string): Decoration =>
  decoration(ctx, kit, { label, meta, fontSize: 16, color: '#333333', ...(own ? { icon: { written: own, form: 'class' as const } } : {}) });
const IMG = 'https://example.com/a.png';

describe('leadingToken', () => {
  it('takes a leading token the registry draws, and nothing else', () => {
    expect(leadingToken(ctx, 'fa:fa-cog Running')).toEqual({ token: 'fa:fa-cog', rest: 'Running' });
    expect(leadingToken(ctx, '  tabler:user Alice')).toEqual({ token: 'tabler:user', rest: 'Alice' });
    expect(leadingToken(ctx, 'tabler:user')).toEqual({ token: 'tabler:user', rest: '' });
    expect(leadingToken(ctx, 'azure:vision Vision')).toBeNull(); // no such pack registered: text
    expect(leadingToken(ctx, 'Running fa:fa-cog')).toBeNull();
    expect(leadingToken(ctx, 'http://x Running')).toBeNull();
    expect(leadingToken(ctx, 'Plain')).toBeNull();
  });
});

describe('decoration', () => {
  it('a leading token stays inline by default (the text keeps it); iconColor colours the inline icons', () => {
    expect(deco('fa:fa-cog Running')).toEqual({ label: 'fa:fa-cog Running', pos: 'l', icon: null, inlineColor: undefined, image: null });
    expect(deco('fa:fa-cog Running', { iconColor: '#ff0000' }).inlineColor).toBe('#ff0000');
  });

  it('iconPos t / b take the token out at 1.75 em; iconSize takes it out on the left too', () => {
    expect(deco('fa:fa-cog Running', { iconPos: 't' })).toMatchObject({ label: 'Running', pos: 't', icon: { written: 'fa:fa-cog', form: 'token', size: 28, color: '#333333' } });
    expect(deco('fa:fa-cog Running', { iconPos: 'b', iconSize: 40 }).icon).toMatchObject({ size: 40 });
    expect(deco('fa:fa-cog Running', { iconSize: 20 })).toMatchObject({ label: 'Running', pos: 'l', icon: { size: 20 } });
    expect(deco('Running', { iconPos: 't' }).icon).toBeNull();
  });

  it("the item's own icon (mindmap ::icon) goes above by default, at iconPos otherwise; the token stays", () => {
    expect(deco('fa:fa-car Car', {}, 'fa fa-book')).toMatchObject({ label: 'fa:fa-car Car', pos: 't', icon: { written: 'fa fa-book', form: 'class', size: 28 } });
    expect(deco('Book', { iconPos: 'l', iconColor: '@red' }, 'fa fa-book').icon).toMatchObject({ size: 28, color: ctx.color('@red') });
  });

  it('a bad iconPos or iconSize is ignored', () => {
    expect(deco('fa:fa-cog Run', { iconPos: 'x' as 't', iconSize: -3 })).toMatchObject({ pos: 'l', icon: null });
  });

  it('the image: imgW / imgH, one of them with the aspect, the natural size up to 160, else 96 × 72; the fit', () => {
    expect(deco('A', { img: IMG }).image).toEqual({ url: IMG, w: 96, h: 72, fit: 'contain' });
    expect(deco('A', { img: '' }).image).toEqual({ url: '', w: 96, h: 72, fit: 'contain' });
    expect(deco('A', { img: IMG, imgW: 120, imgH: 40, imgFit: 'cover' }).image).toEqual({ url: IMG, w: 120, h: 40, fit: 'cover' });
    expect(deco('A', { img: IMG, imgW: 48 }).image).toMatchObject({ w: 48, h: 36 });
    expect(deco('A', { img: IMG, imgFit: 'odd' as 'cover' }).image?.fit).toBe('contain');
    const sized = { ...ctx, imageSizes: { get: () => ({ w: 400, h: 200 }) } };
    const at = (meta: ItemMeta): Decoration['image'] => decoration(sized, kit, { label: 'A', meta, fontSize: 16, color: undefined }).image;
    expect(at({ img: IMG })).toMatchObject({ w: 160, h: 80 });
    expect(at({ img: IMG, imgH: 50 })).toMatchObject({ w: 100, h: 50 });
    expect(deco('A', { img: 5 as unknown as string }).image).toBeNull();
  });
});

describe('decoratedSize', () => {
  const text = { w: 80, h: 20 };
  it('stacks the image, the icon above or below and the text; puts a left icon beside the text', () => {
    expect(decoratedSize(deco('Run'), text)).toEqual(text);
    expect(decoratedSize(deco('fa:fa-cog Run', { iconPos: 't' }), text)).toEqual({ w: 80, h: 20 + 28 + DECO_GAP });
    expect(decoratedSize(deco('fa:fa-cog Run', { iconPos: 'b', iconSize: 100 }), text)).toEqual({ w: 100, h: 20 + 100 + DECO_GAP });
    expect(decoratedSize(deco('fa:fa-cog Run', { iconSize: 30 }), text)).toEqual({ w: 30 + DECO_GAP + 80, h: 30 });
    expect(decoratedSize(deco('fa:fa-cog', { iconSize: 30 }), { w: 0, h: 0 })).toEqual({ w: 30, h: 30 });
    expect(decoratedSize(deco('Run', { img: IMG }), text)).toEqual({ w: 96, h: 20 + 72 + DECO_GAP });
  });
});

describe('decorate', () => {
  const text = { w: 80, h: 20 };
  const draw = (d: Decoration): { svg: string; box: { x: number; y: number; w: number; h: number }; diagnostics: Diagnostic[] } => {
    const env = { ctx, diagnostics: [] as Diagnostic[] };
    const r = decorate(env, kit, d, 100, 10, text, { key: 'n1', line: 3, color: '#888888', family: 'Inter' });
    return { svg: serializeNodes(r.nodes), box: r.contentBox, diagnostics: env.diagnostics };
  };

  it('no assets: the text box is the block', () => {
    expect(draw(deco('Run'))).toEqual({ svg: '', box: { x: 100, y: 20, w: 80, h: 20 }, diagnostics: [] });
  });

  it('the image on top, then the icon above the text', () => {
    const r = draw(deco('fa:fa-cog Run', { iconPos: 't', img: IMG }));
    expect(r.svg).toMatch(/^<image [^>]*x="52" y="10" width="96" height="72"[^>]*\/><image [^>]*x="86" y="88" width="28" height="28"[^>]*class="mmdx-icon"/);
    expect(r.box).toEqual({ x: 100, y: 88 + 28 + DECO_GAP + 10, w: 80, h: 20 });
  });

  it('the icon below the text', () => {
    const r = draw(deco('fa:fa-cog Run', { iconPos: 'b' }));
    expect(r.box).toEqual({ x: 100, y: 20, w: 80, h: 20 });
    expect(r.svg).toContain(`x="86" y="${10 + 20 + DECO_GAP}" width="28" height="28"`);
  });

  it('the icon left of the text, centred on it', () => {
    const r = draw(deco('fa:fa-cog Run', { iconSize: 30 }));
    // the block is 30 + 6 + 80 wide around x = 100
    expect(r.svg).toContain('x="42" y="10" width="30" height="30"');
    expect(r.box).toEqual({ x: 42 + 30 + DECO_GAP + 40, y: 25, w: 80, h: 20 });
  });

  it('a picture not chosen yet draws the placeholder; a refused one the placeholder and image.blocked at the line', () => {
    expect(draw(deco('A', { img: '' })).svg).toContain('mmdx-image-blocked');
    const r = draw(deco('A', { img: 'http://example.com/a.png' }));
    expect(r.svg).toContain('mmdx-image-blocked');
    expect(r.diagnostics).toMatchObject([{ code: 'image.blocked', source: 'meta', range: { line: 3 } }]);
  });

  it('an unknown icon draws the "?" placeholder', () => {
    const r = draw(decoration(ctx, kit, { label: 'Book', meta: {}, fontSize: 16, color: undefined, icon: { written: 'fa fa-nonexistent-thing', form: 'class' } }));
    expect(r.svg).toMatch(/mmdx-icon(-missing)?/);
  });

  it('without the media kit: nothing drawn (the space stays), one miss counted', () => {
    forgetMediaKit();
    try {
      const before = shapeMisses();
      const k = lazyKit();
      const env = { ctx, diagnostics: [] as Diagnostic[] };
      const d = decoration(ctx, k, { label: 'Run', meta: { img: IMG, iconPos: 't' }, fontSize: 16, color: undefined, icon: { written: 'fa fa-book', form: 'class' } });
      const r = decorate(env, k, d, 0, 0, text, { key: 'n' });
      expect(r.nodes).toEqual([]);
      expect(r.contentBox.y).toBe(72 + DECO_GAP + 28 + DECO_GAP + 10);
      expect(shapeMisses() - before).toBe(1);
    } finally {
      registerMediaKit(MEDIA_KIT);
    }
  });
});
