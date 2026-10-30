// In-component dialogs (§8.2): confirmations and name prompts replace the prototype's native confirm() / prompt() /
// alert(), which block the host page and cannot be styled or tested. Modal, focus-trapped, Esc cancels.
import { h } from './h.js';

export const DIALOG_CSS = /* css */ `
.ds-dialog-back { position: absolute; inset: 0; z-index: calc(var(--ds-z-popover) + 10); background: rgba(10, 12, 20, .32); display: grid; place-items: center; }
.ds-dialog { background: var(--ds-surface); color: var(--ds-text); border: 1px solid var(--ds-border); border-radius: 12px; box-shadow: var(--ds-shadow-lg); padding: 18px 20px 16px; width: min(440px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 12px; }
.ds-dialog h2 { margin: 0; font-size: 15px; }
.ds-dialog p { margin: 0; color: var(--ds-text-2); white-space: pre-wrap; }
.ds-dialog input { width: 100%; padding: 6px 8px; }
.ds-dialog .err { color: var(--ds-danger); font-size: 12px; min-height: 1em; }
.ds-dialog .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
`;

export interface ChoiceButton<T> {
  label: string;
  value: T;
  primary?: boolean;
  danger?: boolean;
}

export class Dialogs {
  constructor(private readonly root: ShadowRoot) {}

  /** Generic modal with buttons; resolves with the chosen value, or `cancel` on Esc / backdrop. */
  choose<T>(opts: { title: string; message?: string; buttons: ChoiceButton<T>[]; cancel: T; body?: HTMLElement }): Promise<T> {
    return new Promise((resolve) => {
      const prevFocus = this.root.activeElement as HTMLElement | null;
      const done = (v: T): void => {
        back.remove();
        prevFocus?.focus?.();
        resolve(v);
      };
      const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
      const box = h('div', { class: 'ds-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('h2', { id: titleId }, opts.title),
        opts.message ? h('p', null, opts.message) : null,
        opts.body ?? null,
        h('div', { class: 'actions' }, ...opts.buttons.map((b) =>
          h('button', { type: 'button', class: b.primary ? 'primary' : b.danger ? 'danger' : '', onclick: () => done(b.value) }, b.label))));
      const back = h('div', { class: 'ds-dialog-back' }, box);
      back.addEventListener('pointerdown', (ev) => {
        if (ev.target === back) done(opts.cancel);
      });
      box.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          done(opts.cancel);
        } else if (ev.key === 'Tab') {
          const f = Array.from(box.querySelectorAll<HTMLElement>('button, input, select, textarea')).filter((x) => !x.hasAttribute('disabled'));
          if (!f.length) return;
          const i = f.indexOf(this.root.activeElement as HTMLElement);
          const next = ev.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
          ev.preventDefault();
          f[next]!.focus();
        }
      });
      this.root.append(back);
      queueMicrotask(() => (box.querySelector<HTMLElement>('input') ?? box.querySelector<HTMLElement>('button.primary') ?? box.querySelector('button'))?.focus());
    });
  }

  confirm(title: string, message: string, opts: { ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
    const ok: ChoiceButton<boolean> = { label: opts.ok ?? 'OK', value: true };
    if (opts.danger) ok.danger = true;
    else ok.primary = true;
    return this.choose({ title, message, cancel: false, buttons: [{ label: opts.cancel ?? 'Cancel', value: false }, ok] });
  }

  /** Name prompt with validation; resolves null when cancelled. */
  prompt(title: string, opts: { label?: string; value?: string; ok?: string; validate?: (v: string) => string | null } = {}): Promise<string | null> {
    const input = h('input', { type: 'text', value: opts.value ?? '', 'aria-label': opts.label ?? title });
    const err = h('div', { class: 'err', 'aria-live': 'polite' });
    const body = h('div', null, opts.label ? h('label', null, opts.label) : null, input, err);
    let resolveOk: (() => void) | null = null;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        resolveOk?.();
      }
    });
    queueMicrotask(() => input.select());
    return new Promise((resolve) => {
      const p = this.choose<'ok' | 'cancel'>({
        title,
        body,
        cancel: 'cancel',
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: opts.ok ?? 'OK', value: 'ok', primary: true }],
      });
      // Enter / OK: validate first; an invalid name keeps the dialog open
      const okBtn = (): HTMLButtonElement | null => body.parentElement?.querySelector('button.primary') ?? null;
      const check = (): boolean => {
        const msg = opts.validate?.(input.value.trim()) ?? (input.value.trim() ? null : 'Enter a name');
        err.textContent = msg ?? '';
        return !msg;
      };
      queueMicrotask(() => {
        const b = okBtn();
        if (b) b.addEventListener('click', (ev) => {
          if (!check()) {
            ev.stopImmediatePropagation();
            input.focus();
          }
        }, { capture: true });
        resolveOk = () => b?.click();
      });
      void p.then((v) => resolve(v === 'ok' ? input.value.trim() : null));
    });
  }
}
