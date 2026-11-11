import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createStatusBox, STATUS_BOX_CSS } from '../../src/ui/blocks/status-box.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; kind: 'loading' | 'empty' | 'error' };

/** What a view says without a picture: loading, nothing to show, a failed load with Retry. */
function statusBox(a: Args): HTMLElement {
  const { host, root } = chromeHost([STATUS_BOX_CSS, '.stage{display:grid;place-items:center;height:200px;border-radius:12px;background:var(--mmdx-surface-2);color:var(--mmdx-muted);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  const text = { loading: 'Loading the history…', empty: 'Nothing to compare', error: 'Could not load the history: offline' }[a.kind];
  const box = createStatusBox({ kind: a.kind, text, retryLabel: 'Retry', onRetry: () => box.update({ kind: 'loading', text: 'Loading the history…' }) });
  stage.append(box.el);
  root.append(stage);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/StatusBox',
  render: statusBox,
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, kind: { control: 'inline-radio', options: ['loading', 'empty', 'error'] } },
  args: { ui: 'light', kind: 'error' },
};
export default meta;

export const Default: StoryObj<Args> = {};
