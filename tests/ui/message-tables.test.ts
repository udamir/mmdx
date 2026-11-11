// The message tables (X19, 4.11): a key belongs to one table (the first one registered would win silently), and one
// concept has one key — the shape categories, a picture's Fit / aspect / URL / change, the group reset — whichever
// component shows it.
import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n.js';
import { DIFF_MESSAGES } from '../../src/diff/messages.js';
import { EDITOR_MEDIA_MESSAGES } from '../../src/editor/messages-media.js';
import { EDITOR_MESSAGES } from '../../src/editor/messages.js';
import { THEME_EDITOR_MESSAGES } from '../../src/theme-editor/messages.js';
import { BLOCK_MESSAGES_CHROME } from '../../src/ui/messages/blocks.js';
import { BLOCK_MESSAGES_DIFF } from '../../src/ui/messages/blocks-diff.js';
import { BLOCK_MESSAGES_MEDIA } from '../../src/ui/messages/blocks-media.js';
import { BLOCK_MESSAGES_PANELS } from '../../src/ui/messages/blocks-panels.js';
import { TOOLBAR_MEDIA_MESSAGES } from '../../src/ui/messages/toolbar-media.js';
import { TOOLBAR_MESSAGES } from '../../src/ui/messages/toolbar.js';
import { VIEW_MESSAGES } from '../../src/view/messages.js';

const TABLES: Record<string, Messages> = {
  BLOCK_MESSAGES_CHROME, BLOCK_MESSAGES_DIFF, BLOCK_MESSAGES_MEDIA, BLOCK_MESSAGES_PANELS, TOOLBAR_MESSAGES, TOOLBAR_MEDIA_MESSAGES,
  VIEW_MESSAGES, DIFF_MESSAGES, EDITOR_MESSAGES, EDITOR_MEDIA_MESSAGES, THEME_EDITOR_MESSAGES,
};

describe('message tables', () => {
  it('no key is in two tables', () => {
    const where = new Map<string, string[]>();
    for (const [name, m] of Object.entries(TABLES)) for (const k of Object.keys(m)) where.set(k, [...(where.get(k) ?? []), name]);
    expect([...where].filter(([, w]) => w.length > 1).map(([k, w]) => `${k}: ${w.join(', ')}`)).toEqual([]);
  });

  it('one key per concept: the parallel keys are gone', () => {
    const all = Object.assign({}, ...Object.values(TABLES)) as Messages;
    const gone = ['shapes.cat.basic', 'tb.cat.basic', 'tb.fit', 'props.fit', 'tb.aspect', 'props.aspect', 'tb.imageUrl', 'props.imageUrl', 'tb.changeImage', 'props.changeImage', 'tb.resetGroup', 'props.resetGroup', 'tb.resetGroupNone', 'props.resetGroupNone', 'groupReset.nothing'];
    expect(gone.filter((k) => k in all)).toEqual([]);
    for (const k of ['palette.cat.basic', 'palette.cat.figure', 'image.fit', 'image.aspect', 'image.url', 'image.change', 'group.resetPositions', 'group.resetNone']) expect(all[k], k).toBeTruthy();
  });
});
