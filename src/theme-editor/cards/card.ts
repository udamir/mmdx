// A card of the main column: a Disclosure whose body is built on first open, with a "n changed" badge (the theme's
// own values in it) and the theme paths it shows in `data-dirty` (marked while they have unsaved changes).
import { THEME_SECTIONS } from '../../core/schema/style-fields.js';
import { createDisclosure } from '../../ui/blocks/disclosure.js';
import { h } from '../../ui/kit/h.js';
import type { Env } from '../env.js';
import { obj, slug } from '../util.js';

export interface CardOptions {
  key: string;
  title: string;
  fill: (box: HTMLElement) => void;
  hint?: string | null;
  /** Opening the card (e.g. shows its diagram type in the preview). */
  onOpen?: (() => void) | null;
  /** The theme paths it shows. */
  dirty: readonly string[];
}

/** How many of the theme's own values a card shows. */
export function changedCount(env: Env, key: string): number {
  const raw = env.draft.current() ?? {};
  if (key === 'palette') return Object.keys(obj(raw['palette'])).length;
  if (key === 'page') return ['appearance', 'font'].filter((k) => raw[k] !== undefined).length + Object.keys(obj(raw['canvas'])).length;
  const [type, item] = key.split('.') as [string, string];
  const o = obj(raw[type]);
  const count = (presets: unknown): number => Object.values(obj(presets)).reduce<number>((a, p) => a + Object.keys(obj(p)).length, 0);
  if (item === 'pagePresets') return count(o['pagePresets']);
  const presets = THEME_SECTIONS.find((s) => s.type === type)?.items.find((i) => i.key === item)?.presets;
  return Object.keys(obj(o[item])).length + (presets ? count(o[presets]) : 0);
}

export function card(env: Env, o: CardOptions): HTMLElement {
  const n = changedCount(env, o.key);
  const d = createDisclosure({
    title: o.title,
    open: env.openCards.has(o.key),
    id: `te-card-${slug(o.key)}-${env.ctx.idPrefix}`,
    class: 'te-card', headClass: 'te-card-head', bodyClass: 'te-card-body',
    headAttrs: { 'data-card': o.key },
    badge: n && !env.draft.isBase() ? env.t('te.changed', { n }) : null,
    fill: (body) => {
      if (o.hint) body.append(h('div', { class: 'te-hint' }, o.hint));
      o.fill(body);
      env.decorate(body);
    },
    onToggle: (open) => {
      if (!open) return void env.openCards.delete(o.key);
      env.openCards.add(o.key);
      for (const g of env.galleries) if (d.body.contains(g.el)) g.wake();
      o.onOpen?.();
    },
  });
  env.scope().add(() => d.destroy());
  d.el.dataset['dirty'] = o.dirty.join('|');
  return d.el;
}
