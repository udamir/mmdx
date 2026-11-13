// FilterToggles (§5.2): the icon toggle buttons of the change kinds (Added, Removed, Content, Layout, Style) and the
// Dim button, each drawn in its highlight colour, with a count badge, a `data-tip` tooltip and an accessible name
// with the count. Replaces the filter part of the diff's `drawBar` (elements/diff.ts) and `FILTER_ICONS`
// (elements/diff/panels.ts). The block's element is a `display: contents` span, so the buttons sit directly in the
// flow of the host's horizontal Toolbar (arrow keys, tooltip placement). The change colours come from the
// `--mmdx-diff-*` tokens: the host adopts `DIFF_TOKENS` (ui/styles/diff.ts).
import { h, icon } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { MARK_ICONS } from '../../core/diff/icons.js';
import { BLOCK_MESSAGES_DIFF } from '../messages/blocks-diff.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { keepFocus } from '../kit/focus.js';

/** Icons of the change filters (each drawn in its highlight colour). */
export const FILTER_ICONS: Record<'added' | 'removed' | 'content' | 'layout' | 'style' | 'dim', string> = {
  ...MARK_ICONS,
  dim: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7h6M12 11h8.5M12 15h7.5',
};

export interface FilterToggle {
  /** Change kind (`added`, `removed`, `content`, `layout`, `style`): the `flt-<id>` colour class and the focus key. */
  id: string;
  label: string;
  /** Icon path (24 × 24 viewBox), e.g. `FILTER_ICONS[id]`. */
  icon: string;
  on: boolean;
  count: number;
}

export interface FilterTogglesProps {
  filters: readonly FilterToggle[];
  /** The Dim button after the filters (null: none). */
  dim?: { on: boolean; label: string; icon: string } | null;
  onToggle: (id: string) => void;
  onDim?: () => void;
  t: Translate;
  /** `part` of the group (default none). */
  part?: string;
}

export interface FilterTogglesHandle extends BlockHandle<FilterTogglesProps> {
  readonly el: HTMLSpanElement;
}

export const FILTER_TOGGLES_CSS = /* css */ `
.mmdx-filters { display: contents; }
.mmdx-filters button {
  position: relative; border: 0; background: transparent; padding: 4px 7px; border-radius: 5px; min-width: 28px; min-height: 28px;
  display: inline-flex; align-items: center; justify-content: center; color: var(--mmdx-text);
}
.mmdx-filters button:hover:not(:disabled) { background: var(--mmdx-float-2); }
.mmdx-filters button.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.mmdx-filters .mmdx-sep { flex: none; width: 1px; align-self: stretch; margin: 3px 4px; background: var(--mmdx-border); }
.mmdx-filters .flt { color: var(--c); }
.mmdx-filters .flt.on { background: var(--c-bg); color: var(--c); }
.mmdx-filters .flt.off { color: var(--mmdx-faint); }
.mmdx-filters .flt.off::before { content: ''; position: absolute; left: 6px; right: 6px; top: 50%; height: 1.5px; background: var(--mmdx-faint); transform: rotate(-45deg); }
.mmdx-filters .cnt {
  position: absolute; right: -3px; bottom: -2px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px;
  background: var(--c, var(--mmdx-muted)); color: var(--mmdx-surface); font-size: 9px; font-weight: 700; line-height: 14px; text-align: center;
}
.mmdx-filters .flt.off .cnt { background: var(--mmdx-faint); }
.mmdx-filters .flt-added { --c: var(--mmdx-diff-add); --c-bg: var(--mmdx-diff-add-bg); }
.mmdx-filters .flt-removed { --c: var(--mmdx-diff-del); --c-bg: var(--mmdx-diff-del-bg); }
.mmdx-filters .flt-content { --c: var(--mmdx-diff-content); --c-bg: var(--mmdx-diff-content-bg); }
.mmdx-filters .flt-layout { --c: var(--mmdx-diff-layout); --c-bg: var(--mmdx-diff-layout-bg); }
.mmdx-filters .flt-style { --c: var(--mmdx-diff-style); --c-bg: var(--mmdx-diff-style-bg); }
`;

export function createFilterToggles(props: FilterTogglesProps): FilterTogglesHandle {
  registerMessages(BLOCK_MESSAGES_DIFF);
  let p = { ...props };
  let fx = new Scope();
  const el = h('span', { class: 'mmdx-filters', role: 'group' });

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    const t = p.t;
    el.setAttribute('aria-label', t('diff.filters'));
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const parts: HTMLElement[] = p.filters.map((f) => {
      const b = h('button', {
        type: 'button', class: `flt flt-${f.id} ${f.on ? 'on' : 'off'}`, 'aria-pressed': String(f.on), 'aria-label': t('diff.filter.name', { label: f.label, n: f.count }), 'data-f': `flt-${f.id}`,
        'data-tip': t('diff.filter.tip', { label: f.label, n: f.count, action: f.on ? t('diff.filter.hide') : t('diff.filter.show') }),
      }, icon(f.icon), f.count ? h('span', { class: 'cnt', 'aria-hidden': 'true' }, String(f.count)) : null);
      fx.on(b, 'click', () => p.onToggle(f.id));
      return b;
    });
    const dim = p.dim;
    if (dim) {
      const b = h('button', {
        type: 'button', class: `mmdx-dim${dim.on ? ' on' : ''}`, 'aria-pressed': String(dim.on), 'aria-label': dim.label, 'data-tip': dim.label, 'data-f': 'dim',
      }, icon(dim.icon));
      fx.on(b, 'click', () => p.onDim?.());
      if (parts.length) parts.push(h('span', { class: 'mmdx-sep', role: 'separator', 'aria-orientation': 'vertical' }));
      parts.push(b);
    }
    el.replaceChildren(...parts);
  };
  render();

  return {
    el,
    update(next) {
      p = { ...p, ...next };
      keepFocus(el, render);
    },
    destroy() {
      fx.dispose();
      el.remove();
    },
  };
}
