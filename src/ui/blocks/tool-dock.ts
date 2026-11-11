// ToolDock (§5.2): the editor's tool dock, left and vertically centred — the tools bar (`.view-tools`, sections
// separated by dividers), further floating cards below it (the undo / redo card, `.vt-undo`), and the options flyout
// to the right of the tools (`.vt-opts`, e.g. the pen options). Replaces the DOM and CSS of
// `editor/modules/chrome/tool-dock.ts` and the diff's `vbar`; the class names are kept so the editor's tests and
// styles still match. The host builds the buttons (`dockButton`) and owns their state.
import { h } from '../kit/h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';
import { createIconButton, type IconButtonHandle, type IconButtonProps } from './button.js';
import { keepFocus } from '../kit/focus.js';
import { createToolbar, type ToolbarHandle, type ToolbarItem } from './toolbar.js';

export interface ToolDockGroup {
  id: string;
  /** Accessible name (the first group defaults to the dock's label). */
  label?: string;
  /** Buttons; `'sep'` draws a divider between sections (first group only). Null entries are skipped. */
  items: readonly (HTMLElement | 'sep' | null)[];
  /** Extra class on the group (e.g. `edit-only`). */
  class?: string;
}

export interface ToolDockProps {
  /** Accessible name of the tools bar. */
  label: string;
  /** `groups[0]` is the tools bar (`.view-tools`); every further group is its own card (`.vt-card.vt-<id>`). */
  groups: readonly ToolDockGroup[];
  /** Shown in the options flyout to the right of the tools; the flyout is hidden while null. */
  flyout?: HTMLElement | null;
  /** The compact preset: 32 px buttons, smaller icons. */
  compact?: Value<boolean>;
  /** `part` of the dock (default `toolbar`). */
  part?: string;
}

export interface ToolDockHandle extends BlockHandle<ToolDockProps> {
  /** The tools bar (`.view-tools`), e.g. to anchor menus opened from it. */
  readonly tools: HTMLElement;
  /** Shows `el` in the options flyout, or hides the flyout. */
  setFlyout(el: HTMLElement | null): void;
}

export const TOOL_DOCK_CSS = /* css */ `
.tool-dock { position: absolute; left: calc(12px + var(--inset-l, 0px)); top: 50%; transform: translateY(-50%); z-index: 31; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.view-tools { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border-radius: 14px;
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); box-shadow: var(--mmdx-shadow-float); }
.vt-tool, .vt-card button { border: 0; background: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 10px; color: var(--mmdx-text); padding: 0; }
.vt-tool .mmdx-icon, .vt-card button .mmdx-icon { width: 24px; height: 24px; }
.vt-tool:hover:not(:disabled), .vt-card button:hover:not(:disabled) { background: var(--mmdx-float-2); }
.vt-tool.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.vt-tool[hidden] { display: none !important; }
.vt-tool:disabled { opacity: .35; }
.vt-divider { width: 30px; height: 1px; background: var(--mmdx-border); margin: 4px 0; flex: none; }
.vt-card { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 14px; background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line);
  box-shadow: var(--mmdx-shadow-float); }
.vt-card button:disabled { opacity: .3; cursor: default; background: none; }
.vt-tool.has-issues { position: relative; }
.vt-tool.has-issues::after { content: attr(data-issues); position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px;
  background: var(--mmdx-danger); color: var(--mmdx-on-danger); font: 700 10px/16px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px var(--mmdx-float); pointer-events: none; }
.vt-opts { position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 5px;
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 10px; box-shadow: var(--mmdx-shadow); }
.vt-opts[hidden] { display: none; }
.tool-dock.compact { gap: 8px; }
.tool-dock.compact .view-tools, .tool-dock.compact .vt-card { padding: 4px; gap: 2px; border-radius: 12px; }
.tool-dock.compact .vt-tool, .tool-dock.compact .vt-card button { width: 32px; height: 32px; border-radius: 8px; }
.tool-dock.compact .vt-tool .mmdx-icon, .tool-dock.compact .vt-card button .mmdx-icon { width: 18px; height: 18px; }
.tool-dock.compact .vt-divider { width: 22px; margin: 3px 0; }
.tool-dock.compact .vt-tool.has-issues::after { top: -2px; right: -2px; }
`;

export interface DockButtonProps extends Omit<IconButtonProps, 'icon' | 'iconSize' | 'tooltip'> {
  icon: string;
}

/** A tool-dock button (`.vt-tool`): 19 px icon, native tooltip with the shortcut formatted for the platform. */
export function dockButton(props: DockButtonProps): IconButtonHandle {
  return createIconButton({ ...props, iconSize: 19, tooltip: 'title', class: ['vt-tool', props.class].filter(Boolean).join(' ') });
}

/** The problem badge on a dock button (`.has-issues`, count from `data-issues`, capped at 99+). */
export function dockBadge(button: HTMLElement, n: number): void {
  button.classList.toggle('has-issues', n > 0);
  button.dataset['issues'] = n > 99 ? '99+' : String(n);
}

export function createToolDock(props: ToolDockProps): ToolDockHandle {
  let p = { ...props };
  const scope = new Scope();
  let compactScope = new Scope();
  const opts = h('div', { class: 'vt-opts', hidden: true });
  const toolbar: ToolbarHandle = createToolbar({ label: p.label, orientation: 'vertical', items: [], class: 'view-tools', tooltip: 'side' });
  let cards: HTMLElement[] = [];
  const el = h('div', { class: 'tool-dock' }, toolbar.el);
  // the dock is not part of the canvas: pointer events stay here
  scope.on(el, 'pointerdown', (ev: PointerEvent) => ev.stopPropagation());

  const toolItems = (): ToolbarItem[] => {
    const items = (p.groups[0]?.items ?? []).map((x) => (x === 'sep' ? h('span', { class: 'vt-divider', 'aria-hidden': 'true' }) : x));
    return [...items, opts];
  };
  const renderFlyout = (): void => {
    const f = p.flyout ?? null;
    opts.replaceChildren(...(f ? [f] : []));
    opts.hidden = !f;
  };
  const renderGroups = (): void => {
    const first = p.groups[0];
    toolbar.update({ label: first?.label ?? p.label, class: ['view-tools', first?.class].filter(Boolean).join(' '), items: toolItems() });
    // the cards follow the tools bar; the bar itself stays in place, so its focus is untouched
    keepFocus(el, () => {
      for (const c of cards) c.remove();
      cards = p.groups.slice(1).map((g) =>
        h('div', { class: ['vt-card', `vt-${g.id}`, g.class].filter(Boolean).join(' '), role: 'group', ...(g.label ? { 'aria-label': g.label } : {}) },
          ...g.items.filter((x): x is HTMLElement => !!x && x !== 'sep')));
      el.append(...cards);
    });
  };
  const renderFrame = (): void => {
    el.setAttribute('part', p.part ?? 'toolbar');
    compactScope.dispose();
    compactScope = new Scope();
    const compact = p.compact;
    if (compact !== undefined) compactScope.effect(() => el.classList.toggle('compact', read(compact)));
  };
  renderFrame();
  renderFlyout();
  renderGroups();

  return {
    el,
    tools: toolbar.el,
    setFlyout(f) {
      p = { ...p, flyout: f };
      renderFlyout();
    },
    update(next) {
      p = { ...p, ...next };
      renderFrame();
      if (next && 'flyout' in next) renderFlyout();
      if (next?.groups || next?.label) renderGroups();
    },
    destroy() {
      compactScope.dispose();
      toolbar.destroy();
      scope.dispose();
      el.remove();
    },
  };
}
