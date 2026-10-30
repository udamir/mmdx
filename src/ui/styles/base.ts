// Chrome design tokens (§10). Every component's shadow root adopts this sheet first; hosts restyle through the
// `--ds-*` custom properties on the element and through `::part()`. `ui="light|dark|auto"` on the host picks the
// scheme (`auto` follows `data-theme` on <html> via the element, or prefers-color-scheme).

export const TOKENS = /* css */ `
:host {
  --ds-font: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif;
  --ds-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  --ds-accent: #4f46e5; --ds-accent-2: #eef0ff; --ds-on-accent: #fff;
  --ds-bg: #eef0f3; --ds-surface: #ffffff; --ds-surface-2: #f2f3f7; --ds-panel: #ffffff;
  --ds-border: #dde1e7; --ds-border-2: #eceef2;
  --ds-text: #1d2330; --ds-text-2: #3a4152; --ds-muted: #6b7385; --ds-faint: #b0b6c3; --ds-dots: #cfd4dc;
  --ds-danger: #c62828; --ds-danger-bg: #fdecec; --ds-warn: #8a5a00; --ds-warn-bg: #fff7e6; --ds-warn-line: #ffe2a8;
  --ds-ok: #1d8a3c;
  --ds-float: #ffffff; --ds-float-2: #f2f3f7; --ds-float-line: rgba(0,0,0,.06);
  --ds-radius: 8px; --ds-radius-sm: 6px;
  --ds-shadow: 0 2px 8px rgba(0,0,0,.08); --ds-shadow-lg: 0 8px 28px rgba(0,0,0,.16);
  --ds-z-popover: 1000;
  --ds-focus: 0 0 0 2px var(--ds-accent);
  color-scheme: light;
  font: 13px/1.4 var(--ds-font);
  color: var(--ds-text);
}
:host([data-ui="dark"]) {
  color-scheme: dark;
  --ds-accent: #7c74ff; --ds-accent-2: #2e2b5c;
  --ds-bg: #121418; --ds-surface: #1f232a; --ds-surface-2: #282d36; --ds-panel: #1b1e24;
  --ds-border: #333945; --ds-border-2: #2a2f38;
  --ds-text: #e6e8ee; --ds-text-2: #bcc2cf; --ds-muted: #929aab; --ds-faint: #646c7c; --ds-dots: #2a2f38;
  --ds-danger: #ff6b6b; --ds-danger-bg: #3a2124; --ds-warn: #f0c36b; --ds-warn-bg: #33290f; --ds-warn-line: #5c4a1a;
  --ds-ok: #5fd38a;
  --ds-float: #353b47; --ds-float-2: #434a58; --ds-float-line: rgba(255,255,255,.1);
  --ds-shadow: 0 2px 8px rgba(0,0,0,.4); --ds-shadow-lg: 0 8px 28px rgba(0,0,0,.5);
}
`;

/**
 * The prototype's chrome variable names, mapped onto the --ds-* tokens, so its component CSS ports with selector
 * changes only and still follows host theming.
 */
export const ALIASES = /* css */ `
:host {
  --bg: var(--ds-bg); --panel: var(--ds-panel); --surface: var(--ds-surface); --surface-2: var(--ds-surface-2);
  --line: var(--ds-border); --line-2: var(--ds-border-2); --ink: var(--ds-text); --ink-2: var(--ds-text-2);
  --muted: var(--ds-muted); --faint: var(--ds-faint); --dots: var(--ds-dots); --accent: var(--ds-accent);
  --accent-2: var(--ds-accent-2); --danger: var(--ds-danger); --danger-bg: var(--ds-danger-bg);
  --warn-ink: var(--ds-warn); --warn-bg: var(--ds-warn-bg); --warn-line: var(--ds-warn-line);
  --float: var(--ds-float); --float-2: var(--ds-float-2); --float-line: var(--ds-float-line);
  --font: var(--ds-font); --toggle-off: var(--ds-faint); --scroll: var(--ds-faint);
  --halo: transparent; --dot-ring: rgba(0,0,0,.15);
}
:host([data-ui="dark"]) { --halo: rgba(255,255,255,.5); --dot-ring: rgba(255,255,255,.35); }
`;

