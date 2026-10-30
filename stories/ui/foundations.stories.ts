import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { icon } from '../../src/ui/h.js';
import { ICONS } from '../../src/ui/icons.js';
import { logoMark } from '../../src/ui/logo.js';
import { shapePreview } from '../../src/ui/shape-preview.js';
import { NODE_SHAPES, PARTICIPANT_SHAPES } from '../../src/ui/style-toolbar.js';
import { Dialogs, DIALOG_CSS } from '../../src/ui/dialog.js';
import { Toaster } from '../../src/ui/popover.js';
import { chromeHost } from '../support.js';

type Args = { ui: 'light' | 'dark'; size: number };

const cell = (label: string, el: Element): HTMLElement => {
  const d = document.createElement('div');
  d.style.cssText = 'display:grid;justify-items:center;gap:6px;padding:10px 4px;border-radius:8px;background:var(--ds-surface);border:1px solid var(--ds-border-2);';
  const cap = document.createElement('code');
  cap.textContent = label;
  cap.style.cssText = 'font:11px ui-monospace,monospace;color:var(--ds-muted);';
  d.append(el, cap);
  return d;
};

const gallery = (cells: HTMLElement[], min = 96): HTMLElement => {
  const g = document.createElement('div');
  g.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${min}px,1fr));gap:8px;`;
  g.append(...cells);
  return g;
};

const heading = (text: string): HTMLElement => {
  const h = document.createElement('h3');
  h.textContent = text;
  h.style.cssText = 'margin:20px 0 8px;font-size:14px;';
  return h;
};

const meta: Meta<Args> = {
  title: 'UI/Foundations',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The chrome building blocks shared by every component: design tokens (`--ds-*`, light and dark), the icon set, ' +
          'the logo, the shape outlines of the shape pickers, in-component dialogs (they replace `confirm()` / `prompt()`) and toasts.',
      },
    },
  },
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] }, size: { control: { type: 'range', min: 12, max: 40 } } },
  args: { ui: 'light', size: 20 },
};
export default meta;

type Story = StoryObj<Args>;

export const Icons: Story = {
  render: (a) => {
    const { host, root } = chromeHost([], { ui: a.ui });
    root.append(gallery(Object.entries(ICONS).map(([name, d]) => cell(name, icon(d, a.size)))));
    return host;
  },
};

export const Shapes: Story = {
  name: 'Shape outlines',
  render: (a) => {
    const { host, root } = chromeHost([], { ui: a.ui });
    root.append(
      heading('Node shapes'), gallery(NODE_SHAPES.map((s) => cell(s, shapePreview(s, a.size * 1.6)))),
      heading('Participant shapes'), gallery(PARTICIPANT_SHAPES.map((s) => cell(s, shapePreview(s, a.size * 1.6)))),
    );
    return host;
  },
};

export const Logo: Story = {
  render: (a) => {
    const { host, root } = chromeHost([':host([data-ui="dark"]) .ds-logo{--logo-ink:#eef0ff;}'], { ui: a.ui });
    root.append(gallery([16, 22, 32, 64, 128].map((h) => cell(`${h}px`, logoMark(h))), 140));
    return host;
  },
};

export const Tokens: Story = {
  name: 'Design tokens',
  render: (a) => {
    const { host, root } = chromeHost([], { ui: a.ui });
    const names = ['accent', 'accent-2', 'bg', 'surface', 'surface-2', 'panel', 'border', 'border-2', 'text', 'text-2', 'muted', 'faint', 'danger', 'danger-bg', 'warn', 'warn-bg', 'ok', 'float', 'float-2'];
    root.append(gallery(names.map((n) => {
      const sw = document.createElement('div');
      sw.style.cssText = `width:56px;height:36px;border-radius:6px;border:1px solid var(--ds-border);background:var(--ds-${n});`;
      return cell(`--ds-${n}`, sw);
    }), 110));
    return host;
  },
};

export const DialogsAndToasts: Story = {
  name: 'Dialogs and toasts',
  render: (a) => {
    const { host, root } = chromeHost([DIALOG_CSS, '.row{display:flex;gap:8px;flex-wrap:wrap;}'], { ui: a.ui });
    const dialogs = new Dialogs(root);
    const toasts = new Toaster(root);
    const out = document.createElement('p');
    const btn = (label: string, fn: () => Promise<unknown> | void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = async () => (out.textContent = `→ ${JSON.stringify(await fn())}`);
      return b;
    };
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      btn('Confirm', () => dialogs.confirm('Discard changes?', 'The diagram has unsaved changes.', { ok: 'Discard', danger: true })),
      btn('Prompt', () => dialogs.prompt('Save preset as', { label: 'Name', value: 'my-style', validate: (v) => (v.trim() ? null : 'A name is required') })),
      btn('Choose', () => dialogs.choose({ title: 'The file changed on disk', message: 'Keep yours or load theirs?', cancel: 'cancel', buttons: [{ label: 'Load theirs', value: 'theirs' }, { label: 'Keep mine', value: 'mine', primary: true }] })),
      btn('Toast', () => toasts.show('Copied style')),
      btn('Error toast', () => toasts.show('Cannot group items from different groups', { error: true })),
    );
    root.append(row, out);
    return host;
  },
};
