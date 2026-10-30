import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createPageToolbar, type PageToolbarApi, type SequenceLayoutState } from '../../src/ui/page-toolbar.js';
import type { PaletteColor } from '../../src/ui/style-toolbar.js';
import { TOOLBAR_CSS } from '../../src/ui/styles/toolbar.js';
import { chromeHost } from '../support.js';

type PageArgs = { type: 'flowchart' | 'sequence' | 'er'; ui: 'light' | 'dark' };

const PALETTE: PaletteColor[] = [
  { name: 'paper', value: '#ffffff' }, { name: 'mist', value: '#f2f4f8' }, { name: 'ink', value: '#1d2330' }, { name: 'sky', value: '#bfe0ff' },
];

/** The page bar over a stand-in page whose background, border and size follow the bar's settings. */
function pageToolbar(a: PageArgs): HTMLElement {
  const { host, root } = chromeHost([TOOLBAR_CSS, '.stage{position:relative;height:480px;} .page{position:absolute;box-sizing:border-box;display:grid;place-items:center;font:13px system-ui;color:var(--ds-muted);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const page = document.createElement('div');
  page.className = 'page';
  const log = document.createElement('pre');
  log.style.cssText = 'font:12px/1.4 ui-monospace,monospace;color:var(--ds-muted);margin:0;position:absolute;left:0;right:0;bottom:0;white-space:pre-wrap;word-break:break-all;';
  stage.append(page, log);
  root.append(stage);

  const state = {
    type: a.type as string,
    direction: a.type === 'sequence' ? null : 'LR',
    preset: 'plain',
    sizeMode: 'fit' as 'fit' | 'custom',
    ratio: '16:9',
    routing: 'curved',
    page: { background: '@mist', border: 'transparent' } as Record<string, string | undefined>,
    seq: { gap: 160, rowH: 44, blockSpan: 'touched', mirror: false, autonumber: false } as SequenceLayoutState,
  };
  const locals: PaletteColor[] = [];
  const resolve = (v: string | undefined): string | undefined => (v?.startsWith('@') ? [...PALETTE, ...locals].find((p) => p.name === v.slice(1))?.value : v);
  const rect = (): { x: number; y: number; w: number; h: number } => {
    const w = 520;
    const h = state.sizeMode === 'custom' ? Math.round((w * Number(state.ratio.split(':')[1])) / Number(state.ratio.split(':')[0])) : 280;
    return { x: 120, y: 90, w, h };
  };
  const paint = (): void => {
    const r = rect();
    const border = resolve(state.page['border']);
    page.style.cssText += `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${resolve(state.page['background']) ?? 'transparent'};` +
      `border:${border && border !== 'transparent' ? `2px solid ${border}` : '1px dashed var(--ds-border)'};`;
    page.textContent = `${state.type}${state.direction ? ` · ${state.direction}` : ''} · preset ${state.preset}`;
    log.textContent = JSON.stringify(state);
  };
  const changed = (): void => {
    paint();
    bar.refresh();
    bar.place();
  };

  const api: PageToolbarApi = {
    visible: () => true,
    types: () => [['flowchart', 'Flowchart'], ['sequence', 'Sequence'], ['er', 'ER diagram']],
    diagramType: () => state.type,
    direction: () => state.direction,
    directions: () => [['TB', 'Top to bottom'], ['LR', 'Left to right'], ['BT', 'Bottom to top'], ['RL', 'Right to left']],
    presets: () => [['plain', 'Plain'], ['paper', 'Paper'], ['blueprint', 'Grid']],
    preset: () => state.preset,
    sizeMode: () => state.sizeMode,
    ratio: () => state.ratio,
    ratioLabel: () => state.ratio,
    ratios: () => [['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1'], ['3:4', '3:4']],
    get: (k) => resolve(state.page[k]),
    getRaw: (k) => state.page[k],
    hasRouting: () => state.type !== 'sequence',
    routing: () => state.routing,
    seq: () => (state.type === 'sequence' ? state.seq : null),
    setSeq: (k, v) => {
      (state.seq as unknown as Record<string, unknown>)[k] = v;
      changed();
    },
    set: (patch) => {
      Object.assign(state.page, patch);
      changed();
    },
    setType: (t) => {
      state.type = t;
      state.direction = t === 'sequence' ? null : (state.direction ?? 'TB');
      changed();
    },
    setDirection: (d) => {
      state.direction = d;
      changed();
    },
    setPreset: (id) => {
      state.preset = id;
      changed();
    },
    setSizeMode: (m) => {
      state.sizeMode = m as 'fit' | 'custom';
      changed();
    },
    setRatio: (r) => {
      state.ratio = r;
      changed();
    },
    setRouting: (r) => {
      state.routing = r;
      changed();
    },
    palette: () => PALETTE,
    localPalette: () => locals,
    addLocalColor: (hex) => {
      const name = `c-${hex.slice(1)}`;
      locals.push({ name, value: hex });
      return name;
    },
    removeLocalColor: (name) => locals.splice(locals.findIndex((p) => p.name === name), 1),
    rect,
  };
  const bar = createPageToolbar(stage, api);
  paint();
  bar.refresh();
  requestAnimationFrame(() => bar.place());
  return host;
}

const meta: Meta<PageArgs> = {
  title: 'UI/Page toolbar',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The page bar, opened from the diagram-type badge above the page: one icon per page property — diagram type, ' +
          'direction, theme page preset, background, border (including transparent), size and ratio, line routing, and ' +
          'for sequence diagrams the column gap, row height, block span, mirrored participants and autonumber. ' +
          'Here it drives a stand-in page through a mock `PageToolbarApi`.',
      },
    },
  },
  render: (a) => pageToolbar(a),
  argTypes: {
    type: { control: 'inline-radio', options: ['flowchart', 'sequence', 'er'] },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { type: 'flowchart', ui: 'light' },
};
export default meta;

type Story = StoryObj<PageArgs>;

export const Flowchart: Story = {};
export const Sequence: Story = { args: { type: 'sequence' } };
export const EntityRelationship: Story = { name: 'ER diagram', args: { type: 'er' } };
export const Dark: Story = { args: { ui: 'dark' } };
