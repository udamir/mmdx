// "All properties" of the selected tile: everything the floating toolbar does not cover, as field rows under the
// tile's gallery. An item style's fields come from the style schema; a page preset has its own.
import { FIELD_DEFS, themeSection } from '../core/schema/style-fields.js';
import { deepMerge } from '../core/theme/registry.js';
import { h } from '../ui/h.js';
import { RATIOS, ROUTINGS } from './constants.js';
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
  const base0 = draft.isBase();
  const inherited = obj(draft.parent.peek()?.[sel.type]);
  // a node's base: the common node style + its shape's default (in the baseline: as edited)
  const own = obj(draft.current()?.[sel.type]);
  const SK = sel.shapesKey ?? '';
  const shapeBase = sel.shape ? (base0 ? { ...obj(own[sel.kind]) } : deepMerge(obj(inherited[sel.kind]), obj(obj(inherited[SK])[sel.shape]))) : {};
  for (const f of sel.fields) {
    const def = FIELD_DEFS[f];
    if (!def) continue;
    const k = def.key ?? f;
    const ldef: LocalField = { ...def, label: env.tf(`field.${f}`, def.label) };
    if (sel.preset === null && sel.shape) {
      if (k === 'shape') continue;
      fieldRow(env, d, ldef, [sel.type, SK, sel.shape, k], shapeBase[k], true);
    } else if (sel.preset === null) fieldRow(env, d, ldef, [sel.type, sel.kind, k], obj(inherited[sel.kind])[k]);
    else {
      const shapeDef = sel.shape ? (base0 ? obj(obj(own[SK])[sel.shape]) : deepMerge(obj(obj(inherited[SK])[sel.shape]), obj(obj(own[SK])[sel.shape]))) : {};
      const base = base0
        ? { ...obj(own[sel.kind]), ...shapeDef }[k]
        : deepMerge(deepMerge(obj(inherited[sel.kind]), shapeDef), obj(obj(inherited[sel.presets ?? ''])[sel.preset]))[k];
      fieldRow(env, d, ldef, [sel.type, sel.presets ?? '', sel.preset, k], base, base0);
    }
  }
}

/** Page preset fields a type's section may add (THEME_SECTIONS `pageFields`). */
const PAGE_FIELD_DEFS = (t: Env['t']): Record<string, LocalField> => ({
  gap: { label: t('te.ppGap'), type: 'number' },
  rowH: { label: t('te.ppRowH'), type: 'number' },
  mirror: { label: t('te.ppMirror'), type: 'bool' },
});

function pageFields(env: Env, d: HTMLElement, sel: TileSel): void {
  const { t } = env;
  const name = sel.preset ?? '';
  const inherited = obj(obj(obj(env.draft.parent.peek()?.[sel.type])['pagePresets'])[name]);
  const row = (k: string, def: LocalField): void => void fieldRow(env, d, def, [sel.type, 'pagePresets', name, k], inherited[k], true);
  row('label', { label: t('te.ppLabel'), type: 'text' });
  row('background', { label: t('te.ppBackground'), type: 'color' });
  row('grid', { label: t('te.ppGrid'), type: 'text' });
  row('border', { label: t('te.ppBorder'), type: 'color' });
  const section = themeSection(sel.type);
  if (section.routing) row('routing', { label: t('te.ppRouting'), type: 'select', options: ROUTINGS.map((r) => [r, env.tf(`ptb.routing.${r}`, r)] as const) });
  row('ratio', { label: t('te.ppRatio'), type: 'select', options: [['free', t('te.ppFree')], ...RATIOS.map((r) => [r, r] as const)] });
  row('pad', { label: t('te.ppPad'), type: 'number' });
  const PAGE_FIELDS = PAGE_FIELD_DEFS(t);
  for (const k of section.pageFields ?? []) row(k, PAGE_FIELDS[k] ?? { label: k, type: 'text' });
}
