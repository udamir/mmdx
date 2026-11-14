import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createSidePanel, SIDE_PANEL_CSS } from '../../src/ui/blocks/side-panel.js';
import { createTabs, TABS_CSS } from '../../src/ui/blocks/tabs.js';
import { createI18n } from '../../src/i18n.js';
import { signal } from '../../src/reactive/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; inPanel: boolean };

/** Mermaid / Metadata tabs (the Code panel's head), alone or in a side panel; the body follows the selected tab. */
function tabs(a: Args): HTMLElement {
  const { host, root } = chromeHost([TABS_CSS, SIDE_PANEL_CSS, '.mmdx-panel{width:340px;height:260px;} .body{padding:12px;}'], { ui: a.ui });
  const value = signal<'code' | 'meta'>('code');
  const body = document.createElement('div');
  body.className = 'body';
  const tb = createTabs({ label: 'Code', tabs: [{ value: 'code', label: 'Mermaid' }, { value: 'meta', label: 'Metadata', title: 'The %%@ lines' }], value, onChange: (v) => {
    value.set(v);
    body.textContent = v === 'code' ? 'flowchart LR …' : '%%@ node a {…}';
  } });
  body.textContent = 'flowchart LR …';
  if (a.inPanel) root.append(createSidePanel({ side: 'left', head: tb.el, label: 'Code', body, onClose: () => undefined, t: createI18n().t }).el);
  else root.append(tb.el, body);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Tabs',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createTabs`: a tab list (`role=tablist`, `aria-selected`) whose selected tab is the only one in the Tab order; ' +
          'arrow keys, Home and End move and select. The value can be a signal; the focus stays on the same tab across ' +
          '`update()`. In a SidePanel it is the head.',
      },
    },
  },
  render: (a) => tabs(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, inPanel: { control: 'boolean', description: 'As a SidePanel head' } },
  args: { inPanel: true },
};
export default meta;

type Story = StoryObj<Args>;

export const InPanel: Story = {};
export const Alone: Story = { args: { inPanel: false } };
export const Dark: Story = { args: { ui: 'dark' } };
