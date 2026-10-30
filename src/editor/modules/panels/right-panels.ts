// Right column (A.2 row 21, A.7 rows 61–68): Properties and Layers as two floating panels, one under the other, each
// closed with × (or its tool) and remembered; a splitter between them (min 90 / 140 px, double-click resets,
// remembered as `layersH`); the column's inner edge resizes it. In View mode only Layers shows, as "View settings",
// and hovering a box highlights its connections (Display → hover highlight). Ported from index.html `#rightPane` and
// prototype/app.js (~1875–2594, ~3016–3066).
import { clearHighlight, hoverHighlight } from '../../../dom/highlight.js';
import { h } from '../../../ui/h.js';
import { effect } from '../../../ui/signal.js';
import type { EditorModule } from '../../module.js';
import { attachResizer, setPanel } from '../chrome/panes.js';
import { addLayer, renderLayers } from './layers.js';
import { renderProperties } from './properties.js';
import { LiveEdit } from './util.js';

export const RIGHT_PANELS_CSS = /* css */ `
.pane.right.right-stack { background: none; border: 0; box-shadow: none; border-radius: 0; overflow: visible; display: flex; flex-direction: column; gap: 0; }
.right-stack > .pane-resizer { left: -6px; }
.rpanel { display: flex; flex-direction: column; min-height: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 10px 30px rgba(20, 30, 60, .16), 0 1px 3px rgba(20, 30, 60, .08); overflow: hidden; }
.rpanel.props { flex: 1 1 0; }
.rpanel.layers { flex: 0 1 auto; max-height: 45%; }
.ed.no-props .rpanel.props, .mode-view .rpanel.props { display: none; }
.ed.no-layers .rpanel.layers { display: none; }
.ed.no-props .rpanel.layers, .mode-view .rpanel.layers { max-height: 100%; }
.ed.right-empty .pane.right { display: none; }
.rp-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 6px 8px 14px; border-bottom: 1px solid var(--line); flex: none; }
.rp-head b { font-size: 13px; }
.rp-head .collapse-btn { border: 0; background: none; font-size: 18px; line-height: 1; padding: 2px 8px; color: var(--muted); border-radius: 6px; }
.rp-head .collapse-btn:hover { color: var(--ink); background: var(--surface-2); }
.rp-head .rp-act { margin-left: auto; margin-right: 4px; }
.rp-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 12px; }
.rp-split { flex: none; height: 10px; cursor: row-resize; position: relative; touch-action: none; }
.rp-split::after { content: ''; position: absolute; left: 50%; top: 4px; width: 36px; height: 3px; margin-left: -18px; border-radius: 2px; background: var(--faint); opacity: 0; transition: opacity .12s; }
.rp-split:hover::after, .rp-split.dragging::after { opacity: 1; background: var(--accent); }
.ed.no-props .rp-split, .ed.no-layers .rp-split, .mode-view .rp-split { display: none; }
.ed:not(.no-props):not(.mode-view) .right-stack.sized .rpanel.layers { flex: 0 0 var(--layers-h); max-height: none; }
.ed.resizing-rows, .ed.resizing-rows * { cursor: row-resize !important; user-select: none !important; }
button.small { padding: 2px 10px; font-size: 12px; }
.hint { color: var(--muted); font-size: 12px; }
.insp-title { font-weight: 700; font-size: 14px; margin: 2px 0; word-break: break-all; }
.insp-sub { color: var(--muted); font-size: 12px; margin-bottom: 10px; white-space: pre-wrap; }
.rp-body .sect { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 14px 0 6px; font-weight: 600; }
.f { display: grid; grid-template-columns: 92px 1fr 20px; align-items: center; gap: 6px; margin: 5px 0; }
.f > label { color: var(--ink-2); font-size: 12px; }
.f .ctl { display: flex; gap: 4px; align-items: center; min-width: 0; }
.f .ctl input[type=text], .f .ctl input[type=number], .f .ctl select { width: 100%; min-width: 0; }
.f .ctl input[type=color] { width: 28px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); flex-shrink: 0; }
.f .ctl input[type=range] { width: 100%; }
.f .clr { border: 0; padding: 0; color: var(--faint); background: none; font-size: 14px; visibility: hidden; }
.f.set .clr { visibility: visible; }
.f.set > label { color: var(--accent); font-weight: 600; }
.f.mixed .ctl input::placeholder { font-style: italic; }
.f.mixed .ctl select { font-style: italic; color: var(--muted); }
.f .mixed-note { flex: none; font-size: 11px; font-style: italic; color: var(--muted); }
.btnrow { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; gap: 0; }
.seg button { border: 0; border-radius: 0; padding: 4px 12px; }
.seg button.on { background: var(--accent); color: #fff; }
.seg.small button { padding: 2px 8px; font-size: 12px; }
.page-size-seg { display: flex; width: 100%; }
.page-size-seg button { flex: 1; white-space: nowrap; padding: 3px 6px; }
.page-wh .ctl input, .ratio-in { width: 0; flex: 1; min-width: 0; }
.page-wh .ctl input:disabled { opacity: .55; }
.lock-btn { border: 1px solid transparent; background: none; padding: 2px 4px; border-radius: 6px; display: grid; place-items: center; color: var(--muted); flex: none; }
.lock-btn:hover { background: var(--float-2); color: var(--ink); }
.lock-btn.on { color: var(--accent); }
.ratio-sep { color: var(--muted); padding: 0 2px; }
.prop-label textarea, .prop-label input { width: 100%; font: 13px/1.4 var(--font); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; resize: vertical; background: var(--surface); white-space: pre-wrap; }
.prop-label textarea { min-height: 54px; }
.attr-grid { display: flex; flex-direction: column; gap: 3px; margin: 4px 0; }
.attr-line { display: grid; grid-template-columns: 1fr 30px 14px; gap: 4px; align-items: center; }
.attr-line input { min-width: 0; width: 100%; font-size: 12px; padding: 3px 6px; font-family: var(--mono, ui-monospace, Menlo, monospace); }
.attr-del { border: 0; background: none; color: var(--faint); padding: 0; }
.attr-del:hover { color: var(--danger); }
.attr-style { height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); font-size: 12px; color: var(--muted); }
.attr-style.set { border-color: var(--accent); }
.attr-style[aria-expanded=true] { box-shadow: 0 0 0 2px var(--accent-2); border-color: var(--accent); }
.attr-style-pop { width: 248px; padding: 10px; }
.asp-label { font-size: 11px; color: var(--muted); margin: 8px 0 4px; }
.asp-label:first-child { margin-top: 0; }
.asp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.asp-chip { border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 2px 9px; font-size: 12px; }
.asp-chip.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-2); }
.asp-row { display: flex; gap: 4px; align-items: center; }
.asp-row select { flex: 1; min-width: 0; font-size: 12px; }
.asp-row input[type=number] { width: 52px; font-size: 12px; }
.asp-font { margin-top: 6px; }
.asp-tog { width: 26px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); font-size: 12px; color: var(--ink-2); }
.asp-tog.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.asp-bold { font-weight: 700; } .asp-italic { font-style: italic; } .asp-underline { text-decoration: underline; }
.asp-colors { display: grid; grid-template-columns: repeat(10, 18px); gap: 4px; }
.asp-sw { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); padding: 0; position: relative; }
.asp-sw.on::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--accent); }
.asp-none { background: repeating-conic-gradient(#dcdfe5 0 25%, #fff 0 50%) 50% / 6px 6px; }
.multi-list { color: var(--muted); font-size: 12px; margin: 4px 0 10px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 4px; cursor: pointer; }
.toggle { appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 32px; height: 18px; margin: 0; border-radius: 9px;
  background: var(--toggle-off); cursor: pointer; transition: background .15s; border: 0; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s; }
.toggle:checked { background: var(--accent); }
.toggle:checked::after { transform: translateX(14px); }
.pp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pp-head .sect { margin-bottom: 4px; }
.pp-acts { display: flex; gap: 2px; margin: 0; }
.pp-act { border: 0; background: none; width: 28px; height: 26px; padding: 0; display: grid; place-items: center; border-radius: 7px; color: var(--ink-2); }
.pp-act:hover:not(:disabled) { background: var(--float-2); color: var(--accent); }
.pp-act:disabled { opacity: .35; cursor: default; }
.pp-grid { display: grid; grid-template-columns: repeat(var(--pp-cols, 2), minmax(0, 1fr)); gap: 6px; margin: 4px 0 8px; }
.pp-item { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); text-align: left; min-width: 0; }
.pp-item:hover { border-color: var(--accent); }
.pp-item.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-2); }
.pp-item.local { border-style: dashed; }
.pp-item.modified { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,.25); }
.pp-item.modified .pp-name { color: #b45309; }
.pp-pic { height: 52px; overflow: hidden; border-radius: 5px; }
.pp-pic svg { display: block; }
.pp-grid[style*="--pp-cols: 3"] .pp-pic { height: 44px; }
.pp-name { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-item.on .pp-name { color: var(--accent); font-weight: 600; }
.pp-sep { grid-column: 1 / -1; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-top: 6px; }
.pp-del { position: absolute; top: -6px; right: -6px; width: 17px; height: 17px; border-radius: 50%; background: var(--float); box-shadow: 0 1px 3px rgba(0,0,0,.3);
  display: none; place-items: center; font-size: 12px; line-height: 1; color: var(--ink-2); cursor: pointer; }
.pp-item:hover .pp-del, .pp-del:focus-visible { display: grid; }
.pp-del:hover { color: var(--danger); }
.layers-gap { height: 6px; }
.layer { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.layer label { display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; }
.layer-row { display: grid; grid-template-columns: 26px 1fr 40px 20px; gap: 6px; align-items: center; padding: 3px 4px; border-radius: 7px; }
.layer-row:hover { background: var(--surface-2); }
.layer-row input { border: 1px solid transparent; background: none; border-radius: 5px; padding: 3px 6px; font: inherit; min-width: 0; }
.layer-row input:hover { border-color: var(--line); background: var(--surface); }
.layer-row input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
.layer-row .eye { border: 0; background: none; padding: 2px; display: grid; place-items: center; color: var(--accent); border-radius: 5px; }
.layer-row .eye:hover { background: var(--accent-2); }
.layer-row.off .eye { color: var(--faint); }
.layer-row.off input, .layer-row.off .layer-name { color: var(--faint); text-decoration: line-through; }
.layer-row .count { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 0 6px; font-size: 11px; color: var(--muted); }
.layer-row .count:hover { border-color: var(--accent); color: var(--accent); }
.layer-row .del { border: 0; background: none; color: var(--faint); padding: 0; visibility: hidden; }
.layer-row:hover .del, .layer-row .del:focus-visible { visibility: visible; }
.layer-row .del:hover { color: var(--danger); }
.layer-row .layer-name { padding: 3px 7px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layer-row.view { grid-template-columns: 26px 1fr auto; }
.layer-row.view .count { cursor: default; margin-right: 4px; text-align: center; }
.layer-row span.count:hover { border-color: var(--line); color: var(--muted); }
`;

