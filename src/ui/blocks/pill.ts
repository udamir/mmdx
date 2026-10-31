// Pill (§5.2, §8.2): the floating bar at the top centre that says where the component is and offers the way back —
// History's "v3 → Working copy" with a swap tool and Back (Esc). The text is a status region, so changes are
// announced; tools are icon buttons between the text and the action.
import { h, icon } from '../h.js';
import { ICONS } from '../icons.js';
import { formatKeys as defaultFormat } from '../shortcuts.js';
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
  text: Value<string>;
  tools?: readonly PillTool[];
  /** The button (Back); `keys` is its shortcut (`escape`), shown in the tooltip. */
  action: { label: string; keys?: string; onClick(): void };
  t: Translate;
  /** Accessible name of the pill (default: `history.open`, "History"). */
  label?: string;
  /** Formats `keys` for the tooltip (default: the registry's `formatKeys`). */
  formatKeys?: (keys: string) => string;
}

export const PILL_CSS = /* css */ `
.mmdx-pill { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 33; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 24px);
  padding: 4px 4px 4px 14px; background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 12px; color: var(--mmdx-text);
  box-shadow: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06); }
.mmdx-pill-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.mmdx-pill-btn { flex: none; display: flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px 0 6px; border: 0; border-radius: 8px; background: var(--mmdx-float-2); color: var(--mmdx-text); }
.mmdx-pill-btn:hover:not(:disabled) { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.mmdx-pill-btn .mmdx-icon { width: 16px; height: 16px; }
.mmdx-pill-tool { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--mmdx-text); }
.mmdx-pill-tool:hover:not(:disabled) { background: var(--mmdx-float-2); }
.mmdx-pill-tool .mmdx-icon { width: 18px; height: 18px; }
`;

/** `escape` → `Escape` for `aria-keyshortcuts` (named keys are capitalised there). */
const ariaKey = (keys: string): string => ariaKeys(keys).split('+').map((k) => (k.length > 1 ? k[0]!.toUpperCase() + k.slice(1) : k)).join('+');

export function createPill(props: PillProps): BlockHandle<PillProps> {
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const text = h('span', { class: 'mmdx-pill-text', role: 'status', 'aria-live': 'polite' });
  const button = h('button', { type: 'button', class: 'mmdx-pill-btn', 'data-f': 'pill-action' });
  const tools = h('span', { class: 'mmdx-pill-tools', style: 'display:contents' });
  const el = h('div', { class: 'mmdx-pill', role: 'group' }, text, tools, button);
  scope.on(button, 'click', () => p.action.onClick());

  const render = (): void => {
    const { action } = p;
    el.setAttribute('aria-label', p.label ?? p.t('history.open'));
    button.replaceChildren(icon(ICONS.chevronLeft, 16), h('span', null, action.label));
    button.title = tipText(action.label, action.keys, p.formatKeys ?? defaultFormat);
    if (action.keys) button.setAttribute('aria-keyshortcuts', ariaKey(action.keys));
    else button.removeAttribute('aria-keyshortcuts');
    fx.dispose();
    fx = new Scope();
    const value = p.text;
    fx.effect(() => void (text.textContent = read(value)));
    tools.replaceChildren(...(p.tools ?? []).map((tool) => {
      const tip = tipText(tool.label, tool.keys, p.formatKeys ?? defaultFormat);
      const b = h('button', { type: 'button', class: 'mmdx-pill-tool', title: tip, 'aria-label': tool.label, 'data-f': `pill-${tool.id}`, 'data-tool': tool.id }, icon(tool.icon, 18));
      if (tool.keys) b.setAttribute('aria-keyshortcuts', ariaKey(tool.keys));
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
