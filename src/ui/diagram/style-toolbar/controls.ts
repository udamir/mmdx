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

/** Writes the size of the selection, and the keys the kind sets with it (`sizeAlso`: a table's title, one larger than its attributes). */
function setSize(x: StyleCtx, sp: KindSpec, v: number): void {
  const key = sp.size ?? 'fontSize';
  if (sp.sizeAlso) x.api.set({ [key]: v, ...Object.fromEntries(Object.entries(sp.sizeAlso).map(([k, d]) => [k, v + d])) });
  else x.api.set(key, v);
}

/** Controls that style a whole label only: off while part of its text is selected. */
const WHOLE_LABEL: ReadonlySet<ToolbarControl> = new Set(['font', 'size', 'align', 'link', 'textColor']);

/** The bar button of control `c` (an empty span when the host does not offer it). */
export function control(c: ToolbarControl, sp: KindSpec, x: StyleCtx): HTMLElement {
  const el = CONTROLS[c](controlKit(sp, x));
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

/** What a control's builder gets: the kind's spec, the toolbar, the effective style values and the button makers. */
interface ControlKit {
  readonly sp: KindSpec;
  readonly x: StyleCtx;
  readonly t: I18n['t'];
  readonly api: ToolbarApi;
  /** The effective value of a style key. */
  e(k: string): unknown;
  /** A popover opener (`menu`: its popover is a menu). */
  button(name: ToolbarControl, content: Node, title: string, menu?: boolean): HTMLButtonElement;
  /** A one-click action or switch. */
  action(name: ToolbarControl, content: Node, title: string, run: () => void, o?: { active?: boolean; disabled?: boolean; danger?: boolean; pressed?: boolean }): HTMLButtonElement;
  /** A switch of one style key between two values. */
  toggleKey(name: ToolbarControl, key: string, icon: string, title: string, on: boolean, off: unknown, onValue: unknown): HTMLButtonElement;
}

function controlKit(sp: KindSpec, x: StyleCtx): ControlKit {
  const { t, api } = x;
  const button: ControlKit['button'] = (name, content, title, menu = false) => {
    const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, 'aria-haspopup': menu ? 'menu' : 'dialog', 'aria-expanded': 'false', dataset: { c: name } }, content);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      x.toggle(name, b, sp, ev.detail === 0);
    });
    return b;
  };
  const action: ControlKit['action'] = (name, content, title, run, o = {}) => {
    const b = h('button', { type: 'button', class: 'mtb-btn' + (o.active ? ' active' : '') + (o.danger ? ' danger' : ''), title, 'aria-label': title, dataset: { c: name } }, content);
    if (o.pressed !== undefined) b.setAttribute('aria-pressed', String(o.pressed));
    b.disabled = !!o.disabled;
    b.addEventListener('click', run);
    return b;
  };
  const toggleKey: ControlKit['toggleKey'] = (name, key, icon, title, on, off, onValue) =>
    action(name, svgIcon(icon), title, () => {
      api.set(key, on ? off : onValue);
      x.refresh();
    }, { active: on, pressed: on });
  return { sp, x, t, api, e: (k) => api.eff(k), button, action, toggleKey };
}

/** A control the host does not offer (or that does not apply to the selection). */
const absent = (): HTMLElement => h('span');

/** Italic and Underline: switches of their own style key. */
const textSwitch = (c: 'italic' | 'underline') => ({ t, e, toggleKey }: ControlKit): HTMLElement => toggleKey(c, c, c, t(`tb.${c}`), e(c) === true, false, true);

