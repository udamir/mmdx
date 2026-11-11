// Appearance, font & page: whether the theme is light or dark (a label for pickers, not a switch between variants),
// the linked theme of the other appearance, the font, and the page colours.
import { createSegmented } from '../../ui/blocks/segmented.js';
import { h } from '../../ui/kit/h.js';
import { signal } from '../../reactive/signal.js';
import { FONTS } from '../constants.js';
import type { Env } from '../env.js';
import { fieldRow } from '../fields.js';
import { fontName, obj } from '../util.js';

export function pageCard(env: Env, box: HTMLElement): void {
  const { t, draft, lib } = env;
  const inherited = draft.parent.peek();
  const raw = draft.current() ?? {};
  const curAp = raw['appearance'] ?? inherited?.['appearance'] ?? 'light';
  const appearance = signal<'light' | 'dark'>(curAp === 'dark' ? 'dark' : 'light');
  const seg = createSegmented<'light' | 'dark'>({
    label: t('te.appearance'), value: appearance, buttonClass: 'te-seg', f: 'appearance',
    options: [{ value: 'light', label: t('te.light') }, { value: 'dark', label: t('te.dark') }],
    onChange: (v) => {
      if (!env.canEdit()) return;
      draft.set(['appearance'], !draft.isBase() && inherited?.['appearance'] === v ? undefined : v);
      appearance.set(v);
    },
  });
  env.scope().add(() => seg.destroy());
  box.append(h('div', { class: 'te-f', dataset: { dirty: 'appearance' } }, h('label', null, t('te.appearance')), h('div', { class: 'seg small' }, seg.el)));
  // the linked theme of the other appearance: shown instead of this one when the UI switches light / dark
  const other = curAp === 'dark' ? 'light' : 'dark';
  const reg = lib.reg.peek(), files = lib.files.peek();
  const link = h('select', { 'aria-label': t('te.counterpart') });
  link.append(new Option(t('te.counterpartNone'), ''));
  for (const [id, e] of files) {
    if (id === draft.id.peek() || !reg.has(id) || (reg.get(id).appearance === 'dark' ? 'dark' : 'light') !== other) continue;
    link.append(new Option(e.file.name ?? id, id));
  }
  const curLink = typeof raw['counterpart'] === 'string' ? raw['counterpart'] : '';
  if (curLink && !files.has(curLink)) link.append(new Option(curLink, curLink));
  link.value = curLink;
  link.addEventListener('change', () => draft.set(['counterpart'], link.value || undefined));
  const hint = h('div', { class: 'te-hint' }, curLink ? t('te.counterpartHint', { other: t(other === 'dark' ? 'te.dark' : 'te.light') }) : t('te.counterpartMissing'));
  if (!curLink) hint.classList.add('warn');
  box.append(h('div', { class: 'te-f', dataset: { dirty: 'counterpart' } }, h('label', null, t('te.counterpart')), link), hint);
  const sel = h('select', { 'aria-label': t('te.font') });
  const cur = typeof raw['font'] === 'string' ? raw['font'] : undefined;
  if (!draft.isBase()) sel.append(new Option(t('te.inheritFont', { name: fontName(inherited?.['font']) }), ''));
  for (const [v, l] of FONTS) sel.append(new Option(l, v));
  if (cur && !FONTS.some(([v]) => v === cur)) sel.append(new Option(fontName(cur), cur));
  sel.value = cur ?? '';
  sel.addEventListener('change', () => draft.set(['font'], sel.value || undefined));
  box.append(h('div', { class: 'te-f', dataset: { dirty: 'font' } }, h('label', null, t('te.font')), sel));
  const canvas = obj(inherited?.['canvas']);
  fieldRow(env, box, { label: t('te.pageBg'), type: 'color' }, ['canvas', 'background'], canvas['background']);
  fieldRow(env, box, { label: t('te.pageBorder'), type: 'color' }, ['canvas', 'border'], canvas['border']);
  fieldRow(env, box, { label: t('te.grid'), type: 'text' }, ['canvas', 'grid'], canvas['grid']);
}
