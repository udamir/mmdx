// Messages (§5.2): Banner, a one-line status over the canvas, hidden while empty (the diff's "the diagram type changed"
// line). The host places it (the top-center slot, the canvas overlay).
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';

export const MESSAGES_CSS = /* css */ `
.mmdx-banner { max-width: 100%; background: var(--mmdx-warn-bg); color: var(--mmdx-warn); border: 1px solid var(--mmdx-warn-line); border-radius: var(--mmdx-radius); padding: 5px 12px; font-size: 12px; }
.mmdx-banner.tone-info { background: var(--mmdx-accent-2); color: var(--mmdx-text); border-color: transparent; }
.mmdx-banner.tone-error { background: var(--mmdx-danger-bg); color: var(--mmdx-danger); border-color: var(--mmdx-danger); }
`;

// ---- Banner

export interface BannerProps {
  text: Value<string>;
  tone?: 'info' | 'warn' | 'error';
  part?: string;
}

/** Sets or removes the `part` a host passed. */
const setPart = (el: HTMLElement, part: string | undefined): void => {
  if (part) el.setAttribute('part', part);
  else el.removeAttribute('part');
};

export function createBanner(props: BannerProps): BlockHandle<BannerProps> {
  let p = { ...props };
  let fx = new Scope();
  const el = h('div', { role: 'status', hidden: true });
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    el.className = `mmdx-banner tone-${p.tone ?? 'warn'}`;
    setPart(el, p.part);
    const text = p.text;
    fx.effect(() => {
      const s = read(text);
      el.textContent = s;
      el.hidden = !s;
    });
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
      el.remove();
    },
  };
}
