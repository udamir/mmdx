// An item's link menu (T11, S13): a sequence participant's Mermaid `link` / `links` give it several links. The
// renderer writes them as `data-links` (JSON [label, url] pairs, every url already through the link policy); a click
// on such an item in View mode opens a menu at the pointer listing them instead of following the first one, as
// Mermaid's popup does. Shared by the viewer and the editor's View mode.
import { openMenu } from '../ui/blocks/menu.js';
import type { PopoverManager } from '../ui/popover.js';

/** The links of the item under `target` when it has a menu of them (two or more), else null. */
export function menuLinks(target: Element | null): { label: string; href: string }[] | null {
  const raw = target?.closest('[data-links]')?.getAttribute('data-links');
  if (!raw) return null;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const out = list.flatMap((x) => (Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' ? [{ label: x[0], href: x[1] }] : []));
  return out.length > 1 ? out : null;
}

/** Opens the menu of `links` at the click; picking one calls `follow` with its url. */
export function openLinkMenu(o: { popovers: PopoverManager; within: Element; at: { clientX: number; clientY: number }; label: string; links: readonly { label: string; href: string }[]; follow(href: string): void }): void {
  openMenu({
    popovers: o.popovers, opener: null, label: o.label, within: o.within, at: o.at, class: 'link-menu',
    entries: o.links.map((l) => ({ label: l.label, title: l.href, run: () => o.follow(l.href) })),
  });
}
