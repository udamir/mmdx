// LayerList (§5.2, §7.6): the body of the View settings card — layer rows (eye toggle, name, item count, and while
// editing a lock toggle and an inline rename) under a "Layers" heading, then the display toggles (connector labels,
// hover highlight, …) as switches under "Display". Rows re-render on `update({ layers })`, keeping the focus on the same
// control. Replaces the layers DOM of editor/modules/panels/layers.ts (`renderLayers`) and the viewer's View
// settings popup (`viewSettings` in elements/viewer-popups.ts).
import { h, icon } from '../h.js';
import { registerMessages } from '../i18n.js';
import { I_eye, I_eyeOff, I_lock, I_unlock } from '../icons.js';
import { BLOCK_MESSAGES_PANELS } from '../messages/blocks-panels.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';
import { focusedIn, keepFocus } from './focus.js';

export interface LayerRow {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
  /** Items on the layer (shown as a badge). */
  count?: number;
}

export interface DisplayToggle {
  id: string;
  label: string;
  value: Value<boolean>;
  onChange: (v: boolean) => void;
}

export interface LayerListProps {
  /** No "Layers" section when empty (a diagram with only the default layer). */
  layers: readonly LayerRow[];
  /** Lock and rename only while editing. */
  editable: boolean;
  onToggle: (id: string, visible: boolean) => void;
  onLock?: (id: string, locked: boolean) => void;
  onRename?: (id: string, name: string) => void;
  display?: readonly DisplayToggle[];
  t: Translate;
}

export const LAYER_LIST_CSS = /* css */ `
.mmdx-layers { display: flex; flex-direction: column; padding: 4px 12px 10px; color: var(--mmdx-text); }
.mmdx-layers .mmdx-sect { padding: 0; margin: 10px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; }
.mmdx-layer { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 7px; min-height: 32px; }
.mmdx-layer:hover { background: var(--mmdx-surface-2); }
.mmdx-layer .eye, .mmdx-layer .lock { flex: none; border: 0; background: none; padding: 2px; display: grid; place-items: center; border-radius: 5px; color: var(--mmdx-accent); }
.mmdx-layer .eye:hover:not(:disabled) { background: var(--mmdx-accent-2); }
.mmdx-layer .lock { color: var(--mmdx-faint); }
.mmdx-layer .lock[aria-pressed=true] { color: var(--mmdx-accent); }
.mmdx-layer .lock:hover:not(:disabled) { background: var(--mmdx-float-2); color: var(--mmdx-text); }
.mmdx-layer.off .eye { color: var(--mmdx-faint); }
.mmdx-layer .layer-name { flex: 1; min-width: 0; padding: 3px 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mmdx-layer input.layer-name { border: 1px solid transparent; background: none; border-radius: 5px; padding: 3px 6px; font: inherit; }
.mmdx-layer input.layer-name:hover { border-color: var(--mmdx-border); background: var(--mmdx-surface); }
.mmdx-layer input.layer-name:focus { outline: none; box-shadow: none; border-color: var(--mmdx-accent); background: var(--mmdx-surface); }
.mmdx-layer.off .layer-name { color: var(--mmdx-faint); text-decoration: line-through; }
.mmdx-layer .count { flex: none; border: 1px solid var(--mmdx-border); background: var(--mmdx-surface); border-radius: 10px; padding: 0 6px; font-size: 11px; color: var(--mmdx-muted); }
.mmdx-layer-opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 4px; }
`;

export interface LayerListHandle extends BlockHandle<LayerListProps> {
  /** Focuses the rename field of a layer (after "+ New layer"). */
  focusName(id: string): void;
}

