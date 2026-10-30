import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { getShared } from '../../src/config.js';
import { drawItemPreview, type PreviewKind } from '../../src/ui/item-preview.js';
import { NODE_SHAPES, PARTICIPANT_SHAPES } from '../../src/ui/style-toolbar.js';
import type { ResolvedTheme } from '../../src/core/theme/types.js';
import { THEME_IDS } from '../support.js';

type PreviewArgs = { theme: string; kind: PreviewKind; zoom: number };

const KINDS: readonly PreviewKind[] = ['node', 'group', 'edge', 'participant', 'message', 'note', 'block', 'box', 'lifeline', 'activation', 'entity', 'rel'];

/** Theme presets of one item kind (the names the preset pickers list). */
function presetsOf(t: ResolvedTheme, kind: PreviewKind): string[] {
  const table: Partial<Record<PreviewKind, Record<string, unknown> | undefined>> = {
    node: t.flowchart.nodePresets, group: t.flowchart.groupPresets, edge: t.flowchart.edgePresets,
    participant: t.sequence.participantPresets, message: t.sequence.messagePresets, note: t.sequence.notePresets,
    block: t.sequence.blockPresets, box: t.sequence.boxPresets, activation: t.sequence.activationPresets,
    entity: t.er.entityPresets, rel: t.er.relPresets,
  };
  return Object.keys(table[kind] ?? {});
}

/** The page colour of the theme (palette references resolved; a transparent page shows the UI surface). */
function pageBackground(t: ResolvedTheme): string {
  const v = t.canvas.background;
  const c = v?.startsWith('@') ? t.palette[v.slice(1)] : v;
  return !c || c === 'transparent' || c === 'none' ? (t.appearance === 'dark' ? '#1b1e24' : '#ffffff') : c;
}

function tile(caption: string, draw: (pic: HTMLElement) => void, background: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.style.cssText = `margin:0;border:1px solid #dde1e7;border-radius:8px;overflow:hidden;background:${background};`;
  const pic = document.createElement('div');
  pic.style.cssText = 'width:200px;';
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  cap.style.cssText = 'font:12px system-ui;padding:6px 8px;background:#fff;color:#3a4152;border-top:1px solid #eceef2;';
  fig.append(pic, cap);
  // drawn once the tile is laid out (the preview measures its width)
  requestAnimationFrame(() => draw(pic));
  return fig;
}

const grid = (...tiles: HTMLElement[]): HTMLElement => {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;padding:16px;';
  d.append(...tiles);
  return d;
};

const meta: Meta<PreviewArgs> = {
  title: 'UI/Item previews and presets',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`drawItemPreview()` renders a tiny sample diagram of one item kind with a theme preset applied: the tiles of ' +
          'the preset pickers, the shape menus and the theme editor. These stories list every preset of every kind ' +
          'in a theme, and every node and participant shape.',
      },
    },
  },
  argTypes: {
    theme: { control: 'select', options: THEME_IDS },
    kind: { control: 'select', options: KINDS },
    zoom: { control: { type: 'range', min: 0.5, max: 2, step: 0.1 } },
  },
  args: { theme: 'default-light', kind: 'node', zoom: 1 },
};
export default meta;

type Story = StoryObj<PreviewArgs>;

export const PresetsOfKind: Story = {
  name: 'Presets of one kind',
  render: (a) => {
    const t = getShared().themes.get(a.theme);
    const bg = pageBackground(t);
    return grid(...[null, ...presetsOf(t, a.kind)].map((p) => tile(p ?? '(default)', (pic) => drawItemPreview(pic, a.kind, p, t, { zoom: a.zoom }), bg)));
  },
};

export const EveryKind: Story = {
  name: 'Every item kind (default style)',
  render: (a) => {
    const t = getShared().themes.get(a.theme);
    const bg = pageBackground(t);
    return grid(...KINDS.map((k) => tile(k, (pic) => drawItemPreview(pic, k, null, t, { zoom: a.zoom }), bg)));
  },
};

export const NodeShapes: Story = {
  name: 'Node shapes',
  render: (a) => {
    const t = getShared().themes.get(a.theme);
    const bg = pageBackground(t);
    return grid(...NODE_SHAPES.map((s) => tile(s, (pic) => drawItemPreview(pic, 'node', null, t, { shape: s, zoom: a.zoom }), bg)));
  },
};

export const ParticipantShapes: Story = {
  name: 'Participant shapes',
  render: (a) => {
    const t = getShared().themes.get(a.theme);
    const bg = pageBackground(t);
    return grid(...PARTICIPANT_SHAPES.map((s) => tile(s, (pic) => drawItemPreview(pic, 'participant', null, t, { shape: s, zoom: a.zoom }), bg)));
  },
};

export const DarkTheme: Story = { name: 'Presets in a dark theme', ...PresetsOfKind, args: { theme: 'default-dark' } };
