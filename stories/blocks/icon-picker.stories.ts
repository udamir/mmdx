import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { iconImage } from '../../src/core/icons/draw.js';
import { createIconRegistry } from '../../src/core/icons/index.js';
import { searchIcons } from '../../src/core/icons/search.js';
import type { IconifyJSON } from '../../src/core/icons/types.js';
import { BUILTIN_ICONS } from '../../src/icons/builtin.js';
import { createIconPicker, ICON_PICKER_CSS } from '../../src/ui/blocks/icon-picker.js';
import { createI18n } from '../../src/ui/i18n.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; packs: 'three' | 'builtin'; remove: boolean };

const square = (fill: string): string => `<rect x="3" y="3" width="18" height="18" rx="4" fill="${fill}"/>`;
const LOGOS: IconifyJSON = {
  prefix: 'logos', width: 24, height: 24, info: { name: 'Logos (mock)', license: { title: 'CC0' }, palette: true },
  icons: Object.fromEntries(['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'postgres'].map((n, i) => [n, { body: square(['#f90', '#08f', '#e44', '#09c', '#36c', '#357'][i]!) }])),
};
const CLOUD: IconifyJSON = {
  prefix: 'azure', width: 24, height: 24, info: { name: 'Azure (mock, loads in 1 s)', license: { title: 'Microsoft terms' } },
  icons: Object.fromEntries(['computer-vision', 'storage-accounts', 'virtual-machine', 'key-vaults'].map((n) => [n, { body: '<circle cx="12" cy="12" r="8" fill="#0078d4"/>' }])),
};

/** The picker over a real registry: the built-in Tabler set, a mock logo pack and a pack whose loader takes a second. */
function picker(a: Args): HTMLElement {
  const { host, root } = chromeHost([ICON_PICKER_CSS, '.mmdx-pop{position:relative;}'], { ui: a.ui });
  const reg = createIconRegistry(a.packs === 'three' ? [{ name: 'logos', icons: LOGOS }, { name: 'azure', loader: () => new Promise((r) => setTimeout(() => r(CLOUD), 1000)) }] : [], { builtin: false });
  reg.add([{ name: 'tabler', icons: BUILTIN_ICONS }]);
  const { t } = createI18n();
  const ink = a.ui === 'dark' ? '#e6e8eb' : '#1f2328';
  const p = createIconPicker({
    t,
    packs: () => reg.packList().map((x) => ({ name: x.name, title: x.info?.name ?? x.name, loaded: x.loaded, failed: x.failed, builtin: x.name === 'tabler' && a.packs === 'builtin', ...(x.info?.license?.title ? { license: x.info.license.title } : {}) })),
    find: (q, pack) => (q ? searchIcons(reg, q, { ...(pack ? { packs: [pack] } : {}), limit: 600 }).map((x) => x.name)
      : (pack ? [pack] : reg.packNames()).flatMap((n) => Object.keys(reg.packData(n)?.icons ?? {}).map((i) => `${n}:${i}`))),
    preview: (name) => iconImage(reg, name, { color: ink, size: 28 }).href,
    load: (pack) => reg.load(pack),
    recent: ['tabler:user', 'logos:aws'],
    onPick: (name) => console.log('pick', name),
    onRemove: a.remove ? () => console.log('remove') : null,
    docsUrl: 'https://udamir.github.io/mmdx/guide/icons',
  });
  reg.onChange(() => p.refresh());
  const pop = document.createElement('div');
  pop.className = 'mmdx-pop';
  pop.append(p.el);
  root.append(pop);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/IconPicker',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createIconPicker` (T05): "Choose an icon…" — a search over the registered packs (`searchIcons`), a chip per pack (an unloaded one loads when chosen), ' +
          'recent icons, a virtualised grid of 48 px tiles with arrow keys, and the icon\'s name and licence on hover and focus. The host supplies packs, search and previews.',
      },
    },
  },
  render: (a) => picker(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, packs: { control: 'inline-radio', options: ['three', 'builtin'] }, remove: { control: 'boolean' } },
  args: { packs: 'three', remove: false },
};
export default meta;

type Story = StoryObj<Args>;
export const ThreePacks: Story = {};
export const BuiltinOnly: Story = { args: { packs: 'builtin' } };
export const SelectionMode: Story = { args: { remove: true } };
export const Dark: Story = { args: { ui: 'dark' } };
