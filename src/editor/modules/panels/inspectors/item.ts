// The Properties panel for one selected item (A.7 rows 61, 63; prototype app `refreshInspector`, `textSection`,
// `activationInspector`): title and sub line, its text (and an ER table's attributes or a relationship's
// cardinalities), layer, preset tiles, appearance and geometry fields, and the reset buttons.
import { KIND_TO_COLL } from '../../../../core/meta/types.js';
import { ensure, tidy, cloneMeta } from '../../../../core/ops/meta-util.js';
import { baseStyleOf, presetsFor } from '../../../../core/ops/style-env.js';
import { STYLE_FIELDS } from '../../../../core/schema/style-fields.js';
import type { ItemKind, ItemRef } from '../../../../core/types.js';
import { h } from '../../../../ui/kit/h.js';
import { applyMeta } from '../../../ops/doc.js';
import { animationOf, setAnimation } from '../../../ops/animation.js';
import { groupResetState, resetSelectedGroup } from '../../../ops/group.js';
import { describe, labelSpec } from '../../../ops/label.js';
import { field } from '../fields.js';
import { withEdit } from '../../../kinds/registry.js';
import { mediaSection } from './media.js';
import { itemTarget, layerRow, lineDefaults, lineFields, pickerSection, roundedBox } from './shared.js';
import { row, sect, type PanelCtx } from '../../../lib/panel.js';

function textSection(p: PanelCtx, host: HTMLElement, kind: ItemKind, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const spec = labelSpec(core, kind, id);
  if (!spec) return;
  const { value, multi } = spec;
  sect(host, t(spec.title));
  const inp: HTMLTextAreaElement | HTMLInputElement = multi ? h('textarea', { 'aria-label': t(spec.title) }) : h('input', { type: 'text', 'aria-label': t(spec.title) });
  inp.value = value;
  inp.placeholder = multi ? t('props.textMultiHint') : t('props.textHint');
  let done = false;
  const go = (): void => {
    if (done) return;
    const v = multi ? inp.value.replace(/\s+$/, '') : inp.value.trim();
    if (v === value) return;
    done = true;
    core.applyCode(spec.apply(v), t('history.text'), { select: [{ kind, id }] });
  };
  inp.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Enter' && (!multi || kev.metaKey || kev.ctrlKey)) {
      kev.preventDefault();
      go();
    }
    if (kev.key === 'Escape') {
      kev.stopPropagation();
      inp.value = value;
      inp.blur();
    }
  });
  inp.addEventListener('blur', go);
  // the emoji picker inserts at the caret and applies the text (T05 §4.5); ⌘/Ctrl+; opens it as well
  const emoji = core.has('pickEmoji') ? h('button', { type: 'button', class: 'prop-emoji', title: t('props.emoji'), 'aria-label': t('props.emoji') }, '☺') : null;
  if (emoji) {
    const pick = (): void => {
      const at = [inp.selectionStart ?? inp.value.length, inp.selectionEnd ?? inp.value.length] as const;
      core.run('pickEmoji', emoji, (e: string) => {
        const v = inp.value.slice(0, at[0]) + e + inp.value.slice(at[1]);
        inp.value = v;
        const text = multi ? v.replace(/\s+$/, '') : v.trim();
        core.applyCode(spec.apply(text), t('history.text'), { select: [{ kind, id }] });
        core.popovers.close();
      });
    };
    emoji.addEventListener('pointerdown', (ev) => ev.preventDefault());
    emoji.addEventListener('click', pick);
    inp.addEventListener('keydown', (ev) => {
      const kev = ev as KeyboardEvent;
      if (kev.key === ';' && (kev.metaKey || kev.ctrlKey)) {
        kev.preventDefault();
        pick();
      }
    });
  }
  host.append(h('div', { class: 'prop-label' }, inp, emoji));
  withEdit(core.model, (k) => k.inspector?.(p, host, { kind, id }));
}

/** The type's own controls (a state's kind and description rows, a composite's direction and regions). */
function kindSection(p: PanelCtx, host: HTMLElement, ref: ItemRef): void {
  const { core } = p;
  const controls = withEdit(core.model, (k, m) => k.properties?.(core, m, ref)) ?? [];
  for (const c of controls) {
    if (c.type === 'select') {
      const sel = h('select', { 'aria-label': c.label });
      for (const [v, label] of c.options) {
        const o = h('option', { value: v }, label);
        if (v === c.value) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => c.set(sel.value));
      host.append(row(c.label, sel));
    } else if (c.type === 'rows') {
      sect(host, c.label);
      const ta = h('textarea', { 'aria-label': c.label, class: 'prop-rows' });
      ta.value = c.value.join('\n');
      if (c.hint) ta.placeholder = c.hint;
      let done = false;
      const go = (): void => {
        const rows = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
        if (done || rows.join('\n') === c.value.join('\n')) return;
        done = true;
        c.set(rows);
      };
      ta.addEventListener('blur', go);
      ta.addEventListener('keydown', (ev) => {
        const kev = ev as KeyboardEvent;
        if (kev.key === 'Enter' && (kev.metaKey || kev.ctrlKey)) {
          kev.preventDefault();
          go();
        }
      });
      host.append(h('div', { class: 'prop-label' }, ta));
    } else {
      const b = h('button', { type: 'button', ...(c.title ? { title: c.title } : {}) }, c.label);
      b.addEventListener('click', () => c.run());
      host.append(h('div', { class: 'btnrow' }, b));
    }
  }
}

