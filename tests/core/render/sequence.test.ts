// The sequence renderer's Mermaid features (T11.1): message numbers that follow every `autonumber` statement (self
// messages included), half arrow heads at the receiver or (reversed) the sender, central connections' circles,
// created participants' heads at their creating message and destroyed ones' lifelines ending in a cross, the
// participant links' item link and menu, and `accTitle` / `accDescr`; a golden SVG of all of it in every theme.
import { describe, expect, it } from 'vitest';
import type { SequenceGeometry } from '../../../src/core/render/types.js';
import { renderProd, THEME_IDS } from './helpers.js';

const FEATURES = `sequenceDiagram
  accTitle: Ordering
  accDescr: How an order is placed
  autonumber 10 5
  participant U as User
  participant A as API
  link A: Docs @ https://docs.example.com
  link A: Status @ https://status.example.com
  U->>()A: central to
  U()-->>A: central from
  U-|\\A: half top
  A--//U: dotted stick bottom
  U/|-A: reversed
  A->>A: self
  create participant J as Job
  A->>J: start
  autonumber off
  J-->>A: done
  destroy J
  A-xJ: stop
  A->>U: reply
`;

const geomOf = (src: string): SequenceGeometry => {
  const g = renderProd(src).result.geom;
  if (g.type !== 'sequence') throw new Error('not a sequence');
  return g;
};

/** The `<g>` of an item in the SVG. */
const groupOf = (svg: string, kind: string, id: string): string => {
  const at = svg.indexOf(`data-kind="${kind}" data-id="${id}"`);
  if (at < 0) return '';
  const end = svg.indexOf('data-kind=', at + 20);
  return svg.slice(at, end < 0 ? undefined : end);
};

describe('sequence rendering: Mermaid features', () => {
  it('numbers: start and step, self messages numbered, off stops (the hidden ones still count)', () => {
    const { svg } = renderProd(FEATURES);
    const num = (id: string): string | null => /<circle[^>]*r="9"[^>]*\/>.*?<text[^>]*>(?:<tspan[^>]*>)?(\d+)/.exec(groupOf(svg, 'message', id))?.[1] ?? null;
    expect(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'].map(num)).toEqual(['10', '15', '20', '25', '30', '35', '40', null, null, null]);
  });

  it('a created participant\'s head sits on its creating message; a destroyed one\'s lifeline ends at its destroying message with a cross', () => {
    const g = geomOf(FEATURES);
    const make = g.messages.get('m7')!, stop = g.messages.get('m9')!;
    const job = g.participants.get('J')!;
    expect(job.y).toBe(make.y);
    // the creating message ends at the head's edge
    expect(Math.abs(make.x1 - (job.x - job.w / 2))).toBeLessThan(4);
    expect(g.lifelines.get('J')).toEqual({ x: job.x, y0: job.y + job.h / 2, y1: stop.y });
    expect(g.participants.get('U')!.y).toBeLessThan(make.y);
    const [x, y] = [job.x, stop.y];
    expect(renderProd(FEATURES).svg).toContain(`<path d="M${x - 9},${y - 9} L${x + 9},${y + 9} M${x + 9},${y - 9} L${x - 9},${y + 9}"`);
  });

  it('central connections end at a circle on the lifeline\'s centre', () => {
    const { svg } = renderProd(FEATURES);
    const g = geomOf(FEATURES);
    const ax = g.lifelines.get('A')!.x, ux = g.lifelines.get('U')!.x;
    const circles = (id: string): string[] => [...groupOf(svg, 'message', id).matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="5"/g)].map((m) => m[1]!);
    expect(circles('m1')).toEqual([String(ax)]);
    expect(circles('m2')).toEqual([String(ux)]);
    expect(g.messages.get('m1')!.x1).toBe(ax - 5);
  });

  it('half heads: a filled half triangle or a stroke, above or below, at the receiver or (reversed) the sender; no marker', () => {
    const { svg } = renderProd(FEATURES);
    const g = geomOf(FEATURES);
    for (const id of ['m3', 'm4', 'm5']) expect(groupOf(svg, 'message', id)).not.toContain('marker-end');
    const path = (id: string): string => /<path d="(M[^"]+)"/.exec(groupOf(svg, 'message', id).replace(/<path class="hit"[^>]*>/, ''))?.[1] ?? '';
    const pts = (d: string): number[][] => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    // m3 U-|\A runs right: tip at A's end, the half above the line
    const m3 = g.messages.get('m3')!, p3 = pts(path('m3'));
    expect(p3[0]).toEqual([m3.x1, m3.y]);
    expect(p3[2]![1]).toBeLessThan(m3.y);
    // m4 A--//U runs left: a stick, `bottom` turns with the line (above)
    const m4 = g.messages.get('m4')!, p4 = pts(path('m4'));
    expect(p4.length).toBe(2);
    expect(p4[0]).toEqual([m4.x1, m4.y]);
    expect(p4[1]![1]).toBeLessThan(m4.y);
    // m5 U/|-A: the head at the sender (U), pointing back at it
    const m5 = g.messages.get('m5')!, p5 = pts(path('m5'));
    expect(p5[0]).toEqual([m5.x0, m5.y]);
    expect(p5[1]![0]).toBeGreaterThan(m5.x0);
  });

  it('links: the first Mermaid link is the item link, all of them the menu (`data-links`, through the link policy)', () => {
    const { svg } = renderProd(FEATURES);
    const head = groupOf(svg, 'participant', 'A');
    expect(head).toContain('data-link="https://docs.example.com"');
    expect(head).toContain('data-links="[[&quot;Docs&quot;,&quot;https://docs.example.com&quot;],[&quot;Status&quot;,&quot;https://status.example.com&quot;]]"');
    // a link the policy refuses is left out; one link alone makes no menu
    const one = renderProd('sequenceDiagram\n  link A: Bad @ javascript:alert(1)\n  link A: Ok @ https://ok.example.com\n  A->>B: x').svg;
    expect(groupOf(one, 'participant', 'A')).toContain('data-link="https://ok.example.com"');
    expect(one).not.toContain('data-links');
    expect(one).not.toContain('javascript');
    // the item's own link (metadata) wins
    expect(groupOf(renderProd(`${FEATURES}%%@ participant A {"link":"https://own.example.com"}`).svg, 'participant', 'A')).toContain('data-link="https://own.example.com"');
  });

  it('accTitle and accDescr name the SVG', () => {
    const { svg, result } = renderProd(FEATURES);
    expect(result.a11y).toEqual({ title: 'Ordering', desc: 'How an order is placed' });
    expect(svg).toContain('<title>Ordering</title><desc>How an order is placed</desc>');
    expect(svg).toContain('aria-label="Ordering"');
  });
});

