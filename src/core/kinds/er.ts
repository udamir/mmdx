// The er view kind: what drawing a er needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { ErModel } from '../model.js';
import { emptyEr, parseER } from '../parse/er.js';
import { erPresets, renderER } from '../render/er.js';
import type { Presets, ViewKind } from './types.js';

export const VIEW: ViewKind<ErModel> = {
  type: 'er',
  parse: parseER,
  empty: emptyEr,
  render: renderER,
  presets: (theme, meta) => erPresets(theme, meta) as unknown as Record<string, Presets>,
};
