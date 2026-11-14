// Document-level commands (A.1 row 12, A.8 rows 79, 82, 83; prototype app `doExport`, `plainPreview`, `readFiles`,
// `#autoBtn`): export as styled .mmdx (pruned metadata), portable .mmd, SVG and PNG 2× (visible layers and the label
// setting honoured; PNG failures raise `mmdx-error` and a toast; the portable file says what mmdx-only content it
// leaves out: metadata images and shapes, T10 §4.6), the Plain Mermaid compare modal, Auto layout and
// opening files (`features.open`: picker and drag-and-drop; `.mmdx`, `.mmd`, `.md` first mermaid block, `.txt`, `.json`
// legacy sidecar). Every export first dispatches a cancelable `mmdx-export` event ({ kind, name, data }).
import { fileStem } from '../../../ui/kit/format.js';
import { getShared } from '../../../platform/config.js';
import { renderWithMermaid } from '../../../platform/mermaid.js';
import { mmdxOnlyContent, toPortableMermaid, type MmdxOnly } from '../../../core/export/portable.js';
import { joinSource, pruneMeta } from '../../../core/meta/index.js';
import { usedIds } from '../../../core/ops/ids.js';
import { resetLayout } from '../../../core/ops/positions.js';
import { standaloneSvg } from '../../../core/pipeline-core.js';
import { download, fontsMissing, reportMissingImages, svgToPng } from '../../../dom/export.js';
import { h } from '../../../ui/kit/h.js';
import type { EditorCore } from '../../core.js';
import { isDocumentFile, readDocumentFiles } from '../../lib/files.js';
import type { EditorModule } from '../../module.js';
import { applyMeta } from '../../ops/doc.js';

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
const exportPortable = (core: EditorCore): string => {
  const r = core.result;
  return toPortableMermaid(core.code, core.meta, core.model, r.theme, r.rctx.color);
};

/** "1 image and 2 shapes are mmdx-only and are not in the portable file"; null when the portable file has everything. */
export function mmdxOnlyNote(core: EditorCore, only: MmdxOnly = mmdxOnlyContent(core.meta, core.model)): string | null {
  const t = core.i18n.t;
  const count = (n: number, key: string): string | null => (n ? t(`export.only.${key}${n === 1 ? '1' : 'N'}`, { n }) : null);
  const parts = [count(only.images.length, 'image'), count(only.shapes.length, 'shape')].filter((x): x is string => !!x);
  if (!parts.length) return null;
  const what = parts.length === 2 ? t('export.only.and', { a: parts[0]!, b: parts[1]! }) : parts[0]!;
  return t(only.images.length + only.shapes.length === 1 ? 'export.only1' : 'export.onlyN', { what });
}

/** Standalone SVG of what the canvas shows (visible layers, the View-mode label setting). */
export const exportSvg = (core: EditorCore): string => standaloneSvg(core.render(), core.ctx);

/** Builds one export file (no download). PNG may reject (an image or font failed to load). */
export async function buildExport(core: EditorCore, kind: ExportKind): Promise<ExportFile> {
  // an old version shown (History) exports as itself: its id in the file name
  const v = core.version.peek();
  const name = `${core.fileName || 'diagram'}${v ? `-${v.id}` : ''}`;
  if (kind === 'mmdx') return { name: `${name}.mmdx`, data: exportMmdx(core), type: 'text/plain' };
  if (kind === 'mmd') return { name: `${name}.mmd`, data: exportPortable(core), type: 'text/plain' };
  const svg = exportSvg(core);
  if (kind === 'svg') return { name: `${name}.svg`, data: svg, type: 'image/svg+xml' };
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0), hh = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  const png = await svgToPng(svg, w, hh, { scale: 2, fonts: getShared().fonts });
  if (png.missingFonts.length) core.emit('mmdx-error', { diagnostics: [fontsMissing(png.missingFonts)] });
  if (png.missingImages) reportMissingImages(core, png.missingImages);
  return { name: `${name}.png`, data: png.blob, type: 'image/png' };
}

export async function exportAs(core: EditorCore, kind: ExportKind): Promise<void> {
  const t = core.i18n.t;
  if (!core.features.export || !core.features.exportFormats.includes(kind)) return;
  try {
    const file = await buildExport(core, kind);
    if (!core.emit('mmdx-export', { kind, ...file }, true)) return;
    download(file.name, file.data, file.type);
    const note = kind === 'mmd' ? mmdxOnlyNote(core) : null;
    if (note) core.toast(note);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    core.toast(t('export.failed', { kind: kind.toUpperCase(), msg }), { error: true });
    core.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'export.failed', message: msg, params: { kind } }] });
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

