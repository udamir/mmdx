import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createLayerList, LAYER_LIST_CSS, type LayerRow } from '../../src/ui/blocks/layer-list.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal } from '../../src/reactive/signal.js';
import { chromeHost } from '../support.js';

type Args = { editable: boolean; display: boolean; ui: 'light' | 'dark' };

/** The View settings card body: layers of a mock diagram and the display toggles. */
function layerList(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([LAYER_LIST_CSS,
    '.card{width:300px;background:var(--mmdx-panel);border:1px solid var(--mmdx-border);border-radius:14px;box-shadow:0 10px 30px rgba(20,30,60,.16);} .log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);margin-top:10px;}'], { ui: a.ui });
  let layers: LayerRow[] = [
    { id: 'default', name: 'Default', visible: true, count: 12, fixed: true },
    { id: 'L1', name: 'Infrastructure', visible: true, locked: true, count: 5 },
    { id: 'L2', name: 'Notes', visible: false, count: 3 },
  ];
  const labels = signal(true), hover = signal(true);
  const log = document.createElement('div');
  log.className = 'log';
  const set = (id: string, patch: Partial<LayerRow>, msg: string): void => {
    layers = layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    list.update({ layers });
    log.textContent = msg;
  };
  const list = createLayerList({
    layers, editable: a.editable, t,
    onToggle: (id, visible) => set(id, { visible }, `${id}: ${visible ? 'shown' : 'hidden'}`),
    onLock: (id, locked) => set(id, { locked }, `${id}: ${locked ? 'locked' : 'unlocked'}`),
    onRename: (id, name) => set(id, { name }, `${id}: renamed to ${name}`),
    onDelete: (id) => {
      layers = layers.filter((l) => l.id !== id);
      list.update({ layers });
      log.textContent = `${id}: deleted`;
    },
    onCountClick: (id) => void (log.textContent = `${id}: select its items`),
    onCountHover: (id) => void (log.textContent = id ? `${id}: highlight its items` : ''),
    ...(a.display ? { display: [
      { id: 'labels', label: t('layers.labels'), value: labels, onChange: (v: boolean) => labels.set(v) },
      { id: 'hover', label: t('layers.hover'), value: hover, onChange: (v: boolean) => hover.set(v) },
    ] } : {}),
  });
  const card = document.createElement('div');
  card.className = 'card';
  card.append(list.el);
  root.append(card, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/LayerList',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Layer rows and display toggles (`createLayerList`), the body of the View settings card. Every row has the ' +
          'eye toggle, the name and the item count (a button that selects the items when `onCountClick` is given; ' +
          '`onCountHover` follows the pointer and the focus on it); while editing, the name is renamed in place (Enter ' +
          'commits, Esc restores), a lock toggle shows and × deletes a layer (not the `fixed` one). Display toggles are ' +
          'switches following signals.',
      },
    },
  },
  render: (a) => layerList(a),
  argTypes: { editable: { control: 'boolean' }, display: { control: 'boolean' }, ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { editable: false, display: true },
};
export default meta;

type Story = StoryObj<Args>;

export const ViewSettings: Story = { name: 'View settings' };
export const Editing: Story = { args: { editable: true, display: false } };
export const LayersOnly: Story = { name: 'Layers only (the diff)', args: { editable: false, display: false } };
export const Dark: Story = { args: { ui: 'dark' } };
