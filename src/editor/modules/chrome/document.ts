// Document-level commands (A.1 row 12, A.8 rows 79, 82, 83; prototype app `doExport`, `plainPreview`, `readFiles`,
// `#autoBtn`): export as styled .mmdx (pruned metadata), portable .mmd, SVG and PNG 2× (visible layers and the label
// setting honoured; PNG failures raise `ds-error` and a toast), the Plain Mermaid compare modal, Auto layout and
// opening files (`features.open`: picker and drag-and-drop; `.mmdx`, `.mmd`, `.md` first mermaid block, `.txt`, `.json`
// legacy sidecar). Every export first dispatches a cancelable `ds-export` event ({ kind, name, data }).
import { getShared, renderWithMermaid } from '../../../config.js';
import { toPortableMermaid } from '../../../core/export/portable.js';
import { joinSource, mergeLegacySidecar, pruneMeta } from '../../../core/meta/index.js';
import { usedIds } from '../../../core/ops/ids.js';
import { resetLayout } from '../../../core/ops/meta-ops.js';
import { standaloneSvg } from '../../../core/pipeline.js';
import { download, svgToPng } from '../../../dom/export.js';
import { h } from '../../../ui/h.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { applyMeta } from '../panels/util.js';

export type ExportKind = 'mmdx' | 'mmd' | 'svg' | 'png';

export interface ExportFile {
  name: string;
  data: string | Blob;
  type: string;
}

/** The styled `.mmdx` text: Mermaid + `%%@` lines, metadata of deleted items pruned. */
export const exportMmdx = (core: EditorCore): string =>
  joinSource({ code: core.code, meta: pruneMeta(core.meta, usedIds(core.model)) });

/** Portable Mermaid (`.mmd`): flowchart classDef / linkStyle colours, other types pass through. */
export const exportPortable = (core: EditorCore): string => {
  const r = core.result;
  return toPortableMermaid(core.code, core.meta, core.model, r.theme, r.rctx.color);
};

/** Standalone SVG of what the canvas shows (visible layers, the View-mode label setting). */
export const exportSvg = (core: EditorCore): string => standaloneSvg(core.render(), core.ctx);

/** Builds one export file (no download). PNG may reject (an image or font failed to load). */
export async function buildExport(core: EditorCore, kind: ExportKind): Promise<ExportFile> {
  const name = core.fileName || 'diagram';
  if (kind === 'mmdx') return { name: `${name}.mmdx`, data: exportMmdx(core), type: 'text/plain' };
  if (kind === 'mmd') return { name: `${name}.mmd`, data: exportPortable(core), type: 'text/plain' };
  const svg = exportSvg(core);
  if (kind === 'svg') return { name: `${name}.svg`, data: svg, type: 'image/svg+xml' };
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0), hh = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  const png = await svgToPng(svg, w, hh, { scale: 2, fonts: getShared().fonts });
  if (png.missingFonts.length)
    core.emit('ds-error', { diagnostics: [{ severity: 'warning', code: 'export.font-missing', message: `No font file for ${png.missingFonts.join(', ')}: local fonts were used`, params: { fonts: png.missingFonts.join(', ') } }] });
  return { name: `${name}.png`, data: png.blob, type: 'image/png' };
}

export async function exportAs(core: EditorCore, kind: ExportKind): Promise<void> {
  const t = core.i18n.t;
  if (!core.features.export || !core.features.exportFormats.includes(kind)) return;
  try {
    const file = await buildExport(core, kind);
    if (!core.emit('ds-export', { kind, ...file }, true)) return;
    download(file.name, file.data, file.type);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    core.toast(t('export.failed', { kind: kind.toUpperCase(), msg }), { error: true });
    core.emit('ds-error', { diagnostics: [{ severity: 'error', code: 'export.failed', message: msg, params: { kind } }] });
  }
}

// ---- Plain Mermaid compare (stock Mermaid, strict, portable source) ------------------------------------------------

/**
 * Mermaid's rendered SVG as an element, or null. Mermaid's markup is HTML-flavoured: labels sit in <foreignObject>
 * with void tags such as `<br>` (from `<br/>` in the source), so a strict XML parse (`image/svg+xml`) rejects it.
 * It is parsed as an inert HTML document instead (nothing runs there; the HTML parser puts <svg> in the SVG
 * namespace). Mermaid's strict mode already sanitises; scripts and on* handlers are dropped anyway before the
 * element is shown.
 */
export function parseMermaidSvg(markup: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const svg = doc.querySelector('svg');
  if (!svg) return null;
  svg.querySelectorAll('script').forEach((el) => el.remove());
  for (const el of [svg, ...svg.querySelectorAll('*')])
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  return svg;
}

