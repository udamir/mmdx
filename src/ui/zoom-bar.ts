// The zoom bar and help popup shared by the editor and the diff (A.2 rows 17, 19, 20): − % + Fit and ?, and the
// help rows generated from a shortcut registry, so both components look and behave the same.
import { h } from './h.js';
import { formatKeys, type Shortcut } from './shortcuts.js';

export const ZOOM_BAR_CSS = /* css */ `
.bottom-bar { position: absolute; right: 12px; bottom: 12px; z-index: 38; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.bottom-bar > * { pointer-events: auto; }
.zoom { display: flex; gap: 4px; align-items: center; background: var(--float); border: 1px solid var(--float-line); border-radius: 8px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.zoom output { min-width: 44px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.zoom button { padding: 2px 8px; background: transparent; border-color: transparent; }
.zoom button:hover:not(:disabled) { background: var(--float-2); border-color: transparent; }
.zoom .help-btn { font-weight: 600; min-width: 26px; }
.zoom .help-btn[aria-expanded=true], .zoom .fs-btn.on { color: var(--accent); }
.zoom .fs-btn { display: grid; place-items: center; padding: 3px 6px; }
.zoom .fs-btn[hidden] { display: none; }
.help-pop.mmdx-pop { right: 12px; bottom: 60px; width: 380px; max-width: calc(100% - 24px); max-height: min(560px, calc(100% - 120px)); display: flex; flex-direction: column;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.18); color: var(--ink); font-size: 12.5px; padding: 0; }
.help-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 6px 14px; }
.help-head b { font-size: 13px; }
.help-head button { border: 0; background: none; font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 6px; color: var(--muted); }
.help-head button:hover { background: var(--float-2); color: var(--ink); }
.help-body { overflow: auto; padding: 0 14px 12px; }
.help-title { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 10px 0 4px; }
.help-row { display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 4px 0; line-height: 1.45; }
.help-row + .help-row { border-top: 1px solid var(--float-line); }
.help-keys { color: var(--muted); font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
.help-keys kbd { font: 11px/1 var(--mmdx-mono); color: var(--ink); background: var(--float-2); border: 1px solid var(--float-line); border-radius: 5px; padding: 2px 5px; white-space: nowrap; }
.help-gesture { color: var(--ink-2); font-size: 11.5px; }
.help-row > span:last-child { min-width: 0; overflow-wrap: anywhere; }
`;

/** The keys of one help row: key caps (alternatives joined by ·), gestures as plain text. */
export function helpKeys(s: Shortcut): HTMLElement {
  const k = h('span', { class: 'help-keys' });
  if (s.hintOnly && s.keys.every((x) => x.length > 12 || /\s/.test(x))) {
    k.append(h('span', { class: 'help-gesture' }, s.keys.join(' · ')));
    return k;
  }
  s.keys.forEach((key, i) => {
    if (i) k.append(' · ');
    k.append(/\s/.test(key) && key.length > 12 ? h('span', { class: 'help-gesture' }, key) : h('kbd', null, formatKeys(key)));
  });
  return k;
}

