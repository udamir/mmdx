// The Properties panel with nothing selected (A.7 row 61, A.5 row 52; prototype app `canvasInspector`,
// `pageSizeFields`): the diagram type, direction or numbering, page preset, routing, background and border, the page
// size (fit / custom, proportions, width × height with a ratio lock), the sequence layout and the editor's snap grid.
import type { DiagramMeta } from '../../../../core/meta/types.js';
import type { Direction, DiagramType } from '../../../../core/model.js';
import { cloneMeta } from '../../../../core/ops/meta-util.js';
import { pagePresets, ratioOf } from '../../../../core/render/page.js';
import { h, icon } from '../../../../ui/h.js';
import { ICONS } from '../../../../ui/icons.js';
import { applyMeta, DIAGRAM_TYPES, FLOW_DIRS, setAutonumberOn, setFlowDirection, switchDiagramType } from '../../../ops/doc.js';
import { choosePagePreset, pageEff, RATIOS, setPageRatio, setPageSizeMode, setPageValue } from '../../../ops/page.js';
import { field } from '../fields.js';
import { canvasTarget, row, sect, type PanelCtx } from './shared.js';

const HAS_DIRECTION = new Set<string | null>(['flowchart', 'er']);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function pageSizeFields(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const c = core.meta.canvas;
  const custom = !!(c.w && c.h);
  const er = typeof pageEff(core).ratio === 'string' ? (pageEff(core).ratio as string) : ''; // proportions in effect
  const k = ratioOf(er);
  const b = core.result.result.bounds;
  /** Resizes a custom page around its centre. */
  const resize = (meta: DiagramMeta, w: number, hh: number): void => {
    const cc = meta.canvas;
    w = Math.max(40, Math.round(w));
    hh = Math.max(40, Math.round(hh));
    const cx = (cc.x ?? 0) + (cc.w ?? 0) / 2, cy = (cc.y ?? 0) + (cc.h ?? 0) / 2;
    Object.assign(cc, { w, h: hh, x: Math.round(cx - w / 2), y: Math.round(cy - hh / 2) });
  };
  sect(host, t('page.size'));
  const seg = h('div', { class: 'seg small page-size-seg', role: 'radiogroup', 'aria-label': t('page.pageSize') });
  for (const [v, label] of [['fit', t('page.fit')], ['custom', t('page.custom')]] as const) {
    const on = (v === 'custom') === custom;
    const bt = h('button', { type: 'button', class: on ? 'on' : '', role: 'radio', 'aria-checked': String(on) }, label);
    bt.addEventListener('click', () => {
      if (!on) setPageSizeMode(core, v);
    });
    seg.append(bt);
  }
  host.append(row(t('page.pageSize'), seg));
  // proportions
  const preset = RATIOS.find(([r]) => r === er);
  const sel = h('select', { 'aria-label': t('page.proportions') });
  sel.append(new Option(t('page.free'), ''), ...RATIOS.map(([r, label]) => new Option(label.startsWith('ratio.') ? t(label) : label, r)), new Option(t('page.customRatio'), 'custom'));
  sel.value = !k ? '' : preset ? er : 'custom';
  sel.addEventListener('change', () => {
    if (sel.value === 'custom') {
      const w = Math.round(b.w), hh = Math.round(b.h), g = gcd(w, hh) || 1;
      setPageRatio(core, `${w / g}:${hh / g}`);
    } else setPageRatio(core, sel.value);
  });
  const ratioRow = row(t('page.proportions'), sel);
  ratioRow.classList.toggle('set', !!k);
  host.append(ratioRow);
  if (k && !preset) {
    // custom proportions: W : H
    const [rw = '', rh = ''] = er.split(':');
    const a = h('input', { type: 'number', min: '0.1', step: 'any', value: rw, class: 'ratio-in', 'aria-label': t('page.ratioW') });
    const z = h('input', { type: 'number', min: '0.1', step: 'any', value: rh, class: 'ratio-in', 'aria-label': t('page.ratioH') });
    const upd = (): void => {
      if (+a.value > 0 && +z.value > 0) setPageRatio(core, `${+a.value}:${+z.value}`);
    };
    a.addEventListener('change', upd);
    z.addEventListener('change', upd);
    host.append(row('', a, h('span', { class: 'ratio-sep' }, ':'), z));
  }
  // width × height (+ lock)
  const W = h('input', { type: 'number', min: '40', value: String(Math.round(b.w)), disabled: !custom, 'aria-label': t('page.width') });
  const H = h('input', { type: 'number', min: '40', value: String(Math.round(b.h)), disabled: !custom, 'aria-label': t('page.height') });
  if (!custom) W.title = H.title = t('page.fitsContent');
  const apply = (w: number, hh: number): void => {
    const meta = cloneMeta(core.meta);
    resize(meta, w, hh);
    applyMeta(core, t('history.pageSize'), { meta });
  };
  W.addEventListener('change', () => {
    const w = +W.value;
    if (w > 0) apply(w, k ? w / k : c.h ?? b.h);
  });
  H.addEventListener('change', () => {
    const hh = +H.value;
    if (hh > 0) apply(k ? hh * k : c.w ?? b.w, hh);
  });
  const lock = h('button', { type: 'button', class: 'lock-btn' + (k ? ' on' : ''), title: k ? t('page.unlock') : t('page.lock'), 'aria-label': k ? t('page.unlock') : t('page.lock'), 'aria-pressed': String(!!k) },
    icon(k ? ICONS.lock : ICONS.unlock, 15));
  lock.addEventListener('click', () => {
    if (k) {
      applyMeta(core, t('history.pageRatio'), { meta: setPageValue(core, 'ratio', '', '') });
      return;
    }
    const w = Math.round(b.w), hh = Math.round(b.h), g = gcd(w, hh) || 1;
    const named = RATIOS.find(([x]) => Math.abs(ratioOf(x) - w / hh) < 0.005)?.[0]; // name it when it is a known one
    applyMeta(core, t('history.pageRatio'), { meta: setPageValue(core, 'ratio', named ?? `${w / g}:${hh / g}`, '') });
  });
  const wh = row(t('page.wh'), W, lock, H);
  wh.classList.add('page-wh');
  host.append(wh);
}

