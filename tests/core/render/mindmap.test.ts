// The mindmap renderer (T08.3): branches tapering with depth in their section's colour, colour by branch or by depth
// and a branch's own section, folded branches with their +N badge, layers hiding subtrees, icons, images, markdown,
// the three layouts, and no overlap between nodes in the examples.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MindmapGeometry } from '../../../src/core/render/types.js';
import type { SceneNode } from '../../../src/core/scene/types.js';
import { renderProd } from './helpers.js';

const geom = (src: string, theme?: string): MindmapGeometry => renderProd(src, theme).result.geom as MindmapGeometry;
/** The stroke widths of the branch paths, by child id. */
function branches(src: string): Map<string, { width: unknown; stroke: unknown }> {
  const out = new Map<string, { width: unknown; stroke: unknown }>();
  const walk = (n: SceneNode): void => {
    if (n.t === 'g' && n.key?.startsWith('branch:node:')) {
      const p = n.children[0];
      if (p && 'attrs' in p) out.set(n.key.slice('branch:node:'.length), { width: p.attrs['stroke-width'], stroke: p.attrs['stroke'] });
    }
    if (n.t === 'g') n.children.forEach(walk);
  };
  renderProd(src).result.body.forEach(walk);
  return out;
}

const SRC = 'mindmap\n  root((Root))\n    a[A]\n      b\n        c\n          d\n    e\n      f';

describe('mindmap renderer', () => {
  it('branches taper with depth (11 / 8 / 5 / 3) and take their section colour', () => {
    const b = branches(SRC);
    expect(['a', 'mm3', 'mm4', 'mm5'].map((id) => b.get(id)?.width)).toEqual([11, 8, 5, 3]);
    expect(b.get('mm3')!.stroke).toBe(b.get('a')!.stroke);
    expect(b.get('mm6')!.stroke).not.toBe(b.get('a')!.stroke);
  });

  it('sections: by branch, by depth (colorBy), and a branch of its own (metadata section) for the subtree', () => {
    expect([...geom(SRC).nodes.values()].map((n) => n.section)).toEqual([-1, 0, 0, 0, 0, 1, 1]);
    const depth = geom(`---\nconfig:\n  mindmap:\n    colorBy: depth\n---\n${SRC}`);
    expect([...depth.nodes.values()].map((n) => n.section)).toEqual([-1, 0, 1, 2, 3, 0, 1]);
    const own = geom(`${SRC}\n%%@ node mm3 {"section":7}`);
    expect([...own.nodes.values()].map((n) => n.section)).toEqual([-1, 0, 7, 7, 7, 1, 1]);
  });

  it('a folded branch hides its subtree and shows how many nodes it holds; a hidden layer hides a subtree', () => {
    const r = renderProd(`${SRC}\n%%@ node a {"collapsed":true}`);
    const g = r.result.geom as MindmapGeometry;
    expect([...g.nodes.keys()]).toEqual(['root', 'a', 'mm6', 'mm7']);
    expect(r.svg).toContain('>+3</tspan>');
    const hidden = renderProd(SRC, undefined, { opts: { hidden: { node: new Set(['a']) } } });
    expect(hidden.svg).not.toContain('data-id="mm3"');
  });

  it('::icon above the label, an image node from metadata, markdown emphasis, icon tokens', () => {
    const r = renderProd('mindmap\n  root\n    a[Book]\n    ::icon(fa fa-book)\n    b["`**bold** *it*`"]\n    c[fa:fa-car Car]\n%%@ node b {"img":"https://example.com/p.png"}');
    expect(r.svg).toMatch(/<image[^>]*aria-label="book"/);
    expect(r.svg).toContain('href="https://example.com/p.png"');
    expect(r.svg).toMatch(/font-weight="700"[^>]*>bold</);
    // the book above its label, the car before its text, the picture
    expect(r.svg.match(/<image /g)?.length).toBe(3);
    // the picture is an image node: its size is not known on the server
    expect(r.result.diagnostics?.map((d) => d.code)).toEqual(['image.size-unknown', 'icon.fa-fallback', 'icon.fa-fallback']);
    expect(r.result.geom.type === 'mindmap' && r.result.geom.nodes.get('b')!.asset).toBeTruthy();
  });

  it('layouts: both sides, to the right, top down', () => {
    const both = geom(SRC);
    expect(new Set([...both.nodes.values()].map((n) => n.side).filter(Boolean))).toEqual(new Set(['r', 'l']));
    const right = geom(`${SRC}\n%%@ canvas {"mindLayout":"right"}`);
    expect(new Set([...right.nodes.values()].map((n) => n.side).filter(Boolean))).toEqual(new Set(['r']));
    const down = geom(`${SRC}\n%%@ canvas {"mindLayout":"down"}`);
    expect(down.nodes.get('a')!.y).toBeGreaterThan(down.nodes.get('root')!.y);
    const side = geom(`${SRC}\n%%@ node a {"side":"l"}\n%%@ node mm6 {"side":"r"}`);
    expect([side.nodes.get('a')!.side, side.nodes.get('mm6')!.side]).toEqual(['l', 'r']);
  });

  it('no two nodes of the examples overlap, in every theme', () => {
    for (const f of ['product-mindmap.mmdx', 'study-notes.mmdx'])
      for (const t of ['default-light', 'dracula']) {
        const g = geom(readFileSync(join(__dirname, '../../../examples', f), 'utf8'), t);
        const bs = [...g.nodes.values()];
        for (let i = 0; i < bs.length; i++)
          for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i]!, b = bs[j]!;
            expect(Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2, `${f} ${i} ${j}`).toBe(false);
          }
      }
  });
});
