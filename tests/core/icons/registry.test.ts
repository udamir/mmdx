// The icon registry (T04.1): packs, lazy loaders (once, shared by concurrent lookups, retried 30 s after a failure),
// aliases and transforms, the body validator, extension per component, the built-in set and the Font Awesome
// look-alikes, snapshots for the render worker, Mermaid's pack list. Fixtures: icons from @iconify-json/mdi
// (Apache-2.0), @iconify-json/logos (CC0-1.0) and @iconify-json/tabler (MIT).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { decodeIcon } from '../../../src/core/icons/decode.js';
import { createIconRegistry } from '../../../src/core/icons/index.js';
import { ICON_RETRY_MS, IconRegistry, loadBuiltinIcons } from '../../../src/core/icons/registry.js';
import { cleanIconBody, MAX_ICON_BODY } from '../../../src/core/icons/svg-body.js';
import type { IconData, IconifyJSON, IconResult } from '../../../src/core/icons/types.js';
import { BUILTIN_ICONS, FA_FALLBACK } from '../../../src/icons/builtin.js';

const fixture = (name: string): IconifyJSON => JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8')) as IconifyJSON;
const MDI = fixture('mdi'), LOGOS = fixture('logos'), TABLER = fixture('tabler');
const ready = (r: IconResult): IconData => {
  if (r.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(r)}`);
  return r.icon;
};
const deferred = <T>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const PACK: IconifyJSON = { prefix: 'x', width: 24, height: 24, icons: { dot: { body: '<circle cx="12" cy="12" r="4" fill="currentColor"/>' } } };

describe('real packs', () => {
  it('decodes every icon of the samples (mdi, logos, tabler) and keeps logos multicolour', () => {
    for (const pack of [MDI, LOGOS, TABLER])
      for (const name of Object.keys(pack.icons)) expect(typeof decodeIcon(pack, name), `${pack.prefix}:${name}`).toBe('object');
    const car = decodeIcon(MDI, 'car') as IconData;
    expect(car).toMatchObject({ left: 0, top: 0, width: 24, height: 24, mono: true });
    const ec2 = decodeIcon(LOGOS, 'aws-ec2') as IconData;
    expect(ec2).toMatchObject({ width: 256, height: 256, mono: false });
    expect(ec2.body).toContain('fill="url(#');
    // a logo with a filter, one with a mask and `use`
    expect((decodeIcon(LOGOS, 'brackets') as IconData).body).toContain('<filter');
    expect((decodeIcon(LOGOS, 'apache-camel') as IconData).body).toMatch(/<mask[\s\S]*<use href="#/);
    expect(decodeIcon(TABLER, '12-hours')).toEqual(decodeIcon(TABLER, 'hours-12'));
    expect(decodeIcon(MDI, 'nope')).toBe('missing');
  });

  it('decodes every icon of the built-in set, and every Font Awesome look-alike names one of them', () => {
    const names = Object.keys(BUILTIN_ICONS.icons);
    expect(names.length).toBeGreaterThan(200);
    for (const n of names) expect(typeof decodeIcon(BUILTIN_ICONS, n), n).toBe('object');
    for (const [fa, t] of Object.entries(FA_FALLBACK)) expect(BUILTIN_ICONS.icons[t], `${fa} → ${t}`).toBeDefined();
    expect(BUILTIN_ICONS.prefix).toBe('tabler');
    expect(BUILTIN_ICONS.info?.license?.spdx).toBe('MIT');
  });
});

describe('aliases and transforms', () => {
  const pack: IconifyJSON = {
    prefix: 't', width: 20, height: 10,
    icons: { a: { body: '<path d="M0 0h20v10z"/>' }, tall: { body: '<path d="M0 0h4v8z"/>', width: 4, height: 8, left: 1, top: 2 } },
    aliases: {
      r1: { parent: 'a', rotate: 1 },
      r2: { parent: 'r1', rotate: 1 },
      h: { parent: 'a', hFlip: true },
      hh: { parent: 'h', hFlip: true },
      v: { parent: 'a', vFlip: true },
      hv: { parent: 'h', vFlip: true },
      wide: { parent: 'a', width: 40 },
      loop: { parent: 'loop' },
    },
  };

  it('pack defaults and own boxes', () => {
    expect(decodeIcon(pack, 'a')).toMatchObject({ left: 0, top: 0, width: 20, height: 10 });
    expect(decodeIcon(pack, 'tall')).toMatchObject({ left: 1, top: 2, width: 4, height: 8 });
    expect(decodeIcon(pack, 'wide')).toMatchObject({ width: 40, height: 10 });
    expect(decodeIcon({ prefix: 'd', icons: { z: { body: '<path d="M0 0"/>' } } }, 'z')).toMatchObject({ width: 16, height: 16 });
  });

  it('rotations add up and swap the box; flips toggle (Iconify iconToSVG)', () => {
    const r1 = decodeIcon(pack, 'r1') as IconData;
    expect(r1.body).toBe('<g transform="rotate(90 5 5)"><g fill="currentColor"><path d="M0 0h20v10z"/></g></g>');
    expect([r1.width, r1.height]).toEqual([10, 20]);
    const r2 = decodeIcon(pack, 'r2') as IconData;
    expect(r2.body).toMatch(/^<g transform="rotate\(180 10 5\)">/);
    expect([r2.width, r2.height]).toEqual([20, 10]);
    expect((decodeIcon(pack, 'h') as IconData).body).toMatch(/^<g transform="translate\(20 0\) scale\(-1 1\)">/);
    expect((decodeIcon(pack, 'v') as IconData).body).toMatch(/^<g transform="translate\(0 10\) scale\(1 -1\)">/);
    // two horizontal flips cancel; both flips are a half turn
    expect((decodeIcon(pack, 'hh') as IconData).body).toBe('<g fill="currentColor"><path d="M0 0h20v10z"/></g>');
    expect((decodeIcon(pack, 'hv') as IconData).body).toMatch(/^<g transform="rotate\(180 10 5\)">/);
    expect(decodeIcon(pack, 'loop')).toBe('missing');
  });
});

describe('body validation', () => {
  it('refuses scripts, handlers, external references, foreign content, entities and huge bodies', () => {
    for (const body of [
      '<script>alert(1)</script>',
      '<path d="M0 0" onload="alert(1)"/>',
      '<path d="M0 0" ONCLICK="x"/>',
      '<use href="https://evil.example/x.svg#a"/>',
      '<use xlink:href="javascript:alert(1)"/>',
      '<foreignObject><div/></foreignObject>',
      '<image href="#a"/>',
      '<path fill="url(https://evil.example/p)" d="M0 0"/>',
      '<path style="fill:url(http://x/y)" d="M0 0"/>',
      '<path style="background:expression(alert(1))" d="M0 0"/>',
      '<path d="M0 0">text</path>',
      '<!DOCTYPE svg><path d="M0 0"/>',
      '<path d="&xxe;"/>',
      '<path d=M0/>',
      '<g><path d="M0 0"/>',
      '<g></path>',
      `<path d="${'M0 0'.repeat(MAX_ICON_BODY / 4 + 1)}"/>`,
    ])
      expect(cleanIconBody(body), body.slice(0, 60)).toBeNull();
  });

  it('keeps geometry, paint, local references and paint styles; drops other attributes and comments', () => {
    expect(cleanIconBody('<!-- c --><g class="a" data-x="1" fill="url(#g)"><use xlink:href="#p" style="fill:#f00;cursor:pointer"/></g>')).toBe(
      '<g fill="url(#g)"><use href="#p" style="fill:#f00"/></g>',
    );
    expect(cleanIconBody('<path d="M1 1" fill="#000" title="&quot;x&amp;"/>')).toBe('<path d="M1 1" fill="#000"/>');
  });

  it('a pack icon that fails validation is missing as invalid', async () => {
    const r = createIconRegistry([{ name: 'bad', icons: { prefix: 'bad', icons: { x: { body: '<script/>' } } } }], { builtin: false });
    expect(r.get('bad:x')).toEqual({ status: 'missing', reason: 'invalid' });
  });
});

describe('IconRegistry', () => {
  it('inline packs are ready at once; unknown packs and icons are missing', () => {
    const r = createIconRegistry([{ name: 'x', icons: PACK }, { name: 'mdi', icons: MDI }], { builtin: false });
    expect(ready(r.get('x:dot')).mono).toBe(true);
    expect(ready(r.get('mdi:car')).width).toBe(24);
    expect(r.get('mdi:nope')).toEqual({ status: 'missing', reason: 'icon' });
    expect(r.get('azure:x')).toEqual({ status: 'missing', reason: 'pack' });
    expect(r.has('mdi')).toBe(true);
    expect(r.has('azure')).toBe(false);
    expect(r.packNames().sort()).toEqual(['mdi', 'x']);
  });

  it('the name overrides the pack prefix; a later pack of the same name replaces it', () => {
    const r = createIconRegistry([{ name: 'm', icons: MDI }], { builtin: false });
    expect(r.get('m:car').status).toBe('ready');
    expect(r.get('mdi:car').status).toBe('missing');
    const changes: (readonly string[])[] = [];
    r.onChange((p) => changes.push(p));
    r.add([{ name: 'm', icons: PACK }]);
    expect(r.get('m:car').status).toBe('missing');
    expect(r.get('m:dot').status).toBe('ready');
    expect(changes).toEqual([['m']]);
  });

  it('calls a loader once for concurrent lookups, then emits change', async () => {
    const d = deferred<IconifyJSON>();
    const loader = vi.fn(() => d.promise);
    const r = createIconRegistry([{ name: 'mdi', loader }], { builtin: false });
    const changes: (readonly string[])[] = [];
    r.onChange((p) => changes.push(p));
    expect(r.get('mdi:car')).toEqual({ status: 'loading' });
    expect(r.get('mdi:account')).toEqual({ status: 'loading' });
    const pre = r.preload(['mdi:car', 'mdi:account']);
    expect(loader).toHaveBeenCalledTimes(1);
    d.resolve(MDI);
    await pre;
    expect(changes).toEqual([['mdi']]);
    expect(r.get('mdi:car').status).toBe('ready');
    expect(r.packList()).toEqual([{ name: 'mdi', loaded: true, failed: false, builtin: false }]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a failed load is missing, and tried again on a lookup 30 s later', async () => {
    let now = 1000;
    let fail = true;
    const loader = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return MDI;
    });
    const r = createIconRegistry([{ name: 'mdi', loader }], { builtin: false, now: () => now });
    await r.preload(['mdi:car']);
    expect(r.get('mdi:car')).toEqual({ status: 'missing', reason: 'failed' });
    expect(r.packList()[0]!.failed).toBe(true);
    now += ICON_RETRY_MS - 1;
    expect(r.get('mdi:car').status).toBe('missing');
    expect(loader).toHaveBeenCalledTimes(1);
    fail = false;
    now += 1;
    expect(r.get('mdi:car')).toEqual({ status: 'loading' });
    await r.preload(['mdi:car']);
    expect(r.get('mdi:car').status).toBe('ready');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('a loader that resolves something else fails', async () => {
    const r = createIconRegistry([{ name: 'p', loader: async () => ({ nope: true }) as unknown as IconifyJSON }], { builtin: false });
    await r.preload(['p:a']);
    expect(r.get('p:a')).toEqual({ status: 'missing', reason: 'failed' });
  });

  it('ignores packs without a valid name or content', () => {
    const r = createIconRegistry([{ name: 'bad name', icons: PACK }, { name: 'empty' }, { name: '9x', icons: PACK }], { builtin: false });
    expect(r.packNames()).toEqual([]);
  });

  it('extend: a component\'s packs over the shared ones, sharing their loads and change events', async () => {
    const d = deferred<IconifyJSON>();
    const loader = vi.fn(() => d.promise);
    const shared = createIconRegistry([{ name: 'mdi', loader }, { name: 'x', icons: PACK }], { builtin: false });
    const a = shared.extend([{ name: 'x', icons: { prefix: 'x', icons: { other: { body: '<path d="M0 0"/>' } } } }]);
    const b = shared.extend([]);
    const seen: string[] = [];
    const off = a.onChange((p) => seen.push(`a:${p.join()}`));
    b.onChange((p) => seen.push(`b:${p.join()}`));
    expect(a.get('x:other').status).toBe('ready');
    expect(a.get('x:dot').status).toBe('missing');
    expect(b.get('x:dot').status).toBe('ready');
    expect(a.get('mdi:car').status).toBe('loading');
    expect(b.get('mdi:car').status).toBe('loading');
    d.resolve(MDI);
    await a.preload(['mdi:car']);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(b.get('mdi:car').status).toBe('ready');
    expect(seen).toEqual(['a:mdi', 'b:mdi']);
    off();
    shared.add([{ name: 'y', icons: PACK }]);
    expect(seen).toEqual(['a:mdi', 'b:mdi', 'b:y']);
    expect(a.key).not.toBe(b.key);
  });

  it('loads the decoder on the first lookup when it was not given (the viewer\'s registry)', async () => {
    // the decoder is module state: once any registry had it, lookups are ready at once; here it is the lazy path's contract
    const r = new IconRegistry([{ name: 'x', icons: PACK }], { builtin: false });
    const first = r.get('x:dot');
    expect(['loading', 'ready']).toContain(first.status);
    await r.preload(['x:dot']);
    expect(r.get('x:dot').status).toBe('ready');
  });
});

describe('the built-in set and the Font Awesome look-alikes', () => {
  it('tabler:… loads the built-in chunk once and draws from it', async () => {
    const r = createIconRegistry();
    expect(r.has('tabler')).toBe(true);
    await r.preload(['tabler:car']);
    expect(ready(r.get('tabler:car')).mono).toBe(true);
    expect(r.get('tabler:alien')).toEqual({ status: 'missing', reason: 'icon' });
    expect(r.packList()).toEqual([expect.objectContaining({ name: 'tabler', loaded: true, builtin: true, info: expect.objectContaining({ license: expect.objectContaining({ spdx: 'MIT' }) }) })]);
    expect(await loadBuiltinIcons()).toBe(await loadBuiltinIcons());
  });

  it('fa:fa-car without a Font Awesome pack draws the look-alike, reported as a fallback', async () => {
    const r = createIconRegistry();
    await r.preload(['fa:car', 'fab:github', 'fas:user']);
    const car = r.get('fa:car');
    expect(car).toMatchObject({ status: 'ready', fallback: 'tabler:car' });
    expect(r.get('fab:github')).toMatchObject({ status: 'ready', fallback: 'tabler:brand-github' });
    expect(r.get('fas:user')).toMatchObject({ status: 'ready', fallback: 'tabler:user' });
    expect(r.get('fa:no-such-icon')).toEqual({ status: 'missing', reason: 'icon' });
  });

  it('a registered Font Awesome pack wins; without the built-in set there is no fallback', async () => {
    const fa = createIconRegistry([{ name: 'fa', icons: { prefix: 'fa6-solid', width: 512, height: 512, icons: { car: { body: '<path fill="currentColor" d="M0 0h512v512z"/>' } } } }]);
    expect(fa.get('fa:car')).toMatchObject({ status: 'ready' });
    expect(fa.get('fa:car')).not.toHaveProperty('fallback');
    const none = createIconRegistry([], { builtin: false });
    expect(none.get('fa:car')).toEqual({ status: 'missing', reason: 'pack' });
    expect(none.has('tabler')).toBe(false);
  });

  it('a host\'s own tabler pack replaces the built-in subset; builtin can be turned off and on', async () => {
    const r = createIconRegistry([{ name: 'tabler', icons: TABLER }]);
    expect(r.get('tabler:hours-12').status).toBe('ready');
    expect(r.packList()[0]!.builtin).toBe(false);
    const s = createIconRegistry();
    s.setBuiltin(false);
    expect(s.has('tabler')).toBe(false);
    s.setBuiltin(true);
    expect(s.has('tabler')).toBe(true);
  });
});

describe('snapshots and Mermaid', () => {
  it('a snapshot carries the lookups and the pack names; a registry from it answers the same', async () => {
    const r = createIconRegistry([{ name: 'mdi', icons: MDI }]);
    await r.preload(['fa:car']);
    const s = r.snapshot(['mdi:car', 'fa:car', 'azure:vm']);
    expect(Object.keys(s.icons)).toEqual(['mdi:car', 'fa:car', 'azure:vm']);
    expect(s.packs.sort()).toEqual(['mdi', 'tabler']);
    const w = IconRegistry.fromSnapshot(JSON.parse(JSON.stringify(s)) as typeof s);
    expect(w.get('mdi:car')).toEqual(r.get('mdi:car'));
    expect(w.get('fa:car')).toMatchObject({ status: 'ready', fallback: 'tabler:car' });
    expect(w.get('azure:vm')).toEqual({ status: 'missing', reason: 'pack' });
    expect(w.get('mdi:other')).toEqual({ status: 'missing', reason: 'icon' });
    expect(w.resolve('mdi:car Car')).toBeNull();
    expect(w.resolve('mdi:car')).toBe('mdi:car');
    expect(w.resolve('azure:vm')).toBeNull();
  });

  it('mermaidPacks: loaded packs as icons, the others through loaders that share the registry\'s load', async () => {
    const loader = vi.fn(async () => MDI);
    const r = createIconRegistry([{ name: 'x', icons: PACK }, { name: 'mdi', loader }]);
    const packs = r.mermaidPacks();
    expect(packs.map((p) => p.name).sort()).toEqual(['mdi', 'tabler', 'x']);
    expect(packs.find((p) => p.name === 'x')!.icons).toBe(PACK);
    const mdi = packs.find((p) => p.name === 'mdi')!;
    expect(await mdi.loader!()).toBe(MDI);
    expect(r.get('mdi:car').status).toBe('ready');
    expect(loader).toHaveBeenCalledTimes(1);
    const tabler = await packs.find((p) => p.name === 'tabler')!.loader!();
    expect(tabler.icons['car']).toBeDefined();
  });
});
