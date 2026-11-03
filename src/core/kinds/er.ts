// The er view kind: what drawing a er needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { ErModel } from '../model.js';
import type { ErGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { emptyEr, parseER } from '../parse/er.js';
import { erPresets, renderER } from '../render/er.js';
import type { Presets, ViewKind } from './types.js';

export const VIEW: ViewKind<ErModel, ErGeometry> = {
  type: 'er',
  parse: parseER,
  empty: emptyEr,
  render: renderER,

  items: (model) => [...[...model.entities.keys()].map((id): ItemRef => ({ kind: 'entity', id })), ...model.rels.map((r): ItemRef => ({ kind: 'rel', id: r.id }))],
  parents: () => [],
  connectors: (model) => model.rels.map((r) => ({ ref: { kind: 'rel', id: r.id }, from: { kind: 'entity', id: r.from }, to: { kind: 'entity', id: r.to } })),
  summary: (model) => (model.entities.size ? { key: 'label.er', params: { entities: model.entities.size, rels: model.rels.length } } : { key: 'label.empty', params: {} }),
};
