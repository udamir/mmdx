// Tile galleries (TileGallery blocks): an item type's styles — its default (per shape for nodes and participants, with
// a shape strip) and its presets, drawn by the real renderer — and a diagram type's page presets. Click a tile to style
// it with the floating toolbar. As the draft changes, a gallery redraws only the tiles the changed paths affect; a
// hidden one (closed card) catches up when it is shown.
import { THEME_SECTIONS, type ThemeSectionItem } from '../core/schema/style-fields.js';
import { resolveColor } from '../core/theme/colors.js';
import type { DiagramType } from '../core/types.js';
import { isColorLiteral } from '../core/validate.js';
import { createSegmented } from '../ui/blocks/segmented.js';
import { createTileGallery, type Tile } from '../ui/blocks/tile-gallery.js';
import { createToolbar } from '../ui/blocks/toolbar.js';
import { h } from '../ui/h.js';
import { drawItemPreview, type PreviewKind } from '../ui/item-preview.js';
import { shapePreview } from '../ui/style-toolbar.js';
import { LINE_KINDS, SHAPE_TABS, UNDRAWN, type ShapeTabs } from './constants.js';
import type { Env, GalleryRef } from './env.js';
import type { TileSel } from './types.js';
import { derived, obj, slug } from './util.js';

/** Key of an item's default tile (preset names are slugs, so it cannot clash). */
const DEFAULT = '@default';
const TYPE_KEYS = new Set<string>(THEME_SECTIONS.map((s) => s.type));

/** Which tiles of a gallery for `type` the touched paths change: all of them, some presets, or none. */
function affected(paths: ReadonlySet<string>, type: DiagramType, own: (b: string, c: string | undefined) => 'all' | 'one' | 'none'): { all: boolean; names: Set<string> } {
  const names = new Set<string>();
  for (const p of paths) {
    const [a = '', b, c] = p.split('.');
    if (UNDRAWN.has(a)) continue;
    // palette, font, appearance, page colours, parent: every tile
    if (a !== type) {
      if (TYPE_KEYS.has(a)) continue;
      return { all: true, names };
    }
    if (b === undefined) return { all: true, names };
    const r = own(b, c);
    if (r === 'all') return { all: true, names };
    if (r === 'one' && c !== undefined) names.add(c);
  }
  return { all: false, names };
}

/** Shows the gallery's tiles redrawn when it is visible; a hidden gallery waits until it is shown. */
function register(env: Env, el: HTMLElement, refresh: (paths: ReadonlySet<string> | null) => void): void {
  let stale = false;
  const ref: GalleryRef = {
    el,
    refresh(paths) {
      if (!el.isConnected || el.closest('[hidden]')) stale = true;
      else refresh(paths);
    },
    wake() {
      if (!stale) return;
      stale = false;
      refresh(null);
    },
  };
  env.galleries.add(ref);
  env.scope().add(() => env.galleries.delete(ref));
}

/** Tile widths follow the panel width: redraws the crops when it changes (the timer goes with the main column). */
function observeWidth(env: Env, el: HTMLElement, redraw: () => void): void {
  if (typeof ResizeObserver === 'undefined') return;
  let lastW = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (!w || Math.abs(w - lastW) < 4) return;
    const first = !lastW;
    lastW = w;
    clearTimeout(timer);
    if (first) redraw();
    else timer = setTimeout(redraw, 120);
  });
  ro.observe(el);
  env.scope().add(() => {
    clearTimeout(timer);
    ro.disconnect();
  });
}

const dotmark = (): HTMLElement => h('span', { class: 'te-dotmark', 'aria-hidden': 'true' });

