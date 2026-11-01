import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { instanceContext } from '../../src/config.js';
import { renderSource } from '../../src/core/pipeline.js';
import { pageScene } from '../../src/core/render/page.js';
import { CANVAS_CSS, DiagramCanvas } from '../../src/dom/canvas.js';
import { StrokeStore } from '../../src/dom/pen.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { chromeHost, example, uiArg } from '../support.js';

type CanvasArgs = { example: string; ui: 'light' | 'dark'; interaction: 'pan-zoom' | 'static'; pen: boolean };

const CSS = `${CANVAS_CSS}
.row { display: flex; gap: 12px; height: 420px; }
.cv { position: relative; flex: 1; border-radius: 10px; overflow: hidden; background: var(--mmdx-surface); box-shadow: var(--mmdx-shadow); }
.cv svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; user-select: none; }
.hint { font: 12px var(--mmdx-font); color: var(--mmdx-muted); margin-top: 8px; }`;

/** One or two DiagramCanvas instances drawing an example; side by side they share pan / zoom and the pen's strokes. */
function canvases(a: CanvasArgs, count: 1 | 2): HTMLElement {
  const { host, root } = chromeHost([CSS], { ui: a.ui });
  const ctx = instanceContext();
  const r = renderSource(example(a.example), ctx, { theme: a.ui === 'dark' ? 'default-dark' : 'default-light' });
  const row = document.createElement('div');
  row.className = 'row';
  const store = new StrokeStore(memoryStorage());
  store.setActive(a.pen);
  const list: DiagramCanvas[] = [];
  for (let i = 0; i < count; i++) {
    const box = document.createElement('div');
    box.className = 'cv';
    row.append(box);
    const c = new DiagramCanvas(box, { interaction: a.interaction, wheel: 'always', panOnDrag: true });
    c.show({ defs: r.result.defs, page: pageScene(r.result, r.rctx), body: r.result.body });
    c.attachInk(store);
    list.push(c);
  }
  if (list[0] && list[1]) list[0].link(list[1]);
  root.append(row);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = a.pen ? 'Draw on either canvas: the strokes show in both.' : 'Drag to pan, ⌘ / Ctrl + wheel to zoom; side by side, both follow.';
  root.append(hint);
  // fit once laid out
  requestAnimationFrame(() => list.forEach((c) => c.setBounds(r.result.bounds, { fit: true })));
  return host;
}

const meta: Meta<CanvasArgs> = {
  title: 'Canvas/DiagramCanvas',
  args: { example: 'simple-flow', ui: 'light', interaction: 'pan-zoom', pen: false },
  argTypes: {
    example: { control: 'select', options: ['simple-flow', 'production-microservices', 'docker-deploy-sequence', 'atom-schema-er'] },
    ui: { ...uiArg, options: ['light', 'dark'] },
    interaction: { control: 'inline-radio', options: ['pan-zoom', 'static'] },
    pen: { control: 'boolean', description: 'The magic pen draws on the canvases (one stroke store).' },
  },
};
export default meta;

type Story = StoryObj<CanvasArgs>;

/** One canvas: keyed patching, pan / zoom or a static fit through the viewBox. */
export const Single: Story = { render: (a) => canvases(a, 1) };

/** Two linked canvases (the diff's side by side): shared pan / zoom and pen strokes. */
export const Linked: Story = { render: (a) => canvases(a, 2), args: { pen: true } };