export function canvasInspector(p: PanelCtx, host: HTMLElement): void {
  const { core } = p;
  const t = core.i18n.t;
  const M = core.model;
  const T = core.result.theme;
  host.append(h('div', { class: 'insp-title' }, t('props.diagram')), h('div', { class: 'insp-sub' }, t('props.nothingSelected')));
  sect(host, t('page.title'));
  const selRow = (label: string, opts: readonly (readonly [string, string])[], cur: string, pick: (v: string) => void): void => {
    const sel = h('select', { 'aria-label': label });
    sel.append(...opts.map(([v, l]) => new Option(l, v)));
    sel.value = cur;
    sel.addEventListener('change', () => {
      const v = sel.value;
      sel.value = cur; // the type switch may be cancelled
      pick(v);
    });
    host.append(row(label, sel));
  };
  if (!M.type) return;
  selRow(t('page.type'), DIAGRAM_TYPES.map(([v, k]) => [v, t(k)] as const), M.type, (v) => void switchDiagramType(core, v as DiagramType));
  if (HAS_DIRECTION.has(M.type) && (M.type === 'flowchart' || M.type === 'er')) selRow(t('page.direction'), FLOW_DIRS.map(([v, k]) => [v, t(k)] as const), M.direction, (v) => setFlowDirection(core, v as Direction));
  if (M.type === 'sequence') selRow(t('page.numbers'), [['off', t('page.numbersOff')], ['on', t('page.numbersOn')]], M.autonumber ? 'on' : 'off', (v) => setAutonumberOn(core, v === 'on'));
  const presets = Object.entries(pagePresets(T, M.type)).map(([id, pp]) => [id, pp.label || id] as const);
  if (presets.length) selRow(t('page.preset'), [['', t('page.presetNone')], ...presets], typeof core.meta.canvas.preset === 'string' ? core.meta.canvas.preset : '', (v) => choosePagePreset(core, v));
  const presetName = core.meta.canvas.preset;
  const pp = (typeof presetName === 'string' ? pagePresets(T, M.type)[presetName] : undefined) ?? {};
  if (M.type !== 'sequence') field(core.i18n, host, 'routing', canvasTarget(p, { routing: pp.routing ?? 'curved' })); // messages are always straight
  const pageBase = { ...T.canvas, ...pp };
  for (const f of ['background', 'border']) field(core.i18n, host, f, canvasTarget(p, pageBase));
  pageSizeFields(p, host);
  if (M.type === 'sequence') {
    sect(host, t('page.seqLayout'));
    const L = T.sequence.layout;
    const base = { ...L, blockSpan: L.blockSpan || 'full', ...pp };
    for (const f of ['gap', 'rowH', 'mirror', 'blockSpan']) field(core.i18n, host, f, canvasTarget(p, base));
  }
  sect(host, t('props.editor'));
  const si = h('input', { type: 'number', min: '0', value: String(core.snap), 'aria-label': t('props.snap') });
  si.addEventListener('input', () => {
    core.snap = Math.max(0, Number(si.value) || 0);
  });
  host.append(row(t('props.snap'), si), h('div', { class: 'hint' }, t('props.metaHint')));
}
