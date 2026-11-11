import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createSidePanel, SIDE_PANEL_CSS } from '../../src/ui/blocks/side-panel.js';
import { createTabs, TABS_CSS } from '../../src/ui/blocks/tabs.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal } from '../../src/reactive/signal.js';
import { chromeHost, SMALL_FLOW } from '../support.js';

type Args = { head: 'title' | 'tabs'; side: 'left' | 'right'; resizable: boolean; ui: 'light' | 'dark' };

/** One floating card over a stand-in canvas: a titled card, or a tabbed one (the code panel). */
function sidePanel(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([TABS_CSS, SIDE_PANEL_CSS,
    '.stage{position:relative;height:520px;border-radius:12px;background:var(--mmdx-surface-2);}' +
    '.card{position:absolute;top:12px;bottom:12px;width:320px;} .card[data-side=left]{left:12px;} .card[data-side=right]{right:12px;}' +
    '.code{margin:0;padding:10px 12px;font:12px/1.5 var(--mmdx-mono);white-space:pre;} .log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);margin-top:8px;}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const log = document.createElement('div');
  log.className = 'log';
  const body = document.createElement('pre');
  body.className = 'code';
  body.textContent = SMALL_FLOW;
  const tab = signal<'code' | 'meta'>('code');
  const tabs = createTabs({ label: 'Code', tabs: [{ value: 'code', label: 'Mermaid' }, { value: 'meta', label: 'Metadata' }], value: tab, onChange: (v) => {
    tab.set(v);
    body.textContent = v === 'code' ? SMALL_FLOW : '%%@ node a { fill: "#eef" }';
  } });
  const width = signal<number | null>(null);
  const panel = createSidePanel({
    side: a.side, label: a.head === 'tabs' ? 'Mermaid code' : 'Changes', closeLabel: a.head === 'tabs' ? 'Close panel' : 'Hide', closeKeys: a.head === 'tabs' ? 'c' : 'l',
    ...(a.head === 'tabs' ? { head: tabs.el } : { title: 'Changes' }),
    onClose: () => void (log.textContent = 'closed (the host hides the panel)'),
    body, class: 'card', part: 'panel',
    ...(a.resizable ? { resizable: { width, min: 220, max: () => 640, title: t('panes.resize'), onCommit: () => void (log.textContent = `width: ${width.peek() ?? 'default'}`) } } : {}),
  });
  stage.append(panel.el);
  root.append(stage, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/SidePanel',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A floating card (`createSidePanel`): a header with a title or a Tabs element, the × close button (its ' +
          'tooltip shows the shortcut), a scrolling body, and an optional resize grip on the inner edge (drag, ' +
          'double-click resets, arrow keys step) driving a width signal.',
      },
    },
  },
  render: (a) => sidePanel(a),
  argTypes: {
    head: { control: 'inline-radio', options: ['title', 'tabs'] },
    side: { control: 'inline-radio', options: ['left', 'right'] },
    resizable: { control: 'boolean' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { head: 'title', side: 'right', resizable: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Titled: Story = {};
export const Tabbed: Story = { args: { head: 'tabs', side: 'left' } };
export const Dark: Story = { args: { ui: 'dark' } };
