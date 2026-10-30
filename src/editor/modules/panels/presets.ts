// Preset pickers (A.7 row 60; prototype app `presetPicker`, `saveAsPreset`, `updatePreset`, `deleteLocalPreset`):
// one live preview per preset (theme presets, then "This diagram"), the item's preset highlighted and marked
// "modified" when it has own changes; header actions Save as preset / Reset / Update; × deletes a local preset.
// Used by the Properties panel and by the style toolbar's preset popover.
import {
  deleteLocalPreset, ownLook, PRESET_KEYS, presetUsers, saveAsPreset, setStyle, suggestPresetName, updatePreset,
} from '../../../core/ops/meta-ops.js';
import { ensure, tidy, cloneMeta } from '../../../core/ops/meta-util.js';
import { currentPreset, isLocalPreset, nodeShapeOf, participantShapeOf, presetOfItem, presetsFor } from '../../../core/ops/style-env.js';
import { participantPresetShape, presetShape } from '../../../core/render/index.js';
import { KIND_TO_COLL } from '../../../core/meta/types.js';
import type { ItemRef } from '../../../core/types.js';
import { h, icon } from '../../../ui/h.js';
import { drawItemPreview } from '../../../ui/item-preview.js';
import type { EditorCore } from '../../core.js';
import { applyMeta, styleEnv } from './util.js';

const ICON_SAVE = 'M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 19zM8.5 4.5v4h6v-4M12 12.5v5M9.5 15h5';
const ICON_RESET = 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4.5h4.5';
const ICON_UPDATE = 'M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9';

/** The item's own look is dropped: it looks exactly like its preset again. */
export function resetOwnLook(core: EditorCore, ref: ItemRef): void {
  const patch = Object.fromEntries(PRESET_KEYS.map((k) => [k, undefined]));
  applyMeta(core, core.i18n.t('history.resetStyle'), setStyle(core.meta, [ref], patch));
}

/** Save as preset: asks for a name (in-component dialog), then the item's look becomes a local preset. */
export async function saveItemAsPreset(core: EditorCore, ref: ItemRef): Promise<boolean> {
  const t = core.i18n.t;
  const env = styleEnv(core);
  const taken = presetsFor(env, ref.kind) ?? {};
  const name = await core.dialogs.prompt(t('presets.saveTitle'), {
    label: t('presets.saveLabel'),
    value: suggestPresetName(env, ref),
    ok: t('presets.saveOk'),
    validate: (v) => {
      const n = v.trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!n) return t('presets.needName');
      return Object.hasOwn(taken, n) ? t('presets.taken', { name: n }) : null;
    },
  });
  if (name == null) return false;
  const res = saveAsPreset(styleEnv(core), ref, name);
  if (!applyMeta(core, t('history.savePreset'), res)) return false;
  core.toast(t('presets.saved', { name: res.name ?? name }));
  return true;
}

export function updateItemPreset(core: EditorCore, ref: ItemRef): void {
  const res = updatePreset(styleEnv(core), ref);
  if (applyMeta(core, core.i18n.t('history.updatePreset'), res)) core.toast(core.i18n.t('presets.updated', { name: res.name ?? '' }));
}

export async function deleteItemPreset(core: EditorCore, ref: ItemRef, name: string): Promise<boolean> {
  const t = core.i18n.t;
  const n = presetUsers(core.meta, ref.kind, name).length;
  const ok = await core.dialogs.confirm(t('presets.deleteTitle'), n ? t(n === 1 ? 'presets.deleteUsers1' : 'presets.deleteUsersN', { name, n }) : t('presets.deleteMsg', { name }), { ok: t('presets.delete'), danger: true });
  if (!ok) return false;
  return applyMeta(core, t('history.deletePreset'), deleteLocalPreset(core.meta, ref.kind, name));
}

export interface PresetPickerOptions {
  cols?: number;
  /** Header element for Save as preset / Reset / Update. */
  actions?: HTMLElement | null;
  /** From the shape menu: the presets of that shape; picking also gives the node that shape. */
  shape?: string | null;
  /** Called after a change was applied (the toolbar closes its popover). */
  after?: () => void;
  /** Items of the same kind that take the picked preset (a bulk edit; default: the item alone). */
  targets?: readonly ItemRef[];
}