function activationInspector(p: PanelCtx, host: HTMLElement, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const info = describe(core.model, 'activation', id);
  host.append(h('div', { class: 'insp-title' }, info.title), h('div', { class: 'insp-sub' }, info.sub));
  host.append(h('div', { class: 'hint' }, t('props.activationHint')));
  const ref: ItemRef = { kind: 'activation', id };
  pickerSection(p, host, ref);
  sect(host, t('props.appearance'));
  const target = itemTarget(p, ref, baseStyleOf(core.styleEnv(), 'activation', id));
  for (const f of STYLE_FIELDS.activation) field(core.i18n, host, f, target);
  const del = h('button', { type: 'button' }, t('props.removeProcess'));
  del.addEventListener('click', () => core.run('deleteSelection'));
  host.append(h('div', { class: 'btnrow' }, del));
}

/** One selected item: its text, layer, preset, appearance and geometry, and the reset buttons. */
export function itemInspector(p: PanelCtx, host: HTMLElement, kind: ItemKind, id: string): void {
  const { core } = p;
  const t = core.i18n.t;
  const M = core.model;
  if (kind === 'activation') return activationInspector(p, host, id);
  const env = core.styleEnv();
  const ref: ItemRef = { kind, id };
  const info = describe(M, kind, id);
  host.append(h('div', { class: 'insp-title' }, info.title), h('div', { class: 'insp-sub' }, info.sub));
  textSection(p, host, kind, id);
  kindSection(p, host, ref);
  mediaSection(p, host, ref);
  layerRow(p, host, [ref]);
  if (presetsFor(env, kind)) pickerSection(p, host, ref);
  sect(host, t('props.appearance'));
  const base = baseStyleOf(env, kind, id);
  const target = itemTarget(p, ref, base);
  for (const f of STYLE_FIELDS[kind] ?? []) field(core.i18n, host, f, target);
  // a connector's animation, where its type writes one (flowchart: Mermaid's edge data)
  const anim = animationOf(core, ref);
  if (anim) {
    const sel = h('select', { 'aria-label': t('tb.animation') });
    for (const v of ['off', 'fast', 'slow'] as const) sel.append(h('option', { value: v }, t(`props.anim.${v}`)));
    sel.value = anim;
    sel.addEventListener('change', () => setAnimation(core, ref, sel.value as 'off' | 'fast' | 'slow'));
    host.append(row(t('tb.animation'), sel));
  }
  if (kind === 'box') return; // placed by its participants

  sect(host, t('props.geometry'));
  if (kind === 'node' || kind === 'entity') {
    const geo = itemTarget(p, ref, roundedBox(core.boxOf({ kind, id }) ?? undefined));
    for (const f of ['x', 'y', 'w', 'h']) field(core.i18n, host, f, geo);
  } else if (kind === 'group') {
    const gb = core.boxOf({ kind, id });
    const fixed = !!core.getM('group', id).w;
    const cb = h('input', { type: 'checkbox', 'aria-label': t('props.fixedFrame') });
    cb.checked = fixed;
    cb.addEventListener('change', () => {
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, 'group', id);
      if (cb.checked && gb) Object.assign(m, { x: Math.round(gb.x - gb.w / 2), y: Math.round(gb.y - gb.h / 2), w: Math.round(gb.w), h: Math.round(gb.h) });
      else {
        delete m.x;
        delete m.y;
        delete m['w'];
        delete m['h'];
      }
      tidy(meta, 'group', id);
      applyMeta(core, t('history.frame'), { meta });
    });
    host.append(row(t('props.fixedFrame'), cb, h('span', { class: 'hint' }, fixed ? t('props.fixedOn') : t('props.fixedOff'))));
    if (fixed) {
      const geo = itemTarget(p, ref, {});
      for (const f of ['x', 'y', 'w', 'h']) field(core.i18n, host, f, geo);
    }
    // "Reset positions in this group" (T07), where the type offers it; off when nothing inside is placed by hand
    const can = groupResetState(core, ref);
    if (can !== null) {
      const rb = h('button', { type: 'button', class: 'reset-group', title: t(can ? 'props.resetGroupTip' : 'group.resetNone') }, t('group.resetPositions'));
      rb.disabled = !can;
      rb.addEventListener('click', () => void resetSelectedGroup(core));
      host.append(h('div', { class: 'btnrow' }, rb));
    }
  } else if (kind === 'edge' || kind === 'rel') {
    const geo = itemTarget(p, ref, lineDefaults(core, kind));
    for (const f of lineFields(kind)) field(core.i18n, host, f, geo);
  } else if (kind === 'participant') {
    const geo = itemTarget(p, ref, roundedBox(core.boxOf({ kind, id }) ?? undefined));
    for (const f of ['x', 'w', 'h']) field(core.i18n, host, f, geo);
  } else if (kind === 'message' || kind === 'note' || kind === 'block') {
    field(core.i18n, host, 'dy', itemTarget(p, ref, { dy: 0 }));
  }

  const br = h('div', { class: 'btnrow' });
  const reset = h('button', { type: 'button', class: 'danger' }, t('props.resetAll'));
  reset.addEventListener('click', () => {
    const meta = cloneMeta(core.meta);
    const coll = meta[KIND_TO_COLL[kind]] as Record<string, unknown> | undefined;
    if (coll) delete coll[id];
    applyMeta(core, t('history.resetAll'), { meta });
  });
  br.append(reset);
  if (kind === 'edge' || kind === 'rel') {
    const lbl = h('button', { type: 'button' }, t('props.resetLabel'));
    lbl.addEventListener('click', () => {
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, kind, id);
      delete m.labelDx;
      delete m.labelDy;
      tidy(meta, kind, id);
      applyMeta(core, t('history.resetLabel'), { meta });
    });
    br.append(lbl);
  }
  host.append(br);
}
