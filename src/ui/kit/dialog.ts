// In-component dialogs (§8.2): confirmations and name prompts replace the prototype's native confirm() / prompt() /
// alert(), which block the host page and cannot be styled or tested. Modal, focus-trapped, Esc cancels. The button
// labels and the empty-name message go through the host's `t` (English without one).
import { h } from './h.js';
import type { I18n, Messages } from '../../i18n.js';

/** English strings of the dialogs (a host catalog overrides them). */
const DIALOG_MESSAGES: Messages = {
  'dialog.ok': 'OK',
  'dialog.cancel': 'Cancel',
  'dialog.enterName': 'Enter a name',
};

export const DIALOG_CSS = /* css */ `
.mmdx-dialog-back { position: absolute; inset: 0; z-index: calc(var(--mmdx-z-popover) + 10); background: var(--mmdx-backdrop); display: grid; place-items: center; }
.mmdx-dialog { background: var(--mmdx-surface); color: var(--mmdx-text); border: 1px solid var(--mmdx-border); border-radius: 12px; box-shadow: var(--mmdx-shadow-lg); padding: 18px 20px 16px; width: min(440px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 12px; }
.mmdx-dialog h2 { margin: 0; font-size: 15px; }
.mmdx-dialog p { margin: 0; color: var(--mmdx-text-2); white-space: pre-wrap; }
.mmdx-dialog input { width: 100%; padding: 6px 8px; }
.mmdx-dialog .err { color: var(--mmdx-danger); font-size: 12px; min-height: 1em; }
.mmdx-dialog .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
`;

export interface ChoiceButton<T> {
  label: string;
  value: T;
  primary?: boolean;
  danger?: boolean;
}

export class Dialogs {
  private readonly t: I18n['t'];
  /** The open dialogs, each with the way to cancel it. */
  private readonly open = new Set<() => void>();

  /** `t`: the host's translation function (default: the English strings). */
  constructor(private readonly root: ShadowRoot, t?: I18n['t']) {
    // a host catalog wins; keys it does not have fall back to the English table
    this.t = (key) => {
      const v = t?.(key);
      return v && v !== key ? v : DIALOG_MESSAGES[key] ?? key;
    };
  }

  /** Generic modal with buttons; resolves with the chosen value, or `cancel` on Esc / backdrop. `class`: on the card. */
  choose<T>(opts: { title: string; message?: string; buttons: ChoiceButton<T>[]; cancel: T; body?: HTMLElement; class?: string }): Promise<T> {
    return new Promise((resolve) => {
      const prevFocus = this.root.activeElement as HTMLElement | null;
      const done = (v: T, focus = true): void => {
        this.open.delete(cancel);
        back.remove();
        if (focus) prevFocus?.focus?.();
        resolve(v);
      };
      const cancel = (): void => done(opts.cancel, false);
      this.open.add(cancel);
      const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
      const box = h('div', { class: opts.class ? `mmdx-dialog ${opts.class}` : 'mmdx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('h2', { id: titleId }, opts.title),
        opts.message ? h('p', null, opts.message) : null,
        opts.body ?? null,
        h('div', { class: 'actions' }, ...opts.buttons.map((b) =>
          h('button', { type: 'button', class: b.primary ? 'primary' : b.danger ? 'danger' : '', onclick: () => done(b.value) }, b.label))));
      const back = h('div', { class: 'mmdx-dialog-back' }, box);
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

  /** Closes every open dialog, resolving each with its cancel value (the host is going away). */
  destroy(): void {
    for (const cancel of [...this.open]) cancel();
  }

  confirm(title: string, message: string, opts: { ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
    const ok: ChoiceButton<boolean> = { label: opts.ok ?? this.t('dialog.ok'), value: true };
    if (opts.danger) ok.danger = true;
    else ok.primary = true;
    return this.choose({ title, message, cancel: false, buttons: [{ label: opts.cancel ?? this.t('dialog.cancel'), value: false }, ok] });
  }

  /** Name prompt with validation; resolves null when cancelled. */
  prompt(title: string, opts: { label?: string; value?: string; ok?: string; cancel?: string; validate?: (v: string) => string | null } = {}): Promise<string | null> {
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
        buttons: [{ label: opts.cancel ?? this.t('dialog.cancel'), value: 'cancel' }, { label: opts.ok ?? this.t('dialog.ok'), value: 'ok', primary: true }],
      });
      // Enter / OK: validate first; an invalid name keeps the dialog open
      const okBtn = (): HTMLButtonElement | null => body.parentElement?.querySelector('button.primary') ?? null;
      const check = (): boolean => {
        const msg = opts.validate?.(input.value.trim()) ?? (input.value.trim() ? null : this.t('dialog.enterName'));
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
