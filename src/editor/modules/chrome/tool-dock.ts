// Tool dock (A.2 rows 16, 26; index.html `#toolDock`; prototype app `setTool`, `syncViewTools`, `toggleCodePanel`):
// Pointer, Hand, Shapes, magic Pen (with its options bar), Code / Properties / Layers toggles, Undo / Redo with
// disabled state and "Undo <label>" tooltips. Edit-only tools hide in View mode. Shortcuts V, H, P, C, I, L, Esc.
import { createMagicPen, PEN_COLORS, PEN_FADES, PEN_SIZES, type MagicPen } from '../../../dom/pen.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import { formatKeys } from '../../../ui/shortcuts.js';
import { effect } from '../../../ui/signal.js';
import type { EditorCore, Tool } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { setPanel } from './panes.js';

export const TOOL_DOCK_CSS = /* css */ `
.tool-dock { position: absolute; left: calc(12px + var(--inset-l)); top: 50%; transform: translateY(-50%); z-index: 31; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.view-tools { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border-radius: 14px;
  background: var(--float); border: 1px solid var(--float-line); box-shadow: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06); }
.vt-tool, .vt-undo button { border: 0; background: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 10px; color: var(--ink); padding: 0; }
.vt-tool .ds-icon, .vt-undo button .ds-icon { width: 24px; height: 24px; }
.vt-tool:hover, .vt-undo button:hover:not(:disabled) { background: var(--float-2); }
.vt-tool.on { background: var(--accent-2); color: var(--accent); }
.vt-tool[hidden] { display: none !important; }
.vt-tool:disabled { opacity: .35; }
.vt-divider { width: 30px; height: 1px; background: var(--line); margin: 4px 0; }
.vt-undo { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 14px; background: var(--float); border: 1px solid var(--float-line);
  box-shadow: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06); }
.vt-undo button:disabled { opacity: .3; cursor: default; background: none; }
.vt-code { position: relative; }
.vt-code.has-issues::after { content: attr(data-issues); position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px;
  background: var(--danger); color: #fff; font: 700 10px/16px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px var(--float); pointer-events: none; }
.vt-opts { position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 5px;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.vt-opts[hidden] { display: none; }
.vt-color { width: 20px; height: 20px; border-radius: 50%; border: 0; padding: 0; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.vt-color.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--c); margin: 3px 0; }
.vt-sep { width: 22px; height: 1px; background: var(--line); margin: 4px 0; }
.vt-size { width: 26px; height: 26px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; }
.vt-size i { display: block; border-radius: 50%; }
.vt-size:hover { background: var(--float-2); }
.vt-size.on { background: var(--accent-2); }
.vt-fade { width: 30px; height: 24px; border: 0; background: none; padding: 0; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--ink-2); }
.vt-fade:hover { background: var(--float-2); }
.vt-fade.on { background: var(--accent-2); color: var(--accent); }
.vt-clean { width: 30px; height: 28px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; color: var(--ink-2); }
.vt-clean:hover { background: var(--danger-bg); color: var(--danger); }
.mode-edit .view-only { display: none !important; }
`;

const VIEW_SETTINGS_ICON = 'M2.5 11.5C4.6 7.4 8 5.5 12 5.5s7.4 1.9 9.5 6M2.5 11.5c2.1 4.1 5.5 6 9.5 6M12 14.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM18.5 20.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z';

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tip = (label: string, keys?: string): string => (keys ? `${label} (${formatKeys(keys)})` : label);