/** An item type's styles: the default (per shape) and the presets, each a tile drawn by the renderer. */
export function itemGallery(env: Env, box: HTMLElement, type: DiagramType, it: ThemeSectionItem): void {
  const { t, draft } = env;
  const props = h('div', { class: 'te-props' });
  box.dataset['item'] = `${type}.${it.key}`;
  // nodes / participants: one tab per shape; each shape has its own default style and its own presets
  const tabs = SHAPE_TABS[it.preview ?? it.key];
  const curShape = (): string => (tabs ? (env.tabShape[it.key] ??= tabs.def) : '');
  const shapesPath = (shape: string): string => `${type}.${tabs?.key ?? ''}.${shape}`;
  const names = (): string[] => {
    if (!it.presets) return [];
    const all = draft.allPresets(type, it.presets);
    return Object.keys(all).filter((n) => !tabs || tabs.of(obj(all[n])) === curShape());
  };
  const selFor = (preset: string | null): TileSel => {
    const s: TileSel = { type, kind: it.key, preset, fields: it.fields, props };
    if (it.presets) s.presets = it.presets;
    if (tabs) {
      s.shape = curShape();
      s.shapesKey = tabs.key;
    }
    return s;
  };
  const shapeLabel = (s = curShape()): string => env.tf(`te.shape.${s}`, tabs?.shapes.find(([k]) => k === s)?.[1] ?? s);
  const pics = new Map<string, HTMLElement>();

  const makeTile = (key: string): Tile => {
    const preset = key === DEFAULT ? null : key;
    const s = selFor(preset);
    const dirty = preset === null ? (tabs ? shapesPath(curShape()) : `${type}.${it.key}`) : `${type}.${it.presets}.${preset}`;
    const pic = h('span', { class: 'te-tile-pic', 'aria-hidden': 'true' });
    pics.set(key, pic);
    const capText = preset ?? (tabs ? t('te.shapeDefault', { shape: shapeLabel() }) : t('te.default'));
    const cap = h('span', { class: 'te-tile-cap' }, capText);
    const rawT = obj(draft.current()?.[type]);
    if (preset !== null && !draft.isBase() && Object.keys(obj(obj(rawT[it.presets ?? ''])[preset])).length) cap.append(dotmark());
    if (preset === null && Object.keys(obj(tabs ? obj(rawT[tabs.key])[curShape()] : rawT[it.key])).length && (!draft.isBase() || tabs)) cap.append(dotmark());
    // WCAG AA: text colour on the fill
    const ratio = draft.lowContrast(s);
    const warn = ratio === null ? null : t('te.lowContrast', { ratio: (Math.floor(ratio * 10) / 10).toFixed(1) });
    if (warn) cap.append(h('span', { class: 'te-warn', title: warn }, '⚠ AA'));
    const tile: Tile = {
      key, label: warn ? `${capText}. ${warn}` : capText, content: [pic, cap],
      attrs: { 'data-type': type, 'data-kind': it.key, 'data-preset': preset ?? '', 'data-shape': tabs ? curShape() : '', 'data-dirty': dirty },
    };
    // a preset the theme added (not inherited) can be deleted
    if (preset !== null && it.presets && !obj(obj(draft.parent.peek()?.[type])[it.presets])[preset]) tile.onDelete = () => void deletePreset(env, preset, [type, it.presets!, preset]);
    return tile;
  };
  // drawn in the page: the crop needs the tile width and the item's measured box (real size × the tile zoom)
  const draw = (key: string): void => {
    const pic = pics.get(key);
    if (!pic) return;
    const th = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(gallery.el).getPropertyValue('--th')) : NaN;
    const shape = tabs ? curShape() : undefined;
    drawItemPreview(pic, (it.preview ?? it.key) as PreviewKind, key === DEFAULT ? null : key, draft.resolved.peek(), { zoom: env.zoom.peek(), minH: Number.isFinite(th) && th > 0 ? th : 90, ctx: env.ctx, ...(shape ? { shape } : {}) });
  };

  const selected = derived(() => {
    const s = env.sel();
    return s && s.type === type && s.kind === it.key && (s.shape ?? '') === (tabs ? curShape() : '') ? s.preset ?? DEFAULT : null;
  });
  const gallery = createTileGallery({
    label: env.tf(`te.item.${it.key}`, it.label), tiles: [], selected, readOnly: !env.canEdit(),
    onSelect: (key) => env.selectTile(selFor(key === DEFAULT ? null : key)),
    deleteLabel: t('te.deletePreset'), class: 'te-tiles', tileClass: 'te-tile', deleteClass: 'te-tile-del', addClass: 'te-tile-add',
    attrs: { 'data-kind': it.key },
    add: it.presets ? { label: t('te.addPreset'), title: t('te.addPresetTitle'), onClick: () => void addPreset(env, type, it, curShape(), tabs, selFor) } : null,
  });
  env.scope().add(() => gallery.destroy());

  // the shape strip: one icon button per shape, with the number of its presets
  let strip: { el: HTMLElement; update(): void } | null = null;
  if (tabs) {
    const shape = derived(() => curShape());
    const options = (): { value: string; label: string; tip: string; icon: () => SVGElement }[] => {
      const ps = it.presets ? draft.allPresets(type, it.presets) : {};
      return tabs.shapes.map(([value]) => {
        const label = shapeLabel(value);
        const n = Object.keys(ps).filter((p) => tabs.of(obj(ps[p])) === value).length;
        const tip = n ? t('te.shapePresets', { label, n }) : label;
        return { value, label: tip, tip, icon: () => shapePreview(value, 22) };
      });
    };
    const seg = createSegmented({
      label: t('tb.shape'), value: shape, options: options(), buttonClass: 'te-shape', f: 'shape',
      onChange: (v) => {
        env.tabShape[it.key] = v;
        env.selectTile(null);
        full();
      },
    });
    const bar = createToolbar({ label: t('tb.shape'), orientation: 'horizontal', items: [seg.el], class: 'te-shapes', tooltip: 'above' });
    // each button: the number of the shape's presets, and the paths it shows (unsaved-change marks)
    const decorate = (): void => {
      const ps = it.presets ? draft.allPresets(type, it.presets) : {};
      seg.el.querySelectorAll<HTMLButtonElement>('button[data-value]').forEach((b) => {
        const value = b.dataset['value']!;
        const mine = Object.keys(ps).filter((p) => tabs.of(obj(ps[p])) === value);
        b.dataset['dirty'] = [shapesPath(value), ...mine.map((n) => `${type}.${it.presets}.${n}`)].join('|');
        b.append(h('span', { class: 'te-shape-n', 'aria-hidden': 'true' }, mine.length ? String(mine.length) : ''));
      });
    };
    strip = {
      el: bar.el,
      update: () => {
        seg.update({ options: options() });
        decorate();
        env.decorate(bar.el);
      },
    };
    decorate();
    env.scope().add(() => {
      seg.destroy();
      bar.destroy();
    });
  }
  box.append(...(strip ? [strip.el] : []), gallery.el, props);

  let shown: string[] = [];
  const full = (): void => {
    pics.clear();
    shown = [DEFAULT, ...names()];
    gallery.update({ tiles: shown.map(makeTile) });
    for (const k of shown) draw(k);
    strip?.update();
    env.decorate(gallery.el);
  };
  const one = (key: string): void => {
    if (!gallery.setTile(makeTile(key))) return;
    draw(key);
    env.decorate(gallery.tile(key)!.parentElement!);
  };
  register(env, gallery.el, (paths) => {
    if (!paths || [DEFAULT, ...names()].join('|') !== shown.join('|')) return full();
    let strips = false;
    const hit = affected(paths, type, (b, c) => {
      // its presets: only that tile; its default or its shape's default: every tile (presets inherit)
      if (b === it.presets) return (strips = true, c === undefined ? 'all' : 'one');
      if (tabs && b === tabs.key) return (strips = true, c === undefined || c === curShape() ? 'all' : 'none');
      if (b === it.key) return 'all';
      // other items' presets and the page presets do not show here; their default styles may (an edge's nodes)
      return b.endsWith('Presets') ? 'none' : 'all';
    });
    for (const k of hit.all ? shown : [...hit.names].filter((n) => shown.includes(n))) one(k);
    if (strips || hit.all) strip?.update();
  });
  full();
  observeWidth(env, gallery.el, () => shown.forEach(draw));
}