/** The size field with its steppers (the size key is the kind's; Enter leaves the field, up / down step through SIZES). */
function sizeControl({ sp, x, t, api, e }: ControlKit): HTMLElement {
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

/** The border opener: a ring in the border's colour, thickness and dash. */
function borderControl({ t, e, button }: ControlKit): HTMLElement {
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

/** The line opener: a stroke in the line's colour, width and dash. */
function lineControl({ t, e, button }: ControlKit): HTMLElement {
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

/** The bar button of each control (R15), mirroring the popovers' table (POPS, pops/index.ts). */
const CONTROLS: Readonly<Record<ToolbarControl, (k: ControlKit) => HTMLElement>> = {
  // an icon or image node has no shape of its own (Mermaid draws the icon or the picture)
  shape: (k) => (k.api.media?.()?.node ? absent()
    : k.button('shape', k.sp.shapes ? svgIcon('shape') : stackPreview(Math.max(1, stackLevel(k.e('stack'))), 24), k.sp.shapes ? k.t('tb.shapeStack') : k.t('tb.stack'))),
  font: (k) => {
    const fam = str(k.e('fontFamily'));
    const label = fam ? FONTS.find((f) => f[0] === fam)?.[1] ?? fam.split(',')[0]!.replace(/'/g, '') : k.t('tb.themeFont');
    const b = k.button('font', h('span', { class: 'mtb-font' }, label), k.t('tb.font'));
    b.setAttribute('aria-label', `${k.t('tb.font')}: ${label}`);
    b.classList.add('wide');
    return b;
  },
  size: sizeControl,
  bold: (k) => {
    // a label that can be rich: the text format menu (bold, italic, underline, strike)
    const f = k.api.textFormats?.();
    if (f) {
      const b = k.button('bold', svgIcon('bold'), k.t('tb.format'), true);
      if (f.b || f.i || f.u || f.s) b.classList.add('active');
      return b;
    }
    const key = k.sp.bold ?? 'fontWeight';
    const on = (num(k.e(key)) ?? (k.e(key) === 'bold' ? 700 : 400)) >= 600;
    return k.toggleKey('bold', key, 'bold', k.t('tb.bold'), on, 400, 700);
  },
  align: (k) => {
    const cur = str(k.e('align')) || 'center';
    return k.button('align', svgIcon(ICON[cur] ? cur : 'center'), k.t('tb.textPos'));
  },
  link: (k) => {
    if (!k.api.linkable?.()) return absent();
    const b = k.button('link', svgIcon('link'), k.t('tb.link'));
    if (k.e('link')) b.classList.add('active');
    return b;
  },
  textColor: (k) => {
    const col = str(k.e(k.sp.text ?? 'text')) || '#1f1f1f';
    const halo = s('rect', { x: '4.5', y: '19', width: '15', height: '4', rx: '1.4', fill: 'none', 'stroke-width': '1.6', style: 'stroke:var(--mmdx-halo)' });
    const bar1 = s('rect', { x: '5', y: '19.5', width: '14', height: '3', rx: '1', 'stroke-width': '0.6' });
    bar1.setAttribute('fill', col);
    bar1.setAttribute('stroke', col);
    return k.button('textColor', svgIcon('text', [halo, bar1]), k.t('tb.textColor'));
  },
  border: borderControl,
  fill: (k) => {
    const col = k.e('fill');
    const sw = isNone(col) ? h('span', { class: 'mtb-dot checker' }) : h('span', { class: 'mtb-dot', style: { background: str(col), opacity: String(num(k.e('fillOpacity')) ?? 1) } });
    return k.button('fill', sw, k.t('tb.fill'));
  },
  line: lineControl,
  arrows: (k) => k.button('arrows', svgIcon('arrows'), k.t('tb.arrows')),
  // the type's own one-click actions, one button each (a note's placement: the current one pressed)
  actions: (k) => {
    const list = k.api.itemActions?.() ?? [];
    if (!list.length) return absent();
    const wrap = h('span', { class: 'mtb-acts' });
    for (const a of list) {
      const b = k.action('actions', svgIcon(a.icon), a.label, () => {
        a.run();
        k.x.refresh();
      }, { active: !!a.active, disabled: !!a.disabled, ...(a.active !== undefined ? { pressed: a.active } : {}) });
      b.dataset['c'] = `act:${a.id}`;
      wrap.append(b);
    }
    return wrap;
  },
  routing: (k) => k.button('routing', svgIcon('routing'), k.t('tb.routing')),
  lock: (k) => {
    if (!k.api.isLocked || !k.api.toggleLock) return absent();
    const locked = k.api.isLocked();
    return k.action('lock', svgIcon(locked ? 'lock' : 'unlock'), locked ? k.t('tb.unlock') : k.t('tb.lock'), () => {
      k.api.toggleLock?.();
      k.x.refresh();
    }, { active: locked, pressed: locked });
  },
  paint: (k) => {
    if (!k.api.togglePaint) return absent();
    const on = !!k.api.isPainting?.();
    return k.action('paint', svgIcon('paint'), k.t('tb.paint'), () => {
      k.x.close();
      k.api.togglePaint?.();
      k.x.refresh();
    }, { active: on, pressed: on });
  },
  group: (k) => {
    if (!k.api.group) return absent();
    const g = k.api.canGroup?.() ?? { ok: true };
    const title = k.t('tb.group', { keys: formatKeys('mod+g') });
    return k.action('group', svgIcon('group'), g.ok ? title : g.reason ?? title, () => k.api.group?.(), { disabled: !g.ok });
  },
  arrange: (k) => (k.api.arrange ? k.button('arrange', svgIcon('alignLeft'), k.t('tb.arrange')) : absent()),
  activate: (k) => {
    const a = k.api.activation?.();
    if (!a) return absent();
    const title = a.reason ?? (a.removed ? k.t('tb.activationRemove', { p: a.participant }) : k.t('tb.activationAdd', { p: a.participant }));
    return k.action('activate', svgIcon('process'), title, () => k.api.toggleActivation?.(), { active: !!a.removed, disabled: !!a.reason });
  },
  editGroup: (k) => {
    const sel = k.x.sel();
    if (!k.api.editGroup || !sel) return absent();
    const on = k.api.groupEditing?.() === sel.id;
    return k.action('editGroup', svgIcon('editGroup'), on ? k.t('tb.editGroupDone') : k.t('tb.editGroup'), () => k.api.editGroup?.(), { active: on, pressed: on });
  },
  ungroup: (k) => (k.api.ungroup ? k.action('ungroup', svgIcon('ungroup'), k.t('tb.ungroup', { keys: formatKeys('mod+shift+g') }), () => k.api.ungroup?.()) : absent()),
  delete: (k) => (k.api.del ? k.action('delete', svgIcon('trash'), k.t('tb.delete', { keys: formatKeys('delete') }), () => k.api.del?.(), { danger: true }) : absent()),
  order: (k) => {
    if (!k.api.order) return absent();
    const keys = `${formatKeys('mod+[')} ${formatKeys('mod+]')}`;
    return k.button('order', svgIcon('zorder'), k.t(k.api.orderTitle?.() ?? 'tb.order', { keys }));
  },
  layer: (k) => (k.api.layers && k.api.setLayer ? k.button('layer', svgIcon('layers'), k.t('tb.layer'), true) : absent()),
  presets: (k) => (k.api.renderPresets ? k.button('presets', svgIcon('presets'), k.t('tb.presets')) : absent()),
  reset: (k) => {
    const can = !!k.api.canReset?.();
    return k.action('reset', svgIcon('reset'), can ? k.t('tb.reset') : k.t('tb.resetNone'), () => {
      k.x.close();
      k.api.reset?.();
      k.x.refresh();
    }, { disabled: !can });
  },
  // the ⋮ menu holds the item actions: a host without them (the theme editor) has none
  more: (k) => (k.api.copy || k.api.duplicate || k.api.del || k.api.savePreset ? k.button('more', svgIcon('more'), k.t('tb.more'), true) : absent()),
  tableStyle: (k) => k.button('tableStyle', svgIcon('table'), k.t('tb.tableStyle')),
  italic: textSwitch('italic'),
  underline: textSwitch('underline'),
  // word wrap as a switch (participants: their text has no alignment to pick)
  wrap: (k) => k.toggleKey('wrap', 'wrap', 'wrap', k.t('tb.wrapTip'), k.e('wrap') === true, undefined, true),
  // Change image: the image tool, its tabs the picture's sources (library, upload, URL) and an icon
  source: (k) => {
    const m = k.api.media?.();
    if (!m?.node || !k.api.pickImage) return absent();
    const title = m.node === 'icon' ? k.t('tb.changeImageIcon', { name: m.icon ?? '' }) : k.t('image.change');
    const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, 'aria-haspopup': 'dialog', dataset: { c: 'source' } }, svgIcon('media'));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      k.x.close();
      k.api.pickImage?.(b);
    });
    return b;
  },
  // an image node's settings, per its source: the icon's frame or the picture's fit and aspect lock, and the label's
  // position (sizes are in Properties)
  media: (k) => {
    const m = k.api.media?.();
    if (!m?.node || !k.api.setMedia) return absent();
    return k.button('media', svgIcon('mediaSettings'), m.node === 'icon' ? k.t('tb.mediaIcon') : k.t('tb.mediaImage'));
  },
  selection: (k) => {
    const n = k.api.multiCount();
    const b = k.button('selection', h('span', { class: 'mtb-count' }, svgIcon('selection'), h('b', null, String(n))), k.t('tb.selection', { n }));
    b.classList.add('wide');
    return b;
  },
};
