// Layers panel content (A.7 rows 67–68; prototype app `refreshLayers`) on the LayerList block: + New layer, rename,
// show / hide, delete (items move to Default), the count selects the layer's items and hovering it highlights them on
// the canvas. In View mode the panel is "View settings": layer visibility plus Display (connector labels, hover
// highlight).
import { DEFAULT_LAYER, effectiveLayers, layerDefs, layerItems, layerOf } from '../../../core/layers.js';
import type { LayerMeta } from '../../../core/meta/types.js';
import { newLayer, setLayer } from '../../../core/ops/meta-ops.js';
import { cloneMeta } from '../../../core/ops/meta-util.js';
import { ownOr } from '../../../core/own.js';
import { clearHighlight, highlightItems } from '../../../dom/highlight.js';
import { createLayerList, LAYER_LIST_CSS, type DisplayToggle } from '../../../ui/blocks/layer-list.js';
import { computed } from '../../../reactive/signal.js';
import type { EditorCore } from '../../core.js';
import { applyMeta } from '../../ops/doc.js';

/** The list's CSS; while editing the card's own title says "Layers", so the list's heading is not repeated. */
export const LAYERS_CSS = /* css */ `
${LAYER_LIST_CSS}
.mode-edit .mmdx-panel.layers .mmdx-layers > .mmdx-sect:first-child { display: none; }
`;

export interface LayersCard {
  /** The card's body (the LayerList). */
  readonly el: HTMLElement;
  /** Rebuilds the rows from the document (and the mode). */
  refresh(): void;
  /** "+ New layer": takes the selected items along; the new name field is focused for renaming. */
  addLayer(): void;
  destroy(): void;
}

export function layersCard(core: EditorCore): LayersCard {
  const t = core.i18n.t;
  const svg = (): SVGSVGElement => core.canvas.svg;
  let items: ReturnType<typeof layerItems> = [];
  /** Items on a layer; group / box / block contents count on their container's layer. */
  let onLayer = (_id: string): typeof items => [];

  /** Edits the layer definitions as one history step (empty definitions are dropped). */
  const editDefs = (label: string, id: string, f: (def: LayerMeta) => void): void => {
    const meta = cloneMeta(core.meta);
    const defs = (meta.layers ??= {});
    const def = ownOr(defs, id, (): LayerMeta => ({}));
    f(def);
    if (!Object.keys(def).length) delete defs[id];
    if (!Object.keys(defs).length) delete meta.layers;
    applyMeta(core, label, { meta });
  };
  const display = (key: 'labels' | 'hoverHighlight' | 'animate', v: boolean): void => {
    core.setDisplay({ [key]: v });
    if (key === 'hoverHighlight' && !v) clearHighlight(svg());
  };
  const labels = computed(() => core.display().labels), hover = computed(() => core.display().hoverHighlight), animate = computed(() => core.display().animate);
  const toggles: DisplayToggle[] = [
    { id: 'labels', label: t('layers.labels'), value: labels, onChange: (v) => display('labels', v) },
    { id: 'hover', label: t('layers.hoverConnections'), value: hover, onChange: (v) => display('hoverHighlight', v) },
    { id: 'animate', label: t('layers.animate'), value: animate, onChange: (v) => display('animate', v) },
  ];

  /** The layers shown: the view override, else the document's own visibility. */
  const shownLayers = (): string[] => [...(core.visibleLayers.peek() ?? layerDefs(core.meta).filter((l) => !l.hidden).map((l) => l.id))];
  const list = createLayerList({
    layers: [], editable: true, t,
    onToggle: (id, visible) => {
      // an old version (History) is never written: its layers show and hide in the view only
      if (core.version.peek()) {
        const on = new Set(shownLayers());
        if (visible) on.add(id);
        else on.delete(id);
        core.setVisibleLayers([...on]);
        core.fire('panels');
        return;
      }
      editDefs(t(visible ? 'history.showLayer' : 'history.hideLayer'), id, (def) => {
        if (visible) delete def.hidden;
        else def.hidden = true;
      });
    },
    onRename: (id, name) => editDefs(t('history.renameLayer'), id, (def) => {
      if (id === DEFAULT_LAYER && name === 'Default') delete def.name;
      else def.name = name;
    }),
    onDelete: (id) => {
      const moved = setLayer(core.meta, items.filter((it) => layerOf(core.meta, it.kind, it.id) === id), DEFAULT_LAYER).meta;
      delete moved.layers?.[id];
      if (moved.layers && !Object.keys(moved.layers).length) delete moved.layers;
      applyMeta(core, t('history.deleteLayer'), { meta: moved });
    },
    // a group takes its contents along, so select only what is on the layer itself
    onCountClick: (id) => {
      core.select(items.filter((it) => layerOf(core.meta, it.kind, it.id) === id));
      core.fire('panels');
    },
    onCountHover: (id) => (id === null ? clearHighlight(svg()) : highlightItems(svg(), onLayer(id))),
  });

  return {
    el: list.el,
    refresh() {
      const M = core.model;
      if (!M.type) {
        list.update({ layers: [], display: [] });
        return;
      }
      const version = !!core.version.peek();
      const editing = core.mode.peek() === 'edit' && !version;
      items = layerItems(M);
      const inLayer = effectiveLayers(M, core.meta);
      onLayer = (id) => items.filter((it) => inLayer(it.kind, it.id) === id);
      const counts = new Map<string, number>();
      for (const it of items) {
        const l = inLayer(it.kind, it.id);
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      // display options only matter while viewing (Edit always shows every label)
      const shown = version ? new Set(shownLayers()) : null;
      list.update({
        editable: editing, display: editing || version ? [] : toggles,
        layers: layerDefs(core.meta).map((l) => ({ id: l.id, name: l.name, visible: shown ? shown.has(l.id) : !l.hidden, count: counts.get(l.id) ?? 0, fixed: l.id === DEFAULT_LAYER })),
      });
    },
    addLayer() {
      if (!core.model.type) return;
      const sel = core.selection().filter((x) => x.kind !== 'activation');
      const res = newLayer(core.meta, sel);
      if (!applyMeta(core, t('history.newLayer'), res)) return;
      const n = res.id.slice(1);
      core.toast(sel.length ? t(sel.length === 1 ? 'layers.created1' : 'layers.createdN', { n, count: sel.length }) : t('layers.created', { n }));
      // after the coalesced refresh that shows the new row
      queueMicrotask(() => list.focusName(res.id));
    },
    destroy() {
      list.destroy();
      labels.dispose();
      hover.dispose();
      animate.dispose();
    },
  };
}
