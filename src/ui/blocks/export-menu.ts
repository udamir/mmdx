// ExportMenu (§5.2, §7.6): the labelled `Export` primary button of the view params (an icon-only download button in
// the compact preset) and its menu. Entries come from the host (each product exports its own formats); a change of
// `section` between two entries inserts a separator (or a section header). Async exports that fail are reported
// through `onError`. Replaces the export menus of editor/modules/chrome/view-params.ts, the viewer's `openExport`
// (elements/viewer.ts) and the diff's `openExport` (elements/diff.ts).
import { h, icon } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { I_download } from '../kit/icons.js';
import { BLOCK_MESSAGES_PANELS } from '../messages/blocks-panels.js';
import type { PopoverManager } from '../kit/popover.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';
import { attachMenu, type MenuEntry } from './menu.js';

export interface ExportEntry {
  id: string;
  label: string;
  title?: string;
  /** Group of the entry: a change between neighbours inserts a separator (or a header, see `sections`). */
  section?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export interface ExportMenuProps {
  entries: readonly ExportEntry[];
  popovers: PopoverManager;
  within?: () => Element | undefined;
  /** Icon-only button (the `compact` preset). */
  compact?: Value<boolean>;
  /** How section changes show: a separator (default) or a header naming the section. */
  sections?: 'separator' | 'header';
  /** A failed export (a sync throw or an async rejection); without it the error propagates. */
  onError?: (e: unknown) => void;
  align?: 'right' | 'left';
  placement?: 'below' | 'above';
  t: Translate;
}

export const EXPORT_MENU_CSS = /* css */ `
.vp-export-btn { height: 32px; padding: 0 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.vp-export-btn.compact { width: 32px; padding: 0; justify-content: center; }
`;

/** Wraps a run so its failure goes to `onError`. */
const guarded = (run: ExportEntry['run'], onError?: (e: unknown) => void) => (): void => {
  if (!onError) {
    void run();
    return;
  }
  try {
    void Promise.resolve(run()).catch(onError);
  } catch (e) {
    onError(e);
  }
};

/** Menu entries for the export entries: separators (or headers) where the section changes. */
export function exportMenuEntries(entries: readonly ExportEntry[], o: { sections?: 'separator' | 'header'; onError?: (e: unknown) => void } = {}): MenuEntry[] {
  const out: MenuEntry[] = [];
  let prev: string | undefined;
  entries.forEach((e, i) => {
    if (o.sections === 'header') {
      if (e.section && (i === 0 || e.section !== prev)) out.push({ section: e.section });
      else if (i > 0 && e.section !== prev) out.push('sep');
    } else if (i > 0 && e.section !== prev) out.push('sep');
    prev = e.section;
    out.push({ label: e.label, ...(e.title ? { title: e.title } : {}), ...(e.disabled ? { disabled: true } : {}), class: `exp-${e.id}`, run: guarded(e.run, o.onError) });
  });
  return out;
}

export interface ExportMenuHandle extends BlockHandle<ExportMenuProps> {
  readonly el: HTMLButtonElement;
}

export function createExportMenu(props: ExportMenuProps): ExportMenuHandle {
  registerMessages(BLOCK_MESSAGES_PANELS);
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const el = h('button', { type: 'button', class: 'primary vp-export-btn' });
  // read when the menu opens: update({ t, popovers }) applies (B36)
  scope.add(attachMenu({
    button: el,
    get popovers() {
      return p.popovers;
    },
    get label() {
      return p.t('export.title');
    },
    entries: () => exportMenuEntries(p.entries, { ...(p.sections ? { sections: p.sections } : {}), ...(p.onError ? { onError: p.onError } : {}) }),
    within: () => p.within?.(),
    ...(p.align ? { align: p.align } : {}), ...(p.placement ? { placement: p.placement } : {}),
  }));
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    const t = p.t;
    el.title = t('export.tip');
    el.setAttribute('aria-label', t('export.title'));
    el.disabled = !p.entries.length;
    const compact = p.compact;
    fx.effect(() => {
      const small = compact !== undefined && read(compact);
      el.classList.toggle('compact', small);
      el.replaceChildren(small ? icon(I_download, 18) : t('export.title'));
    });
  };
  render();
  return {
    el,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
