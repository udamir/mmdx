// Layers panel content (A.7 rows 67–68; prototype app `refreshLayers`): + New layer, rename, show / hide, delete
// (items move to Default), the count selects the layer's items and hovering it highlights them on the canvas. In
// View mode the panel is "View settings": layer visibility plus Display (connector labels, hover highlight).
import { DEFAULT_LAYER, effectiveLayers, layerDefs, layerItems, layerOf } from '../../../core/layers.js';
import { newLayer, setLayer } from '../../../core/ops/meta-ops.js';
import { cloneMeta } from '../../../core/ops/meta-util.js';
import { clearHighlight, highlightItems } from '../../../dom/highlight.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import type { EditorCore } from '../../core.js';
import { applyMeta } from './util.js';

/** "+ New layer": takes the selected items along; the new name field is focused for renaming. */
export function addLayer(core: EditorCore, host: HTMLElement | null): void {
  const t = core.i18n.t;
  if (!core.model.type) return;
  const sel = core.selection().filter((x) => x.kind !== 'activation');
  const res = newLayer(core.meta, sel);
  if (!applyMeta(core, t('history.newLayer'), res)) return;
  const n = res.id.slice(1);
  core.toast(sel.length ? t(sel.length === 1 ? 'layers.created1' : 'layers.createdN', { n, count: sel.length }) : t('layers.created', { n }));
  queueMicrotask(() => {
    const input = host?.querySelector<HTMLInputElement>(`[data-layer="${res.id}"] input`);
    input?.focus();
    input?.select();
  });
}

/** Builds the layers list (and View settings → Display in View mode) into `host`. */
export function renderLayers(core: EditorCore, host: HTMLElement): void {
  const t = core.i18n.t;
  host.replaceChildren();
  const M = core.model;
  if (!M.type) return;
  const editing = core.mode.peek() === 'edit';
  const svg = core.dom.svg;
  const items = layerItems(M);
  const inLayer = effectiveLayers(M, core.meta); // group / box / block contents count on their container's layer
  const counts = new Map<string, number>();
  for (const it of items) {
    const l = inLayer(it.kind, it.id);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const itemsOn = (id: string): typeof items => items.filter((it) => inLayer(it.kind, it.id) === id);
  const hover = (el: HTMLElement, id: string): void => {
    el.addEventListener('pointerenter', () => highlightItems(svg, itemsOn(id)));
    el.addEventListener('pointerleave', () => clearHighlight(svg));
    el.addEventListener('focus', () => highlightItems(svg, itemsOn(id)));
    el.addEventListener('blur', () => clearHighlight(svg));
  };
  if (editing) host.append(h('div', { class: 'layers-gap' }));
  else host.append(h('div', { class: 'sect', role: 'heading', 'aria-level': '3' }, t('layers.layers')));
  const list = h('div', { role: 'list' });
  host.append(list);
  for (const l of layerDefs(core.meta)) {
    const id = l.id;
    const row = h('div', { class: 'layer-row' + (l.hidden ? ' off' : ''), role: 'listitem', dataset: { layer: id } });
    const eye = h('button', { type: 'button', class: 'eye', title: l.hidden ? t('layers.show') : t('layers.hide'), 'aria-label': `${l.hidden ? t('layers.show') : t('layers.hide')}: ${l.name}`, 'aria-pressed': String(!l.hidden) },
      icon(l.hidden ? ICONS.eyeOff : ICONS.eye, 17));
    eye.addEventListener('click', () => {
      const meta = cloneMeta(core.meta);
      const defs = (meta.layers ??= {});
      const def = (defs[id] ??= {});
      if (def.hidden) delete def.hidden;
      else def.hidden = true;
      if (id === DEFAULT_LAYER && !Object.keys(def).length) delete defs[id];
      if (!Object.keys(defs).length) delete meta.layers;
      applyMeta(core, t(def.hidden ? 'history.hideLayer' : 'history.showLayer'), { meta });
    });
    const n = counts.get(id) ?? 0;
    if (!editing) {
      // View mode: visibility only
      row.classList.add('view');
      const cnt = h('span', { class: 'count', title: t('layers.highlight'), tabindex: '0', 'aria-label': t('layers.countLabel', { n }) }, String(n));
      hover(cnt, id);
      row.append(eye, h('span', { class: 'layer-name' }, l.name), cnt);
      list.append(row);
      continue;
    }
    const name = h('input', { type: 'text', value: l.name, 'aria-label': t('layers.rename') });
    name.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') name.blur();
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        name.value = l.name;
        name.blur();
      }
    });
    name.addEventListener('change', () => {
      const v = name.value.trim() || (id === DEFAULT_LAYER ? 'Default' : id);
      const meta = cloneMeta(core.meta);
      const defs = (meta.layers ??= {});
      const def = (defs[id] ??= {});
      if (id === DEFAULT_LAYER && v === 'Default') delete def.name;
      else def.name = v;
      if (!Object.keys(def).length) delete defs[id];
      if (!Object.keys(defs).length) delete meta.layers;
      applyMeta(core, t('history.renameLayer'), { meta });
    });
    const cnt = h('button', { type: 'button', class: 'count', title: t('layers.select'), 'aria-label': t('layers.selectN', { n, name: l.name }) }, String(n));
    cnt.addEventListener('click', () => {
      // a group takes its contents along, so select only what is on the layer itself
      core.select(items.filter((it) => layerOf(core.meta, it.kind, it.id) === id));
      core.fire('panels');
    });
    hover(cnt, id);
    row.append(eye, name, cnt);
    if (id !== DEFAULT_LAYER) {
      const del = h('button', { type: 'button', class: 'del', title: t('layers.delete'), 'aria-label': `${t('layers.delete')}: ${l.name}` }, '×');
      del.addEventListener('click', () => {
        const moved = setLayer(core.meta, items.filter((it) => layerOf(core.meta, it.kind, it.id) === id), DEFAULT_LAYER).meta;
        delete moved.layers?.[id];
        if (moved.layers && !Object.keys(moved.layers).length) delete moved.layers;
        applyMeta(core, t('history.deleteLayer'), { meta: moved });
      });
      row.append(del);
    } else row.append(h('span'));
    list.append(row);
  }
  // display options only matter while viewing (Edit always shows every label)
  if (editing) return;
  host.append(h('div', { class: 'sect', role: 'heading', 'aria-level': '3' }, t('layers.display')));
  const opt = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const cb = h('input', { type: 'checkbox', class: 'toggle', role: 'switch' });
    cb.checked = get();
    cb.addEventListener('change', () => {
      set(cb.checked);
      core.draw();
    });
    host.append(h('div', { class: 'layer' }, h('label', { class: 'toggle-row' }, h('span', null, label), cb)));
  };
  opt(t('layers.labels'), () => core.display.peek().labels, (v) => core.display.set({ ...core.display.peek(), labels: v }));
  opt(t('layers.hoverConnections'), () => core.display.peek().hoverHighlight, (v) => {
    core.display.set({ ...core.display.peek(), hoverHighlight: v });
    if (!v) clearHighlight(svg);
  });
}
