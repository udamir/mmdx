// The action bar of an old version shown read-only (History, the `version` stage): over the selected items, like the
// style toolbar, with Copy only — what is copied can be pasted into the document once History is closed.
import { copyable } from '../../../core/ops/clipboard.js';
import { h, icon } from '../../../ui/h.js';
import { I_copy } from '../../../ui/icons.js';
import { TOOLBAR_CSS } from '../../../ui/styles/toolbar.js';
import type { EditorModule } from '../../module.js';
import { anchorRect, freeStrip } from './toolbars.js';

const VERSION_COPY_CSS = /* css */ `
.mtb.ver-copy { height: 44px; }
.ver-copy .mtb-btn.wide { gap: 6px; display: inline-flex; align-items: center; height: 36px; font: inherit; font-size: 13px; }
`;

export const versionCopyModule: EditorModule = {
  id: 'version-copy',
  css: [TOOLBAR_CSS, VERSION_COPY_CSS],
  when: { stage: ['version'] },
  install(scope) {
    const core = scope.core;
    const wrap = core.dom.wrap;
    const btn = h('button', { type: 'button', class: 'mtb-btn wide', 'data-f': 'version-copy', title: 'Copy (⌘C) — paste it into the diagram after History' }, icon(I_copy, 18), 'Copy');
    const bar = h('div', { class: 'mtb ver-copy', role: 'toolbar', 'aria-label': 'Selection', hidden: true }, h('div', { class: 'mtb-seg' }, btn));
    // the canvas does not start a gesture on the bar
    bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    btn.addEventListener('click', () => core.run('copySelection'));
    // in the canvas wrap while a version shows (detached while the module is suspended)
    scope.mount(wrap, bar);

    const place = (): void => {
      const sel = core.selection();
      const first = sel[0];
      const r = first && core.version.peek() && core.tool.peek() !== 'hand' && core.tool.peek() !== 'pen' ? anchorRect(core, first) : null;
      bar.hidden = !r;
      if (!r) return;
      btn.disabled = !sel.some((it) => copyable(core.model, it));
      const [lo, hi] = freeStrip(core);
      const w = bar.offsetWidth || 96, hh = bar.offsetHeight || 44;
      const x = Math.max(lo, Math.min(hi - w, r.x + r.w / 2 - w / 2));
      // above the item, or under it when there is no room above
      const y = r.y - hh - 12 >= 8 ? r.y - hh - 12 : r.y + r.h + 12;
      bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const offs = [core.on('draw', place), core.on('selection', place), core.on('view', place), core.on('tool', place)];
    scope.register({ set: (on) => void (on && place()), dispose: () => undefined });
    place();
    return () => {
      for (const off of offs) off();
      bar.remove();
    };
  },
};
