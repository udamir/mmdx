import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../../src/dom/pen.js';
import { createPenOptions, PEN_OPTIONS_CSS, type PenSettings } from '../../src/ui/blocks/pen-options.js';
import { TOOL_DOCK_CSS } from '../../src/ui/blocks/tool-dock.js';
import { createI18n } from '../../src/i18n.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark' };

/** The pen options in the flyout card they sit in (`.vt-opts`), over a mock pen; the log shows the calls. */
function penOptions(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([TOOL_DOCK_CSS, PEN_OPTIONS_CSS, '.vt-opts{position:static;transform:none;display:inline-flex;}'], { ui: a.ui });
  const log = document.createElement('pre');
  log.style.cssText = 'font:12px/1.4 ui-monospace,monospace;color:var(--mmdx-muted);margin:12px 0 0;';
  const state = { color: PEN_COLORS[0] as string, size: PEN_SIZES[1] as number, fade: PEN_FADES[0] as number };
  const say = (msg: string): void => void (log.textContent = `${msg}\n${JSON.stringify(state)}`);
  const pen: PenSettings = {
    get color() { return state.color; },
    get size() { return state.size; },
    get fade() { return state.fade; },
    setColor: (c) => say(`setColor(${(state.color = c)})`),
    setSize: (s) => say(`setSize(${(state.size = s)})`),
    setFade: (ms) => say(`setFade(${(state.fade = ms)})`),
    clear: () => say('clear()'),
  };
  const card = document.createElement('div');
  card.className = 'vt-opts';
  card.append(createPenOptions({ pen, t }).el);
  root.append(card, log);
  say('ready');
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/PenOptions',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The magic pen options (`createPenOptions`): colours, thickness, auto erase after 5 s / 10 s or keep, and ' +
          'Erase all. One column for every product, shown in the tool dock’s flyout. Arrow keys move through the ' +
          'choices; the focus stays on the chosen one when it re-renders.',
      },
    },
  },
  render: (a) => penOptions(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: {},
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