describe('sequence look defaults (T11.2): dotted replies dashed, block kind tags', () => {
  const SRC = 'sequenceDiagram\n  A->>B: call\n  B-->>A: reply\n  loop every minute\n    A--)B: ping\n  end\n';
  const line = (svg: string, id: string): string => /<line x1[^>]*marker-end[^>]*>/.exec(groupOf(svg, 'message', id))?.[0] ?? '';
  it('a reply is dashed with replyDash (4 3); a call stays solid; a preset\'s or the message\'s own dash wins', () => {
    const { svg } = renderProd(SRC);
    expect(line(svg, 'm1')).not.toContain('stroke-dasharray');
    expect(line(svg, 'm2')).toContain('stroke-dasharray="4 3"');
    expect(line(svg, 'm3')).toContain('stroke-dasharray="4 3"');
    expect(line(renderProd(`${SRC}%%@ message m2 {"preset":"async"}`).svg, 'm2')).toContain('stroke-dasharray="8 5"');
    expect(line(renderProd(`${SRC}%%@ message m2 {"dash":"1.5 4"}`).svg, 'm2')).not.toContain('stroke-dasharray="4 3"');
  });
  it('blocks show their kind in the corner; the "plain-blocks" page preset hides it; a block\'s own showTag wins', () => {
    const tag = (svg: string): boolean => />loop<\/tspan>/.test(groupOf(svg, 'block', 'b1'));
    expect(tag(renderProd(SRC).svg)).toBe(true);
    expect(groupOf(renderProd(SRC).svg, 'block', 'b1')).toContain('[every minute]');
    expect(tag(renderProd(`${SRC}%%@ canvas {"preset":"plain-blocks"}`).svg)).toBe(false);
    expect(tag(renderProd(`${SRC}%%@ canvas {"preset":"plain-blocks"}\n%%@ block b1 {"showTag":true}`).svg)).toBe(true);
    expect(tag(renderProd(`${SRC}%%@ block b1 {"showTag":false}`).svg)).toBe(false);
    for (const theme of THEME_IDS) expect(tag(renderProd(SRC, theme).svg), theme).toBe(true);
  });
});

describe('golden SVG: sequence features (T11.1)', () => {
  for (const theme of THEME_IDS)
    it(theme, () => {
      expect(renderProd(FEATURES, theme).svg).toMatchSnapshot();
    });
  it('mirrored participants: a destroyed one\'s copy under its cross', () => {
    const g = geomOf(`${FEATURES}%%@ canvas {"mirror":true}`);
    const stop = g.messages.get('m9')!;
    expect(g.participantFeet.get('J')!.y).toBeGreaterThan(stop.y);
    expect(g.participantFeet.get('J')!.y).toBeLessThan(g.participantFeet.get('U')!.y);
  });
});

describe('the title (B24)', () => {
  it('a title wider than the participants widens the page instead of being clipped', () => {
    const title = 'A long title for a diagram of only two participants, much wider than they are '.repeat(3).trim();
    const without = renderProd('sequenceDiagram\n  A->>B: hi\n').result.bounds;
    const withTitle = renderProd(`sequenceDiagram\n  title ${title}\n  A->>B: hi\n`).result.bounds;
    expect(withTitle.w).toBeGreaterThan(without.w + 100);
    // centred: the page grows on both sides
    expect(withTitle.x).toBeLessThan(without.x);
  });
});