export function createLayerList(props: LayerListProps): LayerListHandle {
  registerMessages(BLOCK_MESSAGES_PANELS);
  let p = { ...props };
  let fx = new Scope();
  const el = h('div', { class: 'mmdx-layers' });

  const row = (l: LayerRow, s: Scope): HTMLElement => {
    const t = p.t;
    const r = h('div', { class: 'mmdx-layer' + (l.visible ? '' : ' off'), role: 'listitem', dataset: { layer: l.id } });
    const verb = l.visible ? t('layers.hide') : t('layers.show');
    const eye = h('button', { type: 'button', class: 'eye', title: verb, 'aria-label': `${verb}: ${l.name}`, 'aria-pressed': String(l.visible), 'data-f': `eye-${l.id}` },
      icon(l.visible ? I_eye : I_eyeOff, 17));
    eye.addEventListener('click', () => p.onToggle(l.id, !l.visible), { signal: s.signal });
    r.append(eye);
    const onRename = p.onRename;
    if (p.editable && onRename) {
      const name = h('input', { type: 'text', class: 'layer-name', value: l.name, 'aria-label': t('layers.rename'), 'data-f': `name-${l.id}` });
      name.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') name.blur();
        else if (ev.key === 'Escape') {
          ev.stopPropagation();
          name.value = l.name;
          name.blur();
        }
      }, { signal: s.signal });
      name.addEventListener('change', () => {
        const v = name.value.trim();
        if (!v) name.value = l.name;
        else if (v !== l.name) onRename(l.id, v);
      }, { signal: s.signal });
      r.append(name);
    } else r.append(h('span', { class: 'layer-name' }, l.name));
    if (l.count !== undefined) r.append(h('span', { class: 'count', 'aria-label': t('layers.countLabel', { n: l.count }) }, String(l.count)));
    const onLock = p.onLock;
    if (p.editable && onLock) {
      const locked = !!l.locked;
      const label = locked ? t('layers.unlock') : t('layers.lock');
      const lock = h('button', { type: 'button', class: 'lock', title: label, 'aria-label': `${label}: ${l.name}`, 'aria-pressed': String(locked), 'data-f': `lock-${l.id}` },
        icon(locked ? I_lock : I_unlock, 15));
      lock.addEventListener('click', () => onLock(l.id, !locked), { signal: s.signal });
      r.append(lock);
    }
    return r;
  };

  const toggle = (d: DisplayToggle, s: Scope): HTMLElement => {
    const sw = h('button', { type: 'button', role: 'switch', class: 'mmdx-toggle', 'aria-label': d.label, 'data-f': `opt-${d.id}` });
    sw.addEventListener('click', () => d.onChange(!read(d.value)), { signal: s.signal });
    s.effect(() => sw.setAttribute('aria-checked', String(read(d.value))));
    return h('div', { class: 'mmdx-layer-opt', dataset: { opt: d.id } }, h('span', null, d.label), sw);
  };

  const render = (): void => {
    // a rename in progress keeps its text across the re-render
    const active = focusedIn(el);
    const typing = active instanceof HTMLInputElement ? active.value : null;
    keepFocus(el, () => {
      fx.dispose();
      fx = new Scope();
      const t = p.t;
      const out: HTMLElement[] = [];
      if (p.layers.length)
        out.push(h('div', { class: 'mmdx-sect', role: 'heading', 'aria-level': '3' }, t('layers.layers')),
          h('div', { role: 'list', 'aria-label': t('layers.layers') }, ...p.layers.map((l) => row(l, fx))));
      if (p.display?.length)
        out.push(h('div', { class: 'mmdx-sect', role: 'heading', 'aria-level': '3' }, t('layers.display')), ...p.display.map((d) => toggle(d, fx)));
      el.replaceChildren(...out);
    });
    const now = typing !== null ? focusedIn(el) : null;
    if (now instanceof HTMLInputElement) now.value = typing ?? now.value;
  };
  render();

  return {
    el,
    focusName(id) {
      const input = [...el.querySelectorAll<HTMLInputElement>('input.layer-name')].find((x) => x.closest<HTMLElement>('[data-layer]')?.dataset['layer'] === id);
      input?.focus();
      input?.select();
    },
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      el.remove();
    },
  };
}
