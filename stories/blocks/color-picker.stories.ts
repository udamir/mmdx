import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { COLOR_PICKER_CSS, createColorPicker, openColorPicker } from '../../src/ui/blocks/color-picker.js';
import { h } from '../../src/ui/h.js';
import { PopoverManager } from '../../src/ui/popover.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; open: boolean };

const COLORS = ([['ink', '#1f2937'], ['paper', '#ffffff'], ['red', '#ef4444'], ['orange', '#f97316'], ['amber', '#f59e0b'], ['lime', '#84cc16'], ['green', '#22c55e'], ['teal', '#14b8a6'],
  ['sky', '#0ea5e9'], ['azure', '#3b82f6'], ['indigo', '#6366f1'], ['violet', '#8b5cf6'], ['pink', '#ec4899'], ['cream', '#fef9c3']] as const).map(([name, value]) => ({ name, value }));
const labels = { paletteLabel: 'Palette', customLabel: 'custom', noneLabel: 'None' };

/** The theme editor's colour field: a chip that opens the picker (palette swatches, a custom colour, None). */
function picker(a: Args): HTMLElement {
  const { host, root } = chromeHost([COLOR_PICKER_CSS, '.chip{width:26px;height:22px;border-radius:6px;border:1px solid rgba(0,0,0,.18);padding:0;} .log{margin-top:12px;font:12px ui-monospace,monospace;color:var(--mmdx-muted);}'], { ui: a.ui });
  const log = h('div', { class: 'log' });
  let value = '@azure';
  if (a.open) {
    const p = createColorPicker({ label: 'Choose a colour for Fill', colors: COLORS, value, onPick: (v) => void (log.textContent = `picked: ${v}`), ...labels });
    p.el.style.position = 'static';
    root.append(p.el, log);
    return host;
  }
  const pops = new PopoverManager(root);
  const chip = h('button', { type: 'button', class: 'chip', 'aria-haspopup': 'dialog', 'aria-label': 'Choose a colour for Fill' });
  const paint = (): void => {
    chip.style.background = COLORS.find((c) => `@${c.name}` === value)?.value ?? value;
    log.textContent = `value: ${value}`;
  };
  chip.addEventListener('click', () => openColorPicker({
    popovers: pops, opener: chip, label: 'Choose a colour for Fill', colors: COLORS, value, ...labels,
    onPick: (v) => {
      value = v;
      paint();
    },
  }));
  paint();
  root.append(chip, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ColorPicker',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createColorPicker` / `openColorPicker`: a small dialog of palette swatches (`@name`, the current one pressed), a ' +
          'custom colour and None, opened from a chip through the PopoverManager (Esc / outside click closes, the focus returns ' +
          'to the chip) and placed inside the viewport. Arrow keys move through the swatches.',
      },
    },
  },
  render: (a) => picker(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, open: { control: 'boolean', description: 'The panel alone' } },
  args: { open: false },
};
export default meta;

type Story = StoryObj<Args>;

export const FromAChip: Story = {};
export const Panel: Story = { args: { open: true } };
export const Dark: Story = { args: { ui: 'dark', open: true } };
