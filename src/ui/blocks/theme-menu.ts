// ThemeMenu (§5.2, §7.5): "Follow light / dark" first (ticked while nothing is picked; picking it clears the pick),
// then the themes grouped Light / Dark with the picked one ticked, and an optional "Edit themes…" entry. The theme
// button is the view params' palette button with a caret, labelled with the theme currently drawn. Replaces the
// theme menu of editor/modules/chrome/view-params.ts.
import { h, icon } from '../h.js';
import { registerMessages } from '../i18n.js';
import { I_chevronDown, I_palette } from '../icons.js';
import { BLOCK_MESSAGES_PANELS } from '../messages/blocks-panels.js';
import type { PopoverManager } from '../popover.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';
import { attachMenu, openMenu, type MenuEntry } from './menu.js';

export interface ThemeInfo {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
}

export interface ThemeMenuProps {
  themes: readonly ThemeInfo[];
  /** The user's pick, or null while the theme follows the chrome scheme (read when the menu opens). */
  picked: Value<string | null>;
  onPick: (id: string) => void;
  /** "Follow light / dark": clears the pick. */
  onFollow: () => void;
  /** "Edit themes…" (shown only when given). */
  onEdit?: () => void;
  t: Translate;
}

export const THEME_MENU_CSS = /* css */ `
.vp-btn { border: 0; background: none; height: 32px; padding: 0 6px 0 8px; display: flex; align-items: center; gap: 3px; border-radius: 8px; color: var(--mmdx-text); }
.vp-btn:hover:not(:disabled), .vp-btn[aria-expanded=true] { background: var(--mmdx-float-2); border-color: transparent; }
.vp-caret { color: var(--mmdx-muted); }
`;

/** The menu's entries (built when it opens, so they show the current pick). */
export function themeMenuEntries(p: ThemeMenuProps): MenuEntry[] {
  registerMessages(BLOCK_MESSAGES_PANELS);
  const t = p.t;
  const picked = read(p.picked);
  const out: MenuEntry[] = [{ label: t('theme.follow'), checked: picked === null, run: () => p.onFollow() }];
  for (const [ap, label] of [['light', t('theme.light')], ['dark', t('theme.dark')]] as const) {
    const list = p.themes.filter((x) => x.appearance === ap);
    if (!list.length) continue;
    out.push({ section: label });
    for (const th of list) out.push({ label: th.name, checked: th.id === picked, run: () => p.onPick(th.id) });
  }
  if (p.onEdit) {
    const edit = p.onEdit;
    out.push('sep', { label: t('theme.edit'), run: () => edit() });
  }
  return out;
}

export interface OpenThemeMenuOptions extends ThemeMenuProps {
  popovers: PopoverManager;
  opener: HTMLElement;
  within?: Element;
  align?: 'right' | 'left';
  placement?: 'below' | 'above';
}

/** Opens the theme menu under `opener`. */
export function openThemeMenu(o: OpenThemeMenuOptions): void {
  const entries = themeMenuEntries(o); // registers the strings first
  openMenu({
    popovers: o.popovers, opener: o.opener, label: o.t('theme.menu'), entries,
    ...(o.within ? { within: o.within } : {}), ...(o.align ? { align: o.align } : {}), ...(o.placement ? { placement: o.placement } : {}),
  });
}

export interface ThemeButtonProps extends ThemeMenuProps {
  /** The theme currently drawn (the pick, or the scheme's default): the button's label names it. */
  shown: Value<string>;
  popovers: PopoverManager;
  within?: () => Element | undefined;
  align?: 'right' | 'left';
  placement?: 'below' | 'above';
}

export interface ThemeButtonHandle extends BlockHandle<ThemeButtonProps> {
  readonly el: HTMLButtonElement;
}

/** The palette button with a caret that opens the theme menu. */
export function createThemeButton(props: ThemeButtonProps): ThemeButtonHandle {
  registerMessages(BLOCK_MESSAGES_PANELS);
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const caret = icon(I_chevronDown, 12);
  caret.setAttribute('class', 'mmdx-icon vp-caret');
  const el = h('button', { type: 'button', class: 'vp-btn mmdx-theme-btn' }, icon(I_palette, 18), caret);
  scope.add(attachMenu({
    button: el, popovers: p.popovers, label: p.t('theme.menu'),
    entries: () => themeMenuEntries(p),
    within: () => p.within?.(),
    ...(p.align ? { align: p.align } : {}), ...(p.placement ? { placement: p.placement } : {}),
  }));
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    const shown = p.shown;
    fx.effect(() => {
      const id = read(shown);
      const label = p.t('theme.current', { name: p.themes.find((x) => x.id === id)?.name ?? id });
      el.title = label;
      el.setAttribute('aria-label', label);
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
