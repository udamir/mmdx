// Chrome design tokens (§10). Every component's shadow root adopts this sheet first; hosts restyle through the
// `--mmdx-*` custom properties on the element and through `::part()`. `ui="light|dark|auto"` on the host picks the
// scheme (`auto` follows `data-theme` on <html> via the element, or prefers-color-scheme).

export const TOKENS = /* css */ `
:host {
  --mmdx-font: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif;
  --mmdx-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  --mmdx-accent: #4f46e5; --mmdx-accent-2: #eef0ff; --mmdx-on-accent: #fff; --mmdx-on-danger: #fff;
  --mmdx-bg: #eef0f3; --mmdx-surface: #ffffff; --mmdx-surface-2: #f2f3f7; --mmdx-panel: #ffffff;
  --mmdx-border: #dde1e7; --mmdx-border-2: #eceef2;
  --mmdx-text: #1d2330; --mmdx-text-2: #3a4152; --mmdx-muted: #6b7385; --mmdx-faint: #b0b6c3; --mmdx-dots: #cfd4dc;
  --mmdx-danger: #c62828; --mmdx-danger-bg: #fdecec; --mmdx-warn: #8a5a00; --mmdx-warn-bg: #fff7e6; --mmdx-warn-line: #ffe2a8;
  --mmdx-ok: #1d8a3c;
  --mmdx-float: #ffffff; --mmdx-float-2: #f2f3f7; --mmdx-float-line: rgba(0,0,0,.06);
  --mmdx-radius: 8px; --mmdx-radius-sm: 6px;
  --mmdx-shadow: 0 2px 8px rgba(0,0,0,.08); --mmdx-shadow-lg: 0 8px 28px rgba(0,0,0,.16);
  --mmdx-shadow-float: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06);
  --mmdx-shadow-card: 0 10px 30px rgba(20,30,60,.16), 0 1px 3px rgba(20,30,60,.08);
  --mmdx-shadow-raised: 0 1px 3px rgba(0,0,0,.18);
  --mmdx-swatch-ring: rgba(0,0,0,.14); --mmdx-backdrop: rgba(10,12,20,.32);
  --mmdx-z-popover: 1000;
  --mmdx-focus: 0 0 0 2px var(--mmdx-accent);
  color-scheme: light;
  font: 13px/1.4 var(--mmdx-font);
  color: var(--mmdx-text);
}
:host([data-ui="dark"]) {
  color-scheme: dark;
  --mmdx-accent: #7c74ff; --mmdx-accent-2: #2e2b5c;
  --mmdx-bg: #121418; --mmdx-surface: #1f232a; --mmdx-surface-2: #282d36; --mmdx-panel: #1b1e24;
  --mmdx-border: #333945; --mmdx-border-2: #2a2f38;
  --mmdx-text: #e6e8ee; --mmdx-text-2: #bcc2cf; --mmdx-muted: #929aab; --mmdx-faint: #646c7c; --mmdx-dots: #2a2f38;
  --mmdx-danger: #ff6b6b; --mmdx-danger-bg: #3a2124; --mmdx-warn: #f0c36b; --mmdx-warn-bg: #33290f; --mmdx-warn-line: #5c4a1a;
  --mmdx-ok: #5fd38a;
  --mmdx-float: #353b47; --mmdx-float-2: #434a58; --mmdx-float-line: rgba(255,255,255,.1);
  --mmdx-shadow: 0 2px 8px rgba(0,0,0,.4); --mmdx-shadow-lg: 0 8px 28px rgba(0,0,0,.5);
}
`;

/**
 * The prototype's chrome variable names, mapped onto the --mmdx-* tokens, so its component CSS ports with selector
 * changes only and still follows host theming.
 */