export const toolDockModule: EditorModule = {
  id: 'tool-dock',
  css: TOOL_DOCK_CSS,
  install(core) {
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];

    // ---- magic pen (also in Edit mode); strokes are never saved
    let pen: MagicPen | null = null;
    if (f.pen) {
      pen = createMagicPen({
        container: core.dom.wrap,
        getView: () => core.viewport.state,
        wheelTarget: core.dom.svg,
        storage: core.storage,
        reducedMotion,
        onChange: () => syncPenOpts(),
      });
      cleanups.push(core.on('view', () => pen?.sync()));
    }
    const defaultTool = (): Tool => (core.mode.peek() === 'edit' ? 'pointer' : 'hand');

    /** Switches tools; panning or drawing edits nothing, so the selection and group editing are dropped. */
    const setTool = (tool: Tool): void => {
      if (tool === 'pointer' && core.mode.peek() !== 'edit') tool = 'hand';
      if (tool === 'pen' && !pen) return;
      if (tool !== 'pointer' && (core.selection().length || core.enteredGroup.peek())) {
        core.enteredGroup.set(null);
        core.select([]);
        core.draw();
      }
      core.setTool(tool);
      pen?.setActive(tool === 'pen');
    };

    // ---- DOM
    const btn = (cls: string, label: string, keys: string | undefined, iconPath: string, extra: Record<string, unknown> = {}): HTMLButtonElement =>
      h('button', { type: 'button', class: `vt-tool ${cls}`, title: tip(label, keys), 'aria-label': label, ...(keys ? { 'aria-keyshortcuts': keys.replace('mod', 'Control') } : {}), ...extra }, icon(iconPath, 19));
    const pointer = btn('edit-only', t('tools.pointer'), 'v', ICONS.pointer, { dataset: { tool: 'pointer' }, 'aria-pressed': 'false' });
    const hand = btn('', t('tools.hand'), 'h', ICONS.hand, { dataset: { tool: 'hand' }, 'aria-pressed': 'false' });
    const shapes = btn('edit-only vt-shapes', t('tools.shapes'), 's', ICONS.shapes, { 'aria-haspopup': 'menu' });
    const penBtn = pen ? btn('', t('tools.pen'), 'p', ICONS.pen, { dataset: { tool: 'pen' }, 'aria-pressed': 'false' }) : null;
    const codeBtn = f.codePanel ? btn('edit-only vt-code', t('tools.code'), 'c', ICONS.code, { 'aria-pressed': 'false' }) : null;
    const propsBtn = f.properties ? btn('edit-only vt-props', t('tools.props'), 'i', ICONS.props, { 'aria-pressed': 'false' }) : null;
    const layersBtn = f.layers ? h('button', { type: 'button', class: 'vt-tool vt-layers', 'aria-pressed': 'false' },
      (() => {
        const v = icon(VIEW_SETTINGS_ICON, 19);
        v.classList.add('view-only');
        return v;
      })(),
      (() => {
        const e = icon(ICONS.layers, 19);
        e.classList.add('edit-only');
        return e;
      })()) : null;
    const opts = h('div', { class: 'vt-opts', hidden: true, role: 'toolbar', 'aria-label': t('pen.options') });
    const tools = h('div', { class: 'view-tools', role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': t('tools.title') },
      pointer, hand, shapes, penBtn, h('span', { class: 'vt-divider', 'aria-hidden': 'true' }), codeBtn, propsBtn, layersBtn, opts);
    const undoBtn = h('button', { type: 'button', 'aria-label': t('tools.undo') }, icon(ICONS.undo, 19));
    const redoBtn = h('button', { type: 'button', 'aria-label': t('tools.redo') }, icon(ICONS.redo, 19));
    const undo = h('div', { class: 'vt-undo edit-only', role: 'group', 'aria-label': t('tools.history') }, undoBtn, redoBtn);
    const dock = h('div', { class: 'tool-dock', part: 'toolbar' }, tools, undo);
    core.dom.wrap.append(dock);
    // the dock is not part of the canvas: pointer events stay here
    dock.addEventListener('pointerdown', (ev) => ev.stopPropagation(), sig);

    for (const b of [pointer, hand, penBtn]) b?.addEventListener('click', () => setTool(b.dataset['tool'] as Tool), sig);
    shapes.addEventListener('click', () => core.run('toggleShapesMenu', shapes), sig);
    codeBtn?.addEventListener('click', () => setPanel(core, 'code', !core.panels.peek().code), sig);
    propsBtn?.addEventListener('click', () => setPanel(core, 'properties', !core.panels.peek().properties), sig);
    layersBtn?.addEventListener('click', () => setPanel(core, 'layers', !core.panels.peek().layers), sig);
    const undoNow = (): void => {
      core.store.undo();
      core.afterChange();
    };
    const redoNow = (): void => {
      core.store.redo();
      core.afterChange();
    };
    undoBtn.addEventListener('click', undoNow, sig);
    redoBtn.addEventListener('click', redoNow, sig);

    // ---- state
    const syncTools = (): void => {
      const tool = core.tool.peek();
      for (const b of [pointer, hand, penBtn]) {
        if (!b) continue;
        const on = b.dataset['tool'] === tool;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      const er = core.model.type === 'er';
      shapes.title = tip(er ? t('tools.table') : t('tools.shapes'), 's');
      shapes.setAttribute('aria-label', er ? t('tools.table') : t('tools.shapes'));
      shapes.hidden = !core.model.type || !core.has('toggleShapesMenu');
    };
    cleanups.push(core.on('tool', syncTools), core.on('model', syncTools), core.on('draw', syncTools));
    cleanups.push(effect(() => {
      core.tool();
      syncTools();
    }));
    cleanups.push(effect(() => {
      const p = core.panels();
      const m = core.mode();
      const set = (b: HTMLButtonElement | null, on: boolean): void => {
        b?.classList.toggle('on', on);
        b?.setAttribute('aria-pressed', String(on));
      };
      set(codeBtn, p.code);
      set(propsBtn, p.properties);
      set(layersBtn, p.layers);
      if (layersBtn) {
        const label = m === 'edit' ? t('tools.layers') : t('tools.viewSettings');
        layersBtn.title = tip(label, 'l');
        layersBtn.setAttribute('aria-label', label);
      }
    }));
    // badge on the Code tool: problems in the code / metadata
    cleanups.push(effect(() => {
      const n = core.issueCount();
      if (!codeBtn) return;
      codeBtn.classList.toggle('has-issues', n > 0);
      codeBtn.dataset['issues'] = n > 99 ? '99+' : String(n);
      codeBtn.title = tip(t('tools.code'), 'c') + (n ? ` · ${t(n === 1 ? 'problems.count1' : 'problems.countN', { n })}` : '');
    }));
    // undo / redo: disabled when empty, "Undo <label>" tooltips
    cleanups.push(effect(() => {
      core.store.revision();
      const u = core.store.canUndo(), r = core.store.canRedo();
      undoBtn.disabled = !u;
      redoBtn.disabled = !r;
      const ul = core.store.undoLabel(), rl = core.store.redoLabel();
      undoBtn.title = tip(ul ? t('tools.undoLabel', { label: ul }) : t('tools.undo'), 'mod+z');
      redoBtn.title = tip(rl ? t('tools.redoLabel', { label: rl }) : t('tools.redo'), 'mod+shift+z');
    }));
    // mode switch: default tool, pen strokes cleared
    cleanups.push(core.on('mode', () => {
      pen?.clear();
      setTool(defaultTool());
    }));

    // ---- pen options bar
    const syncPenOpts = (): void => {
      if (!pen) return;
      if (!pen.active && core.tool.peek() === 'pen') core.setTool(defaultTool());
      opts.hidden = !pen.active;
      syncTools();
      if (!pen.active) return;
      const p = pen;
      const kids: HTMLElement[] = [];
      for (const c of PEN_COLORS) {
        const b = h('button', { type: 'button', class: 'vt-color' + (c === p.color ? ' on' : ''), title: t('pen.color'), 'aria-label': `${t('pen.color')} ${c}`, 'aria-pressed': String(c === p.color) });
        b.style.setProperty('--c', c);
        b.addEventListener('click', () => p.setColor(c));
        kids.push(b);
      }
      kids.push(h('span', { class: 'vt-sep' }));
      for (const sz of PEN_SIZES) {
        const dot = h('i');
        dot.style.width = dot.style.height = `${sz + 3}px`;
        dot.style.background = p.color;
        const label = t('pen.size', { n: sz });
        const b = h('button', { type: 'button', class: 'vt-size' + (sz === p.size ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(sz === p.size) }, dot);
        b.addEventListener('click', () => p.setSize(sz));
        kids.push(b);
      }
      kids.push(h('span', { class: 'vt-sep' }));
      for (const ms of PEN_FADES) {
        const label = ms ? t('pen.fadeAfter', { s: ms / 1000 }) : t('pen.keep');
        const b = h('button', { type: 'button', class: 'vt-fade' + (ms === p.fade ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(ms === p.fade) }, ms ? `${ms / 1000}s` : '∞');
        b.addEventListener('click', () => p.setFade(ms));
        kids.push(b);
      }
      kids.push(h('span', { class: 'vt-sep' }));
      const clean = h('button', { type: 'button', class: 'vt-clean', title: t('pen.erase'), 'aria-label': t('pen.erase') }, icon(ICONS.eraser, 18));
      clean.addEventListener('click', () => p.clear());
      kids.push(clean);
      opts.replaceChildren(...kids);
    };
    syncPenOpts();
    setTool(defaultTool());

    // ---- shortcuts (A.11): tools and panels; Esc goes back to the default tool
    core.shortcuts.add(
      { id: 'tool-pen', keys: ['p'], label: t('help.pen'), group: t('help.tools'), run: () => (pen ? setTool(core.tool.peek() === 'pen' ? defaultTool() : 'pen') : false) },
      { id: 'panel-code', keys: ['c'], label: t('help.code'), group: t('help.tools'), editOnly: true, run: () => (f.codePanel ? setPanel(core, 'code', !core.panels.peek().code) : false) },
      { id: 'panel-props', keys: ['i'], label: t('help.props'), group: t('help.tools'), editOnly: true, run: () => (f.properties ? setPanel(core, 'properties', !core.panels.peek().properties) : false) },
      { id: 'panel-layers', keys: ['l'], label: t('help.layers'), group: t('help.tools'), run: () => (f.layers ? setPanel(core, 'layers', !core.panels.peek().layers) : false) },
      {
        id: 'tool-default', keys: ['escape'], label: t('help.escTool'), group: t('help.tools'),
        run: () => {
          if (core.tool.peek() === defaultTool() || core.tool.peek() === 'paint' || core.tool.peek() === 'shapes') return false;
          setTool(defaultTool());
          return true;
        },
      },
    );
    // V / H: registered here unless a canvas module already owns them (checked once every module is installed)
    queueMicrotask(() => {
      const has = (k: string): boolean => core.shortcuts.list(true).some((s) => s.keys.includes(k));
      if (!has('v')) core.shortcuts.add({ id: 'tool-pointer', keys: ['v'], label: t('help.pointer'), group: t('help.tools'), editOnly: true, run: () => setTool('pointer') });
      if (!has('h')) core.shortcuts.add({ id: 'tool-hand', keys: ['h'], label: t('help.hand'), group: t('help.tools'), run: () => setTool('hand') });
    });

    return () => {
      ac.abort();
      for (const c of cleanups) c();
      pen?.destroy();
      dock.remove();
    };
  },
};
