// Shape popovers: the shape picker with the stacked style, and the fill (opacity and colour).
import { h } from '../../../kit/h.js';
import { SHAPE_MENU } from '../../../../core/shapes/menu.js';
import { knownShape, shapeIdOf } from '../../../../core/shapes/registry.js';
import { createShapePalette, type ShapePaletteItem } from '../../../blocks/shape-palette.js';
import { shapePreview } from '../../shape-preview.js';
import { popLabel, slider } from '../../../kit/toolbar-kit.js';
import { num, stackLevel, str } from '../controls.js';
import { stackPreview } from '../icons.js';
import { STACKABLE } from '../kinds.js';
import { colors, type Fill } from './common.js';

export function shapePop(f: Fill): void {
  const { pop, sp, x, done } = f;
  const { t, api } = x;
  const key = sp.shapeKey ?? 'shape';
  if (sp.shapes) {
    // the Shapes menu's grid (T05 §4.2): the catalogue's shapes in Mermaid Chart's sections, any other list by
    // category; six to a row, no search, no scrolling; the tooltip names the semantic and Mermaid names
    // ("Manual operation · trap-t")
    const c0 = str(api.eff(key));
    const cur = c0 && !sp.shapes.includes(c0) ? shapeIdOf(c0) ?? c0 : c0;
    const item = (shape: string): ShapePaletteItem => {
      const def = knownShape(shape);
      const own = def && def.id === shape;
      return {
        key: shape, label: own ? def.name : shape, tip: own ? `${def.name}${def.mermaid ? ` · ${def.mermaid}` : ' · mmdx only'}` : shape,
        ...(own ? { terms: [def.id, def.title ?? '', def.mermaid ?? '', ...def.aliases] } : {}), icon: () => shapePreview(shape, 24),
      };
    };
    const has = new Set(sp.shapes);
    const inMenu = new Set(SHAPE_MENU.flatMap((s) => s.ids));
    let sections: { title: string; items: ShapePaletteItem[] }[];
    if (sp.shapes.every((s) => inMenu.has(s))) {
      sections = SHAPE_MENU.map((s) => ({ title: t(`palette.cat.${s.cat}`), items: s.ids.filter((id) => has.has(id)).map(item) })).filter((s) => s.items.length);
    } else {
      const byTitle = new Map<string, ShapePaletteItem[]>();
      for (const shape of sp.shapes) {
        const def = knownShape(shape);
        const title = def && def.id === shape ? t(`palette.cat.${def.category}`) : '';
        let items = byTitle.get(title);
        if (!items) byTitle.set(title, (items = []));
        items.push(item(shape));
      }
      sections = [...byTitle].map(([title, items]) => ({ title: byTitle.size > 1 ? title : '', items }));
    }
    pop.classList.add('mtb-shapes');
    const palette = createShapePalette({
      t, compact: true, cols: 6, sections, current: cur, search: false,
      onPick: (it) => {
        api.set(key, it.key);
        done();
      },
    });
    palette.el.setAttribute('aria-label', t('tb.shape'));
    pop.append(palette.el);
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
