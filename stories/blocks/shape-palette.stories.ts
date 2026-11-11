import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { PICKER_CATEGORIES, shapesIn } from '../../src/core/shapes/catalog.js';
import { createShapePalette, SHAPE_PALETTE_CSS } from '../../src/ui/blocks/shape-palette.js';
import { createI18n } from '../../src/ui/i18n.js';
import { shapePreview } from '../../src/ui/shape-preview.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; compact: boolean; query: string };

const CSS = '.box{width:280px;padding:8px;border-radius:14px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);box-shadow:var(--mmdx-shadow-float);}';
const TITLES: Record<string, string> = { basic: 'Basic', process: 'Process', technical: 'Technical', annotation: 'Annotation' };

/** The editor's Shapes menu of a flowchart: the catalogue by category, search, a recent row. */
function palette(a: Args): HTMLElement {
  const { host, root } = chromeHost([SHAPE_PALETTE_CSS, CSS], { ui: a.ui });
  const { t } = createI18n();
  const p = createShapePalette({
    t, title: 'Shapes', compact: a.compact,
    sections: PICKER_CATEGORIES.map((c) => ({
      title: TITLES[c] ?? c,
      items: shapesIn(c).map((d) => ({ key: d.id, label: d.name, tip: `${d.name} · ${d.mermaid ?? 'mmdx only'}`, terms: [d.id, d.title ?? '', d.mermaid ?? '', ...d.aliases], icon: () => shapePreview(d.id, a.compact ? 24 : 32) })),
    })),
    onPick: (it) => console.log('pick', it.key),
  });
  if (a.query) p.setQuery(a.query);
  const box = document.createElement('div');
  box.className = 'box';
  box.append(p.el);
  root.append(box);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ShapePalette',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createShapePalette` (T05): sections with headings, 32 px previews from the shape catalogue, search over the semantic, geometric and Mermaid names and aliases, ' +
          'a recently-used row, arrow keys through the tiles (one tab stop). The host decides what a press does (drag) and what a pick does; `compact` is the toolbar\'s shape picker.',
      },
    },
  },
  render: (a) => palette(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, compact: { control: 'boolean' }, query: { control: 'text' } },
  args: { compact: false, query: '' },
};
export default meta;

type Story = StoryObj<Args>;
export const Palette: Story = {};
export const Search: Story = { args: { query: 'data' } };
export const Compact: Story = { args: { compact: true } };
export const Dark: Story = { args: { ui: 'dark' } };
