// Line popovers: the border of a box and the line of a connector (dash, thickness, opacity, corners, colour), the
// arrow heads, and the routing with its curvature.
import { h } from '../../h.js';
import { choiceRow, popLabel, slider } from '../../toolbar-kit.js';
import { num, str } from '../controls.js';
import { arrowPreview, dashPreview, routingPreview } from '../icons.js';
import { ARROWS, DASHES, ROUTINGS } from '../kinds.js';
import { colors, type Fill } from './common.js';

/** A slider whose release ends one undo step (`api.commit`). */
const step = (f: Fill, label: string, value: number, min: number, max: number, stepBy: number, set: (v: number) => void, fmt: (v: number) => string): HTMLElement =>
  slider({ label, value, min, max, step: stepBy, fmt, onInput: set, onChange: () => f.x.api.commit?.() });

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export function strokePop(f: Fill): void {
  const { pop, x, kind, again, done } = f;
  const { t, api } = x;
  const isLine = f.name === 'line';
  pop.append(choiceRow(DASHES.map((d) => d[0]), str(api.eff('dash')) || 'none', (d) => {
    api.set('dash', d);
    again();
  }, dashPreview, (d) => t(`tb.dash.${DASHES.find((y) => y[0] === d)?.[1] ?? 'solid'}`)));
  const wKey = isLine ? 'width' : 'strokeWidth';
  pop.append(step(f, t('tb.thickness'), num(api.eff(wKey)) ?? 1.5, 0.5, 8, 0.5, (v) => api.set(wKey, v), (v) => `${v}px`));
  pop.append(step(f, t('tb.opacity'), num(api.eff('strokeOpacity')) ?? 1, 0, 1, 0.05, (v) => api.set('strokeOpacity', v >= 1 ? undefined : v), pct));
  if (!isLine && kind !== 'block') pop.append(step(f, t('tb.corners'), num(api.eff('radius')) ?? 0, 0, 40, 1, (v) => api.set('radius', v), (v) => `${v}`));
  const cKey = isLine ? 'color' : 'stroke';
  colors(f, api.eff(cKey), (c) => {
    api.set(cKey, c);
    done();
  }, !isLine);
}

export function arrowsPop(f: Fill): void {
  const { pop, x, kind, again, done } = f;
  const { t, api } = x;
  const name = (a: string): string => t(`tb.arrow.${a}`);
  if (kind === 'message') {
    pop.append(popLabel(t('tb.arrowHead')), choiceRow(['filled', 'open', 'arrow'], str(api.eff('arrow')), (v) => {
      api.set('arrow', v);
      done();
    }, (a) => arrowPreview(a), name));
    return;
  }
  const ends = api.edgeEnds?.() ?? {};
  pop.append(popLabel(t('tb.start')), choiceRow(ARROWS, str(api.eff('startArrow')) || str(ends.start), (v) => {
    api.set('startArrow', v);
    again();
  }, (a) => arrowPreview(a, true), name));
  pop.append(popLabel(t('tb.end')), choiceRow(ARROWS, str(api.eff('endArrow')) || str(ends.end), (v) => {
    api.set('endArrow', v);
    again();
  }, (a) => arrowPreview(a), name));
  const r = h('button', { type: 'button', class: 'link' }, t('tb.mermaidArrows'));
  r.addEventListener('click', () => {
    api.set({ startArrow: undefined, endArrow: undefined });
    again();
  });
  pop.append(r);
}

export function routingPop(f: Fill): void {
  const { pop, x, again } = f;
  const { t, api } = x;
  pop.append(popLabel(t('tb.routing')), choiceRow(ROUTINGS, str(api.eff('routing')), (v) => {
    api.set('routing', v);
    again();
  }, routingPreview, (r) => t(`tb.routing.${r}`)));
  pop.append(step(f, t('tb.curvature'), num(api.eff('curve')) ?? 1, 0, 2, 0.05, (v) => api.set('curve', v), (v) => v.toFixed(2)));
  // back to the automatic line: no bend points, default curvature
  if (!api.resetCurve) return;
  const n = api.bendCount?.() ?? 0;
  const changed = n > 0 || !!api.hasOwnCurve?.();
  const b = h('button', { type: 'button', class: 'mtb-item mtb-reset-curve' }, t('tb.resetCurve'));
  b.disabled = !changed;
  b.title = !changed ? t('tb.resetCurveNone') : n === 1 ? t('tb.resetCurveOne') : n > 1 ? t('tb.resetCurveMany', { n }) : t('tb.resetCurveCurve');
  b.addEventListener('click', () => {
    api.resetCurve?.();
    again();
  });
  pop.append(b);
}
