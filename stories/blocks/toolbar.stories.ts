import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createIconButton } from '../../src/ui/blocks/button.js';
import { createToolbar, TOOLBAR_CSS } from '../../src/ui/blocks/toolbar.js';
import { I_code, I_hand, I_layers, I_pen, I_pointer } from '../../src/ui/icons.js';
import { computed, signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; orientation: 'vertical' | 'horizontal'; compact: boolean };

const CSS = '.mmdx-toolbar{display:inline-flex;gap:4px;padding:6px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:14px;box-shadow:var(--mmdx-shadow-float);} ' +
  '.mmdx-toolbar button{border:0;background:none;width:40px;height:40px;display:grid;place-items:center;border-radius:10px;} .mmdx-toolbar button.on{background:var(--mmdx-accent-2);color:var(--mmdx-accent);} ' +
  '.mmdx-toolbar.compact button{width:30px;height:30px;}';

/** A tool bar: tools, a separator, panel toggles; arrow keys move, one tab stop, `data-tip` tooltips beside or above. */
function toolbar(a: Args): HTMLElement {
  const { host, root } = chromeHost([TOOLBAR_CSS, CSS], { ui: a.ui, style: 'padding:48px 120px;' });
  const tool = signal<'pointer' | 'hand' | 'pen'>('pointer');
  const btn = (id: 'pointer' | 'hand' | 'pen', icon: string, label: string, keys: string): HTMLElement =>
    createIconButton({ icon, label, keys, tooltip: 'tip', f: id, pressed: computed(() => tool() === id), onClick: () => tool.set(id) }).el;
  const items = [btn('pointer', I_pointer, 'Pointer', 'v'), btn('hand', I_hand, 'Hand', 'h'), btn('pen', I_pen, 'Magic pen', 'p'), 'sep' as const,
    createIconButton({ icon: I_code, label: 'Code panel', keys: 'c', tooltip: 'tip' }).el, createIconButton({ icon: I_layers, label: 'Layers', keys: 'l', tooltip: 'tip' }).el];
  const tb = createToolbar({ label: 'Tools', orientation: a.orientation, items, compact: a.compact, part: 'toolbar' });
  root.append(tb.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Toolbar',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createToolbar`: a floating bar of buttons, vertical or horizontal, with separators, arrow keys (Home / End too) ' +
          'and a roving tab stop (the bar is one stop in the Tab order), and the CSS tooltips of `data-tip` placed beside ' +
          'a vertical bar or above a horizontal one. The look is the host\'s.',
      },
    },
  },
  render: (a) => toolbar(a),
  argTypes: {
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
    compact: { control: 'boolean' },
  },
  args: { ui: 'light', orientation: 'vertical', compact: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Vertical: Story = {};
export const Horizontal: Story = { args: { orientation: 'horizontal' } };
export const CompactDark: Story = { args: { ui: 'dark', compact: true } };
