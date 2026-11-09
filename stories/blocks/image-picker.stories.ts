import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { memoryImageStore } from '../../src/adapters/images.js';
import { checkImageUrl } from '../../src/core/media/policy.js';
import { createImagePicker, IMAGE_PICKER_CSS } from '../../src/ui/blocks/image-picker.js';
import { createI18n } from '../../src/ui/i18n.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; upload: boolean; library: boolean };

/** A few pictures for the library (inline SVGs: no network in the story). */
const swatch = (fill: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="${fill}"/></svg>`)}`;
const LIBRARY = memoryImageStore(['#f6a', '#fd6', '#6cf', '#7d8', '#a8f', '#fa7'].map((c, i) => ({ id: `p${i}`, url: `https://cdn.example.com/p${i}.png`, thumb: swatch(c), name: `picture-${i + 1}.png` })), { url: (_f, id) => `https://cdn.example.com/${id}.png` });

/** The image tool: the host's library, an upload (drop, paste, a file input) and a URL checked against the default image policy. */
function imagePicker(a: Args): HTMLElement {
  const { host, root } = chromeHost([IMAGE_PICKER_CSS, '.mmdx-pop{position:relative;}'], { ui: a.ui });
  const { t } = createI18n();
  const p = createImagePicker({
    t,
    check: (url) => {
      const r = checkImageUrl(url);
      return 'reason' in r ? t(`image.reason.${r.reason}`) : null;
    },
    library: a.library ? (q) => LIBRARY.list(q) : null,
    upload: a.library ? async (f) => (await LIBRARY.put(f, { name: f.name })).url : a.upload ? (f) => new Promise((r) => setTimeout(() => r(`https://cdn.example.com/${encodeURIComponent(f.name)}`), 800)) : null,
    onSubmit: (url) => console.log('submit', url),
    onRefused: (msg) => console.log('refused', msg),
  });
  const pop = document.createElement('div');
  pop.className = 'mmdx-pop';
  pop.append(p.el);
  root.append(pop);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ImagePicker',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createImagePicker` (T05): images are referenced by URL (no embedding), in up to three tabs. **Library**: the host\'s image store (`library`), searched and paged; **Upload** (the host\'s `upload`): a drop zone, a file input and paste upload the file and use its URL, offering to reduce pictures over 1600 px first; **URL**: checked while typing (here the default image policy: `https:` only).',
      },
    },
  },
  render: (a) => imagePicker(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, upload: { control: 'boolean' }, library: { control: 'boolean' } },
  args: { upload: false, library: false },
};
export default meta;

type Story = StoryObj<Args>;
export const UrlOnly: Story = {};
export const WithUpload: Story = { args: { upload: true } };
export const WithLibrary: Story = { args: { library: true } };
export const Dark: Story = { args: { ui: 'dark' } };
