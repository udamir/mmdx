// Change marks of the merged diff picture (core/text/marks.ts): only the diff turns them into styled runs, and text
// with zero-width joiners (emoji sequences, Persian and Indic words) is never taken for marked text.
import { describe, expect, it } from 'vitest';
import '../../../src/core.js'; // everything `mmdx/core` loads, the diff renderer included
import { createContext } from '../../../src/core/context.js';
import { renderDiffToSvg } from '../../../src/core/diff/all.js';
import { renderToSvg } from '../../../src/core/pipeline.js';
import { deleted, inserted, withoutMarks } from '../../../src/core/text/marks.js';
import { createStaticMeasurer } from '../../../src/core/text/measure.js';

const FAMILY = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}'; // one family emoji: man, woman and girl joined by ZWJ
const PERSIAN = 'می\u200cخواهم'; // with ZWNJ
const NONCHARS = /[﷐-﷓]/;

describe('change marks', () => {
  it('a plain render keeps joiners in text as they are', async () => {
    const svg = await renderToSvg(`flowchart LR\n  A["family ${FAMILY} and ${PERSIAN}"] --> B`);
    expect(svg).toContain(`family ${FAMILY} and ${PERSIAN}`);
    expect(svg).not.toContain('dx-ins');
    expect(svg).not.toContain('dx-del');
  });

  it('the merged picture marks only the changed words and keeps emoji sequences whole', async () => {
    const svg = await renderDiffToSvg(`flowchart LR\n  A["family ${FAMILY} old"]`, `flowchart LR\n  A["family ${FAMILY} new"]`, { ctx: createContext({ measure: createStaticMeasurer() }) });
    expect(svg).toContain(`family ${FAMILY}`);
    expect(svg).toContain('<tspan class="dx-del">old</tspan>');
    expect(svg).toContain('<tspan class="dx-ins">new</tspan>');
    expect(svg).not.toMatch(NONCHARS);
  });

  it('marked text measures as its words', () => {
    const m = withoutMarks(createStaticMeasurer());
    const font = { size: 14, family: 'sans-serif' };
    expect(m.width(`a ${deleted('old')}${inserted('new')}`, font)).toBe(m.width('a oldnew', font));
  });
});
