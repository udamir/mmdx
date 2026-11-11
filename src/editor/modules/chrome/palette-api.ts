// The diagram palette (A.7 row 88) both toolbars show: the theme's colours and the diagram's own, "+" adds a colour
// to the diagram, Alt-click removes one.
import { addLocalColor, removeLocalColor } from '../../../core/ops/meta-ops.js';
import { applyMeta } from '../../ops/doc.js';
import type { BarContext } from './bar-context.js';

export interface PaletteApi {
  palette(): { name: string; value: string }[];
  localPalette(): { name: string; value: string }[];
  addLocalColor(hex: string): string;
  removeLocalColor(name: string): void;
}

/** `refresh`: the bars show the palette again (after a colour is removed). */
export function paletteApi({ core, t, live }: BarContext, refresh: () => void): PaletteApi {
  const palette = (): { name: string; value: string }[] => Object.entries(core.result.theme.palette ?? {}).map(([name, value]) => ({ name, value }));
  const localPalette = (): { name: string; value: string }[] =>
    Object.entries(core.meta.styles['palette'] ?? {}).flatMap(([name, v]) => (typeof v['color'] === 'string' ? [{ name, value: v['color'] }] : []));
  const addColor = (hex: string): string => {
    live.flush();
    const res = addLocalColor(core.meta, hex);
    applyMeta(core, t('history.paletteAdd'), res);
    return res.name;
  };
  const removeColor = (name: string): void => {
    live.flush();
    if (applyMeta(core, t('history.paletteRemove'), removeLocalColor(core.meta, name))) core.toast(t('palette.removed'));
    refresh();
  };
  return { palette, localPalette, addLocalColor: addColor, removeLocalColor: removeColor };
}
