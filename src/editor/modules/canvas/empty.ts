// Empty-diagram states (A.2 row 24): the "Start a diagram" chooser while the Mermaid code is empty (the chosen type
// is written as the first line; theme, layout settings and comments stay) and the "Drag shapes…" hint over the page
// of a diagram without items. Ported from prototype index.html `#typeChooser` / `#emptyHint` and app.js
// (`typeChooser` click handler, `placeEmptyHint`, `centerView`).
import { startDiagram } from '../../../core/ops/index.js';
import { DIAGRAM_TYPES } from '../../../core/kinds/info.js';
import { kindUi } from '../../../ui/diagram/kind-ui.js';
import type { DiagramType } from '../../../core/types.js';
import { h, s } from '../../../ui/kit/h.js';
import { createStatusBox, STATUS_BOX_CSS } from '../../../ui/blocks/status-box.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';

const EMPTY_CSS = /* css */ `
.empty-hint { position: absolute; left: 0; top: 0; display: grid; place-items: center; color: var(--muted); font-size: 15px; pointer-events: none;
  padding: 0 24px; box-sizing: border-box; text-align: center; overflow: hidden; line-height: 1.4; z-index: 2; }
.type-chooser { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 15; text-align: center; padding: 24px 26px;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 18px; box-shadow: 0 12px 40px rgba(20,30,60,.16); }
.tc-title { font-size: 18px; font-weight: 700; }
.tc-sub { color: var(--muted); margin: 4px 0 18px; }
.tc-cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 900px; }
.tc-card { width: 168px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px; border: 1px solid var(--line);
  border-radius: 14px; background: var(--surface); color: var(--ink); cursor: pointer; }
.tc-card svg { color: var(--accent); margin-bottom: 4px; }
.tc-card b { font-size: 14px; }
.tc-card span { font-size: 12px; color: var(--muted); line-height: 1.35; }
.tc-card:hover, .tc-card:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-2); }
`;

/** The chooser's cards: every registered type (a kind plugin's too), with its name and one line about it. */
const cards = (): [DiagramType, string, string][] => DIAGRAM_TYPES.map((t) => [t, kindUi(t).names.name, kindUi(t).names.blurb]);

const pictogram = (t: DiagramType): SVGElement =>
  s('svg', { viewBox: '0 0 96 64', width: '96', height: '64', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...(kindUi(t).card ?? []).map(([tag, attrs]) => s(tag, attrs)));

/** No diagram at all (empty Mermaid, or only comments): offer the diagram types instead of an error. */
const isBlank = (core: EditorCore): boolean => !core.model.type && !core.code.split('\n').some((l) => l.trim() && !l.trim().startsWith('%%'));

/** Centres the page in the free part of the canvas at zoom `k` at most (a new diagram is not blown up). */
function centerView(core: EditorCore, k = 1): void {
  const b = core.result.result.bounds;
  const r = core.canvasRect();
  if (!r.width || !b.w || !b.h) return;
  // the open panel stacks (the shell's `--inset-l` / `--inset-r`)
  const stacks = core.stackInsets.peek();
  const x0 = (stacks?.left ?? 0) + 64;
  const w = Math.max(48, r.width - x0 - (stacks?.right ?? 0));
  const kk = Math.min(k, (w - 48) / b.w, (r.height - 120) / b.h);
  core.viewport.auto = false;
  core.viewport.set({ k: kk, tx: x0 + (w - b.w * kk) / 2 - b.x * kk, ty: (r.height - b.h * kk) / 2 - b.y * kk });
}

export const canvasEmptyModule: EditorModule = {
  id: 'canvas-empty',
  css: [STATUS_BOX_CSS, EMPTY_CSS],
  install(scope) {
    const core = scope.core;
    // the "nothing to show" of a diagram without items is the StatusBox block's (A5), placed over the page
    const status = createStatusBox({ kind: null });
    const hint = h('div', { class: 'empty-hint edit-only', hidden: true }, status.el);
    scope.onDispose(() => status.destroy());
    const chooser = h('div', { class: 'type-chooser edit-only', role: 'dialog', 'aria-label': 'Start a diagram', hidden: true },
      h('div', { class: 'tc-title' }, 'Start a diagram'),
      h('div', { class: 'tc-sub' }, 'The Mermaid code is empty — pick a diagram type to edit it visually.'),
      h('div', { class: 'tc-cards' }, ...cards().map(([t, title, sub]) =>
        h('button', { type: 'button', class: 'tc-card', dataset: { start: t } }, pictogram(t), h('b', null, title), h('span', null, sub)))));
    chooser.addEventListener('click', (ev) => {
      const b = ev.target instanceof Element ? ev.target.closest('[data-start]') : null;
      const t = b?.getAttribute('data-start') as DiagramType | null | undefined;
      if (!t || core.model.type || core.mode.peek() !== 'edit') return; // only while there is no diagram
      if (!core.applyCode(startDiagram(core.code, t), 'Start diagram', { select: [] })) return;
      centerView(core, 1);
      core.fire('model');
      core.toast('Add shapes from the Shapes menu — or type Mermaid on the left');
    });
    chooser.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    scope.mount(core.overlayHost, hint);
    scope.mount(core.overlayHost, chooser);

    // The hint is centred on the page, as wide as the page allows.
    const placeHint = (): void => {
      if (hint.hidden) return;
      const r = core.pageRect(), wr = core.overlayHost.getBoundingClientRect();
      if (!r?.width) {
        Object.assign(hint.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
        return;
      }
      Object.assign(hint.style, { left: `${r.left - wr.left}px`, top: `${r.top - wr.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const sync = (): void => {
      chooser.hidden = !isBlank(core);
      hint.hidden = !core.model.type || !core.isEmptyDiagram();
      status.update(hint.hidden ? { kind: null } : { kind: 'empty', text: 'Drag shapes from the toolbar on the left onto the canvas' });
      placeHint();
    };
    scope.on('draw', sync);
    scope.on('view', placeHint);
    scope.on('mode', sync);
    sync();
  },
};
