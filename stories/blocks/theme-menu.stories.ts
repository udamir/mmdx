import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { MENU_CSS } from '../../src/ui/blocks/menu.js';
import { createThemeButton, THEME_MENU_CSS, type ThemeInfo } from '../../src/ui/blocks/theme-menu.js';
import { createI18n } from '../../src/ui/i18n.js';
import { PopoverManager } from '../../src/ui/popover.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost, THEME_FILES, SYSTEM_UI } from '../support.js';

type Args = { edit: boolean; ui: 'light' | 'dark' };

const THEMES: ThemeInfo[] = THEME_FILES.map((f) => ({ id: f.id, name: f.name ?? f.id, appearance: f.appearance === 'dark' ? 'dark' : 'light' }));

/** The palette button of the view params over a stand-in canvas; the pick (or the scheme default) is drawn. */
function themeMenu(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([MENU_CSS, THEME_MENU_CSS,
    '.bar{position:absolute;top:24px;right:24px;display:flex;padding:4px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:12px;box-shadow:0 4px 16px rgba(20,30,60,.10);}' +
    '.log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);}'], { ui: a.ui });
  const pops = new PopoverManager(root);
  const picked = signal<string | null>(null);
  const fallback = THEMES.find((x) => x.appearance === a.ui)?.id ?? THEMES[0]?.id ?? '';
  const shown = signal(fallback);
  const log = document.createElement('div');
  log.className = 'log';
  const say = (): void => void (log.textContent = `picked: ${picked.peek() ?? '(follow light / dark)'} · shown: ${shown.peek()}`);
  const btn = createThemeButton({
    themes: THEMES, picked, shown, popovers: pops, within: () => host, t,
    onPick: (id) => {
      picked.set(id);
      shown.set(id);
      say();
    },
    onFollow: () => {
      picked.set(null);
      shown.set(fallback);
      say();
    },
    ...(a.edit ? { onEdit: () => void (log.textContent = 'Edit themes…') } : {}),
  });
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.append(btn.el);
  say();
  root.append(bar, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ThemeMenu',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The theme button and menu (`createThemeButton`, `themeMenuEntries`): "Follow light / dark" ' +
          'first (ticked while nothing is picked; it clears the pick), then the themes grouped Light / Dark with the ' +
          'pick ticked, and "Edit themes…" when the host offers it. The button is labelled with the theme drawn.',
      },
    },
  },
  render: (a) => themeMenu(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, edit: { control: 'boolean' } },
  args: { ui: SYSTEM_UI, edit: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const WithoutEdit: Story = { name: 'Without Edit themes', args: { edit: false } };
export const Dark: Story = { args: { ui: 'dark' } };
