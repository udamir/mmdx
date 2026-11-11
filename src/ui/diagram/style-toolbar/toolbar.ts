// The style toolbar: a floating, Miro-style context bar shown above the selected element (A.7 rows 58–60; prototype
// toolbar.js). The host (editor canvas, theme editor) supplies a `ToolbarApi` that reads effective styles and writes
// overrides; the toolbar never touches the document itself.
//
// Production changes against the prototype: listeners are scoped to the host's root node (shadow root) and removed by
// destroy(); every string goes through the I18n given in the options; buttons carry names and shortcut hints, menus
// follow the ARIA menu pattern, Esc closes the open popover and returns focus to its button; the bar is one tab stop
// (arrow keys move along it). No markup is built from data: icons are fixed constants, colours go through
// setAttribute / CSSOM. The popover host, sliders, choice rows and colour grids are ui/toolbar-kit.ts's.
import { h } from '../../kit/h.js';
import { createI18n, registerMessages } from '../../../i18n.js';
import { TOOLBAR_MESSAGES } from '../../messages/toolbar.js';
import { TOOLBAR_MEDIA_MESSAGES } from '../../messages/toolbar-media.js';
import { barKeys, createPopHost } from '../../kit/toolbar-kit.js';
import { control, type StyleCtx } from './controls.js';
import { bulkSpec, TOOLBAR_KINDS } from './kinds.js';
import { POPS } from './pops/index.js';
import type { KindSpec, StyleToolbarHandle, StyleToolbarOptions, ToolbarApi, ToolbarControl, ToolbarSelection } from './types.js';

