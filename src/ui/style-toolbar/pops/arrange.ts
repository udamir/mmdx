// Arrangement popovers: align and distribute (several items), the z-order slider, and the layer menu.
import { h } from '../../h.js';
import { popLabel } from '../../toolbar-kit.js';
import { svgIcon } from '../icons.js';
import type { ArrangeOp } from '../types.js';
import type { Fill } from './common.js';

export function arrangePop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  pop.classList.add('narrow');
  const n = api.multiCount();
  const grid = h('div', { class: 'mtb-arrange-grid', role: 'group' });
  const OPS: readonly (readonly [ArrangeOp, string])[] = [
    ['left', 'alignLeft'], ['hcenter', 'alignHCenter'], ['right', 'alignRight'],
    ['top', 'alignTop'], ['vcenter', 'alignVCenter'], ['bottom', 'alignBottom'],
  ];
  for (const [op, ic] of OPS) {
    const title = t(`tb.arrange.${op}`);
    grid.append(h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, onclick: () => api.arrange?.(op) }, svgIcon(ic)));
  }
  const dist = h('div', { class: 'mtb-arrange-dist', role: 'group' });
  for (const [op, ic] of [['hdist', 'distH'], ['vdist', 'distV']] as const) {
    const base = t(`tb.arrange.${op}`);
    const title = n < 3 ? t('tb.arrange.need3', { title: base }) : base;
    const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, onclick: () => api.arrange?.(op) }, svgIcon(ic));
    b.disabled = n < 3;
    dist.append(b);
  }
  pop.append(h('div', { class: 'mtb-arrange' }, grid, dist));
}

export function orderPop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  const o = api.order?.();
  const lab = popLabel(t('tb.zindex'));
  pop.append(lab);
  if (!o || o.count < 2) {
    pop.append(h('div', { class: 'mtb-note' }, t('tb.orderNone')));
    return;
  }
  const show = (i: number): void => {
    lab.textContent = t('tb.zindexN', { n: i + 1 });
  };
  const range = h('input', { class: 'mtb-range', type: 'range', min: '0', max: String(o.count - 1), step: '1', 'aria-label': t('tb.zindex') });
  range.value = String(o.index);
  range.title = `${o.labels[0] ?? ''} ← → ${o.labels[1] ?? ''}`;
  range.addEventListener('input', () => {
    api.orderPreview?.(Number(range.value));
    show(Number(range.value));
  });
  range.addEventListener('change', () => api.orderCommit?.());
  range.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') ev.stopPropagation();
  });
  show(o.index);
  pop.append(range);
}

export function layerPop(f: Fill): void {
  const { pop, x, done } = f;
  const { t, api } = x;
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', t('tb.moveLayer'));
  pop.append(popLabel(t('tb.moveLayer')));
  const list = h('div', { class: 'mtb-list', role: 'none' });
  const cur = api.currentLayer?.() ?? null;
  for (const l of api.layers?.() ?? []) {
    const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(l.id === cur), class: 'mtb-item mtb-layer' + (l.id === cur ? ' on' : '') },
      h('span', { class: 'dot' + (l.hidden ? ' off' : '') }), h('span', null, l.name), l.hidden ? h('em', null, t('tb.hidden')) : null);
    b.addEventListener('click', () => {
      api.setLayer?.(l.id);
      done();
    });
    list.append(b);
  }
  pop.append(list);
  if (api.newLayer) {
    const nb = h('button', { type: 'button', role: 'menuitem', class: 'link' }, t('tb.newLayer'));
    nb.addEventListener('click', () => {
      api.newLayer?.();
      done();
    });
    pop.append(nb);
  }
}
