// Right column (A.2 row 21, A.7 rows 61–68): Properties and Layers as two SidePanels in the right PanelStack (the
// stack, its splitter — the Layers height, `layersH` — and its width grip are chrome/panes.ts), each closed with × (or
// its tool) and remembered. The Properties content (the inspectors) loads the first time it shows. In View mode only Layers shows, as "View settings", and hovering a box highlights its
// connections (Display → hover highlight). Ported from index.html `#rightPane` and prototype/app.js (~1875–2594,
// ~3016–3066).
import { createSidePanel } from '../../../ui/blocks/side-panel.js';
import { h } from '../../../ui/kit/h.js';
import type { EditorModule } from '../../module.js';
import { LiveEdit } from '../../ops/live.js';
import { LAYERS_CSS, layersCard } from './layers.js';
import type { PanelCtx } from './properties.js';

export const RIGHT_PANELS_CSS = /* css */ `
${LAYERS_CSS}
.mmdx-split:not([hidden]) + .mmdx-panel.layers { flex: 0 1 auto; max-height: 45%; }
.mmdx-split:not([hidden]) + .mmdx-panel.layers[style*="flex"] { max-height: none; }
.rp-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 12px; }
.mmdx-panel-head .rp-act { margin-right: 4px; }
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
.prop-label { position: relative; }
.prop-label .prop-emoji { position: absolute; right: 4px; top: 4px; width: 24px; height: 24px; padding: 0; border: 0; background: none; font-size: 14px; line-height: 1; opacity: .7; }
.prop-label .prop-emoji:hover { opacity: 1; }
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
`;

export const rightPanelsModule: EditorModule = {
  id: 'right-panels',
  css: [RIGHT_PANELS_CSS],
  enabled: ({ features: f }) => f.properties || f.layers,
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const f = core.features;
    const live = new LiveEdit(core);

    // ---- Properties (Edit mode only)
    let propsBody: HTMLElement | null = null;
    if (f.properties) {
      const body = (propsBody = h('div', { class: 'rp-body scroll' }));
      const panel = createSidePanel({
        side: 'right', title: t('props.title'), label: t('props.title'), class: 'props', closeLabel: t('props.close'), closeKeys: 'i',
        onClose: () => void core.run('setPanel', 'properties', false), body, t,
      });
      // not for an old version shown read-only (History)
      scope.contribute(core.panelItems, { id: 'properties', side: 'right', order: 10, el: panel.el, visible: () => core.mode() === 'edit' && core.stage() !== 'version' });
      scope.onDispose(() => panel.destroy());
    }
    // ---- Layers / View settings
    const layers = f.layers ? layersCard(core) : null;
    if (layers) {
      const newBtn = h('button', { type: 'button', class: 'small primary edit-only no-version rp-act', title: t('layers.newTip'), 'data-f': 'layers-new' }, t('layers.new'));
      scope.listen(newBtn, 'click', () => layers.addLayer());
      const panel = createSidePanel({
        side: 'right', title: t('layers.layers'), label: t('layers.layers'), class: 'layers', actions: [newBtn], closeLabel: t('layers.close'), closeKeys: 'l',
        onClose: () => void core.run('setPanel', 'layers', false), body: layers.el, t,
      });
      scope.contribute(core.panelItems, { id: 'layers', side: 'right', order: 20, el: panel.el });
      scope.effect(() => {
        const title = core.mode() === 'edit' ? t('layers.layers') : t('layers.title');
        panel.update({ title, label: title, closeLabel: core.mode.peek() === 'edit' ? t('layers.close') : t('layers.closeView') });
      });
      scope.onDispose(() => {
        layers.destroy();
        panel.destroy();
      });
    }

    // ---- the inspectors load the first time Properties shows (the panel renders once they are there)
    let inspect: ((p: PanelCtx, host: HTMLElement) => void) | null = null;
    let loading = false, gone = false;
    const renderProps = (host: HTMLElement): void => {
      if (inspect) return inspect({ core, live }, host);
      if (loading) return;
      loading = true;
      void import('./properties.js').then((m) => {
        if (gone) return;
        inspect = m.renderProperties;
        refresh();
      });
    };

    // ---- refresh: coalesced; a panel with focus inside waits until focus leaves it (typing is never interrupted)
    const dirty = { props: false, layers: false };
    let queued = false;
    const focusedIn = (el: HTMLElement | null): boolean => {
      const a = core.shadow.activeElement;
      return !!el && !!a && el.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    };
    const flush = (): void => {
      queued = false;
      if (dirty.props && propsBody && !focusedIn(propsBody)) {
        dirty.props = false;
        if (core.mode.peek() === 'edit' && !core.version.peek() && core.panels.peek().properties) renderProps(propsBody);
      }
      if (dirty.layers && layers && !focusedIn(layers.el)) {
        dirty.layers = false;
        if (core.panels.peek().layers) layers.refresh();
      }
    };
    const refresh = (): void => {
      dirty.props = true;
      dirty.layers = true;
      if (queued) return;
      queued = true;
      queueMicrotask(flush);
    };
    for (const ev of ['panels', 'selection', 'mode', 'model', 'theme'] as const) scope.on(ev, refresh);
    for (const [el, k] of [[propsBody, 'props'], [layers?.el, 'layers']] as const)
      if (el)
        scope.listen(el, 'focusout', () => setTimeout(() => {
          if (dirty[k]) refresh();
        }));
    refresh();

    return () => {
      gone = true;
      live.flush();
    };
  },
};
