// Shared fixtures for the ops tests: examples (Mermaid part only), parse checks and geometry.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import type { DiagramModel, ErModel, FlowchartModel, SequenceModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import { render } from '../../../src/core/render/index.js';
import type { GeometryIndex } from '../../../src/core/render/types.js';
import { createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { createColorResolver, diagramPaletteOf } from '../../../src/core/theme/colors.js';
import type { ResolvedTheme } from '../../../src/core/theme/types.js';
import { createStaticMeasurer } from '../../../src/core/text/measure.js';
import { DEFAULT_LINK_POLICY } from '../../../src/core/validate.js';
import { emptyMeta } from '../../../src/core/meta/types.js';

const ROOT = join(__dirname, '../../..');

export interface Example {
  name: string;
  code: string;
  meta: DiagramMeta;
}

export const EXAMPLES: Example[] = readdirSync(join(ROOT, 'examples'))
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((name) => {
    const { doc } = splitSource(readFileSync(join(ROOT, 'examples', name), 'utf8'));
    return { name, code: doc.code + '\n', meta: doc.meta };
  });

export const flow = (code: string): FlowchartModel => {
  const m = parse(code);
  if (m.type !== 'flowchart') throw new Error('not a flowchart');
  return m;
};
export const seq = (code: string): SequenceModel => {
  const m = parse(code);
  if (m.type !== 'sequence') throw new Error('not a sequence diagram');
  return m;
};
export const er = (code: string): ErModel => {
  const m = parse(code);
  if (m.type !== 'er') throw new Error('not an ER diagram');
  return m;
};

const errorKeys = (m: DiagramModel): string[] => m.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

/** The op's result parses, has the input's type, and has no error diagnostic the input did not have. */
export function expectParses(before: string, after: string): DiagramModel {
  const a = parse(before), b = parse(after);
  expect(b.type).toBe(a.type);
  const had = new Set(errorKeys(a));
  const added = errorKeys(b).filter((c) => !had.has(c));
  expect(added, `new errors in:\n${after}`).toEqual([]);
  return b;
}

/** Ids of every item (kind:id) of a model. */
export function allIds(m: DiagramModel): Set<string> {
  const out = new Set<string>();
  if (m.type === 'flowchart') {
    for (const id of m.nodes.keys()) out.add(`node:${id}`);
    for (const id of m.groups.keys()) out.add(`group:${id}`);
    for (const e of m.edges) out.add(`edge:${e.id}`);
  } else if (m.type === 'er') {
    for (const id of m.entities.keys()) out.add(`entity:${id}`);
    for (const r of m.rels) out.add(`rel:${r.id}`);
  } else if (m.type === 'sequence') for (const p of m.participants) out.add(`participant:${p.id}`);
  return out;
}

/** Every stable id of `before` except `touched` is still there afterwards. */
export function expectKept(before: DiagramModel, after: DiagramModel, touched: readonly string[] = []): void {
  const now = allIds(after), skip = new Set(touched);
  const lost = [...allIds(before)].filter((k) => !skip.has(k) && !now.has(k));
  expect(lost).toEqual([]);
}

// ---- rendering (geometry for the position ops) -----------------------------------------------------------------
export const registry = createDefaultRegistry();
export const baseline: ResolvedTheme = registry.get('default-light');
export const colorFor = (meta: DiagramMeta, theme: ResolvedTheme = baseline): ((v: unknown) => string | undefined) =>
  createColorResolver(theme, diagramPaletteOf(meta.styles));

export function geomOf(code: string, meta: DiagramMeta = emptyMeta()): GeometryIndex {
  const ctx = { measure: createStaticMeasurer(), idPrefix: 't-', linkPolicy: DEFAULT_LINK_POLICY, color: colorFor(meta) };
  return render(parse(code), meta, baseline, ctx).geom;
}
