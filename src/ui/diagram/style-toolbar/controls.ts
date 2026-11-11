// The style toolbar's bar buttons: one control per `ToolbarControl`, its icon showing the current value (colour,
// thickness, dash, shape) and its accessible name; popover openers carry `aria-haspopup` / `aria-expanded`, toggles
// `aria-pressed`. The toolbar's state and actions come in through `StyleCtx`.
import { FONTS } from '../fonts.js';
import { h, s } from '../../kit/h.js';
import type { I18n } from '../../../i18n.js';
import { formatKeys } from '../../kit/keys.js';
import type { PopHost } from '../../kit/toolbar-kit.js';
import { isNone } from '../../kit/toolbar-kit.js';
import { ICON, stackPreview, svgIcon } from './icons.js';
import { SIZES } from './kinds.js';
import type { KindSpec, ToolbarApi, ToolbarControl, ToolbarSelection } from './types.js';

/** What the controls and the popovers read and do (the toolbar instance). */
export interface StyleCtx {
  readonly t: I18n['t'];
  readonly api: ToolbarApi;
  readonly host: HTMLElement;
  readonly bar: HTMLElement;
  readonly pops: PopHost;
  /** The item the bar edits. */
  sel(): ToolbarSelection | null;
  /** Several items of one kind, edited together. */
  bulk(): boolean;
  /** Rebuilds the bar for the current selection. */
  refresh(): void;
  close(returnFocus?: boolean): void;
  /** Opens or closes the popover of control `name` under `btn`. */
  toggle(name: ToolbarControl, btn: HTMLElement, sp: KindSpec, focusIn?: boolean): void;
  /** Re-fills the open popover and the bar's indicators in place (the popover stays open). */
  again(name: ToolbarControl, sp: KindSpec): void;
}

// ---- values as the api returns them (strings, numbers, booleans or nothing)

export const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
export const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** `stack`: false / 0 single, true / 1 stacked, 2 double. */
export const stackLevel = (v: unknown): number => (v === true ? 1 : Number(v) || 0);

/** Writes the size of the selection (a table's title follows its attributes, one larger). */
export function setSize(x: StyleCtx, sp: KindSpec, v: number): void {
  if (x.sel()?.kind === 'entity' && (x.api.multiCount() < 2 || x.bulk())) x.api.set({ attrSize: v, titleSize: v + 1 });
  else x.api.set(sp.size ?? 'fontSize', v);
}

/** Controls that style a whole label only: off while part of its text is selected. */
const WHOLE_LABEL: ReadonlySet<ToolbarControl> = new Set(['font', 'size', 'align', 'link', 'textColor']);

/** The bar button of control `c` (an empty span when the host does not offer it). */
export function control(c: ToolbarControl, sp: KindSpec, x: StyleCtx): HTMLElement {
  const el = build(c, sp, x);
  if (WHOLE_LABEL.has(c) && x.api.textPartial?.()) {
    const tip = x.t('tb.wholeOnly');
    for (const b of [el, ...el.querySelectorAll<HTMLElement>('button, input')]) {
      if (b instanceof HTMLButtonElement || b instanceof HTMLInputElement) b.disabled = true;
    }
    el.title = tip;
    el.classList.add('off');
  }
  return el;
}

