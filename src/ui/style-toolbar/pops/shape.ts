// Shape popovers: the shape picker with the stacked style, and the fill (opacity and colour).
import { h } from '../../h.js';
import { knownShape, shapeIdOf } from '../../../core/shapes/registry.js';
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
    // a node's shape may be written by any of its names (`cyl`): the button of its id is on
    const c0 = str(api.eff(key));
    const cur = c0 && !sp.shapes.includes(c0) ? shapeIdOf(c0) ?? c0 : c0;
    for (const shape of sp.shapes) {
      // the tooltip: the semantic name and the Mermaid name ("Manual operation · trap-t")
      const def = knownShape(shape);
      const tip = def && def.id === shape ? `${def.name}${def.mermaid ? ` · ${def.mermaid}` : ''}` : shape;
      const b = h('button', { type: 'button', class: 'mtb-shape' + (shape === cur ? ' on' : ''), title: tip, 'aria-label': shape, 'aria-pressed': String(shape === cur) }, shapePreview(shape));
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
