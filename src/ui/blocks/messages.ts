// Messages (§5.2): Banner (a one-line status over the canvas, hidden while empty), ErrorCard (why a diagram cannot be
// shown: the diagnostics, the numbered source with the bad lines marked, Copy source) and EmptyState (a muted line,
// optionally with an action). Replace the diff's `.banner` and `.msg` texts (elements/diff.ts) and the viewer's
// `showError` panel (elements/viewer.ts). The host places them (the top-center slot, the canvas overlay).
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';

export const MESSAGES_CSS = /* css */ `
.mmdx-banner { max-width: 100%; background: var(--mmdx-warn-bg); color: var(--mmdx-warn); border: 1px solid var(--mmdx-warn-line); border-radius: var(--mmdx-radius); padding: 5px 12px; font-size: 12px; }
.mmdx-banner.tone-info { background: var(--mmdx-accent-2); color: var(--mmdx-text); border-color: transparent; }
.mmdx-banner.tone-error { background: var(--mmdx-danger-bg); color: var(--mmdx-danger); border-color: var(--mmdx-danger); }
.mmdx-error { max-width: 560px; padding: 12px 14px; background: var(--mmdx-danger-bg); color: var(--mmdx-text); border: 1px solid var(--mmdx-danger); border-radius: var(--mmdx-radius); font-size: 12.5px; }
.mmdx-error h2 { margin: 0 0 6px; font-size: 13px; color: var(--mmdx-danger); }
.mmdx-error ul { margin: 0 0 8px; padding-left: 18px; }
.mmdx-error pre { margin: 0; max-height: 240px; overflow: auto; background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 6px; padding: 8px; font: 12px/1.5 var(--mmdx-mono); white-space: pre; counter-reset: ln; }
.mmdx-error pre span { display: block; }
.mmdx-error pre span::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 2.5em; color: var(--mmdx-faint); text-align: right; margin-right: 1em; user-select: none; }
.mmdx-error pre span.bad { background: var(--mmdx-danger-bg); }
.mmdx-error .actions { margin-top: 8px; }
.mmdx-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 12px; color: var(--mmdx-muted); text-align: center; }
.mmdx-empty p { margin: 0; }
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

// ---- ErrorCard

export interface ErrorCardProps {
  title: string;
  /** Diagnostic texts (the first 20 are listed). */
  diagnostics: readonly string[];
  /** The source shown with line numbers (the first 2000 lines), and copied by Copy source. */
  source?: string;
  /** 0-based lines of the source to mark. */
  badLines?: readonly number[];
  t: Translate;
  part?: string;
}

export function createErrorCard(props: ErrorCardProps): BlockHandle<ErrorCardProps> {
  let p = { ...props };
  let fx = new Scope();
  const el = h('div', { class: 'mmdx-error', role: 'alert' });
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    const t = p.t;
    setPart(el, p.part);
    const src = p.source ?? '';
    const bad = new Set(p.badLines ?? []);
    let copy: HTMLButtonElement | null = null;
    if (src) {
      const b = h('button', { type: 'button' }, t('error.copy'));
      const s = fx.signal;
      b.addEventListener('click', () => {
        void navigator.clipboard?.writeText(src).then(() => {
          if (!s.aborted) b.textContent = t('error.copied');
        }, () => undefined);
      }, { signal: s });
      copy = b;
    }
    el.replaceChildren(
      h('h2', null, p.title),
      h('ul', null, ...p.diagnostics.slice(0, 20).map((d) => h('li', null, d))),
      ...(src ? [h('pre', null, ...src.split('\n').slice(0, 2000).map((l, i) => h('span', { class: bad.has(i) ? 'bad' : '' }, l || ' ')))] : []),
      ...(copy ? [h('div', { class: 'actions' }, copy)] : []),
    );
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

// ---- EmptyState

export interface EmptyStateProps {
  text: Value<string>;
  action?: { label: string; onClick: () => void };
  part?: string;
}

export function createEmptyState(props: EmptyStateProps): BlockHandle<EmptyStateProps> {
  let p = { ...props };
  let fx = new Scope();
  const el = h('div', { class: 'mmdx-empty' });
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    setPart(el, p.part);
    const msg = h('p', null);
    const text = p.text;
    fx.effect(() => void (msg.textContent = read(text)));
    const a = p.action;
    let btn: HTMLButtonElement | null = null;
    if (a) {
      btn = h('button', { type: 'button', 'data-f': 'empty-action' }, a.label);
      btn.addEventListener('click', () => a.onClick(), { signal: fx.signal });
    }
    el.replaceChildren(msg, ...(btn ? [btn] : []));
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
