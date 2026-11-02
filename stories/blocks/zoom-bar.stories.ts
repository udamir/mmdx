import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createHelpPopup, groupShortcuts, HELP_POPUP_CSS } from '../../src/ui/blocks/help-popup.js';
import { createZoomBar, ZOOM_BAR_CSS } from '../../src/ui/blocks/zoom-bar.js';
import { createI18n } from '../../src/ui/i18n.js';
import { PopoverManager } from '../../src/ui/popover.js';
import type { Shortcut } from '../../src/ui/shortcuts.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; compact: boolean; help: boolean; fullscreen: boolean };

const KEYMAP: Shortcut[] = [
  { id: 'fit', keys: ['f'], label: 'Fit to view', group: 'View' },
  { id: 'zoom', keys: ['+', '-'], label: 'Zoom in / out', group: 'View', hintOnly: true },
  { id: 'help', keys: ['?'], label: 'Shortcuts and hints', group: 'View' },
];

/** The bar in the corner of a stand-in canvas; zoom, Fit and full screen drive mock state, `?` opens the help. */
function zoomBar(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([ZOOM_BAR_CSS, HELP_POPUP_CSS, '.stage{position:relative;height:420px;border-radius:12px;background:var(--mmdx-surface-2);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  root.append(stage);
  const pops = new PopoverManager(root);
  const view = signal({ k: 1 });
  const open = signal(false);
  const active = signal(false);
  const bar = createZoomBar({
    view, t, compact: a.compact,
    onZoom: (f) => view.set({ k: Math.min(8, Math.max(0.1, view.peek().k * f)) }),
    onFit: () => view.set({ k: 0.85 }),
    help: a.help ? {
      open,
      onToggle: () => {
        if (open.peek()) return pops.close(true);
        const pop = createHelpPopup({ title: t('help.title'), groups: groupShortcuts(KEYMAP), onClose: () => pops.close(true), t });
        stage.append(pop.el);
        open.set(true);
        pops.open(pop.el, bar.helpButton, { onClose: () => (pop.destroy(), open.set(false)) });
      },
    } : null,
    fullscreen: a.fullscreen ? { active, available: true, onToggle: () => active.set(!active.peek()) } : null,
  });
  stage.append(bar.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ZoomBar',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The zoom bar (`createZoomBar`): − % + Fit, the `?` help button and full screen, bottom right. The percentage ' +
          'follows a view signal; `?` reflects the help popup’s open state (`aria-expanded`). Compact makes it smaller ' +
          'and turns Fit into an icon.',
      },
    },
  },
  render: (a) => zoomBar(a),
  argTypes: {
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
    compact: { control: 'boolean' },
    help: { control: 'boolean' },
    fullscreen: { control: 'boolean' },
  },
  args: { compact: false, help: true, fullscreen: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Dark: Story = { args: { ui: 'dark' } };