/** Fills `grid` with preset tiles for the item. */
export function presetPicker(core: EditorCore, grid: HTMLElement, ref: ItemRef, opts: PresetPickerOptions = {}): void {
  const t = core.i18n.t;
  const env = styleEnv(core);
  const { kind, id } = ref;
  const cols = opts.cols ?? 2;
  const forShape = opts.shape ?? null;
  const nodeShape = kind === 'node' ? nodeShapeOf(env, id) : null;
  const sameShape = !forShape || forShape === nodeShape;
  const ownPreset = env.meta[KIND_TO_COLL[kind]]?.[id]?.preset;
  // several items (bulk) with different presets: no tile is theirs
  const presetOf = (r: ItemRef): string => {
    const v = env.meta[KIND_TO_COLL[kind]]?.[r.id]?.preset;
    return typeof v === 'string' ? v : '';
  };
  const samePreset = !opts.targets || opts.targets.every((r) => presetOf(r) === presetOf(ref));
  const own = sameShape && samePreset ? (typeof ownPreset === 'string' ? ownPreset : '') : null;
  // the item has its own changes on top of its preset: that preset's tile is marked "modified"
  const modified = sameShape && Object.keys(ownLook(env.meta, ref)).length > 0;
  const auto = !forShape && (kind === 'node' || kind === 'edge' || kind === 'group');
  const autoName = auto ? currentPreset(env, ref) : '';
  grid.style.setProperty('--pp-cols', String(cols));
  const P = presetsFor(env, kind) ?? {};
  // nodes / participants: only the presets of the item's shape (or of the shape picked in the shape menu)
  const shape = kind === 'node' ? forShape ?? nodeShape : kind === 'participant' ? participantShapeOf(env, id) : null;
  const shapeOf = (p: string): string | undefined => {
    const st = P[p];
    if (!st) return undefined;
    return kind === 'participant' ? participantPresetShape(st) : presetShape(st);
  };
  const all = Object.keys(P).filter((p) => p !== '_base' && (!shape || shapeOf(p) === shape || p === own));
  const local = all.filter((n) => isLocalPreset(env, kind, n));
  const items: [HTMLElement, string][] = [];
  const done = (): void => opts.after?.();
  const tile = (name: string, isLocal: boolean): void => {
    const pic = h('div', { class: 'pp-pic', 'aria-hidden': 'true' });
    const caption = name || (auto ? (autoName && !own ? t('presets.autoArrow', { name: autoName }) : t('presets.auto')) : forShape ? t('presets.shapeDefault', { shape: forShape }) : t('presets.default'));
    const isOn = name === own;
    const b = h('button', {
      type: 'button',
      class: 'pp-item' + (isOn ? ' on' : '') + (isLocal ? ' local' : '') + (modified && isOn ? ' modified' : ''),
      'aria-pressed': String(isOn),
    }, pic, h('span', { class: 'pp-name' }, caption));
    b.title = (name ? t(isLocal ? 'presets.tipLocal' : 'presets.tip', { name }) : auto ? t('presets.tipAuto') : t('presets.tipDefault'))
      + (modified && isOn ? ` — ${t('presets.tipModified')}` : '');
    b.addEventListener('click', () => {
      const out = cloneMeta(core.meta);
      for (const target of opts.targets?.filter((x) => x.kind === kind) ?? [ref]) {
        const m = ensure(out, kind, target.id);
        if (name) m.preset = name;
        else delete m.preset;
        // from the shape menu: the node takes that shape too (unless the preset draws it already)
        if (forShape && !(name && P[name]?.shape === forShape)) {
          const n = core.model.type === 'flowchart' ? core.model.nodes.get(target.id) : undefined;
          if (forShape === (n?.shape ?? 'rect') && !P[name]?.shape) delete m.shape;
          else m.shape = forShape;
        }
        tidy(out, kind, target.id);
      }
      applyMeta(core, t('history.preset'), { meta: out });
      done();
    });
    if (isLocal) {
      const del = h('span', { class: 'pp-del', role: 'button', tabindex: '0', title: t('presets.deleteTip'), 'aria-label': t('presets.deleteTip') }, '×');
      const go = (ev: Event): void => {
        ev.stopPropagation();
        ev.preventDefault();
        void deleteItemPreset(core, ref, name).then((ok) => ok && done());
      };
      del.addEventListener('click', go);
      del.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') go(ev);
      });
      b.append(del);
    }
    grid.append(b);
    items.push([pic, name || (auto && !own ? autoName : '')]);
  };
  tile('', false);
  for (const n of all.filter((x) => !local.includes(x))) tile(n, false);
  if (local.length) {
    grid.append(h('div', { class: 'pp-sep' }, t('presets.thisDiagram')));
    for (const n of local) tile(n, true);
  }
  // the item's own changes → a preset: icon buttons in the picker's header
  if (!forShape && opts.actions) {
    const acts = opts.actions;
    acts.replaceChildren();
    const save = h('button', { type: 'button', class: 'pp-act', disabled: !modified, title: modified ? t('presets.saveTip') : t('presets.saveTipOff'), 'aria-label': t('presets.saveTitle') }, icon(ICON_SAVE, 17));
    save.addEventListener('click', () => void saveItemAsPreset(core, ref).then((ok) => ok && done()));
    const reset = h('button', { type: 'button', class: 'pp-act', disabled: !modified, title: modified ? t('presets.resetTip') : t('presets.resetTipOff'), 'aria-label': t('presets.reset') }, icon(ICON_RESET, 17));
    reset.addEventListener('click', () => {
      resetOwnLook(core, ref);
      done();
    });
    acts.append(save, reset);
    const cur = presetOfItem(env, ref);
    if (modified && cur && isLocalPreset(env, kind, cur)) {
      const up = h('button', { type: 'button', class: 'pp-act', title: t('presets.updateTip', { name: cur }), 'aria-label': t('presets.updateTip', { name: cur }) }, icon(ICON_UPDATE, 17));
      up.addEventListener('click', () => {
        updateItemPreset(core, ref);
        done();
      });
      acts.append(up);
    }
  }
  // drawn once laid out: the preview needs its width
  const fitH = cols > 3 ? 40 : cols > 2 ? 44 : 52;
  const draw = (): void => {
    for (const [pic, name] of items) {
      try {
        drawItemPreview(pic, kind, name, env.theme, { fit: { h: fitH }, styles: env.meta.styles, ...(kind === 'node' || kind === 'participant' ? (shape ? { shape } : {}) : {}) });
      } catch (e) {
        console.error('[mmdx] preset preview', e);
      }
    }
  };
  if (grid.isConnected) draw();
  else queueMicrotask(draw);
}
