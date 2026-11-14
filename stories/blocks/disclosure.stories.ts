import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createDisclosure, DISCLOSURE_CSS } from '../../src/ui/blocks/disclosure.js';
import { h } from '../../src/ui/kit/h.js';
import { signal } from '../../src/reactive/signal.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; badge: boolean };

const CSS = '.card{width:420px;margin-bottom:6px;border:1px solid var(--mmdx-border);border-radius:10px;background:var(--mmdx-surface);} ' +
  '.mmdx-disclosure-head{border:0;background:none;padding:9px 12px;font-weight:600;} .mmdx-disclosure-body{padding:2px 14px 12px 32px;color:var(--mmdx-text-2);}';

/** The theme editor's cards: a plain open state, and one kept by the host in a signal; the bodies are filled on first open. */
function disclosure(a: Args): HTMLElement {
  const { host, root } = chromeHost([DISCLOSURE_CSS, CSS], { ui: a.ui });
  const open = signal(true);
  const cards = [
    createDisclosure({ title: 'Colour palette', open, onToggle: (v) => open.set(v), class: 'card', badge: a.badge ? '3 changed' : null, fill: (b) => b.append(h('p', null, 'Styles refer to these colours.')) }),
    createDisclosure({ title: 'Appearance, font & page', open: false, class: 'card', fill: (b) => b.append(h('p', null, `Filled when first opened (${new Date().toLocaleTimeString()}).`)) }),
    createDisclosure({ title: 'Node', open: false, class: 'card', badge: a.badge ? '1 changed' : null, fill: (b) => b.append(h('p', null, 'Tiles of the node styles.')) }),
  ];
  root.append(...cards.map((c) => c.el));
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Disclosure',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createDisclosure`: a collapsible section — a head button (`aria-expanded`, `aria-controls`) with a caret, the title ' +
          'and an optional badge, over a body filled the first time it opens. `open` is a plain value (the block keeps it) or a ' +
          'signal the host flips in `onToggle`.',
      },
    },
  },
  render: (a) => disclosure(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, badge: { control: 'boolean' } },
  args: { badge: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Cards: Story = {};
export const NoBadges: Story = { args: { badge: false } };
export const Dark: Story = { args: { ui: 'dark' } };