export async function plainMermaid(core: EditorCore): Promise<void> {
  const t = core.i18n.t;
  const body = h('div', { class: 'mm-body' }, h('div', { class: 'hint' }, t('plain.rendering')));
  const titleId = `mm-${Math.random().toString(36).slice(2, 8)}`;
  const close = h('button', { type: 'button', class: 'mm-close', title: t('plain.close'), 'aria-label': t('plain.close') }, '×');
  const card = h('div', { class: 'ds-dialog mm-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'mm-head' }, h('h2', { id: titleId }, t('plain.title')), close), body);
  const back = h('div', { class: 'ds-dialog-back' }, card);
  const prev = core.dom.shadow.activeElement as HTMLElement | null;
  const done = (): void => {
    back.remove();
    prev?.focus?.();
  };
  close.addEventListener('click', done);
  back.addEventListener('pointerdown', (ev) => {
    if (ev.target === back) done();
  });
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      done();
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      close.focus();
    }
  });
  core.dom.shadow.append(back);
  queueMicrotask(() => close.focus());
  try {
    const dark = (core.dom.shadow.host as HTMLElement).getAttribute('data-ui') === 'dark';
    const out = await renderWithMermaid(exportPortable(core), dark);
    const svg = parseMermaidSvg(out);
    if (!svg) throw new Error(t('plain.badSvg'));
    body.replaceChildren(h('div', { class: 'hint', style: 'margin-bottom:10px' }, t('plain.note')), document.importNode(svg, true));
  } catch (e) {
    body.replaceChildren(h('div', { class: 'mm-err', role: 'alert' }, t('plain.failed', { msg: e instanceof Error ? e.message : String(e) })));
  }
}

// ---- Auto layout --------------------------------------------------------------------------------------------------

export function autoLayout(core: EditorCore): void {
  const t = core.i18n.t;
  if (!applyMeta(core, t('history.autoLayout'), resetLayout(core.meta))) {
    core.toast(t('auto.nothing'));
    return;
  }
  core.viewport.setBounds(core.result.result.bounds, { fit: true });
  core.toast(t('auto.done'));
}

// ---- open files ---------------------------------------------------------------------------------------------------

/** Replaces the document (an undoable step), like the prototype's `setSource` after opening a file. */
export function loadDocument(core: EditorCore, src: string, name?: string): void {
  if (!core.emit('ds-op', { type: 'doc.open', code: src }, true)) return;
  core.store.load(src, { history: 'push', reason: 'load', markSaved: false });
  if (name) core.fileName = name.replace(/\.(mmdx|mmd|md|txt|json)$/i, '') || core.fileName;
  core.enteredGroup.set(null);
  core.pageSelected.set(false);
  core.select([]);
  core.draw();
  core.viewport.setBounds(core.result.result.bounds, { fit: true });
  core.fire('model');
  core.fire('panels');
}

const isJson = (f: File): boolean => /\.json$/i.test(f.name);

export async function openFiles(core: EditorCore, files: FileList | File[]): Promise<void> {
  const t = core.i18n.t;
  const list = Array.from(files);
  const json = list.find(isJson);
  const src = list.find((f) => !isJson(f));
  if (!json && !src) return;
  try {
    let text = src ? await src.text() : null;
    if (text !== null) {
      const md = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(text);
      if (md) text = md[1] ?? '';
    }
    if (json) {
      const merged = mergeLegacySidecar(text ?? core.store.source(), await json.text());
      for (const d of merged.diagnostics) if (d.severity !== 'info') core.toast(d.message, { error: d.severity === 'error' });
      loadDocument(core, joinSource(merged.doc), src?.name);
      core.toast(t('open.layout', { name: json.name }));
    } else if (text !== null) loadDocument(core, text, src?.name);
  } catch (e) {
    core.toast(t('open.failed', { msg: e instanceof Error ? e.message : String(e) }), { error: true });
  }
}

export const DOCUMENT_CSS = /* css */ `
.mm-card { width: min(1200px, calc(100% - 48px)); height: min(860px, calc(100% - 48px)); padding: 0; gap: 0; }
.mm-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--ds-border); }
.mm-head h2 { margin: 0; font-size: 14px; }
.mm-close { border: 0; background: none; font-size: 18px; line-height: 1; color: var(--ds-muted); }
.mm-body { flex: 1; overflow: auto; padding: 16px; min-height: 0; }
.mm-body svg { max-width: 100%; height: auto; }
.mm-err { color: var(--ds-danger); }
.canvas-wrap.drop-target { outline: 2px dashed var(--ds-accent); outline-offset: -8px; }
`;

export const documentModule: EditorModule = {
  id: 'document',
  css: DOCUMENT_CSS,
  install(core) {
    const f = core.features;
    const cleanups: (() => void)[] = [];
    if (f.export) cleanups.push(core.provide('exportAs', (kind) => exportAs(core, kind)));
    if (f.plainMermaid) cleanups.push(core.provide('plainMermaid', () => plainMermaid(core)));
    if (f.autoLayout) cleanups.push(core.provide('autoLayout', () => autoLayout(core)));
    if (f.open) {
      cleanups.push(core.provide('openFiles', (files) => openFiles(core, files)));
      // drag-and-drop onto the canvas
      const ac = new AbortController();
      const wrap = core.dom.wrap;
      const hasFiles = (ev: DragEvent): boolean => !!ev.dataTransfer && Array.from(ev.dataTransfer.types).includes('Files');
      wrap.addEventListener('dragover', (ev) => {
        if (!hasFiles(ev) || core.mode.peek() !== 'edit') return;
        ev.preventDefault();
        wrap.classList.add('drop-target');
      }, { signal: ac.signal });
      wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-target'), { signal: ac.signal });
      wrap.addEventListener('drop', (ev) => {
        wrap.classList.remove('drop-target');
        if (!ev.dataTransfer?.files.length || core.mode.peek() !== 'edit') return;
        ev.preventDefault();
        void openFiles(core, ev.dataTransfer.files);
      }, { signal: ac.signal });
      cleanups.push(() => ac.abort());
    }
    return () => {
      for (const c of cleanups) c();
    };
  },
};
