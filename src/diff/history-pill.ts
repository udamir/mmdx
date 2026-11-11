// The History pill (top centre) while History shows a version or a comparison: the viewed version, or the pair as
// coloured chips with a swap between them; its action and Esc go back to the document. Also History's keys: X swaps
// Before and After, ⌘C copies the selected item of an old version.
import { createPill, PILL_CSS } from '../ui/blocks/pill.js';
import { h, icon } from '../ui/kit/h.js';
import { I_close } from '../ui/kit/icons.js';
import { computed, type ReadSignal } from '../reactive/signal.js';
import type { ViewCore } from '../view/core.js';
import type { ViewModule } from '../view/module.js';
import type { Translate } from '../ui/blocks/block.js';

/** Swap: two arrows, left and right. */
export const I_SWAP = 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4';

/** The History pill's own look: the pair as coloured chips with a swap between them, or the viewed version. */
export const HISTORY_PILL_CSS = /* css */ `
.dx-pill-body { display: inline-flex; align-items: center; min-width: 0; }
.dx-pair { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.dx-chip { font: 600 12.5px/1.4 var(--mmdx-mono); padding: 4px 9px; border-radius: 7px; white-space: nowrap; }
.dx-chip.before { color: var(--mmdx-diff-del); background: var(--mmdx-diff-del-bg); }
.dx-chip.after { color: var(--mmdx-diff-add); background: var(--mmdx-diff-add-bg); }
.dx-swap { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--mmdx-muted); }
.dx-swap:hover:not(:disabled) { background: var(--mmdx-float-2); color: var(--mmdx-text); }
.dx-version { font-weight: 500; padding: 0 8px; white-space: nowrap; }
`;

/** What the pill reads of History and runs on it. */
export interface PillHost {
  t: Translate;
  /** A version's name (the working copy's short name). */
  label(id: string | null): string;
  /** A comparison is shown (else a version as it is). */
  comparing: ReadSignal<boolean>;
  viewing: ReadSignal<string | null>;
  base: ReadSignal<string | null>;
  head: ReadSignal<string | null>;
  swap(): void;
  showDocument(): void;
  copySelected(): void;
}

export function historyPillModule(p: PillHost): ViewModule<ViewCore> {
  const t = p.t;
  return {
    id: 'history-pill',
    css: [PILL_CSS, HISTORY_PILL_CSS],
    when: { stage: ['version', 'history'] },
    install(scope) {
      // one version as it is: "History · v3"; a comparison: its two versions as coloured chips (Before red, After
      // green) with a flat swap between them. The text is what screen readers hear.
      const text = computed(() => (!p.comparing() ? t('history.pill', { what: p.label(p.viewing()) }) : `${p.label(p.base())} → ${p.label(p.head())}`));
      const before = h('span', { class: 'dx-chip before', title: t('diff.view.before') });
      const after = h('span', { class: 'dx-chip after', title: t('diff.view.after') });
      const swapBtn = h('button', { type: 'button', class: 'dx-swap', 'data-tool': 'swap', 'data-f': 'pill-swap', title: `${t('history.swap')} (X)`, 'aria-label': t('history.swap'), 'aria-keyshortcuts': 'x' }, icon(I_SWAP, 16));
      scope.listen(swapBtn, 'click', () => p.swap());
      const pair = h('span', { class: 'dx-pair' }, before, swapBtn, after);
      const version = h('span', { class: 'dx-version' });
      scope.effect(() => {
        const one = !p.comparing();
        pair.hidden = one;
        version.hidden = !one;
        version.textContent = one ? t('history.pill', { what: p.label(p.viewing()) }) : '';
        before.textContent = p.label(p.base());
        after.textContent = p.label(p.head());
      });
      const pill = createPill({
        text, t, label: t('history.label'), content: h('span', { class: 'dx-pill-body' }, pair, version),
        // back to the document as it is; the version panel stays (closing it leaves History)
        action: { label: t('history.back'), keys: 'escape', icon: I_close, onClick: () => p.showDocument() },
      });
      scope.shortcut({ id: 'history-swap', keys: ['x'], label: t('history.swap'), group: t('history.label'), when: { stage: ['history'] }, run: () => (p.comparing.peek() ? (p.swap(), true) : false) });
      scope.slot('top-center').append(pill.el);
      scope.shortcut({ id: 'history-back', keys: ['escape'], label: t('history.back'), group: t('history.label'), run: () => void p.showDocument() });
      // copy an item of an old version (Before / After, or its side of a change), to paste after Back (§8.2); a
      // version shown as it is copies through the host's own selection
      scope.shortcut({ id: 'history-copy', keys: ['mod+c'], label: t('history.copyHelp'), group: t('history.label'), when: { stage: ['history'] }, run: () => void p.copySelected() });
      return () => pill.destroy();
    },
  };
}
