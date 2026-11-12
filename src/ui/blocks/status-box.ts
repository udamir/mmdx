// StatusBox (A5): what a view says when it has no picture to show — loading, nothing to show, or a failed load with a
// Retry — in one place instead of each product building its own. The element is a wrapper laid out as its content
// (`display: contents`), so the host's container places it; an error is an alert, the rest a status region.
import { h } from '../kit/h.js';
import { defineBlock, type BlockHandle } from './block.js';

export interface StatusBoxProps {
  /** `null`: nothing to say (the box is empty). */
  kind: 'loading' | 'empty' | 'error' | null;
  text?: string;
  /** The Retry button of an error (shown when `onRetry` is given). */
  retryLabel?: string;
  onRetry?: (() => void) | undefined;
}

export type StatusBoxHandle = BlockHandle<StatusBoxProps>;

export const STATUS_BOX_CSS = /* css */ `
.mmdx-status { display: contents; }
.mmdx-status .error { max-width: 560px; padding: 12px 14px; background: var(--mmdx-danger-bg); color: var(--mmdx-text); border: 1px solid var(--mmdx-danger); border-radius: var(--mmdx-radius); }
.mmdx-status .error button { margin-top: 8px; }
`;

export function createStatusBox(props: StatusBoxProps): StatusBoxHandle {
  return defineBlock(props, (p) => {
    const el = h('div', { class: 'mmdx-status' });

    const render = (): void => {
      if (!p.kind) return void el.replaceChildren();
      if (p.kind !== 'error') return void el.replaceChildren(h('div', { role: 'status' }, p.text ?? ''));
      const retry = p.onRetry ? h('button', { type: 'button' }, p.retryLabel ?? 'Retry') : null;
      const onRetry = p.onRetry;
      if (retry && onRetry) retry.addEventListener('click', () => onRetry());
      el.replaceChildren(h('div', { class: 'error', role: 'alert' }, h('div', null, p.text ?? ''), retry));
    };
    return { el, render };
  });
}