function build(c: ToolbarControl, sp: KindSpec, x: StyleCtx): HTMLElement {
  const { t, api } = x;
  const e = (k: string): unknown => api.eff(k);

  // a popover opener
  const button = (name: ToolbarControl, content: Node, title: string, menu = false): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, 'aria-haspopup': menu ? 'menu' : 'dialog', 'aria-expanded': 'false', dataset: { c: name } }, content);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      x.toggle(name, b, sp, ev.detail === 0);
    });
    return b;
  };
  // a one-click action or switch
  const action = (name: ToolbarControl, content: Node, title: string, run: () => void, o: { active?: boolean; disabled?: boolean; danger?: boolean; pressed?: boolean } = {}): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'mtb-btn' + (o.active ? ' active' : '') + (o.danger ? ' danger' : ''), title, 'aria-label': title, dataset: { c: name } }, content);
    if (o.pressed !== undefined) b.setAttribute('aria-pressed', String(o.pressed));
    b.disabled = !!o.disabled;
    b.addEventListener('click', run);
    return b;
  };
  const toggleKey = (name: ToolbarControl, key: string, icon: string, title: string, on: boolean, off: unknown, onValue: unknown): HTMLButtonElement =>
    action(name, svgIcon(icon), title, () => {
      api.set(key, on ? off : onValue);
      x.refresh();
    }, { active: on, pressed: on });

  switch (c) {
    case 'shape':
      // an icon or image node has no shape of its own (Mermaid draws the icon or the picture)
      if (api.media?.()?.node) return h('span');
      return button('shape', sp.shapes ? svgIcon('shape') : stackPreview(Math.max(1, stackLevel(e('stack'))), 24), sp.shapes ? t('tb.shapeStack') : t('tb.stack'));
    case 'font': {
      const fam = str(e('fontFamily'));
      const label = FONTS.find((f) => f[0] === fam)?.[1] ?? (fam ? fam.split(',')[0]!.replace(/'/g, '') : api.themeFontName());
      const b = button('font', h('span', { class: 'mtb-font' }, label), t('tb.font'));
      b.setAttribute('aria-label', `${t('tb.font')}: ${label}`);
      b.classList.add('wide');
      return b;
    }
    case 'size': {
      const key = sp.size ?? 'fontSize';
      const val = Math.round(num(e(key)) ?? 14);
      const wrap = h('div', { class: 'mtb-size', dataset: { c: 'size' } });
      const input = h('input', { class: 'mtb-num', type: 'text', inputMode: 'numeric', title: t('tb.fontSize'), 'aria-label': t('tb.fontSize') });
      input.value = String(val);
      const step = (dir: number): void => {
        const cur = Math.round(num(api.eff(key)) ?? 14);
        const next = dir > 0 ? SIZES.find((v) => v > cur) ?? cur + 4 : [...SIZES].reverse().find((v) => v < cur) ?? Math.max(6, cur - 2);
        setSize(x, sp, next);
        input.value = String(next);
      };
      input.addEventListener('change', () => setSize(x, sp, Math.max(6, Math.min(120, Number(input.value) || val))));
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
          ev.preventDefault();
          step(ev.key === 'ArrowUp' ? 1 : -1);
        }
        if (ev.key !== 'Escape') ev.stopPropagation();
      });
      const up = h('button', { type: 'button', title: t('tb.larger'), 'aria-label': t('tb.larger'), tabindex: '-1', onclick: () => step(1) }, svgIcon('up'));
      const dn = h('button', { type: 'button', title: t('tb.smaller'), 'aria-label': t('tb.smaller'), tabindex: '-1', onclick: () => step(-1) }, svgIcon('down'));
      wrap.append(input, h('div', { class: 'mtb-steps' }, up, dn));
      return wrap;
    }
    case 'bold': {
      // a label that can be rich: the text format menu (bold, italic, underline, strike)
      const f = api.textFormats?.();
      if (f) {
        const b = button('bold', svgIcon('bold'), t('tb.format'), true);
        if (f.b || f.i || f.u || f.s) b.classList.add('active');
        return b;
      }
      const key = sp.bold ?? 'fontWeight';
      const on = (num(e(key)) ?? (e(key) === 'bold' ? 700 : 400)) >= 600;
      return toggleKey('bold', key, 'bold', t('tb.bold'), on, 400, 700);
    }
    case 'align': {
      const cur = str(e('align')) || 'center';
      return button('align', svgIcon(ICON[cur] ? cur : 'center'), t('tb.textPos'));
    }
    case 'link': {
      if (!api.linkable?.()) return h('span');
      const b = button('link', svgIcon('link'), t('tb.link'));
      if (e('link')) b.classList.add('active');
      return b;
    }
    case 'textColor': {
      const col = str(e(sp.text ?? 'text')) || '#1f1f1f';
      const halo = s('rect', { x: '4.5', y: '19', width: '15', height: '4', rx: '1.4', fill: 'none', 'stroke-width': '1.6', style: 'stroke:var(--mmdx-halo)' });
      const bar1 = s('rect', { x: '5', y: '19.5', width: '14', height: '3', rx: '1', 'stroke-width': '0.6' });
      bar1.setAttribute('fill', col);
      bar1.setAttribute('stroke', col);
      return button('textColor', svgIcon('text', [halo, bar1]), t('tb.textColor'));
    }
    case 'border': {
      const col = e('stroke');
      const w = Math.min(5, Math.max(1.5, (num(e('strokeWidth')) ?? 0) * 1.4 || 2));
      const dash = str(e('dash'));
      const el = s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true' });
      const a = s('circle', { cx: '12', cy: '12', r: '8', fill: 'none', 'stroke-width': String(w + 3), style: 'stroke:var(--mmdx-halo)' });
      const b = s('circle', { cx: '12', cy: '12', r: '8', fill: 'none', 'stroke-width': String(w + 1) });
      b.setAttribute('stroke', isNone(col) ? 'var(--mmdx-faint)' : str(col));
      if (dash && dash !== 'none') {
        // a ring of round dots (dotted) or short dashes (dashed) along the circle, whatever the border's width: the
        // item's own dash pattern at this size would stand out from the ring as spikes
        const dotted = (Number(dash.split(' ')[0]) || 0) <= 2;
        const seg = (2 * Math.PI * 8) / (dotted ? 10 : 8);
        const da = dotted ? `0 ${seg.toFixed(3)}` : `${(seg * 0.55).toFixed(3)} ${(seg * 0.45).toFixed(3)}`;
        for (const [c, sw] of [[a, 5], [b, 3]] as const) {
          c.setAttribute('stroke-dasharray', da);
          c.setAttribute('stroke-linecap', 'round');
          c.setAttribute('stroke-width', String(dotted ? sw : sw - 0.5));
        }
      }
      el.append(a, b);
      return button('border', el, t('tb.border'));
    }
    case 'fill': {
      const col = e('fill');
      const sw = isNone(col) ? h('span', { class: 'mtb-dot checker' }) : h('span', { class: 'mtb-dot', style: { background: str(col), opacity: String(num(e('fillOpacity')) ?? 1) } });
      return button('fill', sw, t('tb.fill'));
    }
    case 'line': {
      const col = str(e('color'));
      const lw = Math.min(5, (num(e('width')) ?? 1.5) + 1);
      const dash = str(e('dash'));
      const el = s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true' });
      const a = s('path', { d: 'M4 20L20 4', 'stroke-width': String(lw + 2), 'stroke-linecap': 'round', style: 'stroke:var(--mmdx-halo)' });
      const b = s('path', { d: 'M4 20L20 4', 'stroke-width': String(lw), 'stroke-linecap': 'round' });
      b.setAttribute('stroke', col || 'currentColor');
      if (dash && dash !== 'none') {
        a.setAttribute('stroke-dasharray', dash);
        b.setAttribute('stroke-dasharray', dash);
      }
      el.append(a, b);
      return button('line', el, t('tb.line'));
    }
    case 'arrows':
      return button('arrows', svgIcon('arrows'), t('tb.arrows'));
    case 'actions': {
      // the type's own one-click actions, one button each (a note's placement: the current one pressed)
      const list = api.itemActions?.() ?? [];
      if (!list.length) return h('span');
      const wrap = h('span', { class: 'mtb-acts' });
      for (const a of list) {
        const b = action('actions', svgIcon(a.icon), a.label, () => {
          a.run();
          x.refresh();
        }, { active: !!a.active, disabled: !!a.disabled, ...(a.active !== undefined ? { pressed: a.active } : {}) });
        b.dataset['c'] = `act:${a.id}`;
        wrap.append(b);
      }
      return wrap;
    }
    case 'routing':
      return button('routing', svgIcon('routing'), t('tb.routing'));
    case 'lock': {
      if (!api.isLocked || !api.toggleLock) return h('span');
      const locked = api.isLocked();
      return action('lock', svgIcon(locked ? 'lock' : 'unlock'), locked ? t('tb.unlock') : t('tb.lock'), () => {
        api.toggleLock?.();
        x.refresh();
      }, { active: locked, pressed: locked });
    }
    case 'paint': {
      if (!api.togglePaint) return h('span');
      const on = !!api.isPainting?.();
      return action('paint', svgIcon('paint'), t('tb.paint'), () => {
        x.close();
        api.togglePaint?.();
        x.refresh();
      }, { active: on, pressed: on });
    }
    case 'group': {
      if (!api.group) return h('span');
      const g = api.canGroup?.() ?? { ok: true };
      const title = t('tb.group', { keys: formatKeys('mod+g') });
      return action('group', svgIcon('group'), g.ok ? title : g.reason ?? title, () => api.group?.(), { disabled: !g.ok });
    }
    case 'arrange':
      return api.arrange ? button('arrange', svgIcon('alignLeft'), t('tb.arrange')) : h('span');
    case 'activate': {
      const a = api.activation?.();
      if (!a) return h('span');
      const title = a.reason ?? (a.removed ? t('tb.activationRemove', { p: a.participant }) : t('tb.activationAdd', { p: a.participant }));
      return action('activate', svgIcon('process'), title, () => api.toggleActivation?.(), { active: !!a.removed, disabled: !!a.reason });
    }
    case 'editGroup': {
      const sel = x.sel();
      if (!api.editGroup || !sel) return h('span');
      const on = api.groupEditing?.() === sel.id;
      return action('editGroup', svgIcon('editGroup'), on ? t('tb.editGroupDone') : t('tb.editGroup'), () => api.editGroup?.(), { active: on, pressed: on });
    }
    case 'ungroup':
      return api.ungroup ? action('ungroup', svgIcon('ungroup'), t('tb.ungroup', { keys: formatKeys('mod+shift+g') }), () => api.ungroup?.()) : h('span');
    case 'delete':
      return api.del ? action('delete', svgIcon('trash'), t('tb.delete', { keys: formatKeys('delete') }), () => api.del?.(), { danger: true }) : h('span');
    case 'order': {
      if (!api.order) return h('span');
      const keys = `${formatKeys('mod+[')} ${formatKeys('mod+]')}`;
      return button('order', svgIcon('zorder'), t(api.orderTitle?.() ?? 'tb.order', { keys }));
    }
    case 'layer':
      return api.layers && api.setLayer ? button('layer', svgIcon('layers'), t('tb.layer'), true) : h('span');
    case 'presets':
      return api.renderPresets ? button('presets', svgIcon('presets'), t('tb.presets')) : h('span');
    case 'reset': {
      const can = !!api.canReset?.();
      return action('reset', svgIcon('reset'), can ? t('tb.reset') : t('tb.resetNone'), () => {
        x.close();
        api.reset?.();
        x.refresh();
      }, { disabled: !can });
    }
    case 'more':
      // the ⋮ menu holds the item actions: a host without them (the theme editor) has none
      return api.copy || api.duplicate || api.del || api.savePreset ? button('more', svgIcon('more'), t('tb.more'), true) : h('span');
    case 'tableStyle':
      return button('tableStyle', svgIcon('table'), t('tb.tableStyle'));
    case 'italic':
    case 'underline':
      return toggleKey(c, c, c, t(`tb.${c}`), e(c) === true, false, true);
    case 'wrap':
      // word wrap as a switch (participants: their text has no alignment to pick)
      return toggleKey('wrap', 'wrap', 'wrap', t('tb.wrapTip'), e('wrap') === true, undefined, true);
    case 'source': {
      // Change image: the image tool, its tabs the picture's sources (library, upload, URL) and an icon
      const m = api.media?.();
      if (!m?.node || !api.pickImage) return h('span');
      const title = m.node === 'icon' ? t('tb.changeImageIcon', { name: m.icon ?? '' }) : t('image.change');
      const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, 'aria-haspopup': 'dialog', dataset: { c: 'source' } }, svgIcon('media'));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        x.close();
        api.pickImage?.(b);
      });
      return b;
    }
    case 'media': {
      // an image node's settings, per its source: the icon's frame or the picture's fit and aspect lock, and the label's
      // position (sizes are in Properties)
      const m = api.media?.();
      if (!m?.node || !api.setMedia) return h('span');
      return button('media', svgIcon('mediaSettings'), m.node === 'icon' ? t('tb.mediaIcon') : t('tb.mediaImage'));
    }
    case 'selection': {
      const n = api.multiCount();
      const b = button('selection', h('span', { class: 'mtb-count' }, svgIcon('selection'), h('b', null, String(n))), t('tb.selection', { n }));
      b.classList.add('wide');
      return b;
    }
  }
}
