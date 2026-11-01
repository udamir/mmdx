import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createSegmented, SEGMENTED_CSS } from '../../src/ui/blocks/segmented.js';
import { createToolbar, TOOLBAR_CSS } from '../../src/ui/blocks/toolbar.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; compact: boolean };

const CSS = '.mmdx-toolbar{display:inline-flex;gap:2px;padding:4px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:10px;} ' +
  '.mmdx-toolbar button{border:0;background:none;padding:5px 10px;border-radius:7px;} .mmdx-toolbar button.on{background:var(--mmdx-accent-2);color:var(--mmdx-accent);} ' +
  '.compact .mmdx-seg > button{display:none;} .compact .mmdx-seg-select{display:block;}';

/** The diff's view switch: exclusive buttons, and the compact `<select>` form the host shows on narrow canvases. */
function segmented(a: Args): HTMLElement {
  const { host, root } = chromeHost([TOOLBAR_CSS, SEGMENTED_CSS, CSS], { ui: a.ui });
  const value = signal<'before' | 'merged' | 'after' | 'side'>('merged');
  const seg = createSegmented({
    label: 'Views', value, onChange: (v) => value.set(v), select: true, f: 'view',
    options: [
      { value: 'before', label: 'Before', tip: 'Before (1)' }, { value: 'merged', label: 'Merged', tip: 'Merged (2)' },
      { value: 'after', label: 'After', tip: 'After (3)' }, { value: 'side', label: 'Side by side', tip: 'Side by side (4)', disabled: false },
    ],
  });
  const bar = createToolbar({ label: 'Views', orientation: 'horizontal', items: [seg.el], class: a.compact ? 'compact' : '' });
  root.append(bar.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Segmented',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createSegmented`: exclusive buttons (`aria-pressed`) with a compact `<select>` form; the value can be a signal. ' +
          'The element is `display: contents`, so the buttons sit in the surrounding Toolbar (its arrow keys and tooltips). ' +
          'The focus stays on the same option across `update()`.',
      },
    },
  },
  render: (a) => segmented(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, compact: { control: 'boolean', description: 'The select form' } },
  args: { ui: 'light', compact: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Buttons: Story = {};
export const Select: Story = { args: { compact: true } };
export const Dark: Story = { args: { ui: 'dark' } };