/** Opens the Plain Mermaid dialog (one of the in-component dialogs) and renders into it; resolves once rendered. */
export async function plainMermaid(core: EditorCore): Promise<void> {
  const t = core.i18n.t;
  const body = h('div', { class: 'mm-body' }, h('div', { class: 'hint' }, t('plain.rendering')));
  void core.dialogs.choose({ title: t('plain.title'), class: 'mm-card', body, cancel: null, buttons: [{ label: t('plain.close'), value: null, primary: true }] });
  try {
    const out = await renderWithMermaid(exportPortable(core), core.scheme.peek() === 'dark', core.ctx.icons);
    const svg = parseMermaidSvg(out);
    if (!svg) throw new Error(t('plain.badSvg'));
    // what the portable source leaves out (metadata images and shapes), under the note
    const note = mmdxOnlyNote(core);
    body.replaceChildren(
      h('div', { class: 'hint', style: 'margin-bottom:10px' }, t('plain.note')),
      ...(note ? [h('div', { class: 'hint mm-only', style: 'margin-bottom:10px' }, note)] : []),
      document.importNode(svg, true),
    );
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
function loadDocument(core: EditorCore, src: string, name?: string): void {
  if (!core.emit('mmdx-op', { type: 'doc.open', code: src }, true)) return;
  if (name) core.uiState.fileName.set(fileStem(name, core.fileName));
  core.loadSource(src, { history: 'push', reason: 'load', markSaved: false });
  core.select([]);
}

export async function openFiles(core: EditorCore, files: FileList | File[]): Promise<void> {
  const t = core.i18n.t;
  try {
    const read = await readDocumentFiles(files, () => core.store.source());
    if (!read) return;
    for (const d of read.sidecar?.diagnostics ?? []) if (d.severity !== 'info') core.toast(d.message, { error: d.severity === 'error' });
    loadDocument(core, read.source, read.name);
    if (read.sidecar) core.toast(t('open.layout', { name: read.sidecar.name }));
  } catch (e) {
    core.toast(t('open.failed', { msg: e instanceof Error ? e.message : String(e) }), { error: true });
  }
}

const DOCUMENT_CSS = /* css */ `
.mmdx-dialog.mm-card { width: min(1200px, calc(100% - 48px)); height: min(860px, calc(100% - 48px)); }
.mm-body { flex: 1; overflow: auto; min-height: 0; }
.mm-body svg { max-width: 100%; height: auto; }
.mm-err { color: var(--mmdx-danger); }
.canvas-wrap.drop-target { outline: 2px dashed var(--mmdx-accent); outline-offset: -8px; }
`;

export const documentModule: EditorModule = {
  id: 'document',
  css: [DOCUMENT_CSS],
  install(scope) {
    const core = scope.core;
    const f = core.features;
    if (f.export) scope.onDispose(core.provide('exportAs', (kind) => exportAs(core, kind)));
    if (f.plainMermaid) scope.onDispose(core.provide('plainMermaid', () => plainMermaid(core)));
    if (f.autoLayout) scope.onDispose(core.provide('autoLayout', () => autoLayout(core)));
    if (f.open) {
      scope.onDispose(core.provide('openFiles', (files) => openFiles(core, files)));
      // drag-and-drop onto the canvas: through the `openFiles` action, so a host that provides its own (the studio:
      // its file name, versions and unsaved-changes check) handles the drop; the event is consumed (defaultPrevented)
      // for hosts that listen further up. Muted while the module is suspended and ignored over an old version: History
      // never loads a dropped file.
      const wrap = core.overlayHost;
      const hasFiles = (ev: DragEvent): boolean => !!ev.dataTransfer && Array.from(ev.dataTransfer.types).includes('Files');
      scope.listen(wrap, 'dragover', (ev: DragEvent) => {
        if (ev.defaultPrevented || !hasFiles(ev) || core.mode.peek() !== 'edit' || core.version.peek()) return;
        ev.preventDefault();
        wrap.classList.add('drop-target');
      });
      scope.listen(wrap, 'dragleave', () => wrap.classList.remove('drop-target'));
      scope.listen(wrap, 'drop', (ev: DragEvent) => {
        wrap.classList.remove('drop-target');
        // a drop another handler took (an image placed on the canvas) is not also opened as the document (B4)
        if (ev.defaultPrevented || core.mode.peek() !== 'edit' || core.version.peek()) return;
        const docs = Array.from(ev.dataTransfer?.files ?? []).filter(isDocumentFile);
        if (!docs.length) return;
        ev.preventDefault();
        void core.run('openFiles', docs);
      });
      scope.onDispose(() => wrap.classList.remove('drop-target'));
    }
  },
};
