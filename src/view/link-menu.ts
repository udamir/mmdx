// An item's link menu (T11, S13): a sequence participant's Mermaid `link` / `links` give it several links. The
// renderer writes them as `data-links` (JSON [label, url] pairs, every url already through the link policy); a click
// on such an item in View mode opens a menu at the pointer listing them instead of following the first one, as
// Mermaid's popup does. Shared by the viewer, the editor's View mode and the diff (A16, X17: one link following).
import type { CoreContext } from '../core/context.js';
import { openMenu } from '../ui/blocks/menu.js';
import type { PopoverManager } from '../ui/kit/popover.js';

/** What following a link needs of the component. */
export interface LinkHost {
  readonly ctx: Pick<CoreContext, 'linkPolicy'>;
  readonly popovers: PopoverManager;
  readonly area: Element;
  readonly i18n: { t(key: string): string };
  emit(type: string, detail: unknown, cancelable?: boolean): boolean;
}

/** The link under a click: an `<a>` (the viewer's picture) or a `data-link` (the editor's), and the item it is on. */
function linkAt(target: EventTarget | null): { el: Element; href: string | null; item: Element | null } | null {
  const t = target instanceof Element ? target : null;
  const el = t?.closest('[data-link]') ?? t?.closest('a') ?? null;
  if (!el) return null;
  return { el, href: el.getAttribute('data-link') ?? el.getAttribute('href'), item: el.closest('[data-id]') };
}

/** Follows a link: the cancelable `mmdx-link`, then the link policy's target (a new tab by default). */
function followLink(core: Pick<LinkHost, 'ctx' | 'emit'>, href: string, item: Element | null): void {
  if (!core.emit('mmdx-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
  const target = core.ctx.linkPolicy.target ?? '_blank';
  if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
  else window.location.assign(href);
}

/** A click on a link: the menu of an item's links when it has several, else the link followed. False: no link there. */
export function onLinkClick(core: LinkHost, ev: MouseEvent): boolean {
  const link = linkAt(ev.target);
  if (!link) return false;
  const links = menuLinks(link.el);
  if (links) openLinkMenu({ popovers: core.popovers, within: core.area, at: ev, label: core.i18n.t('view.links'), links, follow: (href) => followLink(core, href, link.item) });
  else if (link.href) followLink(core, link.href, link.item);
  return true;
}

/** The links of the item under `target` when it has a menu of them (two or more), else null. */
function menuLinks(target: Element | null): { label: string; href: string }[] | null {
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
function openLinkMenu(o: { popovers: PopoverManager; within: Element; at: { clientX: number; clientY: number }; label: string; links: readonly { label: string; href: string }[]; follow(href: string): void }): void {
  openMenu({
    popovers: o.popovers, opener: null, label: o.label, within: o.within, at: o.at, class: 'link-menu',
    entries: o.links.map((l) => ({ label: l.label, title: l.href, run: () => o.follow(l.href) })),
  });
}
