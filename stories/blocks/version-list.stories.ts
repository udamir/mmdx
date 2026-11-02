import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { diffDiagrams } from '../../src/core/diff/all.js';
import { MENU_CSS } from '../../src/ui/blocks/menu.js';
import { createVersionList, VERSION_LIST_CSS, type VersionCounts } from '../../src/ui/blocks/version-list.js';
import { createI18n } from '../../src/ui/i18n.js';
import { PopoverManager } from '../../src/ui/popover.js';
import { DIFF_TOKENS } from '../../src/ui/styles/diff.js';
import { chromeHost, exampleHistory } from '../support.js';

type Args = { example: string; mode: 'compare' | 'history'; timeline: boolean; hasMore: boolean; ui: 'light' | 'dark' };

/** An example history; Before / After picks, rows and "Load more" update the list as the diff would. */
function versionList(a: Args): HTMLElement {
  const { host, root } = chromeHost([DIFF_TOKENS, VERSION_LIST_CSS, MENU_CSS, '.log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);margin-top:8px;} .card{width:400px;max-height:560px;overflow:auto;background:var(--mmdx-surface);border:1px solid var(--mmdx-border);border-radius:14px;box-shadow:var(--mmdx-shadow);}'], { ui: a.ui });
  const all = exampleHistory(a.example);
  const log = Object.assign(document.createElement('div'), { className: 'log' });
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
    // each row's "⋮": Restore (not the current version) and Compare with the previous version, as History has them
    menu: {
      popovers: new PopoverManager(root), within: () => root.host,
      entries: (id, i) => [
        ...(i > 0 ? [{ label: `Restore ${id}`, class: 'restore', run: () => void (log.textContent = `Restore ${id}`) }] : []),
        { label: 'Compare with the previous version', disabled: i === all.length - 1, run: () => void (log.textContent = `Compare ${id} with the previous version`) },
      ],
    },
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
    ...(a.timeline ? {
      timeline: {
        onSwap: () => {
          [state.base, state.head] = [state.head, state.base];
          vl.update(props());
        },
      },
    } : {}),
  });
  setTimeout(() => {
    fill(0);
    vl.update({});
  }, 800);
  const card = document.createElement('div');
  card.className = 'card';
  card.append(vl.el);
  root.append(card, log);
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
          'cannot be both), or a timeline: the pair is a range of dots, a dot moves the nearer end, the pair\'s own dot swaps ' +
          'them; History mode marks the viewed version (in History in place, the current one until another is picked). Each row ' +
          'has a "⋮" menu (here Restore, not for the current version, and Compare with the previous version). Arrow keys ' +
          'move between rows, to the same control.',
      },
    },
  },
  render: (a) => versionList(a),
  argTypes: {
    example: { control: 'select', options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'fusion-services', 'microservice-patterns', 'simple-flow'] },
    mode: { control: 'inline-radio', options: ['compare', 'history'] },
    timeline: { control: 'boolean', description: 'Compare mode as a timeline instead of the Before / After picks.' },
    hasMore: { control: 'boolean', description: 'Start with three versions and a "Load older versions" button.' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { example: 'production-microservices', mode: 'compare', timeline: true, hasMore: false },
};
export default meta;

type Story = StoryObj<Args>;

export const Compare: Story = {};
export const Picks: Story = { name: 'Before / After picks', args: { timeline: false } };
export const History: Story = { args: { mode: 'history' } };
export const LoadMore: Story = { name: 'Load more', args: { hasMore: true } };
export const Dark: Story = { args: { ui: 'dark' } };