export const ALIASES = /* css */ `
:host {
  --bg: var(--mmdx-bg); --panel: var(--mmdx-panel); --surface: var(--mmdx-surface); --surface-2: var(--mmdx-surface-2);
  --line: var(--mmdx-border); --line-2: var(--mmdx-border-2); --ink: var(--mmdx-text); --ink-2: var(--mmdx-text-2);
  --muted: var(--mmdx-muted); --faint: var(--mmdx-faint); --dots: var(--mmdx-dots); --accent: var(--mmdx-accent);
  --accent-2: var(--mmdx-accent-2); --danger: var(--mmdx-danger); --danger-bg: var(--mmdx-danger-bg);
  --warn-ink: var(--mmdx-warn); --warn-bg: var(--mmdx-warn-bg); --warn-line: var(--mmdx-warn-line);
  --float: var(--mmdx-float); --float-2: var(--mmdx-float-2); --float-line: var(--mmdx-float-line);
  --font: var(--mmdx-font); --toggle-off: var(--mmdx-faint); --scroll: var(--mmdx-faint);
  --halo: transparent; --dot-ring: rgba(0,0,0,.15);
}
:host([data-ui="dark"]) { --halo: rgba(255,255,255,.5); --dot-ring: rgba(255,255,255,.35); }
`;

export const BASE = /* css */ `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, select, input, textarea { font: inherit; color: inherit; }
button {
  border: 1px solid var(--mmdx-border); background: var(--mmdx-surface); border-radius: var(--mmdx-radius-sm);
  padding: 4px 10px; cursor: pointer; line-height: 1.3;
}
button:hover:not(:disabled) { border-color: var(--mmdx-faint); }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: none; box-shadow: var(--mmdx-focus);
}
button.primary { background: var(--mmdx-accent); color: var(--mmdx-on-accent); border-color: var(--mmdx-accent); }
button.ghost { border-color: transparent; background: transparent; }
button.ghost:hover:not(:disabled) { background: var(--mmdx-surface-2); border-color: transparent; }
button.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); border-color: transparent; }
button.danger { color: var(--mmdx-danger); }
select, input[type=text], input[type=number], input[type=search], input[type=url], input:not([type]) {
  border: 1px solid var(--mmdx-border); border-radius: var(--mmdx-radius-sm); padding: 3px 6px; background: var(--mmdx-surface);
}
kbd {
  border: 1px solid var(--mmdx-border); border-radius: 4px; padding: 0 4px; background: var(--mmdx-surface-2);
  font: 11px var(--mmdx-font);
}
.mmdx-icon { display: block; flex-shrink: 0; }
.mmdx-float {
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: var(--mmdx-radius);
  box-shadow: var(--mmdx-shadow);
}
.mmdx-pop {
  position: absolute; z-index: var(--mmdx-z-popover); background: var(--mmdx-surface); border: 1px solid var(--mmdx-border);
  border-radius: var(--mmdx-radius); box-shadow: var(--mmdx-shadow-lg); padding: 6px; min-width: 180px;
}
.mmdx-menu { display: flex; flex-direction: column; }
.mmdx-menu > button, .mmdx-menu [role=menuitem], .mmdx-menu [role=menuitemradio], .mmdx-menu [role=menuitemcheckbox] {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; padding: 6px 10px;
  background: transparent; border-radius: 5px;
}
.mmdx-menu > button:hover:not(:disabled), .mmdx-menu [role^=menuitem]:hover:not(:disabled),
.mmdx-menu [role^=menuitem]:focus-visible { background: var(--mmdx-accent-2); box-shadow: none; }
.mmdx-menu hr { border: 0; border-top: 1px solid var(--mmdx-border); margin: 4px 0; width: 100%; }
.mmdx-sect { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--mmdx-muted); padding: 6px 10px 2px; }
.mmdx-toggle { position: relative; width: 28px; height: 16px; border-radius: 8px; background: var(--mmdx-faint); border: 0; padding: 0; flex-shrink: 0; }
.mmdx-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--mmdx-on-accent); transition: transform .15s; }
.mmdx-toggle[aria-checked=true] { background: var(--mmdx-accent); }
.mmdx-toggle[aria-checked=true]::after { transform: translateX(12px); }
.mmdx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.mmdx-toast-host { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; z-index: calc(var(--mmdx-z-popover) + 1); pointer-events: none; }
.mmdx-toast { background: var(--mmdx-text); color: var(--mmdx-surface); border-radius: var(--mmdx-radius); padding: 7px 14px; box-shadow: var(--mmdx-shadow-lg); max-width: 520px; pointer-events: auto; animation: mmdx-in .15s ease; }
.mmdx-toast.error { background: var(--mmdx-danger); color: var(--mmdx-on-danger); }
@keyframes mmdx-in { from { opacity: 0; transform: translateY(6px); } }
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