/** `host` must already be in its final root (document or shadow root): outside clicks and Esc are listened for there. */
export function createStyleToolbar(host: HTMLElement, api: ToolbarApi, opts: StyleToolbarOptions = {}): StyleToolbarHandle {
  registerMessages(TOOLBAR_MESSAGES);
  registerMessages(TOOLBAR_MEDIA_MESSAGES);
  const t = (opts.i18n ?? createI18n()).t;
  const bar = h('div', { class: 'mtb', role: 'toolbar', 'aria-label': t('tb.label'), part: 'toolbar' });
  bar.hidden = true;
  host.append(bar);
  const pops = createPopHost({ host, bar, hBounds: () => api.hBounds?.() });
  // while a label's text is edited, the text format controls (and the off ones) keep its focus and selection: they act
  // on the selected words. Any other control takes the focus, which applies the text first.
  bar.addEventListener('pointerdown', (ev) => {
    if (!api.textEditing?.()) return;
    const el = ev.target instanceof Element ? ev.target : null;
    if (el?.closest('[data-c="bold"], .off, :disabled') || (pops.open === 'bold' && el?.closest('.mtb-pop'))) ev.preventDefault();
  }, true);
  const keys = barKeys(bar, '.mtb-seg button, .mtb-seg input');
  let sel: ToolbarSelection | null = null;
  let spec: KindSpec | null = null;
  // several items of one kind: that kind's controls, applied to every one of them
  let bulk = false;
  // the selection counter (a multi-selection, or one the type filter narrowed down)
  let counter = false;
  const bulkSpecs = new Map<KindSpec, KindSpec>();

  const x: StyleCtx = {
    t, api, host, bar, pops,
    sel: () => sel,
    bulk: () => bulk,
    refresh: () => refresh(),
    close: (returnFocus) => pops.close(returnFocus),
    toggle: (name, btn, sp, focusIn = true) => pops.toggle(name, btn, (pop) => fillPop(pop, name, sp), { focusIn, focus: '[role^=menuitem]:not(:disabled), .on, button:not(:disabled), input' }),
    again: (name, sp) => rerenderPop(name, sp),
  };

  function groupsOf(sp: KindSpec): ToolbarControl[][] {
    const gs = sp.groups.map((g) => [...g]);
    if (counter) gs.unshift(['selection']);
    if (opts.reset) gs.push(['reset']);
    return gs;
  }

  function refresh(): void {
    sel = api.selection();
    const n = api.multiCount();
    const types = sel ? api.selectionTypes?.() ?? null : null;
    const kinds = types?.filter((y) => y.selected) ?? [];
    const own = sel ? opts.kinds?.[sel.kind] ?? TOOLBAR_KINDS[sel.kind] ?? null : null;
    bulk = n > 1 && !!own && kinds.length === 1 && kinds[0]!.kind === sel?.kind;
    counter = !!types?.length && (n > 1 || types.some((y) => !y.selected));
    if (bulk && own && sel && !bulkSpecs.has(own)) bulkSpecs.set(own, bulkSpec(sel.kind, own));
    spec = !sel ? null : bulk && own ? bulkSpecs.get(own)! : n > 1 ? TOOLBAR_KINDS['multi']! : own;
    if (!spec || !api.editable()) {
      bar.hidden = true;
      pops.close();
      return;
    }
    const keep = pops.open as ToolbarControl | null;
    // keep keyboard focus on the same control across the rebuild
    const cur = host.getRootNode();
    const focused = cur instanceof ShadowRoot || cur instanceof Document ? cur.activeElement : null;
    const focusedC = focused && bar.contains(focused) && !focused.closest('.mtb-pop') ? focused.closest<HTMLElement>('[data-c]')?.dataset['c'] : undefined;
    bar.replaceChildren(...segments(spec));
    pops.reset();
    bar.hidden = false;
    if (keep) {
      const b = bar.querySelector<HTMLElement>(`[data-c="${keep}"]`);
      if (b) x.toggle(keep, b, spec, false);
    }
    if (focusedC) bar.querySelector<HTMLElement>(`[data-c="${focusedC}"]`)?.focus();
    keys.sync();
    place();
  }

  /** The bar's segments; a segment whose controls all stay off (no api for them) is left out. */
  function segments(sp: KindSpec): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const group of groupsOf(sp)) {
      const seg = h('div', { class: 'mtb-seg', role: 'group' });
      for (const c of group) seg.append(control(c, sp, x));
      if (seg.querySelector('[data-c]')) out.push(seg);
    }
    return out;
  }

  function fillPop(pop: HTMLElement, name: ToolbarControl, sp: KindSpec): void {
    POPS[name]?.({
      pop, name, sp, x, kind: sel?.kind ?? '',
      again: () => rerenderPop(name, sp),
      // single-choice pickers close after a pick
      done: () => {
        pops.close(true);
        refresh();
      },
    });
  }

  // re-fill the open popover and the indicator icons without closing it
  function rerenderPop(name: ToolbarControl, sp: KindSpec): void {
    const pop = pops.pop();
    if (!pop) return;
    pop.replaceChildren();
    fillPop(pop, name, sp);
    bar.querySelectorAll('.mtb-seg').forEach((sg) => sg.remove());
    pop.before(...segments(sp));
    const b = bar.querySelector(`[data-c="${name}"]`);
    b?.classList.add('on');
    b?.setAttribute('aria-expanded', 'true');
    keys.sync();
  }

  // ---- placement above the selection (below it when there is no room; pinned to the top when it is taller)
  function place(): void {
    if (bar.hidden) return;
    const r = api.anchorRect();
    if (!r) {
      bar.style.visibility = 'hidden';
      return;
    }
    bar.style.visibility = '';
    const W = host.clientWidth, bw = bar.offsetWidth, bh = bar.offsetHeight;
    const [lo, hi] = api.hBounds?.() ?? [8, W - 8];
    const left = Math.max(lo, Math.min(hi - bw, r.x + r.w / 2 - bw / 2));
    const H = host.clientHeight;
    let y = r.y - bh - 16;
    if (y < 8) {
      const below = r.y + r.h + 16;
      y = below + bh <= H - 8 ? below : 8; // element taller than the view: pin to the top
    }
    if (r.y + r.h < 0 || (H && r.y > H)) {
      bar.style.visibility = 'hidden';
      return;
    }
    bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
  }

  return {
    refresh,
    place,
    close: (returnFocus) => pops.close(returnFocus),
    hide: () => {
      bar.hidden = true;
      pops.close();
    },
    isOpen: () => pops.open !== null,
    destroy: () => {
      keys.destroy();
      pops.destroy();
      bar.remove();
    },
    el: bar,
  };
}
