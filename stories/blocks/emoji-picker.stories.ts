import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { loadEmoji, searchEmoji, withTone } from '../../src/emoji/data.js';
import { createEmojiPicker, EMOJI_PICKER_CSS } from '../../src/ui/blocks/emoji-picker.js';
import { createI18n } from '../../src/i18n.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; query: string };

/** The emoji picker with the generated English data (a lazy chunk). */
function emojiPicker(a: Args): HTMLElement {
  const { host, root } = chromeHost([EMOJI_PICKER_CSS, '.mmdx-pop{position:relative;}'], { ui: a.ui });
  const pop = document.createElement('div');
  pop.className = 'mmdx-pop';
  pop.textContent = 'Loading emoji…';
  root.append(pop);
  void loadEmoji().then((data) => {
    let tone = 0;
    const p = createEmojiPicker({ t: createI18n().t, data, search: (q) => searchEmoji(data, q), withTone, recent: ['👍', '🚀', '✅'], tone, onTone: (n) => void (tone = n), onPick: (e) => console.log('pick', e) });
    if (a.query) p.setQuery(a.query);
    pop.replaceChildren(p.el);
  });
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/EmojiPicker',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createEmojiPicker` (T05): the nine emoji groups as tabs, recents, search over CLDR short names and keywords, a skin tone choice. ' +
          'The data comes from emojibase through `tools/build-emoji.mjs` (English; a lazy chunk under 30 kB gzip); the OS emoji font draws them.',
      },
    },
  },
  render: (a) => emojiPicker(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, query: { control: 'text' } },
  args: { query: '' },
};
export default meta;

type Story = StoryObj<Args>;
export const Picker: Story = {};
export const Search: Story = { args: { query: 'heart' } };
export const Dark: Story = { args: { ui: 'dark' } };
