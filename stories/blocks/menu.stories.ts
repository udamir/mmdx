import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { attachMenu, createMenu, MENU_CSS, type MenuEntry } from '../../src/ui/blocks/menu.js';
import { PopoverManager } from '../../src/ui/popover.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; open: boolean };

const entries = (log: HTMLElement): MenuEntry[] => {
  const run = (what: string) => (): void => void (log.textContent = `ran: ${what}`);
  return [
    { section: 'Light themes' },
    { label: 'Default Light', checked: true, run: run('Default Light') },
    { label: 'Paper', checked: false, run: run('Paper') },
    { section: 'Dark themes' },
    { label: 'Default Dark', checked: false, run: run('Default Dark') },
    { label: 'Midnight', checked: false, disabled: true, title: 'Not installed', run: run('Midnight') },
    'sep',
    { label: 'Edit themes…', run: run('Edit themes') },
  ];
};

/** A menu with sections, ticks, a disabled item and a separator; as a static list or opened from a button. */
function menu(a: Args): HTMLElement {
  const { host, root } = chromeHost([MENU_CSS, '.wrap{position:relative;min-height:340px;} .log{margin-top:12px;font:12px ui-monospace,monospace;color:var(--mmdx-muted);}'], { ui: a.ui });
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const log = document.createElement('div');
  log.className = 'log';
  if (a.open) {
    const m = createMenu({ label: 'Diagram theme', entries: entries(log), part: 'menu' });
    m.el.style.position = 'static';
    wrap.append(m.el);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Theme ▾';
    wrap.append(button);
    attachMenu({ button, popovers: new PopoverManager(root), label: 'Diagram theme', entries: () => entries(log), within: () => wrap, align: 'left' });
  }
  root.append(wrap, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Menu',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createMenu`, `openMenu` and `attachMenu`: an ARIA menu with sections, ticks (`menuitemradio`), separators and ' +
          'disabled items, opened through the host\'s PopoverManager (one at a time, Esc and outside clicks close, arrow ' +
          'keys move, the focus returns to the opener; a second click on the opener closes it).',
      },
    },
  },
  render: (a) => menu(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, open: { control: 'boolean', description: 'Static menu (no opener)' } },
  args: { ui: 'light', open: false },
};
export default meta;

type Story = StoryObj<Args>;

export const FromButton: Story = {};
export const Static: Story = { args: { open: true } };
export const Dark: Story = { args: { ui: 'dark', open: true } };
