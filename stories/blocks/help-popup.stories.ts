import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createHelpPopup, groupShortcuts, HELP_POPUP_CSS } from '../../src/ui/blocks/help-popup.js';
import { createI18n } from '../../src/ui/i18n.js';
import type { Shortcut } from '../../src/ui/shortcuts.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark' };

const KEYMAP: Shortcut[] = [
  { id: 'pointer', keys: ['v'], label: 'Pointer', group: 'Tools' },
  { id: 'hand', keys: ['h'], label: 'Hand (pan)', group: 'Tools' },
  { id: 'pen', keys: ['p'], label: 'Pen — draw, fades away', group: 'Tools' },
  { id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit' },
  { id: 'redo', keys: ['mod+shift+z', 'mod+y'], label: 'Redo', group: 'Edit' },
  { id: 'fit', keys: ['f'], label: 'Fit to view', group: 'View' },
  { id: 'zoom', keys: ['+', '-'], label: 'Zoom in / out', group: 'View', hintOnly: true },
  { id: 'pan', keys: ['Space + drag', 'middle mouse drag'], label: 'Pan the canvas', group: 'View', hintOnly: true },
  { id: 'help', keys: ['?'], label: 'Shortcuts and hints', group: 'View' },
];

/** The popup as the zoom bar opens it (bottom right of the component), generated from a mock keymap. */
function helpPopup(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([HELP_POPUP_CSS, '.stage{position:relative;height:560px;border-radius:12px;background:var(--mmdx-surface-2);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const pop = createHelpPopup({ title: t('help.title'), groups: groupShortcuts(KEYMAP), onClose: () => void (pop.el.hidden = true), t });
  stage.append(pop.el);
  root.append(stage);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/HelpPopup',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The help dialog (`createHelpPopup`), generated from a keymap grouped with `groupShortcuts`: key caps for keys ' +
          '(alternatives joined by ·), plain text for gestures. The close button and Esc call `onClose`; the host opens ' +
          'it through its PopoverManager.',
      },
    },
  },
  render: (a) => helpPopup(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: {},
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
