import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createFilterToggles, FILTER_ICONS, FILTER_TOGGLES_CSS, type FilterToggle } from '../../src/ui/blocks/filter-toggles.js';
import { createToolbar, TOOLBAR_CSS } from '../../src/ui/blocks/toolbar.js';
import { createI18n } from '../../src/i18n.js';
import { DIFF_TOKENS } from '../../src/diff/styles.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; dim: boolean };

const KINDS = ['added', 'removed', 'content', 'layout', 'style'] as const;
const COUNTS: Record<(typeof KINDS)[number], number> = { added: 4, removed: 2, content: 7, layout: 12, style: 0 };
const LABELS: Record<(typeof KINDS)[number], string> = { added: 'Added', removed: 'Removed', content: 'Content', layout: 'Layout', style: 'Style' };

/** The change filters in a horizontal toolbar (as the diff's bottom bar hosts them); clicks toggle them. */
function filterToggles(a: Args): HTMLElement {
  const { host, root } = chromeHost([DIFF_TOKENS, TOOLBAR_CSS, FILTER_TOGGLES_CSS, '.mmdx-toolbar{display:inline-flex;gap:2px;padding:3px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:var(--mmdx-radius);box-shadow:var(--mmdx-shadow);margin-top:48px;}'], { ui: a.ui });
  const t = createI18n().t;
  const on: Record<string, boolean> = { added: true, removed: true, content: true, layout: false, style: true };
  let dim = a.dim;
  const filters = (): FilterToggle[] => KINDS.map((id) => ({ id, label: LABELS[id], icon: FILTER_ICONS[id], on: on[id]!, count: COUNTS[id] }));
  const dimProp = (): { on: boolean; label: string; icon: string } => ({ on: dim, label: 'Dim unchanged items', icon: FILTER_ICONS.dim });
  const ft = createFilterToggles({
    filters: filters(), dim: dimProp(), t,
    onToggle: (id) => {
      on[id] = !on[id];
      ft.update({ filters: filters() });
    },
    onDim: () => {
      dim = !dim;
      ft.update({ dim: dimProp() });
    },
  });
  root.append(createToolbar({ label: 'Change filters', orientation: 'horizontal', items: [ft.el] }).el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/FilterToggles',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Icon toggle buttons of the change kinds (Added, Removed, Content, Layout, Style) and Dim, each in its highlight colour ' +
          '(`--mmdx-diff-*` tokens, from `DIFF_TOKENS`), with a count badge, a tooltip and an accessible name with the count. ' +
          'The block is a `display: contents` span, so the buttons join the host toolbar (arrow keys, tooltips above).',
      },
    },
  },
  render: (a) => filterToggles(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, dim: { control: 'boolean' } },
  args: { dim: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
