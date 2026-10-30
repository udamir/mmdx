import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createToolbar, TOOLBAR_KINDS, type PaletteColor, type ToolbarApi, type ToolbarControl } from '../../src/ui/style-toolbar.js';
import { TOOLBAR_CSS } from '../../src/ui/styles/toolbar.js';
import { chromeHost } from '../support.js';

type ToolbarArgs = {
  kind: string;
  multi: number;
  locked: boolean;
  themeEditorMode: boolean;
  localPalette: boolean;
  ui: 'light' | 'dark';
};

const PALETTE: PaletteColor[] = [
  { name: 'ink', value: '#1d2330' }, { name: 'paper', value: '#ffffff' }, { name: 'sky', value: '#bfe0ff' },
  { name: 'lime', value: '#d4e63a' }, { name: 'rose', value: '#ffc9d6' }, { name: 'violet', value: '#8e5efb' },
];

const SAMPLE: Readonly<Record<string, Record<string, unknown>>> = {
  edge: { stroke: '#4f46e5', strokeWidth: 1.5, routing: 'curved', arrowEnd: 'arrow', fontSize: 13 },
  rel: { stroke: '#4f46e5', strokeWidth: 1.5, routing: 'orthogonal', fontSize: 12 },
  message: { stroke: '#1d2330', strokeWidth: 1.2, fontSize: 13 },
};

/** A toolbar over a stand-in item whose look follows the style the toolbar writes (fill, border, text). */
function styleToolbar(a: ToolbarArgs): HTMLElement {
  const { host, root } = chromeHost([TOOLBAR_CSS, '.stage{position:relative;height:420px;} .item{position:absolute;display:grid;place-items:center;}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const item = document.createElement('div');
  item.className = 'item';
  const log = document.createElement('pre');
  log.style.cssText = 'font:12px/1.4 ui-monospace,monospace;color:var(--ds-muted);margin:0;position:absolute;left:0;right:0;bottom:0;white-space:pre-wrap;word-break:break-all;';
  stage.append(item, log);
  root.append(stage);

  const box = { x: 220, y: 180, w: 180, h: 72 };
  const style: Record<string, unknown> = {
    fill: '@sky', stroke: '@ink', strokeWidth: 1.5, color: '@ink', fontSize: 14, fontWeight: 400, shape: 'rounded', textAlign: 'center',
    ...(SAMPLE[a.kind] ?? {}),
  };
  const locals: PaletteColor[] = a.localPalette ? [{ name: 'c-ff8a00', value: '#ff8a00' }] : [];
  const resolve = (v: unknown): unknown => {
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    return [...PALETTE, ...locals].find((p) => p.name === v.slice(1))?.value ?? v;
  };
  let locked = a.locked;
  const paint = (): void => {
    const line = a.kind === 'edge' || a.kind === 'rel' || a.kind === 'message';
    item.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;` +
      (line
        ? `border-top:${Number(style['strokeWidth'] ?? 1.5) + 0.5}px ${style['dash'] ? 'dashed' : 'solid'} ${resolve(style['stroke'])};height:0;top:${box.y + box.h / 2}px;`
        : `background:${resolve(style['fill'])};border:${style['strokeWidth']}px solid ${resolve(style['stroke'])};border-radius:${style['shape'] === 'rect' ? 2 : 12}px;`) +
      `color:${resolve(style['color'])};font:${style['fontWeight']} ${style['fontSize']}px system-ui;`;
    item.textContent = line ? '' : a.multi > 1 ? `${a.multi} items` : a.kind;
    log.textContent = JSON.stringify(style, null, 0);
  };
  paint();

  const api: ToolbarApi = {
    selection: () => ({ kind: a.multi > 1 ? 'multi' : a.kind, id: 'a' }),
    editable: () => true,
    multiCount: () => a.multi,
    eff: (k) => resolve(style[k]),
    effRaw: (k) => style[k],
    set: (k, v) => {
      if (typeof k === 'string') v === undefined ? delete style[k] : (style[k] = v);
      else for (const [kk, vv] of Object.entries(k)) vv === undefined ? delete style[kk] : (style[kk] = vv);
      paint();
      tb.refresh();
    },
    commit: () => console.info('commit'),
    palette: () => PALETTE,
    themeFont: () => 'Roboto, system-ui, sans-serif',
    themeFontName: () => 'Roboto',
    anchorRect: () => box,
    del: () => console.info('delete'),
    isLocked: () => locked,
    toggleLock: () => {
      locked = !locked;
      tb.refresh();
    },
    copy: () => console.info('copy style'),
    canCopy: () => true,
    duplicate: () => console.info('duplicate'),
    inspect: () => console.info('all properties'),
    canReset: () => true,
    reset: () => console.info('reset'),
    ...(a.multi > 1 ? { arrange: (op) => console.info('arrange', op), canGroup: () => ({ ok: true }), group: () => console.info('group') } : {}),
    ...(a.localPalette
      ? {
          localPalette: () => locals,
          addLocalColor: (hex: string) => {
            const name = `c-${hex.slice(1)}`;
            locals.push({ name, value: hex });
            return name;
          },
          removeLocalColor: (name: string) => locals.splice(locals.findIndex((p) => p.name === name), 1),
        }
      : {}),
  };
  const exclude: ToolbarControl[] = a.themeEditorMode ? ['more', 'lock', 'link'] : [];
  const tb = createToolbar(stage, api, { exclude, reset: a.themeEditorMode });
  tb.refresh();
  // placement needs the host in the document
  requestAnimationFrame(() => tb.place());
  return host;
}

const meta: Meta<ToolbarArgs> = {
  title: 'UI/Style toolbar',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The floating style toolbar shown above the selection in the editor (and, without item actions, in the theme ' +
          'editor). The button set depends on the item kind; popovers edit shape, font, size, alignment, colours (theme ' +
          'palette plus the diagram\'s own colours with "+"), line style, arrows and routing. Here it drives a stand-in ' +
          'item through a mock `ToolbarApi`; the current style is printed below it.',
      },
    },
  },
  render: (a) => styleToolbar(a),
  argTypes: {
    kind: { control: 'select', options: Object.keys(TOOLBAR_KINDS).filter((k) => k !== 'multi') },
    multi: { control: { type: 'number', min: 1, max: 9 }, description: 'Selection size (> 1 shows the multi-selection set).' },
    themeEditorMode: { control: 'boolean', description: 'The theme editor\'s variant: no item actions, with a reset button.' },
    localPalette: { control: 'boolean', description: 'Diagram palette in the colour pickers, with "+" to add colours.' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { kind: 'node', multi: 1, locked: false, themeEditorMode: false, localPalette: true, ui: 'light' },
};
export default meta;

type Story = StoryObj<ToolbarArgs>;

export const Node: Story = {};
export const Group: Story = { args: { kind: 'group' } };
export const Edge: Story = { args: { kind: 'edge' } };
export const Participant: Story = { args: { kind: 'participant' } };
export const Message: Story = { args: { kind: 'message' } };
export const Note: Story = { args: { kind: 'note' } };
export const Entity: Story = { name: 'ER table', args: { kind: 'entity' } };
export const Relation: Story = { name: 'ER relation', args: { kind: 'rel' } };
export const MultiSelection: Story = { name: 'Multi-selection', args: { multi: 3 } };
export const Locked: Story = { args: { locked: true } };
export const ThemeEditorVariant: Story = { name: 'Theme editor variant', args: { themeEditorMode: true, localPalette: false } };
export const Dark: Story = { args: { ui: 'dark' } };
