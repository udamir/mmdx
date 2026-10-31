import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createExportMenu, EXPORT_MENU_CSS, type ExportEntry } from '../../src/ui/blocks/export-menu.js';
import { MENU_CSS } from '../../src/ui/blocks/menu.js';
import { createI18n } from '../../src/ui/i18n.js';
import { PopoverManager, Toaster } from '../../src/ui/popover.js';
import { chromeHost } from '../support.js';

type Args = { product: 'editor' | 'viewer' | 'diff'; compact: boolean; headers: boolean; ui: 'light' | 'dark' };

/** The entries each product offers today (the runs only log; "Patch" fails, to show onError). */
function entries(product: Args['product'], log: (s: string) => void): ExportEntry[] {
  const e = (id: string, label: string, section: string, title?: string): ExportEntry => ({ id, label, section, ...(title ? { title } : {}), run: () => log(`export ${id}`) });
  if (product === 'viewer') return [e('svg', 'SVG image', 'image'), e('png', 'PNG image (2×)', 'image'), e('mmdx', 'Styled Mermaid (.mmdx)', 'image')];
  if (product === 'editor')
    return [e('mmdx', 'Styled Mermaid (.mmdx)', 'text', 'Mermaid with the layout and styles as %%@ lines'), e('mmd', 'Portable Mermaid (.mmd)', 'text', 'Plain Mermaid with classDef / linkStyle colours'),
      e('svg', 'SVG image', 'image'), e('png', 'PNG image (2×)', 'image', 'At 2× resolution')];
  return [e('png', 'PNG image', 'Image'), e('svg', 'SVG image', 'Image'), e('before', 'Before version (.mmdx)', 'Source'), e('after', 'After version (.mmdx)', 'Source'), e('mmd', 'Portable Mermaid (.mmd)', 'Source'),
    { id: 'patch', label: 'Patch (.diff)', section: 'Report', run: () => Promise.reject(new Error('Patch export failed: no versions')) }, e('md', 'Markdown report', 'Report'), e('json', 'JSON report', 'Report')];
}

function exportMenu(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([MENU_CSS, EXPORT_MENU_CSS,
    '.bar{position:absolute;top:24px;right:24px;display:flex;padding:4px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:12px;box-shadow:0 4px 16px rgba(20,30,60,.10);}' +
    '.log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);}'], { ui: a.ui, style: 'min-height:420px;' });
  const pops = new PopoverManager(root);
  const toaster = new Toaster(root);
  const log = document.createElement('div');
  log.className = 'log';
  const menu = createExportMenu({
    entries: entries(a.product, (s) => void (log.textContent = s)), popovers: pops, within: () => host, compact: a.compact, t,
    ...(a.headers ? { sections: 'header' as const } : {}),
    onError: (e) => toaster.show(e instanceof Error ? e.message : String(e), { error: true }),
  });
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.append(menu.el);
  root.append(bar, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ExportMenu',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The labelled `Export ▾` button and its menu (`createExportMenu`), with the entries of the editor, the viewer ' +
          'or the diff. A change of section between entries inserts a separator (or a header). Compact turns the ' +
          'button into a download icon. Failed exports go to `onError` (here a toast: try "Patch" in the diff).',
      },
    },
  },
  render: (a) => exportMenu(a),
  argTypes: {
    product: { control: 'inline-radio', options: ['editor', 'viewer', 'diff'] },
    compact: { control: 'boolean' },
    headers: { control: 'boolean', description: 'Section headers instead of separators.' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { product: 'editor', compact: false, headers: false, ui: 'light' },
};
export default meta;

type Story = StoryObj<Args>;

export const Editor: Story = {};
export const Diff: Story = { args: { product: 'diff' } };
export const DiffWithHeaders: Story = { name: 'Diff, section headers', args: { product: 'diff', headers: true } };
export const Compact: Story = { args: { compact: true } };
export const Dark: Story = { args: { ui: 'dark' } };
