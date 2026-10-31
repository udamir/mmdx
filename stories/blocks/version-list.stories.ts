import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { diffDiagrams } from '../../src/core/diff/index.js';
import { createVersionList, VERSION_LIST_CSS, type VersionCounts } from '../../src/ui/blocks/version-list.js';
import { createI18n } from '../../src/ui/i18n.js';
import { DIFF_TOKENS } from '../../src/ui/styles/diff.js';
import { chromeHost, exampleHistory } from '../support.js';

type Args = { example: string; mode: 'compare' | 'history'; hasMore: boolean; ui: 'light' | 'dark' };

/** An example history; Before / After picks, rows and "Load more" update the list as the diff would. */
function versionList(a: Args): HTMLElement {
  const { host, root } = chromeHost([DIFF_TOKENS, VERSION_LIST_CSS, '.card{width:400px;max-height:560px;overflow:auto;background:var(--mmdx-surface);border:1px solid var(--mmdx-border);border-radius:14px;box-shadow:var(--mmdx-shadow);}'], { ui: a.ui });
  const all = exampleHistory(a.example);
  // change counts against the version before; the newest three are "computing" until a moment later
  const counts = new Map<string, VersionCounts | null>();
  const fill = (from: number): void => {
    all.forEach((v, i) => {
      if (i < from) return;
      const older = all[i + 1];
      counts.set(v.id, older ? diffDiagrams(older.source, v.source).counts : null);
    });
  };
  fill(3);
  let shown = a.hasMore ? Math.min(3, all.length) : all.length;
  const state = { base: all[1]?.id ?? null, head: all[0]?.id ?? null, viewing: all[0]?.id ?? null };
  const props = () => ({ versions: all.slice(0, shown), hasMore: shown < all.length, ...state });
  const vl = createVersionList({
    ...props(), counts: (id) => counts.get(id), mode: a.mode, locale: 'en', t: createI18n().t, part: 'history',
    onPick: (side, id) => {
      if (side === 'before') state.base = id;
      else state.head = id;
      vl.update(props());
    },
    onRow: (id) => {
      if (a.mode === 'history') state.viewing = id;
      else {
        const i = all.findIndex((v) => v.id === id);
        state.head = id;
        state.base = all[i + 1]?.id ?? state.base;
      }
      vl.update(props());
    },
    onMore: () => {
      shown = all.length;
      vl.update(props());
    },
  });
  setTimeout(() => {
    fill(0);
    vl.update({});
  }, 800);
  const card = document.createElement('div');
  card.className = 'card';
  card.append(vl.el);
  root.append(card);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/VersionList',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Version rows of a history: message, id, the "current" tag, author and relative age, change counts against the version ' +
          'before as coloured badges (a skeleton while they are computed). Compare mode adds Before / After picks (one version ' +
          'cannot be both); History mode marks the viewed version. Arrow keys move between rows, to the same control.',
      },
    },
  },
  render: (a) => versionList(a),
  argTypes: {
    example: { control: 'select', options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'fusion-services', 'microservice-patterns', 'simple-flow'] },
    mode: { control: 'inline-radio', options: ['compare', 'history'] },
    hasMore: { control: 'boolean', description: 'Start with three versions and a "Load older versions" button.' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { example: 'production-microservices', mode: 'compare', hasMore: false, ui: 'light' },
};
export default meta;

type Story = StoryObj<Args>;

export const Compare: Story = {};
export const History: Story = { args: { mode: 'history' } };
export const LoadMore: Story = { name: 'Load more', args: { hasMore: true } };
export const Dark: Story = { args: { ui: 'dark' } };
