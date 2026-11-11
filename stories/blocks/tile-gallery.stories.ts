import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createTileGallery, TILE_GALLERY_CSS, type Tile } from '../../src/ui/blocks/tile-gallery.js';
import { h } from '../../src/ui/h.js';
import { signal } from '../../src/reactive/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; readOnly: boolean };

const CSS = '.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-width:640px;} ' +
  '.mmdx-tile{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid var(--mmdx-border);border-radius:10px;background:var(--mmdx-surface);text-align:left;} ' +
  '.mmdx-tile.on{border-color:var(--mmdx-accent);box-shadow:0 0 0 2px var(--mmdx-accent-2);} .mmdx-tile-add{justify-content:center;align-items:center;color:var(--mmdx-accent);border-style:dashed;min-height:96px;} ' +
  '.pic{display:block;height:60px;border-radius:6px;} .cap{font-size:12px;color:var(--mmdx-text-2);} ' +
  '.mmdx-tile-del{width:18px;height:18px;border-radius:50%;border:0;padding:0;place-items:center;background:var(--mmdx-surface);box-shadow:0 1px 3px rgba(0,0,0,.3);}';

const STYLES: [string, string, boolean][] = [['default', '#e8eefc', false], ['core', '#dbeafe', true], ['db', '#fef3c7', true], ['event-bus', '#ede9fe', true], ['service', '#dcfce7', true]];

/** Style tiles: one selected, presets with a delete button, the add tile; arrows move, Delete deletes. */
function gallery(a: Args): HTMLElement {
  const { host, root } = chromeHost([TILE_GALLERY_CSS, CSS], { ui: a.ui });
  const selected = signal<string | null>('core');
  const log = h('div', { style: 'margin-top:12px;font:12px ui-monospace,monospace;color:var(--mmdx-muted)' });
  let names = STYLES;
  const tiles = (): Tile[] => names.map(([key, bg, del]) => {
    const pic = h('span', { class: 'pic' });
    pic.style.background = bg;
    const tile: Tile = { key, label: key, content: [pic, h('span', { class: 'cap' }, key)] };
    if (del) tile.onDelete = () => {
      names = names.filter(([k]) => k !== key);
      log.textContent = `deleted: ${key}`;
      g.update({ tiles: tiles() });
    };
    return tile;
  });
  const g = createTileGallery({
    label: 'Node styles', tiles: tiles(), selected, readOnly: a.readOnly, deleteLabel: 'Delete this preset', class: 'gal',
    onSelect: (k) => {
      selected.set(k);
      log.textContent = `selected: ${k}`;
    },
    add: { label: '+ Preset', title: 'A named style', onClick: () => void (log.textContent = 'add') },
  });
  root.append(g.el, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/TileGallery',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createTileGallery`: a list of picture tiles (buttons; the selected one has `aria-current`), each with an optional ' +
          'delete button beside it (never inside), and an add tile. Arrow keys, Home and End move with one tab stop; Delete ' +
          'on a tile deletes it. `setTile()` redraws one tile in place.',
      },
    },
  },
  render: (a) => gallery(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, readOnly: { control: 'boolean' } },
  args: { readOnly: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Gallery: Story = {};
export const ReadOnly: Story = { args: { readOnly: true } };
export const Dark: Story = { args: { ui: 'dark' } };
