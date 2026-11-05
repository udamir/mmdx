// Sequence participant types and media (T10.2): Mermaid's 8 types drawn natively (the box, the cylinder, stacked boxes
// and the horizontal cylinder with the name inside; the actor, boundary, control and entity figures with the name
// under them), a golden of all of them in every theme; a participant's icon token above the name (the default), inline,
// left at its own size or below, its metadata image, its `properties` icon as the image, a refused image and the
// placeholder, in a box and under a figure; icon tokens in messages and notes; the head growing with what it holds.
import { describe, expect, it } from 'vitest';
import type { SequenceGeometry } from '../../../src/core/render/types.js';
import { renderProd, THEME_IDS } from './helpers.js';

const IMG = 'https://example.com/photo.png';

const TYPES = `sequenceDiagram
  participant P as Participant
  actor A as Actor
  participant B@{ "type": "boundary" } as Boundary
  participant C@{ "type": "control" } as Control
  participant E@{ "type": "entity" } as Entity
  participant D@{ "type": "database" } as Database
  participant L@{ "type": "collections" } as Collections
  participant Q@{ "type": "queue" } as Queue
  P->>A: hi
  B->>C: check
  C->>E: load
  E->>D: query
  L-->>Q: push
`;

/** The `<g>` of an item in the SVG (the head, not the mirrored foot). */
const groupOf = (svg: string, kind: string, id: string): string => {
  const at = svg.indexOf(`data-kind="${kind}" data-id="${id}"`);
  if (at < 0) return '';
  const start = svg.lastIndexOf('<g ', at);
  let depth = 0, i = start;
  for (; i < svg.length; i++) {
    if (svg.startsWith('<g', i)) depth++;
    else if (svg.startsWith('</g>', i) && --depth === 0) break;
  }
  return svg.slice(start, i + 4);
};

const geomOf = (src: string): SequenceGeometry => {
  const g = renderProd(src).result.geom;
  if (g.type !== 'sequence') throw new Error('not a sequence');
  return g;
};

describe('golden SVG: participant types (T10.2)', () => {
  for (const theme of THEME_IDS)
    it(theme, () => {
      expect(renderProd(TYPES, theme).svg).toMatchSnapshot();
    });
});

const box = (decl: string, meta: string): string => `sequenceDiagram\n  ${decl}\n  participant B\n  A->>B: hi\n%%@ participant A ${meta}`;
const CASES: Record<string, [string, string]> = {
  'token above (default)': ['participant A as fa:fa-user Alice', '{}'],
  'token inline': ['participant A as fa:fa-user Alice', '{"iconPos":"l"}'],
  'token left at its own size': ['participant A as fa:fa-user Alice', '{"iconPos":"l","iconSize":28}'],
  'token below, coloured': ['participant A as tabler:user Alice', '{"iconPos":"b","iconColor":"@red"}'],
  'image': ['participant A as Alice', `{"img":"${IMG}"}`],
  'image imgW × imgH, cover, and the token': ['participant A as tabler:user Alice', `{"img":"${IMG}","imgW":120,"imgH":40,"imgFit":"cover"}`],
  'properties icon': ['participant A as Alice\n  properties A: {"icon": "https://example.com/icon.png"}', '{}'],
  'refused image': ['participant A as Alice', '{"img":"http://example.com/a.png"}'],
  'picture not chosen yet': ['participant A as Alice', '{"img":""}'],
  'database with the token': ['participant A@{ "type": "database" } as fa:fa-database Store', '{}'],
  'actor with the token': ['actor A as fa:fa-user Alice', '{}'],
  'boundary with an image': ['participant A@{ "type": "boundary" } as Gateway', `{"img":"${IMG}","imgW":48,"imgH":48}`],
};

describe('participant icons and images (goldens)', () => {
  for (const [name, [decl, meta]] of Object.entries(CASES))
    it(name, () => {
      expect(groupOf(renderProd(box(decl, meta)).svg, 'participant', 'A')).toMatchSnapshot();
    });

  it('icon tokens in a message and a note; emoji stay text', () => {
    const r = renderProd('sequenceDiagram\n  A->>B: fa:fa-car drive 🚗\n  A->>A: tabler:user self\n  Note over A,B: fa:fa-cog setup\n');
    expect([groupOf(r.svg, 'message', 'm1'), groupOf(r.svg, 'message', 'm2'), groupOf(r.svg, 'note', 'n1')]).toMatchSnapshot();
    expect(groupOf(r.svg, 'message', 'm1')).toMatch(/<image /);
    expect(groupOf(r.svg, 'message', 'm1')).toContain('🚗');
    expect(groupOf(r.svg, 'message', 'm1')).not.toContain('fa:fa-car');
  });
});

describe('participant media', () => {
  const head = (decl: string, meta: string): { w: number; h: number } => geomOf(box(decl, meta)).participants.get('A')!;

  it('the head grows with what it holds, the others in the row keep their size', () => {
    const plain = head('participant A as Alice', '{}');
    const icon = head('participant A as fa:fa-user Alice', '{}');
    const image = head('participant A as Alice', `{"img":"${IMG}"}`);
    expect(icon.h).toBeGreaterThanOrEqual(plain.h);
    expect(image.h).toBeGreaterThan(plain.h + 40);
    expect(head('participant A as Alice', `{"img":"${IMG}","imgW":400,"imgH":20}`).w).toBeGreaterThanOrEqual(400);
    expect(geomOf(box('participant A as Alice', `{"img":"${IMG}"}`)).participants.get('B')!.h).toBe(plain.h);
    // under a figure too
    expect(head('actor A as Alice', `{"img":"${IMG}"}`).h).toBeGreaterThan(head('actor A as Alice', '{}').h + 40);
  });

  it('above the name, the token is taken out of the text; inline it stays in the runs', () => {
    const top = groupOf(renderProd(box('participant A as fa:fa-user Alice', '{}')).svg, 'participant', 'A');
    const inline = groupOf(renderProd(box('participant A as fa:fa-user Alice', '{"iconPos":"l"}')).svg, 'participant', 'A');
    expect(top).toMatch(/class="mmdx-icon"/);
    expect(inline).not.toMatch(/class="mmdx-icon"/);
    for (const g of [top, inline]) {
      expect(g.match(/<image /g)?.length).toBe(1);
      expect(g).not.toContain('fa:fa-user');
    }
  });

  it('metadata img outranks the properties icon; an embedded `@…` icon is not read', () => {
    const both = groupOf(renderProd(box('participant A\n  properties A: {"icon": "https://example.com/icon.png"}', `{"img":"${IMG}"}`)).svg, 'participant', 'A');
    expect(both).toContain('photo.png');
    expect(both).not.toContain('icon.png');
    const at = groupOf(renderProd(box('participant A\n  properties A: {"icon": "@iVBORw0KGgo="}', '{}')).svg, 'participant', 'A');
    expect(at).not.toMatch(/<image /);
  });

  it('a refused image warns once, mirrored feet included; the properties icon\'s warning points at the code', () => {
    const r = renderProd(`${box('participant A as Alice', '{"img":"http://example.com/a.png"}')}\n%%@ canvas {"mirror":true}`);
    expect(r.result.diagnostics!.filter((d) => d.code === 'image.blocked').map((d) => d.source)).toEqual(['meta']);
    const p = renderProd(box('participant A\n  properties A: {"icon": "http://example.com/a.png"}', '{}'));
    expect(p.result.diagnostics!.filter((d) => d.code === 'image.blocked').map((d) => [d.source, d.range?.line])).toEqual([['code', 1]]);
  });
});
