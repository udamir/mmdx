// Preset and table popovers: the preview grid of the item's presets (drawn by the host), and a table's layout and the
// parts of its attributes that show.
import { h } from '../../h.js';
import { fitPresetGrid } from '../../shape-preview.js';
import { popLabel } from '../../toolbar-kit.js';
import { str } from '../controls.js';
import { svgIcon } from '../icons.js';
import type { Fill } from './common.js';

export function presetsPop(f: Fill): void {
  const { pop, x, done } = f;
  const { t, api, host, bar } = x;
  // previews of the item in each preset (drawn by the host with the theme); save / update actions top right
  const acts = h('div', { class: 'pp-acts' });
  pop.append(h('div', { class: 'pp-head' }, popLabel(t('tb.presets')), acts));
  pop.classList.add('mtb-sub');
  const grid = h('div', { class: 'pp-grid' });
  pop.append(grid);
  api.renderPresets?.(grid, done, acts);
  const hr = host.getBoundingClientRect(), br = bar.getBoundingClientRect();
  const below = hr.bottom - br.bottom - 16, above = br.top - hr.top - 16;
  fitPresetGrid(pop, host.clientWidth - 16, Math.max(below, above));
}

export function tableStylePop(f: Fill): void {
  const { pop, x, again } = f;
  const { t, api } = x;
  // an ER table: compact card or table, and which parts of its attributes show
  pop.classList.add('narrow');
  pop.append(popLabel(t('tb.layout')));
  const mode = str(api.eff('mode')) || 'compact';
  const layouts = h('div', { class: 'mtb-align', role: 'group', 'aria-label': t('tb.layout') });
  for (const v of ['compact', 'table'] as const) {
    const b = h('button', { type: 'button', class: 'mtb-choice mtb-layout' + (v === mode ? ' on' : ''), 'aria-pressed': String(v === mode), title: t(`tb.layout.${v}`) },
      svgIcon(v === 'table' ? 'table' : 'left'), h('span', null, t(`tb.layout.${v}`)));
    b.addEventListener('click', () => {
      api.set('mode', v);
      again();
    });
    layouts.append(b);
  }
  pop.append(layouts, h('hr', { class: 'mtb-hr' }));
  for (const k of ['showTypes', 'showComments', 'pkUnderline'] as const) {
    const on = api.eff(k) === true;
    const b = h('button', { type: 'button', class: 'mtb-choice mtb-wrap' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) },
      h('span', { class: 'mtb-check', 'aria-hidden': 'true' }, on ? '✓' : ''), h('span', null, t(`tb.${k}`)));
    b.addEventListener('click', () => {
      api.set(k, !on);
      again();
    });
    pop.append(b);
  }
}
