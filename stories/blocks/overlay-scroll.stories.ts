import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createOverlayScroll, OVERLAY_SCROLL_CSS } from '../../src/ui/blocks/overlay-scroll.js';
import { chromeHost, example, SYSTEM_UI } from '../support.js';

type Args = { ui: 'light' | 'dark' };

/** A card with two scrolling areas (a list, and code that scrolls both ways): one overlay scroll serves both. */
function overlayScroll(a: Args): HTMLElement {
  const { host, root } = chromeHost([OVERLAY_SCROLL_CSS,
    '.card{position:relative;display:flex;flex-direction:column;gap:8px;width:340px;height:440px;padding:8px;border:1px solid var(--mmdx-border);border-radius:14px;background:var(--mmdx-panel);}' +
    '.list{flex:1;min-height:0;overflow:auto;} .row{padding:6px 10px;border-radius:8px;color:var(--mmdx-text);font-size:13px;} .row:nth-child(odd){background:var(--mmdx-surface-2);}' +
    '.code{flex:1;min-height:0;overflow:auto;margin:0;padding:8px 10px;border:1px solid var(--mmdx-border);border-radius:6px;background:var(--mmdx-surface-2);font:12.5px/1.55 var(--mmdx-mono);white-space:pre;color:var(--mmdx-text);}'], { ui: a.ui });
  const list = document.createElement('div');
  list.className = 'list';
  for (let i = 1; i <= 40; i++) list.append(Object.assign(document.createElement('div'), { className: 'row', textContent: `Version ${i}` }));
  const code = document.createElement('pre');
  code.className = 'code';
  code.textContent = example('production-microservices');
  const card = document.createElement('div');
  card.className = 'card';
  card.append(list, code);
  const scroll = createOverlayScroll(card);
  card.append(...scroll.thumbs);
  root.append(card);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/OverlayScroll',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createOverlayScroll(host)`: thin scrollbars over the content of every scrolling area inside a card (every side ' +
          'panel, the help popup, the studio\'s examples), instead of the native ones. The thumb of the area under the ' +
          'pointer shows while the pointer is over it, while it scrolls and while the thumb is dragged; it takes no room. ' +
          'The host must be positioned and holds the returned `thumbs`.',
      },
    },
  },
  render: (a) => overlayScroll(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { ui: SYSTEM_UI },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
