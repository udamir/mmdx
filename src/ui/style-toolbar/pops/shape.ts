// Shape popovers: the shape picker with the stacked style, and the fill (opacity and colour).
import { h } from '../../h.js';
import { shapePreview } from '../../shape-preview.js';
import { popLabel, slider } from '../../toolbar-kit.js';
import { num, stackLevel, str } from '../controls.js';
import { stackPreview } from '../icons.js';
import { STACKABLE } from '../kinds.js';
import { colors, type Fill } from './common.js';

export function shapePop(f: Fill): void {
  const { pop, sp, x, done } = f;
  const { t, api } = x;
  const key = sp.shapeKey ?? 'shape';
  if (sp.shapes) {
    pop.append(popLabel(t('tb.shape')));
    const grid = h('div', { class: 'mtb-shapes', role: 'group', 'aria-label': t('tb.shape') });
    const cur = str(api.eff(key));
    for (const shape of sp.shapes) {
      const b = h('button', { type: 'button', class: 'mtb-shape' + (shape === cur ? ' on' : ''), title: shape, 'aria-label': shape, 'aria-pressed': String(shape === cur) }, shapePreview(shape));
      b.addEventListener('click', () => {
        api.set(key, shape);
        done();
      });
      grid.append(b);
    }
    pop.append(grid);
  }
  if (!STACKABLE.has(f.kind)) return;
  pop.append(popLabel(t('tb.stack')));
  const cur = stackLevel(api.eff('stack'));
  const row = h('div', { class: 'mtb-stacks' });
  for (const [lv, text] of [[0, t('tb.single')], [1, t('tb.stacked')], [2, t('tb.double')]] as const) {
    const b = h('button', { type: 'button', class: 'mtb-stack' + (lv === cur ? ' on' : ''), 'aria-pressed': String(lv === cur) }, stackPreview(lv, 34), h('span', null, text));
    b.addEventListener('click', () => {
      api.set('stack', lv === 0 ? false : lv === 1 ? true : 2);
      done();
    });
    row.append(b);
  }
  pop.append(row);
  const inh = h('button', { type: 'button', class: 'link' }, t('tb.usePreset'));
  inh.addEventListener('click', () => {
    api.set('stack', undefined);
    done();
  });
  pop.append(inh);
}

export function fillPop(f: Fill): void {
  const { pop, x, done } = f;
  const { t, api } = x;
  pop.append(slider({
    label: t('tb.opacity'), value: num(api.eff('fillOpacity')) ?? 1, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`,
    onInput: (v) => api.set('fillOpacity', v >= 1 ? undefined : v), onChange: () => api.commit?.(),
  }));
  colors(f, api.eff('fill'), (c) => {
    api.set('fill', c);
    done();
  }, true);
}
