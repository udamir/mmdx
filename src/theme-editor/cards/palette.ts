// The palette card: colour circles (the name is only a tooltip); click one to change it. In the baseline colours can
// be added and removed (references to a removed colour keep its value); in a theme, a changed colour can go back to
// the baseline's.
import { h, icon } from '../../ui/h.js';
import { I_plus } from '../../ui/icons.js';
import type { Env } from '../env.js';
import { isHex, obj } from '../util.js';

export function paletteCard(env: Env, box: HTMLElement): void {
  const { t, draft } = env;
  const grid = h('div', { class: 'te-palette', role: 'list' });
  const raw = draft.current() ?? {};
  const base = draft.isBase() ? obj(raw['palette']) : obj(draft.parent.peek()?.['palette']);
  const own = obj(raw['palette']);
  const names = [...new Set([...Object.keys(base), ...Object.keys(own)])];
  const refresh = (): void => {
    box.querySelector('.te-palette')?.remove();
    paletteCard(env, box);
    env.decorate(box);
  };
  for (const name of names) {
    const v = String(own[name] ?? base[name] ?? '');
    const changed = !draft.isBase() && own[name] !== undefined;
    const title = changed ? t('te.colorChanged', { name, value: v, base: String(base[name] ?? '') }) : t('te.colorTitle', { name, value: v });
    const ci = h('input', { type: 'color', 'aria-label': title });
    ci.value = isHex(v) ? v : '#000000';
    const dot = h('label', { class: 'te-dot' + (changed ? ' set' : ''), title, role: 'listitem', dataset: { dirty: `palette.${name}` } }, ci);
    dot.style.setProperty('--c', isHex(v) ? v : '#000');
    ci.addEventListener('input', () => {
      if (!env.canEdit()) return;
      draft.set(['palette', name], ci.value);
      dot.style.setProperty('--c', ci.value);
      dot.classList.toggle('set', !draft.isBase());
    });
    if (changed || draft.isBase()) {
      const xt = changed ? t('te.colorBack') : t('te.colorRemove');
      const x = h('button', { type: 'button', class: 'te-dot-x', title: xt, 'aria-label': `${xt} (${name})` }, '×');
      x.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!changed) draft.replaceRefs(name, v);
        draft.set(['palette', name], undefined);
        refresh();
      });
      dot.append(x);
    }
    grid.append(dot);
  }
  if (draft.isBase()) {
    // a new colour: pick it, it gets a generated name
    const ci = h('input', { type: 'color', 'aria-label': t('te.addColor') });
    ci.value = '#888888';
    ci.addEventListener('change', () => {
      const pal = obj(draft.current()?.['palette']);
      let n = 1;
      while (pal[`color-${n}`] !== undefined) n++;
      draft.set(['palette', `color-${n}`], ci.value);
      refresh();
    });
    grid.append(h('label', { class: 'te-dot te-dot-add', title: t('te.addColor'), role: 'listitem' }, icon(I_plus, 16), ci));
  }
  box.append(grid);
}
