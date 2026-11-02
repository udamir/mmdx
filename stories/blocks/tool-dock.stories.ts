import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../../src/dom/pen.js';
import { createIconButton } from '../../src/ui/blocks/button.js';
import { createPenOptions, PEN_OPTIONS_CSS, type PenSettings } from '../../src/ui/blocks/pen-options.js';
import { createToolDock, dockBadge, dockButton, TOOL_DOCK_CSS } from '../../src/ui/blocks/tool-dock.js';
import { createI18n, registerMessages } from '../../src/ui/i18n.js';
import { ICONS } from '../../src/ui/icons.js';
import { EDITOR_MESSAGES } from '../../src/ui/messages/editor.js';
import { computed, signal } from '../../src/ui/signal.js';
import { chromeHost, SYSTEM_UI } from '../support.js';

type Args = { ui: 'light' | 'dark'; compact: boolean; issues: number; canUndo: boolean };

/** The dock over a stand-in canvas: tools are exclusive, panels toggle, the pen opens its options flyout. */
function toolDock(a: Args): HTMLElement {
  registerMessages(EDITOR_MESSAGES);
  const { t } = createI18n();
  const { host, root } = chromeHost([TOOL_DOCK_CSS, PEN_OPTIONS_CSS, '.stage{position:relative;height:520px;border-radius:12px;background:var(--mmdx-surface-2);}'], { ui: a.ui });
  const stage = document.createElement('div');
  stage.className = 'stage';
  root.append(stage);

  const tool = signal<'pointer' | 'hand' | 'pen'>('pointer');
  const panels = { code: signal(true), props: signal(false), layers: signal(false) };
  const ink = { color: PEN_COLORS[0] as string, size: PEN_SIZES[1] as number, fade: PEN_FADES[0] as number };
  const pen: PenSettings = {
    get color() { return ink.color; },
    get size() { return ink.size; },
    get fade() { return ink.fade; },
    setColor: (c) => void (ink.color = c),
    setSize: (s) => void (ink.size = s),
    setFade: (ms) => void (ink.fade = ms),
    clear: () => undefined,
  };
  const penOpts = createPenOptions({ pen, t });

  const toolBtn = (id: 'pointer' | 'hand' | 'pen', label: string, keys: string): HTMLButtonElement =>
    dockButton({ icon: ICONS[id], label, keys, f: id, pressed: computed(() => tool() === id), onClick: () => {
      tool.set(id);
      dock.setFlyout(id === 'pen' ? penOpts.el : null);
    } }).el;
  const panelBtn = (id: keyof typeof panels, icon: string, label: string, keys: string, cls: string): HTMLButtonElement =>
    dockButton({ icon, label, keys, f: id, class: cls, pressed: panels[id], onClick: () => panels[id].set(!panels[id].peek()) }).el;
  const code = panelBtn('code', ICONS.code, t('tools.code'), 'c', 'vt-code');
  dockBadge(code, a.issues);
  const undo = createIconButton({ icon: ICONS.undo, label: t('tools.undo'), keys: 'mod+z', iconSize: 19, disabled: !a.canUndo });
  const redo = createIconButton({ icon: ICONS.redo, label: t('tools.redo'), keys: 'mod+shift+z', iconSize: 19, disabled: true });

  const dock = createToolDock({
    label: t('tools.title'),
    compact: a.compact,
    groups: [
      { id: 'tools', items: [
        toolBtn('pointer', t('tools.pointer'), 'v'), toolBtn('hand', t('tools.hand'), 'h'),
        dockButton({ icon: ICONS.shapes, label: t('tools.shapes'), keys: 's', attrs: { 'aria-haspopup': 'menu' } }).el,
        toolBtn('pen', t('tools.pen'), 'p'), 'sep',
        code, panelBtn('props', ICONS.props, t('tools.props'), 'i', 'vt-props'), panelBtn('layers', ICONS.layers, t('tools.layers'), 'l', 'vt-layers'),
      ] },
      { id: 'undo', label: t('tools.history'), items: [undo.el, redo.el] },
    ],
  });
  stage.append(dock.el);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ToolDock',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The tool dock (`createToolDock`): the tools bar (`.view-tools`, sections split by dividers), further cards ' +
          'below it (undo / redo) and the options flyout to the right of the tools. Buttons come from `dockButton`; the ' +
          'Code button shows a problem badge (`dockBadge`). Pick the pen to open the pen options in the flyout.',
      },
    },
  },
  render: (a) => toolDock(a),
  argTypes: {
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
    compact: { control: 'boolean' },
    issues: { control: { type: 'number', min: 0, max: 150 } },
    canUndo: { control: 'boolean' },
  },
  args: { ui: SYSTEM_UI, compact: false, issues: 2, canUndo: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Dark: Story = { args: { ui: 'dark' } };
