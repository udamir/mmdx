import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createBanner, MESSAGES_CSS } from '../../src/ui/blocks/messages.js';
import { chromeHost } from '../support.js';

type Args = { tone: 'info' | 'warn' | 'error'; ui: 'light' | 'dark' };

/** The banner, in every tone, as the top-center slot shows it. */
function messages(a: Args): HTMLElement {
  const { host, root } = chromeHost([MESSAGES_CSS, '.col{display:flex;flex-direction:column;gap:20px;align-items:flex-start;} h3{margin:0;font:600 12px system-ui;color:var(--mmdx-muted);}'], { ui: a.ui });
  const col = document.createElement('div');
  col.className = 'col';
  const head = (s: string): HTMLElement => Object.assign(document.createElement('h3'), { textContent: s });
  const banner = createBanner({ text: 'The diagram type changed between the versions: only the code is compared.', tone: a.tone });
  col.append(head('Banner'), banner.el);
  root.append(col);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Messages',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createBanner`: a one-line status over the canvas, hidden while empty; info / warn / error tones.',
      },
    },
  },
  render: (a) => messages(a),
  argTypes: { tone: { control: 'inline-radio', options: ['info', 'warn', 'error'] }, ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { tone: 'warn' },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
