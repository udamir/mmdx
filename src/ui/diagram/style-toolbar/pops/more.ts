// Selection popovers: the selection counter's type filter, and the ⋮ menu of item actions with their shortcuts.
import { ariaKeys } from '../../../blocks/block.js';
import { h } from '../../../kit/h.js';
import { formatKeys } from '../../../kit/keys.js';
import { popLabel } from '../../../kit/toolbar-kit.js';
import { svgIcon } from '../icons.js';
import type { Fill } from './common.js';

export function selectionPop(f: Fill): void {
  const { pop, x } = f;
  const { t, api, bar } = x;
  // the kinds in the selection; unticking one takes its items out, ticking puts them back
  const types = api.selectionTypes?.() ?? [];
  const on = types.filter((y) => y.selected).length;
  pop.append(popLabel(t('tb.selTypes')));
  const list = h('div', { class: 'mtb-list mtb-types', role: 'group', 'aria-label': t('tb.selTypes') });
  for (const ty of types) {
    const box = h('input', { type: 'checkbox', dataset: { kind: ty.kind } });
    box.checked = ty.selected;
    // the last kind left stays: an empty selection would close the bar
    box.disabled = ty.selected && on < 2;
    if (box.disabled) box.title = t('tb.selLast');
    box.addEventListener('change', () => {
      api.setTypeSelected?.(ty.kind, box.checked);
      // the host re-selects and the bar rebuilds this popover: keep the focus on the same box
      const same = bar.querySelector<HTMLInputElement>(`.mtb-pop input[data-kind="${ty.kind}"]`);
      if (same && same !== box) same.focus();
    });
    const name = t(`tb.kind.${ty.kind}`);
    list.append(h('label', { class: 'mtb-item mtb-type' + (ty.selected ? '' : ' off') }, box,
      h('span', null, name.startsWith('tb.kind.') ? ty.kind : name), h('em', null, String(ty.count))));
  }
  pop.append(list);
}

export function morePop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', t('tb.more'));
  const list = h('div', { class: 'mtb-list mtb-actions', role: 'none' });
  // `keys`: the registry form (`mod+c`), shown formatted for the platform and as `aria-keyshortcuts`
  const act = (ic: string, text: string, keys: string, fn: () => void, enabled = true, cls = ''): void => {
    const b = h('button', { type: 'button', role: 'menuitem', class: `mtb-item ${cls}`, 'aria-keyshortcuts': keys ? ariaKeys(keys) : undefined },
      svgIcon(ic), h('span', null, text), h('kbd', null, keys ? formatKeys(keys) : ''));
    b.disabled = !enabled;
    b.addEventListener('click', () => {
      x.close(true);
      fn();
      x.refresh();
    });
    list.append(b);
  };
  act('copy', t('tb.copy'), 'mod+c', () => api.copy?.(), !!api.canCopy?.());
  act('duplicate', t('tb.duplicate'), 'mod+d', () => api.duplicate?.(), !!api.canCopy?.());
  act('trash', t('tb.deleteItem'), 'delete', () => api.del?.(), !!api.del, 'danger');
  act('savePreset', t('tb.savePreset'), '', () => api.savePreset?.(), !!api.canSavePreset?.());
  list.append(h('div', { class: 'mtb-sep', role: 'separator' }));
  act('reset', t('tb.resetStyle'), '', () => api.reset?.(), !!api.reset);
  // a group's "Reset positions in this group" (T07), where the type offers it
  const gp = api.resetGroupPositions ? api.groupPositions?.() : null;
  if (gp != null) {
    act('reset', t('tb.resetGroup'), '', () => api.resetGroupPositions?.(), gp);
    if (!gp) list.lastElementChild?.setAttribute('title', t('tb.resetGroupNone'));
  }
  act('more', t('tb.allProps'), '', () => api.inspect?.(), !!api.inspect);
  pop.append(list);
}
