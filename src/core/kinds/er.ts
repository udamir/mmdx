// The er view kind: what drawing a er needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import { boxShape, pathShape } from '../diff/shape.js';
import { diffEr, mergeEr } from '../diff/er.js';
import type { ErModel } from '../model.js';
import type { OutlineItem } from '../outline.js';
import type { ErGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { emptyEr, parseER } from '../parse/er.js';
import { erPresets, renderER } from '../render/er.js';
import type { Presets, ViewKind } from './types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export const VIEW: ViewKind<ErModel, ErGeometry> = {
  type: 'er',
  parse: parseER,
  empty: emptyEr,
  render: renderER,
  presets: (theme, meta) => erPresets(theme, meta) as unknown as Record<string, Presets>,

  items: (model) => [...[...model.entities.keys()].map((id): ItemRef => ({ kind: 'entity', id })), ...model.rels.map((r): ItemRef => ({ kind: 'rel', id: r.id }))],
  parents: () => [],
  connectors: (model) => model.rels.map((r) => ({ ref: { kind: 'rel', id: r.id }, from: { kind: 'entity', id: r.from }, to: { kind: 'entity', id: r.to } })),
  find(model, id) {
    if (model.entities.has(id)) return { kind: 'entity', id };
    if (model.rels.some((r) => r.id === id)) return { kind: 'rel', id };
    return null;
  },
  search: (model) => [
    ...[...model.entities.values()].map((e) => ({ ref: { kind: 'entity' as const, id: e.id }, texts: [e.id, e.label, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`)] })),
    ...model.rels.map((r) => ({ ref: { kind: 'rel' as const, id: r.id }, texts: [r.label] })),
  ],
  exists: (model, { kind, id }) => (kind === 'entity' ? model.entities.has(id) : kind === 'rel' ? model.rels.some((r) => r.id === id) : false),
  takenIds: (model) => model.entities.keys(),
  usedIds: (model) => ({ entities: new Set(model.entities.keys()), rels: new Set(model.rels.map((r) => r.id)) }),
  lines(M, { kind, id }) {
    const set = new Set<number>();
    const add = (x: number | null | undefined): void => {
      if (x != null) set.add(x);
    };
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) set.add(i);
      for (const r of M.rels) if (r.from === id || r.to === id) add(r.src);
      if (e?.defLine == null) e?.lines.forEach(add);
    } else if (kind === 'rel') add(M.rels.find((r) => r.id === id)?.src);
    return [...set].sort((a, b) => a - b);
  },
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const add = (n: number | null | undefined): void => {
      if (n !== null && n !== undefined) out.add(n);
    };
    if (kind === 'entity') {
      const e = m.entities.get(id);
      e?.lines.forEach(add);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) add(i);
    } else if (kind === 'rel') add(m.rels.find((r) => r.id === id)?.src);
    return out;
  },
  box: (g, it) => (it.kind === 'entity' ? g.entities.get(it.id) : undefined) ?? null,
  isEmpty: (model) => !model.entities.size,
  outline(model) {
    const out: OutlineItem[] = [];
    for (const e of model.entities.values()) {
      const rels = model.rels.filter((r) => r.from === e.id);
      const children: OutlineItem[] = e.attrs.map((a) => ({ text: `${a.name}: ${a.type}${a.keys.length ? ` (${a.keys.join(', ')})` : ''}` }));
      for (const r of rels) children.push({ text: `${r.fromCard} to ${r.toCard} ${model.entities.get(r.to)?.label ?? r.to}${r.label ? `: ${one(r.label)}` : ''}` });
      const item: OutlineItem = { text: one(e.label) };
      if (children.length) item.children = children;
      out.push(item);
    }
    return out;
  },
  summary: (model) => (model.entities.size ? { key: 'label.er', params: { entities: model.entities.size, rels: model.rels.length } } : { key: 'label.empty', params: {} }),
  diff: diffEr,
  merge: mergeEr,
  shape: (g, { kind, id }) => (kind === 'entity' ? boxShape(g.entities.get(id)) : kind === 'rel' ? pathShape(g.rels.get(id)) : null),
};