async function deletePreset(env: Env, label: string, path: string[]): Promise<void> {
  const { t } = env;
  if (!(await env.dialogs.confirm(t('te.deletePresetQ', { name: label }), '', { ok: t('te.delete'), cancel: t('te.cancel'), danger: true }))) return;
  env.selectTile(null);
  env.draft.set(path, undefined);
  env.flush();
}

async function addPreset(env: Env, type: DiagramType, it: ThemeSectionItem, shape: string, tabs: ShapeTabs | undefined, selFor: (p: string | null) => TileSel): Promise<void> {
  const { t } = env;
  if (!it.presets) return;
  const all = Object.keys(env.draft.allPresets(type, it.presets));
  const raw = await env.dialogs.prompt(t('te.presetName'), { label: t('te.presetName'), ok: t('te.addPreset').replace(/^\+\s*/, ''), validate: (v) => (all.includes(slug(v)) ? t('te.presetExists') : null) });
  const n = slug(raw ?? '');
  if (!raw || !n || n === 'theme' || all.includes(n)) return;
  // a node / participant preset belongs to the shape tab it was added on
  env.draft.set([type, it.presets, n], LINE_KINDS.has(it.key) ? { color: '@azure' } : tabs ? { fill: '@cream', for: shape } : { fill: '@cream' });
  env.flush();
  env.selectTile(selFor(n));
}

