import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { memoryStorage } from '../../src/adapters/storage.js';
import { createPanelStack, PANEL_STACK_CSS } from '../../src/ui/blocks/panel-stack.js';
import { createSidePanel, SIDE_PANEL_CSS } from '../../src/ui/blocks/side-panel.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal, type Signal } from '../../src/reactive/signal.js';
import { chromeHost } from '../support.js';

type Args = { side: 'left' | 'right'; stageWidth: number; ui: 'light' | 'dark' };

/** Three panels in one stack over a stand-in canvas, with buttons that open and close them. */
function panelStack(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([SIDE_PANEL_CSS, PANEL_STACK_CSS,
    '.stage{position:relative;height:560px;max-width:100%;border-radius:12px;background:var(--mmdx-surface-2);overflow:hidden;}' +
    '.canvas{position:absolute;top:0;bottom:0;display:grid;place-items:center;color:var(--mmdx-muted);font:13px system-ui;}' +
    '.toggles{display:flex;gap:6px;margin-bottom:10px;} .rows{padding:10px 12px;display:flex;flex-direction:column;gap:6px;} .rows div{height:22px;border-radius:6px;background:var(--mmdx-surface-2);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.style.width = `${a.stageWidth}px`;
  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  const rows = (n: number): HTMLElement => {
    const b = document.createElement('div');
    b.className = 'rows';
    for (let i = 0; i < n; i++) b.append(document.createElement('div'));
    return b;
  };
  const toggles = document.createElement('div');
  toggles.className = 'toggles';
  const defs: [string, string, Signal<boolean>, number][] = [['code', 'Mermaid', signal(true), 24], ['history', 'History', signal(true), 14], ['meta', 'Metadata', signal(false), 8]];
  const panels = defs.map(([id, name, open, n]) => {
    const p = createSidePanel({ side: a.side, title: name, label: name, closeLabel: `Close ${name}`, onClose: () => open.set(false), body: rows(n) });
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', () => open.set(!open.peek()));
    toggles.append(b);
    return { id, panel: p.el, open };
  });
  const stack = createPanelStack({
    side: a.side, panels, storage: memoryStorage(), storageKey: 'story.stack', t, container: stage, drawerBelow: 640, label: 'Panels', part: 'panel',
    width: { initial: 320, min: 220, max: () => Math.max(220, stage.getBoundingClientRect().width - 320) },
    onChange: () => inset(),
  });
  // the host's inset: the canvas starts where the stack ends
  const inset = (): void => {
    const w = stack.width();
    canvas.style.left = a.side === 'left' && w ? `${w + 24}px` : '0';
    canvas.style.right = a.side === 'right' && w ? `${w + 24}px` : '0';
    canvas.textContent = `canvas · stack width ${Math.round(w)} px${stack.drawer ? ' · drawer' : ''}`;
  };
  stage.append(canvas, stack.el);
  root.append(toggles, stage);
  requestAnimationFrame(inset);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/PanelStack',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A column of SidePanels (`createPanelStack`): splitters between visible panels (drag, double-click resets, ' +
          'arrow keys), the shared width on the inner edge, collapse when nothing is open, and below `drawerBelow` ' +
          '(640 px here) a drawer over the canvas showing the panel opened last. `width()` gives the host its inset.',
      },
    },
  },
  render: (a) => panelStack(a),
  argTypes: {
    side: { control: 'inline-radio', options: ['left', 'right'] },
    stageWidth: { control: { type: 'range', min: 360, max: 1200, step: 20 } },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { side: 'left', stageWidth: 960 },
};
export default meta;

type Story = StoryObj<Args>;

export const Left: Story = {};
export const Right: Story = { args: { side: 'right' } };
export const Drawer: Story = { args: { stageWidth: 520 } };
export const Dark: Story = { args: { ui: 'dark' } };
