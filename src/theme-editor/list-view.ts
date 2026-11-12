// The theme list: one row per theme (its name and state worth a glance: edited, not exported, usage), the open one
// marked, with a dot while it has unsaved changes; under it, New and a menu of the other actions.
import { BASELINE } from '../core/theme/registry.js';
import { placeFixed } from '../ui/blocks/color-picker.js';
import { createIconButton } from '../ui/blocks/button.js';
import { createMenu, type MenuEntry } from '../ui/blocks/menu.js';
import { createToolbar } from '../ui/blocks/toolbar.js';
import { h } from '../ui/kit/h.js';
import { I_more } from '../ui/kit/icons.js';
import { Scope } from '../ui/blocks/block.js';
import type { Env } from './env.js';
import type { ThemeEditorOptions } from './types.js';

export interface ListView {
  /** Rebuilds the rows and the actions (the list, the open theme, the options or the dirty state changed). */
  render(): void;
  destroy(): void;
}

export function listView(env: Env, list: HTMLElement, options: () => Readonly<ThemeEditorOptions>, importFile: () => void): ListView {
  const { t, lib, draft } = env;
  const rounds = new Scope();
  const render = (): void => {
    const scope = rounds.renew();
    const id = draft.id.peek();
    const o = options();
    const rows = [...lib.files.peek()].map(([tid, e]) => {
      // only state worth a glance under the name (no static "light · extends baseline" description)
      const tags: string[] = [];
      if (lib.isEdited(e)) tags.push(t('te.tag.edited'));
      if (o.source && e.inStore && !e.inSource) tags.push(t('te.tag.notExported'));
      if (e.usage !== undefined) tags.push(t('te.tag.used', { n: e.usage }));
      const on = tid === id;
      const row = h('button', { type: 'button', class: 'te-theme' + (on ? ' on' : '') + (on && draft.dirty.peek() ? ' dirty' : ''), 'aria-current': on ? 'true' : undefined },
        h('span', { class: 'te-tname' }, e.file.name || tid), tags.length ? h('span', { class: 'te-ttag' }, tags.join(' · ')) : null);
      scope.on(row, 'click', () => void lib.select(tid, false));
      return row;
    });

    const edit = lib.canEdit();
    const store = lib.store;
    const e = lib.files.peek().get(id);
    const item = (label: string, title: string, run: () => void, danger = false): MenuEntry => ({ label, title, run, ...(danger ? { class: 'danger' } : {}) });
    const entries = (): MenuEntry[] => [
      edit && item(t('te.duplicate'), t('te.duplicateTitle'), () => void lib.create(lib.files.peek().get(draft.id.peek())?.file)),
      edit && item(t('te.import'), t('te.importTitle'), importFile),
      item(t('te.export'), t('te.exportTitle'), () => void lib.exportTheme()),
      edit && draft.current() && draft.dirty.peek() && item(t('te.discard'), t('te.discardTitle'), () => void lib.askDiscard(), true),
      edit && e && lib.isEdited(e) && store.delete && item(t('te.revert'), t('te.revertTitle'), () => void lib.revert(), true),
      o.canPublish && store.publish && e?.inStore && item(t('te.publish'), t('te.publishTitle'), () => void lib.publish()),
      o.canDelete && store.delete && e?.inStore && !e.inSource && id !== BASELINE && item(t('te.delete'), t('te.deleteTitle'), () => void lib.remove(), true),
    ].filter((x): x is MenuEntry => !!x);

    const more = createIconButton({ icon: I_more, label: t('te.more'), text: t('te.more'), class: 'te-more', attrs: { 'aria-haspopup': 'menu', 'aria-expanded': 'false' } });
    // a fixed popover beside the button: the list sits in an inline frame or a dialog overlay alike
    scope.on(more.el, 'click', () => {
      if (env.pops.isOpenFor(more.el)) return env.pops.close();
      const menu = createMenu({ label: t('te.more'), entries: entries(), class: 'te-menu', onPick: () => env.pops.close(true) });
      menu.el.style.position = 'fixed';
      env.pops.open(menu.el, more.el, { onClose: () => menu.destroy() });
      placeFixed(menu.el, more.el.getBoundingClientRect());
    });
    const create = edit ? createIconButton({ icon: null, text: t('te.new'), label: t('te.new'), tip: t('te.newTitle'), class: 'primary te-new', onClick: () => void lib.create() }) : null;
    const bar = createToolbar({ label: t('te.listActions'), orientation: 'horizontal', class: 'te-list-acts', items: [create?.el, more.el] });
    scope.add(() => {
      create?.destroy();
      more.destroy();
      bar.destroy();
    });
    list.replaceChildren(...rows, bar.el);
  };
  return {
    render,
    destroy: () => rounds.dispose(),
  };
}
