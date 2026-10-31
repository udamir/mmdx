// LayerList (§5.2, §7.6): the body of the View settings card and of the editor's Layers card — layer rows (eye
// toggle, name, item count, and while editing a lock toggle, an inline rename and a delete button) under a "Layers"
// heading, then the display toggles (connector labels, hover highlight, …) as switches under "Display". The count can
// select the layer's items (a button) and highlight them while hovered or focused. Rows re-render on `update({ layers })`, keeping the focus on the same
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
  /** No delete button (the default layer). */
  fixed?: boolean;
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
  /** While editing, a × on every row but the `fixed` ones. */
  onDelete?: (id: string) => void;
  /** The count becomes a button (e.g. selects the layer's items). */
  onCountClick?: (id: string) => void;
  /** The pointer or the focus on a count (e.g. highlights the layer's items); null when it leaves. */
  onCountHover?: (id: string | null) => void;
  display?: readonly DisplayToggle[];
  t: Translate;
  /** `part` of the element (default none). */
  part?: string;
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
.mmdx-layer button.count:hover { border-color: var(--mmdx-accent); color: var(--mmdx-accent); }
.mmdx-layer .del { flex: none; width: 20px; border: 0; background: none; color: var(--mmdx-faint); padding: 0; visibility: hidden; }
.mmdx-layer:hover .del, .mmdx-layer .del:focus-visible { visibility: visible; }
.mmdx-layer .del:hover { color: var(--mmdx-danger); }
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
    if (l.count !== undefined) {
      const n = l.count, onCount = p.onCountClick, onHover = p.onCountHover;
      const cnt = onCount
        ? h('button', { type: 'button', class: 'count', title: t('layers.select'), 'aria-label': t('layers.selectN', { n, name: l.name }), 'data-f': `count-${l.id}` }, String(n))
        : h('span', { class: 'count', 'aria-label': t('layers.countLabel', { n }) }, String(n));
      if (onCount) cnt.addEventListener('click', () => onCount(l.id), { signal: s.signal });
      if (onHover) {
        if (!onCount) Object.assign(cnt, { tabIndex: 0, title: t('layers.highlight') });
        for (const type of ['pointerenter', 'focus'] as const) cnt.addEventListener(type, () => onHover(l.id), { signal: s.signal });
        for (const type of ['pointerleave', 'blur'] as const) cnt.addEventListener(type, () => onHover(null), { signal: s.signal });
      }
      r.append(cnt);
    }
    const onLock = p.onLock;
    if (p.editable && onLock) {
      const locked = !!l.locked;
      const label = locked ? t('layers.unlock') : t('layers.lock');
      const lock = h('button', { type: 'button', class: 'lock', title: label, 'aria-label': `${label}: ${l.name}`, 'aria-pressed': String(locked), 'data-f': `lock-${l.id}` },
        icon(locked ? I_lock : I_unlock, 15));
      lock.addEventListener('click', () => onLock(l.id, !locked), { signal: s.signal });
      r.append(lock);
    }
    const onDelete = p.onDelete;
    if (p.editable && onDelete) {
      const del = h('button', { type: 'button', class: 'del', title: t('layers.delete'), 'aria-label': `${t('layers.delete')}: ${l.name}`, 'data-f': `del-${l.id}`, hidden: !!l.fixed }, '×');
      del.addEventListener('click', () => onDelete(l.id), { signal: s.signal });
      r.append(del);
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
      if (p.part) el.setAttribute('part', p.part);
      else el.removeAttribute('part');
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
