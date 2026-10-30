// The look of ER attributes (highlights in the table's metadata, keyed by attribute name), shared by the attribute
// toolbar of table editing and the attribute style popup of the Properties panel.
import type { AttrHighlight } from '../../../core/meta/types.js';
import { cloneMeta, ensure, tidy } from '../../../core/ops/meta-util.js';
import { ATTR_PRESETS } from '../../../core/render/er.js';
import type { EditorCore } from '../../core.js';
import { applyMeta } from '../panels/util.js';

/**
 * Writes look keys (`color`, `bold`, `italic`, `underline`, `fontFamily`, `fontSize`, `preset`) into the highlights
 * of the named attributes of table `id`, one history step. Undefined or '' removes a key; a boolean equal to what the
 * attribute's preset gives is not stored. List `preset` first to have the other keys compare against the new preset.
 */
export function writeAttrLook(core: EditorCore, id: string, names: readonly string[], patch: Readonly<Record<string, unknown>>): boolean {
  const meta = cloneMeta(core.meta);
  const m = ensure(meta, 'entity', id);
  const hl = (m.attrs ??= {});
  for (const name of names) {
    const o: Record<string, unknown> = { ...(hl[name] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      const pn = k === 'preset' ? v : o['preset'];
      const inherited = typeof pn === 'string' ? (ATTR_PRESETS[pn] as Record<string, unknown> | undefined)?.[k] : undefined;
      if (v === undefined || v === '' || (typeof v === 'boolean' && v === (inherited ?? false))) delete o[k];
      else o[k] = v;
    }
    if (Object.keys(o).length) hl[name] = o as AttrHighlight;
    else delete hl[name];
  }
  if (!Object.keys(hl).length) delete m.attrs;
  tidy(meta, 'entity', id);
  return applyMeta(core, core.i18n.t('history.attrStyle'), { meta });
}