export const rightPanelsModule: EditorModule = {
  id: 'right-panels',
  css: RIGHT_PANELS_CSS,
  enabled: (f) => f.properties || f.layers,
  install(core) {
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];
    const live = new LiveEdit(core);

    const closeBtn = (name: 'properties' | 'layers', label: string): HTMLButtonElement =>
      h('button', { type: 'button', class: 'collapse-btn', title: label, 'aria-label': label, onclick: () => setPanel(core, name, false) }, '×');

    // ---- Properties
    let propsBody: HTMLElement | null = null;
    let propsPanel: HTMLElement | null = null;
    if (f.properties) {
      propsBody = h('div', { class: 'rp-body scroll' });
      propsPanel = h('section', { class: 'rpanel props edit-only', 'aria-label': t('props.title') },
        h('div', { class: 'rp-head' }, h('b', { role: 'heading', 'aria-level': '2' }, t('props.title')), closeBtn('properties', t('props.close'))), propsBody);
    }
    // ---- Layers / View settings
    let layersBody: HTMLElement | null = null;
    let layersPanel: HTMLElement | null = null;
    let layersTitle: HTMLElement | null = null;
    let layersClose: HTMLButtonElement | null = null;
    if (f.layers) {
      layersBody = h('div', { class: 'rp-body scroll' });
      layersTitle = h('b', { role: 'heading', 'aria-level': '2' }, t('layers.layers'));
      layersClose = closeBtn('layers', t('layers.close'));
      const newBtn = h('button', { type: 'button', class: 'small primary edit-only rp-act', title: t('layers.newTip') }, t('layers.new'));
      newBtn.addEventListener('click', () => addLayer(core, layersBody), sig);
      layersPanel = h('section', { class: 'rpanel layers' }, h('div', { class: 'rp-head' }, layersTitle, newBtn, layersClose), layersBody);
    }
    const split = propsPanel && layersPanel ? h('div', { class: 'rp-split', role: 'separator', 'aria-orientation': 'horizontal', title: t('panes.split') }) : null;
    const col = h('aside', { class: 'pane right right-stack', part: 'panel' }, propsPanel, split, layersPanel);
    core.dom.root.append(col);
    cleanups.push(attachResizer(core, col, 'right'));

    // ---- visibility classes (the shell sets no-right / no-layers; Properties needs its own)
    cleanups.push(effect(() => {
      const p = core.panels();
      const m = core.mode();
      core.dom.root.classList.toggle('no-props', !p.properties || !f.properties);
      const shown = m === 'view' ? p.layers && f.layers : (p.properties && f.properties) || (p.layers && f.layers);
      core.dom.root.classList.toggle('right-empty', !shown);
      if (layersTitle && layersClose) {
        layersTitle.textContent = m === 'edit' ? t('layers.layers') : t('layers.title');
        layersClose.title = m === 'edit' ? t('layers.close') : t('layers.closeView');
        layersClose.setAttribute('aria-label', layersClose.title);
        layersPanel?.setAttribute('aria-label', layersTitle.textContent);
      }
    }));

    // ---- splitter between Properties and Layers: drag sets the Layers height (remembered); double-click resets
    if (split && layersPanel) {
      const lp = layersPanel;
      const setH = (px: number | null): void => {
        if (px == null) col.style.removeProperty('--layers-h');
        else col.style.setProperty('--layers-h', `${Math.round(px)}px`);
        col.classList.toggle('sized', px != null);
      };
      const saved = core.storage.get<number>('layersH');
      if (typeof saved === 'number' && saved > 0) setH(saved);
      split.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        try {
          split.setPointerCapture(ev.pointerId);
        } catch {
          // best-effort
        }
        const y0 = ev.clientY, h0 = lp.getBoundingClientRect().height, colH = col.getBoundingClientRect().height;
        split.classList.add('dragging');
        core.dom.root.classList.add('resizing-rows');
        const move = (e: PointerEvent): void => setH(Math.max(90, Math.min(colH - 140, h0 - (e.clientY - y0)))); // both keep a usable height
        const up = (): void => {
          split.classList.remove('dragging');
          core.dom.root.classList.remove('resizing-rows');
          split.removeEventListener('pointermove', move);
          split.removeEventListener('pointerup', up);
          split.removeEventListener('pointercancel', up);
          const v = parseInt(col.style.getPropertyValue('--layers-h'), 10);
          if (v) core.storage.set('layersH', v);
        };
        split.addEventListener('pointermove', move);
        split.addEventListener('pointerup', up);
        split.addEventListener('pointercancel', up);
      }, sig);
      split.addEventListener('dblclick', () => {
        setH(null);
        core.storage.remove('layersH');
      }, sig);
    }

    // ---- refresh: coalesced; a panel with focus inside waits until focus leaves it (typing is never interrupted)
    const dirty = { props: false, layers: false };
    let queued = false;
    const focusedIn = (el: HTMLElement | null): boolean => {
      const a = core.dom.shadow.activeElement;
      return !!el && !!a && el.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    };
    const flush = (): void => {
      queued = false;
      if (dirty.props && propsBody && !focusedIn(propsBody)) {
        dirty.props = false;
        if (core.mode.peek() === 'edit' && core.panels.peek().properties) renderProperties({ core, live }, propsBody);
      }
      if (dirty.layers && layersBody && !focusedIn(layersBody)) {
        dirty.layers = false;
        if (core.panels.peek().layers) renderLayers(core, layersBody);
      }
    };
    const refresh = (): void => {
      dirty.props = true;
      dirty.layers = true;
      if (queued) return;
      queued = true;
      queueMicrotask(flush);
    };
    for (const ev of ['panels', 'selection', 'mode', 'model', 'theme'] as const) cleanups.push(core.on(ev, refresh));
    propsBody?.addEventListener('focusout', () => setTimeout(() => {
      if (dirty.props) refresh();
    }), sig);
    layersBody?.addEventListener('focusout', () => setTimeout(() => {
      if (dirty.layers) refresh();
    }), sig);
    refresh();

    // ---- View mode: hovering a box highlights its connections (Display → hover highlight)
    let hoverKey = '';
    const svg = core.dom.svg;
    svg.addEventListener('pointermove', (ev) => {
      if (core.mode.peek() !== 'view' || !core.display.peek().hoverHighlight || core.tool.peek() === 'pen' || core.dragging) {
        if (hoverKey) {
          hoverKey = '';
          clearHighlight(svg);
        }
        return;
      }
      const target = ev.target instanceof Element ? ev.target : null;
      const box = target?.closest('.el.node, .el.entity, .el.participant') ?? null;
      const key = box ? `${box.getAttribute('data-kind')}:${box.getAttribute('data-id')}` : '';
      if (key === hoverKey) return;
      hoverKey = hoverHighlight(svg, target, core.model);
    }, sig);
    svg.addEventListener('pointerleave', () => {
      if (!hoverKey) return;
      hoverKey = '';
      clearHighlight(svg);
    }, sig);

    return () => {
      live.flush();
      ac.abort();
      for (const c of cleanups) c();
      col.remove();
      core.dom.root.classList.remove('no-props', 'right-empty');
    };
  },
};
