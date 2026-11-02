import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createIconButton, createToggleButton } from '../../src/ui/blocks/button.js';
import { I_hand, I_pen, I_pointer, I_undo } from '../../src/ui/icons.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; disabled: boolean };

const CSS = '.row{display:flex;gap:8px;align-items:center;} .row .mmdx-btn{display:grid;place-items:center;min-width:36px;height:36px;} .log{margin-top:12px;font:12px ui-monospace,monospace;color:var(--mmdx-muted);}';

/** Icon buttons (one with text), and a pressed toggle; the tooltip mirrors the label with the shortcut. */
function buttons(a: Args): HTMLElement {
  const { host, root } = chromeHost([CSS], { ui: a.ui });
  const log = document.createElement('div');
  log.className = 'log';
  const pen = signal(false);
  const disabled = signal(a.disabled);
  const row = document.createElement('div');
  row.className = 'row';
  row.append(
    createIconButton({ icon: I_pointer, label: 'Pointer', keys: 'v', onClick: () => (log.textContent = 'Pointer') }).el,
    createIconButton({ icon: I_hand, label: 'Hand', keys: 'h', class: 'ghost', onClick: () => (log.textContent = 'Hand') }).el,
    createIconButton({ icon: I_undo, label: 'Undo', keys: 'mod+z', disabled, onClick: () => (log.textContent = 'Undo') }).el,
    createToggleButton({ icon: I_pen, label: 'Magic pen', keys: 'p', pressed: pen, onClick: () => pen.set(!pen.peek()) }).el,
    createIconButton({ icon: null, text: 'Fit', label: 'Fit to view', keys: 'f', onClick: () => (log.textContent = 'Fit') }).el,
  );
  root.append(row, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Button',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createIconButton` and `createToggleButton`: an icon (or text) button with an accessible name, a tooltip that ' +
          'mirrors the label with its shortcut formatted for the platform, `aria-keyshortcuts`, and an optional pressed ' +
          'state. Pressed, disabled and hidden can follow signals.',
      },
    },
  },
  render: (a) => buttons(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, disabled: { control: 'boolean', description: 'Undo disabled' } },
  args: { disabled: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Light: Story = { args: { ui: 'light' } };
export const Dark: Story = { args: { ui: 'dark' } };
export const Disabled: Story = { args: { disabled: true } };
