// The static measurer counts graphemes (T03.4): an emoji is 1.15 em however many code points make it (ZWJ families,
// VS16, skin tones, flags, keycaps, tag sequences); text without emoji measures as before.
import { describe, expect, it, vi } from 'vitest';
import { createStaticMeasurer, EMOJI_EM } from '../../../src/core/text/measure.js';

const font = { size: 10, family: 'sans-serif' };
const w = (s: string): number => createStaticMeasurer().width(s, font);
const EM = EMOJI_EM * font.size;

describe('static measurer: emoji', () => {
  it.each([
    ['family (ZWJ)', '\u{1F468}‍\u{1F469}‍\u{1F467}'],
    ['heart with VS16', '❤️'],
    ['thumbs up, medium skin tone', '\u{1F44D}\u{1F3FD}'],
    ['flag (regional indicators)', '\u{1F1EB}\u{1F1F7}'],
    ['keycap', '1️⃣'],
    ['subdivision flag (tags)', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
    ['single emoji', '\u{1F600}'],
  ])('%s is one emoji wide', (_name, s) => {
    expect(w(s)).toBeCloseTo(EM, 6);
  });

  it('two flags are two emoji; emoji next to text add to it', () => {
    expect(w('\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}')).toBeCloseTo(2 * EM, 6);
    expect(w('Hi \u{1F44B}')).toBeCloseTo(w('Hi ') + EM, 6);
  });

  it('text presentation (VS15) is a text glyph; variation selectors add nothing', () => {
    expect(w('❤︎')).toBeCloseTo(w('❤'), 6);
    expect(w('❤')).toBeLessThan(EM);
  });

  it('text without emoji measures as before (per code point)', () => {
    expect(w('Hello')).toBeCloseTo([...'Hello'].reduce((n, c) => n + w(c), 0), 6);
    expect(w('Привет')).toBeCloseTo(6 * 0.6 * 10, 6);
    expect(w('漢字')).toBeCloseTo(2 * 10, 6);
    expect(w('é')).toBeCloseTo((0.561 + 0.58) * 10, 6);
    expect(w('a​b')).toBeCloseTo(w('ab'), 6);
  });
});

describe('static measurer without Intl.Segmenter', () => {
  it('groups code points the way emoji sequences join', async () => {
    const Segmenter = (Intl as { Segmenter?: unknown }).Segmenter;
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    try {
      vi.resetModules();
      const m = await import('../../../src/core/text/measure.js');
      const fw = (s: string): number => m.createStaticMeasurer().width(s, font);
      for (const s of ['\u{1F468}\u200d\u{1F469}\u200d\u{1F467}', '\u2764\ufe0f', '\u{1F44D}\u{1F3FD}', '\u{1F1EB}\u{1F1F7}', '1\ufe0f\u20e3']) expect(fw(s)).toBeCloseTo(EM, 6);
      expect(fw('\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}')).toBeCloseTo(2 * EM, 6);
      expect(fw('Привет \u{1F44B}')).toBeCloseTo(w('Привет ') + EM, 6);
    } finally {
      (Intl as { Segmenter?: unknown }).Segmenter = Segmenter;
      vi.resetModules();
    }
  });
});