export const BASE = /* css */ `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, select, input, textarea { font: inherit; color: inherit; }
button {
  border: 1px solid var(--ds-border); background: var(--ds-surface); border-radius: var(--ds-radius-sm);
  padding: 4px 10px; cursor: pointer; line-height: 1.3;
}
button:hover:not(:disabled) { border-color: var(--ds-faint); }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: none; box-shadow: var(--ds-focus);
}
button.primary { background: var(--ds-accent); color: var(--ds-on-accent); border-color: var(--ds-accent); }
button.ghost { border-color: transparent; background: transparent; }
button.ghost:hover:not(:disabled) { background: var(--ds-surface-2); border-color: transparent; }
button.on { background: var(--ds-accent-2); color: var(--ds-accent); border-color: transparent; }
button.danger { color: var(--ds-danger); }
select, input[type=text], input[type=number], input[type=search], input:not([type]) {
  border: 1px solid var(--ds-border); border-radius: var(--ds-radius-sm); padding: 3px 6px; background: var(--ds-surface);
}
kbd {
  border: 1px solid var(--ds-border); border-radius: 4px; padding: 0 4px; background: var(--ds-surface-2);
  font: 11px var(--ds-font);
}
.ds-icon { display: block; flex-shrink: 0; }
.ds-float {
  background: var(--ds-float); border: 1px solid var(--ds-float-line); border-radius: var(--ds-radius);
  box-shadow: var(--ds-shadow);
}
.ds-pop {
  position: absolute; z-index: var(--ds-z-popover); background: var(--ds-surface); border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius); box-shadow: var(--ds-shadow-lg); padding: 6px; min-width: 180px;
}
.ds-menu { display: flex; flex-direction: column; }
.ds-menu > button, .ds-menu [role=menuitem], .ds-menu [role=menuitemradio], .ds-menu [role=menuitemcheckbox] {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; padding: 6px 10px;
  background: transparent; border-radius: 5px;
}
.ds-menu > button:hover:not(:disabled), .ds-menu [role^=menuitem]:hover:not(:disabled),
.ds-menu [role^=menuitem]:focus-visible { background: var(--ds-accent-2); box-shadow: none; }
.ds-menu hr { border: 0; border-top: 1px solid var(--ds-border); margin: 4px 0; width: 100%; }
.ds-sect { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ds-muted); padding: 6px 10px 2px; }
.ds-toggle { position: relative; width: 28px; height: 16px; border-radius: 8px; background: var(--ds-faint); border: 0; padding: 0; flex-shrink: 0; }
.ds-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: transform .15s; }
.ds-toggle[aria-checked=true] { background: var(--ds-accent); }
.ds-toggle[aria-checked=true]::after { transform: translateX(12px); }
.ds-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ds-toast-host { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; z-index: calc(var(--ds-z-popover) + 1); pointer-events: none; }
.ds-toast { background: var(--ds-text); color: var(--ds-surface); border-radius: var(--ds-radius); padding: 7px 14px; box-shadow: var(--ds-shadow-lg); max-width: 520px; pointer-events: auto; animation: ds-in .15s ease; }
.ds-toast.error { background: var(--ds-danger); color: #fff; }
@keyframes ds-in { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

const sheetCache = new Map<string, CSSStyleSheet>();

/**
 * Adopts the given CSS into a shadow root through constructable stylesheets (no inline <style> needed under CSP),
 * with a <style nonce> fallback for engines without adoptedStyleSheets.
 */
export function adoptStyles(root: ShadowRoot, css: readonly string[], nonce?: string): void {
  const supported = typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype;
  if (supported) {
    root.adoptedStyleSheets = css.map((c) => {
      let s = sheetCache.get(c);
      if (!s) {
        s = new CSSStyleSheet();
        s.replaceSync(c);
        sheetCache.set(c, s);
      }
      return s;
    });
    return;
  }
  for (const c of css) {
    const el = document.createElement('style');
    if (nonce) el.nonce = nonce;
    el.textContent = c;
    root.append(el);
  }
}

/** Resolves `ui="auto"` against the host page: `data-theme` / `data-ui` on <html>, else the OS preference. */
export function resolveUiScheme(ui: string | null): 'light' | 'dark' {
  if (ui === 'light' || ui === 'dark') return ui;
  const html = typeof document !== 'undefined' ? document.documentElement : null;
  const attr = html?.getAttribute('data-theme') ?? html?.getAttribute('data-ui');
  if (attr === 'dark' || attr === 'light') return attr;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Calls `cb` when the page's colour scheme may have changed (OS preference or <html data-theme>). */
export function watchUiScheme(cb: () => void): () => void {
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener('change', cb);
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(cb) : null;
  if (mo && typeof document !== 'undefined')
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ui'] });
  return () => {
    mq?.removeEventListener('change', cb);
    mo?.disconnect();
  };
}
