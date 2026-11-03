import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { checkImageUrl } from '../../src/core/media/policy.js';
import { createImagePicker, IMAGE_PICKER_CSS } from '../../src/ui/blocks/image-picker.js';
import { createI18n } from '../../src/ui/i18n.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; upload: boolean };

/** The image tool: the URL checked against the default image policy; with an upload hook, drop, paste and a file input. */
function imagePicker(a: Args): HTMLElement {
  const { host, root } = chromeHost([IMAGE_PICKER_CSS, '.mmdx-pop{position:relative;}'], { ui: a.ui });
  const { t } = createI18n();
  const p = createImagePicker({
    t,
    check: (url) => {
      const r = checkImageUrl(url);
      return 'reason' in r ? t(`image.reason.${r.reason}`) : null;
    },
    upload: a.upload ? (f) => new Promise((r) => setTimeout(() => r(`https://cdn.example.com/${encodeURIComponent(f.name)}`), 800)) : null,
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
          '`createImagePicker` (T05): images are referenced by URL (no embedding). The URL is checked while typing (here the default image policy: `https:` only); ' +
          'with the host\'s `upload` a drop zone, a file input and paste upload the file and use its URL, offering to reduce pictures over 1600 px first.',
      },
    },
  },
  render: (a) => imagePicker(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, upload: { control: 'boolean' } },
  args: { upload: false },
};
export default meta;

type Story = StoryObj<Args>;
export const UrlOnly: Story = {};
export const WithUpload: Story = { args: { upload: true } };
export const Dark: Story = { args: { ui: 'dark' } };
