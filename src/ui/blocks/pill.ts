// Pill (§5.2, §8.2): the floating bar at the top centre that says where the component is and offers the way back —
// History's "v3 → Working copy" with a swap tool and Back (Esc). The text is a status region, so changes are
// announced; tools are icon buttons between the text and the action.
import { h, icon } from '../h.js';
import { I_chevronLeft } from '../icons.js';
import { ariaKeys, read, Scope, tipText, type BlockHandle, type Translate, type Value } from './block.js';

/** An icon button of the pill, between the text and its action (e.g. swap Before and After). */
export interface PillTool {
  id: string;
  /** Icon path (24 × 24). */
  icon: string;
  label: string;
  keys?: string;
  hidden?: Value<boolean>;
  onClick(): void;
}

export interface PillProps {
  /** What the pill says (a status region, announced on change). */
  text: Value<string>;
  /** Shown instead of the text, which then stays for screen readers only (e.g. coloured version chips). */
  content?: HTMLElement;
  tools?: readonly PillTool[];
  /**
   * The button (Back); `keys` is its shortcut (`escape`), shown in the tooltip. `icon`: an icon-only round button
   * (the label is its accessible name).
   */
  action: { label: string; keys?: string; icon?: string; onClick(): void };
  t: Translate;
  /** Accessible name of the pill (default: `history.open`, "History"). */
  label?: string;
  /** Formats `keys` for the tooltip (default: the registry's `formatKeys`). */
  formatKeys?: (keys: string) => string;
  /** `part` of the pill (default none). */
  part?: string;
}

export const PILL_CSS = /* css */ `
.mmdx-pill { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 33; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 24px);
  padding: 4px 4px 4px 14px; background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 12px; color: var(--mmdx-text);
  box-shadow: var(--mmdx-shadow-float); }
.mmdx-pill-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.mmdx-pill-btn { flex: none; display: flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px 0 6px; border: 0; border-radius: 8px; background: var(--mmdx-float-2); color: var(--mmdx-text); }
.mmdx-pill-btn:hover:not(:disabled) { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.mmdx-pill-btn .mmdx-icon { width: 16px; height: 16px; }
.mmdx-pill-tool { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--mmdx-text); }
.mmdx-pill-tool:hover:not(:disabled) { background: var(--mmdx-float-2); }
.mmdx-pill-tool .mmdx-icon { width: 18px; height: 18px; }
.mmdx-pill.has-content { padding-left: 6px; }
.mmdx-pill-content { display: inline-flex; align-items: center; min-width: 0; }
.mmdx-pill-btn.icon-only { width: 30px; padding: 0; justify-content: center; background: transparent; color: var(--mmdx-muted); }
.mmdx-pill-btn.icon-only:hover:not(:disabled) { background: var(--mmdx-float-2); color: var(--mmdx-text); }
.mmdx-pill-btn.icon-only .mmdx-icon { width: 18px; height: 18px; }
`;

export function createPill(props: PillProps): BlockHandle<PillProps> {
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const text = h('span', { class: 'mmdx-pill-text', role: 'status', 'aria-live': 'polite' });
  const button = h('button', { type: 'button', class: 'mmdx-pill-btn', 'data-f': 'pill-action' });
  const tools = h('span', { class: 'mmdx-pill-tools', style: 'display:contents' });
  const content = h('span', { class: 'mmdx-pill-content' });
  const el = h('div', { class: 'mmdx-pill', role: 'group' }, text, content, tools, button);
  scope.on(button, 'click', () => p.action.onClick());

  const render = (): void => {
    const { action } = p;
    el.setAttribute('aria-label', p.label ?? p.t('history.open'));
    button.replaceChildren(...(action.icon ? [icon(action.icon, 18)] : [icon(I_chevronLeft, 16), h('span', null, action.label)]));
    button.classList.toggle('icon-only', !!action.icon);
    if (action.icon) button.setAttribute('aria-label', action.label);
    else button.removeAttribute('aria-label');
    el.classList.toggle('has-content', !!p.content);
    text.classList.toggle('mmdx-sr', !!p.content);
    content.replaceChildren(...(p.content ? [p.content] : []));
    content.hidden = !p.content;
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    button.title = tipText(action.label, action.keys, p.formatKeys);
    if (action.keys) button.setAttribute('aria-keyshortcuts', ariaKeys(action.keys));
    else button.removeAttribute('aria-keyshortcuts');
    fx.dispose();
    fx = new Scope();
    const value = p.text;
    fx.effect(() => void (text.textContent = read(value)));
    tools.replaceChildren(...(p.tools ?? []).map((tool) => {
      const tip = tipText(tool.label, tool.keys, p.formatKeys);
      const b = h('button', { type: 'button', class: 'mmdx-pill-tool', title: tip, 'aria-label': tool.label, 'data-f': `pill-${tool.id}`, 'data-tool': tool.id }, icon(tool.icon, 18));
      if (tool.keys) b.setAttribute('aria-keyshortcuts', ariaKeys(tool.keys));
      fx.on(b, 'click', () => tool.onClick());
      const hidden = tool.hidden;
      if (hidden !== undefined) fx.effect(() => void (b.hidden = read(hidden)));
      return b;
    }));
  };
  render();

  return {
    el,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
