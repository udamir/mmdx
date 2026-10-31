/// <reference types="vite/client" />
import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/diff.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { StaticVersion } from '../../src/adapters/history.js';
import type { DiffFilter, DiffViewName, MmdxDiffElement } from '../../src/elements/diff.js';

const histories = import.meta.glob<{ versions: StaticVersion[] }>('../../examples/history/*.json', { eager: true, import: 'default' });
const history = (id: string): StaticVersion[] => histories[`../../examples/history/${id}.json`]?.versions ?? [];
const raw = import.meta.glob<string>('../../apps/studio-site/diff-samples/*.mmd', { eager: true, query: '?raw', import: 'default' });
const sample = (name: string, side: 'before' | 'after'): string => raw[`../../apps/studio-site/diff-samples/${name}.${side}.mmd`] ?? '';

type DiffArgs = {
  source: 'history' | 'two versions';
  example: string;
  pair: string;
  view: DiffViewName;
  filters: DiffFilter[];
  dim: boolean;
  panels: string;
  ui: 'light' | 'dark' | 'auto';
};

function diff(a: DiffArgs): HTMLElement {
  const el = document.createElement('mmdx-diff') as MmdxDiffElement;
  el.setAttribute('view', a.view);
  el.setAttribute('filters', a.filters.join(' '));
  el.setAttribute('dim', String(a.dim));
  el.setAttribute('panels', a.panels);
  el.setAttribute('ui', a.ui);
  el.setAttribute('theme-dark', 'auto');
  el.setAttribute('name', a.source === 'history' ? a.example : a.pair);
  el.storage = memoryStorage();
  if (a.source === 'history') el.history = history(a.example);
  else {
    el.beforeSource = sample(a.pair, 'before');
    el.afterSource = sample(a.pair, 'after');
  }
  el.style.cssText = 'display:block;height:100vh;';
  return el;
}

const meta: Meta<DiffArgs> = {
  title: 'Elements/Diff',
  tags: ['autodocs'],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 760 },
      description: {
        component:
          '`<mmdx-diff>` shows how a diagram changed between two versions and browses its version history. Views: Before, ' +
          'Merged (removed items kept in place, word-level text changes, move arrows) and After on one animated canvas, and ' +
          'Side by side. Filters hide added / removed items and ignore content / layout / style changes. Panels: History ' +
          '(compare two versions, or view one), the code / metadata diff narrowed to the selected change, and the change ' +
          'list. Pan, the magic pen, export (PNG, SVG, sources, patch, Markdown / JSON report). Import `mmdx/diff`.',
      },
    },
  },
  render: (a) => diff(a),
  argTypes: {
    source: { control: 'inline-radio', options: ['history', 'two versions'] },
    example: { control: 'select', options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'microservice-patterns', 'fusion-services', 'simple-flow'], if: { arg: 'source', eq: 'history' } },
    pair: { control: 'select', options: ['architecture', 'restyle', 'flow-many', 'small', 'sequence', 'seq-many', 'schema', 'er-many'], if: { arg: 'source', eq: 'two versions' } },
    view: { control: 'inline-radio', options: ['before', 'merged', 'after', 'side'] },
    filters: { control: 'check', options: ['added', 'removed', 'content', 'layout', 'style'] },
    panels: { control: 'select', options: ['changes', 'history changes', 'code changes', 'history', ''] },
    ui: { control: 'inline-radio', options: ['light', 'dark', 'auto'] },
  },
  args: { source: 'history', example: 'production-microservices', pair: 'architecture', view: 'merged', filters: ['added', 'removed', 'content', 'layout', 'style'], dim: true, panels: 'history changes', ui: 'light' },
};
export default meta;

type Story = StoryObj<DiffArgs>;

export const History: Story = {};

export const SequenceHistory: Story = { name: 'Sequence diagram history', args: { example: 'docker-deploy-sequence' } };

export const ErHistory: Story = { name: 'ER diagram history', args: { example: 'atom-schema-er' } };

export const MergeRequest: Story = { name: 'Two versions (merge request)', args: { source: 'two versions', pair: 'architecture', panels: 'code changes' } };

export const HiddenEdit: Story = { name: 'Restyle with one hidden edit (Style off)', args: { source: 'two versions', pair: 'restyle', filters: ['added', 'removed', 'content', 'layout'] } };

export const SideBySide: Story = { name: 'Side by side', args: { source: 'two versions', pair: 'schema', view: 'side' } };

export const Dark: Story = { args: { ui: 'dark' } };
