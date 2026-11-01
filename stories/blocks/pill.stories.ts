import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { HISTORY_PILL_CSS, I_CLOSE, I_SWAP } from '../../src/diff/history.js';
import { createPill, PILL_CSS } from '../../src/ui/blocks/pill.js';
import { h, icon } from '../../src/ui/h.js';
import { DIFF_TOKENS } from '../../src/ui/styles/diff.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; kind: 'version' | 'compare' | 'remote' };

/** The pills at the top centre of a stand-in canvas, as History and the editor show them; the log shows the clicks. */
function pill(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([DIFF_TOKENS, PILL_CSS, HISTORY_PILL_CSS, '.stage{position:relative;height:240px;border-radius:12px;background:var(--mmdx-surface-2);} .log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);margin-top:8px;}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const log = document.createElement('div');
  log.className = 'log';
  root.append(stage, log);
  const back = { label: 'Back to the current version', keys: 'escape', icon: I_CLOSE, onClick: () => void (log.textContent = 'Back: the current version again') };
  let p;
  if (a.kind === 'remote') {
    const text = signal('Changed by someone else');
    p = createPill({ text, t, label: 'Remote change', class: 'remote', tools: [{ id: 'reload', label: 'Reload', onClick: () => text.set('Reloaded') }], action: { label: 'Keep mine', plain: true, onClick: () => text.set('Kept mine') } });
  } else if (a.kind === 'version') {
    // a version shown as it is: its id
    p = createPill({ text: 'History · e99f0ab', t, label: 'History', content: h('span', { class: 'dx-pill-body' }, h('span', { class: 'dx-version' }, 'History · e99f0ab')), action: back });
  } else {
    // a comparison: Before and After as coloured chips, Swap between them
    const pair = { before: '0cebaf5', after: 'b884333' };
    const before = h('span', { class: 'dx-chip before', title: 'Before' }, pair.before);
    const after = h('span', { class: 'dx-chip after', title: 'After' }, pair.after);
    const swap = h('button', { type: 'button', class: 'dx-swap', title: 'Swap Before and After (X)', 'aria-label': 'Swap Before and After' }, icon(I_SWAP, 16));
    swap.addEventListener('click', () => {
      [pair.before, pair.after] = [pair.after, pair.before];
      before.textContent = pair.before;
      after.textContent = pair.after;
      log.textContent = `Swapped: ${pair.before} → ${pair.after}`;
    });
    p = createPill({ text: `${pair.before} → ${pair.after}`, t, label: 'History', content: h('span', { class: 'dx-pill-body' }, h('span', { class: 'dx-pair' }, before, swap, after)), action: back });
  }
  stage.append(p.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Pill',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The pill (`createPill`): a floating bar at the top centre with a status text (what screen readers hear), optional ' +
          'content and tools, and an action. History shows a version as it is ("History · e99f0ab") or a comparison (Before ' +
          'and After as coloured chips, Swap between them), with × going back to the current version (Esc); the editor ' +
          'shows a remote change with Reload and Keep mine.',
      },
    },
  },
  render: (a) => pill(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, kind: { control: 'inline-radio', options: ['version', 'compare', 'remote'] } },
  args: { ui: 'light', kind: 'version' },
};
export default meta;

type Story = StoryObj<Args>;

export const Version: Story = { name: 'History: a version' };
export const Compare: Story = { name: 'History: a comparison', args: { kind: 'compare' } };
export const RemoteChange: Story = { name: 'Remote change', args: { kind: 'remote' } };
export const Dark: Story = { args: { ui: 'dark', kind: 'compare' } };