/** A diagram type's page presets (`<type>.pagePresets`): tiles showing the page colours, ratio and routing. */
export function pagePresetGallery(env: Env, box: HTMLElement, type: DiagramType): void {
  const { t, draft } = env;
  const props = h('div', { class: 'te-props' });
  box.dataset['item'] = `${type}.pagePresets`;
  const selFor = (name: string): TileSel => ({ type, kind: 'page', presets: 'pagePresets', preset: name, fields: [], props });
  const tiles = (): Tile[] => {
    const all = draft.allPresets(type, 'pagePresets');
    const d = draft.resolved.peek();
    const color = (v: unknown): string | null => {
      const r = resolveColor(v, d.palette, d.basePalette);
      return isColorLiteral(r) && r !== 'none' && r !== 'transparent' ? r : null;
    };
    return Object.entries(all).map(([name, p0]) => {
      const p = obj(p0);
      const label = typeof p['label'] === 'string' && p['label'] ? p['label'] : name;
      const bg = color(p['background'] ?? d.canvas.background), grid = color(p['grid'] ?? d.canvas.grid), border = color(p['border'] ?? d.canvas.border);
      const pic = h('span', { class: 'te-page-pic' + (bg ? '' : ' clear'), 'aria-hidden': 'true' });
      if (bg) pic.style.setProperty('--pg-bg', bg);
      if (grid) pic.style.setProperty('--pg-grid', grid);
      if (border) pic.style.setProperty('--pg-border', border);
      const facts = [typeof p['ratio'] === 'string' ? p['ratio'] : '', typeof p['routing'] === 'string' ? env.tf(`ptb.routing.${p['routing']}`, String(p['routing'])) : '', p['mirror'] === true ? '⇅' : ''].filter(Boolean).join(' · ');
      if (facts) pic.append(h('span', null, facts));
      const cap = h('span', { class: 'te-tile-cap' }, label);
      if (!draft.isBase() && Object.keys(obj(obj(obj(draft.current()?.[type])['pagePresets'])[name])).length) cap.append(dotmark());
      const tile: Tile = { key: name, label, content: [pic, cap], attrs: { 'data-type': type, 'data-kind': 'page', 'data-preset': name, 'data-shape': '', 'data-dirty': `${type}.pagePresets.${name}` } };
      if (!obj(obj(draft.parent.peek()?.[type])['pagePresets'])[name]) tile.onDelete = () => void deletePreset(env, label, [type, 'pagePresets', name]);
      return tile;
    });
  };
  const selected = derived(() => {
    const s = env.sel();
    return s && s.type === type && s.kind === 'page' ? s.preset : null;
  });
  const gallery = createTileGallery({
    label: t('te.pageCard'), tiles: [], selected, readOnly: !env.canEdit(),
    onSelect: (name) => env.selectTile(selFor(name)),
    deleteLabel: t('te.deletePreset'), class: 'te-tiles', tileClass: 'te-tile', deleteClass: 'te-tile-del', addClass: 'te-tile-add',
    attrs: { 'data-kind': 'page' },
    add: { label: t('te.addPreset'), title: t('te.pagePresetName'), onClick: () => void addPagePreset(env, type, selFor) },
  });
  env.scope().add(() => gallery.destroy());
  box.append(gallery.el, props);
  // page tiles are cheap (no renderer): any change they show redraws them all
  const full = (): void => {
    gallery.update({ tiles: tiles() });
    env.decorate(gallery.el);
  };
  register(env, gallery.el, (paths) => {
    if (!paths) return full();
    if (affected(paths, type, (b) => (b === 'pagePresets' ? 'all' : 'none')).all) full();
  });
  full();
}

async function addPagePreset(env: Env, type: DiagramType, selFor: (name: string) => TileSel): Promise<void> {
  const { t } = env;
  const names = Object.keys(env.draft.allPresets(type, 'pagePresets'));
  const label = await env.dialogs.prompt(t('te.pagePresetName'), { label: t('te.pagePresetName'), validate: (v) => (names.includes(slug(v)) ? t('te.presetExists') : null) });
  const n = slug(label ?? '');
  if (!label || !n || names.includes(n)) return;
  env.draft.set([type, 'pagePresets', n], { label });
  env.flush();
  env.selectTile(selFor(n));
}
