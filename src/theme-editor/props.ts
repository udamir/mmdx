// "All properties" of the selected tile: everything the floating toolbar does not cover, as field rows under the
// tile's gallery. An item style's fields come from the style schema; a page preset has its own.
import { FIELD_DEFS, themeSection } from '../core/schema/style-fields.js';
import { h } from '../ui/kit/h.js';
import { ROUTINGS } from '../core/style.js';
import { RATIOS } from '../ui/diagram/page-ratios.js';
import type { Env } from './env.js';
import { fieldRow } from './fields.js';
import type { LocalField, TileSel } from './types.js';
import { obj } from './util.js';

/** "All properties" stays open from one item tile to the next (kept with the open cards). */
const PROPS = '@props';

export function renderProps(env: Env): void {
  const sel = env.sel.peek();
  if (!sel) return;
  const { t } = env;
  const p = sel.props;
  p.replaceChildren();
  const d = h('details', { class: 'te-allprops' });
  d.open = env.openCards.has(PROPS) || sel.kind === 'page';
  d.addEventListener('toggle', () => {
    if (sel.kind === 'page') return;
    if (d.open) env.openCards.add(PROPS);
    else env.openCards.delete(PROPS);
  });
  const what = sel.preset ?? (sel.shape ? t('te.shapeDefault', { shape: sel.shape }) : t('te.default'));
  d.append(h('summary', null, t('te.allProps', { name: what })));
  if (sel.kind === 'page') pageFields(env, d, sel);
  else styleFields(env, d, sel);
  p.append(d);
  env.decorate(p);
}

function styleFields(env: Env, d: HTMLElement, sel: TileSel): void {
  const { draft } = env;
  const path = draft.stylePath(sel);
  const inherited = draft.inheritedFor(sel);
  const inheritable = draft.inheritsFor(sel);
  for (const f of sel.fields) {
    const def = FIELD_DEFS[f];
    if (!def) continue;
    const k = def.key ?? f;
    // a shape's default does not pick its own shape
    if (sel.preset === null && sel.shape && k === 'shape') continue;
    fieldRow(env, d, { ...def, label: env.tf(`field.${f}`, def.label) }, [...path, k], inherited[k], { inheritable });
  }
}

/** Page preset fields a type's section may add (THEME_SECTIONS `pageFields`): their own labels here, types from FIELD_DEFS. */
const PAGE_FIELD_LABELS: Readonly<Record<string, string>> = { gap: 'te.ppGap', rowH: 'te.ppRowH', mirror: 'te.ppMirror' };

/** A page field as FIELD_DEFS defines it (a select for `mindLayout`, B26); a key it does not know is a text field. */
export function pageField(env: Pick<Env, 't' | 'tf'>, k: string): LocalField {
  const def = FIELD_DEFS[k];
  const label = PAGE_FIELD_LABELS[k] ? env.t(PAGE_FIELD_LABELS[k]!) : env.tf(`field.${k}`, def?.label ?? k);
  return def ? { ...def, label } : { label, type: 'text' };
}

function pageFields(env: Env, d: HTMLElement, sel: TileSel): void {
  const { t } = env;
  const name = sel.preset ?? '';
  const inherited = obj(obj(obj(env.draft.parent.peek()?.[sel.type])['pagePresets'])[name]);
  const row = (k: string, def: LocalField): void => void fieldRow(env, d, def, [sel.type, 'pagePresets', name, k], inherited[k], { inheritable: true });
  row('label', { label: t('te.ppLabel'), type: 'text' });
  row('background', { label: t('te.ppBackground'), type: 'color' });
  row('grid', { label: t('te.ppGrid'), type: 'text' });
  row('border', { label: t('te.ppBorder'), type: 'color' });
  const section = themeSection(sel.type);
  if (section.routing) row('routing', { label: t('te.ppRouting'), type: 'select', options: ROUTINGS.map((r) => [r, env.tf(`ptb.routing.${r}`, r)] as const) });
  row('ratio', { label: t('te.ppRatio'), type: 'select', options: [['free', t('te.ppFree')], ...RATIOS.map(([r, l]) => [r, l.startsWith('ratio.') ? t(l) : l] as const)] });
  row('pad', { label: t('te.ppPad'), type: 'number' });
  for (const k of section.pageFields ?? []) row(k, pageField(env, k));
}
