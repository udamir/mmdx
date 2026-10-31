import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createPill, PILL_CSS } from '../../src/ui/blocks/pill.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; text: string; remote?: boolean };

/** The History pill at the top centre of a stand-in canvas; Back counts its clicks in the text. */
function pill(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([PILL_CSS, '.stage{position:relative;height:240px;border-radius:12px;background:var(--mmdx-surface-2);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  root.append(stage);
  const text = signal(a.text);
  let n = 0;
  const p = a.remote
    ? createPill({ text, t, label: 'Remote change', tools: [{ id: 'reload', label: 'Reload', onClick: () => text.set('Reloaded') }], action: { label: 'Keep mine', plain: true, onClick: () => text.set('Kept mine') } })
    : createPill({ text, t, action: { label: 'Back', keys: 'escape', onClick: () => text.set(`${a.text} · Back ×${++n}`) } });
  stage.append(p.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Pill',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The pill (`createPill`): History’s floating bar at the top centre — where the component is (a status ' +
          'region) and the way back, with its shortcut in the tooltip.',
      },
    },
  },
  render: (a) => pill(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, text: { control: 'text' } },
  args: { ui: 'light', text: 'History · v3 → Working copy' },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
export const RemoteChange: Story = { name: 'Remote change (text tool, plain action)', args: { remote: true, text: 'Changed by someone else' } };
export const LongText: Story = { args: { text: 'History · v12 “Rework the payment flow and the retry queue” → Working copy' } };
