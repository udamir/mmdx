// Text popovers: the text format (bold, italic, underline, strike), the text position (alignment, vertical alignment,
// word wrap), the font, the link and the text colour.
import { FONTS } from '../../fonts.js';
import { h } from '../../h.js';
import { formatKeys } from '../../shortcuts.js';
import { popLabel } from '../../toolbar-kit.js';
import { str } from '../controls.js';
import { svgIcon } from '../icons.js';
import { colors, type Fill } from './common.js';

const FORMATS = [['b', 'boldGlyph', 'tb.bold', 'mod+b'], ['i', 'italic', 'tb.italic', 'mod+i'], ['u', 'underline', 'tb.underline', 'mod+u'], ['s', 'strike', 'tb.strike', 'mod+shift+x']] as const;

/** Bold, italic, underline and strike: of the selected words while the text is edited, else of the whole label. */
export function formatPop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  const cur = api.textFormats?.();
  const row = h('div', { class: 'mtb-align', role: 'group', 'aria-label': t('tb.format') });
  for (const [k, icon, label, keys] of FORMATS) {
    const on = !!cur?.[k];
    const title = `${t(label)} (${formatKeys(keys)})`;
    const b = h('button', { type: 'button', class: 'mtb-choice' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(on), dataset: { f: k } }, svgIcon(icon));
    b.addEventListener('click', () => {
      api.textFormat?.(k);
      f.again();
    });
    row.append(b);
  }
  pop.classList.add('narrow');
  pop.append(row);
}

export function alignPop(f: Fill): void {
  const { pop, x, done } = f;
  const { t, api } = x;
  const row = (key: string, values: readonly string[], def: string): HTMLElement => {
    const r = h('div', { class: 'mtb-align', role: 'group' });
    const cur = str(api.eff(key)) || def;
    for (const v of values) {
      const title = key === 'align' ? t('tb.alignH', { v: t(`tb.pos.${v}`) }) : t('tb.alignV', { v: t(`tb.pos.${v}`) });
      const b = h('button', { type: 'button', class: 'mtb-choice' + (v === cur ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(v === cur) },
        svgIcon(v === 'middle' ? 'vmiddle' : v === 'top' ? 'vtop' : v === 'bottom' ? 'vbottom' : v));
      b.addEventListener('click', () => {
        api.set(key, v === def ? undefined : v);
        done();
      });
      r.append(b);
    }
    return r;
  };
  pop.classList.add('narrow');
  // word wrap: the text breaks into lines that fit the shape's width
  const wrapOn = api.eff('wrap') === true;
  const wrapBtn = h('button', { type: 'button', class: 'mtb-choice mtb-wrap' + (wrapOn ? ' on' : ''), role: 'switch', 'aria-checked': String(wrapOn), title: t('tb.wrapTip') },
    svgIcon('wrap'), h('span', null, t('tb.wrap')));
  wrapBtn.addEventListener('click', () => {
    api.set('wrap', wrapOn ? undefined : true);
    done();
  });
  pop.append(row('align', ['left', 'center', 'right'], 'center'), h('hr', { class: 'mtb-hr' }), row('valign', ['top', 'middle', 'bottom'], 'middle'),
    h('hr', { class: 'mtb-hr' }), wrapBtn);
}

export function fontPop(f: Fill): void {
  const { pop, x, done } = f;
  const { t, api } = x;
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', t('tb.font'));
  const list = h('div', { class: 'mtb-list', role: 'none' });
  const cur = str(api.eff('fontFamily'));
  for (const [v, name0] of FONTS) {
    const text = v === '' ? t('tb.themeFontNamed', { name: api.themeFontName() }) : name0;
    const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(v === cur), class: 'mtb-item' + (v === cur ? ' on' : '') },
      h('span', { style: { fontFamily: v || api.themeFont() } }, text));
    b.addEventListener('click', () => {
      api.set('fontFamily', v || undefined);
      done();
    });
    list.append(b);
  }
  pop.append(list);
}

export function linkPop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  const cur = str(api.eff('link'));
  const inp = h('input', { class: 'mtb-input', type: 'url', placeholder: 'https://…', 'aria-label': t('tb.link') });
  inp.value = cur;
  const save = h('button', { type: 'button', class: 'mtb-btn mtb-ok', title: t('tb.saveLink'), 'aria-label': t('tb.saveLink') }, svgIcon('check'));
  const rm = h('button', { type: 'button', class: 'mtb-btn danger', title: t('tb.removeLink'), 'aria-label': t('tb.removeLink') }, svgIcon('unlink'));
  rm.hidden = !cur;
  const finish = (v: string | undefined): void => {
    api.set('link', v);
    x.close(true);
    x.refresh();
  };
  save.addEventListener('click', () => finish(inp.value.trim() || undefined));
  rm.addEventListener('click', () => finish(undefined));
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') return;
    ev.stopPropagation();
    if (ev.key === 'Enter') save.click();
  });
  pop.append(popLabel(t('tb.linkLabel')), h('div', { class: 'mtb-row' }, inp, save, rm));
  queueMicrotask(() => inp.focus());
}

export function textColorPop(f: Fill): void {
  const { sp, x, done } = f;
  colors(f, x.api.eff(sp.text ?? 'text'), (c) => {
    x.api.set(sp.text ?? 'text', c);
    done();
  }, false);
}
